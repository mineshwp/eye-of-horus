/* global React, Icon, Badge, Sparkline */
// Reports & Insights
const Reports = ({ setRoute }) => {
  const [tab, setTab] = React.useState("Weekly summary");
  const tabs = ["Weekly summary", "Client-ready", "Internal dev", "Trends"];

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="reports" size={22}/>
            Reports &amp; insights
          </h1>
          <p className="page-sub">Generate ready-to-send summaries for clients and the internal team. Trend cards show how the portfolio is moving over time.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn"><Icon name="download" size={13}/> Export PDF</button>
          <button className="btn gold"><Icon name="sparkles" size={13}/> Generate client report</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        {tabs.map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 16px",
              background: tab === t ? "var(--bg-panel)" : "transparent",
              border: `1px solid ${tab === t ? "var(--border-mid)" : "var(--border-soft)"}`,
              borderRadius: 10,
              color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)",
              fontSize: 13.5, fontWeight: 500,
              cursor: "pointer",
            }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Weekly summary" && <WeeklySummary/>}
      {tab === "Client-ready" && <ClientReady/>}
      {tab === "Internal dev" && <InternalDev/>}
      {tab === "Trends" && <Trends/>}
    </div>
  );
};

const WeeklySummary = () => (
  <>
    <div className="grid-4" style={{ marginBottom: 18 }}>
      <TrendCard icon="shield"   label="Avg health"      value="79" delta="-3" deltaDir="down" color="#D9A05B" data={[83,82,82,81,80,79,79]}/>
      <TrendCard icon="issue"    label="Issues opened"   value="22" delta="+9" deltaDir="up"   color="#EF4444" data={[5,7,3,4,2,6,9]}/>
      <TrendCard icon="check"    label="Issues resolved" value="16" delta="+4" deltaDir="up"   color="#22C55E" data={[2,3,2,3,3,3,4]}/>
      <TrendCard icon="clock"    label="Uptime"          value="99.93" unit="%" delta="-0.04" deltaDir="down" color="#00E5FF" data={[99.99,99.98,99.97,99.95,99.92,99.91,99.93]}/>
    </div>

    <div className="grid-2" style={{ marginBottom: 18 }}>
      <div className="ai-callout">
        <span className="ai-tag"><Icon name="sparkles" size={11}/> Week summary · Horus</span>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, lineHeight: 1.4, marginTop: 12, marginBottom: 12 }}>
          A solid week for Wetpaint &amp; Nova Legal. Acme Finance and Tarsus need attention before the weekend.
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.75 }}>
          <li>2 critical incidents detected and triaged on the same day</li>
          <li>16 issues resolved · median time-to-resolve <strong style={{ color: "var(--text-primary)" }}>4h 12m</strong></li>
          <li>3 WordPress updates auto-applied with regression checks passing</li>
          <li>Acme Finance health score down 6 points after theme update</li>
          <li>Form-Pro 4.2.1 rollback prevented full day of lost leads on Tarsus</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-head"><h3>Recurring issue patterns</h3><span className="h-sub">last 30 days</span></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <RecurringBar label="WP plugin update risk" pct={42} count={9} color="#D9A05B"/>
          <RecurringBar label="Visual regressions"    pct={28} count={6} color="#00E5FF"/>
          <RecurringBar label="Form failures"         pct={14} count={3} color="#EF4444"/>
          <RecurringBar label="Security warnings"     pct={10} count={2} color="#8B5CF6"/>
          <RecurringBar label="Performance drift"     pct={6}  count={1} color="#3B82F6"/>
        </div>
      </div>
    </div>

    <div className="grid-3">
      <PortfolioCard
        site="Acme Finance" status="critical" health={64}
        bullets={[
          "Mobile hero CTA missing — open",
          "SSL renews in 9 days — action needed",
          "2 plugin updates pending staging test",
        ]}/>
      <PortfolioCard
        site="Tarsus Cloud Portal" status="critical" health={58}
        bullets={[
          "Form-Pro rolled back to 4.1.9 · forms restored",
          "JS error spike on /checkout — investigating",
          "WP core 2 versions behind",
        ]}/>
      <PortfolioCard
        site="Wetpaint Corporate" status="healthy" health={96}
        bullets={[
          "All 18 pages clean · 7 days streak",
          "No pending updates",
          "Form success rate 100%",
        ]}/>
    </div>
  </>
);

