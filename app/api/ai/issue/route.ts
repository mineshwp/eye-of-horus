import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { issueId, siteId } = body as { issueId?: string; siteId?: string };

  if (!issueId) return NextResponse.json({ error: 'issueId required' }, { status: 400 });

  if (!isAIConfigured()) {
    return NextResponse.json({ analysis: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ analysis: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: issue } = await supabase
    .from('issues')
    .select('title, severity, category, description, recommended_action')
    .eq('id', issueId)
    .single();

  if (!issue) return NextResponse.json({ analysis: null, reason: 'Issue not found' }, { status: 404 });

  const { data: site } = await supabase
    .from('sites')
    .select('name, url')
    .eq('id', siteId ?? '')
    .single();

  const prompt = `Issue: ${issue.title}
Site: ${site?.name ?? 'unknown'} (${site?.url ?? ''})
Severity: ${issue.severity}
Category: ${issue.category}
Description: ${issue.description ?? 'Not provided'}
Recommended action: ${issue.recommended_action ?? 'Not provided'}

Explain this issue clearly: what is it, why does it matter for this website's business, how urgent is it, and what should the team do first? 3-4 sentences max.`;

  const result = await ai(prompt, {
    model: 'fast',
    maxTokens: 320,
    system: `You are Horus, a senior technical strategist for a web agency. Explain website issues to agency team members who need to act quickly. Be specific, direct, and skip generic advice.`,
  });

  if (result?.text && siteId) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'issue_analysis',
      question: issue.title,
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { issueId, severity: issue.severity, category: issue.category },
    });
  }

  return NextResponse.json({ analysis: result?.text ?? null });
}
