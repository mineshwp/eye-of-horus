"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { apiFetch } from "@/lib/auth/index";
import {
  Icon,
  Badge,
  Toggle,
  Favicon
} from "@/components/ui";

interface AlertSettings {
  email_recipients: string[];
  whatsapp_recipients: string[];
  email_alerts_enabled: boolean;
  whatsapp_alerts_enabled: boolean;
  alert_on_site_down: boolean;
  alert_on_ssl_critical: boolean;
  alert_on_critical_issues: boolean;
  dedup_window_hours: number;
  alert_on_performance_drop?: boolean;
  alert_on_traffic_drop?: boolean;
  alert_on_js_errors?: boolean;
  alert_on_conversion_drop?: boolean;
}

interface AlertRuleRow {
  id: string;
  severity: string;
  trigger: string;
  channels: string;
  template: string | null;
  enabled: boolean;
  is_builtin: boolean;
  sort_order: number;
}

export default function SettingsPage() {
  const { sites } = useApp();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const [activeSection, setActiveSection] = useState("sites");

  const [scanFreq, setScanFreq] = useState("Every 15 minutes");
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    wp: true,
    forms: true,
    sec: true,
    perf: true,
    content: true,
    viz: true,
    slack: true,
    email: true,
    sms: false,
    webhook: false,
  });

  const [viewports, setViewports] = useState<Record<string, boolean>>({
    desktop: true,
    tablet: true,
    mobile: true
  });

  // Alert settings state
  const [alertSettings, setAlertSettings] = useState<AlertSettings | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const [newEmailRecipient, setNewEmailRecipient] = useState('');
  const [newWaRecipient, setNewWaRecipient] = useState('');
  const [testAlertStatus, setTestAlertStatus] = useState<string | null>(null);

  // Custom alert rules (persisted in alert_rules)
  const [alertRules, setAlertRules] = useState<AlertRuleRow[]>([]);
  const [rulesBusy, setRulesBusy] = useState(false);

  // Integration config status (from /api/health)
  const [healthItems, setHealthItems] = useState<{ key: string; label: string; configured: boolean }[]>([]);

  // Analytics auto-sync time (stored in global_settings, "HH:MM" UTC)
  const [analyticsSyncTime, setAnalyticsSyncTime] = useState('02:00');
  const [analyticsSyncSaving, setAnalyticsSyncSaving] = useState(false);
  const [analyticsSyncSaved, setAnalyticsSyncSaved] = useState(false);

  const fetchAlertSettings = useCallback(async () => {
    setAlertLoading(true);
    try {
      const res = await apiFetch('/api/alerts/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setAlertSettings(data.settings);
      }
    } finally {
      setAlertLoading(false);
    }
  }, []);

  const fetchAnalyticsSyncTime = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings?.analytics_sync_time) {
          setAnalyticsSyncTime(data.settings.analytics_sync_time);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const saveAnalyticsSyncTime = async () => {
    setAnalyticsSyncSaving(true);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics_sync_time: analyticsSyncTime }),
      });
      if (res.ok) {
        setAnalyticsSyncSaved(true);
        showToast(`Auto-sync scheduled for ${analyticsSyncTime} UTC daily`);
        setTimeout(() => setAnalyticsSyncSaved(false), 3000);
      }
    } finally {
      setAnalyticsSyncSaving(false);
    }
  };

  const fetchAlertRules = useCallback(async () => {
    try {
      const res = await apiFetch('/api/alerts/rules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rules)) setAlertRules(data.rules);
      }
    } catch { /* ignore */ }
  }, []);

  const saveAlertRule = async (rule: { id?: string; severity: string; trigger: string; channels: string }) => {
    setRulesBusy(true);
    try {
      const res = await apiFetch('/api/alerts/rules', {
        method: rule.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        await fetchAlertRules();
        showToast(rule.id ? 'Alert rule updated.' : 'Custom alert rule added.');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(`Could not save rule: ${data.error ?? 'unknown error'}`);
      }
    } finally {
      setRulesBusy(false);
    }
  };

  const toggleAlertRule = async (id: string, enabled: boolean) => {
    setAlertRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await apiFetch('/api/alerts/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    });
  };

  const deleteAlertRule = async (id: string) => {
    const res = await apiFetch(`/api/alerts/rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setAlertRules((prev) => prev.filter((r) => r.id !== id));
      showToast('Alert rule removed.');
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ?? 'Could not remove rule.');
    }
  };

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) setHealthItems(data.items);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAlertSettings();
    fetchAnalyticsSyncTime();
    fetchAlertRules();
    fetchHealth();
  }, [fetchAlertSettings, fetchAnalyticsSyncTime, fetchAlertRules, fetchHealth]);

  const saveAlertSettings = async (updates: Partial<AlertSettings>) => {
    if (!alertSettings) return;
    const merged = { ...alertSettings, ...updates };
    setAlertSettings(merged);
    setAlertSaving(true);
    try {
      const res = await apiFetch('/api/alerts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailRecipients: merged.email_recipients,
          whatsappRecipients: merged.whatsapp_recipients,
          emailEnabled: merged.email_alerts_enabled,
          whatsappEnabled: merged.whatsapp_alerts_enabled,
          alertOnSiteDown: merged.alert_on_site_down,
          alertOnSslCritical: merged.alert_on_ssl_critical,
          alertOnCriticalIssues: merged.alert_on_critical_issues,
          dedupWindowHours: merged.dedup_window_hours,
          alertOnPerformanceDrop: merged.alert_on_performance_drop,
          alertOnTrafficDrop: merged.alert_on_traffic_drop,
          alertOnJsErrors: merged.alert_on_js_errors,
          alertOnConversionDrop: merged.alert_on_conversion_drop,
        }),
      });
      if (res.ok) {
        setAlertSaved(true);
        setTimeout(() => setAlertSaved(false), 2000);
      }
    } finally {
      setAlertSaving(false);
    }
  };

  const addEmailRecipient = () => {
    const email = newEmailRecipient.trim();
    if (!email || !email.includes('@') || !alertSettings) return;
    if (alertSettings.email_recipients.includes(email)) return;
    const updated = [...alertSettings.email_recipients, email];
    setNewEmailRecipient('');
    saveAlertSettings({ email_recipients: updated });
  };

  const removeEmailRecipient = (email: string) => {
    if (!alertSettings) return;
    saveAlertSettings({ email_recipients: alertSettings.email_recipients.filter((e) => e !== email) });
  };

  const addWaRecipient = () => {
    const num = newWaRecipient.trim();
    if (!num || !alertSettings) return;
    if (alertSettings.whatsapp_recipients.includes(num)) return;
    setNewWaRecipient('');
    saveAlertSettings({ whatsapp_recipients: [...alertSettings.whatsapp_recipients, num] });
  };

  const removeWaRecipient = (num: string) => {
    if (!alertSettings) return;
    saveAlertSettings({ whatsapp_recipients: alertSettings.whatsapp_recipients.filter((n) => n !== num) });
  };

  const sendTestAlert = async () => {
    setTestAlertStatus('Sending…');
    try {
      const res = await apiFetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'test',
          siteName: 'Test Site',
          siteUrl: 'https://example.com',
          alertType: 'critical_issue',
          issueTitle: 'Test alert from Eye of Horus settings',
          severity: 'critical',
        }),
      });
      const data = await res.json();
      setTestAlertStatus(
        res.ok
          ? `Sent — ${data.emailsSent} email${data.emailsSent !== 1 ? 's' : ''}, ${data.whatsappSent} WhatsApp`
          : 'Failed to send',
      );
    } catch {
      setTestAlertStatus('Error sending test alert');
    }
    setTimeout(() => setTestAlertStatus(null), 5000);
  };

  const flip = (k: string) => setToggles((t) => ({ ...t, [k]: !t[k] }));
  const flipVp = (k: string) => setViewports((v) => ({ ...v, [k]: !v[k] }));

  const handleExportConfig = () => {
    const config = {
      exported_at: new Date().toISOString(),
      scan_frequency: scanFreq,
      viewports,
      detection_rules: toggles,
      sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url, status: s.status })),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "horus-config.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Config exported to horus-config.json");
  };

  const handleAddSite = () => {
    router.push("/admin/clients");
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="settings" size={22} />
            Monitoring &amp; configuration
          </h1>
          <p className="page-sub">
            Configure what Horus watches, how often, and who hears about it. Settings apply per-site; defaults shown below.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleExportConfig} type="button">
            <Icon name="download" size={13} /> Export config
          </button>
          <button className="btn primary" onClick={handleAddSite} type="button">
            <Icon name="plus" size={13} /> Add website
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
        <aside style={{ position: "sticky", top: 90, height: "fit-content" }}>
          <div className="card" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <SideLink label="Sites & scanning" active={activeSection === "sites"} onClick={() => setActiveSection("sites")} />
            <SideLink label="Detection rules" active={activeSection === "detection"} onClick={() => setActiveSection("detection")} />
            <SideLink label="Alert routing" active={activeSection === "alerts"} onClick={() => setActiveSection("alerts")} />
            <SideLink label="Integrations" active={activeSection === "integrations"} onClick={() => setActiveSection("integrations")} />
            <SideLink label="Data & privacy" active={activeSection === "privacy"} onClick={() => setActiveSection("privacy")} />
            <SideLink label="Team & permissions" active={activeSection === "team"} onClick={() => setActiveSection("team")} />
            <SideLink label="API & webhooks" active={activeSection === "api"} onClick={() => setActiveSection("api")} />
            <SideLink label="Billing" active={activeSection === "billing"} onClick={() => setActiveSection("billing")} />
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {activeSection === "integrations" && <GlobalApiKeysCard />}
          {activeSection === "privacy" && <DataPrivacyCard />}
          {activeSection !== "integrations" && activeSection !== "privacy" && <>
          {/* Monitored sites */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="sites" size={14} /> Monitored sites
              </h3>
              <button className="btn ghost sm" onClick={handleAddSite} type="button">
                <Icon name="plus" size={12} /> Add site
              </button>
            </div>
            <div>
              {sites.length === 0 ? (
                <div className="empty" style={{ padding: "24px 18px" }}>
                  No sites added yet. Click &quot;Add site&quot; to get started.
                </div>
              ) : (
                sites.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto",
                      gap: 14,
                      alignItems: "center",
                      padding: "14px 18px",
                      borderBottom: "1px solid var(--border-soft)",
                    }}
                  >
                    <div className="site-cell">
                      <Favicon site={s} />
                      <div>
                        <div className="site-name">{s.name}</div>
                        <div className="site-url">{s.url}</div>
                      </div>
                    </div>
                    <Badge tone="ghost">3 viewports</Badge>
                    <Badge tone={s.status === "healthy" ? "ok" : s.status === "critical" ? "crit" : "high"} dot>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </Badge>
                    <button className="btn ghost sm" onClick={() => router.push(`/sites/${s.id}`)} type="button">
                      Configure
                    </button>
                  </div>
                ))
              )}
              {sites.length > 4 && (
                <div style={{ padding: "12px 18px", textAlign: "center" }}>
                  <button className="btn ghost sm" onClick={() => router.push("/admin/clients")} type="button">
                    View all {sites.length} sites
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scan config */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="refresh" size={14} /> Scan schedule
              </h3>
              <span className="h-sub">global defaults</span>
            </div>
            <div className="card-pad">
              <SettingRow
                title="Uptime frequency"
                desc="How often Horus checks whether each monitored site is reachable. Deeper QA and analytics run daily."
                control={
                  <select className="select" value={scanFreq} onChange={(e) => setScanFreq(e.target.value)}>
                    <option value="Every 5 minutes">Every 5 minutes</option>
                    <option value="Every 15 minutes">Every 15 minutes</option>
                    <option value="Every hour">Every hour</option>
                    <option value="Every 6 hours">Every 6 hours</option>
                    <option value="Daily at 06:00">Daily at 06:00</option>
                  </select>
                }
              />
              <SettingRow
                title="Pages monitored"
                desc="Add specific URLs or auto-crawl up to 50 most-visited pages."
                control={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Badge tone="ghost" lg>
                      per site
                    </Badge>
                    <button className="btn sm" onClick={() => router.push("/admin/clients")} type="button">
                      Edit list
                    </button>
                  </div>
                }
              />
              <SettingRow
                title="Viewports"
                desc="Capture each page at these widths and compare per viewport."
                control={
                  <div style={{ display: "flex", gap: 8 }}>
                    <VpToggle label="Desktop · 1440" icon="desktop" on={viewports.desktop} onClick={() => flipVp("desktop")} />
                    <VpToggle label="Tablet · 820" icon="tablet" on={viewports.tablet} onClick={() => flipVp("tablet")} />
                    <VpToggle label="Mobile · 390" icon="mobile" on={viewports.mobile} onClick={() => flipVp("mobile")} />
                  </div>
                }
              />
              <SettingRow
                title="Authenticated areas"
                desc="Provide a test login so Horus can scan logged-in pages."
                control={
                  <button className="btn sm" onClick={() => showToast("Configure test credentials inside each site's detail page.")} type="button">
                    Configure
                  </button>
                }
              />
            </div>
          </div>

          {/* Analytics auto-sync */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="activity" size={14} /> Analytics auto-sync
              </h3>
              <span className="h-sub">runs daily for all connected sites</span>
            </div>
            <div className="card-pad">
              <SettingRow
                title="Daily sync time"
                desc={
                  <>
                    Horus syncs Google Analytics and Search Console once per day at this time. Microsoft Clarity auto-sync runs at most once per site per day{' '}
                    <strong>(UTC)</strong>. The cron job fires at 2:00 UTC by default — update{' '}
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>vercel.json</code> to match if you change this.
                  </>
                }
                control={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="time"
                      className="input"
                      style={{ width: 120 }}
                      value={analyticsSyncTime}
                      onChange={(e) => setAnalyticsSyncTime(e.target.value)}
                    />
                    <button
                      className="btn sm"
                      onClick={saveAnalyticsSyncTime}
                      disabled={analyticsSyncSaving}
                      type="button"
                    >
                      {analyticsSyncSaving ? 'Saving…' : analyticsSyncSaved ? 'Saved ✓' : 'Save'}
                    </button>
                  </div>
                }
              />
              <SettingRow
                title="Manual trigger"
                desc="Run analytics sync for all sites immediately. Useful after a config change or to verify credentials."
                control={
                  <button
                    className="btn sm"
                    onClick={async () => {
                      showToast('Analytics sync triggered — check site Integration tabs for updated counts.');
                      await apiFetch('/api/analytics/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ allSites: true }),
                      }).catch(() => null);
                    }}
                    type="button"
                  >
                    <Icon name="refresh" size={12} /> Sync all sites now
                  </button>
                }
              />
              <div style={{ padding: '10px 0 2px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Clarity daily limit:</strong> Auto-sync runs once per site per day. Manual Clarity syncs use the remaining daily API-call quota, tracked in the site&apos;s Integration tab.
              </div>
            </div>
          </div>

          {/* Detection rules */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="filter" size={14} /> Detection rules
              </h3>
            </div>
            <div className="card-pad">
              <SettingRow
                title="Visual regression"
                desc="DOM-aware screenshot diffing per viewport. Recommended."
                control={<Toggle on={toggles.viz} onClick={() => flip("viz")} />}
              />
              <SettingRow
                title="WordPress update monitoring"
                desc="Track core, plugin, and theme update availability and risk."
                control={<Toggle on={toggles.wp} onClick={() => flip("wp")} />}
              />
              <SettingRow
                title="Form testing"
                desc="Submits test payloads to every detected form daily."
                control={<Toggle on={toggles.forms} onClick={() => flip("forms")} />}
              />
              <SettingRow
                title="Security checks"
                desc="SSL, headers, malware scan, admin user changes."
                control={<Toggle on={toggles.sec} onClick={() => flip("sec")} />}
              />
              <SettingRow
                title="Page Speed (Lighthouse)"
                desc="Daily Google PageSpeed Insights scores — desktop + mobile per site."
                control={<Toggle on={toggles.perf} onClick={() => flip("perf")} />}
              />
              <SettingRow
                title="Content & tag changes"
                desc="Copy edits, tracking script changes, structured-data changes."
                control={<Toggle on={toggles.content} onClick={() => flip("content")} />}
              />
            </div>
          </div>

          {/* Alert rules */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="bell" size={14} /> Alert rules
              </h3>
            </div>
            <div className="card-pad">
              {alertRules.length === 0 && (
                <div className="dim" style={{ fontSize: 13, padding: "8px 0" }}>No alert rules yet.</div>
              )}
              {alertRules.map((rule) => (
                <AlertRule
                  key={rule.id}
                  rule={rule}
                  busy={rulesBusy}
                  onSave={(updates) => saveAlertRule({ id: rule.id, severity: updates.severity, trigger: updates.trigger, channels: updates.channels })}
                  onToggle={(enabled) => toggleAlertRule(rule.id, enabled)}
                  onDelete={rule.is_builtin ? undefined : () => deleteAlertRule(rule.id)}
                />
              ))}
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn ghost sm"
                  disabled={rulesBusy}
                  onClick={() => saveAlertRule({ severity: "medium", trigger: "New custom alert rule", channels: "Email alert recipients" })}
                  type="button"
                >
                  <Icon name="plus" size={12} /> Add custom rule
                </button>
              </div>
            </div>
          </div>

          {/* Integrations status */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="bolt" size={14} /> Integrations status
              </h3>
              <span className="muted" style={{ fontSize: 11 }}>Server-side configuration — features without a key silently no-op.</span>
            </div>
            <div className="card-pad">
              {healthItems.length === 0 ? (
                <div className="dim" style={{ fontSize: 13 }}>Checking integration status…</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {healthItems.map((item) => (
                    <div
                      key={item.key}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8 }}
                    >
                      <Badge tone={item.configured ? "ok" : "high"} dot>
                        {item.configured ? "Configured" : "Not set"}
                      </Badge>
                      <span style={{ fontSize: 13 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notification channels */}
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="bolt" size={14} /> Notification channels
              </h3>
            </div>
            <div className="card-pad">
              <ChannelRow icon="code" label="Slack" sub="Configure via SLACK_WEBHOOK_URL environment variable" on={toggles.slack} onToggle={() => flip("slack")} />
              <ChannelRow
                icon="file"
                label="Email"
                sub={alertSettings ? `${alertSettings.email_recipients.length} recipient${alertSettings.email_recipients.length !== 1 ? 's' : ''} configured` : "Loading…"}
                on={alertSettings?.email_alerts_enabled ?? toggles.email}
                onToggle={() => alertSettings ? saveAlertSettings({ email_alerts_enabled: !alertSettings.email_alerts_enabled }) : flip("email")}
              />
              <ChannelRow
                icon="mobile"
                label="WhatsApp"
                sub={alertSettings ? `${alertSettings.whatsapp_recipients.length} number${alertSettings.whatsapp_recipients.length !== 1 ? 's' : ''} · Twilio` : "Loading…"}
                on={alertSettings?.whatsapp_alerts_enabled ?? toggles.sms}
                onToggle={() => alertSettings ? saveAlertSettings({ whatsapp_alerts_enabled: !alertSettings.whatsapp_alerts_enabled }) : flip("sms")}
              />
              <ChannelRow icon="link" label="Webhook" sub="Configure endpoint URL in environment variables" on={toggles.webhook} onToggle={() => flip("webhook")} />
            </div>
          </div>

          {/* Alert Recipients — wired to /api/alerts/settings */}
          <div className="card">
            <div className="card-head">
              <h3><Icon name="bell" size={14} /> Alert recipients</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {alertSaved && <span style={{ fontSize: 12, color: "var(--green)" }}>Saved</span>}
                {alertSaving && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
                <button className="btn sm" onClick={sendTestAlert} disabled={!!testAlertStatus} type="button">
                  {testAlertStatus ?? "Send test alert"}
                </button>
              </div>
            </div>
            <div className="card-pad">
              {alertLoading && <div className="muted" style={{ fontSize: 13 }}>Loading alert settings…</div>}

              {/* Alert type toggles */}
              {alertSettings && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, paddingBottom: 18, borderBottom: "1px solid var(--border-soft)" }}>
                  {[
                    { key: "alert_on_site_down" as const, label: "Site down" },
                    { key: "alert_on_ssl_critical" as const, label: "SSL critical" },
                    { key: "alert_on_critical_issues" as const, label: "Critical issues" },
                    { key: "alert_on_performance_drop" as const, label: "Performance drop" },
                    { key: "alert_on_traffic_drop" as const, label: "Traffic drop" },
                    { key: "alert_on_js_errors" as const, label: "JS error spike" },
                    { key: "alert_on_conversion_drop" as const, label: "Conversion drop" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => saveAlertSettings({ [key]: !alertSettings[key] })}
                      type="button"
                      style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "6px 12px",
                        background: alertSettings[key] ? "rgba(239,68,68,0.10)" : "var(--bg-inset)",
                        border: `1px solid ${alertSettings[key] ? "rgba(239,68,68,0.35)" : "var(--border-soft)"}`,
                        color: alertSettings[key] ? "#EF4444" : "var(--text-tertiary)",
                        borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: alertSettings[key] ? "#EF4444" : "var(--text-dim)" }} />
                      {label}
                    </button>
                  ))}
                  <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                    Dedup window: {alertSettings.dedup_window_hours}h
                  </span>
                </div>
              )}

              {/* Email recipients */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Email recipients
                </div>
                {alertSettings && alertSettings.email_recipients.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {alertSettings.email_recipients.map((email) => (
                      <div key={email} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)", borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
                        <span style={{ color: "var(--cyan)" }}>{email}</span>
                        <button onClick={() => removeEmailRecipient(email)} type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, lineHeight: 1 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    className="input"
                    placeholder="name@company.com"
                    value={newEmailRecipient}
                    onChange={(e) => setNewEmailRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addEmailRecipient()}
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button className="btn sm" onClick={addEmailRecipient} disabled={!newEmailRecipient.trim()} type="button">
                    Add
                  </button>
                </div>
              </div>

              {/* WhatsApp recipients */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  WhatsApp numbers (Twilio)
                </div>
                {alertSettings && alertSettings.whatsapp_recipients.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {alertSettings.whatsapp_recipients.map((num) => (
                      <div key={num} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
                        <span style={{ color: "var(--green)" }}>{num}</span>
                        <button onClick={() => removeWaRecipient(num)} type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, lineHeight: 1 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="tel"
                    className="input"
                    placeholder="+27821234567"
                    value={newWaRecipient}
                    onChange={(e) => setNewWaRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addWaRecipient()}
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button className="btn sm" onClick={addWaRecipient} disabled={!newWaRecipient.trim()} type="button">
                    Add
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment variables.
                </div>
              </div>
            </div>
          </div>

          {/* Alert notification log */}
          <AlertLogCard />
          </>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-card)", border: "1px solid var(--border-soft)",
          borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500,
          color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          zIndex: 9999, pointerEvents: "none",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Alert Log Card ────────────────────────────────────────────────────────────

interface NotificationLog {
  id: string;
  site_id: string;
  channel: string;
  recipient: string;
  status: string;
  alert_type: string;
  subject: string | null;
  created_at: string;
}

const AlertLogCard = () => {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/alerts/logs?limit=20');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const channelIcon: Record<string, string> = { email: '✉', whatsapp: '💬' };
  const statusColor: Record<string, string> = { sent: 'var(--green)', failed: 'var(--red)', skipped: 'var(--text-dim)' };

  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="file" size={14} /> Notification log</h3>
        <button className="btn sm" onClick={fetchLogs} disabled={loading} type="button">
          {loading ? 'Loading…' : 'Load log'}
        </button>
      </div>
      {loaded && (
        <div className="card-pad">
          {logs.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No notifications sent yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {logs.map((log) => (
                <div key={log.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 80px 70px", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 14, textAlign: "center" }}>{channelIcon[log.channel] ?? '📢'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{log.subject ?? log.alert_type ?? 'Alert'}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{log.recipient}</div>
                  </div>
                  <div style={{ fontSize: 11, color: statusColor[log.status] ?? 'var(--text-secondary)', fontWeight: 600, textTransform: "uppercase" }}>{log.status}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{new Date(log.created_at).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!loaded && !loading && (
        <div className="card-pad">
          <div className="muted" style={{ fontSize: 13 }}>Click &quot;Load log&quot; to see recent notifications.</div>
        </div>
      )}
    </div>
  );
};

const SideLink = ({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) => (
  <button
    className={`nav-item ${active ? "active" : ""}`}
    onClick={onClick}
    style={{
      width: "100%",
      margin: "0",
      padding: "9px 12px",
      textAlign: "left",
      background: active ? "var(--bg-inset)" : "transparent",
      border: 0,
      cursor: "pointer",
      color: active ? "var(--text-primary)" : "var(--text-tertiary)",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
    }}
    type="button"
  >
    {label}
  </button>
);

// ─── Global API Keys Card ─────────────────────────────────────────────────────

const GlobalApiKeysCard = () => {
  const [fields, setFields] = useState({
    openai_api_key: '',
    email_provider: '',
    email_api_key: '',
    email_from_address: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_whatsapp_from: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.settings) {
          setFields((f) => ({ ...f, ...Object.fromEntries(Object.entries(d.settings).map(([k, v]) => [k, v ?? ''])) }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveError('');
    const payload: Record<string, string | null> = {};
    Object.entries(fields).forEach(([k, v]) => {
      if (typeof v === 'string' && v.trim() !== '' && !v.includes('•')) {
        payload[k] = v.trim();
      }
    });
    const res = await apiFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setSaveError('Failed to save. Check your connection and try again.');
    }
    setSaving(false);
  };

  const KeyField = ({ label, fieldKey, placeholder, type = 'text', hint }: { label: string; fieldKey: keyof typeof fields; placeholder: string; type?: string; hint?: string }) => (
    <div className="field" style={{ marginBottom: 16 }}>
      <label>{label}</label>
      <input
        type={type}
        className="input"
        placeholder={placeholder}
        value={fields[fieldKey]}
        onChange={(e) => setFields((f) => ({ ...f, [fieldKey]: e.target.value }))}
        autoComplete="new-password"
      />
      {hint && <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>{hint}</div>}
    </div>
  );

  if (!loaded) {
    return <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}><span className="muted">Loading global settings…</span></div>;
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <Icon name="settings" size={15} /> Global integrations
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Platform-wide API keys used by all sites. Values stored in the database override environment variables. Masked after save — re-enter to update.
        </p>
      </div>

      {/* AI */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><Icon name="sparkles" size={14} /> OpenAI</h3>
          <span className="muted" style={{ fontSize: 12 }}>AI summaries, reports &amp; recommendations</span>
        </div>
        <div className="card-pad">
          <KeyField
            label="API Key"
            fieldKey="openai_api_key"
            placeholder="sk-…"
            type="password"
            hint="Required for all AI features. Can also be set via OPENAI_API_KEY env var."
          />
        </div>
      </div>

      {/* Email */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><Icon name="file" size={14} /> Email provider</h3>
          <span className="muted" style={{ fontSize: 12 }}>Alerts, daily summaries &amp; monthly reports</span>
        </div>
        <div className="card-pad">
          <KeyField
            label="Provider"
            fieldKey="email_provider"
            placeholder="resend / sendgrid / postmark"
            hint="Supported: resend, sendgrid, postmark"
          />
          <KeyField
            label="API Key"
            fieldKey="email_api_key"
            placeholder="re_…"
            type="password"
            hint="Can also be set via EMAIL_PROVIDER_API_KEY env var."
          />
          <KeyField
            label="From address"
            fieldKey="email_from_address"
            placeholder="noreply@youragency.co.za"
            hint="Must be a verified sender with your email provider."
          />
        </div>
      </div>

      {/* WhatsApp / Twilio */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><Icon name="mobile" size={14} /> Twilio WhatsApp</h3>
          <span className="muted" style={{ fontSize: 12 }}>Urgent alerts only</span>
        </div>
        <div className="card-pad">
          <KeyField
            label="Account SID"
            fieldKey="twilio_account_sid"
            placeholder="ACxxxxxxxxxxxxxxxxxxxx"
            hint="Found in your Twilio Console dashboard."
          />
          <KeyField
            label="Auth Token"
            fieldKey="twilio_auth_token"
            placeholder="••••••••••••••••••••••••••"
            type="password"
            hint="Can also be set via TWILIO_AUTH_TOKEN env var."
          />
          <KeyField
            label="WhatsApp From number"
            fieldKey="twilio_whatsapp_from"
            placeholder="whatsapp:+14155238886"
            hint="Your Twilio sandbox or approved WhatsApp sender number."
          />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn primary" onClick={save} disabled={saving} type="button">
          {saving ? 'Saving…' : 'Save global keys'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--green)' }}>Saved successfully</span>}
        {saveError && <span style={{ fontSize: 13, color: 'var(--red)' }}>{saveError}</span>}
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          Keys are masked after saving. Re-enter a field to update it.
        </span>
      </div>
    </>
  );
};

const SettingRow = ({ title, desc, control }: { title: string; desc: React.ReactNode; control: React.ReactNode }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1.5fr 1fr auto",
      gap: 14,
      alignItems: "center",
      padding: "16px 0",
      borderBottom: "1px solid var(--border-soft)",
    }}
  >
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{title}</div>
      <div className="dim" style={{ fontSize: 12.5 }}>
        {desc}
      </div>
    </div>
    <div>{/* spacer */}</div>
    <div>{control}</div>
  </div>
);

const VpToggle = ({ label, icon, on, onClick }: { label: string; icon: string; on: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 11px",
      background: on ? "rgba(0,229,255,0.10)" : "var(--bg-inset)",
      border: `1px solid ${on ? "rgba(0,229,255,0.35)" : "var(--border-soft)"}`,
      color: on ? "var(--cyan)" : "var(--text-tertiary)",
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
    }}
    type="button"
  >
    <Icon name={icon} size={12} /> {label}
  </button>
);

const AlertRule = ({
  rule,
  busy,
  onSave,
  onToggle,
  onDelete,
}: {
  rule: { id: string; severity: string; trigger: string; channels: string; enabled: boolean; is_builtin: boolean };
  busy?: boolean;
  onSave: (updates: { severity: string; trigger: string; channels: string }) => void;
  onToggle: (enabled: boolean) => void;
  onDelete?: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [severity, setSeverity] = useState(rule.severity);
  const [trigger, setTrigger] = useState(rule.trigger);
  const [channels, setChannels] = useState(rule.channels);

  const tone = rule.severity === "critical" ? ("crit" as const) : rule.severity === "high" ? ("high" as const) : rule.severity === "medium" ? ("med" as const) : ("info" as const);
  const label = rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1);

  const startEdit = () => {
    setSeverity(rule.severity);
    setTrigger(rule.trigger);
    setChannels(rule.channels);
    setEditing(true);
  };
  const save = () => {
    if (!trigger.trim()) return;
    onSave({ severity, trigger: trigger.trim(), channels: channels.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 0", borderBottom: "1px solid var(--border-soft)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ width: 130 }}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="info">Info</option>
          </select>
          <input className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Trigger description" style={{ flex: 1 }} />
        </div>
        <input className="input" value={channels} onChange={(e) => setChannels(e.target.value)} placeholder="Channels (e.g. Email alert recipients · WhatsApp)" />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary sm" onClick={save} disabled={busy} type="button">Save</button>
          <button className="btn ghost sm" onClick={() => setEditing(false)} type="button">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr auto",
        gap: 14,
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid var(--border-soft)",
        opacity: rule.enabled ? 1 : 0.55,
      }}
    >
      <Badge tone={tone} dot lg>
        {label}
      </Badge>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{rule.trigger}</div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
          {rule.channels || "No channels set"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Toggle on={rule.enabled} onClick={() => onToggle(!rule.enabled)} />
        <button className="btn ghost sm" onClick={startEdit} type="button">
          Edit
        </button>
        {onDelete && (
          <button className="btn ghost sm" onClick={onDelete} title="Delete rule" type="button">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

const ChannelRow = ({ icon, label, sub, on, onToggle }: { icon: string; label: string; sub: string; on: boolean; onToggle: () => void }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      gap: 14,
      alignItems: "center",
      padding: "14px 0",
      borderBottom: "1px solid var(--border-soft)"
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        className="wp-icon"
        style={{
          width: 36,
          height: 36,
          color: on ? "var(--cyan)" : "var(--text-tertiary)",
          display: "grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--border-soft)",
          borderRadius: 8
        }}
      >
        <Icon name={icon} size={15} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
        <div className="dim" style={{ fontSize: 12 }}>
          {sub}
        </div>
      </div>
    </div>
    <div></div>
    <Toggle on={on} onClick={onToggle} />
  </div>
);

// ── Data & privacy section ────────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

const DataPrivacyCard = () => {
  const [retention, setRetention] = useState("180");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings?.rum_retention_days) setRetention(String(d.settings.rum_retention_days)); setLoaded(true); })
      .catch(() => setLoaded(true));
    apiFetch("/api/audit/log?limit=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.entries) setEntries(d.entries); })
      .catch(() => {});
  }, []);

  const saveRetention = async () => {
    setSaving(true);
    const days = Math.max(7, parseInt(retention, 10) || 180);
    setRetention(String(days));
    const res = await apiFetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rum_retention_days: String(days) }),
    }).catch(() => null);
    if (res?.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <Icon name="shield" size={15} /> Data &amp; privacy
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Real-user data is collected without cookies, with IP addresses never stored and emails, phone numbers and tokens redacted on ingest. Consent mode and Do-Not-Track are configured per site under each site’s Integrations tab.
        </p>
      </div>

      {/* Retention */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><Icon name="clock" size={14} /> Real-user data retention</h3></div>
        <div className="card-pad">
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Real-user vitals, events and sessions older than this are deleted automatically each day (data minimisation).
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number" min={7} max={730}
              className="input" style={{ width: 120 }}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              disabled={!loaded}
            />
            <span className="muted" style={{ fontSize: 13 }}>days</span>
            <button className="btn primary sm" onClick={saveRetention} disabled={saving || !loaded} type="button">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Audit log */}
      <div className="card">
        <div className="card-head">
          <h3><Icon name="activity" size={14} /> Team action audit log</h3>
          <span className="muted" style={{ fontSize: 12 }}>last {entries.length} actions</span>
        </div>
        <div className="card-pad">
          {entries.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No recorded actions yet. Approvals, settings changes, key rotations and RUM toggles will appear here.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {entries.map((e) => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-soft)", fontSize: 12.5 }}>
                  <span className="dim mono" style={{ fontSize: 11 }}>{new Date(e.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span><Badge tone="ghost">{e.action}</Badge></span>
                  <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.actor_email ?? "system"}{e.target_id ? ` · ${e.target_type ?? ""} ${e.target_id}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
