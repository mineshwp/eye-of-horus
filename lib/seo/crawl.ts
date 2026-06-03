import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// ─── Server-side Supabase client ─────────────────────────────────────────────
// Uses the service role key so writes bypass RLS even with no user session.
// Mirrors lib/checks/index.ts.
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Tunables ────────────────────────────────────────────────────────────────
const MAX_PAGES = 20; // pages to crawl for on-page checks
const MAX_LINKS = 120; // unique links to validate for broken-link detection
const LINK_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 12_000;
const THIN_CONTENT_WORDS = 200; // pages below this word count are flagged "thin"
const USER_AGENT = "EyeOfHorus-SEOCrawl/2.0 (+https://wetpaint.co.za)";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SeoPageFinding {
  url: string;
  path: string;
  status: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  hasH1: boolean;
  wordCount: number;
  thin: boolean;
  imagesTotal: number;
  imagesMissingAlt: number;
  hasSchema: boolean;
}

export interface SeoBrokenLink {
  url: string;
  status: number;
  foundOn: string;
  linkText: string;
  isInternal: boolean;
}

export interface SeoCrawlResult {
  siteId: string;
  siteName: string;
  siteUrl: string;
  pagesCrawled: number;
  linksChecked: number;
  brokenLinks: SeoBrokenLink[];
  missingTitles: number;
  duplicateTitles: number;
  missingDescriptions: number;
  duplicateDescriptions: number;
  missingH1: number;
  thinContentCount: number;
  imagesMissingAlt: number;
  pagesWithSchema: number;
  hasSitemap: boolean | null;
  hasRobots: boolean | null;
  sitemapUrl: string | null;
  score: number;
  pages: SeoPageFinding[];
  issuesCreated: string[];
  persisted: boolean;
  error: string | null;
  checkedAt: string;
}

interface SiteRow {
  id: string;
  name: string;
  url: string;
}

interface FetchResult {
  status: number;
  html: string;
  finalUrl: string;
  contentType: string;
  error: string | null;
}

// ─── HTML parsing helpers (regex-based, consistent with lib/checks/seo.ts) ─────

const ASSET_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|eot|avif)(\?|#|$)/i;

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() || null : null;
}

function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

function hasH1Tag(html: string): boolean {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return false;
  return m[1].replace(/<[^>]+>/g, "").trim().length > 0;
}

function countWords(html: string): number {
  // Strip <script>/<style>, then all tags, then count words in the visible text.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const words = text.split(/\s+/).filter((w) => w.length > 1);
  return words.length;
}

function countImages(html: string): { total: number; missingAlt: number } {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  let missingAlt = 0;
  for (const tag of imgs) {
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    // Missing entirely OR present but empty — both fail accessibility/SEO.
    if (!altMatch || altMatch[1].trim().length === 0) missingAlt++;
  }
  return { total: imgs.length, missingAlt };
}

function hasJsonLdSchema(html: string): boolean {
  return /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(html);
}

function extractLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#")) continue;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).href;
    } catch {
      continue;
    }
    abs = abs.split("#")[0]; // drop fragment
    if (!/^https?:\/\//i.test(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
    out.push({ url: abs, text });
  }
  return out;
}

// ─── Network helpers ───────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    let html = "";
    if (res.ok && contentType.includes("text/html")) {
      // Read up to 500KB — enough for on-page checks, keeps memory bounded.
      const reader = res.body?.getReader();
      if (reader) {
        let bytes = 0;
        const decoder = new TextDecoder();
        while (bytes < 500_000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          bytes += value.byteLength;
        }
        reader.cancel().catch(() => {});
      }
    }
    return { status: res.status, html, finalUrl: res.url || url, contentType, error: null };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    return {
      status: 0,
      html: "",
      finalUrl: url,
      contentType: "",
      error: e.name === "AbortError" ? "timeout" : e.message ?? "fetch error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkLinkStatus(url: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Try HEAD first (cheap). Some servers reject HEAD → fall back to a ranged GET.
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" },
      });
    }
    return res.status;
  } catch {
    return 0; // network error / timeout — treated as broken
  } finally {
    clearTimeout(timeout);
  }
}

async function urlExists(url: string): Promise<boolean> {
  const status = await checkLinkStatus(url);
  return status >= 200 && status < 400;
}

