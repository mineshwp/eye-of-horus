import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runAllSiteChecks } from "@/lib/checks/index";
import { fireAlertsForCheckResults } from "@/lib/notifications/alerts";
import { fetchGAMetrics } from "@/lib/analytics/google-analytics";
import { fetchGSCMetrics } from "@/lib/analytics/search-console";
import { CLARITY_API_CALLS_PER_SYNC, ClarityApiError, DEFAULT_CLARITY_ENDPOINT_URL, fetchClarityMetrics } from "@/lib/analytics/clarity";
import { fetchPageSpeedInsights } from "@/lib/performance/pagespeed";

// Force Node.js runtime — needed for SSL check tls module
export const runtime = "nodejs";
// 60s max — increase on Vercel Pro if you have many sites
export const maxDuration = 60;

/**
 * Daily cron endpoint.
 *
 * Trigger via:
 *   - Vercel Cron: add to vercel.json
 *   - Supabase pg_cron: call with service role key in header
 *   - External scheduler: e.g. cron-job.org, GitHub Actions
 *
 * Always protect with CRON_SECRET. Example curl:
 *   curl -X POST https://your-app.vercel.app/api/cron/daily \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 *
 * Vercel cron config (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/daily", "schedule": "0 4 * * *" }]
 * }
 * Vercel automatically sends CRON_SECRET as the Authorization header.
 */
