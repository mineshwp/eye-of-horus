import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const { siteId, device, screenshotUrl } = body || {};

  if (!siteId || !device || !screenshotUrl) {
    return NextResponse.json(
      { error: 'siteId, device, screenshotUrl are required' },
      { status: 400 },
    );
  }

  // Validate screenshotUrl is within the expected playwright-data directory
  const publicDir = path.join(process.cwd(), 'public');
  const resolvedSrc = path.resolve(publicDir, screenshotUrl.replace(/^\//, ''));
  const allowedDir = path.join(publicDir, 'playwright-data');
  if (!resolvedSrc.startsWith(allowedDir + path.sep) && resolvedSrc !== allowedDir) {
    return NextResponse.json({ error: 'Invalid screenshotUrl' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Copy screenshot to baseline slot — destination is fully controlled (no user input)
  const srcPath = resolvedSrc;
  const baselinePath = path.join(publicDir, 'playwright-data', siteId, device, 'baseline.png');
  const baselineUrl = `/playwright-data/${siteId}/${device}/baseline.png`;

  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(srcPath, baselinePath);
  }

  // Upsert baseline record
  const { error } = await supabase.from('playwright_baselines').upsert(
    {
      site_id: siteId,
      device,
      screenshot_url: baselineUrl,
      approved_at: new Date().toISOString(),
    },
    { onConflict: 'site_id,device' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, baselineUrl });
}
