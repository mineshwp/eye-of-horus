export interface SeoCheckResult {
  hasTitle: boolean;
  title: string | null;
  hasMetaDescription: boolean;
  metaDescription: string | null;
  isNoindex: boolean;
  hasH1: boolean;
  h1Text: string | null;
  hasCanonical: boolean;
  issues: string[];
}

export async function runSeoCheck(rawUrl: string): Promise<SeoCheckResult> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const issues: string[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "EyeOfHorus-SEOCheck/2.0 (+https://wetpaint.co.za)",
        Accept: "text/html",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        hasTitle: false, title: null,
        hasMetaDescription: false, metaDescription: null,
        isNoindex: false, hasH1: false, h1Text: null,
        hasCanonical: false,
        issues: [`HTTP ${response.status} — could not fetch page for SEO check`],
      };
    }

    // Only read up to 200KB to keep this fast
    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      let bytes = 0;
      while (bytes < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        bytes += value.byteLength;
      }
      reader.cancel();
    }

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? null;
    const hasTitle = !!title && title.length > 0;
    if (!hasTitle) issues.push("Missing <title> tag");
    else if (title && title.length > 60) issues.push(`Title too long: ${title.length} characters (recommended < 60)`);

    // Meta description — handle both attribute orderings
    const descMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ??
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const metaDescription = descMatch?.[1]?.trim() ?? null;
    const hasMetaDescription = !!metaDescription && metaDescription.length > 5;
    if (!hasMetaDescription) issues.push("Missing or empty meta description");

    // Noindex
    const isNoindex =
      /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]*>/i.test(html) ||
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["'][^>]*>/i.test(html);
    if (isNoindex) issues.push("Page has noindex directive — not indexable by search engines");

    // H1
    const h1Match = html.match(/<h1[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/h1>/i);
    const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : null;
    const hasH1 = !!h1Text && h1Text.length > 0;
    if (!hasH1) issues.push("Missing <h1> tag");

    // Canonical
    const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);

    return {
      hasTitle, title,
      hasMetaDescription, metaDescription,
      isNoindex, hasH1, h1Text,
      hasCanonical,
      issues,
    };
  } catch (err: any) {
    const isTimeout = err.name === "AbortError";
    return {
      hasTitle: false, title: null,
      hasMetaDescription: false, metaDescription: null,
      isNoindex: false, hasH1: false, h1Text: null,
      hasCanonical: false,
      issues: [isTimeout ? "SEO check timed out" : `SEO check error: ${err.message}`],
    };
  }
}
