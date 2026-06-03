export interface ClarityMetrics {
  totalSessions: number;
  botSessions: number;
  distinctUsers: number;
  pagesPerSession: number;
  totalPageViews: number;
  engagementTime: number;
  activeTime: number;
  scrollDepth: number;
  rageClicks: number;
  deadClicks: number;
  quickBacks: number;
  excessiveScrolls: number;
  errorClicks: number;
  jsErrors: number;
  popularPages: Array<{ url: string; sessions: number; scrollDepth: number }>;
  fetchedAt: string;
}

export const DEFAULT_CLARITY_ENDPOINT_URL =
  'https://www.clarity.ms/export-data/api/v1/project-live-insights';

// fetchClarityMetrics performs a single aggregate request — the response already
// contains every metric we display (incl. PopularPages), so no extra call is needed.
export const CLARITY_API_CALLS_PER_SYNC = 1;

export class ClarityApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClarityApiError';
    this.status = status;
  }
}

// Clarity Data Export API
// Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// Endpoint: GET https://www.clarity.ms/export-data/api/v1/project-live-insights
// Auth:     Authorization: Bearer <token>  (Clarity → Settings → Data Export)
// Limit:    10 requests per project per day — be conservative

async function clarityFetch(
  endpointUrl: string,
  token: string,
  extraParams: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(endpointUrl || DEFAULT_CLARITY_ENDPOINT_URL);
  url.searchParams.set('numOfDays', '1');
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[clarity] API ${res.status}: ${body.slice(0, 300)}`);
    const message =
      res.status === 429
        ? 'Microsoft Clarity daily API limit reached. Try again tomorrow.'
        : body || `Microsoft Clarity API returned ${res.status}`;
    throw new ClarityApiError(res.status, message);
  }
  const data = await res.json();
  // Log raw response once so we can see real field names
  console.log('[clarity] Raw API response:', JSON.stringify(data).slice(0, 1000));
  return data;
}

// Pick a value trying multiple possible key names (API uses inconsistent casing)
function pick(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return Number(obj[k]);
  }
  return 0;
}

// The Clarity Data Export API returns an array of metric objects, each shaped like
// { metricName: "RageClickCount", information: [ { subTotal, sessionsCount, ... } ] }.
// Build a lookup keyed by lower-cased metricName so we can read each metric's rows.
function buildMetricMap(raw: unknown): Map<string, Array<Record<string, unknown>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  // Tolerate { data: [...] } / { metrics: [...] } wrappers in case the API changes.
  let arr: unknown = raw;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    arr = Array.isArray(r.data) ? r.data : Array.isArray(r.metrics) ? r.metrics : raw;
  }
  if (!Array.isArray(arr)) return map;
  for (const m of arr) {
    if (m && typeof m === 'object') {
      const entry = m as Record<string, unknown>;
      if (typeof entry.metricName === 'string' && Array.isArray(entry.information)) {
        map.set(entry.metricName.toLowerCase(), entry.information as Array<Record<string, unknown>>);
      }
    }
  }
  return map;
}

export async function fetchClarityMetrics(
  projectId: string,
  apiKey: string,
  endpointUrl: string = DEFAULT_CLARITY_ENDPOINT_URL,
): Promise<ClarityMetrics | null> {
  if (!projectId || !apiKey) return null;
  try {
    // Single site-level aggregate call (1 of 10 daily calls).
    const raw = await clarityFetch(endpointUrl, apiKey);
    const metrics = buildMetricMap(raw);
    if (metrics.size === 0) return null;

    // First information row for a metric (most metrics return a single aggregate row).
    const first = (name: string): Record<string, unknown> => metrics.get(name.toLowerCase())?.[0] ?? {};
    // Frustration signals expose their count under "subTotal".
    const subTotal = (name: string): number => pick(first(name), 'subTotal', 'sessionsCount');

    const traffic = first('Traffic');
    const engagement = first('EngagementTime');
    const scroll = first('ScrollDepth');

    // PopularPages is included in the aggregate response (no separate URL-dimension call needed).
    const popularPages = (metrics.get('popularpages') ?? []).slice(0, 10).map((p) => ({
      url: String(p.name ?? p.url ?? p.URL ?? ''),
      sessions: pick(p, 'sessionsCount', 'Sessions', 'sessionCount'),
      scrollDepth: pick(p, 'averageScrollDepth', 'scrollDepth'),
    }));

    return {
      totalSessions:    pick(traffic, 'totalSessionCount', 'sessionCount', 'Sessions'),
      botSessions:      pick(traffic, 'totalBotSessionCount', 'botSessionCount'),
      distinctUsers:    pick(traffic, 'distinctUserCount', 'distantUserCount', 'distinctUsers'),
      pagesPerSession:  pick(traffic, 'pagesPerSessionPercentage', 'PagesPerSessionPercentage', 'pagesPerSession'),
      totalPageViews:   pick(traffic, 'pageViewCount', 'totalPageViews', 'pageViews'),
      engagementTime:   pick(engagement, 'totalTime', 'averageEngagementTime', 'engagementTime'),
      activeTime:       pick(engagement, 'activeTime'),
      scrollDepth:      pick(scroll, 'averageScrollDepth', 'scrollDepth'),
      rageClicks:       subTotal('RageClickCount'),
      deadClicks:       subTotal('DeadClickCount'),
      quickBacks:       subTotal('QuickbackClick'),
      excessiveScrolls: subTotal('ExcessiveScroll'),
      errorClicks:      subTotal('ErrorClickCount'),
      jsErrors:         subTotal('ScriptErrorCount'),
      popularPages,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[clarity] Fetch error:', err);
    return null;
  }
}
