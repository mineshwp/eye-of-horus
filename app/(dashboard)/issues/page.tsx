"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Icon, Badge, SeverityChip } from "@/components/ui";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const STATUS_TONE: Record<string, "ok" | "med" | "high" | "crit" | "ghost"> = {
  Resolved: "ok",
  Ignored: "ghost",
  "In Progress": "med",
  Investigating: "med",
  New: "high",
  Open: "high",
};

// Statuses that represent an open/unresolved issue
const OPEN_STATUSES = ["New", "Investigating", "In Progress", "Open"];
const isOpenStatus = (status?: string) => OPEN_STATUSES.includes(status || "New");

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge tone={STATUS_TONE[status] ?? "high"}>{status || "Open"}</Badge>
);

export default function IssuesPage() {
  const router = useRouter();
  const { sites, issues, wpUpdates, updateIssue } = useApp();

  const handleToggleComplete = async (e: React.MouseEvent, issueId: string, currentStatus: string) => {
    e.stopPropagation();
    const next = currentStatus === "Resolved" ? "New" : "Resolved";
    await updateIssue(issueId, { status: next });
  };

  // Derive synthetic issues from wp_updates that have no matching UNRESOLVED issue.
  // Only suppress the synthetic copy when a real, still-open issue already covers it —
  // a resolved/ignored issue should not hide a freshly-available update.
  const existingWpTitles = new Set(
    issues
      .filter((i) => i.category === "WordPress update" && isOpenStatus(i.status))
      .map((i) => `${i.siteId}::${i.title}`)
  );
  const syntheticWpIssues = wpUpdates
    .filter((u) => !existingWpTitles.has(`${u.siteId}::${u.target} update available`))
    .map((u) => ({
      id: `wp-update-${u.id}`,
      siteId: u.siteId,
      title: `${u.target} update available`,
      severity: u.risk === "high" ? "high" : "medium",
      impact: `${u.target} is running v${u.from}. Update v${u.to} is available.`,
      category: "WordPress update",
      page: "wp-admin/plugins.php",
      recommended: u.notes,
      owner: "Unassigned",
      status: "New",
      detected: "Now",
      changeType: "WordPress plugin sync",
      confidence: 95,
      evidence: { from: u.from, to: u.to, flag: u.flag },
    }));
  const allIssues = [...issues, ...syntheticWpIssues];

  const [severityFilter, setSeverityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open"); // "Open" = any unresolved status
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"severity" | "detected">("severity");

  const categories = useMemo(() => {
    const cats = new Set(allIssues.map((i) => i.category).filter(Boolean));
    return ["All", ...Array.from(cats).sort()];
  }, [allIssues]);

  const severities = [
    { k: "All", label: "All" },
    { k: "critical", label: "Critical" },
    { k: "high", label: "High" },
    { k: "medium", label: "Medium" },
    { k: "low", label: "Low" },
  ];

  const filtered = useMemo(() => {
    return allIssues
      .filter((i) => severityFilter === "All" || i.severity === severityFilter)
      .filter((i) => categoryFilter === "All" || i.category === categoryFilter)
      .filter((i) =>
        statusFilter === "All" ||
        (statusFilter === "Open" ? isOpenStatus(i.status) : (i.status || "New") === statusFilter)
      )
      .filter(
        (i) =>
          !search ||
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          (i.impact || "").toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === "severity") {
          const diff =
            (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
          if (diff !== 0) return diff;
        }
        const da = new Date(a.detected).getTime();
        const db = new Date(b.detected).getTime();
        return isNaN(db) || isNaN(da) ? 0 : db - da;
      });
  }, [allIssues, severityFilter, categoryFilter, statusFilter, search, sortBy]);

  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const openCount = allIssues.filter((i) => isOpenStatus(i.status)).length;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="issue" size={22} />
            Issues
            {criticalCount > 0 && (
              <Badge tone="crit" dot className="ml-2">
                {criticalCount} critical
              </Badge>
            )}
          </h1>
          <p className="page-sub">
            {allIssues.length > 0
              ? `${openCount} open issue${openCount !== 1 ? "s" : ""} across ${sites.length} site${
                  sites.length !== 1 ? "s" : ""
                }. Click any row to view details and AI recommendations.`
              : "No issues found. Run a full scan to detect problems across your sites."}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {/* Severity chips */}
        <div className="filter-chips" style={{ flexShrink: 0 }}>
          {severities.map((s) => {
            const n = s.k === "All"
              ? allIssues.length
              : allIssues.filter((i) => i.severity === s.k).length;
            return (
              <button
                key={s.k}
                className={`chip ${severityFilter === s.k ? "active" : ""}`}
                onClick={() => setSeverityFilter(s.k)}
                type="button"
              >
                {s.label} <span className="count">{n}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {/* Status select */}
          <select
            className="select"
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 6 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All statuses</option>
            <option value="Open">Open (unresolved)</option>
            <option value="New">New</option>
            <option value="Investigating">Investigating</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Ignored">Ignored</option>
          </select>

          {/* Category select */}
          <select
            className="select"
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 6, maxWidth: 180 }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All categories" : c}
              </option>
            ))}
          </select>

          {/* Sort toggle */}
          <button
            className={`btn ghost sm`}
            type="button"
            onClick={() => setSortBy(sortBy === "severity" ? "detected" : "severity")}
            style={{ fontSize: 12 }}
          >
            <Icon name="filter" size={12} />
            {sortBy === "severity" ? "Severity" : "Date"}
          </button>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Icon
              name="search"
              size={12}
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-dim)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search issues…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "var(--bg-inset)",
                border: "1px solid var(--border-mid)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 12,
                padding: "5px 10px 5px 28px",
                width: 200,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      </div>

      {/* Issues table */}
      <div className="card">
        <table className="table">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "42px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Sev</th>
              <th>Issue</th>
              <th>Category</th>
              <th>Site</th>
              <th>Status</th>
              <th
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() =>
                  setSortBy(sortBy === "detected" ? "severity" : "detected")
                }
              >
                Detected{sortBy === "detected" ? " ↑" : ""}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty" style={{ padding: "48px 18px" }}>
                    {search ||
                    severityFilter !== "All" ||
                    categoryFilter !== "All" ||
                    statusFilter !== "All"
                      ? "No issues match your current filters."
                      : "No issues detected yet. Run a full scan to begin monitoring."}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((issue) => {
                const site = sites.find((s) => s.id === issue.siteId);
                return (
                  <tr
                    key={issue.id}
                    className="trow"
                    onClick={() =>
                      issue.id.startsWith("wp-update-")
                        ? router.push(`/sites/${issue.siteId}?tab=WordPress`)
                        : router.push(`/issues/${issue.id}`)
                    }
                  >
                    <td>
                      <SeverityChip level={issue.severity} />
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 13,
                          color: "var(--text-primary)",
                          lineHeight: 1.4,
                        }}
                      >
                        {issue.title}
                      </div>
                      {issue.page && (
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            marginTop: 2,
                          }}
                        >
                          {issue.page}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {issue.category || "—"}
                      </span>
                    </td>
                    <td>
                      {site ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              display: "grid",
                              placeItems: "center",
                              fontFamily: "var(--font-display)",
                              fontWeight: 600,
                              fontSize: 9,
                              background: `${site.brand}22`,
                              color: site.brand,
                              border: `1px solid ${site.brand}33`,
                              flexShrink: 0,
                            }}
                          >
                            {site.initials}
                          </div>
                          <span
                            style={{ fontSize: 12, color: "var(--text-secondary)" }}
                          >
                            {site.name}
                          </span>
                        </div>
                      ) : (
                        <span className="dim" style={{ fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {!issue.id.startsWith("wp-update-") && (
                          <button
                            type="button"
                            title={issue.status === "Resolved" ? "Reopen issue" : "Mark complete"}
                            onClick={(e) => handleToggleComplete(e, issue.id, issue.status || "New")}
                            style={{
                              width: 18, height: 18, flexShrink: 0, cursor: "pointer",
                              display: "grid", placeItems: "center", borderRadius: 5,
                              background: issue.status === "Resolved" ? "var(--green)" : "transparent",
                              border: `1.5px solid ${issue.status === "Resolved" ? "var(--green)" : "var(--border-mid)"}`,
                              color: issue.status === "Resolved" ? "#04110a" : "var(--text-dim)",
                              padding: 0,
                            }}
                          >
                            {issue.status === "Resolved" && <Icon name="check" size={11} />}
                          </button>
                        )}
                        <StatusBadge status={issue.status || "Open"} />
                      </div>
                    </td>
                    <td className="dim mono" style={{ fontSize: 12 }}>
                      {issue.detected || "—"}
                    </td>
                    <td>
                      <Icon
                        name="chevron"
                        size={14}
                        style={{ color: "var(--text-dim)" }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div
            style={{
              padding: "10px 18px",
              borderTop: "1px solid var(--border-low)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            {filtered.length} issue{filtered.length !== 1 ? "s" : ""} shown
            {filtered.length !== allIssues.length && ` (filtered from ${allIssues.length} total)`}
          </div>
        )}
      </div>
    </div>
  );
}
