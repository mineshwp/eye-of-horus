import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { siteId, competitorUrl } = body as { siteId?: string; competitorUrl?: string };

  if (!siteId || !competitorUrl) {
    return NextResponse.json({ error: 'siteId and competitorUrl required' }, { status: 400 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ analysis: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ analysis: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch site information
  const { data: site } = await supabase
    .from('sites')
    .select('name, url, health')
    .eq('id', siteId)
    .single();

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }

  const prompt = `Client Website: ${site.name} (${site.url})
Competitor Website: ${competitorUrl}

Generate a comprehensive competitor research and analysis briefing.
Compare the two sites on:
1. Brand messaging and target audience positioning
2. Estimated search engine visibility and keyword focus
3. UX layout and conversion hooks (CTA strengths)
4. Key opportunities for the client to capture market share from this competitor.

Be highly strategic, specific, and direct. Skip generic advice. Write for an agency senior strategist. Keep it under 250 words total.`;

  const result = await ai(prompt, {
    model: 'strategic',
    maxTokens: 512,
    system: 'You are Horus, a senior digital strategist and SEO consultant for an advertising agency. Provide direct, tactical competitor analyses.',
  });

  if (result?.text) {
    // Save to ai_messages using 'chat' message_type to satisfy DB check constraint
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'chat',
      question: `Competitor Analysis: ${competitorUrl}`,
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { competitorUrl, type: 'competitor_analysis' },
    });
  }

  return NextResponse.json({ analysis: result?.text ?? null });
}
