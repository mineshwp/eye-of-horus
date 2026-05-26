import { NextRequest, NextResponse } from "next/server";
import { runSiteCheck, runAllSiteChecks } from "@/lib/checks/index";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

// Force Node.js runtime — needed for the tls module used in SSL checks
export const runtime = "nodejs";
// 60s max for multi-site scans (Vercel limit; increase if on Pro)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const { siteId, runAll } = body as { siteId?: string; runAll?: boolean };

    if (!siteId && !runAll) {
      return NextResponse.json(
        { error: "Provide siteId or runAll: true" },
        { status: 400 }
      );
    }

    if (runAll) {
      const results = await runAllSiteChecks();
      const summary = {
        total: results.length,
        healthy: results.filter((r) => r.status === "healthy").length,
        attention: results.filter((r) => r.status === "attention").length,
        critical: results.filter((r) => r.status === "critical").length,
        down: results.filter((r) => r.uptimeStatus === "down").length,
        issuesCreated: results.reduce((sum, r) => sum + r.issuesCreated.length, 0),
        results: results.map((r) => ({
          siteId: r.siteId,
          siteName: r.siteName,
          status: r.status,
          healthScore: r.healthScore,
          uptimeStatus: r.uptimeStatus,
          responseTimeMs: r.httpCheck.responseTimeMs,
          sslDaysRemaining: r.sslCheck.daysRemaining,
          issuesCreated: r.issuesCreated,
        })),
      };
      return NextResponse.json({ ok: true, ...summary });
    }

    // Single site check
    const result = await runSiteCheck(siteId!);
    if (!result) {
      return NextResponse.json(
        { error: `Site not found: ${siteId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      siteId: result.siteId,
      siteName: result.siteName,
      status: result.status,
      healthScore: result.healthScore,
      uptimeStatus: result.uptimeStatus,
      httpStatus: result.httpCheck.httpStatus,
      responseTimeMs: result.httpCheck.responseTimeMs,
      sslValid: result.sslCheck.valid,
      sslDaysRemaining: result.sslCheck.daysRemaining,
      sslExpiryDate: result.sslCheck.expiryDate,
      seoIssues: result.seoCheck.issues,
      issuesCreated: result.issuesCreated,
      persisted: result.persisted,
      checkedAt: result.checkedAt,
    });
  } catch (err: any) {
    console.error("Check run error:", err);
    return NextResponse.json(
      { error: "Internal error running check", detail: err.message },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Eye of Horus Check Runner",
    version: "2.0.0",
    capabilities: ["http", "ssl", "seo"],
  });
}