export async function POST(request: NextRequest) {
  // Authenticate with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();
  console.log(`[cron/daily] Starting daily checks at ${now.toISOString()}`);

  // ── Supabase client (for analytics sync) ──────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  try {
    const results = await runAllSiteChecks();

    const durationMs = Date.now() - startTime;
    const critical = results.filter((r) => r.status === "critical");
    const down = results.filter((r) => r.uptimeStatus === "down");
    const issuesCreated = results.reduce((sum, r) => sum + r.issuesCreated.length, 0);

    console.log(
      `[cron/daily] Completed in ${durationMs}ms — ${results.length} sites checked, ` +
      `${critical.length} critical, ${down.length} down, ${issuesCreated} new issues`
    );

    // Phase 8: Fire email + WhatsApp alerts for critical findings
    const { totalEmailsSent, totalWhatsappSent } = await fireAlertsForCheckResults(
      results.map((r) => ({
        siteId: r.siteId,
        siteName: r.siteName,
        siteUrl: r.siteUrl,
        uptimeStatus: r.uptimeStatus,
        status: r.status,
        sslCheck: { valid: r.sslCheck.valid, daysRemaining: r.sslCheck.daysRemaining },
        domainCheck: r.domainCheck ? { daysRemaining: r.domainCheck.daysRemaining } : undefined,
        issuesCreated: r.issuesCreated,
      })),
    );
    console.log(`[cron/daily] Alerts fired — ${totalEmailsSent} emails, ${totalWhatsappSent} WhatsApp`);

    if (process.env.ALERT_EMAIL_RECIPIENTS) {
      await fetch(`${process.env.APP_URL}/api/reports/email-daily`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret || ''}` },
      });
    }

    // ── Analytics auto-sync ──────────────────────────────────────────────────
    // Reads the configured sync time from global_settings (default "02:00" UTC).
    // The cron itself fires at the same time; this check is a safety guard so that
    // if the cron ever fires outside the expected window the sync is skipped.
    let analyticsSyncResult: { synced: number; skipped: number; errors: number } = { synced: 0, skipped: 0, errors: 0 };

    if (supabase) {
      try {
        // Read configured sync time
        const { data: timeSetting } = await supabase
          .from("global_settings")
          .select("value")
          .eq("key", "analytics_sync_time")
          .single();

        const configuredTime = timeSetting?.value ?? "02:00"; // "HH:MM" UTC
        const [cfgHour, cfgMinute] = configuredTime.split(":").map(Number);
        const currentHour = now.getUTCHours();
        const currentMinute = now.getUTCMinutes();

        // Allow ±30-minute window around the configured time
        const configuredMinutes = cfgHour * 60 + cfgMinute;
        const currentMinutes = currentHour * 60 + currentMinute;
        const diff = Math.abs(currentMinutes - configuredMinutes);
        const inWindow = diff <= 30 || diff >= (24 * 60 - 30); // handle midnight wrap

        if (inWindow) {
          console.log(`[cron/daily] Running analytics auto-sync (configured: ${configuredTime} UTC)`);

          // Fetch all site integrations
          const { data: integrations } = await supabase
            .from("site_integrations")
            .select("*");

          const today = now.toISOString().split("T")[0];
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
          const endDate = today;

          for (const integ of integrations ?? []) {
            const siteId: string = integ.site_id;
            const needsReset = integ.sync_counts_date !== today;
            const counterUpdates: Record<string, unknown> = { sync_counts_date: today, updated_at: now.toISOString() };
            if (needsReset) {
              counterUpdates.ga_sync_count_today = 0;
              counterUpdates.gsc_sync_count_today = 0;
              counterUpdates.clarity_sync_count_today = 0;
            }

            // GA4
            if (integ.ga_property_id) {
              try {
                const metrics = await fetchGAMetrics(integ.ga_property_id, startDate, endDate);
                if (metrics) {
                  await supabase.from("analytics_snapshots").insert({ site_id: siteId, period_start: startDate, period_end: endDate, metrics });
                  counterUpdates.ga_last_synced_at = now.toISOString();
                  counterUpdates.ga_sync_count_today = (needsReset ? 0 : (integ.ga_sync_count_today ?? 0)) + 1;
                  counterUpdates.ga_sync_count_total = (integ.ga_sync_count_total ?? 0) + 1;
                  analyticsSyncResult.synced++;
                } else {
                  analyticsSyncResult.skipped++;
                }
              } catch { analyticsSyncResult.errors++; }
            }

            // GSC
            if (integ.gsc_site_url) {
              try {
                const gscData = await fetchGSCMetrics(integ.gsc_site_url, startDate, endDate);
                if (gscData) {
                  await supabase.from("search_console_snapshots").insert({
                    site_id: siteId,
                    period_start: startDate,
                    period_end: endDate,
                    queries: gscData.topQueries,
                    pages: gscData.topPages,
                    metrics: { clicks: gscData.clicks, impressions: gscData.impressions, ctr: gscData.ctr, position: gscData.position, strikingDistance: gscData.strikingDistance, previousPeriod: gscData.previousPeriod, fetchedAt: gscData.fetchedAt },
                  });
                  counterUpdates.gsc_last_synced_at = now.toISOString();
                  counterUpdates.gsc_sync_count_today = (needsReset ? 0 : (integ.gsc_sync_count_today ?? 0)) + 1;
                  counterUpdates.gsc_sync_count_total = (integ.gsc_sync_count_total ?? 0) + 1;
                  analyticsSyncResult.synced++;
                } else {
                  analyticsSyncResult.skipped++;
                }
              } catch { analyticsSyncResult.errors++; }
            }

            // Clarity — auto-sync at most once per UTC day per site.
            // One sync performs two Microsoft API requests: aggregate + URL dimension.
            if (integ.clarity_project_id && integ.clarity_api_key) {
              const limit: number = integ.clarity_daily_limit ?? 10;
              const usedToday: number = needsReset ? 0 : (integ.clarity_sync_count_today ?? 0);
              const lastClaritySync = typeof integ.clarity_last_synced_at === "string" ? integ.clarity_last_synced_at : "";
              const alreadySyncedToday = !needsReset && (usedToday > 0 || lastClaritySync.startsWith(today));

              if (alreadySyncedToday) {
                console.log(`[cron/daily] Clarity already auto-synced for site ${siteId} today — skipping`);
                analyticsSyncResult.skipped++;
              } else if (usedToday + CLARITY_API_CALLS_PER_SYNC <= limit) {
                try {
                  const clarityData = await fetchClarityMetrics(
                    integ.clarity_project_id,
                    integ.clarity_api_key,
                    integ.clarity_endpoint_url || DEFAULT_CLARITY_ENDPOINT_URL,
                  );
                  if (clarityData) {
                    await supabase.from("clarity_snapshots").insert({ site_id: siteId, period_start: startDate, period_end: endDate, metrics: clarityData, insights: [] });
                    counterUpdates.clarity_last_synced_at = now.toISOString();
                    counterUpdates.clarity_sync_count_today = usedToday + CLARITY_API_CALLS_PER_SYNC;
                    counterUpdates.clarity_sync_count_total = (integ.clarity_sync_count_total ?? 0) + CLARITY_API_CALLS_PER_SYNC;
                    analyticsSyncResult.synced++;
                  } else {
                    analyticsSyncResult.skipped++;
                  }
                } catch (err) {
                  if (err instanceof ClarityApiError && err.status === 429) {
                    console.log(`[cron/daily] Microsoft Clarity API limit reached for site ${siteId} — skipping`);
                    analyticsSyncResult.skipped++;
                  } else {
                    analyticsSyncResult.errors++;
                  }
                }
              } else {
                console.log(`[cron/daily] Clarity daily API limit would be exceeded for site ${siteId} — skipping`);
                analyticsSyncResult.skipped++;
              }
            }

            // Persist counter updates for this site
            await supabase.from("site_integrations").update(counterUpdates).eq("site_id", siteId);
          }

          console.log(`[cron/daily] Analytics sync complete — synced: ${analyticsSyncResult.synced}, skipped: ${analyticsSyncResult.skipped}, errors: ${analyticsSyncResult.errors}`);
        } else {
          console.log(`[cron/daily] Analytics sync skipped — outside configured window (${configuredTime} UTC)`);
        }
      } catch (analyticsErr: unknown) {
        console.error("[cron/daily] Analytics sync failed:", analyticsErr);
      }
    }

    // ── PageSpeed Insights sync ──────────────────────────────────────────────
    // Runs desktop + mobile PSI for every site. Two API calls per site per day.
    // At 25,000 free calls/day with an API key this comfortably handles 100+ sites.
    let psiSyncResult: { synced: number; skipped: number; errors: number } = { synced: 0, skipped: 0, errors: 0 };

    if (supabase) {
      try {
        const { data: sites } = await supabase.from("sites").select("id, url").eq("status", "active");

        for (const site of sites ?? []) {
          if (!site.url) { psiSyncResult.skipped++; continue; }

          try {
            const [desktop, mobile] = await Promise.all([
              fetchPageSpeedInsights(site.url, "desktop"),
              fetchPageSpeedInsights(site.url, "mobile"),
            ]);

            const rows = [];
            if (desktop) {
              rows.push({ site_id: site.id, device: "desktop", performance_score: desktop.performance_score, accessibility_score: desktop.accessibility_score, seo_score: desktop.seo_score, best_practices_score: desktop.best_practices_score, lcp: desktop.lcp, cls: desktop.cls, inp: desktop.inp, fcp: desktop.fcp, tti: desktop.tti, raw_result: desktop.raw_result });
              rows.push({ site_id: site.id, device: "tablet", performance_score: desktop.performance_score, accessibility_score: desktop.accessibility_score, seo_score: desktop.seo_score, best_practices_score: desktop.best_practices_score, lcp: desktop.lcp, cls: desktop.cls, inp: desktop.inp, fcp: desktop.fcp, tti: desktop.tti, raw_result: desktop.raw_result });
            }
            if (mobile) rows.push({ site_id: site.id, device: "mobile", performance_score: mobile.performance_score, accessibility_score: mobile.accessibility_score, seo_score: mobile.seo_score, best_practices_score: mobile.best_practices_score, lcp: mobile.lcp, cls: mobile.cls, inp: mobile.inp, fcp: mobile.fcp, tti: mobile.tti, raw_result: mobile.raw_result });

            if (rows.length > 0) {
              await supabase.from("performance_metrics").insert(rows);
              const perfScores = [desktop?.performance_score, mobile?.performance_score]
                .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
              if (perfScores.length > 0) {
                const perf = Math.round(perfScores.reduce((sum, score) => sum + score, 0) / perfScores.length);
                await supabase.from("sites").update({ perf }).eq("id", site.id);
              }
              psiSyncResult.synced += rows.length;
            } else {
              psiSyncResult.errors++;
            }
          } catch {
            psiSyncResult.errors++;
          }
        }

        console.log(`[cron/daily] PSI sync complete — synced: ${psiSyncResult.synced}, skipped: ${psiSyncResult.skipped}, errors: ${psiSyncResult.errors}`);
      } catch (psiErr) {
        console.error("[cron/daily] PSI sync failed:", psiErr);
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      durationMs,
      summary: {
        total: results.length,
        healthy: results.filter((r) => r.status === "healthy").length,
        attention: results.filter((r) => r.status === "attention").length,
        critical: critical.length,
        down: down.length,
        issuesCreated,
        alertEmailsSent: totalEmailsSent,
        alertWhatsappSent: totalWhatsappSent,
      },
      analyticsSync: analyticsSyncResult,
      psiSync: psiSyncResult,
      sites: results.map((r) => ({
        siteId: r.siteId,
        siteName: r.siteName,
        status: r.status,
        healthScore: r.healthScore,
        uptimeStatus: r.uptimeStatus,
        issuesCreated: r.issuesCreated,
      })),
    });
  } catch (err: any) {
    console.error("[cron/daily] Fatal error:", err);
    return NextResponse.json(
      { error: "Cron job failed", detail: err.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
