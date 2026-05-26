import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ integration: null });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('site_integrations')
    .select('*')
    .eq('site_id', siteId)
    .single();
  return NextResponse.json({ integration: data ?? null });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { siteId, gaPropertyId, gscSiteUrl, clarityProjectId, clarityApiKey } = body || {};

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase.from('site_integrations').upsert(
    {
      site_id: siteId,
      ga_property_id: gaPropertyId || null,
      gsc_site_url: gscSiteUrl || null,
      clarity_project_id: clarityProjectId || null,
      clarity_api_key: clarityApiKey || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
