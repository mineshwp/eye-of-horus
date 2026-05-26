/* global React, Icon, Badge, SeverityChip, StatusChip, ScoreBar, Sparkline, KPI, Favicon, HorusGlyph */
// Dashboard — Command Centre
const Dashboard = ({ setRoute }) => {
  const D = window.HORUS_DATA;
  const [filter, setFilter] = React.useState("All");

  const filters = [
    { k: "All",       n: D.issues.length },
    { k: "Critical",  n: D.issues.filter(i => i.severity === "critical").length },
    { k: "WP Updates",n: D.wpUpdates.length },
    { k: "Visual",    n: D.issues.filter(i => i.category === "Visual regression").length },
    { k: "Forms",     n: D.issues.filter(i => i.category === "Form failure").length },
    { k: "Security",  n: D.issues.filter(i => i.category === "Security").length },
    { k: "Performance", n: D.issues.filter(i => i.category === "Performance").length },
  ];

  const filteredIssues = filter === "All" ? D.issues
    : filter === "Critical"    ? D.issues.filter(i => i.severity === "critical")
    : filter === "WP Updates"  ? D.issues.filter(i => i.category === "WordPress update")
    : filter === "Visual"      ? D.issues.filter(i => i.category === "Visual regression")
    : filter === "Forms"       ? D.issues.filter(i => i.category === "Form failure")
    : filter === "Security"    ? D.issues.filter(i => i.category === "Security")
    : filter === "Performance" ? D.issues.filter(i => i.category === "Performance")
    : D.issues;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <HorusGlyph size={26}/>
            Command Centre
            <Badge tone="ok" dot>Watching · 7 sites</Badge>
          </h1>
          <p className="page-sub">All client websites are being scanned every 15 minutes across desktop, tablet and mobile. Horus has flagged the three issues most likely to affect your clients today.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn"><Icon name="download" size={13}/> Export report</button>
          <button className="btn primary"><Icon name="play" size={12}/> Run full scan</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI icon="sites"   label="Monitored sites" value="7"   delta="+1 onboarded" deltaDir="up" glow="rgba(0,229,255,0.22)" spark={[3,4,4,5,6,6,7,7]} sparkColor="#00E5FF"/>
        <KPI icon="shield"  label="Healthy"          value="2"  unit="/ 7" delta="−1 today"  deltaDir="down" glow="rgba(34,197,94,0.22)" spark={[5,5,4,4,3,3,2,2]} sparkColor="#22C55E"/>
        <KPI icon="issue"   label="Open issues"      value="14" delta="+5 in 24h" deltaDir="up" glow="rgba(245,158,11,0.22)" spark={[8,9,9,10,11,12,13,14]} sparkColor="#F59E0B"/>
        <KPI icon="flame"   label="Critical"         value="3"  delta="all detected today" deltaDir="up" glow="rgba(239,68,68,0.22)" spark={[0,0,1,2,2,3,3,3]} sparkColor="#EF4444"/>
      </div>

      {/* AI priority feed + activity */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="ai-callout">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="ai-tag"><Icon name="sparkles" size={11}/> Horus priority</span>
              <span className="muted" style={{ fontSize: 12 }}>What to do first · updated 2 min ago</span>
            </div>
            <span className="dim mono" style={{ fontSize: 11 }}>model: horus-qa-3.2</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PriorityItem
              rank="01"
              title="Restore Acme Finance mobile hero CTA"
              meta="Acme Finance · Homepage · Critical · Detected 09:14"
              reason="Lead-generation button vanished after theme update. Mobile traffic = 61% of site."
              owner="M. Patel"
              onOpen={() => setRoute({ name: "issue", id: "i1" })}
            />
            <PriorityItem
              rank="02"
              title="Roll back Form-Pro 4.2.1 on Tarsus"
              meta="Tarsus Cloud Portal · /contact-us · Critical · Detected 06:42"
              reason="Form posts to admin-ajax returning HTTP 500. No leads received since 06:42."
              owner="J. Ndlovu"
              onOpen={() => setRoute({ name: "issue", id: "i2" })}
            />
            <PriorityItem
              rank="03"
              title="Renew Acme SSL before 26 May"
              meta="Acme Finance · Global · High · 9 days remaining"
              reason="Cert auto-renew cron disabled in last server maintenance. Browser warnings imminent."
              owner="S. Khumalo"
              onOpen={() => setRoute({ name: "issue", id: "i4" })}
            />
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <h3><Icon name="activity" size={14}/> Recent changes</h3>
            <span className="h-sub">last 24 hours</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {D.activity.map((a, i) => <ActivityRow key={i} a={a}/>)}
          </div>
        </div>
      </div>

      {/* Filters + table */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <h3><Icon name="sites" size={14}/> Websites</h3>
          <div className="filter-chips" style={{ marginLeft: "auto" }}>
            {filters.map(f => (
              <button key={f.k} className={`chip ${filter === f.k ? "active" : ""}`} onClick={() => setFilter(f.k)}>
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
            {D.sites.map(s => (
              <tr key={s.id} className="trow" onClick={() => setRoute({ name: "site", id: s.id })}>
                <td>
                  <div className="site-cell">
                    <Favicon site={s}/>
                    <div>
                      <div className="site-name">{s.name}</div>
                      <div className="site-url">{s.url}</div>
                    </div>
                  </div>
                </td>
                <td><StatusChip status={s.status}/></td>
                <td><ScoreBar value={s.health}/></td>
                <td>
                  <span className="mono" style={{ fontSize: 12, color: s.wp.core === s.wp.coreLatest ? "var(--text-secondary)" : "var(--amber)" }}>
                    {s.wp.core}
                    {s.wp.core !== s.wp.coreLatest && <span className="dim"> → {s.wp.coreLatest}</span>}
                  </span>
                </td>
                <td>
                  {s.wp.plugins === 0 ? <span className="dim mono" style={{ fontSize: 12 }}>up to date</span>
                    : <Badge tone={s.wp.plugins > 5 ? "high" : "med"}>{s.wp.plugins} pending</Badge>}
                </td>
                <td>
                  {s.openIssues === 0
                    ? <Badge tone="ok">none</Badge>
                    : <Badge tone={s.status === "critical" ? "crit" : "high"}>{s.openIssues} open</Badge>}
                </td>
                <td className="dim mono" style={{ fontSize: 12 }}>{s.lastScan}</td>
                <td><Icon name="chevron" size={14} style={{ color: "var(--text-dim)" }}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lower: issue feed grid */}
      <div className="grid-2eq">
        <div className="card">
          <div className="card-head">
            <h3><Icon name="issue" size={14}/> {filter === "All" ? "All open issues" : `${filter} issues`}</h3>
            <span className="h-sub">{filteredIssues.length} shown</span>
          </div>
          <div>
            {filteredIssues.slice(0, 5).map(i => (
              <IssueRow key={i.id} issue={i} site={D.sites.find(s => s.id === i.siteId)} onClick={() => setRoute({ name: "issue", id: i.id })}/>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><Icon name="wp" size={14}/> WordPress update queue</h3>
            <button className="btn ghost sm" onClick={() => setRoute({ name: "wp" })}>View all <Icon name="chevron" size={12}/></button>
          </div>
          <div>
            {D.wpUpdates.slice(0, 5).map(u => {
              const site = D.sites.find(s => s.id === u.siteId);
              return (
                <div key={u.id} className="feed-item" style={{ alignItems: "center" }}>
                  <div className="feed-icon" style={{ color: site.brand }}>
                    <Icon name={u.target === "WordPress Core" ? "wp" : u.target.includes("Theme") ? "img" : "bolt"} size={14}/>
                  </div>
                  <div className="feed-body">
                    <div className="feed-title">{u.target} <span className="dim" style={{ fontWeight: 400 }}>· {site.name}</span></div>
                    <div className="feed-meta">
                      <span className="mono">{u.from} → <span style={{ color: "var(--cyan)" }}>{u.to}</span></span>
                      <span className="pip"/>
                      <Badge tone={u.flag === "Safe update" ? "ok" : u.flag === "Do not update" ? "crit" : "high"}>{u.flag}</Badge>
                    </div>
                  </div>
                  <Badge tone={u.risk === "low" ? "ok" : u.risk === "medium" ? "high" : "crit"}>{u.risk} risk</Badge>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const PriorityItem = ({ rank, title, meta, reason, owner, onOpen }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    gap: 14, alignItems: "center",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-soft)",
    borderRadius: 10,
  }}>
    <div style={{
      fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
      color: "var(--cyan)", textAlign: "center",
      letterSpacing: "-0.03em",
    }}>{rank}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>{meta}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{reason}</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <span className="label-strip">Owner</span>
      <Badge tone="ghost"><Icon name="user" size={11}/> {owner}</Badge>
      <button className="btn sm" onClick={onOpen}>Open <Icon name="chevron" size={11}/></button>
    </div>
  </div>
);

const ActivityRow = ({ a }) => {
  const sevTone = a.sev === "crit" ? "crit" : a.sev === "high" ? "high" : a.sev === "med" ? "med" : "low";
  const iconName = { visual: "diff", tag: "code", js: "bolt", form: "file", ssl: "shield", sec: "shield", asset: "img", wp: "wp" }[a.type] || "activity";
  return (
    <div className="feed-item">
      <div className="feed-icon"><Icon name={iconName} size={14}/></div>
      <div className="feed-body">
        <div className="feed-title">{a.text}</div>
        <div className="feed-meta">
          <span>{a.site}</span><span className="pip"/><span className="mono">{a.time}</span>
        </div>
      </div>
      <Badge tone={sevTone}>{a.sev === "crit" ? "Critical" : a.sev === "high" ? "High" : a.sev === "med" ? "Medium" : "Low"}</Badge>
    </div>
  );
};

const IssueRow = ({ issue, site, onClick }) => (
  <div className="feed-item" onClick={onClick}>
    <div className="feed-icon" style={{ color: site.brand }}>{site.initials}</div>
    <div className="feed-body">
      <div className="feed-title">{issue.title}</div>
      <div className="feed-meta">
        <span>{site.name}</span><span className="pip"/>
        <span className="mono">{issue.page}</span><span className="pip"/>
        <span>{issue.category}</span>
      </div>
    </div>
    <SeverityChip level={issue.severity}/>
  </div>
);

window.Dashboard = Dashboard;
