import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { fetchPageSpeedInsights } from "@/lib/performance/pagespeed";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/sites/[id]/business/benchmark { url } — run PageSpeed against a
// competitor URL so benchmarks are quantitative, not guesswork.
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const target = url.startsWith("http") ? url : `https://${url}`;
  const result = await fetchPageSpeedInsights(target, "mobile");
  if (!result) {
    return NextResponse.json({ error: "Could not benchmark this URL (PageSpeed unavailable or invalid URL)." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    performance: result.performance_score,
    seo: result.seo_score,
    accessibility: result.accessibility_score,
    best_practices: result.best_practices_score,
    lcp: result.lcp,
    checked_at: result.fetchedAt,
  });
}
