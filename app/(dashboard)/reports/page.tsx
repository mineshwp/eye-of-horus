"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { apiFetch } from "@/lib/auth/index";
import {
  Icon,
  Badge,
  Sparkline,
  ScoreBar,
} from "@/components/ui";

interface GeneratedReport {
  id: string;
  site_id: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  title: string | null;
  executive_summary: string | null;
  share_token: string | null;
  created_at: string;
}

export default function ReportsPage() {
  const { sites, issues, wpUpdates } = useApp();
  const [tab, setTab] = useState("Weekly summary");
  const tabs = ["Weekly summary", "Client-ready", "Internal dev", "Trends", "Generated"];
  const [generating, setGenerating] = useState(false);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  const fetchReports = useCallback(async () => {
    const res = await apiFetch("/api/reports/list?limit=20").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setGeneratedReports(data.reports || []);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleExportPDF = () => {
    window.print();
  };

  const handleGenerateReport = async () => {
    if (!sites.length) { alert("Add a client site before generating a report."); return; }
    setGenerating(true);
    setGenerateError(null);
    const site = sites.find((s) => s.id === selectedSiteId) || sites[0];
    try {
      const res = await apiFetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id, reportType: "monthly" }),
      });
      const data = await res.json();
      if (data.ok) {
        setTab("Generated");
        fetchReports();
      } else {
        setGenerateError(data.error || "Generation failed");
      }
    } catch {
      setGenerateError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="reports" size={22} />
            Reports &amp; insights
          </h1>
          <p className="page-sub">
            {sites.length > 0
              ? `Summaries and trend analysis across ${sites.length} monitored site${sites.length !== 1 ? "s" : ""}. Generate a shareable client report at any time.`
              : "Add client sites to start generating reports and insights."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleExportPDF} type="button">
            <Icon name="download" size={13} /> Export PDF
          </button>
          <button className="btn gold" onClick={handleGenerateReport} disabled={generating} type="button">
            <Icon name="sparkles" size={13} style={{ color: "var(--gold)" }} />
            {generating ? "Generating…" : "Generate client report"}
          </button>
        </div>
      </div>

      {generateError && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#FCA5A5", fontSize: 13 }}>
          Report generation failed: {generateError}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 16px",
              background: tab === t ? "var(--bg-panel)" : "transparent",
              border: `1px solid ${tab === t ? "var(--border-mid)" : "var(--border-soft)"}`,
              borderRadius: 10,
              color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Weekly summary" && <WeeklySummary />}
      {tab === "Client-ready" && (
        <ClientReady
          selectedSiteId={selectedSiteId}
          onSelectSite={setSelectedSiteId}
          onGenerate={handleGenerateReport}
          generating={generating}
        />
      )}
      {tab === "Internal dev" && <InternalDev />}
      {tab === "Trends" && <Trends />}
      {tab === "Generated" && (
        <GeneratedReports
          reports={generatedReports}
          generating={generating}
          onGenerate={handleGenerateReport}
          error={generateError}
        />
      )}
    </div>
  );
}

// ─── Generated Reports Tab ────────────────────────────────────────────────────

