import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { logAudit } from "@/lib/audit";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// POST /api/sites/[id]/key — generate a new API key for a site
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const supabase = getServerClient();

  const apiKey = `eoh_${randomBytes(24).toString("hex")}`;

  const { error } = await supabase
    .from("sites")
    .update({ api_key: apiKey })
    .eq("id", siteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({ actorEmail: user.email, action: "site.key_rotate", targetType: "site", targetId: siteId, supabase });

  return NextResponse.json({ ok: true, api_key: apiKey, site_id: siteId });
}

// GET /api/sites/[id]/key — check if a key exists (returns masked key)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("sites")
    .select("api_key")
    .eq("id", siteId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const key = data?.api_key as string | null;
  return NextResponse.json({
    has_key: !!key,
    masked_key: key ? `${key.slice(0, 8)}…${key.slice(-4)}` : null,
  });
}
