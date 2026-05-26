import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAIConfigured } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { siteId, question, history } = body as {
    siteId?: string;
    question?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!siteId || !question) {
    return NextResponse.json({ error: 'siteId and question required' }, { status: 400 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ answer: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ answer: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Gather site context in parallel
  const [siteRes, issuesRes, uptimeRes, wpRes] = await Promise.all([
    supabase
      .from('sites')
      .select('name, url, health, status, last_scan')
      .eq('id', siteId)
      .single(),
    supabase
      .from('issues')
      .select('title, severity, status, category')
      .eq('site_id', siteId)
      .eq('status', 'open')
      .limit(10),
    supabase
      .from('uptime_checks')
      .select('status, http_status, response_time_ms')
      .eq('site_id', siteId)
      .order('checked_at', { ascending: false })
      .limit(10),
    supabase
      .from('wordpress_snapshots')
      .select('wp_version, security_data, plugin_data')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const site = siteRes.data;
  const issues = issuesRes.data || [];
  const uptime = uptimeRes.data || [];
  const wp = wpRes.data;

  const contextBlock = `
Site: ${site?.name ?? 'Unknown'} | ${site?.url ?? ''}
Health: ${site?.health ?? 0}/100 | Status: ${site?.status ?? 'unknown'} | Last scan: ${site?.last_scan ?? 'never'}
Open issues: ${issues.length} | ${issues.filter((i) => i.severity === 'critical').length} critical
Recent uptime: ${uptime.filter((c) => c.status === 'up').length}/${uptime.length} checks up
WP version: ${wp?.wp_version ?? 'unknown'}
Top issues: ${issues.slice(0, 3).map((i) => `[${i.severity}] ${i.title}`).join(' | ') || 'none'}
`.trim();

  const systemPrompt = `You are Horus, an AI assistant inside Eye of Horus — a website monitoring platform for a digital agency.
You have real-time data about this client website. Answer questions about performance, issues, SEO, WordPress, security, and what the team should do next.
Be direct, specific, and actionable. If asked something outside your data, say so briefly.

SITE CONTEXT:
${contextBlock}`;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(history || []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const message = await client.messages
    .create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    })
    .catch(() => null);

  const textBlock = message?.content.find((b) => b.type === 'text');
  const answer = textBlock ? (textBlock as { type: 'text'; text: string }).text : null;

  if (answer) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'chat',
      question,
      answer,
      model: 'claude-haiku-4-5-20251001',
      tokens_used: (message?.usage.input_tokens ?? 0) + (message?.usage.output_tokens ?? 0),
    });
  }

  return NextResponse.json({ answer });
}
