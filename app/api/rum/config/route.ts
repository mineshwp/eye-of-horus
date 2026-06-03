import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Public config endpoint — the client script calls this to learn whether RUM is
// enabled for the site and which consent mode to use. No secrets are returned.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const trackingId = request.nextUrl.searchParams.get("t");
  const respond = (enabled: boolean, consentMode = "on", respectDnt = true) =>
    NextResponse.json({ enabled, consentMode, respectDnt }, { headers: CORS });

  if (!trackingId) return respond(false);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Fail closed: if the backend isn't configured we can't verify the site's
  // consent settings, so default to collection disabled.
  if (!url || !key) return respond(false);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: site } = await supabase
    .from("sites")
    .select("rum_enabled, rum_consent_mode, rum_respect_dnt")
    .eq("tracking_id", trackingId)
    .maybeSingle();

  if (!site) return respond(false);
  return respond(
    site.rum_enabled !== false,
    (site.rum_consent_mode as string) || "on",
    site.rum_respect_dnt !== false,
  );
}
