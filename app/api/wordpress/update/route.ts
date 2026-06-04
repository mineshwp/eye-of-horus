import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PluginData {
  file?: string;
  name?: string;
  version?: string;
  new_version?: string | null;
  update_available?: boolean;
}

interface ThemeData {
  name?: string;
  stylesheet?: string;
  version?: string;
  new_version?: string | null;
  update_available?: boolean;
}

type UpdateKind = "core" | "theme" | "plugin";

function classifyTarget(target: string): UpdateKind {
  if (target === "WordPress Core") return "core";
  if (/\bTheme$/.test(target)) return "theme";
  return "plugin";
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  let body: { siteId?: string; pluginName?: string; target?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { siteId } = body;
  // `target` is the wp_updates display name; `pluginName` is the legacy field.
  const target = body.target ?? body.pluginName;
  if (!siteId || !target) {
    return NextResponse.json({ error: "siteId and target are required" }, { status: 400 });
  }
  const kind = classifyTarget(target);

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

  const { data: snapshot } = await supabase
    .from("wordpress_snapshots")
    .select("plugin_data, theme_data")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Resolve the correct WP plugin endpoint + payload for the target kind.
  const siteUrl = site.url.replace(/\/$/, "");
  let wpEndpoint: string;
  let wpBody: Record<string, unknown>;

  if (kind === "core") {
    wpEndpoint = `${siteUrl}/wp-json/eye-of-horus/v1/update-core`;
    wpBody = {};
  } else if (kind === "theme") {
    const themes: ThemeData[] = Array.isArray(snapshot?.theme_data)
      ? (snapshot!.theme_data as ThemeData[])
      : snapshot?.theme_data ? [snapshot.theme_data as ThemeData] : [];
    // wp_updates target for themes is "<Name> Theme" — match on the name.
    const themeName = target.replace(/\s+Theme$/, "");
    const match = themes.find((t) => t.name === themeName || `${t.name} Theme` === target);
    const stylesheet = match?.stylesheet;
    if (!stylesheet) {
      return NextResponse.json(
        { error: `Could not locate the theme stylesheet for "${target}". Re-sync the site (plugin v2.5.0+) and try again.` },
        { status: 400 },
      );
    }
    wpEndpoint = `${siteUrl}/wp-json/eye-of-horus/v1/update-theme`;
    wpBody = { stylesheet };
  } else {
    let pluginFile: string | null = null;
    if (snapshot?.plugin_data) {
      const plugins: PluginData[] = Array.isArray(snapshot.plugin_data) ? snapshot.plugin_data : [];
      const match = plugins.find((p) => p.name === target || p.file?.split("/").pop()?.replace(".php", "") === target);
      if (match?.file) pluginFile = match.file;
    }
    if (!pluginFile) {
      return NextResponse.json(
        { error: `Could not locate plugin file for "${target}". The WordPress plugin may not have synced recently.` },
        { status: 400 },
      );
    }
    wpEndpoint = `${siteUrl}/wp-json/eye-of-horus/v1/update-plugin`;
    wpBody = { plugin_file: pluginFile };
  }

  let wpResponse: Response;
  try {
    wpResponse = await fetch(wpEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EOH-KEY": site.api_key as string,
      },
      body: JSON.stringify(wpBody),
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

  await supabase
    .from("wp_updates")
    .delete()
    .eq("site_id", siteId)
    .eq("target", target);

  await supabase
    .from("issues")
    .update({ status: "Resolved" })
    .eq("site_id", siteId)
    .eq("category", "WordPress update")
    .eq("title", `${target} update available`)
    .in("status", ["New", "Investigating", "In Progress"]);

  const { count } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .in("status", ["New", "Investigating", "In Progress"]);

  await supabase
    .from("sites")
    .update({ open_issues: count ?? 0 })
    .eq("id", siteId);

  await supabase.from("activities").insert([{
    time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
    site_name: site.name,
    text: `${target} updated successfully`,
    sev: "low",
    type: "wp",
  }]);

  return NextResponse.json({
    ok: true,
    message: `${target} updated successfully`,
    kind,
    detail: wpResult,
  });
}
