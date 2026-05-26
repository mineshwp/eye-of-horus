export interface ClarityMetrics {
  totalSessions: number;
  totalPageViews: number;
  engagementTime: number;
  activeTime: number;
  scrollDepth: number;
  rageClicks: number;
  deadClicks: number;
  quickBacks: number;
  excessiveScrolls: number;
  jsErrors: number;
  popularPages: Array<{ url: string; sessions: number; scrollDepth: number }>;
  fetchedAt: string;
}

export async function fetchClarityMetrics(
  projectId: string,
  apiKey: string,
): Promise<ClarityMetrics | null> {
  if (!projectId || !apiKey) return null;

  try {
    const res = await fetch(
      `https://api.clarity.ms/v1/projects/${projectId}/dashboard`,
      { headers: { apiKey } },
    );

    if (!res.ok) {
      console.error('[clarity] API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json() as Record<string, unknown>;

    // Clarity API structure varies by version — map common fields defensively
    return {
      totalSessions: Number(data.totalSessions ?? data.sessions ?? 0),
      totalPageViews: Number(data.totalPageViews ?? data.pageViews ?? 0),
      engagementTime: Number(data.engagementTime ?? data.activeTime ?? 0),
      activeTime: Number(data.activeTime ?? 0),
      scrollDepth: Number(data.scrollDepth ?? data.averageScrollDepth ?? 0),
      rageClicks: Number(data.rageClicks ?? 0),
      deadClicks: Number(data.deadClicks ?? 0),
      quickBacks: Number(data.quickBacks ?? 0),
      excessiveScrolls: Number(data.excessiveScrolls ?? 0),
      jsErrors: Number(data.jsErrors ?? data.javascriptErrors ?? 0),
      popularPages: [],
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[clarity] Fetch error:', err);
    return null;
  }
}
