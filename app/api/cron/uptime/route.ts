import { NextRequest, NextResponse } from "next/server";
import { runAllUptimeChecks } from "@/lib/checks/index";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllUptimeChecks();

  return NextResponse.json({
    ok: true,
    mode: "uptime",
    total: results.length,
    up: results.filter((r) => r.uptimeStatus === "up").length,
    degraded: results.filter((r) => r.uptimeStatus === "degraded").length,
    down: results.filter((r) => r.uptimeStatus === "down").length,
    checkedAt: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
