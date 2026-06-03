import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Team-action audit log helper (Phase 4). Best-effort: never throws into the
// caller — auditing must not break the action it records.

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logAudit(params: {
  actorEmail: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  supabase?: SupabaseClient; // reuse an existing client when available
}): Promise<void> {
  try {
    const supabase = params.supabase ?? client();
    if (!supabase) return;
    await supabase.from("audit_log").insert({
      actor_email: params.actorEmail,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      detail: params.detail ?? {},
    });
  } catch (err) {
    console.error("[audit] failed to write audit entry:", err);
  }
}
