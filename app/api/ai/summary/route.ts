import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { siteId } = body as { siteId?: string };

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  if (!isAIConfigured()) {
    return NextResponse.json({ summary: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ summary: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch site context in parallel
  const [siteRes, issuesRes, uptimeRes] = await Promise.all([
    supabase.from('sites').select('name, url, health, status').eq('id', siteId).single(),
    supabase
      .from('issues')
      .select('title, severity, category, status')
      .eq('site_id', siteId)
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(5),
    supabase
      .from('uptime_checks')
      .select('status')
      .eq('site_id', siteId)
      .order('checked_at', { ascending: false })
      .limit(20),
  ]);

  const site = siteRes.data;
  const issues = issuesRes.data || [];
  const uptimeChecks = uptimeRes.data || [];
  const uptimePct =
    uptimeChecks.length > 0
      ? Math.round(
          (uptimeChecks.filter((c) => c.status === 'up').length / uptimeChecks.length) * 10000,
        ) / 100
      : 100;

  const prompt = `Site: ${site?.name ?? 'Unknown'} (${site?.url ?? ''})
Health score: ${site?.health ?? 0}/100
Uptime (recent): ${uptimePct}%
Open issues: ${issues.length}
Critical/high issues: ${issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length}
Top issues:
${issues.slice(0, 3).map((i) => `- [${i.severity}] ${i.title}`).join('\n') || '- None'}

Write 2-3 sentences: what is the most important thing the agency team should know or act on for this site right now?`;

  const result = await ai(prompt, { model: 'fast', maxTokens: 256 });

  if (result?.text) {
    // Store in ai_messages for history / audit trail
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'summary',
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { health: site?.health, openIssues: issues.length },
    });
  }

  return NextResponse.json({ summary: result?.text ?? null });
}
