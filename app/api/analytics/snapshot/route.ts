import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ga: null, gsc: null, clarity: null, integration: null });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const [gaRes, gscRes, clarityRes, intRes] = await Promise.all([
    supabase
      .from('analytics_snapshots')
      .select('metrics, period_start, period_end, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('search_console_snapshots')
      .select('queries, pages, metrics, period_start, period_end, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('clarity_snapshots')
      .select('metrics, insights, period_start, period_end, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('site_integrations')
      .select('ga_property_id, gsc_site_url, clarity_project_id')
      .eq('site_id', siteId)
      .single(),
  ]);

  return NextResponse.json({
    ga: gaRes.data ?? null,
    gsc: gscRes.data ?? null,
    clarity: clarityRes.data ?? null,
    integration: intRes.data ?? null,
  });
}