// Run a list of async thunks with bounded concurrency.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function calcSeoScore(r: {
  pagesCrawled: number;
  brokenInternal: number;
  missingTitles: number;
  duplicateTitles: number;
  missingDescriptions: number;
  missingH1: number;
  thinContentCount: number;
  imagesMissingAlt: number;
  pagesWithSchema: number;
  hasSitemap: boolean | null;
  hasRobots: boolean | null;
}): number {
  let score = 100;
  score -= Math.min(30, r.brokenInternal * 5);
  score -= Math.min(15, r.missingTitles * 5);
  score -= Math.min(10, r.duplicateTitles * 3);
  score -= Math.min(10, r.missingDescriptions * 2);
  score -= Math.min(10, r.missingH1 * 2);
  score -= Math.min(10, r.thinContentCount * 2);
  score -= Math.min(10, Math.floor(r.imagesMissingAlt / 3));
  if (r.hasSitemap === false) score -= 5;
  if (r.hasRobots === false) score -= 3;
  if (r.pagesCrawled > 0 && r.pagesWithSchema === 0) score -= 3;
  return Math.max(0, Math.min(100, score));
}

// ─── Main: crawl one site ──────────────────────────────────────────────────────

export async function runSeoCrawl(siteId: string): Promise<SeoCrawlResult | null> {
  const supabase = getServerClient();
  const checkedAt = new Date().toISOString();

  let site: SiteRow | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, url")
      .eq("id", siteId)
      .single();
    if (error || !data) {
      console.error("[seo-crawl] Site not found:", siteId, error?.message);
      return null;
    }
    site = data as SiteRow;
  } else {
    site = { id: siteId, name: siteId, url: `https://${siteId}.co.za` };
  }

  const baseUrl = site.url.startsWith("http") ? site.url : `https://${site.url}`;
  let origin: string;
  let hostname: string;
  try {
    const u = new URL(baseUrl);
    origin = u.origin;
    hostname = u.hostname;
  } catch {
    return null;
  }

  const isInternal = (u: string) => {
    try {
      return new URL(u).hostname === hostname;
    } catch {
      return false;
    }
  };

  // ── 1. Crawl internal pages (BFS) ─────────────────────────────────────────
  const queue: string[] = [baseUrl.split("#")[0]];
  const visited = new Set<string>();
  const pages: SeoPageFinding[] = [];
  // url -> status for links we already fetched (avoids re-checking them later)
  const knownStatus = new Map<string, number>();
  const allLinks = new Map<string, { url: string; text: string; foundOn: string }>();

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const res = await fetchPage(current);
    knownStatus.set(current, res.status);

    const pathOnly = (() => {
      try {
        return new URL(current).pathname;
      } catch {
        return current;
      }
    })();

    if (!res.html) {
      // Non-HTML or error page — record status only.
      pages.push({
        url: current, path: pathOnly, status: res.status,
        title: null, titleLength: 0, metaDescription: null, hasH1: false,
        wordCount: 0, thin: false, imagesTotal: 0, imagesMissingAlt: 0, hasSchema: false,
      });
      continue;
    }

    const title = extractTitle(res.html);
    const metaDescription = extractMetaDescription(res.html);
    const wordCount = countWords(res.html);
    const { total: imagesTotal, missingAlt } = countImages(res.html);

    pages.push({
      url: current,
      path: pathOnly,
      status: res.status,
      title,
      titleLength: title?.length ?? 0,
      metaDescription,
      hasH1: hasH1Tag(res.html),
      wordCount,
      thin: wordCount > 0 && wordCount < THIN_CONTENT_WORDS,
      imagesTotal,
      imagesMissingAlt: missingAlt,
      hasSchema: hasJsonLdSchema(res.html),
    });

    // Collect links; enqueue internal HTML pages for further crawling.
    for (const link of extractLinks(res.html, res.finalUrl)) {
      if (!allLinks.has(link.url)) {
        allLinks.set(link.url, { ...link, foundOn: pathOnly });
      }
      if (
        isInternal(link.url) &&
        !visited.has(link.url) &&
        !queue.includes(link.url) &&
        !ASSET_EXTENSIONS.test(link.url) &&
        pages.length + queue.length < MAX_PAGES
      ) {
        queue.push(link.url);
      }
    }
  }

  // ── 2. Validate links for broken-link detection ───────────────────────────
  const linkList = Array.from(allLinks.values()).slice(0, MAX_LINKS);
  const brokenLinks: SeoBrokenLink[] = [];

  const statuses = await mapWithConcurrency(linkList, LINK_CONCURRENCY, async (link) => {
    const cached = knownStatus.get(link.url);
    const status = cached !== undefined ? cached : await checkLinkStatus(link.url);
    return { link, status };
  });

  for (const { link, status } of statuses) {
    // status 0 = network error/timeout; >=400 = HTTP error.
    if (status === 0 || status >= 400) {
      brokenLinks.push({
        url: link.url,
        status,
        foundOn: link.foundOn,
        linkText: link.text,
        isInternal: isInternal(link.url),
      });
    }
  }

  // ── 3. robots.txt + sitemap.xml ────────────────────────────────────────────
  const hasRobots = await urlExists(`${origin}/robots.txt`);
  let sitemapUrl: string | null = `${origin}/sitemap.xml`;
  let hasSitemap = await urlExists(sitemapUrl);
  if (!hasSitemap) {
    const alt = `${origin}/sitemap_index.xml`;
    if (await urlExists(alt)) {
      hasSitemap = true;
      sitemapUrl = alt;
    } else {
      sitemapUrl = null;
    }
  }

  // ── 4. Aggregate on-page findings ──────────────────────────────────────────
  const htmlPages = pages.filter((p) => p.status >= 200 && p.status < 400 && p.titleLength + p.wordCount > 0);
  const missingTitles = htmlPages.filter((p) => !p.title).length;
  const missingDescriptions = htmlPages.filter((p) => !p.metaDescription).length;
  const missingH1 = htmlPages.filter((p) => !p.hasH1).length;
  const thinContentCount = htmlPages.filter((p) => p.thin).length;
  const imagesMissingAlt = htmlPages.reduce((sum, p) => sum + p.imagesMissingAlt, 0);
  const pagesWithSchema = htmlPages.filter((p) => p.hasSchema).length;

  const countDuplicates = (values: Array<string | null>): number => {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      const k = v.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let dupes = 0;
    for (const c of counts.values()) if (c > 1) dupes += c;
    return dupes;
  };
  const duplicateTitles = countDuplicates(htmlPages.map((p) => p.title));
  const duplicateDescriptions = countDuplicates(htmlPages.map((p) => p.metaDescription));

  const brokenInternal = brokenLinks.filter((b) => b.isInternal).length;

  const score = calcSeoScore({
    pagesCrawled: htmlPages.length,
    brokenInternal,
    missingTitles,
    duplicateTitles,
    missingDescriptions,
    missingH1,
    thinContentCount,
    imagesMissingAlt,
    pagesWithSchema,
    hasSitemap,
    hasRobots,
  });

  const result: SeoCrawlResult = {
    siteId,
    siteName: site.name,
    siteUrl: baseUrl,
    pagesCrawled: pages.length,
    linksChecked: linkList.length,
    brokenLinks,
    missingTitles,
    duplicateTitles,
    missingDescriptions,
    duplicateDescriptions,
    missingH1,
    thinContentCount,
    imagesMissingAlt,
    pagesWithSchema,
    hasSitemap,
    hasRobots,
    sitemapUrl,
    score,
    pages,
    issuesCreated: [],
    persisted: false,
    error: null,
    checkedAt,
  };

  // ── 5. Persist + create issues ─────────────────────────────────────────────
  if (supabase) {
    const { data: auditRow, error: auditErr } = await supabase
      .from("seo_audits")
      .insert([{
        site_id: siteId,
        pages_crawled: pages.length,
        links_checked: linkList.length,
        broken_links_count: brokenLinks.length,
        missing_titles: missingTitles,
        duplicate_titles: duplicateTitles,
        missing_descriptions: missingDescriptions,
        duplicate_descriptions: duplicateDescriptions,
        missing_h1: missingH1,
        thin_content_count: thinContentCount,
        images_missing_alt: imagesMissingAlt,
        pages_with_schema: pagesWithSchema,
        has_sitemap: hasSitemap,
        has_robots: hasRobots,
        sitemap_url: sitemapUrl,
        score,
        summary: { pages, brokenLinks },
        checked_at: checkedAt,
      }])
      .select("id")
      .single();

    if (auditErr) {
      console.error("[seo-crawl] Failed to insert audit:", auditErr.message);
      result.error = auditErr.message;
    } else if (auditRow) {
      const auditId = auditRow.id as string;

      if (brokenLinks.length > 0) {
        await supabase.from("broken_links").insert(
          brokenLinks.map((b) => ({
            site_id: siteId,
            audit_id: auditId,
            url: b.url,
            status: b.status,
            found_on: b.foundOn,
            link_text: b.linkText,
            is_internal: b.isInternal,
            checked_at: checkedAt,
          })),
        );
      }

      // Build candidate issues. Category "SEO Audit" is distinct from the homepage
      // "SEO" category so the two dedup independently.
      const candidates: Array<{
        titlePrefix: string;
        title: string;
        severity: "high" | "medium" | "low";
        impact: string;
        recommended: string;
      }> = [];

      if (brokenLinks.length > 0) {
        candidates.push({
          titlePrefix: "Broken links found",
          title: `Broken links found — ${brokenLinks.length} link${brokenLinks.length === 1 ? "" : "s"} returning errors`,
          severity: brokenLinks.length > 5 || brokenInternal > 2 ? "high" : "medium",
          impact: "Broken links frustrate visitors and waste crawl budget — they signal poor maintenance to search engines",
          recommended: `Review the broken links in the SEO tab and fix or redirect them. ${brokenInternal} are internal.`,
        });
      }
      if (hasSitemap === false) {
        candidates.push({
          titlePrefix: "Missing XML sitemap",
          title: "Missing XML sitemap — no sitemap.xml found",
          severity: "medium",
          impact: "Search engines rely on a sitemap to discover and prioritise pages — missing it slows indexing",
          recommended: "Generate and publish a sitemap.xml (most SEO plugins do this automatically) and submit it in Search Console",
        });
      }
      if (hasRobots === false) {
        candidates.push({
          titlePrefix: "Missing robots.txt",
          title: "Missing robots.txt file",
          severity: "low",
          impact: "Without robots.txt, crawlers have no directives and cannot find the sitemap reference",
          recommended: "Add a robots.txt at the site root with crawl directives and a Sitemap: line",
        });
      }
      if (duplicateTitles > 0) {
        candidates.push({
          titlePrefix: "Duplicate page titles",
          title: `Duplicate page titles — ${duplicateTitles} pages share a title`,
          severity: "medium",
          impact: "Duplicate titles cause keyword cannibalisation and confuse search engines about which page to rank",
          recommended: "Give each page a unique, descriptive <title> tag",
        });
      }
      if (missingTitles > 0) {
        candidates.push({
          titlePrefix: "Pages missing title",
          title: `Pages missing a title tag — ${missingTitles} affected`,
          severity: "medium",
          impact: "Pages without a title tag rank poorly and display a blank/auto-generated title in search results",
          recommended: "Add a unique <title> tag to every page",
        });
      }
      if (imagesMissingAlt >= 5) {
        candidates.push({
          titlePrefix: "Images missing alt text",
          title: `Images missing alt text — ${imagesMissingAlt} across crawled pages`,
          severity: "low",
          impact: "Missing alt text hurts accessibility for screen-reader users and loses image-search traffic",
          recommended: "Add descriptive alt attributes to content images",
        });
      }
      if (thinContentCount > 0) {
        candidates.push({
          titlePrefix: "Thin content pages",
          title: `Thin content — ${thinContentCount} page${thinContentCount === 1 ? "" : "s"} under ${THIN_CONTENT_WORDS} words`,
          severity: "low",
          impact: "Thin pages provide little value to users and are unlikely to rank for competitive terms",
          recommended: "Expand thin pages with useful, original content or consolidate them",
        });
      }

      const issuesCreated: string[] = [];
      for (const c of candidates) {
        const { data: existing } = await supabase
          .from("issues")
          .select("id")
          .eq("site_id", siteId)
          .eq("category", "SEO Audit")
          .ilike("title", `${c.titlePrefix}%`)
          .in("status", ["New", "Investigating", "In Progress"])
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("issues").insert([{
            id: `seo-${randomUUID().slice(0, 8)}`,
            site_id: siteId,
            title: c.title,
            severity: c.severity,
            impact: c.impact,
            category: "SEO Audit",
            page: "/",
            recommended: c.recommended,
            owner: "Unassigned",
            status: "New",
            detected: new Date().toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
            change_type: "SEO crawl",
            confidence: 90,
            evidence: { auditId, score, brokenLinks: brokenLinks.length, pagesCrawled: pages.length },
          }]);
          issuesCreated.push(c.title);
        }
      }
      result.issuesCreated = issuesCreated;

      // Refresh open_issues count for the site.
      const { count: openCount } = await supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .eq("site_id", siteId)
        .in("status", ["New", "Investigating", "In Progress"]);
      if (openCount !== null) {
        await supabase.from("sites").update({ open_issues: openCount }).eq("id", siteId);
      }

      // Log activity.
      await supabase.from("activities").insert([{
        time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
        site_name: site.name,
        text: issuesCreated.length > 0
          ? `SEO crawl found ${issuesCreated.length} issue${issuesCreated.length > 1 ? "s" : ""} (score ${score})`
          : `SEO crawl passed — ${htmlPages.length} pages, score ${score}`,
        sev: score < 70 ? "high" : "low",
        type: "activity",
      }]);

      result.persisted = true;
    }
  }

  return result;
}

// ─── Run crawl for all active sites ──────────────────────────────────────────

export async function runAllSeoCrawls(): Promise<SeoCrawlResult[]> {
  const supabase = getServerClient();
  if (!supabase) {
    console.warn("[seo-crawl] Supabase not configured — cannot run crawls");
    return [];
  }

  const { data: sites, error } = await supabase.from("sites").select("id").eq("status", "active");
  if (error || !sites) return [];

  const results: SeoCrawlResult[] = [];
  // Crawls are heavier than uptime checks — process one site at a time.
  for (const s of sites as Array<{ id: string }>) {
    const r = await runSeoCrawl(s.id);
    if (r) results.push(r);
  }
  return results;
}
