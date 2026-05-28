import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';
import { DEFAULT_CLARITY_ENDPOINT_URL } from '@/lib/analytics/clarity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ integration: null });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('site_integrations')
    .select('ga_property_id, gsc_site_url, clarity_project_id, clarity_endpoint_url, updated_at')
    .eq('site_id', siteId)
    .single();
  return NextResponse.json({ integration: data ?? null });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const { siteId, gaPropertyId, gscSiteUrl, clarityProjectId, clarityApiKey, clarityEndpointUrl } = body || {};

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const endpoint = clarityEndpointUrl || DEFAULT_CLARITY_ENDPOINT_URL;
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Clarity endpoint URL must be HTTP or HTTPS' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid Clarity endpoint URL' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('site_integrations')
    .select('clarity_api_key')
    .eq('site_id', siteId)
    .single();

  const { error } = await supabase.from('site_integrations').upsert(
    {
      site_id: siteId,
      ga_property_id: gaPropertyId || null,
      gsc_site_url: gscSiteUrl || null,
      clarity_project_id: clarityProjectId || null,
      clarity_api_key: clarityApiKey || existing?.clarity_api_key || null,
      clarity_endpoint_url: endpoint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
