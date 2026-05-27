import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';

const MASKED_KEYS = ['openai_api_key', 'email_api_key', 'twilio_account_sid', 'twilio_auth_token'];

function maskValue(key: string, value: string | null): string | null {
  if (!value) return null;
  if (MASKED_KEYS.includes(key)) return `${value.slice(0, 4)}${'•'.repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
  return value;
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ settings: {} });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from('global_settings').select('key, value');

  const settings: Record<string, string | null> = {};
  for (const row of data ?? []) {
    settings[row.key] = maskValue(row.key, row.value);
  }

  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const allowed = ['openai_api_key', 'email_provider', 'email_api_key', 'email_from_address', 'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from', 'analytics_sync_time'];
  const upserts = Object.entries(body)
    .filter(([k]) => allowed.includes(k))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' && value.trim() !== '' ? value.trim() : null,
      updated_at: new Date().toISOString(),
    }));

  if (upserts.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const { error } = await supabase.from('global_settings').upsert(upserts, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: upserts.length });
}
