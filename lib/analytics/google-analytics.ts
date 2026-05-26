import { getGoogleAccessToken } from './google-auth';

export interface GAMetrics {
  sessions: number;
  users: number;
  newUsers: number;
  engagementRate: number;
  avgEngagementTimeSec: number;
  pageviews: number;
  topPages: Array<{ path: string; sessions: number }>;
  channels: Array<{ name: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number; pct: number }>;
  topCountries: Array<{ country: string; sessions: number }>;
  previousPeriod: { sessions: number; users: number; pageviews: number } | null;
  fetchedAt: string;
}

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

async function runReport(propertyId: string, token: string, body: object): Promise<unknown> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`GA API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractMetricValue(row: unknown, index: number): number {
  const r = row as { metricValues?: Array<{ value?: string }> };
  return parseFloat(r.metricValues?.[index]?.value ?? '0') || 0;
}

function extractDimensionValue(row: unknown, index: number): string {
  const r = row as { dimensionValues?: Array<{ value?: string }> };
  return r.dimensionValues?.[index]?.value ?? '';
}

export async function fetchGAMetrics(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<GAMetrics | null> {
  const token = await getGoogleAccessToken([GA_SCOPE]);
  if (!token) return null;

  try {
    // Primary metrics report
    const mainReport = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }, { startDate: 'daysAgo28', endDate: 'daysAgo28' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
    }) as { rows?: unknown[] };

    const currentRow = mainReport.rows?.[0];
    const prevRow = mainReport.rows?.[1];

    // Top pages
    const pagesReport = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }) as { rows?: unknown[] };

    // Channels
    const channelsReport = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }) as { rows?: unknown[] };

    // Devices
    const devicesReport = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
    }) as { rows?: unknown[] };

    // Countries
    const countriesReport = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    }) as { rows?: unknown[] };

    const sessions = extractMetricValue(currentRow, 0);
    const users = extractMetricValue(currentRow, 1);
    const newUsers = extractMetricValue(currentRow, 2);
    const engagementRate = extractMetricValue(currentRow, 3);
    const avgEngagementTimeSec = extractMetricValue(currentRow, 4);
    const pageviews = extractMetricValue(currentRow, 5);

    const totalDeviceSessions = (devicesReport.rows || []).reduce(
      (sum: number, r) => sum + extractMetricValue(r, 0),
      0,
    );

    return {
      sessions: Math.round(sessions),
      users: Math.round(users),
      newUsers: Math.round(newUsers),
      engagementRate: Math.round(engagementRate * 1000) / 10,
      avgEngagementTimeSec: Math.round(avgEngagementTimeSec),
      pageviews: Math.round(pageviews),
      topPages: (pagesReport.rows || []).map((r) => ({
        path: extractDimensionValue(r, 0),
        sessions: Math.round(extractMetricValue(r, 0)),
      })),
      channels: (channelsReport.rows || []).map((r) => ({
        name: extractDimensionValue(r, 0),
        sessions: Math.round(extractMetricValue(r, 0)),
      })),
      devices: (devicesReport.rows || []).map((r) => {
        const s = Math.round(extractMetricValue(r, 0));
        return {
          device: extractDimensionValue(r, 0),
          sessions: s,
          pct: totalDeviceSessions > 0 ? Math.round((s / totalDeviceSessions) * 100) : 0,
        };
      }),
      topCountries: (countriesReport.rows || []).map((r) => ({
        country: extractDimensionValue(r, 0),
        sessions: Math.round(extractMetricValue(r, 0)),
      })),
      previousPeriod: prevRow
        ? {
            sessions: Math.round(extractMetricValue(prevRow, 0)),
            users: Math.round(extractMetricValue(prevRow, 1)),
            pageviews: Math.round(extractMetricValue(prevRow, 5)),
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[ga] Fetch error:', err);
    return null;
  }
}
