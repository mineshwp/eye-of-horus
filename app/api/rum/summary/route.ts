import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Row cap per table — generous for the alpha; aggregation is approximate above it.
const CAP = 5000;

const THRESH: Record<string, [number, number]> = {
  LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800],
};
function rate(metric: string, v: number): "good" | "needs-improvement" | "poor" | null {
  const t = THRESH[metric];
  if (!t) return null;
  return v <= t[0] ? "good" : v <= t[1] ? "needs-improvement" : "poor";
}
function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil(0.75 * s.length) - 1);
  return s[Math.max(0, idx)];
}
function topN(map: Map<string, number>, n: number): Array<{ key: string; count: number }> {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const siteId = request.nextUrl.searchParams.get("siteId");
  const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get("days") || "30", 10)));
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const supabase = getServerClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [vitalsRes, sessionsRes, eventsRes, siteRes] = await Promise.all([
    supabase.from("rum_vitals").select("metric, value").eq("site_id", siteId).gte("created_at", since).limit(CAP),
    supabase.from("rum_sessions").select("is_returning, device, source, entry_path, exit_path").eq("site_id", siteId).gte("started_at", since).limit(CAP),
    supabase.from("rum_events").select("type, target, value, path").eq("site_id", siteId).gte("created_at", since).limit(CAP),
    supabase.from("sites").select("rum_enabled").eq("id", siteId).maybeSingle(),
  ]);

  // ── Vitals (p75 per metric) ────────────────────────────────────────────────
  const byMetric = new Map<string, number[]>();
  for (const r of (vitalsRes.data ?? []) as Array<{ metric: string; value: number }>) {
    if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
    byMetric.get(r.metric)!.push(Number(r.value));
  }
  const vitals = ["LCP", "INP", "CLS", "FCP", "TTFB"].map((metric) => {
    const vals = byMetric.get(metric) ?? [];
    const value = vals.length ? Math.round(p75(vals) * (metric === "CLS" ? 1000 : 1)) / (metric === "CLS" ? 1000 : 1) : null;
    return { metric, p75: value, rating: value != null ? rate(metric, value) : null, count: vals.length };
  });

  // ── Sessions ────────────────────────────────────────────────────────────────
  const sessions = (sessionsRes.data ?? []) as Array<{ is_returning: boolean; device: string | null; source: string | null; entry_path: string | null; exit_path: string | null }>;
  const returning = sessions.filter((s) => s.is_returning).length;
  const devices = new Map<string, number>();
  const sources = new Map<string, number>();
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  for (const s of sessions) {
    if (s.device) devices.set(s.device, (devices.get(s.device) ?? 0) + 1);
    if (s.source) sources.set(s.source, (sources.get(s.source) ?? 0) + 1);
    if (s.entry_path) entries.set(s.entry_path, (entries.get(s.entry_path) ?? 0) + 1);
    if (s.exit_path) exits.set(s.exit_path, (exits.get(s.exit_path) ?? 0) + 1);
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  const events = (eventsRes.data ?? []) as Array<{ type: string; target: string | null; value: string | null; path: string | null }>;
  const counts: Record<string, number> = {};
  const ctas = new Map<string, number>();
  const outbound = new Map<string, number>();
  const downloads = new Map<string, number>();
  const searches = new Map<string, number>();
  let scrollSum = 0, scrollN = 0;
  const scrollByPathSum = new Map<string, number>();
  const scrollByPathN = new Map<string, number>();
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === "cta") { const k = (e.value || e.target || "(unlabelled)").slice(0, 80); ctas.set(k, (ctas.get(k) ?? 0) + 1); }
    else if (e.type === "outbound" && e.target) outbound.set(e.target, (outbound.get(e.target) ?? 0) + 1);
    else if (e.type === "download" && e.target) downloads.set(e.target, (downloads.get(e.target) ?? 0) + 1);
    else if (e.type === "search" && e.value) searches.set(e.value.toLowerCase(), (searches.get(e.value.toLowerCase()) ?? 0) + 1);
    else if (e.type === "scroll" && e.value != null) {
      const n = parseInt(e.value, 10);
      if (!isNaN(n)) {
        scrollSum += n; scrollN++;
        const path = e.path || "/";
        scrollByPathSum.set(path, (scrollByPathSum.get(path) ?? 0) + n);
        scrollByPathN.set(path, (scrollByPathN.get(path) ?? 0) + 1);
      }
    }
  }
  // Average scroll depth per page (top pages by sample volume).
  const scrollByPage = Array.from(scrollByPathN.entries())
    .map(([path, n]) => ({ key: path, count: Math.round((scrollByPathSum.get(path) ?? 0) / n), samples: n }))
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 8);

  const hasData = sessions.length > 0 || events.length > 0 || (vitalsRes.data?.length ?? 0) > 0;

  return NextResponse.json({
    hasData,
    rumEnabled: siteRes.data?.rum_enabled === true,
    rangeDays: days,
    vitals,
    sessions: {
      total: sessions.length,
      returning,
      new: sessions.length - returning,
      returningPct: sessions.length ? Math.round((returning / sessions.length) * 100) : 0,
      devices: topN(devices, 4),
      topSources: topN(sources, 6),
      entryPages: topN(entries, 6),
      exitPages: topN(exits, 6),
    },
    events: {
      counts,
      topCtas: topN(ctas, 6),
      topOutbound: topN(outbound, 6),
      topDownloads: topN(downloads, 6),
      searchTerms: topN(searches, 8),
      scrollByPage,
      avgScrollDepth: scrollN ? Math.round(scrollSum / scrollN) : 0,
      rageClicks: counts["rage_click"] ?? 0,
    },
  });
}
