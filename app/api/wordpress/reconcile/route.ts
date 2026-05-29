import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { syncWordPressFindings } from "../route";

export const runtime = "nodejs";
export const maxDuration = 60;

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Re-derive wp_updates + issues from the LATEST stored WordPress snapshot.
// Useful when a previous sync failed (or predates the sync logic) and the
// snapshot exists but no findings were created. Returns precise errors so
// failures are visible instead of being swallowed.
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  let body: { siteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { siteId } = body;
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const supabase = getServerClient();

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, name")
    .eq("id", siteId)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found", detail: siteError?.message }, { status: 404 });
  }

  const { data: snapshot, error: snapError } = await supabase
    .from("wordpress_snapshots")
    .select("raw_payload, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (snapError || !snapshot?.raw_payload) {
    return NextResponse.json(
      { error: "No WordPress snapshot found for this site. The plugin has not synced yet.", detail: snapError?.message },
      { status: 404 },
    );
  }

  try {
    const findings = await syncWordPressFindings(
      supabase,
      { id: site.id, name: site.name },
      snapshot.raw_payload as Record<string, unknown>,
    );
    console.log(
      `[EOH] reconcile ${site.id}: updatesQueued=${findings.updatesQueued} issuesCreated=${findings.issuesCreated} ` +
      `(snapshot ${snapshot.created_at}, plugins in payload=${Array.isArray((snapshot.raw_payload as Record<string, unknown>)?.plugin_data) ? ((snapshot.raw_payload as Record<string, unknown>).plugin_data as unknown[]).length : "n/a"})`,
    );
    return NextResponse.json({
      ok: true,
      message: "WordPress findings reconciled from latest snapshot",
      snapshotAt: snapshot.created_at,
      ...findings,
    });
  } catch (err) {
    // Surface the real error instead of swallowing it.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EOH] reconcile failed:", message);
    return NextResponse.json(
      { ok: false, error: "Reconcile failed while writing findings", detail: message },
      { status: 500 },
    );
  }
}
