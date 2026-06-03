import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const DEFAULTS = {
  currency: "ZAR",
  conversion_type: "leads",
  avg_conversion_value: 0,
  monthly_ad_spend: 0,
  monthly_retainer: 0,
  target_conversion_rate: 0,
  qualified_leads: 0,
  campaigns: [] as unknown[],
  competitors: [] as unknown[],
  notes: null as string | null,
};

// GET /api/sites/[id]/business — current inputs (defaults if none saved yet)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const supabase = getServerClient();
  const { data } = await supabase.from("business_inputs").select("*").eq("site_id", siteId).maybeSingle();
  return NextResponse.json({ business: data ?? { site_id: siteId, ...DEFAULTS } });
}

// POST /api/sites/[id]/business — upsert inputs
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const body = await req.json().catch(() => ({}));

  const num = (v: unknown, def = 0) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(n) && n >= 0 ? n : def;
  };

  const row = {
    site_id: siteId,
    currency: typeof body.currency === "string" ? body.currency.slice(0, 8) : "ZAR",
    conversion_type: body.conversion_type === "sales" ? "sales" : "leads",
    avg_conversion_value: num(body.avg_conversion_value),
    monthly_ad_spend: num(body.monthly_ad_spend),
    monthly_retainer: num(body.monthly_retainer),
    target_conversion_rate: num(body.target_conversion_rate),
    qualified_leads: Math.round(num(body.qualified_leads)),
    campaigns: Array.isArray(body.campaigns) ? body.campaigns.slice(0, 50) : [],
    competitors: Array.isArray(body.competitors) ? body.competitors.slice(0, 25) : [],
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = getServerClient();
  const { data, error } = await supabase.from("business_inputs").upsert(row, { onConflict: "site_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ actorEmail: user.email, action: "business.update", targetType: "site", targetId: siteId, supabase });

  return NextResponse.json({ ok: true, business: data });
}
