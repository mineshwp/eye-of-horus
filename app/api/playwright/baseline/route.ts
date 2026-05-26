import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { siteId, device, screenshotUrl } = body || {};

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

  // Copy screenshot to baseline slot on filesystem
  const publicDir = path.join(process.cwd(), 'public');
  const srcPath = path.join(publicDir, screenshotUrl);
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