const GeneratedReports = ({
  reports,
  generating,
  onGenerate,
  error,
}: {
  reports: GeneratedReport[];
  generating: boolean;
  onGenerate: () => void;
  error: string | null;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Generate a new report</div>
        <div className="muted" style={{ fontSize: 12 }}>Compiles live data into a shareable client-facing monthly report.</div>
        {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>Error: {error}</div>}
      </div>
      <button className="btn gold" onClick={onGenerate} disabled={generating} type="button">
        <Icon name="sparkles" size={13} style={{ color: "var(--gold)" }} />
        {generating ? "Generating…" : "Generate report"}
      </button>
    </div>

    {reports.length === 0 ? (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">No reports generated yet. Click &ldquo;Generate report&rdquo; above to create your first.</div>
      </div>
    ) : (
      <div className="card">
        <div className="card-head">
          <h3><Icon name="file" size={14} /> Generated reports</h3>
          <span className="h-sub">{reports.length} reports</span>
        </div>
        <div>
          {reports.map((r) => (
            <div key={r.id} className="feed-item">
              <div
                className="feed-icon"
                style={{
                  borderColor: r.status === "ready" ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)",
                  color: r.status === "ready" ? "#86EFAC" : "#FCD37A",
                }}
              >
                <Icon name={r.status === "ready" ? "check" : "clock"} size={12} />
              </div>
              <div className="feed-body">
                <div className="feed-title">{r.title || `${r.report_type} report`}</div>
                <div className="feed-meta">
                  <span className="mono">{new Date(r.created_at).toLocaleString("en-ZA")}</span>
                  {r.executive_summary && (
                    <>
                      <span className="pip" />
                      <span style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>
                        {r.executive_summary.slice(0, 80)}…
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {r.share_token && (
                  <a
                    href={`/report/${r.share_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{ fontSize: 12, textDecoration: "none" }}
                  >
                    <Icon name="eye" size={11} /> View
                  </a>
                )}
                {r.share_token && (
                  <button
                    className="btn ghost"
                    style={{ fontSize: 12 }}
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/report/${r.share_token}`;
                      navigator.clipboard.writeText(url).then(() => alert("Share link copied!"));
                    }}
                  >
                    Copy link
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ─── Weekly Summary Tab ───────────────────────────────────────────────────────

const WeeklySummary = () => {
  const { sites, issues, wpUpdates } = useApp();

  const openIssues = issues.filter((i) => i.status !== "Resolved" && i.status !== "Ignored");
  const resolvedIssues = issues.filter((i) => i.status === "Resolved");
  const avgHealth = sites.length > 0
    ? Math.round(sites.reduce((s, site) => s + site.health, 0) / sites.length)
    : 0;
  const avgUptime = sites.length > 0
    ? (sites.reduce((s, site) => s + site.uptime, 0) / sites.length).toFixed(2)
    : "100.00";

  // Issue category breakdown
  const categoryCounts = issues.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalIssues = issues.length || 1;
  const categoryColors = ["#D9A05B", "#00E5FF", "#EF4444", "#8B5CF6", "#F59E0B", "#3B82F6"];
  const categoryRows = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count], idx) => ({
      label,
      count,
      pct: Math.round((count / totalIssues) * 100),
      color: categoryColors[idx % categoryColors.length],
    }));

  // Sites sorted by health (worst first) for portfolio cards
  const portfolioSites = [...sites].sort((a, b) => a.health - b.health).slice(0, 3);

  if (sites.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">No sites monitored yet. Add client sites to see your weekly summary.</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <TrendCard icon="shield" label="Avg health" value={String(avgHealth)} delta="" deltaDir="flat" color="#D9A05B" data={[avgHealth]} />
        <TrendCard icon="issue" label="Open issues" value={String(openIssues.length)} delta="" deltaDir="flat" color="#EF4444" data={[openIssues.length]} />
        <TrendCard icon="check" label="Resolved" value={String(resolvedIssues.length)} delta="" deltaDir="flat" color="#22C55E" data={[resolvedIssues.length]} />
        <TrendCard icon="clock" label="Avg uptime" value={avgUptime} unit="%" delta="" deltaDir="flat" color="#00E5FF" data={[parseFloat(avgUptime)]} />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="ai-callout">
          <span className="ai-tag">
            <Icon name="sparkles" size={11} /> Portfolio summary · Horus
          </span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, lineHeight: 1.4, marginTop: 12, marginBottom: 12 }}>
            {openIssues.filter((i) => i.severity === "critical").length > 0
              ? `${openIssues.filter((i) => i.severity === "critical").length} critical issue${openIssues.filter((i) => i.severity === "critical").length !== 1 ? "s" : ""} require immediate attention across your portfolio.`
              : sites.every((s) => s.status === "healthy")
              ? "All monitored sites are healthy. No critical issues detected."
              : `${sites.filter((s) => s.status !== "healthy").length} site${sites.filter((s) => s.status !== "healthy").length !== 1 ? "s" : ""} need attention.`}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.75 }}>
            <li>{sites.filter((s) => s.status === "healthy").length} of {sites.length} sites currently healthy</li>
            <li>{openIssues.length} open issue{openIssues.length !== 1 ? "s" : ""} · {resolvedIssues.length} resolved</li>
            {wpUpdates.length > 0 && <li>{wpUpdates.length} WordPress update{wpUpdates.length !== 1 ? "s" : ""} pending across portfolio</li>}
            {openIssues.filter((i) => i.severity === "critical").length === 0 && <li>No critical incidents detected</li>}
          </ul>
        </div>

        {categoryRows.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h3>Issue breakdown by category</h3>
              <span className="h-sub">{issues.length} total</span>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {categoryRows.map((c) => (
                <RecurringBar key={c.label} label={c.label} pct={c.pct} count={c.count} color={c.color} />
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head">
              <h3>Issue breakdown by category</h3>
            </div>
            <div className="empty" style={{ padding: "32px 18px" }}>No issues recorded yet.</div>
          </div>
        )}
      </div>

      {portfolioSites.length > 0 && (
        <div className="grid-3">
          {portfolioSites.map((site) => {
            const siteIssues = issues.filter((i) => i.siteId === site.id && i.status !== "Resolved" && i.status !== "Ignored");
            const bullets = siteIssues.length > 0
              ? siteIssues.slice(0, 3).map((i) => `${i.title} · ${i.severity}`)
              : ["No open issues · all checks passing"];
            return (
              <PortfolioCard
                key={site.id}
                site={site.name}
                status={site.status as "critical" | "attention" | "healthy"}
                health={site.health}
                bullets={bullets}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

// ─── Client-Ready Tab ─────────────────────────────────────────────────────────

const ClientReady = ({
  selectedSiteId,
  onSelectSite,
  onGenerate,
  generating,
}: {
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
}) => {
  const { sites, issues } = useApp();
  const site = sites.find((s) => s.id === selectedSiteId);

  if (sites.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">Add client sites to generate client-ready reports.</div>
      </div>
    );
  }

  const siteIssues = site ? issues.filter((i) => i.siteId === site.id && i.status !== "Resolved" && i.status !== "Ignored") : [];
  const resolvedCount = site ? issues.filter((i) => i.siteId === site.id && i.status === "Resolved").length : 0;

  return (
    <div className="grid-2">
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-head">
          <h3>
            <Icon name="file" size={14} />
            <select
              className="select"
              value={selectedSiteId}
              onChange={(e) => onSelectSite(e.target.value)}
              style={{ marginLeft: 8, fontSize: 13, fontWeight: 500 }}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </h3>
          <Badge tone="gold">Preview</Badge>
        </div>
        <div className="card-pad" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), transparent)" }}>
          <div className="label-strip" style={{ marginBottom: 6 }}>
            {new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })} · Website health report
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10 }}>
            {site?.name} · Website health report
          </div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 18 }}>
            Prepared by Wetpaint · powered by Eye of Horus
          </div>

          {site && (
            <>
              <ReportSection
                title="Highlights"
                items={[
                  `Uptime: ${site.uptime.toFixed(2)}%`,
                  `Health score: ${site.health}/100`,
                  resolvedCount > 0 ? `${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} resolved this period` : "No issues resolved yet this period",
                ]}
              />
              {siteIssues.length > 0 && (
                <ReportSection
                  title="What we're actioning"
                  items={siteIssues.slice(0, 3).map((i) => `${i.title} · ${i.severity}`)}
                />
              )}
              <ReportSection
                title="WordPress"
                items={[
                  site.wp.core === site.wp.coreLatest
                    ? `WordPress ${site.wp.core} is up to date`
                    : `WordPress core update available: ${site.wp.core} → ${site.wp.coreLatest}`,
                  site.wp.plugins > 0
                    ? `${site.wp.plugins} plugin update${site.wp.plugins !== 1 ? "s" : ""} pending`
                    : "All plugins up to date",
                ]}
              />
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Report options</h3>
          </div>
          <div className="card-pad">
            <ReportOption label="Period" value={new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })} />
            <ReportOption label="Format" value="PDF · print-friendly" />
            <ReportOption label="Site" value={site?.name ?? "—"} />
            <ReportOption label="Health score" value={site ? `${site.health}/100` : "—"} />
            <ReportOption label="Uptime" value={site ? `${site.uptime.toFixed(2)}%` : "—"} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn primary full" onClick={onGenerate} disabled={generating} type="button">
                {generating ? "Generating…" : "Generate & share report"}
              </button>
            </div>
          </div>
        </div>

        {site && (
          <div className="card">
            <div className="card-head">
              <h3>Site health at a glance</h3>
            </div>
            <div className="card-pad">
              <dl className="kv">
                <dt>Status</dt>
                <dd style={{ textTransform: "capitalize" }}>{site.status}</dd>
                <dt>Health</dt>
                <dd><ScoreBar value={site.health} /></dd>
                <dt>Open issues</dt>
                <dd>{siteIssues.length}</dd>
                <dt>WP plugins</dt>
                <dd>{site.wp.plugins > 0 ? `${site.wp.plugins} pending` : "Up to date"}</dd>
                <dt>Forms</dt>
                <dd style={{ textTransform: "capitalize" }}>{site.forms}</dd>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Internal Dev Tab ─────────────────────────────────────────────────────────

const InternalDev = () => {
  const { sites, issues, wpUpdates } = useApp();

  const criticalAndHigh = issues.filter(
    (i) => (i.severity === "critical" || i.severity === "high") && i.status !== "Resolved" && i.status !== "Ignored"
  );
  const resolved = issues.filter((i) => i.status === "Resolved");
  const wpPending = wpUpdates.filter((u) => u.flag !== "Do not update");
  const wpNeedStaging = wpUpdates.filter((u) => u.flag === "Needs staging test");

  if (sites.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">Add client sites to see the internal engineering digest.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card">
        <div className="card-head">
          <h3>
            <Icon name="code" size={14} /> Engineering digest
          </h3>
          <Badge tone="info">Internal · {new Date().toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}</Badge>
        </div>
        <div className="card-pad" style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
          {criticalAndHigh.length > 0 ? (
            <ReportSection
              title="Open priority work"
              items={criticalAndHigh.slice(0, 6).map((i) => {
                const site = sites.find((s) => s.id === i.siteId);
                return `${site?.name ?? "Unknown"}: ${i.title} — ${i.owner !== "Unassigned" ? i.owner : "unassigned"}`;
              })}
            />
          ) : (
            <ReportSection title="Open priority work" items={["No critical or high severity issues open."]} />
          )}

          {wpNeedStaging.length > 0 && (
            <ReportSection
              title="Pending staging tests"
              items={wpNeedStaging.slice(0, 5).map((u) => {
                const site = sites.find((s) => s.id === u.siteId);
                return `${site?.name ?? "Unknown"} — ${u.target} ${u.from} → ${u.to} · ${u.notes}`;
              })}
            />
          )}

          <ReportSection
            title="WordPress update queue"
            items={
              wpPending.length > 0
                ? [`${wpPending.length} update${wpPending.length !== 1 ? "s" : ""} pending across portfolio · ${wpNeedStaging.length} require staging test`]
                : ["No WordPress updates pending."]
            }
          />
        </div>
      </div>

      <div className="grid-3">
        <MicroStat label="Open issues" value={String(criticalAndHigh.length)} delta="critical + high" dir="flat" />
        <MicroStat label="Resolved" value={String(resolved.length)} delta="all time" dir="flat" />
        <MicroStat label="WP updates" value={String(wpUpdates.length)} delta="pending" dir="flat" />
      </div>
    </div>
  );
};

// ─── Trends Tab ───────────────────────────────────────────────────────────────

const Trends = () => {
  const { sites, issues } = useApp();

  const categoryColors: Record<string, string> = {
    "Visual regression": "#00E5FF",
    "WordPress update": "#D9A05B",
    "Performance": "#F59E0B",
    "Security": "#8B5CF6",
    "Form failure": "#EF4444",
    "Content": "#3B82F6",
    "JS error": "#EF4444",
    "Tracking": "#22C55E",
  };

  const categoryCounts = issues.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalIssues = issues.length || 1;
  const categoryRows = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / totalIssues) * 100),
      color: categoryColors[label] ?? "#D9A05B",
    }));

  // Health scores per site for form reliability equivalent
  const siteHealthRows = [...sites]
    .sort((a, b) => b.health - a.health)
    .map((s) => ({ label: s.name, pct: s.health, count: s.health, color: s.health >= 90 ? "#22C55E" : s.health >= 70 ? "#F59E0B" : "#EF4444" }));

  if (sites.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">Add client sites and run checks to start seeing trend data.</div>
      </div>
    );
  }

  return (
    <div className="grid-2eq">
      <div className="card">
        <div className="card-head">
          <h3>Health score · all sites</h3>
          <span className="h-sub">current</span>
        </div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {siteHealthRows.map((s) => (
            <RecurringBar key={s.label} label={s.label} pct={s.pct} count={s.count} color={s.color} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Issues by category</h3>
          <span className="h-sub">{issues.length} total</span>
        </div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {categoryRows.length > 0 ? (
            categoryRows.map((c) => (
              <RecurringBar key={c.label} label={c.label} pct={c.pct} count={c.count} color={c.color} />
            ))
          ) : (
            <div className="empty">No issues recorded yet.</div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Site status breakdown</h3>
          <span className="h-sub">{sites.length} sites</span>
        </div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Healthy", count: sites.filter((s) => s.status === "healthy").length, color: "#22C55E" },
            { label: "Attention", count: sites.filter((s) => s.status === "attention").length, color: "#F59E0B" },
            { label: "Critical", count: sites.filter((s) => s.status === "critical").length, color: "#EF4444" },
          ].map((row) => (
            <RecurringBar
              key={row.label}
              label={row.label}
              pct={sites.length > 0 ? Math.round((row.count / sites.length) * 100) : 0}
              count={row.count}
              color={row.color}
            />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>WordPress update risk</h3>
          <span className="h-sub">pending updates</span>
        </div>
        <div className="card-pad">
          <WpUpdateRisk />
        </div>
      </div>
    </div>
  );
};

const WpUpdateRisk = () => {
  const { wpUpdates } = useApp();
  const riskRows = [
    { label: "Safe to update", count: wpUpdates.filter((u) => u.flag === "Safe update").length, color: "#22C55E" },
    { label: "Needs staging", count: wpUpdates.filter((u) => u.flag === "Needs staging test").length, color: "#F59E0B" },
    { label: "Do not update", count: wpUpdates.filter((u) => u.flag === "Do not update").length, color: "#EF4444" },
  ];
  const total = wpUpdates.length || 1;
  if (wpUpdates.length === 0) return <div className="empty">No pending WordPress updates.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {riskRows.map((r) => (
        <RecurringBar key={r.label} label={r.label} pct={Math.round((r.count / total) * 100)} count={r.count} color={r.color} />
      ))}
    </div>
  );
};

// ─── Shared sub-components ────────────────────────────────────────────────────

const TrendCard = ({
  icon, label, value, unit, delta, deltaDir, color, data
}: {
  icon: string; label: string; value: string; unit?: string;
  delta: string; deltaDir: "up" | "down" | "flat"; color: string; data: number[];
}) => (
  <div className="card kpi-card">
    <div className="kpi-bg" style={{ background: `${color}33` }} />
    <div className="kpi-head"><Icon name={icon} size={13} /> {label}</div>
    <div className="kpi-value">
      {value}
      {unit && <span className="unit">{unit}</span>}
    </div>
    {delta && (
      <div className="kpi-foot">
        <span className={`delta ${deltaDir}`}>
          {deltaDir === "up" ? "▲ " : deltaDir === "down" ? "▼ " : ""}
          {delta}
        </span>
      </div>
    )}
    <div style={{ marginTop: 6 }}>
      <Sparkline points={data} color={color} height={32} />
    </div>
  </div>
);

const RecurringBar = ({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
      <span>{label}</span>
      <span className="mono">{count}</span>
    </div>
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, boxShadow: `0 0 10px ${color}88` }} />
    </div>
  </div>
);

const PortfolioCard = ({ site, status, health, bullets }: { site: string; status: "critical" | "attention" | "healthy"; health: number; bullets: string[] }) => {
  const statusMap = {
    critical: { tone: "crit" as const, text: "Needs action" },
    attention: { tone: "high" as const, text: "Attention" },
    healthy: { tone: "ok" as const, text: "Healthy" },
  };
  const m = statusMap[status] ?? statusMap.attention;
  return (
    <div className="card">
      <div className="card-head">
        <h3>{site}</h3>
        <Badge tone={m.tone} dot>{m.text}</Badge>
      </div>
      <div className="card-pad">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <div className="kpi-value" style={{ fontSize: 28 }}>{health}</div>
          <div className="dim" style={{ fontSize: 12 }}>health score</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ padding: "8px 0", borderTop: i === 0 ? 0 : "1px solid var(--border-soft)", fontSize: 13, color: "var(--text-secondary)" }}>
              · {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const ReportSection = ({ title, items }: { title: string; items: string[] }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--gold)" }}>{title}</div>
    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
      {items.map((i, k) => <li key={k}>{i}</li>)}
    </ul>
  </div>
);

const ReportOption = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
    <span className="dim" style={{ fontSize: 12.5 }}>{label}</span>
    <span style={{ fontSize: 13 }}>{value}</span>
  </div>
);

const MicroStat = ({ label, value, delta, dir }: { label: string; value: string; delta: string; dir: string }) => (
  <div className="card kpi-card">
    <div className="kpi-head">{label}</div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-foot">
      <span className={`delta ${dir}`}>{delta}</span>
    </div>
  </div>
);
