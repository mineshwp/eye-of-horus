"use client";

import React, { useState, useRef, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp, Site, Issue, WpUpdate } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/auth/index";
import {
  Icon,
  Badge,
  SeverityChip,
  StatusChip,
  ScoreBar,
  Sparkline,
  KPI,
  Tabs,
  Favicon,
} from "@/components/ui";

interface UptimeCheckRow {
  id: number;
  status: "up" | "down" | "degraded";
  http_status: number | null;
  response_time_ms: number | null;
  ssl_valid: boolean | null;
  ssl_days_remaining: number | null;
  ssl_expiry_date: string | null;
  error: string | null;
  checked_at: string;
}

interface WpSnapshot {
  id: number;
  site_id: string;
  wp_version: string | null;
  php_version: string | null;
  mysql_version: string | null;
  theme_data: { name: string; version: string; template: string; parent_theme: { name: string; version: string } | null; update_available: boolean; new_version: string | null } | null;
  plugin_data: { file: string; name: string; version: string; active: boolean; update_available: boolean; new_version: string | null }[] | null;
  update_data: { core_update: boolean; core_version: string | null; plugin_updates: number; theme_updates: number } | null;
  security_data: { debug_mode: boolean; admin_users: number; security_plugin: string | null; error_log_lines: string[] } | null;
  form_data: { plugin: string; name?: string; active: boolean; submissions?: number | null }[] | null;
  server_data: { db_size_mb: number | null; cron_enabled: boolean; site_health_ok: boolean | null; language: string; timezone: string } | null;
  created_at: string;
}

