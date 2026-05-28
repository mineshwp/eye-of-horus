/**
 * Google PageSpeed Insights v5 API wrapper.
 *
 * PSI runs Lighthouse on Google's servers and returns both lab data
 * (Lighthouse scores) and real-world field data (CrUX).
 *
 * API key is optional but raises the free-tier limit from ~100 req/day
 * to 25,000 req/day. Set PAGESPEED_API_KEY in your environment.
 *
 * PSI supports two strategies: "mobile" and "desktop".
 * Tablet is not a separate strategy — we map it to "desktop".
 */

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PageSpeedResult {
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  /** Largest Contentful Paint — seconds */
  lcp: number | null;
  /** Cumulative Layout Shift — raw score (0–1+) */
  cls: number | null;
  /** Interaction to Next Paint — milliseconds */
  inp: number | null;
  /** First Contentful Paint — seconds */
  fcp: number | null;
  /** Time to Interactive — seconds */
  tti: number | null;
  /** Full raw API response for storage */
  raw_result: Record<string, unknown>;
  /** Source URL that was tested */
  url: string;
  /** Strategy used */
  strategy: "mobile" | "desktop";
  /** When the test was run */
  fetchedAt: string;
}

function score(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  return Math.round(raw * 100);
}

function msToSec(ms: number | null | undefined): number | null {
  if (ms == null) return null;
  return Math.round((ms / 1000) * 100) / 100; // 2dp
}

function fieldMetric(
  data: Record<string, unknown>,
  name: string,
): number | null {
  const pageExperience = data.loadingExperience as { metrics?: Record<string, { percentile?: number }> } | undefined;
  const originExperience = data.originLoadingExperience as { metrics?: Record<string, { percentile?: number }> } | undefined;
  return pageExperience?.metrics?.[name]?.percentile ?? originExperience?.metrics?.[name]?.percentile ?? null;
}

export async function fetchPageSpeedInsights(
  url: string,
  strategy: "mobile" | "desktop"
): Promise<PageSpeedResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;

  const params = new URLSearchParams({ url, strategy });
  params.append("category", "performance");
  params.append("category", "accessibility");
  params.append("category", "best-practices");
  params.append("category", "seo");
  if (apiKey) params.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      // PSI can take 15–30s for cold pages
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    console.error(`[pagespeed] Network error for ${url} (${strategy}):`, err);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[pagespeed] PSI API ${res.status} for ${url} (${strategy}): ${body.slice(0, 200)}`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const lr = data.lighthouseResult as Record<string, unknown> | undefined;
  const cats = lr?.categories as Record<string, { score?: number }> | undefined;
  const audits = lr?.audits as Record<string, { numericValue?: number }> | undefined;

  if (!cats || !audits) {
    console.error(`[pagespeed] Unexpected PSI response shape for ${url}`);
    return null;
  }

  return {
    performance_score: score(cats.performance?.score),
    accessibility_score: score(cats.accessibility?.score),
    best_practices_score: score(cats["best-practices"]?.score),
    seo_score: score(cats.seo?.score),
    lcp: msToSec(audits["largest-contentful-paint"]?.numericValue),
    cls: audits["cumulative-layout-shift"]?.numericValue != null
      ? Math.round((audits["cumulative-layout-shift"].numericValue!) * 1000) / 1000
      : null,
    inp: audits["interaction-to-next-paint"]?.numericValue ?? fieldMetric(data, "INTERACTION_TO_NEXT_PAINT_MS"),
    fcp: msToSec(audits["first-contentful-paint"]?.numericValue),
    tti: msToSec(audits["interactive"]?.numericValue),
    raw_result: data,
    url,
    strategy,
    fetchedAt: new Date().toISOString(),
  };
}
