/* global React, Icon, Badge, Toggle, Favicon */
// Monitoring Settings
const Settings = () => {
  const D = window.HORUS_DATA;

  const [scanFreq, setScanFreq] = React.useState("Every 15 minutes");
  const [toggles, setToggles] = React.useState({
    wp: true, forms: true, sec: true, perf: true, content: true, viz: true,
    slack: true, email: true, sms: false, webhook: false,
  });
  const flip = (k) => setToggles(t => ({ ...t, [k]: !t[k] }));

  const [viewports, setViewports] = React.useState({ desktop: true, tablet: true, mobile: true });
  const flipVp = (k) => setViewports(v => ({ ...v, [k]: !v[k] }));

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="settings" size={22}/>
            Monitoring &amp; configuration
          </h1>
          <p className="page-sub">Configure what Horus watches, how often, and who hears about it. Settings apply per-site; defaults shown below.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn"><Icon name="download" size={13}/> Export config</button>
          <button className="btn primary"><Icon name="plus" size={13}/> Add website</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
        <aside style={{ position: "sticky", top: 90, height: "fit-content" }}>
          <div className="card" style={{ padding: 8 }}>
            <SideLink label="Sites & scanning" active/>
            <SideLink label="Detection rules"/>
            <SideLink label="Alert routing"/>
            <SideLink label="Integrations"/>
            <SideLink label="Team & permissions"/>
            <SideLink label="API & webhooks"/>
            <SideLink label="Billing"/>
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Monitored sites */}
          <div className="card">
            <div className="card-head">
              <h3><Icon name="sites" size={14}/> Monitored sites</h3>
              <button className="btn ghost sm"><Icon name="plus" size={12}/> Add site</button>
            </div>
            <div>
              {D.sites.slice(0, 4).map(s => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 14, alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border-soft)" }}>
                  <div className="site-cell">
                    <Favicon site={s}/>
                    <div>
                      <div className="site-name">{s.name}</div>
                      <div className="site-url">{s.url}</div>
                    </div>
                  </div>
                  <Badge tone="ghost">18 pages</Badge>
                  <Badge tone="ghost">3 viewports</Badge>
                  <Badge tone="ok">Active</Badge>
                  <button className="btn ghost sm">Configure</button>
                </div>
              ))}
              <div style={{ padding: "12px 18px", textAlign: "center" }}>
                <button className="btn ghost sm">View all 7 sites</button>
              </div>
            </div>
          </div>

          {/* Scan config */}
          <div className="card">
            <div className="card-head">
              <h3><Icon name="refresh" size={14}/> Scan schedule</h3>
              <span className="h-sub">applies to: Acme Finance</span>
            </div>
            <div className="card-pad">
              <SettingRow
                title="Scan frequency"
                desc="How often Horus checks each monitored page."
                control={
                  <select className="select" value={scanFreq} onChange={e => setScanFreq(e.target.value)}>
                    <option>Every 5 minutes</option>
                    <option>Every 15 minutes</option>
                    <option>Every hour</option>
                    <option>Every 6 hours</option>
                    <option>Daily at 06:00</option>
                  </select>
                }/>
              <SettingRow
                title="Pages monitored"
                desc="Add specific URLs or auto-crawl up to 50 most-visited pages."
                control={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Badge tone="ghost" lg>18 pages</Badge>
                    <button className="btn sm">Edit list</button>
                  </div>
                }/>
              <SettingRow
                title="Viewports"
                desc="Capture each page at these widths and compare per viewport."
                control={
                  <div style={{ display: "flex", gap: 8 }}>
                    <VpToggle label="Desktop · 1440" icon="desktop" on={viewports.desktop} onClick={() => flipVp("desktop")}/>
                    <VpToggle label="Tablet · 820"   icon="tablet" on={viewports.tablet}  onClick={() => flipVp("tablet")}/>
                    <VpToggle label="Mobile · 390"   icon="mobile" on={viewports.mobile}  onClick={() => flipVp("mobile")}/>
                  </div>
                }/>
              <SettingRow
                title="Authenticated areas"
                desc="Provide a test login so Horus can scan logged-in pages."
                control={<Badge tone="ok" dot>Configured · test user</Badge>}
                />
            </div>
          </div>

          {/* Detection rules */}
          <div className="card">
            <div className="card-head"><h3><Icon name="filter" size={14}/> Detection rules</h3></div>
            <div className="card-pad">
              <SettingRow
                title="Visual regression"
                desc="DOM-aware screenshot diffing per viewport. Recommended."
                control={<Toggle on={toggles.viz} onClick={() => flip("viz")}/>}
                />
              <SettingRow
                title="WordPress update monitoring"
                desc="Track core, plugin, and theme update availability and risk."
                control={<Toggle on={toggles.wp} onClick={() => flip("wp")}/>}
                />
              <SettingRow
                title="Form testing"
                desc="Submits test payloads to every detected form daily."
                control={<Toggle on={toggles.forms} onClick={() => flip("forms")}/>}
                />
              <SettingRow
                title="Security checks"
                desc="SSL, headers, malware scan, admin user changes."
                control={<Toggle on={toggles.sec} onClick={() => flip("sec")}/>}
                />
              <SettingRow
                title="Performance budgets"
                desc="LCP, CLS, INP thresholds per page template."
                control={<Toggle on={toggles.perf} onClick={() => flip("perf")}/>}
                />
              <SettingRow
                title="Content & tag changes"
                desc="Copy edits, tracking script changes, structured-data changes."
                control={<Toggle on={toggles.content} onClick={() => flip("content")}/>}
                />
            </div>
          </div>

          {/* Alert rules */}
          <div className="card">
            <div className="card-head"><h3><Icon name="bell" size={14}/> Alert rules</h3></div>
            <div className="card-pad">
              <AlertRule
                severity="critical"
                trigger="Critical issue detected"
                channels="Slack #wetpaint-alerts · Email QA Lead · SMS on-call"
                />
              <AlertRule
                severity="high"
                trigger="High severity issue · client-facing impact"
                channels="Slack #wetpaint-alerts · Email QA Lead"
                />
              <AlertRule
                severity="medium"
                trigger="Visual change detected · awaiting review"
                channels="Daily digest · 09:00"
                />
              <AlertRule
                severity="info"
                trigger="WordPress update available · low risk"
                channels="Weekly digest"
                />
              <div style={{ marginTop: 12 }}>
                <button className="btn ghost sm"><Icon name="plus" size={12}/> Add custom rule</button>
              </div>
            </div>
          </div>

          {/* Notification channels */}
          <div className="card">
            <div className="card-head"><h3><Icon name="bolt" size={14}/> Notification channels</h3></div>
            <div className="card-pad">
              <ChannelRow icon="code"   label="Slack"   sub="Connected · #wetpaint-alerts" on={toggles.slack}   onToggle={() => flip("slack")}/>
              <ChannelRow icon="file"   label="Email"   sub="qa-leads@wetpaint.co.za · 5 recipients" on={toggles.email} onToggle={() => flip("email")}/>
              <ChannelRow icon="mobile" label="SMS"     sub="Verified · 2 numbers · for criticals only" on={toggles.sms}   onToggle={() => flip("sms")}/>
              <ChannelRow icon="link"   label="Webhook" sub="https://hooks.wetpaint.co.za/horus" on={toggles.webhook} onToggle={() => flip("webhook")}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SideLink = ({ label, active }) => (
  <button
    className={`nav-item ${active ? "active" : ""}`}
    style={{ width: "100%", margin: "0", padding: "9px 12px" }}>
    {label}
  </button>
);

