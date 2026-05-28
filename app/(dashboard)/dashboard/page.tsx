"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  Icon,
  Badge,
  SeverityChip,
  StatusChip,
  ScoreBar,
  KPI,
  Favicon,
  HorusGlyph
} from "@/components/ui";

export default function Dashboard() {
  const router = useRouter();
  const { sites, issues, wpUpdates, activities, runScan, loading } = useApp();
  const [filter, setFilter] = useState("All");

  const filters = [
    { k: "All", n: issues.length },
    { k: "Critical", n: issues.filter((i) => i.severity === "critical").length },
    { k: "WP Updates", n: wpUpdates.length },
    { k: "Visual", n: issues.filter((i) => i.category === "Visual regression").length },
    { k: "Forms", n: issues.filter((i) => i.category === "Form failure").length },
    { k: "Security", n: issues.filter((i) => i.category === "Security").length },
    { k: "Performance", n: issues.filter((i) => i.category === "Performance").length }
  ];

  const filteredIssues =
    filter === "All"
      ? issues
      : filter === "Critical"
      ? issues.filter((i) => i.severity === "critical")
      : filter === "WP Updates"
      ? issues.filter((i) => i.category === "WordPress update")
      : filter === "Visual"
      ? issues.filter((i) => i.category === "Visual regression")
      : filter === "Forms"
      ? issues.filter((i) => i.category === "Form failure")
      : filter === "Security"
      ? issues.filter((i) => i.category === "Security")
      : filter === "Performance"
      ? issues.filter((i) => i.category === "Performance")
      : issues;

  // Find priority items to display in the AI Feed (simulating top 3)
  const priorityItems = issues
    .filter((i) => i.severity === "critical" || i.severity === "high")
    .slice(0, 3);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <HorusGlyph size={26} />
            Command Centre
            <Badge tone="ok" dot className="ml-2">
              Watching · {sites.length} sites
            </Badge>
          </h1>
          <p className="page-sub">
            {sites.length > 0
              ? `Monitoring ${sites.length} site${sites.length !== 1 ? "s" : ""} across desktop, tablet and mobile. Horus has flagged the critical issues most likely to affect your clients today.`
              : "Add your first client site to begin monitoring. Horus will watch for uptime, performance, security, and visual changes automatically."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => router.push("/reports")} type="button">
            <Icon name="download" size={13} /> Export report
          </button>
          <button
            className="btn primary"
            onClick={() => runScan()}
            disabled={loading}
            type="button"
          >
            <Icon name="play" size={12} /> {loading ? "Scanning..." : "Run full scan"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI
          icon="sites"
          label="Monitored sites"
          value={sites.length}
          delta={sites.length === 0 ? "Add your first site" : `${sites.length} site${sites.length !== 1 ? "s" : ""} active`}
          deltaDir="flat"
          glow="rgba(0,229,255,0.22)"
          spark={[sites.length]}
          sparkColor="#00E5FF"
        />
        <KPI
          icon="shield"
          label="Healthy"
          value={sites.filter((s) => s.status === "healthy").length}
          unit={`/ ${sites.length}`}
          delta={sites.length === 0 ? "No sites yet" : `${sites.filter((s) => s.status === "critical").length} critical`}
          deltaDir={sites.filter((s) => s.status === "critical").length > 0 ? "up" : "flat"}
          glow="rgba(34,197,94,0.22)"
          spark={[sites.filter((s) => s.status === "healthy").length]}
          sparkColor="#22C55E"
        />
        <KPI
          icon="issue"
          label="Open issues"
          value={issues.filter((i) => i.status !== "Resolved" && i.status !== "Ignored").length}
          delta={issues.filter((i) => i.severity === "critical").length > 0 ? `${issues.filter((i) => i.severity === "critical").length} critical` : "No critical issues"}
          deltaDir={issues.filter((i) => i.severity === "critical").length > 0 ? "up" : "flat"}
          glow="rgba(245,158,11,0.22)"
          spark={[issues.length]}
          sparkColor="#F59E0B"
        />
        <KPI
          icon="flame"
          label="Critical"
          value={issues.filter((i) => i.severity === "critical").length}
          delta={issues.filter((i) => i.severity === "critical").length > 0 ? "Requires action" : "All clear"}
          deltaDir={issues.filter((i) => i.severity === "critical").length > 0 ? "up" : "flat"}
          glow="rgba(239,68,68,0.22)"
          spark={[issues.filter((i) => i.severity === "critical").length]}
          sparkColor="#EF4444"
        />
      </div>

      {/* AI priority feed + activity */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="ai-callout">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="ai-tag">
                <Icon name="sparkles" size={11} /> Horus priority
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Top {priorityItems.length > 0 ? priorityItems.length : ""} priority items
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {priorityItems.length > 0 ? (
              priorityItems.map((item, index) => {
                const site = sites.find((s) => s.id === item.siteId);
                return (
                  <PriorityItem
                    key={item.id}
                    rank={`0${index + 1}`}
                    title={item.title}
                    meta={`${site?.name || "Site"} · ${item.page} · ${item.severity.toUpperCase()} · Detected ${item.detected}`}
                    reason={item.impact}
                    owner={item.owner}
                    onOpen={() => router.push(`/issues/${item.id}`)}
                  />
                );
              })
            ) : (
              <div className="empty" style={{ padding: "20px 0" }}>No critical priority items pending. Good job!</div>
            )}
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", height: 350 }}>
          <div className="card-head">
            <h3>
              <Icon name="activity" size={14} /> Recent changes
            </h3>
            <span className="h-sub">last 24 hours</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {activities.length > 0 ? (
              activities.map((a, i) => <ActivityRow key={i} a={a} />)
            ) : (
              <div className="empty">No recent scanner logs.</div>
            )}
          </div>
        </div>
      </div>

      {/* Filters + table */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <h3>
            <Icon name="sites" size={14} /> Websites
          </h3>
          <div className="filter-chips" style={{ marginLeft: "auto" }}>
            {filters.map((f) => (
              <button
                key={f.k}
                className={`chip ${filter === f.k ? "active" : ""}`}
                onClick={() => setFilter(f.k)}
                type="button"
              >
                {f.k} <span className="count">{f.n}</span>
              </button>
            ))}
          </div>
        </div>
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "42px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Site</th>
              <th>Status</th>
              <th>Health</th>
              <th>WP core</th>
              <th>Plugins</th>
              <th>Issues</th>
              <th>Last scan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="trow" onClick={() => router.push(`/sites/${s.id}`)}>
                <td>
                  <div className="site-cell">
                    <Favicon site={s} />
                    <div>
                      <div className="site-name">{s.name}</div>
                      <div className="site-url">{s.url}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <StatusChip status={s.status} />
                </td>
                <td>
                  <ScoreBar value={s.health} />
                </td>
                <td>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: s.wp.core === s.wp.coreLatest ? "var(--text-secondary)" : "var(--amber)"
                    }}
                  >
                    {s.wp.core}
                    {s.wp.core !== s.wp.coreLatest && (
                      <span className="dim"> → {s.wp.coreLatest}</span>
                    )}
                  </span>
                </td>
                <td>
                  {s.wp.plugins === 0 ? (
                    <span className="dim mono" style={{ fontSize: 12 }}>
                      up to date
                    </span>
                  ) : (
                    <Badge tone={s.wp.plugins > 5 ? "high" : "med"}>{s.wp.plugins} pending</Badge>
                  )}
                </td>
                <td>
                  {s.openIssues === 0 ? (
                    <Badge tone="ok">none</Badge>
                  ) : (
                    <Badge tone={s.status === "critical" ? "crit" : "high"}>{s.openIssues} open</Badge>
                  )}
                </td>
                <td className="dim mono" style={{ fontSize: 12 }}>
                  {s.lastScan}
                </td>
                <td>
                  <Icon name="chevron" size={14} style={{ color: "var(--text-dim)" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lower: issue feed grid */}
      <div className="grid-2eq">
        <div className="card" style={{ height: 350, display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <h3>
              <Icon name="issue" size={14} /> {filter === "All" ? "All open issues" : `${filter} issues`}
            </h3>
            <button className="btn ghost sm" onClick={() => router.push("/issues")} type="button">
              View all <Icon name="chevron" size={12} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredIssues.length > 0 ? (
              filteredIssues
                .slice(0, 5)
                .map((i) => (
                  <IssueRow
                    key={i.id}
                    issue={i}
                    site={sites.find((s) => s.id === i.siteId)!}
                    onClick={() => router.push(`/issues/${i.id}`)}
                  />
                ))
            ) : (
              <div className="empty">No matching open issues.</div>
            )}
          </div>
        </div>

        <div className="card" style={{ height: 350, display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <h3>
              <Icon name="wp" size={14} /> WordPress update queue
            </h3>
            <button className="btn ghost sm" onClick={() => router.push("/wp")} type="button">
              View all <Icon name="chevron" size={12} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {wpUpdates.length > 0 ? (
              wpUpdates.slice(0, 5).map((u) => {
                const site = sites.find((s) => s.id === u.siteId);
                if (!site) return null;
                return (
                  <div key={u.id} className="feed-item" style={{ alignItems: "center" }}>
                    <div className="feed-icon" style={{ color: site.brand }}>
                      <Icon
                        name={
                          u.target === "WordPress Core"
                            ? "wp"
                            : u.target.includes("Theme")
                            ? "img"
                            : "bolt"
                        }
                        size={14}
                      />
                    </div>
                    <div className="feed-body">
                      <div className="feed-title">
                        {u.target} <span className="dim" style={{ fontWeight: 400 }}>· {site.name}</span>
                      </div>
                      <div className="feed-meta">
                        <span className="mono">
                          {u.from} → <span style={{ color: "var(--cyan)" }}>{u.to}</span>
                        </span>
                        <span className="pip" />
                        <Badge
                          tone={
                            u.flag === "Safe update"
                              ? "ok"
                              : u.flag === "Do not update"
                              ? "crit"
                              : "high"
                          }
                        >
                          {u.flag}
                        </Badge>
                      </div>
                    </div>
                    <Badge tone={u.risk === "low" ? "ok" : u.risk === "medium" ? "high" : "crit"}>
                      {u.risk} risk
                    </Badge>
                  </div>
                );
              })
            ) : (
              <div className="empty">No pending WP core, theme, or plugin updates.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PriorityItem: React.FC<{
  rank: string;
  title: string;
  meta: string;
  reason: string;
  owner: string;
  onOpen: () => void;
}> = ({ rank, title, meta, reason, owner, onOpen }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "44px 1fr auto",
      gap: 14,
      alignItems: "center",
      padding: "12px 14px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--border-soft)",
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 22,
        fontWeight: 600,
        color: "var(--cyan)",
        textAlign: "center",
        letterSpacing: "-0.03em",
      }}
    >
      {rank}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>
        {meta}
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {reason}
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <span className="label-strip">Owner</span>
      <Badge tone="ghost">
        <Icon name="user" size={11} /> {owner}
      </Badge>
      <button className="btn sm" onClick={onOpen} type="button">
        Open <Icon name="chevron" size={11} />
      </button>
    </div>
  </div>
);

const ActivityRow: React.FC<{ a: any }> = ({ a }) => {
  const sevTone = a.sev === "crit" ? "crit" : a.sev === "high" ? "high" : a.sev === "med" ? "med" : "low";
  const iconName =
    {
      visual: "diff",
      tag: "code",
      js: "bolt",
      form: "file",
      ssl: "shield",
      sec: "shield",
      asset: "img",
      wp: "wp"
    }[a.type as string] || "activity";
  return (
    <div className="feed-item">
      <div className="feed-icon">
        <Icon name={iconName} size={14} />
      </div>
      <div className="feed-body">
        <div className="feed-title">{a.text}</div>
        <div className="feed-meta">
          <span>{a.site}</span>
          <span className="pip" />
          <span className="mono">{a.time}</span>
        </div>
      </div>
      <Badge tone={sevTone}>
        {a.sev === "crit" ? "Critical" : a.sev === "high" ? "High" : a.sev === "med" ? "Medium" : "Low"}
      </Badge>
    </div>
  );
};

const IssueRow: React.FC<{ issue: any; site: any; onClick: () => void }> = ({
  issue,
  site,
  onClick
}) => {
  if (!site) return null;
  return (
    <div className="feed-item" onClick={onClick}>
      <div className="fav" style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 13,
        border: "1px solid var(--border-mid)",
        background: `linear-gradient(135deg, ${site.brand}22, ${site.brand}08)`,
        color: site.brand,
        borderColor: `${site.brand}33`
      }}>{site.initials}</div>
      <div className="feed-body">
        <div className="feed-title">{issue.title}</div>
        <div className="feed-meta">
          <span>{site.name}</span>
          <span className="pip" />
          <span className="mono">{issue.page}</span>
          <span className="pip" />
          <span>{issue.category}</span>
        </div>
      </div>
      <SeverityChip level={issue.severity} />
    </div>
  );
};
