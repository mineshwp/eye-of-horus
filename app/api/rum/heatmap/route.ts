import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const CLICK_TYPES = ["click", "cta", "outbound", "download"];
const CAP = 4000;

// GET /api/rum/heatmap?siteId=[&path=]
//  - without path: returns the pages that have click data (top by volume)
//  - with path: returns click points (x/y %) + the latest Watchtower screenshot
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const siteId = request.nextUrl.searchParams.get("siteId");
  const path = request.nextUrl.searchParams.get("path");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const supabase = getServerClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data } = await supabase
    .from("rum_events")
    .select("type, path, meta")
    .eq("site_id", siteId)
    .in("type", CLICK_TYPES)
    .gte("created_at", since)
    .limit(CAP);

  const events = (data ?? []) as Array<{ path: string | null; meta: { x?: number; y?: number } | null }>;

  // Pages with click data (strip query strings so paths group cleanly).
  const pageCounts = new Map<string, number>();
  for (const e of events) {
    if (!e.path) continue;
    const p = e.path.split("?")[0];
    pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
  }
  const pages = Array.from(pageCounts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  if (!path) return NextResponse.json({ pages });

  const points = events
    .filter((e) => (e.path?.split("?")[0] ?? "") === path && e.meta && typeof e.meta.x === "number" && typeof e.meta.y === "number")
    .map((e) => ({ x: e.meta!.x as number, y: e.meta!.y as number }))
    .slice(0, 1500);

  // Latest Watchtower (desktop) screenshot for this page, to use as a backdrop.
  const { data: shot } = await supabase
    .from("playwright_checks")
    .select("screenshot_url")
    .eq("site_id", siteId)
    .eq("page_path", path)
    .eq("device", "desktop")
    .not("screenshot_url", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ pages, path, points, screenshotUrl: shot?.screenshot_url ?? null });
}