const SettingRow = ({ title, desc, control }) => (
  <div className="setting-row">
    <div>
      <div className="setting-title">{title}</div>
      <div className="setting-desc">{desc}</div>
    </div>
    <div>{/* spacer */}</div>
    <div>{control}</div>
  </div>
);

const VpToggle = ({ label, icon, on, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 11px",
      background: on ? "rgba(0,229,255,0.10)" : "var(--bg-inset)",
      border: `1px solid ${on ? "rgba(0,229,255,0.35)" : "var(--border-soft)"}`,
      color: on ? "var(--cyan)" : "var(--text-tertiary)",
      borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
    }}>
    <Icon name={icon} size={12}/> {label}
  </button>
);

const AlertRule = ({ severity, trigger, channels }) => {
  const tone = severity === "critical" ? "crit" : severity === "high" ? "high" : severity === "medium" ? "med" : "info";
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <Badge tone={tone} dot lg>{label}</Badge>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{trigger}</div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{channels}</div>
      </div>
      <button className="btn ghost sm">Edit</button>
    </div>
  );
};

const ChannelRow = ({ icon, label, sub, on, onToggle }) => (
  <div className="setting-row">
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="wp-icon" style={{ width: 36, height: 36, color: on ? "var(--cyan)" : "var(--text-tertiary)" }}>
        <Icon name={icon} size={15}/>
      </div>
      <div>
        <div className="setting-title">{label}</div>
        <div className="setting-desc">{sub}</div>
      </div>
    </div>
    <div></div>
    <Toggle on={on} onClick={onToggle}/>
  </div>
);

window.Settings = Settings;
