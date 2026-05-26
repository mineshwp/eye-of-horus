import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const { siteId } = body as { siteId?: string };

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  if (!isAIConfigured()) {
    return NextResponse.json({ ideas: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ideas: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const [siteRes, gscRes, gaRes] = await Promise.all([
    supabase.from('sites').select('name, url').eq('id', siteId).single(),
    supabase
      .from('search_console_snapshots')
      .select('queries, pages')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('analytics_snapshots')
      .select('metrics')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const site = siteRes.data;
  const gscQueries = gscRes.data?.queries as Array<{
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }> | null;
  const ga = gaRes.data?.metrics as Record<string, unknown> | null;

  const strikingDistance = (gscQueries ?? [])
    .filter((q) => q.position >= 11 && q.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);

  const topQueries = (gscQueries ?? [])
    .filter((q) => q.position <= 10)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  const topPages = (
    (ga?.topPages as Array<{ path: string; sessions: number }> | null) ?? []
  ).slice(0, 5);

  const keywordContext =
    strikingDistance.length > 0
      ? `Striking-distance keywords (pos 11-20, high potential):
${strikingDistance.map((q) => `- "${q.query}" | pos ${q.position.toFixed(0)} | ${q.impressions} impressions`).join('\n')}`
      : 'No striking-distance keywords found (GSC not connected or no data).';

  const topContext =
    topQueries.length > 0
      ? `Top performing queries (pos 1-10):
${topQueries.map((q) => `- "${q.query}" | ${q.clicks} clicks`).join('\n')}`
      : '';

  const pagesContext =
    topPages.length > 0
      ? `Top pages by traffic:
${topPages.map((p) => `- ${p.path} (${p.sessions} sessions)`).join('\n')}`
      : '';

  const prompt = `Website: ${site?.name ?? 'Unknown'} (${site?.url ?? ''})

${keywordContext}

${topContext}

${pagesContext}

Generate 4 specific blog/content ideas for this website based on the keyword and traffic data above.

For each idea, provide:
- **Title**: A compelling, SEO-relevant blog post title
- **Target keyword**: The primary keyword to target
- **Why**: 1 sentence on why this topic will drive traffic or conversions
- **Key angle**: 1 sentence on what makes this piece valuable vs. generic content

Format clearly with numbered ideas. Be specific to this website's industry and real keywords.`;

  const result = await ai(prompt, {
    model: 'strategic',
    maxTokens: 700,
    system:
      'You are Horus, an SEO and content strategist for a digital agency. Generate blog ideas based strictly on provided keyword and traffic data. Never invent keywords. Be specific and commercially focused.',
  });

  if (result?.text) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'chat',
      question: 'Blog ideas',
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { type: 'blog_ideas', keywordCount: strikingDistance.length },
    });
  }

  return NextResponse.json({ ideas: result?.text ?? null });
}
