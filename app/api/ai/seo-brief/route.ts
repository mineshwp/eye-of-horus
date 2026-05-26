import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { siteId, keyword, position, impressions } = body as {
    siteId?: string;
    keyword?: string;
    position?: number;
    impressions?: number;
  };

  if (!keyword || !siteId) {
    return NextResponse.json({ error: 'siteId and keyword required' }, { status: 400 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ brief: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ brief: null });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: site } = await supabase.from('sites').select('name, url').eq('id', siteId).single();

  const prompt = `Keyword: "${keyword}"
Current position: ${position ?? '~15'} (page 2 — striking distance)
Monthly impressions: ${impressions ?? 'unknown'}
Website: ${site?.url ?? ''}

This keyword is in striking distance — it ranks on page 2 and could move to page 1 with targeted improvements.

Generate a concise 3-point content optimisation brief:
1. On-page changes (title, H1, meta description, content depth)
2. Content additions (sections, FAQs, schema)
3. Internal linking opportunities

Be specific and actionable. Keep each point to 1-2 sentences.`;

  const result = await ai(prompt, {
    model: 'fast',
    maxTokens: 400,
    system: `You are an SEO strategist for a web agency. Generate specific, actionable content briefs. Avoid generic advice. Tailor recommendations to the keyword's intent.`,
  });

  if (result?.text) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'seo_brief',
      question: keyword,
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { keyword, position, impressions },
    });
  }

  return NextResponse.json({ brief: result?.text ?? null });
}
