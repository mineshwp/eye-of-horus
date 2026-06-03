"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { apiFetch } from "@/lib/auth/index";
import {
  Icon,
  Badge,
} from "@/components/ui";

interface ActivityRecord {
  id?: number;
  time: string;
  site: string;
  text: string;
  sev: string;
  type: string;
}

export default function WpUpdatesPage() {
  const { sites, wpUpdates, activities } = useApp();
  const [filter, setFilter] = useState("All");
  const [localUpdates, setLocalUpdates] = useState(wpUpdates);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
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

  // The /api/wordpress/update endpoint only supports plugin updates; core and
  // theme updates aren't one-click and must be handled manually / via staging.
  const isPluginTarget = (target: string) => target !== "WordPress Core" && !target.includes("Theme");

  const handleUpdate = async (id: string, target: string, siteId: string, siteName: string) => {
    if (updatingId) return;
    setUpdatingId(id);
    showToast(`Updating ${target} on ${siteName}…`);
    try {
      const res = await apiFetch("/api/wordpress/update", {
        method: "POST",
        body: JSON.stringify({ siteId, pluginName: target }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocalUpdates((prev) => prev.filter((item) => item.id !== id));
        showToast(`${target} updated successfully on ${siteName}.`);
      } else {
        showToast(`Update failed: ${data.error ?? "Unknown error"}`);
      }
    } catch {
      showToast(`Update failed: could not reach the server.`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRunSafeUpdates = async () => {
    if (updatingId) return;
    const safeUpdates = localUpdates.filter((u) => u.flag === "Safe update" && isPluginTarget(u.target));
    if (safeUpdates.length === 0) {
      showToast("No safe plugin updates in queue.");
      return;
    }
    showToast(`Running ${safeUpdates.length} safe update${safeUpdates.length !== 1 ? "s" : ""}…`);
    let succeeded = 0;
    for (const u of safeUpdates) {
      setUpdatingId(u.id);
      try {
        const res = await apiFetch("/api/wordpress/update", {
          method: "POST",
          body: JSON.stringify({ siteId: u.siteId, pluginName: u.target }),
        });
        const data = await res.json();
        if (data.ok) {
          succeeded++;
          setLocalUpdates((prev) => prev.filter((item) => item.id !== u.id));
        }
      } catch {
        /* keep going with the remaining updates */
      }
    }
    setUpdatingId(null);
    showToast(
      succeeded === safeUpdates.length
        ? `${succeeded} update${succeeded !== 1 ? "s" : ""} completed successfully.`
        : `${succeeded} of ${safeUpdates.length} update${safeUpdates.length !== 1 ? "s" : ""} completed — review the rest manually.`,
    );
  };

  const handleStage = (target: string, siteName: string) => {
    showToast(`Staging queued for ${target} on ${siteName}.`);
  };

  const pendingCount = localUpdates.length;
  const safeCount = localUpdates.filter((u) => u.flag === "Safe update").length;
  const stagingCount = localUpdates.filter((u) => u.flag === "Needs staging test").length;
  const criticalRiskCount = localUpdates.filter((u) => u.risk === "high").length;

  // Recommended order: sort by risk then priority
  const riskOrder = { high: 0, medium: 1, low: 2 };
  const flagOrder: Record<string, number> = { "Do not update": 3, "Needs staging test": 1, "Safe update": 0 };
  const orderedUpdates = [...localUpdates]
    .sort((a, b) => {
      const rA = riskOrder[a.risk as keyof typeof riskOrder] ?? 2;
      const rB = riskOrder[b.risk as keyof typeof riskOrder] ?? 2;
      if (rA !== rB) return rA - rB;
      return (flagOrder[a.flag] ?? 2) - (flagOrder[b.flag] ?? 2);
    })
    .slice(0, 6);

  // Recent WP-related activities from the activity feed
  const wpHistory: ActivityRecord[] = activities
    .filter((a) => a.type === "wp")
    .slice(0, 10);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="wp" size={22} />
            WordPress updates
            {pendingCount > 0 && (
              <Badge tone="high" dot>
                {pendingCount} pending
              </Badge>
            )}
          </h1>
          <p className="page-sub">
            {pendingCount > 0
              ? `Core, plugin and theme updates across all monitored sites with AI-estimated compatibility risk and recommended order.`
              : "All WordPress sites are up to date. Horus will notify you when new updates are available."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => {
            const csv = ["Target,Site,Risk,Flag,Current,Available"].concat(
              localUpdates.map((u) => {
                const s = sites.find((x) => x.id === u.siteId);
                return `"${u.target}","${s?.name ?? u.siteId}","${u.risk}","${u.flag}","${u.from ?? ""}","${u.to ?? ""}"`;
              })
            ).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "wp-updates.csv"; a.click();
            showToast("Update queue exported to wp-updates.csv");
          }} type="button">
            <Icon name="download" size={13} /> Export queue
          </button>
          <button className="btn primary" onClick={handleRunSafeUpdates} disabled={safeCount === 0} type="button">
            <Icon name="play" size={13} /> Run safe updates{safeCount > 0 ? ` · ${safeCount}` : ""}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <SummaryCard tone="amber" icon="wp" label="Pending updates" value={String(pendingCount)} sub="across monitored sites" />
        <SummaryCard tone="green" icon="check" label="Safe to update" value={String(safeCount)} sub="autopatch ready" />
        <SummaryCard tone="cyan" icon="shield" label="Need staging" value={String(stagingCount)} sub="custom hooks / overrides" />
        <SummaryCard tone="red" icon="issue" label="Critical risk" value={String(criticalRiskCount)} sub="hold until reviewed" />
      </div>

      {/* Recommended order — dynamic from real data */}
      {orderedUpdates.length > 0 && (
        <div className="ai-callout" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> Horus recommended order
            </span>
            <span className="dim" style={{ fontSize: 12 }}>sorted by risk · {orderedUpdates.length} shown</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {orderedUpdates.map((u, i) => {
              const site = sites.find((s) => s.id === u.siteId);
              const tone =
                u.flag === "Safe update" ? "ok" :
                u.flag === "Do not update" ? "crit" : "warn";
              return (
                <OrderStep
                  key={u.id}
                  n={i + 1}
                  site={site?.name ?? "Unknown"}
                  target={`${u.target} ${u.to}`}
                  tone={tone}
                  note={u.notes}
                />
              );
            })}
          </div>
        </div>
      )}

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
              alignItems: "center",
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
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      className="wp-icon"
                      style={{ color: site?.brand, width: 32, height: 32, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 8 }}
                    >
                      <Icon name={targetIcon} size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.target}</div>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {site?.name} · {u.notes}
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
                    <button className="btn ghost sm" onClick={() => showToast(`${u.target} skipped for 30 days.`)} type="button">
                      Skip
                    </button>
                    <button className="btn sm" onClick={() => handleStage(u.target, site?.name ?? "")} type="button">
                      Stage
                    </button>
                    <button
                      className={`btn ${u.flag === "Safe update" && isPluginTarget(u.target) ? "primary" : ""} sm`}
                      disabled={u.flag === "Do not update" || !isPluginTarget(u.target) || updatingId !== null}
                      style={(u.flag === "Do not update" || !isPluginTarget(u.target) || updatingId !== null) ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                      title={!isPluginTarget(u.target) ? "Core and theme updates must be applied manually via staging" : undefined}
                      onClick={() => handleUpdate(u.id, u.target, site?.id ?? u.siteId, site?.name ?? "")}
                      type="button"
                    >
                      {updatingId === u.id ? "Updating…" : isPluginTarget(u.target) ? "Update" : "Manual"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty" style={{ padding: "40px 10px" }}>
              {pendingCount === 0 ? "All sites are up to date." : "No updates match this filter."}
            </div>
          )}
        </div>
      </div>

      {/* Update history — from live activity feed */}
      <div className="card">
        <div className="card-head">
          <h3>
            <Icon name="clock" size={14} /> Recent WordPress activity
          </h3>
          <span className="h-sub">from activity log</span>
        </div>
        <div>
          {wpHistory.length > 0 ? (
            wpHistory.map((h, i) => (
              <div key={i} className="feed-item">
                <div
                  className="feed-icon"
                  style={{
                    color: h.sev === "crit" || h.sev === "high" ? "var(--amber)" : "var(--green)",
                    borderColor: h.sev === "crit" || h.sev === "high" ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)",
                  }}
                >
                  <Icon name="wp" size={14} />
                </div>
                <div className="feed-body">
                  <div className="feed-title">{h.text}</div>
                  <div className="feed-meta">
                    <span>{h.site}</span>
                    <span className="pip" />
                    <span className="mono">{h.time}</span>
                  </div>
                </div>
                <Badge tone={h.sev === "crit" ? "crit" : h.sev === "high" ? "high" : "ok"}>
                  {h.sev === "crit" ? "Critical" : h.sev === "high" ? "High" : "OK"}
                </Badge>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: "32px 18px" }}>
              No WordPress activity recorded yet. Activity will appear here after scans run.
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{toast}</div>
      )}
    </div>
  );
}

const SummaryCard = ({ tone, icon, label, value, sub }: { tone: string; icon: string; label: string; value: string; sub: string }) => {
  const colorMap: Record<string, string> = { amber: "#F59E0B", green: "#22C55E", cyan: "#00E5FF", red: "#EF4444" };
  const c = colorMap[tone] || "#D4AF37";
  return (
    <div className="card kpi-card">
      <div className="kpi-bg" style={{ background: `${c}33` }} />
      <div className="kpi-head"><Icon name={icon} size={13} /> {label}</div>
      <div className="kpi-value" style={{ color: c }}>{value}</div>
      <div className="kpi-foot"><span className="dim">{sub}</span></div>
    </div>
  );
};

const OrderStep = ({ n, site, target, tone, note }: { n: number; site: string; target: string; tone: string; note: string }) => {
  const colorMap: Record<string, string> = { ok: "var(--green)", warn: "var(--amber)", crit: "var(--red)" };
  const c = colorMap[tone] || "var(--text-tertiary)";
  return (
    <div
      style={{
        flex: "1 1 220px", padding: "12px 14px",
        background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 10,
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center",
          background: `${c}22`, color: c,
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
          border: `1px solid ${c}55`,
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{target}</div>
        <div className="dim" style={{ fontSize: 11.5 }}>{site} · {note}</div>
      </div>
    </div>
  );
};