interface DomainCheckRow {
  id: string;
  domain: string;
  expiry_date: string | null;
  days_remaining: number | null;
  registrar: string | null;
  error: string | null;
  checked_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SiteDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: siteId } = use(params);
  const { sites, issues, wpUpdates, runScan, loading } = useApp();

  const site = sites.find((s) => s.id === siteId) || sites[0];
  const siteIssues = issues.filter((i) => i.siteId === site?.id);
  const siteUpdates = wpUpdates.filter((u) => u.siteId === site?.id);

  // Real uptime history from Supabase
  const [uptimeHistory, setUptimeHistory] = useState<UptimeCheckRow[]>([]);
  const [latestCheck, setLatestCheck] = useState<UptimeCheckRow | null>(null);

  const fetchUptimeHistory = useCallback(async () => {
    if (!site?.id) return;
    const { data } = await supabase
      .from("uptime_checks")
      .select("*")
      .eq("site_id", site.id)
      .order("checked_at", { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      setUptimeHistory(data as UptimeCheckRow[]);
      setLatestCheck(data[0] as UptimeCheckRow);
    }
  }, [site?.id]);

  // Latest WordPress plugin snapshot
  const [wpSnapshot, setWpSnapshot] = useState<WpSnapshot | null>(null);
  const [wpKeyMasked, setWpKeyMasked] = useState<string | null>(null);
  const [wpKeyGenerating, setWpKeyGenerating] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  // Phase 6: Analytics snapshot state
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<{
    ga: Record<string, unknown> | null;
    gsc: Record<string, unknown> | null;
    clarity: Record<string, unknown> | null;
    integration: { ga_property_id?: string; gsc_site_url?: string; clarity_project_id?: string } | null;
  } | null>(null);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);

  // Domain expiry
  const [domainCheck, setDomainCheck] = useState<DomainCheckRow | null>(null);

  const fetchDomainCheck = useCallback(async () => {
    if (!site?.id) return;
    const { data } = await supabase
      .from("domain_checks")
      .select("*")
      .eq("site_id", site.id)
      .order("checked_at", { ascending: false })
      .limit(1)
      .single();
    if (data) setDomainCheck(data as DomainCheckRow);
  }, [site?.id]);

  // Phase 7: AI state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fetchWpSnapshot = useCallback(async () => {
    if (!site?.id) return;
    const { data } = await supabase
      .from("wordpress_snapshots")
      .select("*")
      .eq("site_id", site.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) setWpSnapshot(data as WpSnapshot);

    const res = await apiFetch(`/api/sites/${site.id}/key`);
    if (res.ok) {
      const json = await res.json();
      setWpKeyMasked(json.has_key ? json.masked_key : null);
    }
  }, [site?.id]);

  const generateApiKey = async () => {
    setWpKeyGenerating(true);
    setNewlyGeneratedKey(null);
    try {
      const res = await apiFetch(`/api/sites/${site.id}/key`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setNewlyGeneratedKey(json.api_key);
        setWpKeyMasked(`${json.api_key.slice(0, 8)}…${json.api_key.slice(-4)}`);
      }
    } finally {
      setWpKeyGenerating(false);
    }
  };

  const fetchAnalyticsSnapshot = useCallback(async () => {
    if (!site?.id) return;
    const res = await apiFetch(`/api/analytics/snapshot?siteId=${site.id}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setAnalyticsSnapshot(data);
    }
  }, [site?.id]);

  const refreshAnalytics = useCallback(async () => {
    if (!site?.id) return;
    setAnalyticsRefreshing(true);
    await apiFetch('/api/analytics/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: site.id }),
    }).catch(() => null);
    await fetchAnalyticsSnapshot();
    setAnalyticsRefreshing(false);
  }, [site?.id, fetchAnalyticsSnapshot]);

  // Phase 7: AI functions
  const fetchAiSummary = useCallback(async () => {
    if (!site?.id) return;
    setAiSummaryLoading(true);
    const res = await apiFetch('/api/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: site.id }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      if (data.summary) setAiSummary(data.summary);
    }
    setAiSummaryLoading(false);
  }, [site?.id]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !site?.id || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    const res = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: site.id,
        question: userMsg,
        history: chatMessages.slice(-6),
      }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      if (data.answer) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
      }
    }
    setChatLoading(false);
  }, [chatInput, site?.id, chatLoading, chatMessages]);

  useEffect(() => {
    fetchUptimeHistory();
    fetchWpSnapshot();
    fetchAnalyticsSnapshot();
    fetchAiSummary();
    fetchDomainCheck();
  }, [fetchUptimeHistory, fetchWpSnapshot, fetchAnalyticsSnapshot, fetchAiSummary, fetchDomainCheck]);

  const [tab, setTab] = useState("Overview");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen]);

  if (!site) {
    return (
      <div className="page">
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div className="muted">No site found. Please return to the dashboard.</div>
          <button className="btn primary mt-4" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <Favicon site={site} size={44} />
            <div style={{ position: "relative" }} ref={pickerRef}>
              <h1 className="page-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                  className="site-picker-trigger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    background: "transparent",
                    border: 0,
                    padding: "2px 8px 2px 0",
                    margin: "-2px 0",
                    borderRadius: 8,
                    color: "inherit",
                    font: "inherit",
                    letterSpacing: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {site.name}
                  <Icon
                    name="chevronDown"
                    size={18}
                    style={{
                      color: "var(--text-tertiary)",
                      transition: "transform 150ms",
                      transform: pickerOpen ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>
                <StatusChip status={site.status} />
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, color: "var(--text-tertiary)", fontSize: 12.5 }}>
                <span className="mono">{site.url}</span>
                <span>·</span>
                <span>Last scan {site.lastScan}</span>
                <span>·</span>
                <span>Watching desktop / tablet / mobile · 18 pages</span>
              </div>

              {pickerOpen && (
                <SitePicker
                  currentId={site.id}
                  sites={sites}
                  onPick={(id) => {
                    setPickerOpen(false);
                    router.push(`/sites/${id}`);
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="btn text-decoration-none" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="link" size={13} /> Open site
          </a>
          <button className="btn" onClick={() => router.push("/settings")}>
            <Icon name="settings" size={13} /> Configure
          </button>
          <button className="btn" onClick={() => setChatOpen(true)} type="button">
            <Icon name="sparkles" size={13} /> Ask Horus
          </button>
          <button
            className="btn primary"
            onClick={async () => { await runScan(site.id); fetchUptimeHistory(); }}
            disabled={loading}
          >
            <Icon name="refresh" size={13} /> {loading ? "Scanning..." : "Re-scan now"}
          </button>
        </div>
      </div>

      <Tabs
        tabs={["Overview", "Issues", "Analytics", "SEO", "Marketing", "WordPress", "Performance", "Security", "Forms", "History"]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 18 }}>
        {tab === "Overview" && (
          <>
            <div className="grid-4" style={{ marginBottom: 18 }}>
              <ScoreCard label="Health" value={site.health} />
              <ScoreCard label="Performance" value={site.perf} />
              <ScoreCard label="Security" value={site.sec} />
              <div className="card kpi-card">
                <div className="kpi-bg" style={{ background: "rgba(34,197,94,0.16)" }} />
                <div className="kpi-head">
                  <Icon name="clock" size={13} /> Uptime
                </div>
                <div className="kpi-value">
                  {site.uptime.toFixed(2)}
                  <span className="unit">% / 30d</span>
                </div>
                <div className="kpi-foot">
                  <span className="delta flat">No downtime in 14 days</span>
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="ai-callout">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span className="ai-tag">
                    <Icon name="sparkles" size={11} /> Horus summary
                  </span>
                  <span className="dim" style={{ fontSize: 11 }}>
                    {site.name} · today
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.45, fontWeight: 500, marginBottom: 12 }}>
                  {aiSummaryLoading
                    ? <span className="muted" style={{ fontSize: 14 }}>Horus is analysing this site…</span>
                    : aiSummary
                    ? aiSummary
                    : siteIssues.length > 0
                    ? `${siteIssues.filter(i => i.severity === "critical" || i.severity === "high").length} priority issues are likely to impact clients today.`
                    : "No critical or high issues detected on this site."}
                </div>
                {!aiSummary && (
                  <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.65 }}>
                    {siteIssues.slice(0, 3).map((issue) => (
                      <li key={issue.id}>
                        <strong style={{ color: "var(--text-primary)" }}>{issue.title}</strong> — {issue.impact}
                      </li>
                    ))}
                    {siteIssues.length === 0 && (
                      <li>All checks passing successfully. Horus visual diff matches baseline.</li>
                    )}
                  </ul>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  {siteIssues.length > 0 && (
                    <button
                      className="btn primary sm"
                      onClick={() => router.push(`/issues/${siteIssues[0].id}`)}
                    >
                      Open top issue
                    </button>
                  )}
                  <button className="btn sm" onClick={fetchAiSummary} disabled={aiSummaryLoading} type="button">
                    {aiSummaryLoading ? 'Analysing…' : 'Refresh summary'}
                  </button>
                  <button className="btn ghost sm" onClick={() => setChatOpen(true)} type="button">
                    <Icon name="sparkles" size={11} /> Ask Horus
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <Icon name="wp" size={14} /> WordPress stack
                  </h3>
                  <span className="h-sub">{siteUpdates.length} pending</span>
                </div>
                <div className="card-pad">
                  <dl className="kv">
                    <dt>Core version</dt>
                    <dd className="mono">
                      {site.wp.core}{" "}
                      {site.wp.core !== site.wp.coreLatest && (
                        <Badge tone="high">update available · {site.wp.coreLatest}</Badge>
                      )}
                    </dd>
                    <dt>PHP</dt>
                    <dd className="mono">
                      8.2.18 <Badge tone="ok">supported</Badge>
                    </dd>
                    <dt>Active theme</dt>
                    <dd>Astra Pro 4.6.10</dd>
                    <dt>Plugins (active)</dt>
                    <dd>27 active · {site.wp.plugins} pending update</dd>
                    <dt>Forms</dt>
                    <dd>
                      {site.forms === "issue" ? (
                        <Badge tone="crit" dot>
                          Submissions failing on /contact-us
                        </Badge>
                      ) : (
                        <Badge tone="ok" dot>
                          All 4 forms posting
                        </Badge>
                      )}
                    </dd>
                    <dt>SSL</dt>
                    <dd>
                      {latestCheck ? (
                        latestCheck.ssl_valid ? (
                          <Badge tone={
                            (latestCheck.ssl_days_remaining ?? 999) < 7 ? "crit" :
                            (latestCheck.ssl_days_remaining ?? 999) < 30 ? "high" : "ok"
                          }>
                            Valid · {latestCheck.ssl_days_remaining ?? "?"} days remaining
                            {latestCheck.ssl_expiry_date ? ` · expires ${latestCheck.ssl_expiry_date}` : ""}
                          </Badge>
                        ) : (
                          <Badge tone="crit">
                            SSL issue{latestCheck.error ? `: ${latestCheck.error}` : ""}
                          </Badge>
                        )
                      ) : site.id === "acme" ? (
                        <Badge tone="high">Expires in 9 days</Badge>
                      ) : (
                        <Badge tone="ok">Valid · 84 days</Badge>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="card-head">
                  <h3>
                    <Icon name="activity" size={14} /> Health trend
                  </h3>
                  <span className="h-sub">30 days</span>
                </div>
                <div className="card-pad">
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <TrendRow
                      label="Performance"
                      value={site.perf}
                      delta="-4"
                      trend={[78, 80, 79, 77, 76, 72, 68, 72, 70, 72, 73, 72, 74, 72]}
                      color="#F59E0B"
                    />
                    <TrendRow
                      label="Security"
                      value={site.sec}
                      delta="+2"
                      trend={[80, 82, 83, 82, 84, 85, 84, 86, 85, 86, 87, 86, 87, 86]}
                      color="#22C55E"
                    />
                    <TrendRow
                      label="Health score"
                      value={site.health}
                      delta="-6"
                      trend={[74, 76, 72, 70, 71, 70, 68, 67, 66, 68, 66, 64, 64, 64]}
                      color="#D9A05B"
                    />
                    <TrendRow
                      label="Form success"
                      value={site.forms === "issue" ? 92 : 100}
                      delta={site.forms === "issue" ? "-8" : "0"}
                      trend={[98, 98, 97, 96, 96, 95, 94, 93, 94, 93, 92, 90, 92, site.forms === "issue" ? 92 : 100]}
                      color="#00E5FF"
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <Icon name="clock" size={14} /> Uptime history
                  </h3>
                  <span className="h-sub">last {uptimeHistory.length > 0 ? uptimeHistory.length : 20} checks</span>
                </div>
                <div className="card-pad">
                  {uptimeHistory.length > 0 ? (
                    <>
                      {/* Uptime bar — last 20 checks as coloured dots */}
                      <div style={{ display: "flex", gap: 4, marginBottom: 16, alignItems: "center" }}>
                        {[...uptimeHistory].reverse().map((chk, i) => (
                          <div
                            key={chk.id}
                            title={`${chk.status} · HTTP ${chk.http_status ?? "—"} · ${chk.response_time_ms ?? "—"}ms · ${new Date(chk.checked_at).toLocaleString("en-ZA")}`}
                            style={{
                              flex: 1,
                              height: 28,
                              borderRadius: 4,
                              background:
                                chk.status === "up" ? "var(--green)" :
                                chk.status === "degraded" ? "var(--amber)" :
                                "var(--red)",
                              opacity: i === uptimeHistory.length - 1 ? 1 : 0.55 + (i / uptimeHistory.length) * 0.4,
                              cursor: "default",
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginBottom: 14 }}>
                        <span>{uptimeHistory.length} checks ago</span>
                        <span>Now</span>
                      </div>

                      {/* Last check detail */}
                      {latestCheck && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Response time</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15, color: (latestCheck.response_time_ms ?? 0) > 3000 ? "var(--amber)" : "var(--green)" }}>
                              {latestCheck.response_time_ms != null ? `${latestCheck.response_time_ms}ms` : "—"}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>HTTP status</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15, color: (latestCheck.http_status ?? 0) < 400 ? "var(--green)" : "var(--red)" }}>
                              {latestCheck.http_status ?? "—"}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>SSL</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15, color: latestCheck.ssl_valid ? "var(--green)" : "var(--red)" }}>
                              {latestCheck.ssl_valid ? `Valid · ${latestCheck.ssl_days_remaining ?? "?"}d` : "Issue"}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Last check</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                              {new Date(latestCheck.checked_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="timeline">
                      <div className="timeline-item">
                        <div className="timeline-time">No live data yet</div>
                        <div className="timeline-text">Click "Re-scan now" to run the first live uptime check and start building history.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DomainCard domainCheck={domainCheck} siteUrl={site.url} />

            <div className="card">
              <div className="card-head">
                <h3>
                  <Icon name="issue" size={14} /> Open issues
                </h3>
                <span className="h-sub">{siteIssues.length} total</span>
              </div>
              <div>
                {siteIssues.map((i) => (
                  <div
                    key={i.id}
                    className="feed-item cursor-pointer"
                    onClick={() => router.push(`/issues/${i.id}`)}
                  >
                    <div className="feed-icon">
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            i.severity === "critical"
                              ? "#EF4444"
                              : i.severity === "high"
                              ? "#F59E0B"
                              : i.severity === "medium"
                              ? "#00E5FF"
                              : "#8A96A8",
                          boxShadow: `0 0 8px ${
                            i.severity === "critical"
                              ? "#EF4444"
                              : i.severity === "high"
                              ? "#F59E0B"
                              : i.severity === "medium"
                              ? "#00E5FF"
                              : "#8A96A8"
                          }`,
                        }}
                      />
                    </div>
                    <div className="feed-body">
                      <div className="feed-title">{i.title}</div>
                      <div className="feed-meta">
                        <span className="mono">{i.page}</span>
                        <span className="pip" />
                        <span>{i.category}</span>
                        <span className="pip" />
                        <span>Owner · {i.owner}</span>
                      </div>
                    </div>
                    <Badge tone="ghost">{i.status}</Badge>
                    <SeverityChip level={i.severity} />
                  </div>
                ))}
                {siteIssues.length === 0 && (
                  <div className="empty">No open issues — all checks passing.</div>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "Issues" && (
          <IssuesTab site={site} issues={siteIssues} router={router} />
        )}
        {tab === "Analytics" && <AnalyticsTab site={site} snapshot={analyticsSnapshot} onRefresh={refreshAnalytics} refreshing={analyticsRefreshing} />}
        {tab === "SEO" && <SeoTab site={site} snapshot={analyticsSnapshot} onRefresh={refreshAnalytics} refreshing={analyticsRefreshing} />}
        {tab === "Marketing" && <MarketingTab site={site} snapshot={analyticsSnapshot} />}
        {tab === "WordPress" && (
          <WordPressTab
            site={site}
            snapshot={wpSnapshot}
            keyMasked={wpKeyMasked}
            keyGenerating={wpKeyGenerating}
            newKey={newlyGeneratedKey}
            onGenerateKey={generateApiKey}
            updates={siteUpdates}
          />
        )}

        {tab === "History" && (
          <HistoryTab site={site} />
        )}

        {tab !== "Overview" && tab !== "Issues" && tab !== "Analytics" && tab !== "SEO" && tab !== "Marketing" && tab !== "WordPress" && tab !== "History" && (
          <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
            <div className="muted">
              The <strong>{tab}</strong> tab dives into {tab.toLowerCase()}-specific signals. Wired in the
              dashboard / WP / regression screens — switch tab to keep exploring this site, or open the
              dedicated screens from the sidebar.
            </div>
          </div>
        )}
      </div>

      {/* AI Chat Panel */}
      {chatOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
          onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}
        >
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-mid)', display: 'flex', flexDirection: 'column', height: '100vh', boxShadow: '-8px 0 40px rgba(0,0,0,0.4)' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="sparkles" size={16} style={{ color: 'var(--gold)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Ask Horus</div>
                <div className="muted" style={{ fontSize: 11 }}>AI assistant · {site.name}</div>
              </div>
              <button className="btn ghost" onClick={() => setChatOpen(false)} type="button" style={{ padding: '4px 8px', fontSize: 12 }}>✕</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Ask Horus anything about this site</div>
                  {['What are the top issues?', 'Is the SSL cert OK?', 'Any WordPress risks?', 'How is SEO looking?'].map((q) => (
                    <button
                      key={q}
                      className="btn ghost"
                      style={{ fontSize: 12, marginBottom: 8, display: 'block', width: '100%', textAlign: 'left' }}
                      onClick={() => { setChatInput(q); }}
                      type="button"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: msg.role === 'user' ? 'var(--gold)' : 'var(--surface-2)',
                    color: msg.role === 'user' ? '#0a0c12' : 'var(--text-primary)',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 4px', background: 'var(--surface-2)', fontSize: 13, color: 'var(--text-dim)' }}>
                    Horus is thinking…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="Ask anything about this site…"
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }}
              />
              <button className="btn primary" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} type="button" style={{ fontSize: 12 }}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ UI Helpers ============

const DomainCard = ({
  domainCheck,
  siteUrl,
}: {
  domainCheck: DomainCheckRow | null;
  siteUrl: string;
}) => {
  const hostname = (() => {
    try { return new URL(siteUrl).hostname; } catch { return siteUrl; }
  })();

  const days = domainCheck?.days_remaining ?? null;
  const urgencyColor =
    days === null ? "var(--text-dim)"
    : days < 7    ? "var(--red)"
    : days < 30   ? "var(--amber)"
    :               "var(--green)";

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>
          <Icon name="link" size={14} /> Domain Registration
        </h3>
        <span className="h-sub mono">{domainCheck?.domain ?? hostname}</span>
      </div>
      <div className="card-pad">
        {!domainCheck ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Domain data will appear here after the next scan. Click "Re-scan now" to populate.
          </div>
        ) : domainCheck.error ? (
          <div className="muted" style={{ fontSize: 13 }}>
            RDAP lookup unavailable — {domainCheck.error}. Domain expiry cannot be verified.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Days Remaining</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: urgencyColor }}>
                {days !== null ? `${days}d` : "—"}
              </div>
              {days !== null && days < 30 && (
                <div style={{ fontSize: 11, color: urgencyColor, marginTop: 2 }}>
                  {days < 7 ? "Renew immediately" : "Renew soon"}
                </div>
              )}
            </div>
            <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Expiry Date</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13 }}>
                {domainCheck.expiry_date
                  ? new Date(domainCheck.expiry_date).toLocaleDateString("en-ZA", {
                      day: "2-digit", month: "short", year: "numeric",
                    })
                  : "—"}
              </div>
            </div>
            <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Registrar</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", wordBreak: "break-word" }}>
                {domainCheck.registrar ?? "Unknown"}
              </div>
            </div>
            <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Last Checked</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {new Date(domainCheck.checked_at).toLocaleDateString("en-ZA", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ScoreCard = ({ label, value }: { label: string; value: number }) => {
  const color = value >= 90 ? "#22C55E" : value >= 75 ? "#00E5FF" : value >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div className="card kpi-card">
      <div className="kpi-bg" style={{ background: `${color}33` }} />
      <div className="kpi-head">{label}</div>
      <div className="kpi-value">
        {value}
        <span className="unit">/ 100</span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginTop: 4 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${value}%`,
            background: color,
            borderRadius: 4,
            boxShadow: `0 0 12px ${color}99`,
          }}
        />
      </div>
    </div>
  );
};

