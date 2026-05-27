import { getGoogleAccessToken } from './google-auth';

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: GSCQuery[];
  strikingDistance: GSCQuery[];
  topPages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
  previousPeriod: { clicks: number; impressions: number } | null;
  fetchedAt: string;
}

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

async function searchAnalytics(
  siteUrl: string,
  token: string,
  body: object,
): Promise<{ rows?: unknown[]; responseAggregationType?: string }> {
  const encoded = encodeURIComponent(siteUrl);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`GSC API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function rowMetrics(row: unknown): { clicks: number; impressions: number; ctr: number; position: number } {
  const r = row as { clicks?: number; impressions?: number; ctr?: number; position?: number };
  return {
    clicks: Math.round(r.clicks ?? 0),
    impressions: Math.round(r.impressions ?? 0),
    ctr: Math.round((r.ctr ?? 0) * 10000) / 100,
    position: Math.round((r.position ?? 0) * 10) / 10,
  };
}

function rowKey(row: unknown): string {
  const r = row as { keys?: string[] };
  return r.keys?.[0] ?? '';
}

export async function fetchGSCMetrics(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GSCMetrics | null> {
  const token = await getGoogleAccessToken([GSC_SCOPE]);
  if (!token) return null;

  try {
    const dateRange = { startDate, endDate };

    // Top queries
    const queriesRes = await searchAnalytics(siteUrl, token, {
      ...dateRange,
      dimensions: ['query'],
      rowLimit: 50,
    });

    // Top pages
    const pagesRes = await searchAnalytics(siteUrl, token, {
      ...dateRange,
      dimensions: ['page'],
      rowLimit: 20,
    });

    // Overall totals
    const totalsRes = await searchAnalytics(siteUrl, token, {
      ...dateRange,
      dimensions: [],
    });

    // Previous period (same duration, prior window)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = start;
    const prevRes = await searchAnalytics(siteUrl, token, {
      startDate: prevStart.toISOString().split('T')[0],
      endDate: prevEnd.toISOString().split('T')[0],
      dimensions: [],
    }).catch(() => null);

    const totalsRow = totalsRes.rows?.[0];
    const prevRow = prevRes?.rows?.[0];
    const totals = totalsRow ? rowMetrics(totalsRow) : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    const allQueries: GSCQuery[] = (queriesRes.rows || []).map((r) => ({
      query: rowKey(r),
      ...rowMetrics(r),
    }));

    // Striking distance: positions 11–20 with decent impressions
    const strikingDistance = allQueries
      .filter((q) => q.position >= 11 && q.position <= 20 && q.impressions >= 100)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    return {
      ...totals,
      topQueries: allQueries.slice(0, 20),
      strikingDistance,
      topPages: (pagesRes.rows || []).map((r) => ({
        page: rowKey(r),
        ...rowMetrics(r),
      })),
      previousPeriod: prevRow
        ? {
            clicks: Math.round((prevRow as { clicks?: number }).clicks ?? 0),
            impressions: Math.round((prevRow as { impressions?: number }).impressions ?? 0),
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[gsc] Fetch error:', err);
    return null;
  }
}
