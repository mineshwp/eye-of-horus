import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { extractOpportunities } from "@/lib/performance/opportunities";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET /api/performance/opportunities?siteId= — parsed optimization opportunities
// from the latest stored Lighthouse result, per device.
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const supabase = getServerClient();

  // Latest row per device that actually carries a raw_result.
  const latest = async (device: string) => {
    const { data } = await supabase
      .from("performance_metrics")
      .select("raw_result, created_at")
      .eq("site_id", siteId)
      .eq("device", device)
      .not("raw_result", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  };

  const [mobile, desktop] = await Promise.all([latest("mobile"), latest("desktop")]);

  return NextResponse.json({
    mobile: {
      opportunities: mobile ? extractOpportunities(mobile.raw_result) : [],
      fetchedAt: mobile?.created_at ?? null,
    },
    desktop: {
      opportunities: desktop ? extractOpportunities(desktop.raw_result) : [],
      fetchedAt: desktop?.created_at ?? null,
    },
  });
}
