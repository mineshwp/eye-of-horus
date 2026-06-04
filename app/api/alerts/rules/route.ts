import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const VALID_SEVERITY = ["critical", "high", "medium", "info"];

// GET /api/alerts/rules — list all alert rules (built-in + custom)
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ rules: [], reason: "Supabase not configured" });

  const { data, error } = await supabase
    .from("alert_rules")
    .select("id, severity, trigger, channels, template, enabled, is_builtin, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

// POST /api/alerts/rules — create a custom rule
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const severity = typeof body.severity === "string" ? body.severity.toLowerCase() : "";
  const trigger = typeof body.trigger === "string" ? body.trigger.trim() : "";
  const channels = typeof body.channels === "string" ? body.channels.trim() : "";
  const template = typeof body.template === "string" ? body.template : null;

  if (!VALID_SEVERITY.includes(severity)) {
    return NextResponse.json({ error: "severity must be one of critical|high|medium|info" }, { status: 400 });
  }
  if (!trigger) return NextResponse.json({ error: "trigger is required" }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("alert_rules")
    .insert({ severity, trigger, channels, template, is_builtin: false, sort_order: 100 })
    .select("id, severity, trigger, channels, template, enabled, is_builtin, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorEmail: user.email, action: "alert_rule.create", targetType: "alert_rule", targetId: data.id, detail: { severity, trigger } });
  return NextResponse.json({ ok: true, rule: data });
}

// PUT /api/alerts/rules — update an existing rule (trigger / channels / template / enabled)
export async function PUT(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.trigger === "string") updates.trigger = body.trigger.trim();
  if (typeof body.channels === "string") updates.channels = body.channels.trim();
  if (typeof body.template === "string") updates.template = body.template;
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.severity === "string" && VALID_SEVERITY.includes(body.severity.toLowerCase())) {
    updates.severity = body.severity.toLowerCase();
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("alert_rules")
    .update(updates)
    .eq("id", id)
    .select("id, severity, trigger, channels, template, enabled, is_builtin, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorEmail: user.email, action: "alert_rule.update", targetType: "alert_rule", targetId: id, detail: { keys: Object.keys(updates) } });
  return NextResponse.json({ ok: true, rule: data });
}

// DELETE /api/alerts/rules?id=... — remove a custom rule (built-in rules can only be disabled)
export async function DELETE(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: existing } = await supabase
    .from("alert_rules")
    .select("is_builtin")
    .eq("id", id)
    .maybeSingle();
  if (existing?.is_builtin) {
    return NextResponse.json({ error: "Built-in rules can be disabled but not deleted" }, { status: 400 });
  }

  const { error } = await supabase.from("alert_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorEmail: user.email, action: "alert_rule.delete", targetType: "alert_rule", targetId: id });
  return NextResponse.json({ ok: true });
}
