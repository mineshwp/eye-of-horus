import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// WordPress plugin sends site data here via POST
// Authenticated with X-EOH-KEY header (site-specific API key)
export async function POST(request: NextRequest) {
  try {
    const apiKey =
      request.headers.get("X-EOH-KEY") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const supabase = getServerClient();

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, name")
      .eq("api_key", apiKey)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const snapshot = {
      site_id: site.id,
      wp_version: (payload.wp_version as string) || null,
      php_version: (payload.php_version as string) || null,
      mysql_version: (payload.mysql_version as string) || null,
      theme_data: (payload.theme_data as object) || null,
      plugin_data: (payload.plugin_data as object) || null,
      update_data: (payload.update_data as object) || null,
      security_data: (payload.security_data as object) || null,
      form_data: (payload.form_data as object) || null,
      server_data: (payload.server_data as object) || null,
      raw_payload: payload,
    };

    const { error: insertError } = await supabase
      .from("wordpress_snapshots")
      .insert([snapshot]);

    if (insertError) {
      console.error("wordpress_snapshots insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to store snapshot", detail: insertError.message, code: insertError.code },
        { status: 500 }
      );
    }

    // Update site last_scan timestamp
    await supabase
      .from("sites")
      .update({ last_scan: new Date().toISOString() })
      .eq("id", site.id);

    return NextResponse.json({
      ok: true,
      message: "Snapshot stored",
      site: site.name,
      received_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("WordPress route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Eye of Horus WordPress endpoint",
    version: "2.0.0",
    status: "ready",
  });
}
