import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Deploy-regression detection (Phase 5 item #2).
// We already snapshot WordPress core/theme/plugin versions. A change between the
// two most recent snapshots is treated as a "deploy". If performance also fell
// around the same time, we flag a likely regression.

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const PERF_DROP = 10; // desktop Lighthouse points

interface SnapRow {
  wp_version: string | null;
  theme_data: unknown;
  plugin_data: unknown;
  created_at: string;
}

function pluginList(pd: unknown): string[] {
  const arr = Array.isArray(pd) ? pd : (pd as { plugins?: unknown[] })?.plugins;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => {
      const o = p as { name?: string; file?: string; version?: string };
      return `${o.name ?? o.file ?? "?"}@${o.version ?? "?"}`;
    })
    .sort();
}

function signature(s: SnapRow): string {
  const theme = (s.theme_data as { name?: string; version?: string } | null);
  return [s.wp_version ?? "", theme?.name ?? "", theme?.version ?? "", pluginList(s.plugin_data).join(",")].join("|");
}

function summarise(cur: SnapRow, prev: SnapRow): string {
  const parts: string[] = [];
  if ((cur.wp_version ?? "") !== (prev.wp_version ?? "")) parts.push(`WordPress core ${prev.wp_version ?? "?"} → ${cur.wp_version ?? "?"}`);
  const ct = cur.theme_data as { version?: string } | null;
  const pt = prev.theme_data as { version?: string } | null;
  if ((ct?.version ?? "") !== (pt?.version ?? "")) parts.push(`theme ${pt?.version ?? "?"} → ${ct?.version ?? "?"}`);
  const curP = new Set(pluginList(cur.plugin_data));
  const prevP = new Set(pluginList(prev.plugin_data));
  const changed = [...curP].filter((x) => !prevP.has(x)).length;
  if (changed > 0) parts.push(`${changed} plugin change${changed === 1 ? "" : "s"}`);
  return parts.join(", ") || "site files changed";
}

export async function detectDeployRegressions(): Promise<{ sitesChecked: number; deploys: number; regressions: number }> {
  const supabase = getServerClient();
  if (!supabase) return { sitesChecked: 0, deploys: 0, regressions: 0 };

  const { data: sites } = await supabase.from("sites").select("id, name").eq("status", "active");
  if (!sites || sites.length === 0) return { sitesChecked: 0, deploys: 0, regressions: 0 };

  let deploys = 0;
  let regressions = 0;

  for (const site of sites as Array<{ id: string; name: string }>) {
    const { data: snaps } = await supabase
      .from("wordpress_snapshots")
      .select("wp_version, theme_data, plugin_data, created_at")
      .eq("site_id", site.id)
      .order("created_at", { ascending: false })
      .limit(2);
    if (!snaps || snaps.length < 2) continue;

    const [cur, prev] = snaps as SnapRow[];
    if (signature(cur) === signature(prev)) continue; // no deploy
    deploys++;
    const summary = summarise(cur, prev);

    // Did performance drop around the same time?
    const { data: perf } = await supabase
      .from("performance_metrics")
      .select("performance_score, created_at")
      .eq("site_id", site.id)
      .eq("device", "desktop")
      .order("created_at", { ascending: false })
      .limit(2);
    let regressed = false;
    let prevPerf: number | null = null;
    let curPerf: number | null = null;
    if (perf && perf.length === 2) {
      curPerf = perf[0].performance_score as number | null;
      prevPerf = perf[1].performance_score as number | null;
      if (typeof curPerf === "number" && typeof prevPerf === "number" && prevPerf - curPerf >= PERF_DROP) regressed = true;
    }

    const title = regressed
      ? `Possible regression after site update — performance fell ${prevPerf} → ${curPerf}`
      : `Site update detected — ${summary}`;
    const titlePrefix = regressed ? "Possible regression after site update" : "Site update detected";

    const { data: existing } = await supabase
      .from("issues")
      .select("id")
      .eq("site_id", site.id)
      .eq("category", "Deploy")
      .ilike("title", `${titlePrefix}%`)
      .in("status", ["New", "Investigating", "In Progress"])
      .limit(1);
    if (existing && existing.length > 0) continue;

    if (regressed) regressions++;

    await supabase.from("issues").insert([{
      id: `dep-${randomUUID().slice(0, 8)}`,
      site_id: site.id,
      title,
      severity: regressed ? "high" : "low",
      impact: regressed
        ? `A WordPress update (${summary}) coincided with a ${(prevPerf ?? 0) - (curPerf ?? 0)}-point drop in desktop performance.`
        : `Detected via WordPress version change: ${summary}. Logged for change tracking.`,
      category: "Deploy",
      page: "/",
      recommended: regressed
        ? "Review the update — run a fresh Page Speed scan, check the Visual changes tab, and roll back or optimise if needed."
        : "No action required unless other checks flag issues. Use this to correlate any changes that follow.",
      owner: "Unassigned",
      status: "New",
      detected: new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      change_type: "Deploy detection",
      confidence: regressed ? 75 : 90,
      evidence: { summary, prevPerf, curPerf, deployedAt: cur.created_at },
    }]);
  }

  return { sitesChecked: sites.length, deploys, regressions };
}
