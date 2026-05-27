/**
 * POST /api/analytics/sync-one
 *
 * Runs a single-source analytics sync for a site and updates the
 * per-source counters (sync_count_today, sync_count_total, last_synced_at).
 *
 * Body: { siteId: string; source: "ga" | "gsc" | "clarity" }
 *
 * Daily counters are reset when `sync_counts_date` differs from today (UTC).
 * Clarity has a configurable daily limit (default 10 — set via clarity_daily_limit
 * on the site_integrations row).  Requests that would exceed the limit are
 * rejected with 429.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchGAMetrics } from "@/lib/analytics/google-analytics";
import { fetchGSCMetrics } from "@/lib/analytics/search-console";
import { fetchClarityMetrics } from "@/lib/analytics/clarity";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";
export const maxDuration = 60;

type Source = "ga" | "gsc" | "clarity";

function todayUTC(): string {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const { siteId, source } = (body ?? {}) as {
    siteId?: string;
    source?: Source;
  };

  if (!siteId || !source || !["ga", "gsc", "clarity"].includes(source)) {
    return NextResponse.json(
      { error: "siteId and source (ga|gsc|clarity) are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // ── Load integration row ──────────────────────────────────────────────────
  const { data: integration, error: fetchErr } = await supabase
    .from("site_integrations")
    .select("*")
    .eq("site_id", siteId)
    .single();

  if (fetchErr || !integration) {
    return NextResponse.json({ error: "Integration not found for this site" }, { status: 404 });
  }

  const today = todayUTC();

  // Reset today counters if the stored date differs from today
  const needsReset = integration.sync_counts_date !== today;
  const todayBase = needsReset ? 0 : (integration[`${source}_sync_count_today`] ?? 0);

  // ── Clarity daily limit check ─────────────────────────────────────────────
  if (source === "clarity") {
    const limit: number = integration.clarity_daily_limit ?? 10;
    const usedToday: number = needsReset ? 0 : (integration.clarity_sync_count_today ?? 0);
    if (usedToday >= limit) {
      return NextResponse.json(
        {
          error: `Clarity daily limit reached (${limit} syncs/day). Try again tomorrow.`,
          usedToday,
          limit,
        },
        { status: 429 }
      );
    }
  }

  // ── Verify required config is present ─────────────────────────────────────
  if (source === "ga" && !integration.ga_property_id) {
    return NextResponse.json({ error: "GA4 property ID not configured" }, { status: 422 });
  }
  if (source === "gsc" && !integration.gsc_site_url) {
    return NextResponse.json({ error: "Search Console site URL not configured" }, { status: 422 });
  }
  if (source === "clarity" && !integration.clarity_project_id) {
    return NextResponse.json({ error: "Clarity project ID not configured" }, { status: 422 });
  }

  // ── Run the sync ──────────────────────────────────────────────────────────
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endDate = now.toISOString().split("T")[0];
  let synced = false;
  let errorMessage: string | null = null;

  try {
    if (source === "ga") {
      const metrics = await fetchGAMetrics(
        integration.ga_property_id,
        startDate,
        endDate
      );
      if (metrics) {
        await supabase.from("analytics_snapshots").insert({
          site_id: siteId,
          period_start: startDate,
          period_end: endDate,
          metrics,
        });
        synced = true;
      } else {
        errorMessage = "GA4 returned no data — check credentials and property ID";
      }
    } else if (source === "gsc") {
      const gscData = await fetchGSCMetrics(
        integration.gsc_site_url,
        startDate,
        endDate
      );
      if (gscData) {
        await supabase.from("search_console_snapshots").insert({
          site_id: siteId,
          period_start: startDate,
          period_end: endDate,
          queries: gscData.topQueries,
          pages: gscData.topPages,
          metrics: {
            clicks: gscData.clicks,
            impressions: gscData.impressions,
            ctr: gscData.ctr,
            position: gscData.position,
            strikingDistance: gscData.strikingDistance,
            previousPeriod: gscData.previousPeriod,
            fetchedAt: gscData.fetchedAt,
          },
        });
        synced = true;
      } else {
        errorMessage = "Search Console returned no data — check credentials and site URL";
      }
    } else if (source === "clarity") {
      const clarityData = await fetchClarityMetrics(
        integration.clarity_project_id,
        integration.clarity_api_key
      );
      if (clarityData) {
        await supabase.from("clarity_snapshots").insert({
          site_id: siteId,
          period_start: startDate,
          period_end: endDate,
          metrics: clarityData,
          insights: [],
        });
        synced = true;
      } else {
        errorMessage = "Clarity returned no data — check project ID and API key";
      }
    }
  } catch (err: unknown) {
    errorMessage =
      err instanceof Error ? err.message : "Unexpected error during sync";
  }

  // ── Update counters ───────────────────────────────────────────────────────
  if (synced) {
    const totalPrev: number = integration[`${source}_sync_count_total`] ?? 0;
    const updates: Record<string, unknown> = {
      sync_counts_date: today,
      [`${source}_sync_count_today`]: todayBase + 1,
      [`${source}_sync_count_total`]: totalPrev + 1,
      [`${source}_last_synced_at`]: now.toISOString(),
      updated_at: now.toISOString(),
    };

    // If day rolled over, reset the other sources' today counters too
    if (needsReset) {
      for (const s of ["ga", "gsc", "clarity"] as Source[]) {
        if (s !== source) {
          updates[`${s}_sync_count_today`] = 0;
        }
      }
    }

    await supabase
      .from("site_integrations")
      .update(updates)
      .eq("site_id", siteId);
  }

  if (!synced) {
    return NextResponse.json(
      { ok: false, source, error: errorMessage },
      { status: 200 } // 200 so the UI can show the error message cleanly
    );
  }

  // Build response with fresh counter values
  const freshTodayCount = todayBase + 1;
  const freshTotalCount = (integration[`${source}_sync_count_total`] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    source,
    syncedAt: now.toISOString(),
    counts: {
      today: freshTodayCount,
      total: freshTotalCount,
      ...(source === "clarity"
        ? {
            dailyLimit: integration.clarity_daily_limit ?? 10,
            remaining: (integration.clarity_daily_limit ?? 10) - freshTodayCount,
          }
        : {}),
    },
  });
}
