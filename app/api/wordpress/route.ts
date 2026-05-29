import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

interface PluginPayload {
  file?: string;
  name?: string;
  version?: string;
  new_version?: string | null;
  update_available?: boolean;
}

interface ThemePayload {
  name?: string;
  version?: string;
  new_version?: string | null;
  update_available?: boolean;
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function nowLabel(): string {
  return new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function updateId(siteId: string, target: string): string {
  const slug = target.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
  return `wp-${siteId}-${slug || randomUUID().slice(0, 8)}`;
}

function updateRisk(target: string): "low" | "medium" | "high" {
  const lower = target.toLowerCase();
  if (lower.includes("security") || lower.includes("wordfence") || lower.includes("woocommerce") || lower.includes("payment")) return "high";
  if (lower.includes("seo") || lower.includes("form") || lower.includes("smtp") || lower.includes("cache")) return "medium";
  return "low";
}

export async function syncWordPressFindings(
  supabase: ReturnType<typeof getServerClient>,
  site: { id: string; name: string },
  payload: Record<string, unknown>,
) {
  const plugins = Array.isArray(payload.plugin_data) ? payload.plugin_data as PluginPayload[] : [];
  const themes = Array.isArray(payload.theme_data)
    ? payload.theme_data as ThemePayload[]
    : payload.theme_data ? [payload.theme_data as ThemePayload] : [];
  const updateData = payload.update_data as { core_update?: boolean; core_version?: string | null; plugin_updates?: number; theme_updates?: number } | null;
  const wpVersion = typeof payload.wp_version === "string" ? payload.wp_version : "unknown";

  const updates = [
    ...(updateData?.core_update ? [{
      target: "WordPress Core",
      from: wpVersion,
      to: updateData.core_version || "latest",
      risk: "medium" as const,
      priority: "high",
      notes: "Core update available. Apply on staging first, then production.",
      flag: "Needs staging test",
    }] : []),
    ...plugins
      .filter((plugin) => plugin.update_available)
      .map((plugin) => {
        const target = plugin.name || plugin.file || "WordPress plugin";
        const risk = updateRisk(target);
        return {
          target,
          from: plugin.version || "unknown",
          to: plugin.new_version || "latest",
          risk,
          priority: risk === "high" ? "high" : "medium",
          notes: `${target} update available. Test compatibility before production update.`,
          flag: risk === "high" ? "Needs staging test" : "Safe update",
        };
      }),
    ...themes
      .filter((theme) => theme.update_available)
      .map((theme) => ({
        target: `${theme.name || "Theme"} Theme`,
        from: theme.version || "unknown",
        to: theme.new_version || "latest",
        risk: "medium" as const,
        priority: "medium",
        notes: "Theme update available. Check visual regressions after update.",
        flag: "Needs staging test",
      })),
  ];

  const { error: deleteErr } = await supabase.from("wp_updates").delete().eq("site_id", site.id);
  if (deleteErr) console.error("[EOH] wp_updates delete error:", deleteErr);

  if (updates.length > 0) {
    const { error: insertErr } = await supabase.from("wp_updates").insert(updates.map((update) => ({
      id: updateId(site.id, update.target),
      site_id: site.id,
      target: update.target,
      "from": update.from,
      "to": update.to,
      risk: update.risk,
      priority: update.priority,
      notes: update.notes,
      flag: update.flag,
    })));
    if (insertErr) {
      console.error("[EOH] wp_updates insert error:", insertErr);
      throw new Error(`wp_updates insert failed: ${insertErr.message}`);
    }
  }

  const { data: existingIssues } = await supabase
    .from("issues")
    .select("id, title")
    .eq("site_id", site.id)
    .eq("category", "WordPress update")
    .in("status", ["New", "Investigating", "In Progress"]);

  const existingTitles = new Set((existingIssues ?? []).map((issue) => issue.title));
  const issueRows = updates
    .filter((update) => !existingTitles.has(`${update.target} update available`))
    .map((update) => ({
      id: `wp-${randomUUID().slice(0, 8)}`,
      site_id: site.id,
      title: `${update.target} update available`,
      severity: update.risk === "high" ? "high" : "medium",
      impact: `${update.target} is running ${update.from}; latest available is ${update.to}.`,
      category: "WordPress update",
      page: "wp-admin/plugins.php",
      recommended: update.notes,
      owner: "Unassigned",
      status: "New",
      detected: nowLabel(),
      change_type: "WordPress plugin sync",
      confidence: 95,
      evidence: { from: update.from, to: update.to, flag: update.flag },
    }));

  if (issueRows.length > 0) {
    await supabase.from("issues").insert(issueRows);
  }

  if (updates.length > 0) {
    await supabase.from("activities").insert([{
      time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
      site_name: site.name,
      text: `${updates.length} WordPress update${updates.length === 1 ? "" : "s"} pending`,
      sev: updates.some((update) => update.risk === "high") ? "high" : "med",
      type: "wp",
    }]);
  }

  const { count } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .in("status", ["New", "Investigating", "In Progress"]);

  await supabase
    .from("sites")
    .update({
      wp_core: wpVersion,
      wp_core_latest: updateData?.core_version || wpVersion,
      wp_plugins: updateData?.plugin_updates ?? updates.filter((update) => update.target !== "WordPress Core" && !update.target.endsWith(" Theme")).length,
      wp_themes: updateData?.theme_updates ?? updates.filter((update) => update.target.endsWith(" Theme")).length,
      open_issues: count ?? 0,
      last_scan: new Date().toISOString(),
    })
    .eq("id", site.id);

  return { updatesQueued: updates.length, issuesCreated: issueRows.length };
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

    let findings: { updatesQueued: number; issuesCreated: number } | undefined;
    let syncError: string | undefined;
    try {
      findings = await syncWordPressFindings(supabase, site, payload);
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.error("[EOH] syncWordPressFindings threw:", syncError);
    }

    return NextResponse.json({
      ok: true,
      message: "Snapshot stored",
      site: site.name,
      updatesQueued: findings?.updatesQueued ?? null,
      issuesCreated: findings?.issuesCreated ?? null,
      syncError: syncError ?? null,
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
