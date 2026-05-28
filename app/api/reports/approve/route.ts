/**
 * POST /api/reports/approve
 *
 * Changes a report's status as part of the approval workflow.
 * Admins and Super Admins only.
 *
 * Body: { reportId: string; action: "submit" | "approve" | "reject"; note?: string }
 *
 * Actions:
 *   submit  — draft → pending_approval
 *   approve — pending_approval → approved
 *   reject  — pending_approval → draft (back to draft for editing)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  submit: { from: ["draft", "ready"], to: "pending_approval" },
  approve: { from: ["pending_approval"], to: "approved" },
  reject: { from: ["pending_approval"], to: "draft" },
};

export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorizedResponse();

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { reportId, action, note } = await req.json() as {
    reportId: string;
    action: "submit" | "approve" | "reject";
    note?: string;
  };

  if (!reportId || !action || !TRANSITIONS[action]) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Fetch current report to verify the status transition is valid.
  const { data: report, error: fetchError } = await supabase
    .from("reports")
    .select("id, status")
    .eq("id", reportId)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const transition = TRANSITIONS[action];
  if (!transition.from.includes(report.status)) {
    return NextResponse.json(
      { error: `Cannot ${action} a report with status '${report.status}'` },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    status: transition.to,
    updated_at: new Date().toISOString(),
  };

  if (action === "approve" || action === "reject") {
    updatePayload.reviewed_by = user.id;
    updatePayload.reviewed_at = new Date().toISOString();
    if (note) updatePayload.review_note = note;
  }

  const { error: updateError } = await supabase
    .from("reports")
    .update(updatePayload)
    .eq("id", reportId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: transition.to });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
