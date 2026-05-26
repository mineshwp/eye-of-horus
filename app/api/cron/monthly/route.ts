import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { compileReport } from "@/lib/reports/compiler";
import { sendEmail } from "@/lib/reports/email-template";
import { randomUUID } from "crypto";

// Force Node.js runtime — needed for crypto and Supabase service role
export const runtime = "nodejs";
// 5 minutes — allows processing many sites without Vercel timeout
export const maxDuration = 300;

/**
 * Monthly report auto-generation cron endpoint.
 *
 * Runs on the 1st of each month at 00:30 UTC.
 * Generates a monthly report for every site in the database covering the
 * previous calendar month, then sends a completion notification email.
 *
 * Trigger via:
 *   - Vercel Cron: configured in vercel.json (auto-sends CRON_SECRET header)
 *   - Manual curl:
 *       curl -X POST https://your-app.vercel.app/api/cron/monthly \
 *         -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[cron/monthly] Starting monthly report generation at ${new Date().toISOString()}`);

  // ── Period calculation: previous calendar month ───────────────────────────
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

  const periodLabel = periodStart.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const monthName = periodStart.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

  console.log(`[cron/monthly] Period: ${periodStart.toISOString().split("T")[0]} → ${periodEnd.toISOString().split("T")[0]}`);

  // ── Supabase service role client ──────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[cron/monthly] Supabase service role not configured");
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // ── Fetch all sites ───────────────────────────────────────────────────────
  const { data: sites, error: sitesErr } = await supabase
    .from("sites")
    .select("id, name, client_id");

  if (sitesErr) {
    console.error("[cron/monthly] Failed to fetch sites:", sitesErr.message);
    return NextResponse.json({ error: sitesErr.message }, { status: 500 });
  }

  if (!sites || sites.length === 0) {
    console.log("[cron/monthly] No sites found — nothing to generate");
    return NextResponse.json({
      ok: true,
      month: periodLabel,
      reportsGenerated: 0,
      reportsFailed: 0,
      durationMs: Date.now() - startTime,
    });
  }

  console.log(`[cron/monthly] Found ${sites.length} site(s) to process`);

  // ── Process sites in batches of 3 ────────────────────────────────────────
  const BATCH_SIZE = 3;
  const successes: Array<{ siteId: string; siteName: string; reportId: string }> = [];
  const failures: Array<{ siteId: string; siteName: string; error: string }> = [];

  for (let i = 0; i < sites.length; i += BATCH_SIZE) {
    const batch = sites.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (site: { id: string; name: string; client_id: string | null }) => {
        const siteName = site.name ?? site.id;
        console.log(`[cron/monthly] Generating report for site: ${siteName} (${site.id})`);

        try {
          // Compile report data directly — avoids HTTP self-call
          const content = await compileReport(site.id, periodStart, periodEnd);

          // Build executive summary (same logic as generate route)
          const execSummary = [
            `${content.siteName} maintained a health score of ${content.health.score}/100 during this period.`,
            content.issues.critical > 0
              ? `${content.issues.critical} critical issue${content.issues.critical > 1 ? "s were" : " was"} detected requiring immediate attention.`
              : "No critical issues were detected.",
            content.issues.resolved > 0
              ? `${content.issues.resolved} issue${content.issues.resolved > 1 ? "s" : ""} resolved during this period.`
              : "",
            `Uptime maintained at ${content.health.uptimePercent}%.`,
            content.wordpress.pluginsNeedingUpdate > 0
              ? `${content.wordpress.pluginsNeedingUpdate} WordPress plugin update${content.wordpress.pluginsNeedingUpdate > 1 ? "s" : ""} pending.`
              : "All WordPress plugins are up to date.",
          ]
            .filter(Boolean)
            .join(" ");

          // Generate a unique share token
          const shareToken = randomUUID();

          // Insert report row into Supabase
          const { data: report, error: insertErr } = await supabase
            .from("reports")
            .insert({
              site_id: site.id,
              client_id: site.client_id ?? null,
              report_type: "monthly",
              period_start: periodStart.toISOString().split("T")[0],
              period_end: periodEnd.toISOString().split("T")[0],
              status: "ready",
              content,
              executive_summary: execSummary,
              share_token: shareToken,
              title: `Monthly Report — ${periodLabel}`,
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (insertErr || !report) {
            throw new Error(insertErr?.message ?? "Insert returned no data");
          }

          console.log(`[cron/monthly] Report created for ${siteName}: ${report.id}`);
          successes.push({ siteId: site.id, siteName, reportId: report.id });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cron/monthly] Failed for site ${siteName}:`, message);
          failures.push({ siteId: site.id, siteName, error: message });
        }
      }),
    );
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[cron/monthly] Complete — ${successes.length} generated, ${failures.length} failed, ${durationMs}ms`,
  );

  // ── Send completion notification email ────────────────────────────────────
  const recipients = process.env.ALERT_EMAIL_RECIPIENTS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];

  if (recipients.length > 0) {
    const emailHtml = buildCompletionEmailHtml(monthName, periodLabel, successes, failures, durationMs);
    const emailText = buildCompletionEmailText(monthName, periodLabel, successes, failures, durationMs);

    await sendEmail(
      recipients,
      `Eye of Horus — Monthly Reports Generated — ${monthName}`,
      emailHtml,
      emailText,
    );
  } else {
    console.log("[cron/monthly] No ALERT_EMAIL_RECIPIENTS configured — skipping completion email");
  }

  return NextResponse.json({
    ok: true,
    month: periodLabel,
    reportsGenerated: successes.length,
    reportsFailed: failures.length,
    durationMs,
    generated: successes.map((s) => ({ siteId: s.siteId, siteName: s.siteName, reportId: s.reportId })),
    failed: failures.map((f) => ({ siteId: f.siteId, siteName: f.siteName, error: f.error })),
  });
}

// ── GET: health check ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    service: "Eye of Horus Monthly Report Cron",
    schedule: "30 0 1 * * (00:30 UTC on the 1st of each month)",
    nextRun: "Configure in vercel.json or external scheduler",
  });
}

// ── Email template helpers ────────────────────────────────────────────────────

function buildCompletionEmailHtml(
  monthName: string,
  periodLabel: string,
  successes: Array<{ siteId: string; siteName: string; reportId: string }>,
  failures: Array<{ siteId: string; siteName: string; error: string }>,
  durationMs: number,
): string {
  const appUrl = process.env.APP_URL ?? "";

  const successRows = successes
    .map(
      (s) => `
      <tr style="border-bottom:1px solid #1e2432;">
        <td style="padding:10px 16px;color:#e8e9ec;font-weight:500;">${escapeHtml(s.siteName)}</td>
        <td style="padding:10px 16px;"><span style="color:#22C55E;font-weight:600;">Generated</span></td>
        <td style="padding:10px 16px;">
          <a href="${escapeHtml(appUrl)}/admin/reports/${escapeHtml(s.reportId)}"
             style="color:#6366f1;text-decoration:none;font-size:12px;">View report</a>
        </td>
      </tr>`,
    )
    .join("");

  const failureRows = failures
    .map(
      (f) => `
      <tr style="border-bottom:1px solid #1e2432;">
        <td style="padding:10px 16px;color:#e8e9ec;font-weight:500;">${escapeHtml(f.siteName)}</td>
        <td style="padding:10px 16px;"><span style="color:#EF4444;font-weight:600;">Failed</span></td>
        <td style="padding:10px 16px;color:#9ba3af;font-size:12px;">${escapeHtml(f.error)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Eye of Horus — Monthly Reports — ${monthName}</title></head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e9ec;">
  <div style="max-width:680px;margin:0 auto;padding:32px 24px;">

    <div style="margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #1e2432;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Eye of Horus</div>
      <div style="font-size:22px;font-weight:600;color:#e8e9ec;">Monthly Reports Generated</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">${periodLabel}</div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#22C55E;">${successes.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Generated</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:${failures.length > 0 ? "#EF4444" : "#6b7280"};">${failures.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Failed</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#e8e9ec;">${successes.length + failures.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Total Sites</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#e8e9ec;">${Math.round(durationMs / 1000)}s</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Duration</div>
      </div>
    </div>

    ${
      successes.length > 0
        ? `<div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;">Reports Generated</div>
      <table style="width:100%;border-collapse:collapse;background:#0f1117;border:1px solid #1e2432;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0a0c12;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Site</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Link</th>
          </tr>
        </thead>
        <tbody>${successRows}</tbody>
      </table>
    </div>`
        : ""
    }

    ${
      failures.length > 0
        ? `<div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#EF4444;margin-bottom:12px;">Failed Reports — Action Required</div>
      <table style="width:100%;border-collapse:collapse;background:#0f1117;border:1px solid rgba(239,68,68,0.3);border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0a0c12;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Site</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Error</th>
          </tr>
        </thead>
        <tbody>${failureRows}</tbody>
      </table>
    </div>`
        : ""
    }

    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #1e2432;text-align:center;font-size:11px;color:#4b5563;">
      Eye of Horus · Agency monitoring platform · Wetpaint
    </div>
  </div>
</body>
</html>`;
}

function buildCompletionEmailText(
  monthName: string,
  periodLabel: string,
  successes: Array<{ siteId: string; siteName: string; reportId: string }>,
  failures: Array<{ siteId: string; siteName: string; error: string }>,
  durationMs: number,
): string {
  const lines = [
    `Eye of Horus — Monthly Reports Generated — ${monthName}`,
    "=".repeat(60),
    "",
    `Period: ${periodLabel}`,
    `Duration: ${Math.round(durationMs / 1000)}s`,
    `Generated: ${successes.length}`,
    `Failed: ${failures.length}`,
    `Total sites: ${successes.length + failures.length}`,
    "",
  ];

  if (successes.length > 0) {
    lines.push("Reports Generated:", "-".repeat(30));
    successes.forEach((s) => lines.push(`  ✓ ${s.siteName} (${s.reportId})`));
    lines.push("");
  }

  if (failures.length > 0) {
    lines.push("Failed Reports — Action Required:", "-".repeat(30));
    failures.forEach((f) => lines.push(`  ✗ ${f.siteName}: ${f.error}`));
    lines.push("");
  }

  return lines.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
