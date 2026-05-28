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

// fetchClarityMetrics performs one aggregate request and one URL-dimension request.
export const CLARITY_API_CALLS_PER_SYNC = 2;

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

// Normalise response — Clarity may return an object, an array, or wrap in { data: [...] }
function normalise(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    // Wrapped in { data: [...] } or { metrics: {...} }
    if (Array.isArray(r.data)) return (r.data as unknown[])[0] as Record<string, unknown> ?? null;
    if (Array.isArray(r.metrics)) return (r.metrics as unknown[])[0] as Record<string, unknown> ?? null;
    if (typeof r.metrics === 'object' && r.metrics !== null) return r.metrics as Record<string, unknown>;
    return r;
  }
  return null;
}

export async function fetchClarityMetrics(
  projectId: string,
  apiKey: string,
  endpointUrl: string = DEFAULT_CLARITY_ENDPOINT_URL,
): Promise<ClarityMetrics | null> {
  if (!projectId || !apiKey) return null;
  try {
    // Site-level aggregate (1 of 10 daily calls)
    const raw = await clarityFetch(endpointUrl, apiKey);
    const data = normalise(raw);
    if (!data) return null;

    // Per-page breakdown (2 of 10 daily calls)
    const pageRaw = await clarityFetch(endpointUrl, apiKey, { dimension1: 'URL' });
    const popularPages: Array<{ url: string; sessions: number; scrollDepth: number }> = [];

    if (pageRaw) {
      // Page data may come back as array or wrapped
      const pageNorm = normalise(pageRaw);
      const records: Array<Record<string, unknown>> = Array.isArray(pageRaw)
        ? (pageRaw as Array<Record<string, unknown>>)
        : Array.isArray((pageRaw as Record<string, unknown>)?.data)
          ? ((pageRaw as Record<string, unknown>).data as Array<Record<string, unknown>>)
          : pageNorm ? [pageNorm] : [];

      for (const r of records.slice(0, 10)) {
        const dims = r.dimensions as Record<string, unknown> | undefined;
        popularPages.push({
          url: String(dims?.url ?? dims?.URL ?? r.url ?? r.URL ?? r.pageUrl ?? r.PageUrl ?? ''),
          sessions: pick(r, 'sessionCount', 'Sessions', 'sessions', 'totalSessionCount'),
          scrollDepth: pick(r, 'averageScrollDepth', 'AverageScrollDepth', 'scrollDepth', 'ScrollDepth'),
        });
      }
    }

    return {
      // Official field names from Clarity Data Export API docs (camelCase)
      totalSessions:    pick(data, 'sessionCount',           'Sessions',           'totalSessionCount',   'sessions'),
      botSessions:      pick(data, 'botSessionCount',        'BotSessionCount',    'botSessions'),
      distinctUsers:    pick(data, 'distinctUsers',          'DistinctUsers',      'distantUserCount'),   // Clarity has a typo in some versions
      pagesPerSession:  pick(data, 'pagesPerSession',        'PagesPerSession'),
      totalPageViews:   pick(data, 'pageViewCount',          'PageViewCount',      'totalPageViews',      'pageViews'),
      engagementTime:   pick(data, 'averageEngagementTime',  'AverageEngagementTime', 'engagementTime'),
      activeTime:       pick(data, 'activeTime',             'ActiveTime'),
      scrollDepth:      pick(data, 'averageScrollDepth',     'AverageScrollDepth', 'scrollDepth'),
      rageClicks:       pick(data, 'rageClickCount',         'RageClickCount',     'rageClicks'),
      deadClicks:       pick(data, 'deadClickCount',         'DeadClickCount',     'deadClicks'),
      quickBacks:       pick(data, 'quickBackCount',         'QuickBackCount',     'quickBacks'),
      excessiveScrolls: pick(data, 'excessiveScrollCount',   'ExcessiveScrollCount', 'excessiveScrolls'),
      errorClicks:      pick(data, 'errorClickCount',        'ErrorClickCount',    'errorClicks'),
      jsErrors:         pick(data, 'jsErrors',               'JsErrors',           'javascriptErrors'),
      popularPages,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[clarity] Fetch error:', err);
    return null;
  }
}
