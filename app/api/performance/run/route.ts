/**
 * POST /api/performance/run
 *
 * Triggers a PageSpeed Insights scan for a site.
 * Runs desktop + mobile in parallel, inserts desktop, tablet, and mobile rows.
 *
 * Body: { siteId: string }
 *
 * Returns: { ok: boolean; results: { desktop, tablet, mobile }; error? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchPageSpeedInsights, PageSpeedResult } from "@/lib/performance/pagespeed";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildRow(siteId: string, device: "desktop" | "mobile" | "tablet", result: PageSpeedResult) {
  return {
    site_id: siteId,
    device,
    performance_score: result.performance_score,
    accessibility_score: result.accessibility_score,
    seo_score: result.seo_score,
    best_practices_score: result.best_practices_score,
    lcp: result.lcp,
    cls: result.cls,
    inp: result.inp,
    tbt: result.tbt,
    fcp: result.fcp,
    tti: result.tti,
    raw_result: result.raw_result,
  };
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const { siteId } = (body ?? {}) as { siteId?: string };

  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Look up the site URL
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, url, name")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const url: string = site.url;

  // Run desktop + mobile in parallel
  const [desktopResult, mobileResult] = await Promise.all([
    fetchPageSpeedInsights(url, "desktop"),
    fetchPageSpeedInsights(url, "mobile"),
  ]);

  const rows = [];
  const errors: string[] = [];

  if (desktopResult) {
    rows.push(buildRow(siteId, "desktop", desktopResult));
    rows.push(buildRow(siteId, "tablet", desktopResult));
  } else {
    errors.push("Desktop scan failed");
  }

  if (mobileResult) {
    rows.push(buildRow(siteId, "mobile", mobileResult));
  } else {
    errors.push("Mobile scan failed");
  }

  if (rows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: errors.join("; "),
      hint: "Check that PAGESPEED_API_KEY is set and the site URL is publicly accessible.",
    }, { status: 502 });
  }

  const { error: insertErr } = await supabase.from("performance_metrics").insert(rows);
  if (insertErr) {
    return NextResponse.json({ error: `DB insert failed: ${insertErr.message}` }, { status: 500 });
  }

  const perfScores = [desktopResult?.performance_score, mobileResult?.performance_score]
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (perfScores.length > 0) {
    const perf = Math.round(perfScores.reduce((sum, score) => sum + score, 0) / perfScores.length);
    await supabase.from("sites").update({ perf }).eq("id", siteId);
  }

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    url,
    desktop: desktopResult
      ? {
          performance: desktopResult.performance_score,
          accessibility: desktopResult.accessibility_score,
          bestPractices: desktopResult.best_practices_score,
          seo: desktopResult.seo_score,
          lcp: desktopResult.lcp,
          cls: desktopResult.cls,
          inp: desktopResult.inp,
        }
      : null,
    tablet: desktopResult
      ? {
          performance: desktopResult.performance_score,
          accessibility: desktopResult.accessibility_score,
          bestPractices: desktopResult.best_practices_score,
          seo: desktopResult.seo_score,
          lcp: desktopResult.lcp,
          cls: desktopResult.cls,
          inp: desktopResult.inp,
        }
      : null,
    mobile: mobileResult
      ? {
          performance: mobileResult.performance_score,
          accessibility: mobileResult.accessibility_score,
          bestPractices: mobileResult.best_practices_score,
          seo: mobileResult.seo_score,
          lcp: mobileResult.lcp,
          cls: mobileResult.cls,
          inp: mobileResult.inp,
        }
      : null,
    errors: errors.length > 0 ? errors : undefined,
  });
}