const TrendCard = ({ icon, label, value, unit, delta, deltaDir, color, data }) => (
  <div className="card kpi-card">
    <div className="kpi-bg" style={{ background: `${color}33` }}/>
    <div className="kpi-head"><Icon name={icon} size={13}/> {label}</div>
    <div className="kpi-value">{value}{unit && <span className="unit">{unit}</span>}</div>
    <div className="kpi-foot">
      <span className={`delta ${deltaDir}`}>{deltaDir === "up" ? "▲ " : "▼ "}{delta}</span>
      <span className="dim">vs last week</span>
    </div>
    <div style={{ marginTop: 6 }}><Sparkline points={data} color={color} height={32}/></div>
  </div>
);

const RecurringBar = ({ label, pct, count, color }) => (
  <div className="bar-row">
    <div className="bar-label">{label}</div>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}99` }}/></div>
    <div className="bar-val">{count} <span className="dim">· {pct}%</span></div>
  </div>
);

const PortfolioCard = ({ site, status, health, bullets }) => {
  const statusMap = {
    critical:  { tone: "crit", text: "Needs action" },
    attention: { tone: "high", text: "Attention" },
    healthy:   { tone: "ok",   text: "Healthy" },
  };
  const m = statusMap[status];
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

const ClientReady = () => (
  <div className="grid-2">
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head">
        <h3><Icon name="file" size={14}/> Acme Finance · Client-facing summary</h3>
        <Badge tone="gold">Preview</Badge>
      </div>
      <div className="card-pad" style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), transparent)",
      }}>
        <div className="label-strip" style={{ marginBottom: 6 }}>Week of 12 — 18 May 2026</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10 }}>
          Acme Finance · Website health report
        </div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 18 }}>
          Prepared by Wetpaint · powered by Eye of Horus
        </div>

        <ReportSection
          title="Highlights"
          items={[
            "Uptime maintained at 99.96% across the week",
            "16 routine checks completed without action needed",
            "1 critical issue detected and fix in progress",
          ]}/>

        <ReportSection
          title="What we're actioning"
          items={[
            "Mobile hero button has been temporarily hidden by a theme update — restoring this week",
            "SSL certificate renewal scheduled before expiry",
          ]}/>

        <ReportSection
          title="Coming up"
          items={[
            "WooCommerce 9.0 upgrade scheduled on staging",
            "Quarterly performance review",
          ]}/>

        <div style={{ marginTop: 18, padding: "14px 16px", background: "var(--bg-inset)", borderRadius: 10, borderLeft: "2px solid var(--gold)" }}>
          <div className="label-strip" style={{ marginBottom: 4 }}>Recommended next conversation</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Schedule the WooCommerce 9.0 staging review before EOM.</div>
        </div>
      </div>
    </div>

    <div className="col">
      <div className="card">
        <div className="card-head"><h3>Report options</h3></div>
        <div className="card-pad">
          <ReportOption label="Tone of voice" value="Plain language · no jargon"/>
          <ReportOption label="Include screenshots" value="Yes · annotated"/>
          <ReportOption label="Period" value="Weekly · Mon → Sun"/>
          <ReportOption label="Format" value="PDF · 2 pages"/>
          <ReportOption label="Recipients" value="3 contacts on file"/>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn full">Preview email</button>
            <button className="btn primary full">Send to client</button>
          </div>
        </div>
      </div>

      <div className="ai-callout">
        <span className="ai-tag"><Icon name="sparkles" size={11}/> AI suggestion</span>
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          The Acme team prefers Friday reports. Schedule this to send <strong style={{ color: "var(--text-primary)" }}>every Friday at 16:00 SAST</strong> with the same options?
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary sm">Schedule weekly</button>
          <button className="btn ghost sm">Maybe later</button>
        </div>
      </div>
    </div>
  </div>
);

const ReportSection = ({ title, items }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--gold)" }}>{title}</div>
    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
      {items.map((i, k) => <li key={k}>{i}</li>)}
    </ul>
  </div>
);

const ReportOption = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
    <span className="dim" style={{ fontSize: 12.5 }}>{label}</span>
    <span style={{ fontSize: 13 }}>{value}</span>
  </div>
);

const InternalDev = () => (
  <div className="col">
    <div className="card">
      <div className="card-head">
        <h3><Icon name="code" size={14}/> Engineering digest · Week of 12 May</h3>
        <Badge tone="info">For #wetpaint-eng</Badge>
      </div>
      <div className="card-pad" style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
        <ReportSection title="Outages & rollbacks" items={[
          "Tarsus Cloud Portal — Form-Pro 4.2.1 rolled back to 4.1.9 (form failures). Owner: J. Ndlovu.",
          "No production outages this week.",
        ]}/>
        <ReportSection title="Open priority work" items={[
          "Acme: restore mobile hero CTA (.u-hide-mobile override) — M. Patel",
          "Acme: renew SSL cert + fix auto-renew cron — S. Khumalo",
          "Gentech: tighten CSP after 'unsafe-inline' regression — S. Khumalo",
        ]}/>
        <ReportSection title="Pending stage tests" items={[
          "Acme — WooCommerce 9.0.1 · custom checkout hooks",
          "Gentech — Elementor Pro 3.22 · template overrides",
          "Tarsus — WP Core 6.6.1 · two minors behind",
        ]}/>
        <ReportSection title="Stack drift" items={[
          "5 sites running ACF < 6.3.4",
          "3 sites using PHP 8.2 — supported but Gentech can move to 8.3 next quarter",
        ]}/>
      </div>
    </div>

    <div className="grid-3">
      <MicroStat label="MTTR" value="4h 12m" delta="−21 min" dir="up"/>
      <MicroStat label="Auto-resolved" value="9" delta="+3" dir="up"/>
      <MicroStat label="Reopened" value="1" delta="−1" dir="up"/>
    </div>
  </div>
);

const MicroStat = ({ label, value, delta, dir }) => (
  <div className="card kpi-card">
    <div className="kpi-head">{label}</div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-foot"><span className={`delta ${dir}`}>{delta}</span><span className="dim">vs last week</span></div>
  </div>
);

const Trends = () => (
  <div className="grid-2eq">
    <div className="card">
      <div className="card-head"><h3>Performance trend · portfolio avg</h3><span className="h-sub">90 days</span></div>
      <div className="card-pad"><Sparkline points={[78,79,80,81,80,79,78,78,79,80,79,78,77,78,79,80,81,80,79,78,77,76,75,76,77,78,79,78,77,76]} color="#F59E0B" height={140}/></div>
    </div>
    <div className="card">
      <div className="card-head"><h3>Security score · portfolio avg</h3><span className="h-sub">90 days</span></div>
      <div className="card-pad"><Sparkline points={[82,82,83,83,84,84,85,84,85,86,86,87,87,87,86,86,87,88,88,89,89,89,90,90,90,91,90,90,91,91]} color="#22C55E" height={140}/></div>
    </div>
    <div className="card">
      <div className="card-head"><h3>Form reliability</h3><span className="h-sub">14 days</span></div>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <RecurringBar label="Acme Finance"     pct={92} count={92} color="#F59E0B"/>
        <RecurringBar label="Tarsus Cloud"     pct={62} count={62} color="#EF4444"/>
        <RecurringBar label="Greenfield"       pct={100} count={100} color="#22C55E"/>
        <RecurringBar label="Flexcom"          pct={98} count={98} color="#22C55E"/>
        <RecurringBar label="Nova Legal"       pct={100} count={100} color="#22C55E"/>
        <RecurringBar label="Wetpaint"         pct={100} count={100} color="#22C55E"/>
        <RecurringBar label="Gentech"          pct={96} count={96} color="#22C55E"/>
      </div>
    </div>
    <div className="card">
      <div className="card-head"><h3>Issues by category · last 30 days</h3></div>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <RecurringBar label="Visual regression" pct={48} count={11} color="#00E5FF"/>
        <RecurringBar label="WordPress update"  pct={36} count={8} color="#D9A05B"/>
        <RecurringBar label="Performance"       pct={28} count={6} color="#F59E0B"/>
        <RecurringBar label="Security"          pct={22} count={5} color="#8B5CF6"/>
        <RecurringBar label="Form failure"      pct={14} count={3} color="#EF4444"/>
        <RecurringBar label="Content change"    pct={10} count={2} color="#3B82F6"/>
      </div>
    </div>
  </div>
);

window.Reports = Reports;
