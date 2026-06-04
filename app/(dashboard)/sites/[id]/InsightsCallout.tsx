"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { apiFetch } from "@/lib/auth/index";

export type InsightSection = "analytics" | "seo" | "performance" | "security";

const SECTION_LABEL: Record<InsightSection, string> = {
  analytics: "Analytics insights",
  seo: "SEO insights",
  performance: "Performance insights",
  security: "Security insights",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Horus AI insight callout shown above each section's data.
 * Loads the latest cached insight on mount; admins can regenerate on demand.
 * The parent tab supplies a compact `context` object of the metrics in view.
 */
export default function InsightsCallout({
  siteId,
  section,
  context,
  onAskHorus,
}: {
  siteId: string | undefined;
  section: InsightSection;
  context: Record<string, unknown>;
  onAskHorus?: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load latest cached insight on mount / when the site changes.
  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/ai/insights?siteId=${siteId}&section=${section}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setSummary(d?.summary ?? null);
        setGeneratedAt(d?.generatedAt ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, section]);

  const generate = useCallback(async () => {
    if (!siteId || generating) return;
    setGenerating(true);
    setError(null);
    const res = await apiFetch("/api/ai/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, section, context }),
    }).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      if (d?.summary) {
        setSummary(d.summary);
        setGeneratedAt(d.generatedAt ?? null);
      } else {
        setError(d?.reason === "ANTHROPIC_API_KEY not configured"
          ? "AI is not configured yet."
          : "Couldn't generate an insight right now.");
      }
    } else {
      setError("Couldn't generate an insight right now.");
    }
    setGenerating(false);
  }, [siteId, section, context, generating]);

  return (
    <div className="ai-callout" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span className="ai-tag">
          <Icon name="sparkles" size={11} /> {SECTION_LABEL[section]}
        </span>
        <span className="dim" style={{ fontSize: 11 }}>
          {generatedAt ? `Updated ${relativeTime(generatedAt)}` : "Horus"}
        </span>
      </div>

      <div style={{ fontFamily: "var(--font-display)", fontSize: 15.5, lineHeight: 1.5, fontWeight: 500, marginBottom: 12 }}>
        {loading ? (
          <span className="muted" style={{ fontSize: 13.5 }}>Loading insight…</span>
        ) : generating ? (
          <span className="muted" style={{ fontSize: 13.5 }}>Horus is analysing the {section} data…</span>
        ) : summary ? (
          summary
        ) : (
          <span className="muted" style={{ fontSize: 13.5 }}>
            No insight yet — generate one to see what Horus learned from this section&apos;s data and what to do next.
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn sm" onClick={generate} disabled={generating} type="button">
          {generating ? "Analysing…" : summary ? "Refresh insight" : "Generate insight"}
        </button>
        {onAskHorus && (
          <button className="btn ghost sm" onClick={onAskHorus} type="button">
            <Icon name="sparkles" size={11} /> Ask Horus
          </button>
        )}
      </div>
    </div>
  );
}
