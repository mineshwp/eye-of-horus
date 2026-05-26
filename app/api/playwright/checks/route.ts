import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId');
  const device = request.nextUrl.searchParams.get('device');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '30', 10);

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('playwright_checks')
    .select('*')
    .eq('site_id', siteId)
    .order('checked_at', { ascending: false })
    .limit(limit);

  if (device) {
    query = query.eq('device', device);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch latest baselines for this site
  const { data: baselines } = await supabase
    .from('playwright_baselines')
    .select('*')
    .eq('site_id', siteId);

  return NextResponse.json({ checks: data || [], baselines: baselines || [] });
}
