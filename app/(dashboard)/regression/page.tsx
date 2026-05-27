"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  Icon,
  Badge,
  Tabs,
  Favicon,
} from "@/components/ui";

export default function RegressionPage() {
  const router = useRouter();
  const { sites, issues } = useApp();

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [viewport, setViewport] = useState("Desktop");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Default to first site once data loads
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  const site = sites.find((s) => s.id === selectedSiteId) ?? sites[0];

  // Find visual regression issues for the selected site
  const regressionIssues = site
    ? issues.filter(
        (i) => i.siteId === site.id && i.category === "Visual regression" && i.status !== "Resolved" && i.status !== "Ignored"
      )
    : [];

  const handleApprove = () => {
    if (!site) return;
    showToast(`Baseline approved for ${site.name} · ${viewport}.`);
  };

  const handleFlag = () => {
    if (!site) return;
    if (regressionIssues.length > 0) {
      router.push(`/issues/${regressionIssues[0].id}`);
    } else {
      showToast(`Visual regression ticket created for ${site.name}.`);
    }
  };

  const handleDefer = () => {
    showToast("Review deferred. Will surface at next team sync.");
  };

  if (sites.length === 0) {
    return (
      <div className="page fade-in">
        <div className="page-head">
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="diff" size={22} />
              Visual changes
            </h1>
            <p className="page-sub">Side-by-side baseline vs. latest scan. Horus highlights changed regions and explains what it sees.</p>
          </div>
        </div>
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div className="muted">Add client sites to start capturing visual baselines.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="diff" size={22} />
            Visual changes
            {regressionIssues.length > 0 && (
              <Badge tone="crit" dot>
                {regressionIssues.length} open regression{regressionIssues.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </h1>
          <p className="page-sub">
            Side-by-side baseline vs. latest scan. Horus highlights changed regions and explains what type of change it sees.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleFlag} type="button">
            Flag as issue
          </button>
          <button className="btn primary" onClick={handleApprove} type="button">
            <Icon name="check" size={13} /> Approve change
          </button>
        </div>
      </div>

      {/* Selector row */}
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {site && <Favicon site={site} size={28} />}
          <div>
            <div className="label-strip" style={{ marginBottom: 4 }}>Website</div>
            <select
              className="select"
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ height: 32, width: 1, background: "var(--border-soft)" }} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Viewport</span>
          <Tabs tabs={["Desktop", "Tablet", "Mobile"]} active={viewport} onChange={setViewport} />
        </div>
      </div>

      {/* Comparison */}
      <div className="grid-2eq" style={{ marginBottom: 18, alignItems: "start" }}>
        <ComparisonPane
          label="Baseline"
          subtitle="Last approved baseline"
          viewport={viewport}
          siteUrl={site?.url ?? ""}
          mode="baseline"
        />
        <ComparisonPane
          label="Current"
          subtitle={`Latest scan · ${site?.lastScan ?? "—"}`}
          viewport={viewport}
          siteUrl={site?.url ?? ""}
          mode="current"
          hasRegression={regressionIssues.length > 0}
        />
      </div>

      {/* Changes list + AI panel */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="diff" size={14} /> Detected changes
            </h3>
            <span className="h-sub">{viewport} viewport</span>
          </div>
          <div>
            {regressionIssues.length > 0 ? (
              regressionIssues.map((issue) => (
                <ChangeRow
                  key={issue.id}
                  tone="crit"
                  type={issue.changeType}
                  label={issue.title}
                  region={`Page: ${issue.page}`}
                  conf={issue.confidence}
                  active
                  onOpen={() => router.push(`/issues/${issue.id}`)}
                />
              ))
            ) : (
              <div className="empty" style={{ padding: "40px 10px" }}>
                No visual differences detected. Either the baseline matches the current scan or no baseline has been set yet.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="ai-callout">
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> Horus explanation
            </span>
            {regressionIssues.length > 0 ? (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, lineHeight: 1.4, marginTop: 10 }}>
                  {regressionIssues.length} visual regression{regressionIssues.length !== 1 ? "s" : ""} detected on {site?.name}.
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
                  {regressionIssues[0].recommended}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                  <Badge tone="med" lg>{regressionIssues[0].confidence}% confidence</Badge>
                  <Badge tone="ghost">{regressionIssues[0].changeType}</Badge>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
                {site
                  ? `Layout matches the active baseline with high accuracy. No unexpected changes detected on ${site.name} (${viewport.toLowerCase()}).`
                  : "Select a site to see visual regression data."}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Verdict</h3>
            </div>
            <div className="card-pad">
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
                Once you decide on this scan, Horus will use it as the new baseline for future comparisons.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn primary full" onClick={handleApprove} type="button">
                  <Icon name="check" size={13} /> Approve change · set new baseline
                </button>
                <button className="btn full" onClick={handleFlag} type="button">
                  <Icon name="x" size={13} /> Flag as issue · open ticket
                </button>
                <button className="btn ghost full" onClick={handleDefer} type="button">
                  Defer · review at standup
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{toast}</div>
      )}
    </div>
  );
}

const ChangeRow = ({
  tone, type, label, region, conf, active, onOpen,
}: {
  tone: "crit" | "warn" | "info"; type: string; label: string;
  region: string; conf: number; active?: boolean; onOpen?: () => void;
}) => (
  <div
    className="feed-item"
    style={{ background: active ? "rgba(239,68,68,0.05)" : undefined, cursor: onOpen ? "pointer" : "default" }}
    onClick={onOpen}
  >
    <div
      className="feed-icon"
      style={{
        borderColor: tone === "crit" ? "rgba(239,68,68,0.4)" : tone === "warn" ? "rgba(245,158,11,0.4)" : "rgba(0,229,255,0.3)",
        color: tone === "crit" ? "#FCA5A5" : tone === "warn" ? "#FCD37A" : "#7DE4F2",
      }}
    >
      <Icon name={tone === "crit" ? "issue" : tone === "warn" ? "diff" : "code"} size={14} />
    </div>
    <div className="feed-body">
      <div className="feed-title">{label}</div>
      <div className="feed-meta">
        <span>{type}</span>
        <span className="pip" />
        <span className="mono">{region}</span>
      </div>
    </div>
    <Badge tone="ghost">{conf}%</Badge>
  </div>
);

const ComparisonPane = ({
  label, subtitle, viewport, siteUrl, mode, hasRegression,
}: {
  label: string; subtitle: string; viewport: string;
  siteUrl: string; mode: "baseline" | "current"; hasRegression?: boolean;
}) => {
  const isMobile = viewport === "Mobile";
  const isTablet = viewport === "Tablet";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div className="label-strip">{label}</div>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <Badge tone="ghost">
          <Icon name={isMobile ? "mobile" : isTablet ? "tablet" : "desktop"} size={11} /> {viewport}
        </Badge>
      </div>

      <div
        className={`viewport-mock ${isTablet ? "tablet" : ""} ${isMobile ? "mobile" : ""}`}
        style={{ height: isMobile ? 480 : 420 }}
      >
        <div className="vp-head" style={{ height: 24, background: "rgba(255,255,255,0.04)" }}>
          <div className="vp-dots"><span /><span /><span /></div>
          <div className="vp-url">{siteUrl}</div>
        </div>
        <div className="vp-content" style={{ padding: 14, overflowY: "auto", height: "calc(100% - 24px)" }}>
          <div className="mock-block h1" />
          <div className="mock-block p" />
          <div className="mock-block p s" />
          <div className="mock-block img" style={{ minHeight: isMobile ? 100 : 140 }} />
          {mode === "baseline" && <div className="mock-block btn-pri" style={{ background: "var(--gold)" }} />}
          {mode === "current" && hasRegression && (
            <div
              style={{
                border: "2px dashed var(--red)",
                borderRadius: 6, padding: 10,
                background: "rgba(239,68,68,0.08)",
                color: "#FCA5A5", fontSize: 11.5,
                fontFamily: "var(--font-mono)", textAlign: "center",
              }}
            >
              regression detected
            </div>
          )}
          {mode === "current" && !hasRegression && <div className="mock-block btn-pri" style={{ background: "var(--gold)" }} />}
          <div className="mock-block p" />
          <div className="mock-block p s" />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />
            {!isMobile && <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />}
          </div>
        </div>

        {mode === "current" && hasRegression && (
          <div className="diff-overlay crit" style={{ left: "8%", top: "40%", width: "84%", height: "10%", pointerEvents: "none" }}>
            <span className="tag">regression detected</span>
          </div>
        )}
      </div>
    </div>
  );
};
