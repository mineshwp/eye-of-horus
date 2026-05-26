"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  Icon,
  Badge,
  Favicon
} from "@/components/ui";

export default function WpUpdatesPage() {
  const { sites, wpUpdates } = useApp();
  const [filter, setFilter] = useState("All");
  const [localUpdates, setLocalUpdates] = useState(wpUpdates);

  // Synchronize local updates when state updates
  React.useEffect(() => {
    setLocalUpdates(wpUpdates);
  }, [wpUpdates]);

  const filters = ["All", "Core", "Plugins", "Themes", "Critical risk"];

  const filteredUpdates = localUpdates.filter((u) => {
    if (filter === "All") return true;
    if (filter === "Core") return u.target === "WordPress Core";
    if (filter === "Plugins") return u.target !== "WordPress Core" && !u.target.includes("Theme");
    if (filter === "Themes") return u.target.includes("Theme");
    if (filter === "Critical risk") return u.risk === "high";
    return true;
  });

  const handleUpdate = (id: string, target: string, siteName: string) => {
    alert(`Starting safe update process for ${target} on ${siteName}...`);
    // Simulate update success
    setTimeout(() => {
      setLocalUpdates((prev) => prev.filter((item) => item.id !== id));
      alert(`Successfully updated ${target} on ${siteName}. Visual regression tests passed!`);
    }, 1200);
  };

  const handleRunSafeUpdates = () => {
    const safeUpdates = localUpdates.filter((u) => u.flag === "Safe update");
    if (safeUpdates.length === 0) {
      alert("No safe updates in queue.");
      return;
    }
    alert(`Running automated updates for ${safeUpdates.length} packages...`);
    setTimeout(() => {
      const safeIds = safeUpdates.map((u) => u.id);
      setLocalUpdates((prev) => prev.filter((item) => !safeIds.includes(item.id)));
      alert(`Automated updates completed successfully for: ${safeUpdates.map(u => u.target).join(", ")}. all regression scans passed.`);
    }, 1500);
  };

  const handleStage = (target: string, siteName: string) => {
    alert(`Staging environment cloned. Deploying ${target} on staging-sandbox for ${siteName}. Form scouts triggered.`);
  };

  // Update history
  const history = [
    { date: "Today · 11:22", text: "Yoast SEO 22.7 → 22.9", site: "Wetpaint Corporate", outcome: "ok", note: "Auto-update · no issues" },
    { date: "Today · 09:30", text: "Astra Theme 4.6.10 → 4.6.11", site: "Greenfield Estates", outcome: "ok", note: "Manual update · regression passed" },
    { date: "Today · 06:18", text: "Form-Pro 4.1.9 → 4.2.1", site: "Tarsus Cloud Portal", outcome: "fail", note: "Form submissions failed · rolled back" },
    { date: "Yesterday", text: "WordPress 6.5.5 → 6.6.0", site: "Acme Finance", outcome: "ok", note: "Manual update · 14 regression checks passed" },
    { date: "2 days ago", text: "WooCommerce 8.9.1 → 8.9.2", site: "Gentech Industries", outcome: "warn", note: "Cart layout drift on tablet · acknowledged" },
  ];

  const pendingCount = localUpdates.length;
  const safeCount = localUpdates.filter((u) => u.flag === "Safe update").length;
  const stagingCount = localUpdates.filter((u) => u.flag === "Needs staging test").length;
  const criticalRiskCount = localUpdates.filter((u) => u.risk === "high").length;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="wp" size={22} />
            WordPress updates
            <Badge tone="high" dot>
              {pendingCount} pending
            </Badge>
          </h1>
          <p className="page-sub">
            Core, plugin and theme updates across all monitored sites with AI-estimated compatibility risk and a recommended order of operations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => alert("CSV Exported successfully")} type="button">
            <Icon name="download" size={13} /> Export queue
          </button>
          <button className="btn primary" onClick={handleRunSafeUpdates} type="button">
            <Icon name="play" size={13} /> Run safe updates · {safeCount}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <SummaryCard tone="amber" icon="wp" label="Pending updates" value={String(pendingCount)} sub="across monitored sites" />
        <SummaryCard tone="green" icon="check" label="Safe to update" value={String(safeCount)} sub="zero-risk, autopatch ready" />
        <SummaryCard tone="cyan" icon="shield" label="Need staging" value={String(stagingCount)} sub="custom hooks / overrides" />
        <SummaryCard tone="red" icon="issue" label="Critical risk" value={String(criticalRiskCount)} sub="Form-Pro rollback active" />
      </div>

      {/* Recommended order */}
      <div className="ai-callout" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="ai-tag">
            <Icon name="sparkles" size={11} /> Horus recommended order
          </span>
          <span className="dim" style={{ fontSize: 12 }}>
            updated 4 min ago
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <OrderStep n={1} site="Acme Finance" target="WP Core 6.6.1" tone="ok" note="Security release · auto-deploy" />
          <OrderStep n={2} site="Gentech" target="Yoast SEO 22.9" tone="ok" note="Patch · auto-deploy" />
          <OrderStep n={3} site="Flexcom" target="Astra Theme 4.7.2" tone="ok" note="No child overrides" />
          <OrderStep n={4} site="Gentech" target="Elementor Pro 3.22" tone="warn" note="Stage first · template overrides" />
          <OrderStep n={5} site="Acme Finance" target="WooCommerce 9.0.1" tone="warn" note="Major version · custom hooks" />
          <OrderStep n={6} site="Tarsus" target="Form-Pro 4.2.1" tone="crit" note="Hold · regression in production" />
        </div>
      </div>

      {/* Filter + queue */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3>
            <Icon name="wp" size={14} /> Update queue
          </h3>
          <div className="filter-chips" style={{ marginLeft: "auto" }}>
            {filters.map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
                type="button"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div
            style={{
              background: "rgba(255,255,255,0.015)",
              padding: "10px 18px",
              borderBottom: "1px solid var(--border-soft)",
              display: "grid",
              gridTemplateColumns: "2.2fr 1.5fr 1fr 1.2fr 1.8fr",
              gap: 14,
              alignItems: "center"
            }}
          >
            <div className="label-strip">Target · site</div>
            <div className="label-strip">Version</div>
            <div className="label-strip">Risk</div>
            <div className="label-strip">Flag</div>
            <div></div>
          </div>
          {filteredUpdates.length > 0 ? (
            filteredUpdates.map((u) => {
              const site = sites.find((s) => s.id === u.siteId) || sites[0];
              const targetIcon = u.target === "WordPress Core" ? "wp" : u.target.includes("Theme") ? "img" : "bolt";
              const flagTone = u.flag === "Safe update" ? "ok" : u.flag === "Do not update" ? "crit" : "high";
              return (
                <div
                  key={u.id}
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--border-soft)",
                    display: "grid",
                    gridTemplateColumns: "2.2fr 1.5fr 1fr 1.2fr 1.8fr",
                    gap: 14,
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="wp-icon" style={{ color: site.brand, width: 32, height: 32, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
                      <Icon name={targetIcon} size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.target}</div>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {site.name} · {u.notes}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{u.from}</span>
                    <Icon name="arrowRight" size={12} style={{ color: "var(--text-dim)" }} />
                    <span style={{ color: "var(--cyan)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{u.to}</span>
                  </div>
                  <div>
                    <Badge tone={u.risk === "low" ? "ok" : u.risk === "medium" ? "high" : "crit"} dot>
                      {u.risk[0].toUpperCase() + u.risk.slice(1)} risk
                    </Badge>
                  </div>
                  <div>
                    <Badge tone={flagTone}>{u.flag}</Badge>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn ghost sm" onClick={() => alert(`${u.target} updates ignored for 30 days.`)} type="button">
                      Skip
                    </button>
                    <button className="btn sm" onClick={() => handleStage(u.target, site.name)} type="button">
                      Stage
                    </button>
                    <button
                      className={`btn ${u.flag === "Safe update" ? "primary" : ""} sm`}
                      disabled={u.flag === "Do not update"}
                      style={u.flag === "Do not update" ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                      onClick={() => handleUpdate(u.id, u.target, site.name)}
                      type="button"
                    >
                      Update
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty" style={{ padding: "40px 10px" }}>
              No updates in this filter.
            </div>
          )}
        </div>
      </div>

      {/* Update history */}
      <div className="card">
        <div className="card-head">
          <h3>
            <Icon name="clock" size={14} /> Update history
          </h3>
          <span className="h-sub">last 7 days</span>
        </div>
        <div>
          {history.map((h, i) => (
            <div key={i} className="feed-item">
              <div
                className="feed-icon"
                style={{
                  color: h.outcome === "ok" ? "var(--green)" : h.outcome === "warn" ? "var(--amber)" : "var(--red)",
                  borderColor: h.outcome === "ok" ? "rgba(34,197,94,0.3)" : h.outcome === "warn" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"
                }}
              >
                <Icon name={h.outcome === "ok" ? "check" : h.outcome === "warn" ? "issue" : "x"} size={14} />
              </div>
              <div className="feed-body">
                <div className="feed-title">{h.text}</div>
                <div className="feed-meta">
                  <span>{h.site}</span>
                  <span className="pip" />
                  <span className="mono">{h.date}</span>
                  <span className="pip" />
                  <span>{h.note}</span>
                </div>
              </div>
              <Badge tone={h.outcome === "ok" ? "ok" : h.outcome === "warn" ? "high" : "crit"}>
                {h.outcome === "ok" ? "Success" : h.outcome === "warn" ? "Warning" : "Rolled back"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SummaryCard = ({ tone, icon, label, value, sub }: { tone: string; icon: string; label: string; value: string; sub: string }) => {
  const colorMap: Record<string, string> = {
    amber: "#F59E0B",
    green: "#22C55E",
    cyan: "#00E5FF",
    red: "#EF4444"
  };
  const c = colorMap[tone] || "#D4AF37";
  return (
    <div className="card kpi-card">
      <div className="kpi-bg" style={{ background: `${c}33` }} />
      <div className="kpi-head">
        <Icon name={icon} size={13} /> {label}
      </div>
      <div className="kpi-value" style={{ color: c }}>
        {value}
      </div>
      <div className="kpi-foot">
        <span className="dim">{sub}</span>
      </div>
    </div>
  );
};

const OrderStep = ({ n, site, target, tone, note }: { n: number; site: string; target: string; tone: string; note: string }) => {
  const colorMap: Record<string, string> = { ok: "var(--green)", warn: "var(--amber)", crit: "var(--red)" };
  const c = colorMap[tone] || "var(--text-tertiary)";
  return (
    <div
      style={{
        flex: "1 1 220px",
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border-soft)",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 12
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: `${c}22`,
          color: c,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 13,
          border: `1px solid ${c}55`
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{target}</div>
        <div className="dim" style={{ fontSize: 11.5 }}>
          {site} · {note}
        </div>
      </div>
    </div>
  );
};
