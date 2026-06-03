import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";
export const maxDuration = 60;

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  let body: { siteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { siteId } = body;
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const supabase = getServerClient();

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, name, url, api_key")
    .eq("id", siteId)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (!site.api_key) {
    return NextResponse.json({ error: "Site has no WordPress plugin API key configured" }, { status: 400 });
  }

  const siteUrl = site.url.replace(/\/$/, "");
  const wpEndpoint = `${siteUrl}/wp-json/eye-of-horus/v1/sync`;

  let wpResponse: Response;
  try {
    wpResponse = await fetch(wpEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EOH-KEY": site.api_key as string,
      },
      signal: AbortSignal.timeout(55000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach WordPress site: ${String(err)}` },
      { status: 502 },
    );
  }

  if (!wpResponse.ok) {
    const errorText = await wpResponse.text().catch(() => "");
    let errorDetail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorDetail = parsed.message || parsed.error || errorText;
    } catch { /* ignore */ }
    return NextResponse.json(
      { error: `WordPress returned HTTP ${wpResponse.status}`, detail: errorDetail },
      { status: 502 },
    );
  }

  const wpResult = await wpResponse.json().catch(() => ({}));

  return NextResponse.json({
    ok: true,
    message: "WordPress plugin sync triggered successfully",
    detail: wpResult,
  });
}
