import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ logs: [] });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  let query = supabase
    .from('notification_logs')
    .select('id, site_id, channel, recipient, status, alert_type, subject, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (siteId) query = query.eq('site_id', siteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ logs: [], error: error.message });

  return NextResponse.json({ logs: data ?? [] });
}
