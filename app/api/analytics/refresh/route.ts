import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchGAMetrics } from '@/lib/analytics/google-analytics';
import { fetchGSCMetrics } from '@/lib/analytics/search-console';
import { fetchClarityMetrics } from '@/lib/analytics/clarity';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const { siteId } = body as { siteId?: string };

  if (!siteId) {
    return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch site integration config
  const { data: integration } = await supabase
    .from('site_integrations')
    .select('*')
    .eq('site_id', siteId)
    .single();

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  const results: { ga: boolean; gsc: boolean; clarity: boolean } = {
    ga: false, gsc: false, clarity: false,
  };

  // GA4
  if (integration?.ga_property_id) {
    const metrics = await fetchGAMetrics(integration.ga_property_id, startDate, endDate);
    if (metrics) {
      await supabase.from('analytics_snapshots').insert({
        site_id: siteId,
        period_start: startDate,
        period_end: endDate,
        metrics,
      });
      results.ga = true;
    }
  }

  // GSC
  if (integration?.gsc_site_url) {
    const gscData = await fetchGSCMetrics(integration.gsc_site_url, startDate, endDate);
    if (gscData) {
      await supabase.from('search_console_snapshots').insert({
        site_id: siteId,
        period_start: startDate,
        period_end: endDate,
        queries: gscData.topQueries,
        pages: gscData.topPages,
        metrics: {
          clicks: gscData.clicks,
          impressions: gscData.impressions,
          ctr: gscData.ctr,
          position: gscData.position,
          strikingDistance: gscData.strikingDistance,
          previousPeriod: gscData.previousPeriod,
          fetchedAt: gscData.fetchedAt,
        },
      });
      results.gsc = true;
    }
  }

  // Clarity
  if (integration?.clarity_project_id && integration?.clarity_api_key) {
    const clarityData = await fetchClarityMetrics(integration.clarity_project_id, integration.clarity_api_key);
    if (clarityData) {
      await supabase.from('clarity_snapshots').insert({
        site_id: siteId,
        period_start: startDate,
        period_end: endDate,
        metrics: clarityData,
        insights: [],
      });
      results.clarity = true;
    }
  }

  return NextResponse.json({ ok: true, results, refreshedAt: new Date().toISOString() });
}
