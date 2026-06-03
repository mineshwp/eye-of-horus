import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ai, isAIConfigured } from "@/lib/ai/claude";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";
import { extractOpportunities } from "@/lib/performance/opportunities";

export const runtime = "nodejs";
export const maxDuration = 45;

// POST /api/ai/improvement-plan { siteId } — a structured, prioritised monthly
// improvement plan synthesised from all the signals we already collect.
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { siteId } = (await request.json().catch(() => ({}))) as { siteId?: string };
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });
  if (!isAIConfigured()) return NextResponse.json({ plan: null, reason: "ANTHROPIC_API_KEY not configured" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ plan: null });
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const [siteRes, issuesRes, perfRes, seoRes, a11yRes, sessRes, lcpRes] = await Promise.all([
    supabase.from("sites").select("name, url, health").eq("id", siteId).single(),
    supabase.from("issues").select("title, severity, category").eq("site_id", siteId).in("status", ["New", "Investigating", "In Progress"]).limit(20),
    supabase.from("performance_metrics").select("performance_score, raw_result").eq("site_id", siteId).eq("device", "mobile").not("raw_result", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("seo_audits").select("score, broken_links_count, missing_titles, has_sitemap").eq("site_id", siteId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("playwright_checks").select("a11y_serious_count").eq("site_id", siteId).gt("a11y_violation_count", 0).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rum_sessions").select("*", { count: "exact", head: true }).eq("site_id", siteId).gte("started_at", since30),
    supabase.from("rum_vitals").select("value").eq("site_id", siteId).eq("metric", "LCP").gte("created_at", since30).limit(5000),
  ]);

  const site = siteRes.data;
  const issues = issuesRes.data ?? [];
  const opps = perfRes.data ? extractOpportunities(perfRes.data.raw_result).slice(0, 6) : [];
  const seo = seoRes.data;
  const a11ySerious = a11yRes.data?.a11y_serious_count ?? 0;
  const sessions = sessRes.count ?? 0;
  const lcpVals = (lcpRes.data ?? []).map((r) => Number((r as { value: number }).value)).filter((n) => isFinite(n)).sort((a, b) => a - b);
  const fieldLcp = lcpVals.length ? lcpVals[Math.max(0, Math.ceil(0.75 * lcpVals.length) - 1)] : null;

  const issueCounts = issues.reduce((m: Record<string, number>, i) => { m[i.severity] = (m[i.severity] ?? 0) + 1; return m; }, {});

  const prompt = `Build a prioritised monthly improvement plan for this website. Group recommendations under three headings — "Quick wins" (low effort), "Medium effort", and "High impact" — and for each item state the expected benefit. Weight by traffic where relevant. Be specific and practical.

SITE: ${site?.name ?? "Unknown"} (${site?.url ?? ""})
Health score: ${site?.health ?? "n/a"}/100
Real-user sessions (30d): ${sessions}
Field LCP p75 (real users): ${fieldLcp != null ? (fieldLcp / 1000).toFixed(2) + "s" : "no data"}
Mobile performance score (lab): ${perfRes.data?.performance_score ?? "n/a"}/100
SEO crawl score: ${seo?.score ?? "n/a"}/100 — broken links: ${seo?.broken_links_count ?? "n/a"}, missing titles: ${seo?.missing_titles ?? "n/a"}, sitemap: ${seo?.has_sitemap === false ? "missing" : "present"}
Serious accessibility violations: ${a11ySerious}
Open issues: ${issues.length} (critical ${issueCounts.critical ?? 0}, high ${issueCounts.high ?? 0})
Top open issues:
${issues.slice(0, 6).map((i) => `- [${i.severity}] ${i.category}: ${i.title}`).join("\n") || "- None"}
Top performance opportunities (mobile, est. savings):
${opps.map((o) => `- ${o.label}${o.savingsMs ? ` (~${Math.round(o.savingsMs)}ms)` : ""}${o.displayValue ? ` — ${o.displayValue}` : ""}`).join("\n") || "- None recorded"}

Return concise Markdown with the three headings and short bullet items.`;

  const result = await ai(prompt, { model: "strategic", maxTokens: 1100 });

  if (result?.text) {
    try {
      await supabase.from("ai_messages").insert({
        site_id: siteId,
        message_type: "improvement_plan",
        answer: result.text,
        model: result.model,
        tokens_used: result.inputTokens + result.outputTokens,
        context: { health: site?.health, openIssues: issues.length, sessions },
      });
    } catch { /* message_type CHECK or other insert issue — non-fatal */ }
  }

  return NextResponse.json({ plan: result?.text ?? null, generatedAt: new Date().toISOString() });
}
