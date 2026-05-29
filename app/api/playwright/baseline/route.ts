import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';

const BUCKET = 'watchtower-artifacts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * Extract the storage key from a Supabase signed-URL of the form
 *   https://<ref>.supabase.co/storage/v1/object/sign/<bucket>/<key>?token=...
 * Returns null if the URL is not a recognisable signed URL into our bucket.
 */
function extractKey(signedUrl: string): string | null {
  try {
    const u = new URL(signedUrl);
    const marker = `/storage/v1/object/sign/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

function pagePathSlug(pagePath: string): string {
  const slug = pagePath
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return slug || 'home';
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const { siteId, device, screenshotUrl, pagePath } = body || {};

  if (!siteId || !device || !screenshotUrl) {
    return NextResponse.json(
      { error: 'siteId, device, screenshotUrl are required' },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const srcKey = extractKey(screenshotUrl);
  if (!srcKey || !srcKey.startsWith(`${siteId}/`)) {
    return NextResponse.json(
      { error: 'screenshotUrl does not point at this site in watchtower-artifacts' },
      { status: 400 },
    );
  }

  const slug = pagePathSlug(pagePath ?? '/');
  const baselineKey = `${siteId}/baselines/${slug}/${device}.png`;

  // Copy in-storage from the approved screenshot to the baseline slot.
  const { error: copyErr } = await supabase.storage.from(BUCKET).copy(srcKey, baselineKey);
  if (copyErr) {
    // Supabase copy fails if the destination already exists — fall back to download/upload.
    const { data: dl, error: dlErr } = await supabase.storage.from(BUCKET).download(srcKey);
    if (dlErr || !dl) {
      return NextResponse.json(
        { error: 'Could not read source screenshot', detail: dlErr?.message ?? copyErr.message },
        { status: 500 },
      );
    }
    const bytes = Buffer.from(await dl.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(baselineKey, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) {
      return NextResponse.json({ error: 'Baseline upload failed', detail: upErr.message }, { status: 500 });
    }
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(baselineKey, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    return NextResponse.json({ error: 'Could not sign baseline URL', detail: signErr?.message }, { status: 500 });
  }

  // Record the approval (one row per site+device — pagePath is encoded in screenshot_url).
  const { error: upsertErr } = await supabase.from('playwright_baselines').upsert(
    {
      site_id: siteId,
      device,
      screenshot_url: signed.signedUrl,
      approved_at: new Date().toISOString(),
    },
    { onConflict: 'site_id,device' },
  );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, baselineUrl: signed.signedUrl, baselineKey });
}
