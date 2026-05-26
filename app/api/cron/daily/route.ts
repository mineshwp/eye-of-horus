import { NextRequest, NextResponse } from "next/server";
import { runAllSiteChecks } from "@/lib/checks/index";
import { fireAlertsForCheckResults } from "@/lib/notifications/alerts";

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
  console.log(`[cron/daily] Starting daily checks at ${new Date().toISOString()}`);

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

// Allow Vercel to call this as a GET for health checks
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    service: "Eye of Horus Daily Cron",
    schedule: "0 4 * * * (04:00 SAST / 02:00 UTC)",
    nextRun: "Configure in vercel.json or external scheduler",
  });
}
