import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { runHttpCheck, type HttpCheckResult } from "./http";
import { runSslCheck, type SslCheckResult } from "./ssl";
import { runSeoCheck, type SeoCheckResult } from "./seo";
import { runDomainCheck, type DomainCheckResult } from "./domain";

// ─── Server-side Supabase client ─────────────────────────────────────────────
// Uses service role key so writes bypass RLS even when there's no user session.
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SiteCheckResult {
  siteId: string;
  siteName: string;
  siteUrl: string;
  httpCheck: HttpCheckResult;
  sslCheck: SslCheckResult;
  seoCheck: SeoCheckResult;
  domainCheck: DomainCheckResult;
  healthScore: number;
  status: "healthy" | "attention" | "critical";
  uptimeStatus: "up" | "down" | "degraded";
  issuesCreated: string[];
  persisted: boolean;
  checkedAt: string;
}

interface SiteRow {
  id: string;
  name: string;
  url: string;
  health: number;
  uptime: number;
  open_issues: number;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function calcHealthScore(
  http: HttpCheckResult,
  ssl: SslCheckResult,
  seo: SeoCheckResult,
  domain: DomainCheckResult,
): { score: number; issueDescriptions: Array<{ title: string; severity: "critical" | "high" | "medium"; category: string; impact: string; recommended: string }> } {
  let score = 100;
  const issueDescriptions: Array<{ title: string; severity: "critical" | "high" | "medium"; category: string; impact: string; recommended: string }> = [];

  // ── Uptime ──────────────────────────────────────────────────────────────
  if (!http.isUp) {
    score -= 50;
    issueDescriptions.push({
      title: `Site is down — ${http.error ?? `HTTP ${http.httpStatus}`}`,
      severity: "critical",
      category: "Uptime",
      impact: "Website is completely unreachable — all visitors and search crawlers affected",
      recommended: "Check hosting panel, DNS propagation, and server error logs immediately",
    });
  } else if (http.httpStatus && http.httpStatus >= 400) {
    score -= 25;
    issueDescriptions.push({
      title: `HTTP ${http.httpStatus} error on homepage`,
      severity: "high",
      category: "Uptime",
      impact: "Visitors are seeing error pages instead of website content",
      recommended: `Investigate the cause of HTTP ${http.httpStatus} responses on the server`,
    });
  }

  // ── Response time ────────────────────────────────────────────────────────
  if (http.isUp && http.responseTimeMs > 5_000) {
    score -= 15;
    issueDescriptions.push({
      title: `Very slow response time: ${http.responseTimeMs}ms`,
      severity: "high",
      category: "Performance",
      impact: "Visitors and search engines experiencing significant delays — high bounce rate risk",
      recommended: "Investigate server performance, enable caching, check for database bottlenecks",
    });
  } else if (http.isUp && http.responseTimeMs > 3_000) {
    score -= 8;
    issueDescriptions.push({
      title: `Slow response time: ${http.responseTimeMs}ms`,
      severity: "medium",
      category: "Performance",
      impact: "Page load experience degraded — may affect Core Web Vitals and Google rankings",
      recommended: "Enable server-side caching and check hosting plan resource limits",
    });
  }

  // ── SSL ──────────────────────────────────────────────────────────────────
  if (!ssl.valid && ssl.error) {
    score -= 30;
    issueDescriptions.push({
      title: `SSL certificate issue: ${ssl.error}`,
      severity: "critical",
      category: "Security",
      impact: "Browsers will show security warnings — visitors will leave immediately",
      recommended: "Renew SSL certificate and verify auto-renewal is active on the hosting account",
    });
  } else if (ssl.valid && ssl.daysRemaining !== null) {
    if (ssl.daysRemaining < 7) {
      score -= 20;
      issueDescriptions.push({
        title: `SSL certificate expires in ${ssl.daysRemaining} day${ssl.daysRemaining === 1 ? "" : "s"}`,
        severity: "critical",
        category: "Security",
        impact: "Certificate expiry imminent — site will become insecure within days",
        recommended: "Renew SSL certificate immediately. Check auto-renewal is working on the hosting panel",
      });
    } else if (ssl.daysRemaining < 30) {
      score -= 10;
      issueDescriptions.push({
        title: `SSL certificate expires in ${ssl.daysRemaining} days`,
        severity: "high",
        category: "Security",
        impact: "SSL expiry approaching — browser security warnings will appear if not renewed",
        recommended: "Renew SSL certificate before it expires. Enable auto-renewal if not already active",
      });
    }
  }

  // ── SEO ──────────────────────────────────────────────────────────────────
  if (seo.isNoindex) {
    score -= 15;
    issueDescriptions.push({
      title: "Homepage has noindex directive — not visible to search engines",
      severity: "high",
      category: "SEO",
      impact: "Google and other search engines cannot index this page — organic traffic will drop",
      recommended: "Remove the noindex meta tag from the homepage unless this is intentional",
    });
  }
  if (!seo.hasTitle) {
    score -= 5;
    issueDescriptions.push({
      title: "Missing <title> tag on homepage",
      severity: "medium",
      category: "SEO",
      impact: "Search engines and browsers cannot display a meaningful page title",
      recommended: "Add a descriptive <title> tag to the page <head>",
    });
  }
  if (!seo.hasMetaDescription) {
    score -= 3;
    // Not worth creating an issue for this — just reduce score slightly
  }

  // ── Domain expiry ────────────────────────────────────────────────────────
  if (domain.daysRemaining !== null) {
    if (domain.daysRemaining < 7) {
      score -= 25;
      issueDescriptions.push({
        title: `Domain expires in ${domain.daysRemaining} day${domain.daysRemaining === 1 ? "" : "s"} — renew immediately`,
        severity: "critical",
        category: "Domain",
        impact: "Domain expiry imminent — website and email will stop working entirely if not renewed",
        recommended: "Renew the domain immediately through your domain registrar before it expires",
      });
    } else if (domain.daysRemaining < 30) {
      score -= 10;
      issueDescriptions.push({
        title: `Domain expires in ${domain.daysRemaining} days`,
        severity: "high",
        category: "Domain",
        impact: "Domain expiry approaching — website and email will stop working if not renewed in time",
        recommended: "Renew the domain before it expires. Enable auto-renewal to prevent future lapses",
      });
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issueDescriptions,
  };
}

// ─── Main: run all checks for one site ───────────────────────────────────────

export async function runSiteCheck(siteId: string): Promise<SiteCheckResult | null> {
  const supabase = getServerClient();

  // Fetch site from DB
  let site: SiteRow | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, url, health, uptime, open_issues")
      .eq("id", siteId)
      .single();
    if (error || !data) {
      console.error("Site not found:", siteId, error?.message);
      return null;
    }
    site = data as SiteRow;
  } else {
    // Supabase not configured — use a placeholder so checks can still run
    site = { id: siteId, name: siteId, url: `https://${siteId}.co.za`, health: 80, uptime: 99.9, open_issues: 0 };
  }

  const rawUrl = site.url.startsWith("http") ? site.url : `https://${site.url}`;
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    hostname = site.url.replace(/^https?:\/\//, "").split("/")[0];
  }

  const checkedAt = new Date().toISOString();

  // Run all four checks concurrently
  const [httpCheck, sslCheck, seoCheck, domainCheck] = await Promise.all([
    runHttpCheck(rawUrl),
    runSslCheck(hostname),
    runSeoCheck(rawUrl),
    runDomainCheck(hostname),
  ]);

  const { score: healthScore, issueDescriptions } = calcHealthScore(httpCheck, sslCheck, seoCheck, domainCheck);

  const status: "healthy" | "attention" | "critical" =
    healthScore >= 90 ? "healthy" : healthScore >= 70 ? "attention" : "critical";

  const uptimeStatus: "up" | "down" | "degraded" =
    !httpCheck.isUp ? "down" :
    httpCheck.responseTimeMs > 3_000 ? "degraded" : "up";

  const issuesCreated: string[] = [];
  let persisted = false;

  if (supabase) {
    // 1. Insert uptime check record
    await supabase.from("uptime_checks").insert([{
      site_id: siteId,
      status: uptimeStatus,
      http_status: httpCheck.httpStatus,
      response_time_ms: httpCheck.responseTimeMs,
      ssl_valid: sslCheck.valid,
      ssl_days_remaining: sslCheck.daysRemaining,
      ssl_expiry_date: sslCheck.expiryDate,
      ssl_issuer: sslCheck.issuer,
      error: httpCheck.error ?? sslCheck.error,
      checked_at: checkedAt,
    }]);

    // 1b. Insert domain check record
    await supabase.from("domain_checks").insert([{
      site_id: siteId,
      domain: domainCheck.domain,
      expiry_date: domainCheck.expiryDate,
      days_remaining: domainCheck.daysRemaining,
      registrar: domainCheck.registrar,
      error: domainCheck.error,
      checked_at: checkedAt,
    }]);

    // 2. Update site health score + status
    const newUptime = !httpCheck.isUp
      ? Math.max(0, (site.uptime ?? 99.99) - 0.01)
      : site.uptime ?? 99.99;

    await supabase.from("sites").update({
      health: healthScore,
      status,
      uptime: parseFloat(newUptime.toFixed(4)),
      last_scan: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) + " today",
    }).eq("id", siteId);

    // 3. Create issues for anything serious — skip if a similar open issue exists
    for (const desc of issueDescriptions) {
      const { data: existing } = await supabase
        .from("issues")
        .select("id")
        .eq("site_id", siteId)
        .eq("category", desc.category)
        .in("status", ["New", "Investigating", "In Progress"])
        .limit(1);

      if (!existing || existing.length === 0) {
        const issueId = `chk-${randomUUID().slice(0, 8)}`;
        await supabase.from("issues").insert([{
          id: issueId,
          site_id: siteId,
          title: desc.title,
          severity: desc.severity,
          impact: desc.impact,
          category: desc.category,
          page: "/",
          recommended: desc.recommended,
          owner: "Unassigned",
          status: "New",
          detected: new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
          change_type: "Automated check",
          confidence: 95,
          evidence: { httpStatus: httpCheck.httpStatus, responseTimeMs: httpCheck.responseTimeMs },
        }]);
        issuesCreated.push(desc.title);
      }
    }

    // 4. Update open_issues count from DB
    const { count: openCount } = await supabase
      .from("issues")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .in("status", ["New", "Investigating", "In Progress"]);

    if (openCount !== null) {
      await supabase.from("sites").update({ open_issues: openCount }).eq("id", siteId);
    }

    // 5. Log activity
    const severity = status === "critical" ? "crit" : status === "attention" ? "high" : "low";
    const actText = issuesCreated.length > 0
      ? `Check found ${issuesCreated.length} issue${issuesCreated.length > 1 ? "s" : ""}: ${issuesCreated[0]}`
      : `Check passed — ${site.name} healthy (score ${healthScore})`;

    await supabase.from("activities").insert([{
      time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
      site_name: site.name,
      text: actText,
      sev: severity,
      type: uptimeStatus === "down" ? "uptime" : issuesCreated.some(i => i.toLowerCase().includes("ssl")) ? "ssl" : "activity",
    }]);

    persisted = true;
  }

  return {
    siteId,
    siteName: site.name,
    siteUrl: rawUrl,
    httpCheck,
    sslCheck,
    seoCheck,
    domainCheck,
    healthScore,
    status,
    uptimeStatus,
    issuesCreated,
    persisted,
    checkedAt,
  };
}

// ─── Run checks for all sites ─────────────────────────────────────────────────

export async function runAllSiteChecks(): Promise<SiteCheckResult[]> {
  const supabase = getServerClient();
  if (!supabase) {
    console.warn("Supabase not configured — cannot run checks");
    return [];
  }

  const { data: sites, error } = await supabase.from("sites").select("id");
  if (error || !sites) return [];

  const siteIds: string[] = sites.map((s: any) => s.id);
  const results: SiteCheckResult[] = [];

  // Process in batches of 3 to avoid overwhelming external servers
  for (let i = 0; i < siteIds.length; i += 3) {
    const batch = siteIds.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map((id) => runSiteCheck(id)));
    results.push(...(batchResults.filter(Boolean) as SiteCheckResult[]));
  }

  return results;
}
