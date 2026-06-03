import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Broken-journey detection from real-user sessions (Phase 3).
// Finds steps where a large share of multi-page visits drop off, and logs them
// as Issues (category "UX journey") so they flow into the normal workflow.

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const LOOKBACK_DAYS = 30;
const MIN_MULTIPAGE_SESSIONS = 20; // need enough volume to be meaningful
const MIN_DROPOFFS = 10;
const DROPOFF_SHARE = 0.4; // ≥40% of multi-page visits ending on one page
const ROW_CAP = 5000;

export interface JourneyFinding {
  siteId: string;
  siteName: string;
  path: string;
  dropoffs: number;
  total: number;
  pct: number;
  issueCreated: boolean;
}

export async function detectBrokenJourneys(): Promise<{ sitesChecked: number; findings: JourneyFinding[]; issuesCreated: number }> {
  const supabase = getServerClient();
  if (!supabase) return { sitesChecked: 0, findings: [], issuesCreated: 0 };

  const { data: sites } = await supabase.from("sites").select("id, name").eq("status", "active");
  if (!sites || sites.length === 0) return { sitesChecked: 0, findings: [], issuesCreated: 0 };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const findings: JourneyFinding[] = [];
  let issuesCreated = 0;

  for (const site of sites as Array<{ id: string; name: string }>) {
    const { data: sessions } = await supabase
      .from("rum_sessions")
      .select("exit_path, pageviews")
      .eq("site_id", site.id)
      .gte("started_at", since)
      .limit(ROW_CAP);

    const multiPage = (sessions ?? []).filter((s) => (s.pageviews ?? 1) >= 2 && s.exit_path);
    if (multiPage.length < MIN_MULTIPAGE_SESSIONS) continue;

    // Count drop-offs per exit path (ignore the homepage — leaving from home is normal).
    const exits = new Map<string, number>();
    for (const s of multiPage) {
      const p = s.exit_path as string;
      if (p === "/" || p === "") continue;
      exits.set(p, (exits.get(p) ?? 0) + 1);
    }

    for (const [path, dropoffs] of exits.entries()) {
      const pct = Math.round((dropoffs / multiPage.length) * 100);
      if (dropoffs < MIN_DROPOFFS || dropoffs / multiPage.length < DROPOFF_SHARE) continue;

      const title = `Users frequently drop off at ${path}`;
      const { data: existing } = await supabase
        .from("issues")
        .select("id")
        .eq("site_id", site.id)
        .eq("title", title)
        .in("status", ["New", "Investigating", "In Progress"])
        .limit(1);

      let created = false;
      if (!existing || existing.length === 0) {
        await supabase.from("issues").insert([{
          id: `journey-${randomUUID().slice(0, 8)}`,
          site_id: site.id,
          title,
          severity: "medium",
          impact: `${dropoffs} of ${multiPage.length} multi-page visits (${pct}%) ended on this page — a likely drop-off point in the user journey`,
          category: "UX journey",
          page: path,
          recommended: "Review this step for confusing UX, errors, slow load, or a missing next-step CTA. Compare against analytics and session signals.",
          owner: "Unassigned",
          status: "New",
          detected: new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
          change_type: "Real-user journey analysis",
          confidence: 80,
          evidence: { dropoffs, total: multiPage.length, pct, lookbackDays: LOOKBACK_DAYS },
        }]);
        created = true;
        issuesCreated++;
      }

      findings.push({ siteId: site.id, siteName: site.name, path, dropoffs, total: multiPage.length, pct, issueCreated: created });
    }

    // Keep the site's open_issues count fresh after any inserts.
    if (findings.some((f) => f.siteId === site.id && f.issueCreated)) {
      const { count } = await supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .eq("site_id", site.id)
        .in("status", ["New", "Investigating", "In Progress"]);
      if (count !== null) await supabase.from("sites").update({ open_issues: count }).eq("id", site.id);
    }
  }

  return { sitesChecked: sites.length, findings, issuesCreated };
}

// High-traffic 404 detection (Phase 5 item #5).
// A browser can't read its own HTTP status, so RUM alone can't spot a 404.
// Instead we cross-reference: pages the SEO crawler found returning 4xx (internal
// broken links) that are ALSO receiving real-user traffic. That overlap is a
// high-traffic 404 worth fixing/redirecting.

const MIN_404_TRAFFIC = 5; // RUM hits in the window before we flag it

export async function detectHighTraffic404s(): Promise<{ sitesChecked: number; issuesCreated: number }> {
  const supabase = getServerClient();
  if (!supabase) return { sitesChecked: 0, issuesCreated: 0 };

  const { data: sites } = await supabase.from("sites").select("id, name").eq("status", "active");
  if (!sites || sites.length === 0) return { sitesChecked: 0, issuesCreated: 0 };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let issuesCreated = 0;

  for (const site of sites as Array<{ id: string; name: string }>) {
    // Most recent SEO audit's internal 4xx links.
    const { data: audit } = await supabase
      .from("seo_audits")
      .select("id")
      .eq("site_id", site.id)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!audit) continue;

    const { data: broken } = await supabase
      .from("broken_links")
      .select("url, status, is_internal")
      .eq("audit_id", audit.id)
      .eq("is_internal", true)
      .gte("status", 400)
      .limit(30);
    if (!broken || broken.length === 0) continue;

    for (const b of broken as Array<{ url: string; status: number }>) {
      let path: string;
      try { path = new URL(b.url).pathname; } catch { continue; }
      if (!path || path === "/") continue;

      // How much real-user traffic is hitting this broken path?
      const { count } = await supabase
        .from("rum_events")
        .select("*", { count: "exact", head: true })
        .eq("site_id", site.id)
        .gte("created_at", since)
        .like("path", `${path}%`);
      if ((count ?? 0) < MIN_404_TRAFFIC) continue;

      const title = `High-traffic ${b.status} page: ${path}`;
      const { data: existing } = await supabase
        .from("issues")
        .select("id")
        .eq("site_id", site.id)
        .eq("title", title)
        .in("status", ["New", "Investigating", "In Progress"])
        .limit(1);
      if (existing && existing.length > 0) continue;

      await supabase.from("issues").insert([{
        id: `404-${randomUUID().slice(0, 8)}`,
        site_id: site.id,
        title,
        severity: "high",
        impact: `${count} real-user hits in the last ${LOOKBACK_DAYS} days landed on a page returning HTTP ${b.status} — lost visitors and wasted ad/SEO value`,
        category: "SEO Audit",
        page: path,
        recommended: "Restore the page or add a 301 redirect to the most relevant live URL, then update any internal links pointing to it.",
        owner: "Unassigned",
        status: "New",
        detected: new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        change_type: "High-traffic 404",
        confidence: 90,
        evidence: { url: b.url, status: b.status, rumHits: count, lookbackDays: LOOKBACK_DAYS },
      }]);
      issuesCreated++;
    }

    if (issuesCreated > 0) {
      const { count: openCount } = await supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .eq("site_id", site.id)
        .in("status", ["New", "Investigating", "In Progress"]);
      if (openCount !== null) await supabase.from("sites").update({ open_issues: openCount }).eq("id", site.id);
    }
  }

  return { sitesChecked: sites.length, issuesCreated };
}
