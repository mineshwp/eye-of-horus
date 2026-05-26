import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId');
  const clientId = request.nextUrl.searchParams.get('clientId');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ reports: [] });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('reports')
    .select('id, site_id, client_id, report_type, period_start, period_end, status, title, executive_summary, share_token, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (siteId) query = query.eq('site_id', siteId);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ reports: [], error: error.message });
  }

  return NextResponse.json({ reports: data || [] });
}
