import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const CONSENT_MODES = ["on", "opt-in", "opt-out"];

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function scriptUrl(req: NextRequest) {
  return `${process.env.APP_URL || req.nextUrl.origin}/eoh-rum.js`;
}

// GET /api/sites/[id]/rum — tracking id, enabled flag, and the embed snippet.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("sites")
    .select("tracking_id, rum_enabled, rum_consent_mode, rum_respect_dnt")
    .eq("id", siteId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trackingId = (data?.tracking_id as string | null) ?? null;
  return NextResponse.json({
    tracking_id: trackingId,
    enabled: data?.rum_enabled === true,
    consent_mode: (data?.rum_consent_mode as string) || "on",
    respect_dnt: data?.rum_respect_dnt !== false,
    script_url: scriptUrl(req),
    snippet: trackingId
      ? `<script src="${scriptUrl(req)}" data-eoh="${trackingId}" defer></script>`
      : null,
  });
}

// POST /api/sites/[id]/rum — toggle collection on/off. Body: { enabled: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const { id: siteId } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.rum_enabled = body.enabled;
  if (typeof body.consentMode === "string" && CONSENT_MODES.includes(body.consentMode)) updates.rum_consent_mode = body.consentMode;
  if (typeof body.respectDnt === "boolean") updates.rum_respect_dnt = body.respectDnt;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("sites")
    .update(updates)
    .eq("id", siteId)
    .select("tracking_id, rum_enabled, rum_consent_mode, rum_respect_dnt")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ actorEmail: user.email, action: "rum.update", targetType: "site", targetId: siteId, detail: updates, supabase });

  const trackingId = (data?.tracking_id as string | null) ?? null;
  return NextResponse.json({
    ok: true,
    enabled: data?.rum_enabled === true,
    consent_mode: (data?.rum_consent_mode as string) || "on",
    respect_dnt: data?.rum_respect_dnt !== false,
    tracking_id: trackingId,
    snippet: trackingId
      ? `<script src="${scriptUrl(req)}" data-eoh="${trackingId}" defer></script>`
      : null,
  });
}
