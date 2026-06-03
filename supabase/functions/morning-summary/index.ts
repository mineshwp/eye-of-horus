// Eye of Horus — Morning Summary Edge Function
//
// Aggregates the previous 24h of monitoring data into a single clean JSON
// payload designed to be read by the Claude scheduled task at 7am.
//
// Security: requires a shared secret in the `x-eoh-secret` header that must
// match the SUMMARY_SECRET env var. Uses the service-role key server-side only
// (never exposed to the client). RLS is bypassed intentionally here because
// this is a trusted server-to-server endpoint.
//
// Deploy:  supabase functions deploy morning-summary --no-verify-jwt
// Secrets: supabase secrets set SUMMARY_SECRET=<random-string>
//
// Endpoint: https://<project-ref>.supabase.co/functions/v1/morning-summary

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUMMARY_SECRET = Deno.env.get("SUMMARY_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OPEN_ISSUE_STATUSES = ["open", "in_progress", "investigating", "new"];

function dayAgoISO(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

// Pick the most recent row per site_id from an array sorted desc by a time field.
function latestPerSite<T extends { site_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of rows) {
    if (!map.has(r.site_id)) map.set(r.site_id, r);
  }
  return map;
}

Deno.serve(async (req) => {
  // ── Auth ────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-eoh-secret");
  if (!SUMMARY_SECRET || secret !== SUMMARY_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const since = dayAgoISO();

  try {
    // ── Sites (lookup table for friendly names) ────────────────────────────
    const { data: sites } = await supabase
      .from("sites")
      .select("id, name, url, status");
    const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

    // ── Open issues ────────────────────────────────────────────────────────
    const { data: issues } = await supabase
      .from("issues")
      .select("id, site_id, title, severity, category, status, detected")
      .in("status", OPEN_ISSUE_STATUSES);

    // ── WordPress updates (pending = anything still recorded as available) ──
    const { data: wpUpdates } = await supabase
      .from("wp_updates")
      .select('id, site_id, target, "from", "to", risk, priority, type');

    // ── Security (latest WordPress snapshot per site) ──────────────────────
    const { data: snapshots } = await supabase
      .from("wordpress_snapshots")
      .select("site_id, security_data, server_data, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const latestSnap = latestPerSite(snapshots ?? []);

    // ── Uptime over the past 24h ───────────────────────────────────────────
    const { data: uptime } = await supabase
      .from("uptime_checks")
      .select("site_id, status, http_status, response_time_ms, checked_at")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false });

    const uptimeBySite = new Map<
      string,
      { total: number; up: number; down: number; degraded: number }
    >();
    for (const u of uptime ?? []) {
      const e =
        uptimeBySite.get(u.site_id) ?? { total: 0, up: 0, down: 0, degraded: 0 };
      e.total++;
      if (u.status === "up") e.up++;
      else if (u.status === "down") e.down++;
      else if (u.status === "degraded") e.degraded++;
      uptimeBySite.set(u.site_id, e);
    }

    // ── Performance (latest desktop + mobile per site) ─────────────────────
    const { data: perf } = await supabase
      .from("performance_metrics")
      .select("site_id, device, performance_score, lcp, cls, inp, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    const perfBySite = new Map<
      string,
      { desktop?: unknown; mobile?: unknown }
    >();
    for (const p of perf ?? []) {
      const e = perfBySite.get(p.site_id) ?? {};
      const key = p.device === "mobile" ? "mobile" : "desktop";
      if (!(e as Record<string, unknown>)[key]) {
        (e as Record<string, unknown>)[key] = {
          score: p.performance_score,
          lcp: p.lcp,
          cls: p.cls,
          inp: p.inp,
          measured_at: p.created_at,
        };
      }
      perfBySite.set(p.site_id, e);
    }

    // ── Form failures ──────────────────────────────────────────────────────
    const { data: formFails } = await supabase
      .from("form_checks")
      .select("site_id, form_name, page_url, status, result_message, created_at")
      .eq("status", "fail")
      .gte("created_at", since);

    // ── Watchtower (Playwright) failures ───────────────────────────────────
    const { data: checkFails } = await supabase
      .from("checks")
      .select("site_id, check_type, device, status, summary, completed_at")
      .eq("status", "failed")
      .gte("started_at", since);

    // ── Build per-site rollup ──────────────────────────────────────────────
    const perSite = (sites ?? []).map((s) => {
      const up = uptimeBySite.get(s.id);
      const snap = latestSnap.get(s.id);
      return {
        site_id: s.id,
        name: s.name,
        url: s.url,
        open_issues: (issues ?? []).filter((i) => i.site_id === s.id).length,
        wp_updates_pending: (wpUpdates ?? []).filter((w) => w.site_id === s.id)
          .length,
        uptime_24h: up
          ? {
              checks: up.total,
              up: up.up,
              down: up.down,
              degraded: up.degraded,
              uptime_pct: up.total
                ? Math.round((up.up / up.total) * 1000) / 10
                : null,
            }
          : null,
        performance: perfBySite.get(s.id) ?? null,
        security: snap?.security_data ?? null,
      };
    });

    const payload = {
      generated_at: new Date().toISOString(),
      window: { since, until: new Date().toISOString() },
      totals: {
        sites: (sites ?? []).length,
        open_issues: (issues ?? []).length,
        wp_updates_pending: (wpUpdates ?? []).length,
        form_failures_24h: (formFails ?? []).length,
        watchtower_failures_24h: (checkFails ?? []).length,
        sites_down_24h: perSite.filter((s) => (s.uptime_24h?.down ?? 0) > 0)
          .length,
      },
      open_issues: (issues ?? []).map((i) => ({
        ...i,
        site: siteName.get(i.site_id) ?? i.site_id,
      })),
      wp_updates: (wpUpdates ?? []).map((w) => ({
        ...w,
        site: siteName.get(w.site_id) ?? w.site_id,
      })),
      form_failures: (formFails ?? []).map((f) => ({
        ...f,
        site: siteName.get(f.site_id) ?? f.site_id,
      })),
      watchtower_failures: (checkFails ?? []).map((c) => ({
        ...c,
        site: siteName.get(c.site_id) ?? c.site_id,
      })),
      sites: perSite,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
