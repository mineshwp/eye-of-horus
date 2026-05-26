"use client";

import React, { useState, useEffect, useCallback } from "react";
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
}

export default function SettingsPage() {
  const { sites } = useApp();

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

  useEffect(() => { fetchAlertSettings(); }, [fetchAlertSettings]);

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
    alert("Horus configuration exported to horus-config.json. System integrations remain online.");
  };

  const handleAddSite = () => {
    alert("Opening onboarding flow... Enter website name, target URL, and WordPress integration key.");
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
            <SideLink label="Sites & scanning" active />
            <SideLink label="Detection rules" />
            <SideLink label="Alert routing" />
            <SideLink label="Integrations" />
            <SideLink label="Team & permissions" />
            <SideLink label="API & webhooks" />
            <SideLink label="Billing" />
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                    <button className="btn ghost sm" onClick={() => alert(`Configuring ${s.name}…`)} type="button">
                      Configure
                    </button>
                  </div>
                ))
              )}
              {sites.length > 4 && (
                <div style={{ padding: "12px 18px", textAlign: "center" }}>
                  <button className="btn ghost sm" onClick={() => alert(`Showing all ${sites.length} sites…`)} type="button">
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
                title="Scan frequency"
                desc="How often Horus checks each monitored page."
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
                    <button className="btn sm" onClick={() => alert("Open site detail to manage page list.")} type="button">
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
                  <button className="btn sm" onClick={() => alert("Configure test credentials per site in Site settings.")} type="button">
                    Configure
                  </button>
                }
              />
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
                title="Performance budgets"
                desc="LCP, CLS, INP thresholds per page template."
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
              <AlertRule severity="critical" trigger="Critical issue detected" channels="Email alert recipients · WhatsApp if configured" />
              <AlertRule severity="high" trigger="High severity issue · client-facing impact" channels="Email alert recipients" />
              <AlertRule severity="medium" trigger="Visual change detected · awaiting review" channels="Daily digest" />
              <AlertRule severity="info" trigger="WordPress update available · low risk" channels="Weekly digest" />
              <div style={{ marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => alert("Custom alert rules coming soon.")} type="button">
                  <Icon name="plus" size={12} /> Add custom rule
                </button>
              </div>
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
        </div>
      </div>
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

const SideLink = ({ label, active }: { label: string; active?: boolean }) => (
  <button
    className={`nav-item ${active ? "active" : ""}`}
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

const SettingRow = ({ title, desc, control }: { title: string; desc: string; control: React.ReactNode }) => (
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

const AlertRule = ({ severity, trigger, channels }: { severity: string; trigger: string; channels: string }) => {
  const tone = severity === "critical" ? ("crit" as const) : severity === "high" ? ("high" as const) : severity === "medium" ? ("med" as const) : ("info" as const);
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr auto",
        gap: 14,
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid var(--border-soft)"
      }}
    >
      <Badge tone={tone} dot lg>
        {label}
      </Badge>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{trigger}</div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
          {channels}
        </div>
      </div>
      <button className="btn ghost sm" onClick={() => alert(`Modifying templates for alert: ${label}`)} type="button">
        Edit
      </button>
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
