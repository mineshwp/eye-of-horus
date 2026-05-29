import * as fs from 'fs';
import { SupabaseClient } from '@supabase/supabase-js';

// Single private bucket for all Watchtower artifacts (see CLAUDE.md).
export const BUCKET = 'watchtower-artifacts';

function yyyymm(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Build a storage key under /client-id/yyyy-mm/<kind>/<file>. */
export function artifactKey(siteId: string, kind: string, file: string): string {
  return `${siteId}/${yyyymm()}/${kind}/${file}`;
}

/** Stable key for the current baseline of a page+device (not date-namespaced). */
export function baselineKey(siteId: string, pageSlug: string, device: string): string {
  return `${siteId}/baselines/${pageSlug}/${device}.png`;
}

// Signed URL TTL written into playwright_checks. ~1 year is enough for the visual
// history UI; baselines are re-signed each scan, and stale rows can be re-signed
// on demand via /api/playwright/checks if we ever extend this beyond a year.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

/** Upload a local PNG to the private watchtower-artifacts bucket and return a signed URL. */
export async function uploadArtifact(
  supabase: SupabaseClient,
  localPath: string,
  remoteKey: string,
): Promise<string | null> {
  try {
    if (!fs.existsSync(localPath)) return null;
    const body = fs.readFileSync(localPath);
    const { error } = await supabase.storage.from(BUCKET).upload(remoteKey, body, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) {
      console.error(`[storage] upload failed for ${remoteKey}:`, error.message);
      return null;
    }
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(remoteKey, SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      console.error(`[storage] signed URL failed for ${remoteKey}:`, signErr.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error('[storage] upload exception:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Re-sign an existing storage key (used by API readers when an old URL has expired). */
export async function signKey(
  supabase: SupabaseClient,
  remoteKey: string,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(remoteKey, ttlSeconds);
  if (error) {
    console.error(`[storage] signKey failed for ${remoteKey}:`, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Download a stored object to a local path. Returns true if it existed and was written. */
export async function downloadArtifact(
  supabase: SupabaseClient,
  remoteKey: string,
  localPath: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(remoteKey);
    if (error || !data) return false;
    const buf = Buffer.from(await data.arrayBuffer());
    fs.mkdirSync(localPath.replace(/\/[^/]+$/, ''), { recursive: true });
    fs.writeFileSync(localPath, buf);
    return true;
  } catch {
    return false;
  }
}
