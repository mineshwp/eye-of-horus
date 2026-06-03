// Extract performance optimization opportunities from a stored PageSpeed/
// Lighthouse raw_result. No new data collection — we already persist the full
// PSI response in performance_metrics.raw_result.

export interface PerfOpportunity {
  key: string;
  label: string;
  category: string;
  score: number | null;        // 0–1 Lighthouse audit score (lower = worse)
  savingsMs: number | null;    // estimated load-time savings
  savingsBytes: number | null; // estimated byte savings
  displayValue: string | null; // Lighthouse's human-readable summary
}

// Audit id → friendly label + category. Order roughly by typical impact.
const AUDIT_MAP: Array<{ id: string; label: string; category: string }> = [
  { id: "server-response-time", label: "Reduce initial server response time", category: "Server" },
  { id: "render-blocking-resources", label: "Eliminate render-blocking resources", category: "Render blocking" },
  { id: "uses-optimized-images", label: "Efficiently encode images", category: "Images" },
  { id: "modern-image-formats", label: "Serve images in next-gen formats (WebP/AVIF)", category: "Images" },
  { id: "uses-responsive-images", label: "Properly size images", category: "Images" },
  { id: "offscreen-images", label: "Defer offscreen images", category: "Images" },
  { id: "unused-javascript", label: "Reduce unused JavaScript", category: "JavaScript" },
  { id: "unminified-javascript", label: "Minify JavaScript", category: "JavaScript" },
  { id: "bootup-time", label: "Reduce JavaScript execution time", category: "JavaScript" },
  { id: "mainthread-work-breakdown", label: "Minimize main-thread work", category: "JavaScript" },
  { id: "unused-css-rules", label: "Reduce unused CSS", category: "CSS" },
  { id: "unminified-css", label: "Minify CSS", category: "CSS" },
  { id: "third-party-summary", label: "Reduce the impact of third-party code", category: "Third-party" },
  { id: "uses-long-cache-ttl", label: "Serve static assets with an efficient cache policy", category: "Caching / CDN" },
  { id: "uses-text-compression", label: "Enable text compression (gzip/brotli)", category: "Caching / CDN" },
  { id: "total-byte-weight", label: "Avoid enormous network payloads", category: "Page weight" },
];

interface LhAuditDetails {
  overallSavingsMs?: number;
  overallSavingsBytes?: number;
  summary?: { wastedMs?: number; wastedBytes?: number };
}
interface LhAudit {
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
  details?: LhAuditDetails;
}

export function extractOpportunities(raw: unknown): PerfOpportunity[] {
  const lr = (raw as { lighthouseResult?: { audits?: Record<string, LhAudit> } } | null)?.lighthouseResult;
  const audits = lr?.audits;
  if (!audits) return [];

  const out: PerfOpportunity[] = [];
  for (const { id, label, category } of AUDIT_MAP) {
    const a = audits[id];
    if (!a) continue;

    const savingsMs = a.details?.overallSavingsMs ?? a.details?.summary?.wastedMs ?? null;
    const savingsBytes = a.details?.overallSavingsBytes ?? a.details?.summary?.wastedBytes ?? null;
    const score = typeof a.score === "number" ? a.score : null;

    // Skip audits that pass cleanly with nothing to gain.
    const passing = score != null && score >= 0.9;
    const hasSavings = (savingsMs ?? 0) > 0 || (savingsBytes ?? 0) > 0;
    if (passing && !hasSavings) continue;
    if (score == null && !hasSavings && !a.displayValue) continue;

    out.push({
      key: id,
      label,
      category,
      score,
      savingsMs: savingsMs != null ? Math.round(savingsMs) : null,
      savingsBytes: savingsBytes != null ? Math.round(savingsBytes) : null,
      displayValue: a.displayValue ?? null,
    });
  }

  // Biggest time savings first, then byte savings, then worst score.
  out.sort((a, b) =>
    (b.savingsMs ?? 0) - (a.savingsMs ?? 0) ||
    (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0) ||
    (a.score ?? 1) - (b.score ?? 1)
  );
  return out;
}

export function formatBytes(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
