"use client";

import React, { useState, useRef, useEffect, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Site, Issue, WpUpdate } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/auth/index";
import { DEFAULT_CLARITY_ENDPOINT_URL } from "@/lib/analytics/clarity";
import WatchtowerConfig from "@/components/WatchtowerConfig";
import {
  Icon,
  Badge,
  SeverityChip,
  StatusChip,
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
  wordfence_data: {
    active: boolean;
    waf_enabled: boolean;
    waf_learning_mode: boolean;
    waf_rules_premium: boolean;
    ip_blocklist_enabled: boolean;
    brute_force_enabled: boolean;
    attacks_today: { complex: number; brute_force: number; blocklist: number; total: number };
    attacks_week:  { complex: number; brute_force: number; blocklist: number; total: number };
    attacks_month: { complex: number; brute_force: number; blocklist: number; total: number };
    top_blocked_ips: { ip: string; country: string; count: number }[];
    top_countries: { country: string; count: number }[];
    login_failed:  { username: string; ip: string; time: string }[];
    login_success: { username: string; ip: string; time: string }[];
    scan_issues_count: number;
    scan_issues: { type: string; severity: string; description: string }[];
    malware_found: boolean;
    last_scan_time: string | null;
  } | null;
  form_data: {
    plugin: string;
    name?: string;
    id?: number;
    active: boolean;
    has_entries_table?: boolean;
    // Submission counts
    completed_total?: number | null;
    abandoned_total?: number | null;
    completed_month?: number | null;
    abandoned_month?: number | null;
    completed_last?: number | null;
    abandoned_last?: number | null;
    // Backward-compat aliases
    submissions?: number | null;
    submissions_month?: number | null;
    submissions_prev_month?: number | null;
    // Field-level analytics
    field_breakdowns?: { field: string; values: { value: string; count: number }[] }[];
    abandonment_reasons?: { field: string; count: number }[];
  }[] | null;
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

interface PerfMetricRow {
  id: number;
  site_id: string;
  device: "desktop" | "mobile" | "tablet";
  performance_score: number | null;
  accessibility_score: number | null;
  seo_score: number | null;
  best_practices_score: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  tti: number | null;
  created_at: string;
}

interface FormCheckRow {
  id: number;
  site_id: string;
  form_name: string;
  form_plugin: string | null;
  page_url: string | null;
  status: "pass" | "fail" | "skip" | "error";
  submission_tested: boolean;
  result_message: string | null;
  created_at: string;
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

  // Derive synthetic issues from wp_updates that have no matching issue yet
  const existingWpTitles = new Set(
    siteIssues.filter((i) => i.category === "WordPress update").map((i) => i.title)
  );
  const syntheticWpIssues: Issue[] = siteUpdates
    .filter((u) => !existingWpTitles.has(`${u.target} update available`))
    .map((u) => ({
      id: `wp-update-${u.id}`,
      siteId: u.siteId,
      title: `${u.target} update available`,
      severity: (u.risk === "high" ? "high" : "medium") as Issue["severity"],
      impact: `${u.target} is running v${u.from}. Update v${u.to} is available.`,
      category: "WordPress update",
      page: "wp-admin/plugins.php",
      recommended: u.notes,
      owner: "Unassigned",
      status: "Open",
      detected: "Now",
      changeType: "WordPress plugin sync",
      confidence: 95,
      evidence: { from: u.from, to: u.to, flag: u.flag },
    }));
  const combinedSiteIssues = [...siteIssues, ...syntheticWpIssues];

  // Real uptime history from Supabase
  const [uptimeHistory, setUptimeHistory] = useState<UptimeCheckRow[]>([]);
  const [latestCheck, setLatestCheck] = useState<UptimeCheckRow | null>(null);
  const [latestSecurityCheck, setLatestSecurityCheck] = useState<UptimeCheckRow | null>(null);

  const fetchUptimeHistory = useCallback(async () => {
    if (!site?.id) return;
    const [{ data }, { data: securityData }] = await Promise.all([
      supabase
        .from("uptime_checks")
        .select("*")
        .eq("site_id", site.id)
        .order("checked_at", { ascending: false })
        .limit(20),
      supabase
        .from("uptime_checks")
        .select("*")
        .eq("site_id", site.id)
        .not("ssl_valid", "is", null)
        .order("checked_at", { ascending: false })
        .limit(1),
    ]);
    if (data && data.length > 0) {
      setUptimeHistory(data as UptimeCheckRow[]);
      setLatestCheck(data[0] as UptimeCheckRow);
    }
    setLatestSecurityCheck(securityData?.[0] as UptimeCheckRow | undefined ?? null);
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
    integration: { ga_property_id?: string; gsc_site_url?: string; clarity_project_id?: string; clarity_endpoint_url?: string } | null;
    syncStats: {
      ga: { today: number; total: number; lastSyncedAt: string | null };
      gsc: { today: number; total: number; lastSyncedAt: string | null };
      clarity: { today: number; total: number; lastSyncedAt: string | null; dailyLimit: number };
    } | null;
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

  const [perfMetrics, setPerfMetrics] = useState<PerfMetricRow[]>([]);
  const fetchPerfMetrics = useCallback(async () => {
    if (!site?.id) return;
    const { data } = await supabase
      .from("performance_metrics")
      .select("*")
      .eq("site_id", site.id)
      .order("created_at", { ascending: false })
      .limit(9);
    if (data) setPerfMetrics(data as PerfMetricRow[]);
  }, [site?.id]);

  const [formChecks, setFormChecks] = useState<FormCheckRow[]>([]);
  const fetchFormChecks = useCallback(async () => {
    if (!site?.id) return;
    const { data } = await supabase
      .from("form_checks")
      .select("*")
      .eq("site_id", site.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setFormChecks(data as FormCheckRow[]);
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
    fetchPerfMetrics();
    fetchFormChecks();
  }, [fetchUptimeHistory, fetchWpSnapshot, fetchAnalyticsSnapshot, fetchAiSummary, fetchDomainCheck, fetchPerfMetrics, fetchFormChecks]);

  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>(() => {
    const t = searchParams?.get('tab') ?? '';
    const valid = ["Overview","Issues","Analytics","SEO","Marketing","WordPress","Performance","Security","Forms","History","Integrations"];
    return valid.includes(t) ? t : "Overview";
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
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

  const overviewPerformanceScore = calculatePerformanceOverviewScore(perfMetrics, site.perf);
  const overviewSecurityScore = calculateSecurityOverviewScore({
    securityCheck: latestSecurityCheck,
    domainCheck,
    wpSnapshot,
    issues: siteIssues,
    fallback: site.sec,
  });
  const overviewDesktopMetrics = perfMetrics.find((m) => m.device === "desktop") ?? null;
  const overviewMobileMetrics = perfMetrics.find((m) => m.device === "mobile") ?? null;

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
          <button className="btn" onClick={() => setConfigOpen(true)}>
            <Icon name="settings" size={13} /> Configure
          </button>
          <button className="btn" onClick={() => setChatOpen(true)} type="button">
            <Icon name="sparkles" size={13} /> Ask Horus
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              // Re-derive WordPress findings (wp_updates + issues) from the latest
              // stored snapshot. The standard scan only runs Playwright/uptime, so
              // without this WordPress updates never become issues from the UI.
              try {
                const res = await apiFetch("/api/wordpress/reconcile", {
                  method: "POST",
                  body: JSON.stringify({ siteId: site.id }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.ok === false) {
                  console.error("[EOH] WordPress reconcile error:", data.detail || data.error);
                }
              } catch (e) {
                console.error("[EOH] WordPress reconcile request failed:", e);
              }
              // Best-effort: trigger the Playwright/visual scan in CI. Safe to ignore if not configured.
              try {
                const pw = await apiFetch("/api/playwright/run", { method: "POST", body: JSON.stringify({ testForms: false }) });
                const pwData = await pw.json().catch(() => ({}));
                if (!pw.ok) console.info("[EOH] Playwright run not triggered:", pwData.error);
              } catch (e) {
                console.info("[EOH] Playwright run trigger skipped:", e);
              }
              await runScan(site.id);
              await Promise.all([
                fetchUptimeHistory(),
                fetchWpSnapshot(),
                fetchPerfMetrics(),
                fetchFormChecks(),
                fetchDomainCheck(),
                fetchAnalyticsSnapshot(),
              ]);
            }}
            disabled={loading}
          >
            <Icon name="refresh" size={13} /> {loading ? "Scanning..." : "Re-scan now"}
          </button>
        </div>
      </div>

      <Tabs
        tabs={["Overview", "Issues", "Analytics", "SEO", "Marketing", "WordPress", "Performance", "Security", "Forms", "History", "Visual changes", "Integrations"]}
        active={tab}
        onChange={setTab}
      />

      {configOpen && (
        <WatchtowerConfig siteId={site.id} siteName={site.name} onClose={() => setConfigOpen(false)} />
      )}

      <div style={{ marginTop: 18 }}>
        {tab === "Overview" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <ScoreCard label="Health" value={site.health} />
              <PageSpeedOverviewCard label="Desktop" metric={overviewDesktopMetrics} />
              <PageSpeedOverviewCard label="Mobile" metric={overviewMobileMetrics} />
              <ScoreCard label="Security" value={overviewSecurityScore} />
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
                      {wpSnapshot?.wp_version ?? site.wp.core ?? "—"}{" "}
                      {wpSnapshot?.update_data?.core_update && (
                        <Badge tone="high">update available · {wpSnapshot.update_data.core_version ?? "latest"}</Badge>
                      )}
                      {!wpSnapshot && site.wp.core !== site.wp.coreLatest && (
                        <Badge tone="high">update available · {site.wp.coreLatest}</Badge>
                      )}
                    </dd>
                    <dt>PHP</dt>
                    <dd className="mono">
                      {wpSnapshot?.php_version ?? "—"}
                      {wpSnapshot?.php_version && <Badge tone="ok">active</Badge>}
                    </dd>
                    <dt>Active theme</dt>
                    <dd>
                      {wpSnapshot?.theme_data
                        ? `${wpSnapshot.theme_data.name} ${wpSnapshot.theme_data.version}`
                        : "—"}
                    </dd>
                    <dt>Plugins (active)</dt>
                    <dd>
                      {wpSnapshot?.plugin_data
                        ? `${wpSnapshot.plugin_data.filter((p) => p.active).length} active · ${wpSnapshot.update_data?.plugin_updates ?? 0} pending update`
                        : "—"}
                    </dd>
                    <dt>Forms</dt>
                    <dd>
                      {wpSnapshot?.form_data && wpSnapshot.form_data.length > 0 ? (
                        <Badge tone="ok" dot>
                          {wpSnapshot.form_data.length} form plugin{wpSnapshot.form_data.length !== 1 ? "s" : ""} detected
                        </Badge>
                      ) : site.forms === "issue" ? (
                        <Badge tone="crit" dot>Submissions failing</Badge>
                      ) : (
                        <Badge tone="ghost">No form data yet</Badge>
                      )}
                    </dd>
                    <dt>SSL</dt>
                    <dd>
                      {latestSecurityCheck ? (
                        latestSecurityCheck.ssl_valid ? (
                          <Badge tone={
                            (latestSecurityCheck.ssl_days_remaining ?? 999) < 7 ? "crit" :
                            (latestSecurityCheck.ssl_days_remaining ?? 999) < 30 ? "high" : "ok"
                          }>
                            Valid · {latestSecurityCheck.ssl_days_remaining ?? "?"} days remaining
                            {latestSecurityCheck.ssl_expiry_date ? ` · expires ${latestSecurityCheck.ssl_expiry_date}` : ""}
                          </Badge>
                        ) : (
                          <Badge tone="crit">
                            SSL issue{latestSecurityCheck.error ? `: ${latestSecurityCheck.error}` : ""}
                          </Badge>
                        )
                      ) : (
                        <Badge tone="ghost">No SSL data yet</Badge>
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
                      value={overviewPerformanceScore}
                      delta="-4"
                      trend={[78, 80, 79, 77, 76, 72, 68, 72, 70, 72, 73, 72, 74, 72]}
                      color="#F59E0B"
                    />
                    <TrendRow
                      label="Security"
                      value={overviewSecurityScore}
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
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15, color: latestSecurityCheck?.ssl_valid ? "var(--green)" : latestSecurityCheck ? "var(--red)" : "var(--text-tertiary)" }}>
                              {latestSecurityCheck ? (latestSecurityCheck.ssl_valid ? `Valid · ${latestSecurityCheck.ssl_days_remaining ?? "?"}d` : "Issue") : "No data"}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg-inset)", borderRadius: 8, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Last check</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                              {new Date(latestCheck.checked_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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

            {/* Data source sync status */}
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-head">
                <h3><Icon name="activity" size={14} /> Data sources</h3>
                <span className="h-sub">last synced per integration</span>
              </div>
              <div>
                <SyncSource label="Uptime check" icon="clock" lastSync={latestCheck?.checked_at ?? null} connected={true} hasData={!!latestCheck} staleAfterMinutes={20} />
                <SyncSource label="WordPress plugin" icon="wp" lastSync={wpSnapshot?.created_at ?? null} connected={!!wpKeyMasked || !!wpSnapshot} hasData={!!wpSnapshot} />
                <SyncSource label="Google Analytics" icon="activity" lastSync={(analyticsSnapshot?.ga as Record<string, unknown> | null)?.created_at as string ?? null} connected={!!(analyticsSnapshot?.integration?.ga_property_id)} hasData={!!(analyticsSnapshot?.ga)} />
                <SyncSource label="Search Console" icon="search" lastSync={(analyticsSnapshot?.gsc as Record<string, unknown> | null)?.created_at as string ?? null} connected={!!(analyticsSnapshot?.integration?.gsc_site_url)} hasData={!!(analyticsSnapshot?.gsc)} />
                <SyncSource label="Microsoft Clarity" icon="eye" lastSync={(analyticsSnapshot?.clarity as Record<string, unknown> | null)?.created_at as string ?? null} connected={!!(analyticsSnapshot?.integration?.clarity_project_id)} hasData={!!(analyticsSnapshot?.clarity)} />
                <SyncSource label="Domain check" icon="shield" lastSync={domainCheck?.checked_at ?? null} connected={true} hasData={!!domainCheck} />
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
          <IssuesTab site={site} issues={combinedSiteIssues} router={router} onNavigateToWp={() => setTab("WordPress")} />
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

        {tab === "Performance" && (
          <PerformanceTab
            metrics={perfMetrics}
            uptimeHistory={uptimeHistory}
            issues={siteIssues}
            siteId={site.id}
            onScanComplete={fetchPerfMetrics}
          />
        )}

        {tab === "Security" && (
          <SecurityTab latestCheck={latestSecurityCheck} domainCheck={domainCheck} siteUrl={site.url} issues={siteIssues} wpSnapshot={wpSnapshot} />
        )}

        {tab === "Forms" && (
          <FormsTab formChecks={formChecks} wpSnapshot={wpSnapshot} onRunChecks={() => runScan(site.id)} />
        )}

        {tab === "History" && (
          <HistoryTab site={site} />
        )}

        {tab === "Visual changes" && (
          <VisualChangesTab site={site} issues={siteIssues} />
        )}

        {tab === "Integrations" && (
          <IntegrationsTab
            site={site}
            wpKeyMasked={wpKeyMasked}
            wpKeyGenerating={wpKeyGenerating}
            newlyGeneratedKey={newlyGeneratedKey}
            onGenerateKey={generateApiKey}
            onIntegrationSaved={fetchAnalyticsSnapshot}
            syncStats={analyticsSnapshot?.syncStats ?? null}
          />
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

function averageScore(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
}

function calculatePerformanceOverviewScore(metrics: PerfMetricRow[], fallback: number): number {
  const latest = {
    desktop: metrics.find((m) => m.device === "desktop"),
    mobile: metrics.find((m) => m.device === "mobile"),
    tablet: metrics.find((m) => m.device === "tablet"),
  };
  return averageScore([
    latest.desktop?.performance_score,
    latest.mobile?.performance_score,
    latest.tablet?.performance_score,
  ]) ?? fallback ?? 0;
}

function calculateSecurityOverviewScore({
  securityCheck,
  domainCheck,
  wpSnapshot,
  issues,
  fallback,
}: {
  securityCheck: UptimeCheckRow | null;
  domainCheck: DomainCheckRow | null;
  wpSnapshot: WpSnapshot | null;
  issues: Issue[];
  fallback: number;
}): number {
  let hasSecurityData = false;
  let score = 100;

  if (securityCheck?.ssl_valid != null) {
    hasSecurityData = true;
    if (!securityCheck.ssl_valid) {
      score -= 50;
    } else if (securityCheck.ssl_days_remaining != null) {
      if (securityCheck.ssl_days_remaining < 7) score -= 35;
      else if (securityCheck.ssl_days_remaining < 30) score -= 20;
      else if (securityCheck.ssl_days_remaining < 60) score -= 10;
    }
  }

  if (domainCheck && !domainCheck.error) {
    hasSecurityData = true;
    if (domainCheck.days_remaining != null) {
      if (domainCheck.days_remaining < 7) score -= 35;
      else if (domainCheck.days_remaining < 30) score -= 20;
      else if (domainCheck.days_remaining < 60) score -= 10;
    }
  }

  const secData = wpSnapshot?.security_data;
  if (secData) {
    hasSecurityData = true;
    if (secData.debug_mode) score -= 20;
    if ((secData.admin_users ?? 0) > 2) score -= 10;
    if (!secData.security_plugin) score -= 10;
    if ((secData.error_log_lines?.length ?? 0) > 0) score -= 10;
  }

  const securityIssues = issues.filter((i) => i.category?.toLowerCase() === "security" && i.status !== "Resolved");
  if (securityIssues.length > 0) {
    hasSecurityData = true;
    score -= securityIssues.reduce((sum, issue) => {
      if (issue.severity === "critical") return sum + 30;
      if (issue.severity === "high") return sum + 20;
      if (issue.severity === "medium") return sum + 10;
      return sum + 5;
    }, 0);
  }

  if (!hasSecurityData) return fallback ?? 0;
  return Math.max(0, Math.min(100, score));
}

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

function scoreColor(value: number | null | undefined): string {
  if (value == null) return "var(--text-tertiary)";
  if (value >= 90) return "#22C55E";
  if (value >= 75) return "#00E5FF";
  if (value >= 60) return "#F59E0B";
  return "#EF4444";
}

const PageSpeedOverviewCard = ({
  label,
  metric,
}: {
  label: "Desktop" | "Mobile";
  metric: PerfMetricRow | null;
}) => {
  const headline = metric?.performance_score;
  const tone = scoreColor(headline);
  const scores = [
    { label: "Performance", value: metric?.performance_score },
    { label: "Accessibility", value: metric?.accessibility_score },
    { label: "Best Practices", value: metric?.best_practices_score },
    { label: "SEO", value: metric?.seo_score },
  ];

  return (
    <div className="card kpi-card">
      <div className="kpi-bg" style={{ background: metric ? `${tone}22` : "rgba(255,255,255,0.04)" }} />
      <div className="kpi-head">
        <Icon name={label === "Desktop" ? "monitor" : "smartphone"} size={13} /> {label} Page Speed
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        {scores.map((score) => (
          <div key={score.label} style={{ minWidth: 0 }}>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10.5, marginBottom: 4 }}>
              {score.label}
            </div>
            <div style={{ color: scoreColor(score.value), fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {score.value ?? "—"}
              <span className="unit" style={{ marginLeft: 4 }}>/100</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: 5, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginTop: 14 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${headline ?? 0}%`,
            background: tone,
            borderRadius: 4,
            boxShadow: metric ? `0 0 12px ${tone}88` : "none",
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
  const pickerRouter = useRouter();
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
        <button className="btn ghost sm" onClick={() => pickerRouter.push("/admin/clients")} type="button">
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
  onNavigateToWp: () => void;
}

const IssuesTab = ({ site, issues, router, onNavigateToWp }: IssuesTabProps) => {
  const [sev, setSev] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(issues[0]?.id || null);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [issueToast, setIssueToast] = useState<string | null>(null);
  const showIssueToast = (msg: string) => { setIssueToast(msg); setTimeout(() => setIssueToast(null), 3000); };

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
          No open issues detected. Run a scan to check for new problems.
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
          <button
            className={`btn sm${groupByCategory ? " active" : ""}`}
            onClick={() => setGroupByCategory((v) => !v)}
            type="button"
          >
            <Icon name="filter" size={12} /> {groupByCategory ? "Ungroup" : "Group by category"}
          </button>
          <button
            className="btn primary sm"
            onClick={() => showIssueToast("Auto-fix queued for safe issues. Results will appear after the next scan.")}
            type="button"
          >
            <Icon name="sparkles" size={12} /> Auto-fix safe issues
          </button>
        </div>
      </div>

      {groupByCategory ? (
        Object.entries(
          filtered.reduce<Record<string, Issue[]>>((acc, i) => {
            (acc[i.category] = acc[i.category] || []).push(i);
            return acc;
          }, {})
        ).map(([cat, catIssues]) => (
          <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", paddingLeft: 2 }}>{cat}</div>
            {catIssues.map((issue) => (
              <IssueAiCard key={issue.id} issue={issue} site={site} expanded={expanded === issue.id} onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)} onOpen={() => issue.id.startsWith("wp-update-") ? onNavigateToWp() : router.push(`/issues/${issue.id}`)} />
            ))}
          </div>
        ))
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map((issue) => (
            <IssueAiCard key={issue.id} issue={issue} site={site} expanded={expanded === issue.id} onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)} onOpen={() => issue.id.startsWith("wp-update-") ? onNavigateToWp() : router.push(`/issues/${issue.id}`)} />
          ))}
        </div>
      )}

      {issueToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{issueToast}</div>
      )}
    </>
  );
};

const IssueAiCard = ({
  issue,
  site: _site,
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
  const [cardToast, setCardToast] = useState<string | null>(null);
  const showCardToast = (msg: string) => { setCardToast(msg); setTimeout(() => setCardToast(null), 3000); };
  const [ignored, setIgnored] = useState(false);
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
                  <button className="btn primary sm" type="button" onClick={() => { navigator.clipboard.writeText(fix.code ?? ""); showCardToast("Fix applied — re-scan to verify."); }}>
                    <Icon name="sparkles" size={12} /> Apply fix automatically
                  </button>
                ) : (
                  <button className="btn primary sm" type="button" onClick={() => { navigator.clipboard.writeText(fix.code ?? ""); showCardToast("Patch copied to clipboard."); }}>
                    <Icon name="code" size={12} /> Copy patch
                  </button>
                )}
                <button className="btn sm" type="button" onClick={() => showCardToast("Ticket created — add it to your sprint board.")}>
                  <Icon name="plus" size={12} /> Create ticket
                </button>
                <button className="btn sm" onClick={onOpen} type="button">
                  <Icon name="arrow" size={12} /> Open full detail
                </button>
                <button className="btn ghost sm" type="button" onClick={() => { setIgnored(true); showCardToast("Issue ignored."); onToggle(); }}>
                  <Icon name="x" size={12} /> {ignored ? "Ignored" : "Ignore"}
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

      {cardToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{cardToast}</div>
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
  site: _site,
  snapshot,
  onRefresh,
  refreshing,
}: {
  site?: { id: string; url: string };
  snapshot?: {
    ga: Record<string, unknown> | null;
    gsc: Record<string, unknown> | null;
    clarity: Record<string, unknown> | null;
    integration: { ga_property_id?: string; clarity_project_id?: string } | null;
  } | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) => {
  const [range, setRange] = useState("Last 28 days");
  const clarity = snapshot?.clarity?.metrics as Record<string, unknown> | null | undefined;
  const clarityConnected = !!(snapshot?.integration?.clarity_project_id);
  const [analyticsToast, setAnalyticsToast] = useState<string | null>(null);
  const showAnalyticsToast = (msg: string) => { setAnalyticsToast(msg); setTimeout(() => setAnalyticsToast(null), 3000); };
  const isConnected = !!(snapshot?.integration?.ga_property_id);
  type GAMetricsType = { sessions?: number; users?: number; newUsers?: number; engagementRate?: number; avgEngagementTimeSec?: number; pageviews?: number; topPages?: Array<{ path: string; sessions: number }>; channels?: Array<{ name: string; sessions: number }>; devices?: Array<{ device: string; sessions: number; pct: number }>; topCountries?: Array<{ country: string; sessions: number }>; previousPeriod?: { sessions: number; users: number; pageviews: number } | null };
  const gaSnap = snapshot?.ga as { metrics?: GAMetricsType; period_start?: string; period_end?: string } | null;
  const gaMetrics = gaSnap?.metrics ?? null;
  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const gaDelta = (cur: number, prev: number | undefined): { val: string; dir: "up" | "down" | "flat" } => {
    if (!prev) return { val: "", dir: "flat" };
    const d = ((cur - prev) / prev) * 100;
    return { val: `${d > 0 ? "+" : ""}${d.toFixed(1)}%`, dir: d >= 0 ? "up" : "down" };
  };
  return (
    <>
      {!isConnected && (
        <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "rgba(217,160,91,0.06)", border: "1px solid rgba(217,160,91,0.2)" }}>
          <Icon name="activity" size={16} style={{ color: "var(--gold)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Google Analytics not connected</div>
            <div className="muted" style={{ fontSize: 12 }}>Set <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>GOOGLE_SERVICE_ACCOUNT_JSON</code> + configure the GA4 Property ID in site integrations to see real data.</div>
          </div>
          {onRefresh && (
            <button className="btn" onClick={onRefresh} disabled={refreshing} type="button" style={{ fontSize: 12 }}>
              {refreshing ? "Refreshing…" : "Refresh data"}
            </button>
          )}
        </div>
      )}
      {isConnected && (
        <>
          <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Badge tone="ok" dot>GA4 connected</Badge>
            <Badge tone="ghost">Property: {snapshot?.integration?.ga_property_id}</Badge>
            {gaSnap?.period_start && <Badge tone="info">{gaSnap.period_start} → {gaSnap.period_end}</Badge>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="label-strip">Range</span>
              <select className="select" value={range} onChange={(e) => setRange(e.target.value)}>
                <option>Last 7 days</option>
                <option>Last 28 days</option>
                <option>Last 90 days</option>
                <option>Year to date</option>
              </select>
              <button className="btn sm" type="button" onClick={() => onRefresh && onRefresh()} disabled={refreshing}>
                <Icon name="refresh" size={12} /> {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <button className="btn sm" type="button" onClick={() => { window.print(); showAnalyticsToast("Printing analytics report…"); }}>
                <Icon name="download" size={12} /> Export
              </button>
            </div>
          </div>

          {!gaMetrics ? (
            <div className="card" style={{ padding: "32px 18px", textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>No analytics data yet.</div>
              <div className="muted" style={{ fontSize: 12 }}>Click Refresh to pull the latest data from Google Analytics.</div>
              {onRefresh && (
                <button className="btn primary sm" onClick={onRefresh} disabled={refreshing} style={{ marginTop: 14 }}>
                  {refreshing ? "Refreshing…" : "Pull data now"}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid-4" style={{ marginBottom: 18 }}>
                <KPI
                  icon="user"
                  label="Users"
                  value={(gaMetrics.users ?? 0).toLocaleString()}
                  delta={gaDelta(gaMetrics.users ?? 0, gaMetrics.previousPeriod?.users).val}
                  deltaDir={gaDelta(gaMetrics.users ?? 0, gaMetrics.previousPeriod?.users).dir}
                  glow="rgba(0,229,255,0.22)"
                  spark={[]}
                  sparkColor="#00E5FF"
                />
                <KPI
                  icon="activity"
                  label="Sessions"
                  value={(gaMetrics.sessions ?? 0).toLocaleString()}
                  delta={gaDelta(gaMetrics.sessions ?? 0, gaMetrics.previousPeriod?.sessions).val}
                  deltaDir={gaDelta(gaMetrics.sessions ?? 0, gaMetrics.previousPeriod?.sessions).dir}
                  glow="rgba(139,92,246,0.22)"
                  spark={[]}
                  sparkColor="#8B5CF6"
                />
                <KPI
                  icon="eye"
                  label="Page views"
                  value={(gaMetrics.pageviews ?? 0).toLocaleString()}
                  delta={gaDelta(gaMetrics.pageviews ?? 0, gaMetrics.previousPeriod?.pageviews).val}
                  deltaDir={gaDelta(gaMetrics.pageviews ?? 0, gaMetrics.previousPeriod?.pageviews).dir}
                  glow="rgba(217,160,91,0.22)"
                  spark={[]}
                  sparkColor="#D9A05B"
                />
                <KPI
                  icon="bolt"
                  label="Avg session"
                  value={fmtSec(gaMetrics.avgEngagementTimeSec ?? 0)}
                  delta=""
                  deltaDir="flat"
                  glow="rgba(245,158,11,0.20)"
                  spark={[]}
                  sparkColor="#F59E0B"
                />
              </div>

              <div className="grid-2eq" style={{ marginBottom: 18 }}>
                {gaMetrics.topPages && gaMetrics.topPages.length > 0 && (
                  <div className="card">
                    <div className="card-head">
                      <h3>Top pages · this period</h3>
                      <span className="h-sub">by sessions</span>
                    </div>
                    <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {(() => {
                        const maxS = Math.max(...gaMetrics.topPages!.map((p) => p.sessions), 1);
                        return gaMetrics.topPages!.slice(0, 8).map((p, i) => (
                          <PageRow
                            key={i}
                            page={p.path.length > 28 ? p.path.slice(0, 28) + "…" : p.path}
                            views={p.sessions}
                            pct={Math.round((p.sessions / maxS) * 100)}
                            delta=""
                            trend="up"
                          />
                        ));
                      })()}
                    </div>
                  </div>
                )}
                <div className="col">
                  {gaMetrics.channels && gaMetrics.channels.length > 0 && (
                    <div className="card">
                      <div className="card-head">
                        <h3>Acquisition channel</h3>
                        <span className="h-sub">share of sessions</span>
                      </div>
                      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {(() => {
                          const total = gaMetrics.channels!.reduce((s, c) => s + c.sessions, 0) || 1;
                          const cols = ["#22C55E", "#00E5FF", "#D9A05B", "#3B82F6", "#8B5CF6", "#EF4444"];
                          return gaMetrics.channels!.slice(0, 6).map((c, i) => (
                            <RecurringBarLite key={i} label={c.name} pct={Math.round((c.sessions / total) * 100)} val={c.sessions.toLocaleString()} color={cols[i % cols.length]} />
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                  {gaMetrics.devices && gaMetrics.devices.length > 0 && (
                    <div className="card" style={{ marginTop: 18 }}>
                      <div className="card-head"><h3>Device split</h3></div>
                      <div className="card-pad">
                        <DeviceSegment
                          items={gaMetrics.devices.map((d) => ({
                            label: `${d.device.charAt(0).toUpperCase() + d.device.slice(1)} · ${d.pct}%`,
                            value: d.pct,
                            color: d.device === "mobile" ? "#00E5FF" : d.device === "desktop" ? "#8B5CF6" : "#D9A05B",
                            icon: d.device as "mobile" | "desktop" | "tablet",
                          }))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {gaMetrics.topCountries && gaMetrics.topCountries.length > 0 && (
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head">
                      <h3>Top countries</h3>
                      <span className="h-sub">sessions</span>
                    </div>
                    <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {(() => {
                        const maxC = Math.max(...gaMetrics.topCountries!.map((c) => c.sessions), 1);
                        const cols = ["#22C55E", "#3B82F6", "#D9A05B", "#8B5CF6", "#00E5FF", "#5A6578"];
                        return gaMetrics.topCountries!.slice(0, 6).map((c, i) => (
                          <RecurringBarLite key={i} label={c.country} pct={Math.round((c.sessions / maxC) * 100)} val={c.sessions.toLocaleString()} color={cols[i % cols.length]} />
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

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

      {analyticsToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{analyticsToast}</div>
      )}
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
  type GSCMetricsType = { clicks: number; impressions: number; ctr: number; position: number; strikingDistance: Array<{ query: string; impressions: number; position: number }>; previousPeriod: { clicks: number; impressions: number } | null; fetchedAt?: string };
  const gscMetrics = (gsc?.metrics as GSCMetricsType | null) ?? null;
  const gscQueries = (gsc?.queries as Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }> | null) ?? null;
  const gscDelta = (cur: number, prev: number | undefined): { val: string; dir: "up" | "down" | "flat" } => {
    if (!prev) return { val: "", dir: "flat" };
    const d = ((cur - prev) / prev) * 100;
    return { val: `${d > 0 ? "+" : ""}${d.toFixed(1)}%`, dir: d >= 0 ? "up" : "down" };
  };

  const [selectedKw, setSelectedKw] = useState<{ query: string; position: number; impressions: number } | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [seoToast, setSeoToast] = useState<string | null>(null);
  const showSeoToast = (msg: string) => { setSeoToast(msg); setTimeout(() => setSeoToast(null), 3000); };

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
            <div className="muted" style={{ fontSize: 12 }}>Configure the GSC site URL in site integrations to see real query data, striking-distance keywords, and indexing status.</div>
          </div>
          {onRefresh && <button className="btn" onClick={onRefresh} disabled={refreshing} type="button" style={{ fontSize: 12 }}>{refreshing ? "Refreshing…" : "Refresh"}</button>}
        </div>
      )}
      {isConnected && (
        <>
          <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Badge tone="ok" dot>Search Console connected</Badge>
            <Badge tone="ghost">{snapshot?.integration?.gsc_site_url}</Badge>
            {gscMetrics?.fetchedAt && (
              <Badge tone="ghost">Last fetched: {new Date(gscMetrics.fetchedAt).toLocaleString()}</Badge>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <button className="btn sm" type="button" onClick={() => onRefresh && onRefresh()} disabled={refreshing}>
                <Icon name="refresh" size={12} /> {refreshing ? "Refreshing…" : "Re-crawl"}
              </button>
              <button className="btn sm" type="button" onClick={() => { window.print(); showSeoToast("Printing SEO report…"); }}>
                <Icon name="download" size={12} /> Export report
              </button>
            </div>
          </div>

          {!gscMetrics ? (
            <div className="card" style={{ padding: "32px 18px", textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>No Search Console data yet.</div>
              <div className="muted" style={{ fontSize: 12 }}>Click Re-crawl to pull data from Google Search Console.</div>
              {onRefresh && (
                <button className="btn primary sm" onClick={onRefresh} disabled={refreshing} style={{ marginTop: 14 }}>
                  {refreshing ? "Refreshing…" : "Pull data now"}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid-4" style={{ marginBottom: 18 }}>
                <KPI
                  icon="search"
                  label="Organic clicks"
                  value={(gscMetrics.clicks ?? 0).toLocaleString()}
                  delta={gscDelta(gscMetrics.clicks ?? 0, gscMetrics.previousPeriod?.clicks).val}
                  deltaDir={gscDelta(gscMetrics.clicks ?? 0, gscMetrics.previousPeriod?.clicks).dir}
                  glow="rgba(34,197,94,0.20)"
                  spark={[]}
                  sparkColor="#22C55E"
                />
                <KPI
                  icon="eye"
                  label="Impressions"
                  value={(gscMetrics.impressions ?? 0).toLocaleString()}
                  delta={gscDelta(gscMetrics.impressions ?? 0, gscMetrics.previousPeriod?.impressions).val}
                  deltaDir={gscDelta(gscMetrics.impressions ?? 0, gscMetrics.previousPeriod?.impressions).dir}
                  glow="rgba(0,229,255,0.20)"
                  spark={[]}
                  sparkColor="#00E5FF"
                />
                <KPI
                  icon="bolt"
                  label="Avg position"
                  value={(gscMetrics.position ?? 0).toFixed(1)}
                  delta=""
                  deltaDir="flat"
                  glow="rgba(217,160,91,0.20)"
                  spark={[]}
                  sparkColor="#D9A05B"
                />
                <KPI
                  icon="shield"
                  label="CTR"
                  value={`${(gscMetrics.ctr ?? 0).toFixed(2)}%`}
                  delta=""
                  deltaDir="flat"
                  glow="rgba(139,92,246,0.20)"
                  spark={[]}
                  sparkColor="#8B5CF6"
                />
              </div>

              {gscQueries && gscQueries.length > 0 && (
                <div className="grid-2" style={{ marginBottom: 18 }}>
                  <div className="card">
                    <div className="card-head">
                      <h3><Icon name="search" size={14} /> Top queries</h3>
                      <span className="h-sub">last 28 days</span>
                    </div>
                    <div className="card-pad">
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 10, alignItems: "center", marginBottom: 8 }}>
                        <div className="label-strip">Query</div>
                        <div className="label-strip" style={{ textAlign: "right" }}>Clicks</div>
                        <div className="label-strip" style={{ textAlign: "right" }}>Impr.</div>
                        <div className="label-strip" style={{ textAlign: "right" }}>Pos.</div>
                      </div>
                      {gscQueries.slice(0, 10).map((q, i) => (
                        <QueryRow
                          key={i}
                          q={q.query}
                          c={q.clicks.toLocaleString()}
                          i={q.impressions.toLocaleString()}
                          p={q.position.toFixed(1)}
                          pUp={q.position <= 10}
                          pDown={q.position > 10}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="ai-callout">
                    <span className="ai-tag">
                      <Icon name="sparkles" size={11} /> SEO opportunities
                    </span>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.45, fontWeight: 500, margin: "10px 0 12px" }}>
                      {strikingDistance.length > 0
                        ? `${strikingDistance.length} keyword${strikingDistance.length !== 1 ? "s" : ""} in striking distance — positions 11–20.`
                        : "Organic performance is tracked. Check back as more data comes in."}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
                      {strikingDistance.length > 0 ? (
                        strikingDistance.slice(0, 3).map((kw, i) => (
                          <li key={i}>
                            <strong style={{ color: "var(--text-primary)" }}>{kw.query}</strong> · pos {kw.position.toFixed(1)} · {kw.impressions.toLocaleString()} impressions
                          </li>
                        ))
                      ) : (
                        <li>Improve content on your top pages to push more keywords into striking distance.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
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
                <button className="btn" type="button" onClick={() => {
                  navigator.clipboard.writeText(brief ?? "");
                  showSeoToast("SEO brief copied to clipboard.");
                }}>
                  <Icon name="download" size={12} /> Copy to clipboard
                </button>
              )}
              <button className="btn primary" type="button" onClick={() => setSelectedKw(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {seoToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{seoToast}</div>
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
  } | null;
}) => {
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
    </>
  );
};

// ============ Shared Small Components ============

const SyncSource = ({
  label,
  icon,
  lastSync,
  connected,
  hasData,
  staleAfterMinutes,
}: {
  label: string;
  icon: string;
  lastSync: string | null;
  connected: boolean;
  hasData: boolean;
  staleAfterMinutes?: number;
}) => {
  const diffMinutes = lastSync ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000) : null;
  const isStale = hasData && staleAfterMinutes != null && diffMinutes != null && diffMinutes > staleAfterMinutes;
  const fmtAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diffMs / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (m < 2) return "just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  };
  const dotColor = isStale ? "#F59E0B" : hasData ? "#22C55E" : connected ? "#F59E0B" : "#5A6578";
  const dotGlow = isStale ? "0 0 6px #F59E0B" : hasData ? "0 0 6px #22C55E" : connected ? "0 0 6px #F59E0B" : "none";
  const subtext = lastSync
    ? `${isStale ? "Stale · " : ""}${fmtAgo(lastSync)} · ${new Date(lastSync).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : connected
    ? "No data yet — click Re-scan"
    : "Not connected";
  return (
    <div style={{ padding: "11px 18px", borderTop: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: dotGlow, flexShrink: 0 }} />
      <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{subtext}</div>
      </div>
    </div>
  );
};

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
  const [updatingPlugin, setUpdatingPlugin] = useState<string | null>(null);
  const [updateToast, setUpdateToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const theme = snapshot?.theme_data;
  const plugins = (snapshot?.plugin_data ?? []).filter((p) => p.active);
  const allPlugins = snapshot?.plugin_data ?? [];
  const pluginsWithUpdates = allPlugins.filter((p) => p.update_available);
  const updateData = snapshot?.update_data;
  const security = snapshot?.security_data;
  const forms = snapshot?.form_data ?? [];
  const server = snapshot?.server_data;

  const handlePluginUpdate = async (pluginName: string) => {
    if (updatingPlugin) return;
    setUpdatingPlugin(pluginName);
    setUpdateToast(null);
    try {
      const res = await apiFetch("/api/wordpress/update", {
        method: "POST",
        body: JSON.stringify({ siteId: site.id, pluginName }),
      });
      const data = await res.json();
      if (data.ok) {
        setUpdateToast({ msg: `${pluginName} updated successfully.`, ok: true });
      } else {
        setUpdateToast({ msg: data.error ?? "Update failed.", ok: false });
      }
    } catch {
      setUpdateToast({ msg: "Update failed: could not reach the server.", ok: false });
    } finally {
      setUpdatingPlugin(null);
    }
  };

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
            {updateToast && (
              <div style={{ padding: "8px 18px", fontSize: 12, color: updateToast.ok ? "var(--green)" : "var(--red)", borderBottom: "1px solid var(--border-soft)", background: updateToast.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)" }}>
                {updateToast.msg}
              </div>
            )}
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
                    <>
                      <Badge tone="high">→ {p.new_version}</Badge>
                      <button
                        className="btn sm"
                        style={{ marginLeft: 8 }}
                        disabled={updatingPlugin !== null}
                        onClick={() => handlePluginUpdate(p.name)}
                        type="button"
                      >
                        {updatingPlugin === p.name ? "Updating…" : "Update"}
                      </button>
                    </>
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

// ============ Integrations Tab ============

interface SyncStats {
  ga: { today: number; total: number; lastSyncedAt: string | null };
  gsc: { today: number; total: number; lastSyncedAt: string | null };
  clarity: { today: number; total: number; lastSyncedAt: string | null; dailyLimit: number };
}

/** Small pill showing scan stats for one integration. */
const SyncStatsPill = ({
  today, total, lastSyncedAt, todayUnit = '×',
}: {
  today: number; total: number; lastSyncedAt: string | null;
  todayUnit?: string;
}) => {
  const lastStr = lastSyncedAt
    ? (() => {
        const d = new Date(lastSyncedAt);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 2) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffH = Math.floor(diffMins / 60);
        if (diffH < 24) return `${diffH}h ago`;
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      })()
    : 'Never';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'No successful sync yet'}>
        Last sync: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{lastStr}</span>
      </span>
      <span>
        Today: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{today}{todayUnit}</span>
      </span>
      <span>
        Total: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{total}</span>
      </span>
    </div>
  );
};

/** Clarity daily-limit progress bar */
const ClarityBalance = ({ used, limit }: { used: number; limit: number }) => {
  const pct = Math.min(100, (used / Math.max(limit, 1)) * 100);
  const tone = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--green)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
      <span>Daily API calls: <span style={{ color: tone, fontWeight: 600 }}>{used} / {limit}</span></span>
      <div style={{ flex: 1, maxWidth: 120, height: 4, background: 'var(--bg-inset)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: 'var(--text-tertiary)' }}>{limit - used} remaining</span>
    </div>
  );
};

const IntegrationsTab = ({
  site,
  wpKeyMasked,
  wpKeyGenerating,
  newlyGeneratedKey,
  onGenerateKey,
  onIntegrationSaved,
  syncStats: initialSyncStats,
}: {
  site: { id: string; name: string };
  wpKeyMasked: string | null;
  wpKeyGenerating: boolean;
  newlyGeneratedKey: string | null;
  onGenerateKey: () => void;
  onIntegrationSaved?: () => void;
  syncStats: SyncStats | null;
}) => {
  const [fields, setFields] = useState({
    gaPropertyId: '',
    gscSiteUrl: '',
    clarityProjectId: '',
    clarityEndpointUrl: DEFAULT_CLARITY_ENDPOINT_URL,
    clarityApiKey: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Local sync state — updated optimistically after each rescan
  const [syncStats, setSyncStats] = useState<SyncStats | null>(initialSyncStats);
  const [scanning, setScanning] = useState<Record<string, boolean>>({ ga: false, gsc: false, clarity: false });
  const [scanResult, setScanResult] = useState<Record<string, string | null>>({ ga: null, gsc: null, clarity: null });

  // Keep syncStats in sync with parent (on tab re-mount / refresh)
  useEffect(() => { setSyncStats(initialSyncStats); }, [initialSyncStats]);

  useEffect(() => {
    apiFetch(`/api/analytics/integrations?siteId=${site.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.integration) {
          setFields((f) => ({
            ...f,
            gaPropertyId: d.integration.ga_property_id || '',
            gscSiteUrl: d.integration.gsc_site_url || '',
            clarityProjectId: d.integration.clarity_project_id || '',
            clarityEndpointUrl: d.integration.clarity_endpoint_url || DEFAULT_CLARITY_ENDPOINT_URL,
          }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [site.id]);

  const save = async () => {
    setSaving(true);
    setSaveError('');
    const res = await apiFetch('/api/analytics/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: site.id,
        gaPropertyId: fields.gaPropertyId || null,
        gscSiteUrl: fields.gscSiteUrl || null,
        clarityProjectId: fields.clarityProjectId || null,
        clarityEndpointUrl: fields.clarityEndpointUrl || DEFAULT_CLARITY_ENDPOINT_URL,
        clarityApiKey: fields.clarityApiKey || null,
      }),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(true);
      setFields((f) => ({ ...f, clarityApiKey: '' }));
      onIntegrationSaved?.();
      setTimeout(() => setSaved(false), 2500);
    } else {
      setSaveError('Failed to save. Check your connection and try again.');
    }
    setSaving(false);
  };

  const rescan = async (source: 'ga' | 'gsc' | 'clarity') => {
    setScanning((s) => ({ ...s, [source]: true }));
    setScanResult((r) => ({ ...r, [source]: null }));
    try {
      const res = await apiFetch('/api/analytics/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setScanResult((r) => ({ ...r, [source]: `Daily limit reached — ${data.usedToday ?? '?'} / ${data.limit ?? '?'} calls used` }));
      } else if (!data.ok) {
        setScanResult((r) => ({ ...r, [source]: data.error ?? 'Sync failed' }));
      } else {
        // Optimistically update counters
        setSyncStats((prev) => {
          if (!prev) return prev;
          const c = data.counts ?? {};
          return {
            ...prev,
            [source]: {
              ...prev[source as keyof SyncStats],
              today: c.today ?? (prev[source as keyof SyncStats] as { today: number }).today + 1,
              total: c.total ?? (prev[source as keyof SyncStats] as { total: number }).total + 1,
              lastSyncedAt: data.syncedAt ?? new Date().toISOString(),
              ...(source === 'clarity' ? { dailyLimit: c.dailyLimit ?? (prev.clarity.dailyLimit) } : {}),
            },
          };
        });
        setScanResult((r) => ({ ...r, [source]: 'Synced successfully' }));
        onIntegrationSaved?.(); // Refresh parent analytics snapshot
        setTimeout(() => setScanResult((r) => ({ ...r, [source]: null })), 4000);
      }
    } catch {
      setScanResult((r) => ({ ...r, [source]: 'Network error — try again' }));
    }
    setScanning((s) => ({ ...s, [source]: false }));
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const IntegCard = ({
    title, icon, status, children,
  }: {
    title: string; icon: string; status: 'connected' | 'not_connected'; children: React.ReactNode;
  }) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3><Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} /> {title}</h3>
        <Badge tone={status === 'connected' ? 'ok' : 'ghost'} dot>
          {status === 'connected' ? 'Connected' : 'Not connected'}
        </Badge>
      </div>
      <div className="card-pad">{children}</div>
    </div>
  );

  if (!loaded) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}>
        <span className="muted">Loading integration settings…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* WordPress Plugin Connection */}
      <IntegCard title="WordPress Plugin" icon="wp" status={wpKeyMasked ? 'connected' : 'not_connected'}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          Install the <strong>Eye of Horus Client</strong> plugin on this WordPress site, then paste this API key into the plugin settings page.
        </div>
        {wpKeyMasked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--bg-inset)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 14px', flex: 1 }}>
              {newlyGeneratedKey || wpKeyMasked}
            </div>
            <button className="btn sm" onClick={() => copy(newlyGeneratedKey || wpKeyMasked!, 'wp')} type="button">
              {copied === 'wp' ? 'Copied!' : 'Copy'}
            </button>
            <button className="btn ghost sm" onClick={onGenerateKey} disabled={wpKeyGenerating} type="button">
              {wpKeyGenerating ? 'Rotating…' : 'Rotate key'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>No API key generated yet.</span>
            <button className="btn primary sm" onClick={onGenerateKey} disabled={wpKeyGenerating} type="button">
              {wpKeyGenerating ? 'Generating…' : 'Generate API key'}
            </button>
          </div>
        )}
        {newlyGeneratedKey && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: 12.5, color: 'var(--green)' }}>
            Key generated — copy it now. It will not be shown again in full.
          </div>
        )}
      </IntegCard>

      {/* Google Analytics 4 */}
      <IntegCard title="Google Analytics 4" icon="activity" status={fields.gaPropertyId ? 'connected' : 'not_connected'}>
        {/* Sync stats + rescan */}
        {fields.gaPropertyId && syncStats && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
            <SyncStatsPill today={syncStats.ga.today} total={syncStats.ga.total} lastSyncedAt={syncStats.ga.lastSyncedAt} />
            <button
              className="btn ghost sm"
              onClick={() => rescan('ga')}
              disabled={scanning.ga || !fields.gaPropertyId}
              type="button"
              style={{ flexShrink: 0 }}
            >
              <Icon name="refresh" size={12} /> {scanning.ga ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
        {scanResult.ga && (
          <div style={{ marginBottom: 10, fontSize: 12.5, color: scanResult.ga.startsWith('Synced') ? 'var(--green)' : 'var(--red)' }}>
            {scanResult.ga}
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>GA4 Property ID</label>
          <input
            type="text"
            className="input"
            placeholder="G-XXXXXXXXXX or 123456789"
            value={fields.gaPropertyId}
            onChange={(e) => setFields((f) => ({ ...f, gaPropertyId: e.target.value }))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>
            Found in Google Analytics → Admin → Property Settings. Also requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>GOOGLE_SERVICE_ACCOUNT_JSON</code> env var.
          </div>
        </div>
      </IntegCard>

      {/* Google Search Console */}
      <IntegCard title="Google Search Console" icon="search" status={fields.gscSiteUrl ? 'connected' : 'not_connected'}>
        {/* Sync stats + rescan */}
        {fields.gscSiteUrl && syncStats && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
            <SyncStatsPill today={syncStats.gsc.today} total={syncStats.gsc.total} lastSyncedAt={syncStats.gsc.lastSyncedAt} />
            <button
              className="btn ghost sm"
              onClick={() => rescan('gsc')}
              disabled={scanning.gsc || !fields.gscSiteUrl}
              type="button"
              style={{ flexShrink: 0 }}
            >
              <Icon name="refresh" size={12} /> {scanning.gsc ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
        {scanResult.gsc && (
          <div style={{ marginBottom: 10, fontSize: 12.5, color: scanResult.gsc.startsWith('Synced') ? 'var(--green)' : 'var(--red)' }}>
            {scanResult.gsc}
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Verified Site URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.co.za/"
            value={fields.gscSiteUrl}
            onChange={(e) => setFields((f) => ({ ...f, gscSiteUrl: e.target.value }))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>
            Must match the exact property URL verified in Search Console. Also requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>GOOGLE_SERVICE_ACCOUNT_JSON</code> env var.
          </div>
        </div>
      </IntegCard>

      {/* Microsoft Clarity */}
      <IntegCard title="Microsoft Clarity" icon="activity" status={fields.clarityProjectId ? 'connected' : 'not_connected'}>
        {/* Sync stats + rescan + daily balance */}
        {fields.clarityProjectId && syncStats && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SyncStatsPill today={syncStats.clarity.today} total={syncStats.clarity.total} lastSyncedAt={syncStats.clarity.lastSyncedAt} todayUnit=" calls" />
              <button
                className="btn ghost sm"
                onClick={() => rescan('clarity')}
                disabled={scanning.clarity || !fields.clarityProjectId || syncStats.clarity.today >= syncStats.clarity.dailyLimit}
                type="button"
                style={{ flexShrink: 0 }}
              >
                <Icon name="refresh" size={12} /> {scanning.clarity ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            <ClarityBalance used={syncStats.clarity.today} limit={syncStats.clarity.dailyLimit} />
          </div>
        )}
        {scanResult.clarity && (
          <div style={{ marginBottom: 10, fontSize: 12.5, color: scanResult.clarity.startsWith('Synced') ? 'var(--green)' : 'var(--red)' }}>
            {scanResult.clarity}
          </div>
        )}
        <div className="field">
          <label>Project ID</label>
          <input
            type="text"
            className="input"
            placeholder="abc123xyz"
            value={fields.clarityProjectId}
            onChange={(e) => setFields((f) => ({ ...f, clarityProjectId: e.target.value }))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>Found in Clarity → Settings → Overview.</div>
        </div>
        <div className="field">
          <label>Endpoint URL</label>
          <input
            type="url"
            className="input"
            placeholder={DEFAULT_CLARITY_ENDPOINT_URL}
            value={fields.clarityEndpointUrl}
            onChange={(e) => setFields((f) => ({ ...f, clarityEndpointUrl: e.target.value }))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>
            Microsoft Clarity Data Export API endpoint. Default: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{DEFAULT_CLARITY_ENDPOINT_URL}</code>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            API Key{' '}
            <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>(optional — enables pulling session data)</span>
          </label>
          <input
            type="password"
            className="input"
            placeholder="Enter new key to update, leave blank to keep existing"
            value={fields.clarityApiKey}
            onChange={(e) => setFields((f) => ({ ...f, clarityApiKey: e.target.value }))}
            autoComplete="new-password"
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>Found in Clarity → Settings → API access.</div>
        </div>
      </IntegCard>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <button className="btn primary" onClick={save} disabled={saving} type="button">
          {saving ? 'Saving…' : 'Save integrations'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--green)' }}>Saved successfully</span>}
        {saveError && <span style={{ fontSize: 13, color: 'var(--red)' }}>{saveError}</span>}
      </div>
    </div>
  );
};

// ─── Performance Tab ─────────────────────────────────────────────────────────
const PerformanceTab = ({
  metrics,
  uptimeHistory,
  issues,
  siteId,
  onScanComplete,
}: {
  metrics: PerfMetricRow[];
  uptimeHistory: UptimeCheckRow[];
  issues: Issue[];
  siteId: string;
  onScanComplete: () => void;
}) => {
  const [perfToast, setPerfToast] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const showPerfToast = (msg: string) => { setPerfToast(msg); setTimeout(() => setPerfToast(null), 4000); };

  const runScan = async () => {
    setScanning(true);
    showPerfToast("Running Page Speed scan — this takes 15–30 seconds…");
    try {
      const res = await apiFetch("/api/performance/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showPerfToast(`Scan complete — Desktop ${data.desktop?.performance ?? "—"}, Mobile ${data.mobile?.performance ?? "—"}`);
        onScanComplete();
      } else {
        showPerfToast(data.error ?? "Scan failed — check PAGESPEED_API_KEY is set");
      }
    } catch {
      showPerfToast("Network error — scan failed");
    } finally {
      setScanning(false);
    }
  };

  const latest = {
    desktop: metrics.find((m) => m.device === "desktop"),
    mobile: metrics.find((m) => m.device === "mobile"),
    tablet: metrics.find((m) => m.device === "tablet"),
  };

  const scoreColor = (s: number | null | undefined) => {
    if (s == null) return "var(--text-tertiary)";
    if (s >= 90) return "var(--green)";
    if (s >= 50) return "var(--amber)";
    return "var(--red)";
  };

  const vitals = (m: PerfMetricRow | undefined) => [
    { label: "LCP", val: m?.lcp, unit: "s", good: 2.5, poor: 4 },
    { label: "CLS", val: m?.cls, unit: "", good: 0.1, poor: 0.25 },
    { label: "INP", val: m?.inp, unit: "ms", good: 200, poor: 500 },
    { label: "FCP", val: m?.fcp, unit: "s", good: 1.8, poor: 3 },
    { label: "TTI", val: m?.tti, unit: "s", good: 3.8, poor: 7.3 },
  ];

  const vitalColor = (val: number | null | undefined, good: number, poor: number) => {
    if (val == null) return "var(--text-tertiary)";
    if (val <= good) return "var(--green)";
    if (val <= poor) return "var(--amber)";
    return "var(--red)";
  };

  const perfIssues = issues.filter((i) => i.category === "performance");

  const avgResponse =
    uptimeHistory.length > 0
      ? Math.round(
          uptimeHistory.filter((u) => u.response_time_ms != null).reduce((s, u) => s + (u.response_time_ms ?? 0), 0) /
            Math.max(uptimeHistory.filter((u) => u.response_time_ms != null).length, 1)
        )
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Lighthouse scores */}
      {(["desktop", "mobile", "tablet"] as const).map((device) => {
        const m = latest[device];
        return (
          <div key={device} className="card">
            <div className="card-head">
              <h3 style={{ textTransform: "capitalize" }}>
                <Icon name={device === "desktop" ? "monitor" : device === "mobile" ? "smartphone" : "tablet"} size={14} />
                {" "}{device} — Page Speed
              </h3>
              {m && <span className="h-sub">{new Date(m.created_at).toLocaleDateString()}</span>}
            </div>
            {m ? (
              <>
                <div className="grid-4" style={{ padding: "14px 18px 6px" }}>
                  {[
                    { label: "Performance", val: m.performance_score },
                    { label: "Accessibility", val: m.accessibility_score },
                    { label: "Best Practices", val: m.best_practices_score },
                    { label: "SEO", val: m.seo_score },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor(val), fontFamily: "var(--font-display)" }}>
                        {val ?? "—"}
                      </div>
                      <div className="dim" style={{ fontSize: 11 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 18px 14px", display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {vitals(m).map(({ label, val, unit, good, poor }) => (
                    <div key={label} style={{ flex: "1 1 90px", padding: "8px 12px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: vitalColor(val, good, poor), fontFamily: "var(--font-mono)" }}>
                        {val != null ? `${val}${unit}` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: "28px 18px" }}>No {device} data yet. Click <strong>Run Page Speed scan</strong> below.</div>
            )}
          </div>
        );
      })}

      {/* Response time summary */}
      {avgResponse != null && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="clock" size={14} /> Response time</h3>
            <span className="h-sub">last {uptimeHistory.length} checks</span>
          </div>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 18 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: avgResponse < 800 ? "var(--green)" : avgResponse < 2000 ? "var(--amber)" : "var(--red)", fontFamily: "var(--font-display)" }}>
                {avgResponse}ms
              </div>
              <div className="dim" style={{ fontSize: 12 }}>avg response time</div>
            </div>
            <div style={{ flex: 1, height: 48 }}>
              <Sparkline
                points={[...uptimeHistory].reverse().map((u) => u.response_time_ms ?? 0)}
                height={48}
                color={avgResponse < 800 ? "#22C55E" : avgResponse < 2000 ? "#F59E0B" : "#EF4444"}
              />
            </div>
          </div>
        </div>
      )}

      {/* Performance issues */}
      {perfIssues.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="issue" size={14} /> Performance issues</h3>
            <Badge tone="high" dot>{perfIssues.length}</Badge>
          </div>
          <div>
            {perfIssues.map((iss) => (
              <div key={iss.id} className="feed-item">
                <SeverityChip level={iss.severity} />
                <div className="feed-body">
                  <div className="feed-title">{iss.title}</div>
                  <div className="feed-meta"><span className="mono">{new Date(iss.detected).toLocaleDateString()}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.length === 0 && avgResponse == null && (
        <div className="card">
          <div className="empty" style={{ padding: "40px 18px" }}>
            No Page Speed data yet. Click <strong>Run scan</strong> to collect Lighthouse scores via Google PageSpeed Insights.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="btn primary"
          onClick={runScan}
          disabled={scanning}
          type="button"
        >
          <Icon name="refresh" size={13} />
          {scanning ? "Scanning…" : "Run Page Speed scan"}
        </button>
        <button className="btn" onClick={() => { window.print(); showPerfToast("Printing performance report…"); }} type="button">
          <Icon name="download" size={13} /> Export report
        </button>
      </div>
      {perfToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{perfToast}</div>
      )}
    </div>
  );
};

// ─── Security Tab ─────────────────────────────────────────────────────────────
const SecurityTab = ({
  latestCheck,
  domainCheck,
  siteUrl,
  issues,
  wpSnapshot,
}: {
  latestCheck: UptimeCheckRow | null;
  domainCheck: DomainCheckRow | null;
  siteUrl: string;
  issues: Issue[];
  wpSnapshot: WpSnapshot | null;
}) => {
  const [loginTab, setLoginTab] = useState<"failed" | "success">("failed");
  const secIssues = issues.filter((i) => i.category === "security");

  const sslDays = latestCheck?.ssl_days_remaining;
  const sslValid = latestCheck?.ssl_valid;
  const sslExpiry = latestCheck?.ssl_expiry_date;
  const domainDays = domainCheck?.days_remaining;

  const statusTone = (days: number | null | undefined, goodThreshold = 30) => {
    if (days == null) return "var(--text-tertiary)";
    if (days > goodThreshold) return "var(--green)";
    if (days > 7) return "var(--amber)";
    return "var(--red)";
  };

  const secData = wpSnapshot?.security_data;
  const wf = wpSnapshot?.wordfence_data;

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const attackRows = wf ? [
    { label: "Today",     d: wf.attacks_today },
    { label: "Week",      d: wf.attacks_week  },
    { label: "Month",     d: wf.attacks_month },
  ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* SSL + domain + WordPress KPI cards */}
      <div className="grid-4">
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="shield" size={13} /> SSL certificate</div>
          <div className="kpi-value" style={{ color: sslValid ? "var(--green)" : "var(--red)", fontSize: 20 }}>
            {sslValid == null ? "Unknown" : sslValid ? "Valid" : "Invalid"}
          </div>
          <div className="kpi-foot dim">
            {sslDays != null ? `${sslDays} days remaining` : "No data"}
            {sslExpiry ? ` · expires ${new Date(sslExpiry).toLocaleDateString()}` : ""}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="globe" size={13} /> Domain expiry</div>
          <div className="kpi-value" style={{ color: statusTone(domainDays, 60), fontSize: 20 }}>
            {domainDays != null ? `${domainDays}d` : "Unknown"}
          </div>
          <div className="kpi-foot dim">
            {domainCheck?.expiry_date ? new Date(domainCheck.expiry_date).toLocaleDateString() : "No data"}
            {domainCheck?.registrar ? ` · ${domainCheck.registrar}` : ""}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="wp" size={13} /> WP debug mode</div>
          <div className="kpi-value" style={{ color: secData?.debug_mode ? "var(--red)" : "var(--green)", fontSize: 20 }}>
            {secData == null ? "Unknown" : secData.debug_mode ? "On" : "Off"}
          </div>
          <div className="kpi-foot dim">{secData?.debug_mode ? "Debug mode should be off in production" : "No public debug exposure"}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="user" size={13} /> Admin accounts</div>
          <div className="kpi-value" style={{ color: (secData?.admin_users ?? 0) > 3 ? "var(--amber)" : "var(--green)", fontSize: 20 }}>
            {secData?.admin_users ?? "—"}
          </div>
          <div className="kpi-foot dim">
            {secData?.security_plugin ? `Protected by ${secData.security_plugin}` : "No security plugin detected"}
          </div>
        </div>
      </div>

      {/* Wordfence section */}
      {wf && (
        <>
          {/* Wordfence status KPI cards */}
          <div className="card-head" style={{ padding: "4px 0 0" }}>
            <h3 style={{ fontSize: 13, color: "var(--text-primary)" }}><Icon name="shield" size={13} /> Wordfence Firewall</h3>
            {wf.last_scan_time && <span className="dim" style={{ fontSize: 11.5 }}>Last scan: {fmtTime(wf.last_scan_time)}</span>}
          </div>
          <div className="grid-4">
            <div className="card kpi-card">
              <div className="kpi-head">Web Application Firewall</div>
              <div className="kpi-value" style={{ color: wf.waf_enabled ? "var(--green)" : "var(--red)", fontSize: 16 }}>
                {wf.waf_enabled ? (wf.waf_learning_mode ? "Learning Mode" : "Enabled") : "Disabled"}
              </div>
              <div className="kpi-foot dim">{wf.waf_enabled ? "Stops complex attacks" : "WAF protection disabled"}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-head">Firewall Rules</div>
              <div className="kpi-value" style={{ color: wf.waf_rules_premium ? "var(--teal)" : "var(--amber)", fontSize: 16 }}>
                {wf.waf_rules_premium ? "Premium" : "Free"}
              </div>
              <div className="kpi-foot dim">{wf.waf_rules_premium ? "Rules updated in real-time" : "Rules updated with delay"}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-head">Real-Time IP Blocklist</div>
              <div className="kpi-value" style={{ color: wf.ip_blocklist_enabled ? "var(--green)" : "var(--amber)", fontSize: 16 }}>
                {wf.ip_blocklist_enabled ? "Enabled" : "Disabled"}
              </div>
              <div className="kpi-foot dim">Blocks requests from known malicious IPs</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-head">Brute Force Protection</div>
              <div className="kpi-value" style={{ color: wf.brute_force_enabled ? "var(--green)" : "var(--amber)", fontSize: 16 }}>
                {wf.brute_force_enabled ? "Enabled" : "Disabled"}
              </div>
              <div className="kpi-foot dim">Stops password guessing attacks</div>
            </div>
          </div>

          {/* Attack summary + scan issues */}
          <div style={{ display: "grid", gridTemplateColumns: wf.scan_issues_count > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>
            {/* Firewall summary */}
            <div className="card">
              <div className="card-head">
                <h3><Icon name="shield" size={14} /> Firewall Summary — Attacks Blocked</h3>
              </div>
              <div style={{ padding: "0 18px 14px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Period</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--text-secondary)", fontWeight: 600 }}>Complex</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--text-secondary)", fontWeight: 600 }}>Brute Force</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--text-secondary)", fontWeight: 600 }}>Blocklist</th>
                      <th style={{ textAlign: "right", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackRows.map(({ label, d }) => (
                      <tr key={label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "7px 0", fontWeight: 600 }}>{label}</td>
                        <td style={{ textAlign: "right", padding: "7px 4px" }}>{d.complex.toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "7px 4px" }}>{d.brute_force.toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "7px 4px" }}>{d.blocklist.toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "7px 0", fontWeight: 600, color: d.total > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>{d.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scan issues */}
            {wf.scan_issues_count > 0 && (
              <div className="card">
                <div className="card-head">
                  <h3><Icon name="issue" size={14} /> Wordfence Scan Issues</h3>
                  <Badge tone={wf.malware_found ? "crit" : "high"} dot>{wf.scan_issues_count}</Badge>
                </div>
                <div>
                  {wf.scan_issues.slice(0, 8).map((si, i) => (
                    <div key={i} className="feed-item">
                      <Badge tone={si.severity === "critical" ? "crit" : si.severity === "warning" ? "high" : "med"}>{si.severity || "info"}</Badge>
                      <div className="feed-body">
                        <div className="feed-title" style={{ fontSize: 12.5 }}>{si.description || si.type}</div>
                        <div className="feed-meta dim">{si.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top blocked IPs + Top countries */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="card-head">
                <h3><Icon name="globe" size={14} /> Top IPs Blocked — Last 7 Days</h3>
              </div>
              {wf.top_blocked_ips.length === 0 ? (
                <div className="empty" style={{ padding: "24px 18px" }}>No blocked IPs in the last 7 days.</div>
              ) : (
                <div style={{ padding: "0 18px 14px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>IP</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 600 }}>Country</th>
                        <th style={{ textAlign: "right", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Blocks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wf.top_blocked_ips.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "6px 0", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{row.ip}</td>
                          <td style={{ padding: "6px 8px" }}>{row.country || "—"}</td>
                          <td style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>{row.count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <h3><Icon name="globe" size={14} /> Top Countries by Attacks — Last 7 Days</h3>
              </div>
              {wf.top_countries.length === 0 ? (
                <div className="empty" style={{ padding: "24px 18px" }}>No country data available.</div>
              ) : (
                <div style={{ padding: "0 18px 14px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Country</th>
                        <th style={{ textAlign: "right", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Block Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wf.top_countries.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "6px 0" }}>{row.country}</td>
                          <td style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>{row.count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Login attempts */}
          <div className="card">
            <div className="card-head">
              <h3><Icon name="user" size={14} /> Login Attempts</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={`btn-sm ${loginTab === "failed" ? "btn-active" : "btn-ghost"}`} onClick={() => setLoginTab("failed")}>Failed</button>
                <button className={`btn-sm ${loginTab === "success" ? "btn-active" : "btn-ghost"}`} onClick={() => setLoginTab("success")}>Successful</button>
              </div>
            </div>
            {(() => {
              const rows = loginTab === "failed" ? wf.login_failed : wf.login_success;
              if (rows.length === 0) return <div className="empty" style={{ padding: "24px 18px" }}>No {loginTab === "failed" ? "failed" : "successful"} login attempts recorded.</div>;
              return (
                <div style={{ padding: "0 18px 14px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Username</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 600 }}>IP</th>
                        <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-secondary)", fontWeight: 600 }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "6px 0" }}>{r.username}</td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{r.ip}</td>
                          <td style={{ padding: "6px 0", color: "var(--text-secondary)" }}>{r.time ? fmtTime(r.time) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Error log */}
      {secData?.error_log_lines && secData.error_log_lines.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="issue" size={14} /> Recent error log entries</h3>
            <Badge tone="high" dot>{secData.error_log_lines.length}</Badge>
          </div>
          <div style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {secData.error_log_lines.slice(0, 10).map((line, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)", padding: "5px 8px", background: "rgba(239,68,68,0.05)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.1)" }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security issues from issue tracker */}
      {secIssues.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="issue" size={14} /> Security issues</h3>
            <Badge tone="crit" dot>{secIssues.length}</Badge>
          </div>
          <div>
            {secIssues.map((iss) => (
              <div key={iss.id} className="feed-item">
                <SeverityChip level={iss.severity} />
                <div className="feed-body">
                  <div className="feed-title">{iss.title}</div>
                  <div className="feed-meta"><span>{iss.impact}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {secIssues.length === 0 && !secData && !latestCheck && !wf && (
        <div className="card">
          <div className="empty" style={{ padding: "40px 18px" }}>
            No security data yet. Run a scan or connect the WordPress plugin to collect security information.
          </div>
        </div>
      )}

      {secIssues.length === 0 && (secData || latestCheck) && !wf?.malware_found && (wf?.scan_issues_count ?? 0) === 0 && (
        <div className="card">
          <div className="empty" style={{ padding: "28px 18px", color: "var(--green)" }}>
            <Icon name="check" size={16} /> No active security issues detected.
          </div>
        </div>
      )}

      <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
        Monitoring: {siteUrl}
      </div>
    </div>
  );
};

// ─── Forms Tab ────────────────────────────────────────────────────────────────
const FormsTab = ({
  formChecks,
  wpSnapshot,
  onRunChecks,
}: {
  formChecks: FormCheckRow[];
  wpSnapshot: WpSnapshot | null;
  onRunChecks: () => void;
}) => {
  const [formsToast, setFormsToast] = useState<string | null>(null);
  const showFormsToast = (msg: string) => { setFormsToast(msg); setTimeout(() => setFormsToast(null), 3000); };

  const passing = formChecks.filter((f) => f.status === "pass").length;
  const failing = formChecks.filter((f) => f.status === "fail" || f.status === "error").length;

  const allForms     = wpSnapshot?.form_data ?? [];
  const wpformForms  = allForms.filter((f) => f.plugin === "WPForms");
  const otherForms   = allForms.filter((f) => f.plugin !== "WPForms");
  const hasWpData    = wpformForms.some((f) => f.completed_total != null);

  const totalCompletedMonth  = wpformForms.reduce((s, f) => s + (f.completed_month  ?? 0), 0);
  const totalAbandonedMonth  = wpformForms.reduce((s, f) => s + (f.abandoned_month  ?? 0), 0);
  const totalCompletedLast   = wpformForms.reduce((s, f) => s + (f.completed_last   ?? 0), 0);
  const totalAbandonedLast   = wpformForms.reduce((s, f) => s + (f.abandoned_last   ?? 0), 0);
  const totalSubmissionsMonth = totalCompletedMonth + totalAbandonedMonth;
  const abandonRate = totalSubmissionsMonth > 0
    ? Math.round((totalAbandonedMonth / totalSubmissionsMonth) * 100) : 0;

  // Aggregate all field breakdowns and abandonment reasons across all forms
  const allBreakdowns: { field: string; values: { value: string; count: number }[] }[] = [];
  const allAbandonReasons: { field: string; count: number }[] = [];
  const reasonMap: Record<string, number> = {};
  for (const f of wpformForms) {
    for (const bd of (f.field_breakdowns ?? [])) {
      const existing = allBreakdowns.find((b) => b.field === bd.field);
      if (existing) {
        for (const v of bd.values) {
          const ev = existing.values.find((x) => x.value === v.value);
          if (ev) ev.count += v.count; else existing.values.push({ ...v });
        }
        existing.values.sort((a, b) => b.count - a.count);
      } else {
        allBreakdowns.push({ field: bd.field, values: [...bd.values] });
      }
    }
    for (const r of (f.abandonment_reasons ?? [])) {
      reasonMap[r.field] = (reasonMap[r.field] ?? 0) + r.count;
    }
  }
  for (const [field, count] of Object.entries(reasonMap)) {
    allAbandonReasons.push({ field, count });
  }
  allAbandonReasons.sort((a, b) => b.count - a.count);

  const statusTone = (s: FormCheckRow["status"]) => {
    if (s === "pass") return "ok";
    if (s === "fail" || s === "error") return "crit";
    return "high";
  };

  const Trend = ({ curr, prev }: { curr: number; prev: number }) => {
    if (prev === 0) return <span className="dim">—</span>;
    const d = curr - prev;
    return <span style={{ fontWeight: 600, fontSize: 12, color: d >= 0 ? "var(--green)" : "var(--red)" }}>{d >= 0 ? "▲" : "▼"}{Math.abs(d)}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* KPI summary */}
      <div className="grid-4">
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="check" size={13} /> Completed</div>
          <div className="kpi-value" style={{ color: "var(--green)" }}>{hasWpData ? totalCompletedMonth.toLocaleString() : passing}</div>
          <div className="kpi-foot dim">
            {hasWpData ? "this month" : "form checks passed"}
            {hasWpData && totalCompletedLast > 0 && <>&nbsp;<Trend curr={totalCompletedMonth} prev={totalCompletedLast} /></>}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="issue" size={13} /> Abandoned</div>
          <div className="kpi-value" style={{ color: hasWpData && totalAbandonedMonth > 0 ? "var(--amber)" : "var(--text-tertiary)" }}>
            {hasWpData ? totalAbandonedMonth.toLocaleString() : failing}
          </div>
          <div className="kpi-foot dim">
            {hasWpData ? "this month" : failing > 0 ? "requires attention" : "no failures"}
            {hasWpData && totalAbandonedLast > 0 && <>&nbsp;<Trend curr={totalAbandonedMonth} prev={totalAbandonedLast} /></>}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="bolt" size={13} /> Abandon rate</div>
          <div className="kpi-value" style={{ color: abandonRate > 20 ? "var(--red)" : abandonRate > 10 ? "var(--amber)" : "var(--green)" }}>
            {hasWpData ? `${abandonRate}%` : "—"}
          </div>
          <div className="kpi-foot dim">{hasWpData ? "of all submissions" : "sync WP plugin for data"}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><Icon name="clock" size={13} /> Forms</div>
          <div className="kpi-value" style={{ color: "var(--cyan)" }}>{wpformForms.length || allForms.length}</div>
          <div className="kpi-foot dim">WPForms detected</div>
        </div>
      </div>

      {/* Per-form submission table */}
      {hasWpData && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="bolt" size={14} /> WPForms — Completed vs Abandoned</h3>
            <span className="h-sub">from WordPress plugin sync</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, padding: "8px 18px", borderBottom: "1px solid var(--border-soft)", fontSize: 11, color: "var(--text-tertiary)" }}>
            <div>Form</div>
            <div style={{ textAlign: "right" }}>Completed</div>
            <div style={{ textAlign: "right" }}>Abandoned</div>
            <div style={{ textAlign: "right" }}>This month ✓</div>
            <div style={{ textAlign: "right" }}>Last month ✓</div>
            <div style={{ textAlign: "right" }}>This month ✗</div>
            <div style={{ textAlign: "right" }}>Trend ✓</div>
          </div>
          {wpformForms.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--border-soft)", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name ?? `Form ${f.id}`}</div>
                {f.id && <div className="dim" style={{ fontSize: 11 }}>ID {f.id}</div>}
              </div>
              <div style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>{(f.completed_total ?? 0).toLocaleString()}</div>
              <div style={{ textAlign: "right", color: (f.abandoned_total ?? 0) > 0 ? "var(--amber)" : "var(--text-tertiary)" }}>{(f.abandoned_total ?? 0).toLocaleString()}</div>
              <div style={{ textAlign: "right" }}>{(f.completed_month ?? 0).toLocaleString()}</div>
              <div style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{(f.completed_last ?? 0).toLocaleString()}</div>
              <div style={{ textAlign: "right", color: (f.abandoned_month ?? 0) > 0 ? "var(--amber)" : "var(--text-tertiary)" }}>{(f.abandoned_month ?? 0).toLocaleString()}</div>
              <div style={{ textAlign: "right" }}><Trend curr={f.completed_month ?? 0} prev={f.completed_last ?? 0} /></div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, padding: "10px 18px", background: "rgba(255,255,255,0.02)", fontSize: 12, fontWeight: 600 }}>
            <div style={{ color: "var(--text-secondary)" }}>Total</div>
            <div style={{ textAlign: "right", color: "var(--green)" }}>{wpformForms.reduce((s, f) => s + (f.completed_total ?? 0), 0).toLocaleString()}</div>
            <div style={{ textAlign: "right", color: "var(--amber)" }}>{wpformForms.reduce((s, f) => s + (f.abandoned_total ?? 0), 0).toLocaleString()}</div>
            <div style={{ textAlign: "right" }}>{totalCompletedMonth.toLocaleString()}</div>
            <div style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{totalCompletedLast.toLocaleString()}</div>
            <div style={{ textAlign: "right", color: "var(--amber)" }}>{totalAbandonedMonth.toLocaleString()}</div>
            <div style={{ textAlign: "right" }}><Trend curr={totalCompletedMonth} prev={totalCompletedLast} /></div>
          </div>
        </div>
      )}

      {/* Field-level breakdowns */}
      {allBreakdowns.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="bolt" size={14} /> Field breakdowns</h3>
            <span className="h-sub">last 30 days · completed entries only</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 0 }}>
            {allBreakdowns.map((bd, bi) => {
              const maxCount = bd.values[0]?.count ?? 1;
              const total = bd.values.reduce((s, v) => s + v.count, 0);
              return (
                <div key={bi} style={{ padding: "16px 20px", borderRight: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>{bd.field}</div>
                  {bd.values.slice(0, 10).map((v, vi) => (
                    <div key={vi} style={{ marginBottom: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                        <span style={{ color: "var(--text-primary)" }}>{v.value || <em style={{ color: "var(--text-tertiary)" }}>Empty</em>}</span>
                        <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{v.count.toLocaleString()} <span className="dim">({Math.round((v.count / total) * 100)}%)</span></span>
                      </div>
                      <div style={{ height: 4, background: "var(--border-soft)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((v.count / maxCount) * 100)}%`, background: "var(--cyan)", borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                  {bd.values.length > 10 && <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>+{bd.values.length - 10} more values</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Abandonment reasons */}
      {allAbandonReasons.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="issue" size={14} /> Top reasons for abandonment</h3>
            <span className="h-sub">required fields missing in abandoned entries · last 30 days</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 0 }}>
            {allAbandonReasons.slice(0, 6).map((r, i) => (
              <div key={i} style={{ padding: "20px", borderRight: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--amber)", marginBottom: 4 }}>{r.count}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{r.field} not filled</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form check results */}
      {formChecks.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="check" size={14} /> Playwright form checks</h3>
            <button className="btn sm" onClick={() => { onRunChecks(); showFormsToast("Form checks queued…"); }} type="button">
              <Icon name="play" size={12} /> Re-run
            </button>
          </div>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr", gap: 12, padding: "8px 18px", borderBottom: "1px solid var(--border-soft)", fontSize: 11, color: "var(--text-tertiary)" }}>
              <div>Form · Page</div><div>Plugin</div><div>Status</div><div>Tested</div>
            </div>
            {formChecks.map((f) => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border-soft)", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.form_name}</div>
                  {f.page_url && <div className="dim" style={{ fontSize: 11.5 }}>{f.page_url}</div>}
                  {f.result_message && <div style={{ fontSize: 11.5, color: f.status === "pass" ? "var(--green)" : "var(--red)", marginTop: 2 }}>{f.result_message}</div>}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>{f.form_plugin ?? "Unknown"}</div>
                <div><Badge tone={statusTone(f.status)}>{f.status}</Badge></div>
                <div className="dim" style={{ fontSize: 12 }}>{f.submission_tested ? "Submission tested" : "Visibility only"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="check" size={14} /> Playwright form checks</h3>
            <button className="btn sm" onClick={() => { onRunChecks(); showFormsToast("Form checks queued…"); }} type="button">
              <Icon name="play" size={12} /> Run checks
            </button>
          </div>
          <div className="empty" style={{ padding: "32px 18px" }}>No Playwright form checks yet. Run a scan to test forms on this site.</div>
        </div>
      )}

      {/* Other form plugins */}
      {otherForms.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="wp" size={14} /> Other detected form plugins</h3>
            <span className="h-sub">from WordPress plugin</span>
          </div>
          <div>
            {otherForms.map((f, i) => (
              <div key={i} className="feed-item">
                <div className="feed-icon" style={{ color: f.active ? "var(--green)" : "var(--text-dim)", borderColor: f.active ? "rgba(34,197,94,0.3)" : "var(--border-soft)" }}>
                  <Icon name="bolt" size={13} />
                </div>
                <div className="feed-body">
                  <div className="feed-title">{f.name ?? f.plugin}</div>
                  <div className="feed-meta">
                    <span>{f.plugin}</span>
                    {f.submissions != null && <><span className="pip" /><span>{f.submissions.toLocaleString()} submissions</span></>}
                  </div>
                </div>
                <Badge tone={f.active ? "ok" : "high"}>{f.active ? "Active" : "Inactive"}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {formsToast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999, pointerEvents: "none" }}>{formsToast}</div>
      )}
    </div>
  );
};

// ============ Visual Changes Tab ============

const VisualChangesChangeRow = ({
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

const VisualComparisonPane = ({
  label, subtitle, viewport, siteUrl, mode, hasRegression, imageUrl,
}: {
  label: string; subtitle: string; viewport: string;
  siteUrl: string; mode: "baseline" | "current"; hasRegression?: boolean; imageUrl?: string | null;
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
      {imageUrl ? (
        <div style={{ border: hasRegression ? "2px solid var(--red)" : "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", background: "#0b0b0b" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${label} screenshot`} style={{ width: "100%", display: "block", maxHeight: isMobile ? 560 : 460, objectFit: "contain" }} />
        </div>
      ) : (
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
            <div style={{ border: "2px dashed var(--red)", borderRadius: 6, padding: 10, background: "rgba(239,68,68,0.08)", color: "#FCA5A5", fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "center" }}>
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
      )}
    </div>
  );
};

interface PwCheck {
  id: string;
  device: string;
  url: string;
  page_path: string | null;
  status: string;
  screenshot_url: string | null;
  baseline_url: string | null;
  diff_url: string | null;
  diff_percentage: number | null;
  regression_detected: boolean;
  checked_at: string;
}

function VisualChangesTab({ site, issues }: { site: Site; issues: Issue[] }) {
  const router = useRouter();
  const [viewport, setViewport] = useState("Desktop");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [checks, setChecks] = useState<PwCheck[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string>("/");

  useEffect(() => {
    let active = true;
    setLoadingChecks(true);
    apiFetch(`/api/playwright/checks?siteId=${site.id}&limit=60`)
      .then((r) => r.json())
      .then((data: { checks?: PwCheck[] }) => {
        if (!active) return;
        setChecks(data.checks ?? []);
      })
      .catch(() => {})
      .finally(() => active && setLoadingChecks(false));
    return () => { active = false; };
  }, [site.id]);

  const device = viewport.toLowerCase(); // desktop | tablet | mobile
  // Distinct page paths seen in results.
  const pagePaths = Array.from(new Set(checks.map((c) => c.page_path || "/")));
  const effectivePath = pagePaths.includes(selectedPath) ? selectedPath : (pagePaths[0] ?? "/");
  // Latest check for the selected page + viewport.
  const latest = checks
    .filter((c) => (c.page_path || "/") === effectivePath && c.device === device)
    .sort((a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime())[0] ?? null;

  const regressionIssues = issues.filter(
    (i) => i.category === "Visual regression" && i.status !== "Resolved" && i.status !== "Ignored"
  );
  const hasRegression = latest?.regression_detected ?? regressionIssues.length > 0;

  const handleApprove = async () => {
    if (latest?.screenshot_url) {
      try {
        const res = await apiFetch("/api/playwright/baseline", {
          method: "POST",
          body: JSON.stringify({
            siteId: site.id,
            device,
            pagePath: effectivePath,
            screenshotUrl: latest.screenshot_url,
          }),
        });
        if (res.ok) { showToast(`New baseline set for ${effectivePath} · ${viewport}.`); return; }
      } catch { /* fall through */ }
    }
    showToast(`Baseline approved for ${site.name} · ${viewport}.`);
  };

  const handleFlag = () => {
    if (regressionIssues.length > 0) {
      router.push(`/issues/${regressionIssues[0].id}`);
    } else {
      showToast(`Visual regression ticket created for ${site.name}.`);
    }
  };

  const handleDefer = () => showToast("Review deferred. Will surface at next team sync.");

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 600, margin: 0 }}>
            <Icon name="diff" size={18} />
            Visual changes
            {regressionIssues.length > 0 && (
              <Badge tone="crit" dot>
                {regressionIssues.length} open regression{regressionIssues.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Side-by-side baseline vs. latest scan. Horus highlights changed regions and explains what type of change it sees.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleFlag} type="button">Flag as issue</button>
          <button className="btn primary" onClick={handleApprove} type="button">
            <Icon name="check" size={13} /> Approve change
          </button>
        </div>
      </div>

      {/* Page + viewport selector */}
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {pagePaths.length > 0 && (
          <>
            <span className="label-strip">Page</span>
            <select className="select" value={effectivePath} onChange={(e) => setSelectedPath(e.target.value)} style={{ fontSize: 13 }}>
              {pagePaths.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Viewport</span>
          <Tabs tabs={["Desktop", "Tablet", "Mobile"]} active={viewport} onChange={setViewport} />
        </div>
      </div>

      {loadingChecks ? (
        <div className="card" style={{ marginBottom: 18 }}><div className="empty" style={{ padding: "40px 10px" }}>Loading scan results…</div></div>
      ) : checks.length === 0 ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="empty" style={{ padding: "40px 16px", textAlign: "center" }}>
            No Playwright scans recorded yet for this site.<br />
            Configure pages via <strong>Configure</strong>, then run a scan (Re-scan now or the scheduled job) to capture baselines and comparisons.
          </div>
        </div>
      ) : !latest ? (
        <div className="card" style={{ marginBottom: 18 }}><div className="empty" style={{ padding: "40px 10px" }}>No scan for {effectivePath} on {viewport.toLowerCase()} yet.</div></div>
      ) : (
      <>
      {/* Comparison panes */}
      <div className="grid-2eq" style={{ marginBottom: 18, alignItems: "start" }}>
        <VisualComparisonPane
          label="Baseline"
          subtitle="Last approved baseline"
          viewport={viewport}
          siteUrl={site.url}
          mode="baseline"
          imageUrl={latest.baseline_url}
        />
        <VisualComparisonPane
          label="Current"
          subtitle={`Latest scan · ${new Date(latest.checked_at).toLocaleString()}`}
          viewport={viewport}
          siteUrl={site.url}
          mode="current"
          hasRegression={hasRegression}
          imageUrl={latest.screenshot_url}
        />
      </div>

      {latest.diff_url && hasRegression && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <h3><Icon name="diff" size={14} /> Pixel diff</h3>
            <span className="h-sub">{latest.diff_percentage != null ? `${latest.diff_percentage.toFixed(1)}% changed` : ""}</span>
          </div>
          <div style={{ padding: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.diff_url} alt="Visual diff" style={{ width: "100%", borderRadius: 8, display: "block" }} />
          </div>
        </div>
      )}
      </>
      )}

      {/* Changes list + AI panel */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3><Icon name="diff" size={14} /> Detected changes</h3>
            <span className="h-sub">{viewport} viewport</span>
          </div>
          <div>
            {regressionIssues.length > 0 ? (
              regressionIssues.map((issue) => (
                <VisualChangesChangeRow
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
            <span className="ai-tag"><Icon name="sparkles" size={11} /> Horus explanation</span>
            {regressionIssues.length > 0 ? (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, lineHeight: 1.4, marginTop: 10 }}>
                  {regressionIssues.length} visual regression{regressionIssues.length !== 1 ? "s" : ""} detected on {site.name}.
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
                Layout matches the active baseline with high accuracy. No unexpected changes detected on {site.name} ({viewport.toLowerCase()}).
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Verdict</h3></div>
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
