import { NextRequest, NextResponse } from "next/server";
import { runSeoCrawl, runAllSeoCrawls } from "@/lib/seo/crawl";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

// Force Node.js runtime — the crawler makes many outbound fetches.
export const runtime = "nodejs";
// Crawls are heavier than basic checks; allow the full Vercel window.
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
        { status: 400 },
      );
    }

    if (runAll) {
      const results = await runAllSeoCrawls();
      return NextResponse.json({
        ok: true,
        total: results.length,
        results: results.map((r) => ({
          siteId: r.siteId,
          siteName: r.siteName,
          score: r.score,
          pagesCrawled: r.pagesCrawled,
          brokenLinks: r.brokenLinks.length,
          issuesCreated: r.issuesCreated,
        })),
      });
    }

    const result = await runSeoCrawl(siteId!);
    if (!result) {
      return NextResponse.json({ error: `Site not found: ${siteId}` }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      siteId: result.siteId,
      siteName: result.siteName,
      score: result.score,
      pagesCrawled: result.pagesCrawled,
      linksChecked: result.linksChecked,
      brokenLinks: result.brokenLinks.length,
      missingTitles: result.missingTitles,
      duplicateTitles: result.duplicateTitles,
      missingDescriptions: result.missingDescriptions,
      missingH1: result.missingH1,
      thinContentCount: result.thinContentCount,
      imagesMissingAlt: result.imagesMissingAlt,
      pagesWithSchema: result.pagesWithSchema,
      hasSitemap: result.hasSitemap,
      hasRobots: result.hasRobots,
      issuesCreated: result.issuesCreated,
      persisted: result.persisted,
      checkedAt: result.checkedAt,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[api/seo/crawl] Error:", e.message);
    return NextResponse.json(
      { error: "Internal error running SEO crawl", detail: e.message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Eye of Horus SEO Crawler",
    version: "2.0.0",
    capabilities: ["broken-links", "sitemap", "robots", "meta", "schema", "alt-text", "thin-content"],
  });
}
