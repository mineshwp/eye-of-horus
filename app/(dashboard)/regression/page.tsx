"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  Icon,
  Badge,
  Tabs,
  Favicon
} from "@/components/ui";

export default function RegressionPage() {
  const router = useRouter();
  const { sites, issues } = useApp();

  const [selectedSiteId, setSelectedSiteId] = useState("acme");
  const [viewport, setViewport] = useState("Mobile");
  const [pageSel, setPageSel] = useState("/  · Homepage");
  const [compareDate, setCompareDate] = useState("Today 09:14 vs 7 days ago");

  const site = sites.find((s) => s.id === selectedSiteId) || sites[0];

  const handleApprove = () => {
    alert(`Visual changes approved for ${site.name} (${pageSel}) on ${viewport}. New baseline is established.`);
  };

  const handleFlag = () => {
    // Find the critical issue if it's Acme Homepage mobile
    if (selectedSiteId === "acme" && pageSel === "/  · Homepage" && viewport === "Mobile") {
      router.push("/issues/i1");
    } else {
      alert(`Creating visual regression ticket for ${site.name} on ${pageSel}...`);
    }
  };

  const handleDefer = () => {
    alert("Review deferred. This visual difference will be highlighted at the next team sync.");
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="diff" size={22} />
            Visual changes
            {selectedSiteId === "acme" && (
              <Badge tone="crit" dot>
                1 critical diff
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
          <Favicon site={site} size={28} />
          <div>
            <div className="label-strip" style={{ marginBottom: 4 }}>Website</div>
            <select
              className="select"
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ height: 32, width: 1, background: "var(--border-soft)" }} />
        <div>
          <div className="label-strip" style={{ marginBottom: 4 }}>Page</div>
          <select className="select" value={pageSel} onChange={(e) => setPageSel(e.target.value)}>
            <option value="/  · Homepage">/  · Homepage</option>
            <option value="/services">/services</option>
            <option value="/about">/about</option>
            <option value="/contact-us">/contact-us</option>
            <option value="/account/login">/account/login</option>
          </select>
        </div>
        <div>
          <div className="label-strip" style={{ marginBottom: 4 }}>Compare</div>
          <select className="select" value={compareDate} onChange={(e) => setCompareDate(e.target.value)}>
            <option value="Today 09:14 vs 7 days ago">Today 09:14 vs 7 days ago</option>
            <option value="Today 09:14 vs yesterday">Today 09:14 vs yesterday</option>
            <option value="Today 09:14 vs last approved baseline">Today 09:14 vs last approved baseline</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Viewport</span>
          <Tabs tabs={["Desktop", "Tablet", "Mobile"]} active={viewport} onChange={setViewport} />
        </div>
      </div>

      {/* Comparison */}
      <div className="grid-2eq" style={{ marginBottom: 18, alignItems: "start" }}>
        <ComparisonPane
          label="Baseline"
          subtitle="7 days ago · approved"
          viewport={viewport}
          showCTA={selectedSiteId !== "acme" || pageSel !== "/  · Homepage" || viewport !== "Mobile"}
          mode="baseline"
          siteUrl={site.url}
        />
        <ComparisonPane
          label="Current"
          subtitle="Today · 09:14"
          viewport={viewport}
          showCTA={false}
          mode="current"
          siteUrl={site.url}
          isAcmeMobile={selectedSiteId === "acme" && pageSel === "/  · Homepage" && viewport === "Mobile"}
        />
      </div>

      {/* Changes list + AI panel */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="diff" size={14} /> Detected changes
            </h3>
            <span className="h-sub">
              {viewport} viewport · {selectedSiteId === "acme" && pageSel === "/  · Homepage" && viewport === "Mobile" ? "4 changes" : "0 changes"}
            </span>
          </div>
          <div>
            {selectedSiteId === "acme" && pageSel === "/  · Homepage" && viewport === "Mobile" ? (
              <>
                <ChangeRow
                  tone="crit"
                  type="Broken component"
                  label="Hero CTA — 'Open an account' missing"
                  region="Region 12% / 62% · 55% × 10%"
                  conf={96}
                  active
                  onOpen={() => router.push("/issues/i1")}
                />
                <ChangeRow
                  tone="warn"
                  type="Layout shift"
                  label="Hero subheading moved up 24px on mobile"
                  region="Region 12% / 28% · 60% × 6%"
                  conf={88}
                />
                <ChangeRow
                  tone="info"
                  type="Copy change"
                  label="Footer link 'Insights' renamed to 'Resources'"
                  region="Region 4% / 92% · 12% × 4%"
                  conf={99}
                />
                <ChangeRow
                  tone="info"
                  type="Styling change"
                  label="Primary brand color shifted 4% lighter"
                  region="Global · 17 elements affected"
                  conf={84}
                />
              </>
            ) : (
              <div className="empty" style={{ padding: "40px 10px" }}>
                No visual differences detected on this page/viewport vs baseline.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {selectedSiteId === "acme" && pageSel === "/  · Homepage" && viewport === "Mobile" ? (
            <div className="ai-callout">
              <span className="ai-tag">
                <Icon name="sparkles" size={11} /> Horus explanation
              </span>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, lineHeight: 1.4, marginTop: 10 }}>
                The hero CTA "Open an account" was removed from the mobile viewport in the last theme update.
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
                This element drives 41% of mobile lead form submissions in the last 30 days. The change correlates with theme update Astra 4.6.10 deployed yesterday at 12:04. No matching ticket was found.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <Badge tone="med" lg>
                  96% confidence
                </Badge>
                <Badge tone="ghost">DOM diff</Badge>
                <Badge tone="ghost">Visual diff</Badge>
              </div>
            </div>
          ) : (
            <div className="ai-callout">
              <span className="ai-tag">
                <Icon name="sparkles" size={11} /> Horus explanation
              </span>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
                Layout matches the active baseline with high accuracy (DOM identity: 100%, pixel correlation: 99.8%). No layout shifts or missing elements detected.
              </div>
            </div>
          )}

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
    </div>
  );
}

const ChangeRow = ({
  tone,
  type,
  label,
  region,
  conf,
  active,
  onOpen
}: {
  tone: "crit" | "warn" | "info";
  type: string;
  label: string;
  region: string;
  conf: number;
  active?: boolean;
  onOpen?: () => void;
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
        color: tone === "crit" ? "#FCA5A5" : tone === "warn" ? "#FCD37A" : "#7DE4F2"
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
  label,
  subtitle,
  viewport,
  showCTA,
  mode,
  siteUrl,
  isAcmeMobile
}: {
  label: string;
  subtitle: string;
  viewport: string;
  showCTA: boolean;
  mode: "baseline" | "current";
  siteUrl: string;
  isAcmeMobile?: boolean;
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
          <div className="vp-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="vp-url">{siteUrl}</div>
        </div>
        <div className="vp-content" style={{ padding: 14, overflowY: "auto", height: "calc(100% - 24px)" }}>
          <div className="mock-block h1" />
          <div className="mock-block p" />
          <div className="mock-block p s" />
          <div className="mock-block img" style={{ minHeight: isMobile ? 100 : 140 }} />
          {showCTA && <div className="mock-block btn-pri" style={{ background: "var(--gold)" }} />}
          {!showCTA && mode === "current" && isAcmeMobile && (
            <div
              style={{
                border: "2px dashed var(--red)",
                borderRadius: 6,
                padding: 10,
                background: "rgba(239,68,68,0.08)",
                color: "#FCA5A5",
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                textAlign: "center",
              }}
            >
              missing element
            </div>
          )}
          <div className="mock-block p" />
          <div className="mock-block p s" />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />
            {!isMobile && <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }} />}
          </div>
        </div>

        {/* Diff overlays only on current */}
        {mode === "current" && isAcmeMobile && (
          <>
            {isMobile ? (
              <div className="diff-overlay crit" style={{ left: "8%", top: "62%", width: "84%", height: "10%", pointerEvents: "none" }}>
                <span className="tag">CRIT · missing CTA</span>
              </div>
            ) : (
              <div className="diff-overlay warn" style={{ left: "8%", top: "28%", width: "60%", height: "6%", pointerEvents: "none" }}>
                <span className="tag">WARN · layout shift</span>
              </div>
            )}
            <div className="diff-overlay" style={{ left: "4%", top: "84%", width: "20%", height: "4%", pointerEvents: "none" }}>
              <span className="tag">copy change</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
