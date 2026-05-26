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
    return NextResponse.json({ strategy: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ strategy: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const [siteRes, gaRes, gscRes, issuesRes] = await Promise.all([
    supabase.from('sites').select('name, url, health').eq('id', siteId).single(),
    supabase
      .from('analytics_snapshots')
      .select('metrics')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('search_console_snapshots')
      .select('metrics, queries')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('issues')
      .select('title, severity, category')
      .eq('site_id', siteId)
      .eq('status', 'open')
      .in('severity', ['critical', 'high'])
      .limit(5),
  ]);

  const site = siteRes.data;
  const ga = gaRes.data?.metrics as Record<string, unknown> | null;
  const gsc = gscRes.data;
  const issues = issuesRes.data || [];

  const gaSection = ga
    ? `GA4 (last period):
- Sessions: ${ga.sessions ?? 'n/a'} | Users: ${ga.users ?? 'n/a'} | New users: ${ga.newUsers ?? 'n/a'}
- Engagement rate: ${ga.engagementRate ?? 'n/a'}% | Avg session: ${ga.avgEngagementTimeSec ?? 'n/a'}s
- Pageviews: ${ga.pageviews ?? 'n/a'}
- Top channels: ${JSON.stringify((ga.channels as Array<{ name: string; sessions: number }> | null)?.slice(0, 3) ?? [])}`
    : 'GA4: not connected';

  const gscMetrics = gsc?.metrics as Record<string, unknown> | null;
  const gscQueries = gsc?.queries as Array<{ query: string; clicks: number; impressions: number; position: number }> | null;
  const strikingDistance = (gscQueries ?? [])
    .filter((q) => q.position >= 11 && q.position <= 20)
    .slice(0, 5);

  const gscSection = gscMetrics
    ? `Google Search Console:
- Clicks: ${gscMetrics.clicks ?? 'n/a'} | Impressions: ${gscMetrics.impressions ?? 'n/a'}
- Avg position: ${typeof gscMetrics.position === 'number' ? gscMetrics.position.toFixed(1) : 'n/a'}
- CTR: ${gscMetrics.ctr ?? 'n/a'}%
- Striking-distance keywords (pos 11-20): ${strikingDistance.map((q) => `"${q.query}" (pos ${q.position.toFixed(0)})`).join(', ') || 'none'}`
    : 'Search Console: not connected';

  const issuesSection =
    issues.length > 0
      ? `Open priority issues: ${issues.map((i) => `[${i.severity}] ${i.title}`).join('; ')}`
      : 'No critical/high issues open';

  const prompt = `Client website: ${site?.name ?? 'Unknown'} (${site?.url ?? ''})
Health score: ${site?.health ?? 0}/100

${gaSection}

${gscSection}

${issuesSection}

Based on this real data, generate a focused 3-section marketing strategy for the agency to share with the client:

1. **Quick wins** (1-2 actions this week based on the data)
2. **Growth opportunities** (SEO, content, or channel mix based on real traffic patterns)
3. **Risks to address** (what the data shows needs fixing before scaling)

Be specific to this website's actual numbers. Do not use generic advice. Keep each section to 2-3 sentences.`;

  const result = await ai(prompt, {
    model: 'strategic',
    maxTokens: 600,
    system:
      'You are Horus, a senior digital marketing strategist. Use only the data provided — never invent numbers. Be direct, specific, and actionable. Write for an agency team presenting to a client.',
  });

  if (result?.text) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'chat',
      question: 'Marketing strategy',
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { type: 'marketing_strategy' },
    });
  }

  return NextResponse.json({ strategy: result?.text ?? null });
}
