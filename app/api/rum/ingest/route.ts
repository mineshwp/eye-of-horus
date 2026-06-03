import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Public ingest endpoint — no auth. The site is identified by its public
// tracking_id and the request Origin is validated against the site URL.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// PII redaction — strip emails, long digit runs (phone/card/ids), and sensitive
// query-string values before anything is stored. Defence-in-depth: visitors
// shouldn't be identifiable from behavioural data.
function redact(s: string | null | undefined): string | null {
  if (s == null) return null;
  return String(s)
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b\d{10,}\b/g, "[number]")
    .replace(/([?&](?:token|key|password|pass|auth|secret|email|api[_-]?key|sig|signature|session|jwt)=)[^&#]*/gi, "$1[redacted]");
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const h = new URL(value.startsWith("http") ? value : `https://${value}`).hostname;
    return h.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface VitalIn { metric?: string; value?: number; rating?: string; path?: string; }
interface EventIn { type?: string; path?: string; target?: string | null; value?: string | null; meta?: Record<string, unknown>; }

const VALID_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);
const VALID_EVENTS = new Set(["pageview", "click", "cta", "outbound", "download", "search", "rage_click", "scroll"]);

export async function POST(request: NextRequest) {
  // Always 204 (with CORS) so the beacon never surfaces errors to visitors.
  const ok = () => new NextResponse(null, { status: 204, headers: CORS });

  let body: {
    t?: string;
    session?: { sessionId?: string; visitorId?: string; isReturning?: boolean; entryPath?: string; referrer?: string | null; source?: string; device?: string };
    exitPath?: string;
    vitals?: VitalIn[];
    events?: EventIn[];
  };
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const trackingId = typeof body.t === "string" ? body.t : null;
  if (!trackingId) return ok();

  const supabase = getServiceClient();
  if (!supabase) return ok();

  // Resolve the site from the public tracking id.
  const { data: site } = await supabase
    .from("sites")
    .select("id, url, rum_enabled")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (!site) return ok();
  if (site.rum_enabled === false) return ok();

  // Validate origin against the site URL (when an Origin/Referer is present).
  const reqHost = hostOf(request.headers.get("origin")) ?? hostOf(request.headers.get("referer"));
  const siteHost = hostOf(site.url as string);
  if (reqHost && siteHost && reqHost !== siteHost) return ok();

  const siteId = site.id as string;
  const s = body.session ?? {};
  const sessionId = typeof s.sessionId === "string" ? s.sessionId.slice(0, 64) : null;
  const nowIso = new Date().toISOString();

  // ── Session upsert (read-modify-write to increment pageviews) ──────────────
  if (sessionId) {
    const pvCount = (body.events ?? []).filter((e) => e.type === "pageview").length || 0;
    const country = request.headers.get("x-vercel-ip-country");
    const { data: existing } = await supabase
      .from("rum_sessions")
      .select("id, pageviews")
      .eq("site_id", siteId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("rum_sessions")
        .update({
          last_seen_at: nowIso,
          exit_path: redact((body.exitPath ?? "").slice(0, 300)) || null,
          pageviews: (existing.pageviews ?? 1) + pvCount,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("rum_sessions").insert({
        site_id: siteId,
        session_id: sessionId,
        visitor_id: typeof s.visitorId === "string" ? s.visitorId.slice(0, 64) : null,
        is_returning: !!s.isReturning,
        entry_path: redact((s.entryPath ?? "").slice(0, 300)) || null,
        exit_path: redact((body.exitPath ?? "").slice(0, 300)) || null,
        referrer: redact(s.referrer ? String(s.referrer).slice(0, 300) : null),
        source: s.source ? String(s.source).slice(0, 120) : null,
        device: s.device ? String(s.device).slice(0, 20) : null,
        country: country ? country.slice(0, 4) : null,
        pageviews: Math.max(1, pvCount),
        started_at: nowIso,
        last_seen_at: nowIso,
      });
    }
  }

  // ── Vitals ─────────────────────────────────────────────────────────────────
  const vitalRows = (body.vitals ?? [])
    .filter((v) => v && typeof v.metric === "string" && VALID_METRICS.has(v.metric) && typeof v.value === "number" && isFinite(v.value))
    .slice(0, 20)
    .map((v) => ({
      site_id: siteId,
      session_id: sessionId,
      path: redact((v.path ?? "").slice(0, 300)) || null,
      metric: v.metric!,
      value: v.value!,
      rating: v.rating ? String(v.rating).slice(0, 24) : null,
      device: s.device ? String(s.device).slice(0, 20) : null,
    }));
  if (vitalRows.length) await supabase.from("rum_vitals").insert(vitalRows);

  // ── Events ───────────────────────────────────────────────────────────────
  const eventRows = (body.events ?? [])
    .filter((e) => e && typeof e.type === "string" && VALID_EVENTS.has(e.type))
    .slice(0, 50)
    .map((e) => ({
      site_id: siteId,
      session_id: sessionId,
      type: e.type!,
      path: redact((e.path ?? "").slice(0, 300)) || null,
      target: redact(e.target ? String(e.target).slice(0, 400) : null),
      value: redact(e.value != null ? String(e.value).slice(0, 200) : null),
      meta: e.meta && typeof e.meta === "object" ? e.meta : {},
    }));
  if (eventRows.length) await supabase.from("rum_events").insert(eventRows);

  return ok();
}