const TrendRow = ({
  label,
  value,
  delta,
  trend,
  color,
}: {
  label: string;
  value: number;
  delta: string;
  trend: number[];
  color: string;
}) => {
  const isUp = delta.startsWith("+");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 60px 1fr 60px", gap: 14, alignItems: "center" }}>
      <div style={{ fontSize: 13 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
        {value}
      </div>
      <div>
        <Sparkline points={trend} color={color} height={30} />
      </div>
      <div
        className="mono"
        style={{ fontSize: 12, textAlign: "right", color: isUp ? "var(--green)" : "var(--red)" }}
      >
        {delta}
      </div>
    </div>
  );
};

const SitePicker = ({
  currentId,
  sites,
  onPick,
}: {
  currentId: string;
  sites: Site[];
  onPick: (id: string) => void;
}) => {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.url.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div
      className="popover"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        width: 360,
        padding: 6,
        maxHeight: 480,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          margin: "2px 2px 6px",
          background: "var(--bg-inset)",
          border: "1px solid var(--border-soft)",
          borderRadius: 8,
        }}
      >
        <Icon name="search" size={13} style={{ color: "var(--text-dim)" }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Switch client website…"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: 0,
            fontSize: 13,
            color: "var(--text-primary)",
          }}
        />
        <span
          className="kbd"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            color: "var(--text-dim)",
            border: "1px solid var(--border-soft)",
          }}
        >
          esc
        </span>
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map((s) => {
          const isCurrent = s.id === currentId;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "30px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                background: isCurrent ? "rgba(0,229,255,0.06)" : "transparent",
                border: 0,
                borderRadius: 8,
                textAlign: "left",
                cursor: "pointer",
                color: "var(--text-primary)",
              }}
            >
              <Favicon site={s} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                  {s.url}
                </div>
              </div>
              <StatusChip status={s.status} />
              {isCurrent ? (
                <Icon name="check" size={14} style={{ color: "var(--cyan)" }} />
              ) : (
                <Icon name="chevron" size={12} style={{ color: "var(--text-dim)" }} />
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "18px 12px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No matching websites
          </div>
        )}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border-soft)",
          marginTop: 6,
          padding: "8px 4px 4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-dim)", paddingLeft: 6 }}>
          {filtered.length} of {sites.length} sites
        </span>
        <button className="btn ghost sm">
          <Icon name="plus" size={11} /> Add website
        </button>
      </div>
    </div>
  );
};

// ============ Issues Tab Component ============

interface IssuesTabProps {
  site: Site;
  issues: Issue[];
  router: any;
}

const IssuesTab = ({ site, issues, router }: IssuesTabProps) => {
  const [sev, setSev] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(issues[0]?.id || null);

  const filters = [
    { k: "All", n: issues.length },
    { k: "Critical", n: issues.filter((i) => i.severity === "critical").length },
    { k: "High", n: issues.filter((i) => i.severity === "high").length },
    { k: "Medium", n: issues.filter((i) => i.severity === "medium").length },
    { k: "Low", n: issues.filter((i) => i.severity === "low").length },
  ];

  const filtered = sev === "All" ? issues : issues.filter((i) => i.severity === sev.toLowerCase());

  if (issues.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 6 }}>
          All clear on {site.name}
        </div>
        <div className="muted">
          No open issues. Horus has scanned 18 pages across 3 viewports without flagging anything.
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="label-strip">Severity</span>
        <div className="filter-chips">
          {filters.map((f) => (
            <button
              key={f.k}
              className={`chip ${sev === f.k ? "active" : ""}`}
              onClick={() => setSev(f.k)}
              type="button"
            >
              {f.k} <span className="count">{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn sm">
            <Icon name="filter" size={12} /> Group by category
          </button>
          <button className="btn primary sm">
            <Icon name="sparkles" size={12} /> Auto-fix safe issues
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filtered.map((issue) => (
          <IssueAiCard
            key={issue.id}
            issue={issue}
            site={site}
            expanded={expanded === issue.id}
            onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)}
            onOpen={() => router.push(`/issues/${issue.id}`)}
          />
        ))}
      </div>
    </>
  );
};

const IssueAiCard = ({
  issue,
  site,
  expanded,
  onToggle,
  onOpen,
}: {
  issue: Issue;
  site: Site;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) => {
  const fix = AI_FIX_LIBRARY[issue.id as keyof typeof AI_FIX_LIBRARY] || AI_FIX_LIBRARY.default;
  const sevColor =
    {
      critical: "var(--red)",
      high: "var(--amber)",
      medium: "var(--cyan)",
      low: "var(--text-tertiary)",
    }[issue.severity] || "var(--text-tertiary)";

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        borderColor: expanded
          ? `${
              sevColor === "var(--red)"
                ? "rgba(239,68,68,0.30)"
                : sevColor === "var(--amber)"
                ? "rgba(245,158,11,0.30)"
                : "rgba(0,229,255,0.25)"
            }`
          : undefined,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          gap: 14,
          alignItems: "center",
          padding: "16px 18px",
          background: "transparent",
          border: 0,
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
        }}
        aria-expanded={expanded}
        type="button"
      >
        <div
          style={{
            width: 6,
            height: 44,
            borderRadius: 3,
            background: sevColor,
            boxShadow: `0 0 12px ${
              sevColor === "var(--red)"
                ? "rgba(239,68,68,0.5)"
                : sevColor === "var(--amber)"
                ? "rgba(245,158,11,0.45)"
                : "rgba(0,229,255,0.4)"
            }`,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <SeverityChip level={issue.severity} />
            <Badge tone="ghost">{issue.category}</Badge>
            <Badge tone="ghost">{issue.status}</Badge>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, marginBottom: 2 }}>
            {issue.title}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            <span className="mono">{issue.page}</span> · detected {issue.detected} · owner {issue.owner}
          </div>
        </div>
        <Badge tone="med">
          <Icon name="sparkles" size={11} /> Fix ready
        </Badge>
        <span className="mono dim" style={{ fontSize: 11 }}>
          conf {issue.confidence}%
        </span>
        <Icon
          name="chevronDown"
          size={16}
          style={{
            transition: "transform 180ms",
            transform: expanded ? "rotate(180deg)" : "none",
            color: "var(--text-tertiary)",
          }}
        />
      </button>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border-soft)",
            padding: "16px 18px 18px",
            background: "rgba(0,229,255,0.02)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="ai-tag">
                  <Icon name="sparkles" size={11} /> Horus recommends
                </span>
                <span className="dim" style={{ fontSize: 11.5 }}>
                  {fix.timeEstimate} · {fix.difficulty}
                </span>
              </div>

              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, lineHeight: 1.45, marginBottom: 14 }}>
                {fix.summary}
              </div>

              <div className="label-strip" style={{ marginBottom: 8 }}>
                Steps to fix
              </div>
              <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.7 }}>
                {fix.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>

              {fix.code && (
                <>
                  <div className="label-strip" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{fix.codeLabel || "Suggested patch"}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em", textTransform: "none" }}>
                      {fix.codeFile}
                    </span>
                  </div>
                  <CodeBlock content={fix.code} />
                </>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {fix.canAutoApply ? (
                  <button className="btn primary sm">
                    <Icon name="sparkles" size={12} /> Apply fix automatically
                  </button>
                ) : (
                  <button className="btn primary sm">
                    <Icon name="code" size={12} /> Copy patch
                  </button>
                )}
                <button className="btn sm">
                  <Icon name="plus" size={12} /> Create ticket
                </button>
                <button className="btn sm" onClick={onOpen}>
                  <Icon name="arrow" size={12} /> Open full detail
                </button>
                <button className="btn ghost sm">
                  <Icon name="x" size={12} /> Ignore
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                <div className="label-strip" style={{ marginBottom: 8 }}>
                  If fixed
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  {fix.impact.map((line, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <Icon name="check" size={12} style={{ color: "var(--green)", marginTop: 4, flex: "0 0 12px" }} />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {fix.alternatives && (
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 8 }}>
                    Alternative approaches
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fix.alternatives.map((alt, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{alt.title}</div>
                        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                          {alt.note}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: "12px 14px", background: "rgba(217,160,91,0.05)", border: "1px solid rgba(217,160,91,0.20)", borderRadius: 10 }}>
                <div className="label-strip" style={{ marginBottom: 6, color: "var(--gold)" }}>
                  Worth knowing
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>{fix.context}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CodeBlock = ({ content }: { content: string }) => (
  <pre
    style={{
      margin: 0,
      padding: "12px 14px",
      background: "var(--bg-inset)",
      border: "1px solid var(--border-soft)",
      borderRadius: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.55,
      color: "var(--text-secondary)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}
  >
    {content.split("\n").map((line, i) => {
      let color = "var(--text-secondary)";
      if (line.startsWith("- ")) color = "#FCA5A5";
      else if (line.startsWith("+ ")) color = "#86EFAC";
      else if (line.startsWith("// ") || line.startsWith("# ")) color = "var(--text-dim)";
      return (
        <div key={i} style={{ color }}>
          {line || "\u00A0"}
        </div>
      );
    })}
  </pre>
);

// ============ Analytics Tab Component ============

const AnalyticsTab = ({
  site,
  snapshot,
  onRefresh,
  refreshing,
}: {
  site?: { id: string; url: string };
  snapshot?: {
    ga: Record<string, unknown> | null;
    gsc: Record<string, unknown> | null;
    clarity: Record<string, unknown> | null;
    integration: { ga_property_id?: string } | null;
  } | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) => {
  const [range, setRange] = useState("Last 28 days");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _site = site;
  const isConnected = !!(snapshot?.integration?.ga_property_id);
  const traffic28 = [
    3120, 3210, 3080, 3340, 3500, 3420, 3260, 3180, 3290, 3410, 3520, 3650, 3580, 3420, 3300, 3210, 3380,
    3460, 3540, 3620, 3700, 3590, 3460, 3320, 3210, 3140, 3050, 3180,
  ];
  return (
    <>
      {!isConnected && (
        <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "rgba(217,160,91,0.06)", border: "1px solid rgba(217,160,91,0.2)" }}>
          <Icon name="activity" size={16} style={{ color: "var(--gold)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Google Analytics not connected</div>
            <div className="muted" style={{ fontSize: 12 }}>Set <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>GOOGLE_SERVICE_ACCOUNT_JSON</code> + configure the GA4 Property ID in site integrations to see real data. Data below is illustrative.</div>
          </div>
          {onRefresh && (
            <button className="btn" onClick={onRefresh} disabled={refreshing} type="button" style={{ fontSize: 12 }}>
              {refreshing ? "Refreshing…" : "Refresh data"}
            </button>
          )}
        </div>
      )}
      {isConnected && (
        <div style={{ marginBottom: 18, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onRefresh} disabled={refreshing} type="button" style={{ fontSize: 12 }}>
            {refreshing ? "Refreshing…" : "↻ Refresh analytics"}
          </button>
        </div>
      )}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <Badge tone="ok" dot>
          GA4 connected
        </Badge>
        <Badge tone="ghost">Property G-XJ8FZP · linked 12 Apr 2026</Badge>
        <Badge tone="info">Search Console verified</Badge>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Range</span>
          <select className="select" value={range} onChange={(e) => setRange(e.target.value)}>
            <option>Last 7 days</option>
            <option>Last 28 days</option>
            <option>Last 90 days</option>
            <option>Year to date</option>
          </select>
          <button className="btn sm">
            <Icon name="download" size={12} /> Export
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI
          icon="user"
          label="Visitors"
          value="48,212"
          delta="+8.4%"
          deltaDir="up"
          glow="rgba(0,229,255,0.22)"
          spark={traffic28.slice(-14)}
          sparkColor="#00E5FF"
        />
        <KPI
          icon="activity"
          label="Sessions"
          value="62,540"
          delta="+5.1%"
          deltaDir="up"
          glow="rgba(139,92,246,0.22)"
          spark={[58, 60, 59, 62, 63, 62, 64].map((n) => n * 1000)}
          sparkColor="#8B5CF6"
        />
        <KPI
          icon="eye"
          label="Page views"
          value="184k"
          delta="+11.6%"
          deltaDir="up"
          glow="rgba(217,160,91,0.22)"
          spark={[160, 162, 168, 172, 175, 180, 184].map((n) => n * 1000)}
          sparkColor="#D9A05B"
        />
        <KPI
          icon="bolt"
          label="Avg session"
          value="2:41"
          delta="-0:08"
          deltaDir="down"
          glow="rgba(245,158,11,0.20)"
          spark={[185, 188, 184, 179, 176, 170, 161]}
          sparkColor="#F59E0B"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="activity" size={14} /> Visitors over time
            </h3>
            <div style={{ display: "flex", gap: 6 }}>
              <Badge tone="med">Visitors</Badge>
              <Badge tone="ghost">Sessions</Badge>
              <Badge tone="ghost">Bounce</Badge>
            </div>
          </div>
          <div className="card-pad">
            <Sparkline points={traffic28} color="#00E5FF" height={180} />
          </div>
        </div>

        <div className="ai-callout">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> Horus · analytics watch
            </span>
            <span className="dim mono" style={{ fontSize: 11 }}>
              updated 6 min ago
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.45, fontWeight: 500, marginBottom: 12 }}>
            Mobile session length dropped 8% this week, concentrated on the homepage.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Correlates with the mobile hero CTA missing (open issue · I-1)</li>
            <li>Bounce on / from organic traffic up from 38% → 47%</li>
            <li>iOS Safari accounts for 73% of the drop</li>
          </ul>
          <button className="btn primary sm" style={{ marginTop: 14 }}>
            Open related issue
          </button>
        </div>
      </div>

      <div className="grid-2eq" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Top pages · last 28 days</h3>
            <span className="h-sub">by pageviews</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PageRow page="/" views={42180} pct={100} delta="+4.2%" trend="up" />
            <PageRow page="/services" views={28640} pct={68} delta="+2.1%" trend="up" />
            <PageRow page="/loan-calculator" views={19320} pct={46} delta="+18.7%" trend="up" />
            <PageRow page="/about" views={14210} pct={34} delta="-1.4%" trend="down" />
            <PageRow page="/contact-us" views={11860} pct={28} delta="-3.8%" trend="down" />
            <PageRow page="/blog" views={8940} pct={21} delta="+0.9%" trend="up" />
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-head">
              <h3>Acquisition channel</h3>
              <span className="h-sub">share of sessions</span>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <RecurringBarLite label="Organic search" pct={48} val="29,841" color="#22C55E" />
              <RecurringBarLite label="Direct" pct={22} val="13,758" color="#00E5FF" />
              <RecurringBarLite label="Paid · Google" pct={14} val="8,755" color="#D9A05B" />
              <RecurringBarLite label="Social · Meta" pct={9} val="5,628" color="#3B82F6" />
              <RecurringBarLite label="Referral" pct={5} val="3,127" color="#8B5CF6" />
              <RecurringBarLite label="Email" pct={2} val="1,431" color="#EF4444" />
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h3>Device split</h3>
            </div>
            <div className="card-pad">
              <DeviceSegment
                items={[
                  { label: "Mobile · 61%", value: 61, color: "#00E5FF", icon: "mobile" },
                  { label: "Desktop · 32%", value: 32, color: "#8B5CF6", icon: "desktop" },
                  { label: "Tablet · 7%", value: 7, color: "#D9A05B", icon: "tablet" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Conversion funnel · loan application</h3>
            <span className="h-sub">last 28 days</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FunnelStep label="Visited homepage" count="48,212" pct={100} color="#00E5FF" />
            <FunnelStep label="Opened calculator" count="19,320" pct={40} color="#7DD3FC" />
            <FunnelStep label="Started application" count="6,084" pct={12.6} color="#D9A05B" />
            <FunnelStep label="Submitted application" count="2,418" pct={5.0} color="#22C55E" />
            <FunnelStep label="Approved" count="1,184" pct={2.5} color="#15803D" />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Top countries</h3>
            <span className="h-sub">visitors</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RecurringBarLite label="South Africa" pct={62} val="29,891" color="#22C55E" />
            <RecurringBarLite label="United Kingdom" pct={14} val="6,762" color="#3B82F6" />
            <RecurringBarLite label="Namibia" pct={8} val="3,840" color="#D9A05B" />
            <RecurringBarLite label="Botswana" pct={6} val="2,895" color="#8B5CF6" />
            <RecurringBarLite label="United States" pct={5} val="2,420" color="#00E5FF" />
            <RecurringBarLite label="Other" pct={5} val="2,404" color="#5A6578" />
          </div>
        </div>
      </div>
    </>
  );
};

// ============ SEO Tab Component ============

const SeoTab = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  site,
  snapshot,
  onRefresh,
  refreshing,
}: {
  site?: { id: string };
  snapshot?: {
    ga: Record<string, unknown> | null;
    gsc: Record<string, unknown> | null;
    clarity: Record<string, unknown> | null;
    integration: { gsc_site_url?: string } | null;
  } | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) => {
  const gsc = snapshot?.gsc as { queries?: unknown[]; pages?: unknown[]; metrics?: Record<string, unknown> } | null | undefined;
  const isConnected = !!(snapshot?.integration?.gsc_site_url);
  const strikingDistance = (gsc?.metrics?.strikingDistance as Array<{ query: string; impressions: number; position: number }> | null) ?? [];

  const [selectedKw, setSelectedKw] = useState<{ query: string; position: number; impressions: number } | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const handleGenerateBrief = async (kw: { query: string; position: number; impressions: number }) => {
    setSelectedKw(kw);
    setBrief(null);
    setBriefLoading(true);
    try {
      const res = await apiFetch('/api/ai/seo-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site?.id,
          keyword: kw.query,
          position: kw.position,
          impressions: kw.impressions
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.brief) {
          setBrief(data.brief);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <>
      {!isConnected && (
        <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.15)" }}>
          <Icon name="search" size={16} style={{ color: "#00E5FF" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Google Search Console not connected</div>
            <div className="muted" style={{ fontSize: 12 }}>Configure the GSC site URL via <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>POST /api/analytics/integrations</code> to see real query data, striking-distance keywords, and indexing status.</div>
          </div>
          {onRefresh && <button className="btn" onClick={onRefresh} disabled={refreshing} type="button" style={{ fontSize: 12 }}>{refreshing ? "Refreshing…" : "Refresh"}</button>}
        </div>
      )}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <Badge tone="ok" dot>
          Search Console connected
        </Badge>
        <Badge tone="ghost">sc-domain:acmefinance.co.za</Badge>
        <Badge tone="info">Sitemap submitted · 184 URLs</Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn sm">
            <Icon name="refresh" size={12} /> Re-crawl
          </button>
          <button className="btn sm">
            <Icon name="download" size={12} /> Export report
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI
          icon="search"
          label="Organic clicks"
          value="14,820"
          delta="+12%"
          deltaDir="up"
          glow="rgba(34,197,94,0.20)"
          spark={[1100, 1150, 1180, 1240, 1280, 1320, 1380, 1420]}
          sparkColor="#22C55E"
        />
        <KPI
          icon="eye"
          label="Impressions"
          value="284k"
          delta="+6.8%"
          deltaDir="up"
          glow="rgba(0,229,255,0.20)"
          spark={[245, 250, 256, 262, 268, 272, 278, 284].map((n) => n * 1000)}
          sparkColor="#00E5FF"
        />
        <KPI
          icon="bolt"
          label="Avg position"
          value="11.4"
          delta="-0.8"
          deltaDir="up"
          glow="rgba(217,160,91,0.20)"
          spark={[14, 13.6, 13.2, 12.8, 12.4, 12, 11.6, 11.4]}
          sparkColor="#D9A05B"
        />
        <KPI
          icon="shield"
          label="Indexed pages"
          value="167"
          unit="/ 184"
          delta="17 excluded"
          deltaDir="flat"
          glow="rgba(139,92,246,0.20)"
          spark={[160, 162, 163, 164, 165, 166, 167, 167]}
          sparkColor="#8B5CF6"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="search" size={14} /> Top queries
            </h3>
            <span className="h-sub">last 28 days</span>
          </div>
          <div className="card-pad">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div className="label-strip">Query</div>
              <div className="label-strip" style={{ textAlign: "right" }}>
                Clicks
              </div>
              <div className="label-strip" style={{ textAlign: "right" }}>
                Impr.
              </div>
              <div className="label-strip" style={{ textAlign: "right" }}>
                Pos.
              </div>
            </div>
            <QueryRow q="acme finance loan" c="3,840" i="14,210" p="2.1" pUp />
            <QueryRow q="home loan calculator sa" c="2,180" i="22,420" p="3.8" pUp />
            <QueryRow q="acme finance" c="1,940" i="3,810" p="1.2" pUp />
            <QueryRow q="business loan south africa" c="1,420" i="38,210" p="8.6" pDown />
            <QueryRow q="bond pre-approval" c="940" i="12,180" p="4.4" pUp />
            <QueryRow q="instant approval finance" c="720" i="28,180" p="14.2" pDown />
            <QueryRow q="loan repayment estimate" c="640" i="11,820" p="5.2" pUp />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Keyword movement</h3>
            <span className="h-sub">vs last week</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <KwShift query="home loan calculator sa" from={11} to={4} dir="up" />
            <KwShift query="acme finance loan" from={4} to={2} dir="up" />
            <KwShift query="bond pre-approval" from={7} to={4} dir="up" />
            <KwShift query="loan repayment estimate" from={9} to={5} dir="up" />
            <KwShift query="business loan south africa" from={6} to={9} dir="down" />
            <KwShift query="instant approval finance" from={11} to={14} dir="down" />
          </div>
        </div>
      </div>

      <div className="grid-2eq" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="shield" size={14} /> Technical SEO
            </h3>
            <span className="h-sub">audit · today</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SeoCheck tone="ok" label="Robots.txt" note="Reachable · 18 disallow rules" />
            <SeoCheck tone="ok" label="Sitemap.xml" note="184 URLs · last fetched 3 hours ago" />
            <SeoCheck tone="ok" label="Canonical tags" note="178 pages · 0 self-conflicting" />
            <SeoCheck tone="warn" label="Meta descriptions" note="12 pages missing · 4 truncated > 160" />
            <SeoCheck tone="warn" label="Title tags" note="3 pages duplicate / 2 over 60 chars" />
            <SeoCheck tone="crit" label="Structured data" note="Schema errors on 6 product pages" />
            <SeoCheck tone="ok" label="HTTPS / HSTS" note="HSTS preload eligible" />
            <SeoCheck tone="warn" label="Core Web Vitals" note="LCP needs improvement on /services" />
            <SeoCheck tone="ok" label="Mobile usability" note="0 issues in last crawl" />
          </div>
        </div>

        <div className="col">
          <div className="ai-callout">
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> SEO opportunities
            </span>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.45, fontWeight: 500, margin: "10px 0 12px" }}>
              3 quick wins could lift organic clicks ~9% in the next 30 days.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
              <li>
                <strong style={{ color: "var(--text-primary)" }}>Fix product schema errors</strong> · 6 pages losing rich-result
                eligibility
              </li>
              <li>
                <strong style={{ color: "var(--text-primary)" }}>Add meta descriptions</strong> to 12 high-traffic pages
              </li>
              <li>
                <strong style={{ color: "var(--text-primary)" }}>Internal link to /loan-calculator</strong> from 14 service pages — currently
                underlinked
              </li>
            </ul>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h3>
                <Icon name="link" size={14} /> Backlink profile
              </h3>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="bar-row">
                <div className="bar-label">Referring domains</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "72%", background: "#22C55E" }} />
                </div>
                <div className="bar-val mono">228</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">Total backlinks</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "84%", background: "#00E5FF" }} />
                </div>
                <div className="bar-val mono">3,140</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">New this month</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "26%", background: "#D9A05B" }} />
                </div>
                <div className="bar-val mono">+62</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">Lost this month</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "9%", background: "#EF4444" }} />
                </div>
                <div className="bar-val mono">-14</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Page indexing status</h3>
        </div>
        <div className="card-pad">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <IndexCell label="Submitted & indexed" value={167} tone="ok" />
            <IndexCell label="Discovered · not indexed" value={9} tone="med" />
            <IndexCell label="Crawled · not indexed" value={5} tone="med" />
            <IndexCell label="Excluded by noindex" value={3} tone="low" />
          </div>
        </div>
      </div>
      {strikingDistance.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <h3><Icon name="bolt" size={14} /> Striking distance keywords</h3>
            <span className="h-sub">positions 11–20 · quick wins</span>
          </div>
          <div style={{ padding: "0 18px 18px" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              These keywords rank on page 2. Improving the target pages could significantly increase organic clicks.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 110px", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div className="label-strip">Query</div>
              <div className="label-strip" style={{ textAlign: "right" }}>Impr.</div>
              <div className="label-strip" style={{ textAlign: "right" }}>Position</div>
              <div className="label-strip" style={{ textAlign: "center" }}>Opp.</div>
              <div className="label-strip" style={{ textAlign: "right" }}>AI Brief</div>
            </div>
            {strikingDistance.map((kw, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 110px", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border-soft)", fontSize: 13 }}>
                <span>{kw.query}</span>
                <span className="mono" style={{ textAlign: "right" }}>{kw.impressions.toLocaleString()}</span>
                <span className="mono" style={{ textAlign: "right", color: "var(--gold)" }}>{kw.position.toFixed(1)}</span>
                <div style={{ display: "flex", justifyContent: "center" }}><Badge tone="gold">Page 2</Badge></div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn primary sm" onClick={() => handleGenerateBrief(kw)} style={{ fontSize: 11, padding: "4px 8px" }}>
                    <Icon name="sparkles" size={10} /> SEO Brief
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedKw && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(5, 5, 5, 0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 20
        }}>
          <div className="card" style={{ maxWidth: 600, width: "100%", padding: 24, position: "relative", border: "1px solid var(--gold)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="ai-tag">
                  <Icon name="sparkles" size={11} /> Content Brief
                </span>
                <span style={{ fontWeight: 600, fontSize: 16 }}>"{selectedKw.query}"</span>
              </div>
              <button className="btn ghost sm" onClick={() => setSelectedKw(null)} style={{ padding: 6, minWidth: 0, width: 28, height: 28 }}>
                <Icon name="x" size={14} />
              </button>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div style={{ padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
                <div className="label-strip" style={{ marginBottom: 4 }}>Current Position</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--gold)" }}>{selectedKw.position.toFixed(1)}</div>
              </div>
              <div style={{ padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
                <div className="label-strip" style={{ marginBottom: 4 }}>Monthly Impressions</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--cyan)" }}>{selectedKw.impressions.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ minHeight: 200, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {briefLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
                  <span className="dim" style={{ fontStyle: "italic" }}>Horus is researching search intent and compiling an optimization brief...</span>
                </div>
              ) : brief ? (
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {brief}
                </div>
              ) : (
                <div style={{ color: "var(--red)" }}>Failed to generate brief. Please ensure ANTHROPIC_API_KEY is configured.</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              {brief && (
                <button className="btn" onClick={() => {
                  navigator.clipboard.writeText(brief);
                  alert("Copied SEO brief to clipboard!");
                }}>
                  <Icon name="download" size={12} /> Copy to clipboard
                </button>
              )}
              <button className="btn primary" onClick={() => setSelectedKw(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============ Marketing Tab Component ============

const MarketingTab = ({
  site,
  snapshot,
}: {
  site?: { id: string };
  snapshot?: {
    ga: Record<string, unknown> | null;
    gsc: Record<string, unknown> | null;
    clarity: Record<string, unknown> | null;
    integration: { clarity_project_id?: string } | null;
  } | null;
}) => {
  const clarity = snapshot?.clarity?.metrics as Record<string, unknown> | null | undefined;
  const clarityConnected = !!(snapshot?.integration?.clarity_project_id);

  const [strategy, setStrategy] = useState<string | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [blogIdeas, setBlogIdeas] = useState<string | null>(null);
  const [blogLoading, setBlogLoading] = useState(false);
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorResult, setCompetitorResult] = useState<string | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);

  const fetchStrategy = async () => {
    if (!site?.id || strategyLoading) return;
    setStrategyLoading(true);
    try {
      const res = await apiFetch('/api/ai/marketing-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.strategy) setStrategy(data.strategy);
      }
    } finally {
      setStrategyLoading(false);
    }
  };

  const fetchBlogIdeas = async () => {
    if (!site?.id || blogLoading) return;
    setBlogLoading(true);
    try {
      const res = await apiFetch('/api/ai/blog-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ideas) setBlogIdeas(data.ideas);
      }
    } finally {
      setBlogLoading(false);
    }
  };

  const fetchCompetitorAnalysis = async () => {
    if (!site?.id || !competitorUrl.trim() || competitorLoading) return;
    setCompetitorLoading(true);
    try {
      const res = await apiFetch('/api/ai/competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, competitorUrl: competitorUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) setCompetitorResult(data.analysis);
      }
    } finally {
      setCompetitorLoading(false);
    }
  };

  return (
    <>
      {/* AI Marketing Strategy */}
      <div className="ai-callout" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span className="ai-tag">
            <Icon name="sparkles" size={11} /> Horus · Marketing strategy
          </span>
          <button
            className="btn sm"
            onClick={fetchStrategy}
            disabled={strategyLoading}
            type="button"
          >
            {strategyLoading ? "Generating…" : strategy ? "Refresh" : "Generate strategy"}
          </button>
        </div>
        {strategy ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {strategy}
          </div>
        ) : strategyLoading ? (
          <div className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>
            Horus is analysing your analytics data and building a strategy…
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Click &quot;Generate strategy&quot; to get AI-driven marketing recommendations based on this site&apos;s real GA4 and Search Console data.
          </div>
        )}
      </div>

      {/* Blog Ideas */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3><Icon name="sparkles" size={14} /> Blog &amp; content ideas</h3>
          <button
            className="btn sm"
            onClick={fetchBlogIdeas}
            disabled={blogLoading}
            type="button"
          >
            {blogLoading ? "Generating…" : blogIdeas ? "Refresh ideas" : "Generate ideas"}
          </button>
        </div>
        <div className="card-pad">
          {blogIdeas ? (
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {blogIdeas}
            </div>
          ) : blogLoading ? (
            <div className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>
              Horus is reviewing your keyword data and building content ideas…
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Generate data-driven blog ideas based on this site&apos;s striking-distance keywords and top performing pages. Connect Google Search Console for best results.
            </div>
          )}
        </div>
      </div>

      {/* Competitor Analysis */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3><Icon name="activity" size={14} /> Competitor analysis</h3>
        </div>
        <div className="card-pad">
          <div style={{ display: "flex", gap: 10, marginBottom: competitorResult ? 18 : 0 }}>
            <input
              type="url"
              className="input"
              placeholder="https://competitor.com"
              value={competitorUrl}
              onChange={(e) => setCompetitorUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchCompetitorAnalysis()}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              className="btn primary sm"
              onClick={fetchCompetitorAnalysis}
              disabled={competitorLoading || !competitorUrl.trim()}
              type="button"
            >
              {competitorLoading ? "Analysing…" : "Analyse"}
            </button>
          </div>
          {competitorResult && (
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap", borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="ai-tag"><Icon name="sparkles" size={11} /> Horus analysis · {competitorUrl}</span>
              </div>
              {competitorResult}
            </div>
          )}
          {!competitorResult && !competitorLoading && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Enter a competitor URL and Horus will analyse their positioning, SEO strategy, UX, and opportunities for your client.
            </div>
          )}
        </div>
      </div>

      {/* Microsoft Clarity UX signals */}
      {clarityConnected && clarity && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <h3><Icon name="eye" size={14} /> Microsoft Clarity · UX signals</h3>
            <Badge tone="ok" dot>Live</Badge>
          </div>
          <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {[
              { label: "Rage clicks", value: String(clarity.rageClicks ?? 0), bad: Number(clarity.rageClicks ?? 0) > 10 },
              { label: "Dead clicks", value: String(clarity.deadClicks ?? 0), bad: Number(clarity.deadClicks ?? 0) > 50 },
              { label: "Quick backs", value: String(clarity.quickBacks ?? 0), bad: Number(clarity.quickBacks ?? 0) > 20 },
              { label: "Excessive scrolls", value: String(clarity.excessiveScrolls ?? 0), bad: Number(clarity.excessiveScrolls ?? 0) > 30 },
              { label: "JS errors", value: String(clarity.jsErrors ?? 0), bad: Number(clarity.jsErrors ?? 0) > 0 },
              { label: "Scroll depth", value: `${clarity.scrollDepth ?? 0}%`, bad: false },
            ].map(({ label, value, bad }) => (
              <div key={label} style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: bad ? "#EF4444" : "var(--text-primary)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!clarityConnected && (
        <div className="card" style={{ marginTop: 18, padding: "14px 18px", display: "flex", gap: 14, alignItems: "center", background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <Icon name="eye" size={16} style={{ color: "#8B5CF6" }} />
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Microsoft Clarity not connected</div>
            <div className="muted" style={{ fontSize: 12 }}>Add your Clarity Project ID and API key via site integrations to see rage clicks, dead clicks, and scroll depth data.</div>
          </div>
        </div>
      )}
    </>
  );
};

// ============ Shared Small Components ============

const PageRow = ({
  page,
  views,
  pct,
  delta,
  trend,
}: {
  page: string;
  views: number;
  pct: number;
  delta: string;
  trend: string;
}) => (
  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 80px", gap: 12, alignItems: "center" }}>
    <div className="mono" style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
      {page}
    </div>
    <div className="bar-track">
      <div
        className="bar-fill"
        style={{ width: `${pct}%`, background: "#00E5FF", boxShadow: "0 0 8px rgba(0,229,255,0.5)" }}
      />
    </div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>
      {views.toLocaleString()}
    </div>
    <div
      className="mono"
      style={{ fontSize: 12, textAlign: "right", color: trend === "up" ? "var(--green)" : "var(--red)" }}
    >
      {delta}
    </div>
  </div>
);

const RecurringBarLite = ({
  label,
  pct,
  val,
  color,
}: {
  label: string;
  pct: number;
  val: string;
  color: string;
}) => (
  <div className="bar-row">
    <div className="bar-label">{label}</div>
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}99` }} />
    </div>
    <div className="bar-val mono">{val}</div>
  </div>
);

const DeviceSegment = ({ items }: { items: { label: string; value: number; color: string; icon: string }[] }) => (
  <div>
    <div
      style={{
        display: "flex",
        height: 10,
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid var(--border-soft)",
        marginBottom: 12,
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          style={{ width: `${it.value}%`, background: it.color, boxShadow: `inset 0 0 6px ${it.color}88` }}
        />
      ))}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
          <Icon name={it.icon} size={12} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ fontSize: 13 }}>{it.label}</span>
        </div>
      ))}
    </div>
  </div>
);

const FunnelStep = ({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: string;
  pct: number;
  color: string;
}) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        {count} <span className="dim">· {pct}%</span>
      </span>
    </div>
    <div style={{ height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, boxShadow: `0 0 10px ${color}aa` }} />
    </div>
  </div>
);

const QueryRow = ({ q, c, i, p, pUp, pDown }: { q: string; c: string; i: string; p: string; pUp?: boolean; pDown?: boolean }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 70px 70px 70px",
      gap: 10,
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid var(--border-soft)",
    }}
  >
    <div
      className="mono"
      style={{
        fontSize: 12.5,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {q}
    </div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>
      {c}
    </div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right", color: "var(--text-tertiary)" }}>
      {i}
    </div>
    <div
      className="mono"
      style={{
        fontSize: 12,
        textAlign: "right",
        color: pUp ? "var(--green)" : pDown ? "var(--red)" : "var(--text-primary)",
      }}
    >
      {p}
      {pUp && " ▲"}
      {pDown && " ▼"}
    </div>
  </div>
);

const KwShift = ({ query, from, to, dir }: { query: string; from: number; to: number; dir: string }) => {
  const isUp = dir === "up";
  const delta = Math.abs(to - from);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {query}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
        #{from}
      </div>
      <Icon
        name="arrow"
        size={11}
        style={{
          transform: isUp ? "rotate(-45deg)" : "rotate(45deg)",
          color: isUp ? "var(--green)" : "var(--red)",
        }}
      />
      <div className="mono" style={{ fontSize: 12, width: 34, color: isUp ? "var(--green)" : "var(--red)" }}>
        {isUp ? `+${delta}` : `-${delta}`}
      </div>
      <div className="mono" style={{ fontSize: 12, width: 24, textAlign: "right" }}>
        #{to}
      </div>
    </div>
  );
};

const SeoCheck = ({ tone, label, note }: { tone: "ok" | "warn" | "crit"; label: string; note: string }) => {
  const map = {
    ok: { badgeTone: "ok" as const, badgeText: "Pass" },
    warn: { badgeTone: "high" as const, badgeText: "Warning" },
    crit: { badgeTone: "crit" as const, badgeText: "Error" },
  };
  const m = map[tone];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 80px 1fr",
        gap: 12,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div>
        <Badge tone={m.badgeTone}>{m.badgeText}</Badge>
      </div>
      <div className="dim" style={{ fontSize: 12.5 }}>
        {note}
      </div>
    </div>
  );
};

const IndexCell = ({ label, value, tone }: { label: string; value: number; tone: "ok" | "med" | "low" }) => (
  <div
    style={{
      padding: "12px 14px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid var(--border-soft)",
      borderRadius: 10,
    }}
  >
    <div className="label-strip" style={{ marginBottom: 4 }}>
      {label}
    </div>
    <div
      className="mono"
      style={{
        fontSize: 20,
        fontWeight: 600,
        color: tone === "ok" ? "var(--green)" : tone === "med" ? "var(--amber)" : "var(--text-tertiary)",
      }}
    >
      {value}
    </div>
  </div>
);

// ============ AI Fix Recommendations Mock Library ============

interface AiFix {
  summary: string;
  timeEstimate: string;
  difficulty: string;
  canAutoApply: boolean;
  steps: string[];
  codeLabel?: string;
  codeFile?: string;
  code?: string;
  impact: string[];
  alternatives?: { title: string; note: string }[];
  context: string;
}

const AI_FIX_LIBRARY: Record<string, AiFix> = {
  i1: {
    summary:
      "Restore the hero CTA on mobile breakpoints by removing the .u-hide-mobile class that was added in the last theme update.",
    timeEstimate: "~10 min",
    difficulty: "Easy · CSS only",
    canAutoApply: true,
    steps: [
      "Open the Astra child theme's header-hero.php template",
      "Remove the .u-hide-mobile class from the primary CTA anchor",
      "Or, if the class is intentional elsewhere, add a media-query override in child theme custom CSS",
      "Clear page cache and re-run the mobile regression scan",
    ],
    codeLabel: "Patch",
    codeFile: "astra-child/templates/header-hero.php · line 42",
    code: `- <a class="hero-cta primary u-hide-mobile" href="/get-started">\n+ <a class="hero-cta primary" href="/get-started">\n    Open an account\n  </a>`,
    impact: [
      "Restores 41% of mobile conversion path",
      "Removes the critical visual regression flag",
      "No risk to desktop layout (class only affected mobile)",
    ],
    alternatives: [
      {
        title: "CSS override (safer for theme updates)",
        note: "Add `.u-hide-mobile.hero-cta { display: inline-flex !important; }` in child theme stylesheet — survives parent theme updates.",
      },
      {
        title: "Roll back theme to 4.6.9",
        note: "Reverts the change everywhere. Use only if other elements are also broken.",
      },
    ],
    context:
      "This class was introduced upstream in Astra 4.6.10 as a utility. It's harmless elsewhere on the site but happens to land on a conversion CTA here.",
  },
  i2: {
    summary:
      "Roll back Form-Pro to 4.1.9 to restore form submissions, then stage the 4.2.1 upgrade with the new endpoint config.",
    timeEstimate: "~15 min",
    difficulty: "Medium · plugin rollback",
    canAutoApply: false,
    steps: [
      "From WP-CLI on the production server, run `wp plugin install form-pro --version=4.1.9 --force`",
      "Test submission on /contact-us to confirm 200 response",
      "Open a staging environment, install 4.2.1, and verify the new POST endpoint at /wp-json/form-pro/v2/submit",
      "Update the Form-Pro REST endpoint mapping in custom code, then re-deploy to production",
    ],
    codeLabel: "WP-CLI commands",
    codeFile: "production server",
    code: `# Roll back the broken version\nwp plugin install form-pro --version=4.1.9 --force\nwp cache flush\n\n# After staging 4.2.1, redeploy with new endpoint config\n- POST /wp-admin/admin-ajax.php\n+ POST /wp-json/form-pro/v2/submit`,
    impact: [
      "Form submissions resume immediately on all 4 contact forms",
      "No leads lost beyond the current outage window",
      "Buys time for proper 4.2.1 staging test",
    ],
    alternatives: [
      {
        title: "Hotfix the new endpoint URL",
        note: "If the team can't roll back, patch the form action attribute in JS to point at the new REST endpoint. Higher risk.",
      },
    ],
    context:
      "Form-Pro 4.2.1 changed its submission endpoint without backwards compatibility. Several agencies have reported the same regression — a 4.2.2 patch is in beta.",
  },
  default: {
    summary: "Horus has analysed this issue and prepared a recommended fix. Open full detail for a complete walkthrough.",
    timeEstimate: "~15 min",
    difficulty: "See detail",
    canAutoApply: false,
    steps: [
      "Open the full issue detail view from the button below",
      "Review the AI-generated steps and supporting evidence",
      "Apply the patch on staging, then production",
    ],
    impact: ["Resolves the flagged issue", "Restores expected behaviour"],
    context:
      "Horus tailors recommendations per issue. The full detail view includes evidence screenshots and the change history.",
  },
};

// ============ WordPress Tab ============

interface WordPressTabProps {
  site: Site;
  snapshot: WpSnapshot | null;
  keyMasked: string | null;
  keyGenerating: boolean;
  newKey: string | null;
  onGenerateKey: () => void;
  updates: WpUpdate[];
}

const WordPressTab = ({ site, snapshot, keyMasked, keyGenerating, newKey, onGenerateKey, updates }: WordPressTabProps) => {
  const theme = snapshot?.theme_data;
  const plugins = (snapshot?.plugin_data ?? []).filter((p) => p.active);
  const allPlugins = snapshot?.plugin_data ?? [];
  const pluginsWithUpdates = allPlugins.filter((p) => p.update_available);
  const updateData = snapshot?.update_data;
  const security = snapshot?.security_data;
  const forms = snapshot?.form_data ?? [];
  const server = snapshot?.server_data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Connection card */}
      <div className="card">
        <div className="card-head">
          <h3><Icon name="wp" size={14} /> Plugin Connection</h3>
          <span className="h-sub">{site.url}</span>
        </div>
        <div className="card-pad">
          <div className="grid-2" style={{ gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>Connection status</div>
              {snapshot ? (
                <Badge tone="ok" dot>Connected · last sync {new Date(snapshot.created_at).toLocaleString("en-ZA")}</Badge>
              ) : (
                <Badge tone="ghost" dot>Not connected — install the plugin on this WordPress site</Badge>
              )}
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <strong>API endpoint to paste into the plugin:</strong><br />
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-inset)", padding: "3px 7px", borderRadius: 5 }}>
                  {typeof window !== "undefined" ? window.location.origin : ""}/api/wordpress
                </code>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>Site API Key</div>
              {newKey ? (
                <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px", border: "1px solid rgba(0,229,255,0.3)" }}>
                  <div style={{ fontSize: 11, color: "var(--cyan)", marginBottom: 4 }}>Copy this key — it will only be shown once</div>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all", color: "var(--text-primary)" }}>{newKey}</code>
                </div>
              ) : keyMasked ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-inset)", padding: "5px 10px", borderRadius: 6 }}>{keyMasked}</code>
                  <button className="btn sm" onClick={onGenerateKey} disabled={keyGenerating} type="button">
                    Rotate
                  </button>
                </div>
              ) : (
                <button className="btn primary sm" onClick={onGenerateKey} disabled={keyGenerating} type="button">
                  {keyGenerating ? "Generating…" : "Generate API Key"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!snapshot && (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, marginBottom: 8 }}>No plugin data yet</div>
          <div className="muted" style={{ fontSize: 13.5, maxWidth: 460, margin: "0 auto 20px" }}>
            Install the Eye of Horus Client plugin on this WordPress site, enter the API endpoint and key above, then click Sync Now to see live data here.
          </div>
        </div>
      )}

      {snapshot && (
        <>
          {/* Core versions */}
          <div className="grid-2" style={{ gap: 18 }}>
            <div className="card">
              <div className="card-head"><h3>Core Versions</h3></div>
              <div className="card-pad">
                <dl className="kv">
                  <dt>WordPress</dt>
                  <dd className="mono">
                    {snapshot.wp_version ?? "—"}{" "}
                    {updateData?.core_update && (
                      <Badge tone="high">update → {updateData.core_version}</Badge>
                    )}
                    {!updateData?.core_update && <Badge tone="ok">up to date</Badge>}
                  </dd>
                  <dt>PHP</dt>
                  <dd className="mono">{snapshot.php_version ?? "—"}</dd>
                  <dt>MySQL</dt>
                  <dd className="mono">{snapshot.mysql_version ?? "—"}</dd>
                  <dt>Active theme</dt>
                  <dd>
                    {theme ? (
                      <>
                        {theme.name} {theme.version}
                        {theme.update_available && <span style={{ marginLeft: 6 }}><Badge tone="high">→ {theme.new_version}</Badge></span>}
                        {theme.parent_theme && (
                          <span className="dim" style={{ display: "block", fontSize: 11.5, marginTop: 2 }}>
                            Parent: {theme.parent_theme.name} {theme.parent_theme.version}
                          </span>
                        )}
                      </>
                    ) : "—"}
                  </dd>
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Server</h3>
                <span className="h-sub">{site.name}</span>
              </div>
              <div className="card-pad">
                <dl className="kv">
                  <dt>Database size</dt>
                  <dd className="mono">{server?.db_size_mb != null ? `${server.db_size_mb} MB` : "—"}</dd>
                  <dt>WP Cron</dt>
                  <dd>
                    {server != null ? (
                      server.cron_enabled
                        ? <Badge tone="ok">enabled</Badge>
                        : <Badge tone="high">disabled</Badge>
                    ) : "—"}
                  </dd>
                  <dt>Timezone</dt>
                  <dd className="mono">{server?.timezone ?? "—"}</dd>
                  <dt>Language</dt>
                  <dd>{server?.language ?? "—"}</dd>
                </dl>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="card">
            <div className="card-head">
              <h3><Icon name="shield" size={14} /> Security</h3>
            </div>
            <div className="card-pad">
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 16px", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Security plugin</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {security?.security_plugin ?? <span className="dim">None detected</span>}
                  </div>
                </div>
                <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 16px", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Admin accounts</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: (security?.admin_users ?? 0) > 2 ? "var(--amber)" : "var(--green)" }}>
                    {security?.admin_users ?? "—"}
                  </div>
                </div>
                <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 16px", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Debug mode</div>
                  <div>
                    {security != null ? (
                      security.debug_mode
                        ? <Badge tone="high">ON — disable in production</Badge>
                        : <Badge tone="ok">off</Badge>
                    ) : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plugins */}
          <div className="card">
            <div className="card-head">
              <h3>Plugins</h3>
              <span className="h-sub">
                {plugins.length} active · <span style={{ color: pluginsWithUpdates.length > 0 ? "var(--amber)" : "var(--green)" }}>{pluginsWithUpdates.length} updates pending</span>
              </span>
            </div>
            <div>
              {allPlugins.length === 0 && (
                <div className="empty">No plugin data from the last sync.</div>
              )}
              {allPlugins.slice(0, 50).map((p, i) => (
                <div key={i} className="feed-item" style={{ opacity: p.active ? 1 : 0.5 }}>
                  <div className="feed-icon">
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.active ? "var(--green)" : "var(--text-dim)" }} />
                  </div>
                  <div className="feed-body">
                    <div className="feed-title">{p.name}</div>
                    <div className="feed-meta">
                      <span className="mono">{p.version}</span>
                      {!p.active && <><span className="pip" /><span>inactive</span></>}
                    </div>
                  </div>
                  {p.update_available && (
                    <Badge tone="high">→ {p.new_version}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Forms */}
          {forms.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Forms detected</h3>
                <span className="h-sub">{forms.length} form sources</span>
              </div>
              <div>
                {forms.map((f, i) => (
                  <div key={i} className="feed-item">
                    <div className="feed-icon">
                      <Icon name="file" size={13} />
                    </div>
                    <div className="feed-body">
                      <div className="feed-title">{f.name ?? f.plugin}</div>
                      <div className="feed-meta">
                        <span>{f.plugin}</span>
                        {f.submissions != null && <><span className="pip" /><span>{f.submissions} submissions</span></>}
                      </div>
                    </div>
                    <Badge tone={f.active ? "ok" : "ghost"}>{f.active ? "active" : "inactive"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending updates from wp_updates table */}
          {updates.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Pending updates queue</h3>
                <span className="h-sub">{updates.length} queued</span>
              </div>
              <div>
                {updates.map((u) => (
                  <div key={u.id} className="feed-item">
                    <div className="feed-body">
                      <div className="feed-title">{u.target}</div>
                      <div className="feed-meta">
                        <span className="mono">{u.from} → {u.to}</span>
                        {u.notes && <><span className="pip" /><span>{u.notes}</span></>}
                      </div>
                    </div>
                    <Badge tone={u.risk === "high" ? "crit" : u.risk === "medium" ? "high" : "ok"}>{u.risk}</Badge>
                    <Badge tone="ghost">{u.priority}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============ HistoryTab ============

interface PlaywrightCheck {
  id: string;
  site_id: string;
  device: string;
  url: string;
  status: string;
  http_status: number | null;
  load_time_ms: number | null;
  page_title: string | null;
  is_noindexed: boolean;
  has_h1: boolean;
  has_navigation: boolean;
  console_errors: string[];
  network_errors: string[];
  screenshot_url: string | null;
  baseline_url: string | null;
  diff_url: string | null;
  diff_percentage: number | null;
  regression_detected: boolean;
  forms_found: { action: string | null; fieldsCount: number; inputTypes: string[] }[];
  issues_created: number;
  error_message: string | null;
  checked_at: string;
}

function HistoryTab({ site }: { site: Site }) {
  const [checks, setChecks] = useState<PlaywrightCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDevice, setActiveDevice] = useState("desktop");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/playwright/checks?siteId=${site.id}&limit=30`)
      .then((r) => r.json())
      .then((data) => setChecks(data.checks || []))
      .catch(() => setChecks([]))
      .finally(() => setLoading(false));
  }, [site.id]);

  const filtered = checks.filter((c) => c.device === activeDevice);
  const latest = filtered[0] || null;

  const handleApproveBaseline = async (check: PlaywrightCheck) => {
    if (!check.screenshot_url) return;
    setApprovingId(check.id);
    try {
      const res = await apiFetch("/api/playwright/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          device: check.device,
          screenshotUrl: check.screenshot_url,
          checkId: check.id,
        }),
      });
      if (res.ok) {
        setApproveSuccess(check.id);
        setTimeout(() => setApproveSuccess(null), 3000);
      }
    } finally {
      setApprovingId(null);
    }
  };

  const statusLabel = (s: string) =>
    s === "pass" ? "Pass" : s === "fail" ? "Fail" : "Error";

  if (loading) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <div className="muted">Loading Playwright check history…</div>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
        <Icon name="eye" size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>No Playwright checks yet</div>
        <div className="muted" style={{ maxWidth: 420, margin: "0 auto" }}>
          Run{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "2px 6px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 4,
            }}
          >
            npm run check:playwright
          </code>{" "}
          to start automated QA checks on this site. Results and screenshots will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Device selector */}
      <div
        className="card"
        style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <span className="label-strip">Device</span>
        <Tabs tabs={["desktop", "tablet", "mobile"]} active={activeDevice} onChange={setActiveDevice} />
        {latest && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <Badge tone={latest.status === "pass" ? "ok" : latest.status === "fail" ? "crit" : "high"}>
              Latest: {statusLabel(latest.status)}
            </Badge>
            <span className="label-strip">{new Date(latest.checked_at).toLocaleString()}</span>
          </div>
        )}
      </div>

      {latest && (
        <>
          {/* Screenshots side-by-side */}
          <div className="grid-2eq" style={{ alignItems: "start" }}>
            <div>
              <div className="label-strip" style={{ marginBottom: 8 }}>Latest screenshot</div>
              {latest.screenshot_url ? (
                <div
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latest.screenshot_url}
                    alt={`${activeDevice} screenshot`}
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge tone={latest.status === "pass" ? "ok" : "crit"} dot>
                      {statusLabel(latest.status)}
                    </Badge>
                    {latest.load_time_ms && (
                      <span className="label-strip">{latest.load_time_ms}ms</span>
                    )}
                    <button
                      className="btn"
                      style={{ marginLeft: "auto", fontSize: 12 }}
                      onClick={() => handleApproveBaseline(latest)}
                      disabled={approvingId === latest.id}
                      type="button"
                    >
                      {approveSuccess === latest.id
                        ? "✓ Baseline set"
                        : approvingId === latest.id
                        ? "Saving…"
                        : "Set as baseline"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card card-pad muted" style={{ textAlign: "center", padding: 40 }}>
                  No screenshot available
                </div>
              )}
            </div>

            <div>
              <div className="label-strip" style={{ marginBottom: 8 }}>
                {latest.diff_url ? "Visual diff vs baseline" : "Baseline"}
              </div>
              {latest.diff_url ? (
                <div
                  style={{
                    border: `1px solid ${latest.regression_detected ? "rgba(239,68,68,0.4)" : "var(--border-soft)"}`,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latest.diff_url}
                    alt="Visual diff"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                    {latest.regression_detected ? (
                      <Badge tone="crit" dot>
                        {latest.diff_percentage?.toFixed(1)}% regression
                      </Badge>
                    ) : (
                      <Badge tone="ok" dot>
                        {latest.diff_percentage?.toFixed(1)}% diff — within threshold
                      </Badge>
                    )}
                  </div>
                </div>
              ) : latest.baseline_url ? (
                <div
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latest.baseline_url}
                    alt="Baseline"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div style={{ padding: "10px 14px" }}>
                    <span className="label-strip">Current baseline</span>
                  </div>
                </div>
              ) : (
                <div className="card card-pad muted" style={{ textAlign: "center", padding: 40 }}>
                  No baseline set yet
                </div>
              )}
            </div>
          </div>

          {/* QA Signals */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="check" size={14} /> QA Signals — {activeDevice}
              </h3>
              <span className="h-sub">{new Date(latest.checked_at).toLocaleString()}</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                padding: "0 18px 18px",
              }}
            >
              {[
                {
                  label: "HTTP status",
                  value: latest.http_status ? `${latest.http_status}` : "—",
                  ok: !latest.http_status || latest.http_status < 400,
                },
                {
                  label: "Load time",
                  value: latest.load_time_ms ? `${latest.load_time_ms}ms` : "—",
                  ok: !latest.load_time_ms || latest.load_time_ms < 3000,
                },
                {
                  label: "Page title",
                  value: latest.page_title ? "Present" : "Missing",
                  ok: !!latest.page_title,
                },
                {
                  label: "H1 heading",
                  value: latest.has_h1 ? "Present" : "Missing",
                  ok: latest.has_h1,
                },
                {
                  label: "Navigation",
                  value: latest.has_navigation ? "Present" : "Missing",
                  ok: latest.has_navigation,
                },
                {
                  label: "Noindex",
                  value: latest.is_noindexed ? "Detected" : "Not set",
                  ok: !latest.is_noindexed,
                },
                {
                  label: "Console errors",
                  value: `${latest.console_errors?.length || 0}`,
                  ok: (latest.console_errors?.length || 0) < 3,
                },
                {
                  label: "Network errors",
                  value: `${latest.network_errors?.length || 0}`,
                  ok: (latest.network_errors?.length || 0) === 0,
                },
                {
                  label: "Forms detected",
                  value: `${latest.forms_found?.length || 0}`,
                  ok: true,
                },
                {
                  label: "Visual regression",
                  value: latest.regression_detected
                    ? `${latest.diff_percentage}%`
                    : latest.diff_percentage !== null
                    ? "Clean"
                    : "No baseline",
                  ok: !latest.regression_detected,
                },
              ].map(({ label, value, ok }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: ok ? "var(--text-primary)" : "#EF4444" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Console and network errors */}
          {((latest.console_errors?.length ?? 0) > 0 || (latest.network_errors?.length ?? 0) > 0) && (
            <div className="card">
              <div className="card-head">
                <h3>
                  <Icon name="issue" size={14} /> Errors detected
                </h3>
              </div>
              <div style={{ padding: "0 18px 18px" }}>
                {(latest.console_errors?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="label-strip" style={{ marginBottom: 6 }}>
                      Console errors ({latest.console_errors.length})
                    </div>
                    {latest.console_errors.slice(0, 5).map((err, i) => (
                      <div
                        key={i}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "#FCA5A5",
                          padding: "4px 8px",
                          background: "rgba(239,68,68,0.08)",
                          borderRadius: 4,
                          marginBottom: 4,
                        }}
                      >
                        {err}
                      </div>
                    ))}
                  </div>
                )}
                {(latest.network_errors?.length ?? 0) > 0 && (
                  <div>
                    <div className="label-strip" style={{ marginBottom: 6 }}>
                      Network errors ({latest.network_errors.length})
                    </div>
                    {latest.network_errors.slice(0, 5).map((err, i) => (
                      <div
                        key={i}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "#FCD37A",
                          padding: "4px 8px",
                          background: "rgba(245,158,11,0.08)",
                          borderRadius: 4,
                          marginBottom: 4,
                        }}
                      >
                        {err}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Check history table */}
      <div className="card">
        <div className="card-head">
          <h3>
            <Icon name="clock" size={14} /> Check history — {activeDevice}
          </h3>
          <span className="h-sub">{filtered.length} checks</span>
        </div>
        <div>
          {filtered.slice(0, 10).map((chk) => (
            <div key={chk.id} className="feed-item">
              <div
                className="feed-icon"
                style={{
                  borderColor:
                    chk.status === "pass"
                      ? "rgba(34,197,94,0.3)"
                      : chk.status === "fail"
                      ? "rgba(239,68,68,0.3)"
                      : "rgba(245,158,11,0.3)",
                  color:
                    chk.status === "pass"
                      ? "#86EFAC"
                      : chk.status === "fail"
                      ? "#FCA5A5"
                      : "#FCD37A",
                }}
              >
                <Icon name={chk.status === "pass" ? "check" : "issue"} size={12} />
              </div>
              <div className="feed-body">
                <div className="feed-title">
                  {statusLabel(chk.status)} — {chk.issues_created} issues
                </div>
                <div className="feed-meta">
                  <span className="mono">{new Date(chk.checked_at).toLocaleString()}</span>
                  {chk.load_time_ms && (
                    <>
                      <span className="pip" />
                      <span>{chk.load_time_ms}ms</span>
                    </>
                  )}
                  {chk.diff_percentage !== null && (
                    <>
                      <span className="pip" />
                      <span>{chk.diff_percentage}% diff</span>
                    </>
                  )}
                </div>
              </div>
              <Badge tone={chk.status === "pass" ? "ok" : chk.status === "fail" ? "crit" : "high"}>
                {statusLabel(chk.status)}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
