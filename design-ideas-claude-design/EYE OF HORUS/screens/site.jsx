/* global React, Icon, Badge, SeverityChip, StatusChip, ScoreBar, Sparkline, Tabs, Favicon */
// Client website detail page
const SiteDetail = ({ siteId, setRoute }) => {
  const D = window.HORUS_DATA;
  const site = D.sites.find(s => s.id === siteId) || D.sites[0];
  const issues = D.issues.filter(i => i.siteId === site.id);
  const updates = D.wpUpdates.filter(u => u.siteId === site.id);
  const [tab, setTab] = React.useState("Overview");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerRef = React.useRef(null);

  React.useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen]);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <Favicon site={site} size={44}/>
            <div style={{ position: "relative" }} ref={pickerRef}>
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  onClick={() => setPickerOpen(o => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    background: "transparent", border: 0, padding: "2px 8px 2px 0",
                    margin: "-2px 0", borderRadius: 8,
                    color: "inherit", font: "inherit", letterSpacing: "inherit",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  title="Switch client website"
                >
                  {site.name}
                  <Icon name="chevronDown" size={18} style={{
                    color: "var(--text-tertiary)",
                    transition: "transform 150ms",
                    transform: pickerOpen ? "rotate(180deg)" : "none",
                  }}/>
                </button>
                <StatusChip status={site.status}/>
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, color: "var(--text-tertiary)", fontSize: 12.5 }}>
                <span className="mono">{site.url}</span>
                <span>·</span>
                <span>Last scan {site.lastScan}</span>
                <span>·</span>
                <span>Watching desktop / tablet / mobile · 18 pages</span>
              </div>

              {pickerOpen && <SitePicker currentId={site.id} sites={D.sites} onPick={(id) => { setPickerOpen(false); setRoute({ name: "site", id }); }}/>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn"><Icon name="link" size={13}/> Open site</button>
          <button className="btn"><Icon name="settings" size={13}/> Configure</button>
          <button className="btn primary"><Icon name="refresh" size={13}/> Re-scan now</button>
        </div>
      </div>

      <Tabs tabs={["Overview", "Issues", "Analytics", "SEO", "Marketing", "WordPress", "Performance", "Security", "Forms", "History"]} active={tab} onChange={setTab}/>

      <div style={{ marginTop: 18 }}>
        {tab === "Overview" && (
          <>
            <div className="grid-4" style={{ marginBottom: 18 }}>
              <ScoreCard label="Health"      value={site.health} tone={site.health >= 90 ? "ok" : site.health >= 75 ? "med" : "high"}/>
              <ScoreCard label="Performance" value={site.perf}   tone="med"/>
              <ScoreCard label="Security"    value={site.sec}    tone="ok"/>
              <div className="card kpi-card">
                <div className="kpi-bg" style={{ background: "rgba(34,197,94,0.16)" }}/>
                <div className="kpi-head"><Icon name="clock" size={13}/> Uptime</div>
                <div className="kpi-value">{site.uptime.toFixed(2)}<span className="unit">% / 30d</span></div>
                <div className="kpi-foot"><span className="delta flat">No downtime in 14 days</span></div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="ai-callout">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span className="ai-tag"><Icon name="sparkles" size={11}/> Horus summary</span>
                  <span className="dim" style={{ fontSize: 11 }}>{site.name} · today</span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.45, fontWeight: 500, marginBottom: 12 }}>
                  Two issues are likely to impact clients today.
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.65 }}>
                  <li><strong style={{ color: "var(--text-primary)" }}>Mobile hero CTA missing</strong> — restored layout is one CSS rule revert. Confidence 96%.</li>
                  <li><strong style={{ color: "var(--text-primary)" }}>SSL cert expires in 9 days</strong> — auto-renew is paused at host.</li>
                  <li><strong style={{ color: "var(--text-primary)" }}>Layout shift on /services</strong> — embedded video missing intrinsic size.</li>
                </ul>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button className="btn primary sm" onClick={() => setRoute({ name: "issue", id: "i1" })}>Open top issue</button>
                  <button className="btn sm">Generate client note</button>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3><Icon name="wp" size={14}/> WordPress stack</h3>
                  <span className="h-sub">{updates.length} pending</span>
                </div>
                <div className="card-pad">
                  <dl className="kv">
                    <dt>Core version</dt>
                    <dd className="mono">{site.wp.core} {site.wp.core !== site.wp.coreLatest && <Badge tone="high">update available · {site.wp.coreLatest}</Badge>}</dd>
                    <dt>PHP</dt>
                    <dd className="mono">8.2.18 <Badge tone="ok">supported</Badge></dd>
                    <dt>Active theme</dt>
                    <dd>Astra Pro 4.6.10</dd>
                    <dt>Plugins (active)</dt>
                    <dd>27 active · {site.wp.plugins} pending update</dd>
                    <dt>Forms</dt>
                    <dd>{site.forms === "issue"
                      ? <Badge tone="crit" dot>Submissions failing on /contact-us</Badge>
                      : <Badge tone="ok" dot>All 4 forms posting</Badge>}</dd>
                    <dt>SSL</dt>
                    <dd>{site.id === "acme" ? <Badge tone="high">Expires in 9 days</Badge> : <Badge tone="ok">Valid · 84 days</Badge>}</dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="card-head"><h3><Icon name="activity" size={14}/> Health trend</h3><span className="h-sub">30 days</span></div>
                <div className="card-pad">
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <TrendRow label="Performance"  value={site.perf} delta="-4" trend={[78,80,79,77,76,72,68,72,70,72,73,72,74,72]} color="#F59E0B"/>
                    <TrendRow label="Security"     value={site.sec}  delta="+2" trend={[80,82,83,82,84,85,84,86,85,86,87,86,87,86]} color="#22C55E"/>
                    <TrendRow label="Health score" value={site.health} delta="-6" trend={[74,76,72,70,71,70,68,67,66,68,66,64,64,64]} color="#D9A05B"/>
                    <TrendRow label="Form success" value={92} delta="-3" trend={[98,98,97,96,96,95,94,93,94,93,92,90,92,92]} color="#00E5FF"/>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3><Icon name="clock" size={14}/> Recent timeline</h3><span className="h-sub">today</span></div>
                <div className="card-pad">
                  <div className="timeline">
                    <div className="timeline-item crit">
                      <div className="timeline-time">Today · 09:14</div>
                      <div className="timeline-text">Visual regression on / · mobile hero CTA missing</div>
                    </div>
                    <div className="timeline-item warn">
                      <div className="timeline-time">Today · 10:48</div>
                      <div className="timeline-text">Layout shift on /services · CLS 0.18 (baseline 0.04)</div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-time">Today · 07:00</div>
                      <div className="timeline-text">Scheduled scan · 18 pages × 3 viewports</div>
                    </div>
                    <div className="timeline-item ok">
                      <div className="timeline-time">Yesterday · 17:22</div>
                      <div className="timeline-text">WordPress core 6.5.2 verified · no integrity issues</div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-time">Yesterday · 12:04</div>
                      <div className="timeline-text">Theme update applied: Astra 4.6.10</div>
                    </div>
                    <div className="timeline-item warn">
                      <div className="timeline-time">Yesterday · 04:00</div>
                      <div className="timeline-text">SSL renewal cron did not run · investigated</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3><Icon name="issue" size={14}/> Open issues</h3><span className="h-sub">{issues.length} total</span></div>
              <div>
                {issues.map(i => (
                  <div key={i.id} className="feed-item" onClick={() => setRoute({ name: "issue", id: i.id })}>
                    <div className="feed-icon"><SevDot level={i.severity}/></div>
                    <div className="feed-body">
                      <div className="feed-title">{i.title}</div>
                      <div className="feed-meta">
                        <span className="mono">{i.page}</span><span className="pip"/>
                        <span>{i.category}</span><span className="pip"/>
                        <span>Owner · {i.owner}</span>
                      </div>
                    </div>
                    <Badge tone="ghost">{i.status}</Badge>
                    <SeverityChip level={i.severity}/>
                  </div>
                ))}
                {issues.length === 0 && <div className="empty">No open issues — all checks passing.</div>}
              </div>
            </div>
          </>
        )}

        {tab === "Issues" && <IssuesTab site={site} issues={issues} setRoute={setRoute}/>}
        {tab === "Analytics" && <AnalyticsTab site={site}/>}
        {tab === "SEO" && <SeoTab site={site}/>}
        {tab === "Marketing" && <MarketingTab site={site}/>}

        {tab !== "Overview" && tab !== "Issues" && tab !== "Analytics" && tab !== "SEO" && tab !== "Marketing" && (
          <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
            <div className="muted">The <strong>{tab}</strong> tab dives into {tab.toLowerCase()}-specific signals. Wired in the dashboard / WP / regression screens — switch tab to keep exploring this site, or open the dedicated screens from the sidebar.</div>
          </div>
        )}
      </div>
    </div>
  );
};

const ScoreCard = ({ label, value, tone }) => {
  const color = value >= 90 ? "#22C55E" : value >= 75 ? "#00E5FF" : value >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div className="card kpi-card">
      <div className="kpi-bg" style={{ background: `${color}33` }}/>
      <div className="kpi-head">{label}</div>
      <div className="kpi-value">{value}<span className="unit">/ 100</span></div>
      <div style={{ position: "relative", height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginTop: 4 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${value}%`, background: color, borderRadius: 4, boxShadow: `0 0 12px ${color}99` }}/>
      </div>
    </div>
  );
};

const TrendRow = ({ label, value, delta, trend, color }) => {
  const isUp = delta.startsWith("+");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 60px 1fr 60px", gap: 14, alignItems: "center" }}>
      <div style={{ fontSize: 13 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
      <div><Sparkline points={trend} color={color} height={30}/></div>
      <div className="mono" style={{ fontSize: 12, textAlign: "right", color: isUp ? "var(--green)" : "var(--red)" }}>{delta}</div>
    </div>
  );
};

const SevDot = ({ level }) => {
  const c = { critical: "#EF4444", high: "#F59E0B", medium: "#00E5FF", low: "#8A96A8" }[level];
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}` }}/>;
};

const SitePicker = ({ currentId, sites, onPick }) => {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const filtered = sites.filter(s =>
    s.name.toLowerCase().includes(q.toLowerCase()) || s.url.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="popover" style={{
      top: "calc(100% + 8px)", left: 0,
      width: 360, padding: 6,
      maxHeight: 480, display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px", margin: "2px 2px 6px",
        background: "var(--bg-inset)", border: "1px solid var(--border-soft)",
        borderRadius: 8,
      }}>
        <Icon name="search" size={13} style={{ color: "var(--text-dim)" }}/>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Switch client website…"
          style={{
            flex: 1, background: "transparent", border: 0, outline: 0,
            fontSize: 13, color: "var(--text-primary)",
          }}
        />
        <span className="kbd" style={{
          fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 5px",
          borderRadius: 4, background: "rgba(255,255,255,0.06)",
          color: "var(--text-dim)", border: "1px solid var(--border-soft)",
        }}>esc</span>
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map(s => {
          const isCurrent = s.id === currentId;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "30px 1fr auto auto",
                gap: 10, alignItems: "center",
                padding: "8px 10px",
                background: isCurrent ? "rgba(0,229,255,0.06)" : "transparent",
                border: 0, borderRadius: 8,
                textAlign: "left", cursor: "pointer",
                color: "var(--text-primary)",
              }}
              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
            >
              <Favicon site={s}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.url}</div>
              </div>
              <StatusChip status={s.status}/>
              {isCurrent
                ? <Icon name="check" size={14} style={{ color: "var(--cyan)" }}/>
                : <Icon name="chevron" size={12} style={{ color: "var(--text-dim)" }}/>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "18px 12px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No matching websites
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--border-soft)", marginTop: 6, padding: "8px 4px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-dim)", paddingLeft: 6 }}>{filtered.length} of {sites.length} sites</span>
        <button className="btn ghost sm"><Icon name="plus" size={11}/> Add website</button>
      </div>
    </div>
  );
};

window.SiteDetail = SiteDetail;

// ============ Analytics tab ============
const AnalyticsTab = ({ site }) => {
  const [range, setRange] = React.useState("Last 28 days");
  const traffic28 = [3120,3210,3080,3340,3500,3420,3260,3180,3290,3410,3520,3650,3580,3420,3300,3210,3380,3460,3540,3620,3700,3590,3460,3320,3210,3140,3050,3180];
  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Badge tone="ok" dot>GA4 connected</Badge>
        <Badge tone="ghost">Property G-XJ8FZP · linked 12 Apr 2026</Badge>
        <Badge tone="info">Search Console verified</Badge>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Range</span>
          <select className="select" value={range} onChange={e => setRange(e.target.value)}>
            <option>Last 7 days</option>
            <option>Last 28 days</option>
            <option>Last 90 days</option>
            <option>Year to date</option>
          </select>
          <button className="btn sm"><Icon name="download" size={12}/> Export</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI icon="user"     label="Visitors"    value="48,212" delta="+8.4%" deltaDir="up"   glow="rgba(0,229,255,0.22)" spark={traffic28.slice(-14)} sparkColor="#00E5FF"/>
        <KPI icon="activity" label="Sessions"    value="62,540" delta="+5.1%" deltaDir="up"   glow="rgba(139,92,246,0.22)" spark={[58,60,59,62,63,62,64].map(n => n*1000)} sparkColor="#8B5CF6"/>
        <KPI icon="eye"      label="Page views"  value="184k"   delta="+11.6%" deltaDir="up"  glow="rgba(217,160,91,0.22)" spark={[160,162,168,172,175,180,184].map(n => n*1000)} sparkColor="#D9A05B"/>
        <KPI icon="bolt"     label="Avg session" value="2:41"   delta="-0:08" deltaDir="down" glow="rgba(245,158,11,0.20)" spark={[185,188,184,179,176,170,161]} sparkColor="#F59E0B"/>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="activity" size={14}/> Visitors over time</h3>
            <div style={{ display: "flex", gap: 6 }}>
              <Badge tone="med">Visitors</Badge>
              <Badge tone="ghost">Sessions</Badge>
              <Badge tone="ghost">Bounce</Badge>
            </div>
          </div>
          <div className="card-pad"><Sparkline points={traffic28} color="#00E5FF" height={180}/></div>
        </div>

        <div className="ai-callout">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="ai-tag"><Icon name="sparkles" size={11}/> Horus · analytics watch</span>
            <span className="dim mono" style={{ fontSize: 11 }}>updated 6 min ago</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.45, fontWeight: 500, marginBottom: 12 }}>
            Mobile session length dropped 8% this week, concentrated on the homepage.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Correlates with the mobile hero CTA missing (open issue · I-1)</li>
            <li>Bounce on / from organic traffic up from 38% → 47%</li>
            <li>iOS Safari accounts for 73% of the drop</li>
          </ul>
          <button className="btn primary sm" style={{ marginTop: 14 }}>Open related issue</button>
        </div>
      </div>

      <div className="grid-2eq" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Top pages · last 28 days</h3><span className="h-sub">by pageviews</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PageRow page="/"           views={42180} pct={100} delta="+4.2%"  trend="up"/>
            <PageRow page="/services"   views={28640} pct={68}  delta="+2.1%"  trend="up"/>
            <PageRow page="/loan-calculator" views={19320} pct={46}  delta="+18.7%" trend="up"/>
            <PageRow page="/about"      views={14210} pct={34}  delta="-1.4%"  trend="down"/>
            <PageRow page="/contact-us" views={11860} pct={28}  delta="-3.8%"  trend="down"/>
            <PageRow page="/blog"       views={8940}  pct={21}  delta="+0.9%"  trend="up"/>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-head"><h3>Acquisition channel</h3><span className="h-sub">share of sessions</span></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <RecurringBarLite label="Organic search" pct={48} val="29,841" color="#22C55E"/>
              <RecurringBarLite label="Direct"         pct={22} val="13,758" color="#00E5FF"/>
              <RecurringBarLite label="Paid · Google"  pct={14} val="8,755"  color="#D9A05B"/>
              <RecurringBarLite label="Social · Meta"  pct={9}  val="5,628"  color="#3B82F6"/>
              <RecurringBarLite label="Referral"       pct={5}  val="3,127"  color="#8B5CF6"/>
              <RecurringBarLite label="Email"          pct={2}  val="1,431"  color="#EF4444"/>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Device split</h3></div>
            <div className="card-pad">
              <DeviceSegment items={[
                { label: "Mobile · 61%",  value: 61, color: "#00E5FF", icon: "mobile" },
                { label: "Desktop · 32%", value: 32, color: "#8B5CF6", icon: "desktop" },
                { label: "Tablet · 7%",   value: 7,  color: "#D9A05B", icon: "tablet" },
              ]}/>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Conversion funnel · loan application</h3><span className="h-sub">last 28 days</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FunnelStep label="Visited homepage"     count="48,212" pct={100} color="#00E5FF"/>
            <FunnelStep label="Opened calculator"    count="19,320" pct={40}  color="#7DD3FC"/>
            <FunnelStep label="Started application"  count="6,084"  pct={12.6} color="#D9A05B"/>
            <FunnelStep label="Submitted application" count="2,418" pct={5.0}  color="#22C55E"/>
            <FunnelStep label="Approved"             count="1,184"  pct={2.5}  color="#15803D"/>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Top countries</h3><span className="h-sub">visitors</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RecurringBarLite label="South Africa"  pct={62} val="29,891" color="#22C55E"/>
            <RecurringBarLite label="United Kingdom" pct={14} val="6,762"  color="#3B82F6"/>
            <RecurringBarLite label="Namibia"       pct={8}  val="3,840"  color="#D9A05B"/>
            <RecurringBarLite label="Botswana"      pct={6}  val="2,895"  color="#8B5CF6"/>
            <RecurringBarLite label="United States" pct={5}  val="2,420"  color="#00E5FF"/>
            <RecurringBarLite label="Other"         pct={5}  val="2,404"  color="#5A6578"/>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ SEO tab ============
const SeoTab = ({ site }) => {
  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Badge tone="ok" dot>Search Console connected</Badge>
        <Badge tone="ghost">sc-domain:acmefinance.co.za</Badge>
        <Badge tone="info">Sitemap submitted · 184 URLs</Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn sm"><Icon name="refresh" size={12}/> Re-crawl</button>
          <button className="btn sm"><Icon name="download" size={12}/> Export report</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI icon="search"   label="Organic clicks"  value="14,820" delta="+12%" deltaDir="up"   glow="rgba(34,197,94,0.20)"  spark={[1100,1150,1180,1240,1280,1320,1380,1420]} sparkColor="#22C55E"/>
        <KPI icon="eye"      label="Impressions"     value="284k"   delta="+6.8%" deltaDir="up"  glow="rgba(0,229,255,0.20)" spark={[245,250,256,262,268,272,278,284].map(n=>n*1000)} sparkColor="#00E5FF"/>
        <KPI icon="bolt"     label="Avg position"    value="11.4"   delta="-0.8" deltaDir="up"   glow="rgba(217,160,91,0.20)" spark={[14,13.6,13.2,12.8,12.4,12,11.6,11.4]} sparkColor="#D9A05B"/>
        <KPI icon="shield"   label="Indexed pages"   value="167"    unit="/ 184" delta="17 excluded" deltaDir="flat" glow="rgba(139,92,246,0.20)" spark={[160,162,163,164,165,166,167,167]} sparkColor="#8B5CF6"/>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3><Icon name="search" size={14}/> Top queries</h3><span className="h-sub">last 28 days</span></div>
          <div className="card-pad">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div className="label-strip">Query</div>
              <div className="label-strip" style={{ textAlign: "right" }}>Clicks</div>
              <div className="label-strip" style={{ textAlign: "right" }}>Impr.</div>
              <div className="label-strip" style={{ textAlign: "right" }}>Pos.</div>
            </div>
            <QueryRow q="acme finance loan"        c="3,840" i="14,210" p="2.1" pUp/>
            <QueryRow q="home loan calculator sa"  c="2,180" i="22,420" p="3.8" pUp/>
            <QueryRow q="acme finance"             c="1,940" i="3,810"  p="1.2" pUp/>
            <QueryRow q="business loan south africa" c="1,420" i="38,210" p="8.6" pDown/>
            <QueryRow q="bond pre-approval"        c="940"  i="12,180" p="4.4" pUp/>
            <QueryRow q="instant approval finance" c="720"  i="28,180" p="14.2" pDown/>
            <QueryRow q="loan repayment estimate"  c="640"  i="11,820" p="5.2" pUp/>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Keyword movement</h3><span className="h-sub">vs last week</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <KwShift query="home loan calculator sa"      from={11} to={4}   dir="up"/>
            <KwShift query="acme finance loan"            from={4}  to={2}   dir="up"/>
            <KwShift query="bond pre-approval"            from={7}  to={4}   dir="up"/>
            <KwShift query="loan repayment estimate"      from={9}  to={5}   dir="up"/>
            <KwShift query="business loan south africa"   from={6}  to={9}   dir="down"/>
            <KwShift query="instant approval finance"     from={11} to={14}  dir="down"/>
          </div>
        </div>
      </div>

      <div className="grid-2eq" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3><Icon name="shield" size={14}/> Technical SEO</h3><span className="h-sub">audit · today</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SeoCheck tone="ok"   label="Robots.txt"           note="Reachable · 18 disallow rules"/>
            <SeoCheck tone="ok"   label="Sitemap.xml"          note="184 URLs · last fetched 3 hours ago"/>
            <SeoCheck tone="ok"   label="Canonical tags"       note="178 pages · 0 self-conflicting"/>
            <SeoCheck tone="warn" label="Meta descriptions"    note="12 pages missing · 4 truncated > 160"/>
            <SeoCheck tone="warn" label="Title tags"           note="3 pages duplicate / 2 over 60 chars"/>
            <SeoCheck tone="crit" label="Structured data"      note="Schema errors on 6 product pages"/>
            <SeoCheck tone="ok"   label="HTTPS / HSTS"         note="HSTS preload eligible"/>
            <SeoCheck tone="warn" label="Core Web Vitals"      note="LCP needs improvement on /services"/>
            <SeoCheck tone="ok"   label="Mobile usability"     note="0 issues in last crawl"/>
            <SeoCheck tone="ok"   label="hreflang"             note="Not configured · single locale site"/>
          </div>
        </div>

        <div className="col">
          <div className="ai-callout">
            <span className="ai-tag"><Icon name="sparkles" size={11}/> SEO opportunities</span>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.45, fontWeight: 500, margin: "10px 0 12px" }}>
              3 quick wins could lift organic clicks ~9% in the next 30 days.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
              <li><strong style={{ color: "var(--text-primary)" }}>Fix product schema errors</strong> · 6 pages losing rich-result eligibility</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Add meta descriptions</strong> to 12 high-traffic pages</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Internal link to /loan-calculator</strong> from 14 service pages — currently underlinked</li>
            </ul>
          </div>

          <div className="card">
            <div className="card-head"><h3><Icon name="link" size={14}/> Backlink profile</h3></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="bar-row">
                <div className="bar-label">Referring domains</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: "72%", background: "#22C55E" }}/></div>
                <div className="bar-val mono">228</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">Total backlinks</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: "84%", background: "#00E5FF" }}/></div>
                <div className="bar-val mono">3,140</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">New this month</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: "26%", background: "#D9A05B" }}/></div>
                <div className="bar-val mono">+62</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">Lost this month</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: "9%", background: "#EF4444" }}/></div>
                <div className="bar-val mono">-14</div>
              </div>
              <div className="bar-row">
                <div className="bar-label">Toxic / spam</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: "4%", background: "#F59E0B" }}/></div>
                <div className="bar-val mono">7</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Page indexing status</h3></div>
        <div className="card-pad">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <IndexCell label="Submitted & indexed"        value={167} tone="ok"/>
            <IndexCell label="Discovered · not indexed"  value={9}   tone="med"/>
            <IndexCell label="Crawled · not indexed"     value={5}   tone="med"/>
            <IndexCell label="Excluded by noindex"       value={3}   tone="low"/>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ Marketing tab ============
const MarketingTab = ({ site }) => {
  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Badge tone="ok" dot>4 active campaigns</Badge>
        <Badge tone="info">Google Ads · Meta · LinkedIn · Mailchimp</Badge>
        <Badge tone="ghost">May spend · R 184,210</Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn sm"><Icon name="plus" size={12}/> Add campaign</button>
          <button className="btn sm"><Icon name="download" size={12}/> Export</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KPI icon="bolt"     label="Spend · MTD"   value="R 184k" delta="+R 22k vs last month" deltaDir="up" glow="rgba(217,160,91,0.20)" spark={[120,135,142,156,168,176,180,184]} sparkColor="#D9A05B"/>
        <KPI icon="check"    label="Conversions"   value="412"    delta="+18.4%" deltaDir="up" glow="rgba(34,197,94,0.20)" spark={[280,295,310,330,348,372,398,412]} sparkColor="#22C55E"/>
        <KPI icon="activity" label="CAC"           value="R 447"  delta="-R 38" deltaDir="up" glow="rgba(0,229,255,0.20)" spark={[510,498,485,478,468,460,452,447]} sparkColor="#00E5FF"/>
        <KPI icon="flame"    label="ROAS"          value="4.2x"   delta="+0.5x" deltaDir="up" glow="rgba(245,158,11,0.20)" spark={[3.4,3.5,3.6,3.8,3.9,4.0,4.1,4.2]} sparkColor="#F59E0B"/>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h3><Icon name="play" size={14}/> Active campaigns</h3><span className="h-sub">4 running · 2 scheduled</span></div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 110px 110px 110px 90px 80px", gap: 14, padding: "10px 18px", borderBottom: "1px solid var(--border-soft)", background: "rgba(255,255,255,0.015)" }}>
            <div></div>
            <div className="label-strip">Campaign</div>
            <div className="label-strip">Spend</div>
            <div className="label-strip">Impr.</div>
            <div className="label-strip">Clicks</div>
            <div className="label-strip">Conv.</div>
            <div className="label-strip">ROAS</div>
            <div className="label-strip">Status</div>
          </div>
          <CampaignRow channel="google" name="Home loan · search · ZA"  type="Google Ads · Search" spend="R 78,400" impr="412k" clicks="14,820" conv="184" roas="5.1x" status="active"/>
          <CampaignRow channel="meta"   name="Loan calculator · prospecting" type="Meta Ads · Reels"  spend="R 42,180" impr="1.2M" clicks="22,140" conv="92"  roas="3.4x" status="active"/>
          <CampaignRow channel="meta"   name="Brand awareness · winter"  type="Meta Ads · Carousel" spend="R 24,820" impr="684k" clicks="4,820"  conv="38"  roas="2.1x" status="active"/>
          <CampaignRow channel="li"     name="SME finance · decision-makers" type="LinkedIn · Sponsored" spend="R 38,810" impr="142k" clicks="2,840" conv="98"  roas="6.2x" status="active"/>
          <CampaignRow channel="email"  name="Pre-approved customers · May" type="Mailchimp · Automation" spend="R 1,200"  impr="38,420" clicks="6,820" conv="64" roas="—" status="scheduled"/>
          <CampaignRow channel="email"  name="Re-engagement · 90-day dormant" type="Mailchimp · Drip"  spend="—" impr="—" clicks="—" conv="—" roas="—" status="paused"/>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Spend by channel</h3><span className="h-sub">month to date</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RecurringBarLite label="Google Ads"  pct={42} val="R 78,400" color="#3B82F6"/>
            <RecurringBarLite label="Meta Ads"    pct={36} val="R 67,000" color="#8B5CF6"/>
            <RecurringBarLite label="LinkedIn"    pct={21} val="R 38,810" color="#0EA5B7"/>
            <RecurringBarLite label="Email"       pct={1}  val="R 1,200"  color="#D9A05B"/>
          </div>
        </div>

        <div className="ai-callout">
          <span className="ai-tag"><Icon name="sparkles" size={11}/> Marketing alerts</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <MarketingAlert tone="crit" title="Google tracking script missing on /loan-calculator"
              body="Conversions for the 'Home loan · search' campaign may be under-reported by ~22% since 18 May."/>
            <MarketingAlert tone="warn" title="LinkedIn campaign hits 80% of monthly budget"
              body="R 38,810 spent of R 48,000 cap with 9 days remaining. Pacing toward overspend on 28 May."/>
            <MarketingAlert tone="ok"   title="Meta 'Loan calculator · prospecting' beating target"
              body="ROAS 3.4x vs 2.5x target. Consider lifting daily budget by 20%."/>
          </div>
        </div>
      </div>

      <div className="grid-2eq">
        <div className="card">
          <div className="card-head"><h3>Lead source attribution</h3><span className="h-sub">last 28 days · 412 conversions</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RecurringBarLite label="Paid search"   pct={44} val="184" color="#3B82F6"/>
            <RecurringBarLite label="Organic"       pct={22} val="92"  color="#22C55E"/>
            <RecurringBarLite label="Paid social"   pct={16} val="68"  color="#8B5CF6"/>
            <RecurringBarLite label="Email"         pct={9}  val="38"  color="#D9A05B"/>
            <RecurringBarLite label="Direct"        pct={6}  val="24"  color="#00E5FF"/>
            <RecurringBarLite label="Referral"      pct={3}  val="6"   color="#EF4444"/>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Upcoming activity</h3><span className="h-sub">marketing calendar</span></div>
          <div>
            <ScheduleRow date="24 May"  tone="info"  title="Email · pre-approved customers"  meta="Mailchimp automation · 38,420 contacts"/>
            <ScheduleRow date="27 May"  tone="ok"    title="Blog launch · 'How CLI scoring works'" meta="Content · ungated"/>
            <ScheduleRow date="01 Jun"  tone="warn"  title="Google Ads · winter retention" meta="Budget R 24,000 · creative under review"/>
            <ScheduleRow date="03 Jun"  tone="info"  title="LinkedIn · CFO targeting" meta="Sponsored InMail · 4,820 estimated reach"/>
            <ScheduleRow date="07 Jun"  tone="ok"    title="Webinar · 'Plan your home loan'" meta="Landing page + email funnel"/>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ small reusables for the tabs ============
const PageRow = ({ page, views, pct, delta, trend }) => (
  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 80px", gap: 12, alignItems: "center" }}>
    <div className="mono" style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{page}</div>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: "#00E5FF", boxShadow: "0 0 8px rgba(0,229,255,0.5)" }}/></div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>{views.toLocaleString()}</div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right", color: trend === "up" ? "var(--green)" : "var(--red)" }}>{delta}</div>
  </div>
);

const RecurringBarLite = ({ label, pct, val, color }) => (
  <div className="bar-row">
    <div className="bar-label">{label}</div>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}99` }}/></div>
    <div className="bar-val mono">{val}</div>
  </div>
);

const DeviceSegment = ({ items }) => (
  <div>
    <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-soft)", marginBottom: 12 }}>
      {items.map((it, i) => (
        <div key={i} style={{ width: `${it.value}%`, background: it.color, boxShadow: `inset 0 0 6px ${it.color}88` }}/>
      ))}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }}/>
          <Icon name={it.icon} size={12} style={{ color: "var(--text-tertiary)" }}/>
          <span style={{ fontSize: 13 }}>{it.label}</span>
        </div>
      ))}
    </div>
  </div>
);

const FunnelStep = ({ label, count, pct, color }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{count} <span className="dim">· {pct}%</span></span>
    </div>
    <div style={{ height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, boxShadow: `0 0 10px ${color}aa` }}/>
    </div>
  </div>
);

const QueryRow = ({ q, c, i, p, pUp, pDown }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
    <div className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q}</div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>{c}</div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right", color: "var(--text-tertiary)" }}>{i}</div>
    <div className="mono" style={{ fontSize: 12, textAlign: "right", color: pUp ? "var(--green)" : pDown ? "var(--red)" : "var(--text-primary)" }}>{p}{pUp && " ▲"}{pDown && " ▼"}</div>
  </div>
);

const KwShift = ({ query, from, to, dir }) => {
  const isUp = dir === "up";
  const delta = Math.abs(to - from);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{query}</div>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>#{from}</div>
      <Icon name="arrow" size={12} style={{ color: "var(--text-dim)" }}/>
      <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>#{to}</div>
      <Badge tone={isUp ? "ok" : "crit"}>{isUp ? `▲ ${delta}` : `▼ ${delta}`}</Badge>
    </div>
  );
};

const SeoCheck = ({ tone, label, note }) => {
  const map = { ok: { c: "var(--green)", i: "check" }, warn: { c: "var(--amber)", i: "issue" }, crit: { c: "var(--red)", i: "x" } };
  const m = map[tone];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, display: "grid", placeItems: "center", color: m.c, background: `${m.c}22`, border: `1px solid ${m.c}44` }}>
        <Icon name={m.i} size={13}/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div className="dim" style={{ fontSize: 11.5 }}>{note}</div>
      </div>
      <Badge tone={tone === "ok" ? "ok" : tone === "warn" ? "high" : "crit"}>{tone === "ok" ? "Pass" : tone === "warn" ? "Warn" : "Fail"}</Badge>
    </div>
  );
};

const IndexCell = ({ label, value, tone }) => {
  const c = { ok: "var(--green)", med: "var(--amber)", low: "var(--text-tertiary)" }[tone];
  return (
    <div style={{ padding: 14, border: "1px solid var(--border-soft)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
      <div className="label-strip" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: c }}>{value}</div>
    </div>
  );
};

const CampaignRow = ({ channel, name, type, spend, impr, clicks, conv, roas, status }) => {
  const channelColors = { google: "#4285F4", meta: "#8B5CF6", li: "#0A66C2", email: "#D9A05B" };
  const channelLetters = { google: "G", meta: "M", li: "in", email: "✉" };
  const statusMap = {
    active: { tone: "ok", text: "Active" },
    scheduled: { tone: "info", text: "Scheduled" },
    paused: { tone: "ghost", text: "Paused" },
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 110px 110px 110px 90px 80px", gap: 14, alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        display: "grid", placeItems: "center",
        color: channelColors[channel], background: `${channelColors[channel]}22`,
        border: `1px solid ${channelColors[channel]}55`,
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12,
      }}>{channelLetters[channel]}</div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
        <div className="dim" style={{ fontSize: 11.5 }}>{type}</div>
      </div>
      <div className="mono" style={{ fontSize: 12.5 }}>{spend}</div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{impr}</div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{clicks}</div>
      <div className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{conv}</div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--cyan)" }}>{roas}</div>
      <Badge tone={statusMap[status].tone} dot>{statusMap[status].text}</Badge>
    </div>
  );
};

const MarketingAlert = ({ tone, title, body }) => {
  const c = { crit: "var(--red)", warn: "var(--amber)", ok: "var(--green)" }[tone];
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 8, borderLeft: `2px solid ${c}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
};

const ScheduleRow = ({ date, tone, title, meta }) => {
  const c = { info: "var(--cyan)", ok: "var(--green)", warn: "var(--amber)", crit: "var(--red)" }[tone];
  return (
    <div className="feed-item">
      <div style={{
        flex: "0 0 56px", width: 56, padding: "6px 0",
        borderRadius: 8, textAlign: "center",
        background: `${c}1c`, border: `1px solid ${c}44`,
        fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, color: c,
      }}>{date}</div>
      <div className="feed-body">
        <div className="feed-title">{title}</div>
        <div className="feed-meta">{meta}</div>
      </div>
    </div>
  );
};

Object.assign(window, { AnalyticsTab, SeoTab, MarketingTab });

// ============ Issues tab — AI fix recommendations per issue ============
const IssuesTab = ({ site, issues, setRoute }) => {
  const [sev, setSev] = React.useState("All");
  const [expanded, setExpanded] = React.useState(issues[0]?.id || null);
  const filters = [
    { k: "All",      n: issues.length },
    { k: "Critical", n: issues.filter(i => i.severity === "critical").length },
    { k: "High",     n: issues.filter(i => i.severity === "high").length },
    { k: "Medium",   n: issues.filter(i => i.severity === "medium").length },
    { k: "Low",      n: issues.filter(i => i.severity === "low").length },
  ];
  const filtered = sev === "All" ? issues : issues.filter(i => i.severity === sev.toLowerCase());

  if (issues.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 6 }}>All clear on {site.name}</div>
        <div className="muted">No open issues. Horus has scanned 18 pages across 3 viewports without flagging anything.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="label-strip">Severity</span>
        <div className="filter-chips">
          {filters.map(f => (
            <button key={f.k} className={`chip ${sev === f.k ? "active" : ""}`} onClick={() => setSev(f.k)}>
              {f.k} <span className="count">{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn sm"><Icon name="filter" size={12}/> Group by category</button>
          <button className="btn primary sm"><Icon name="sparkles" size={12}/> Auto-fix safe issues</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filtered.map(issue => (
          <IssueAiCard
            key={issue.id}
            issue={issue}
            site={site}
            expanded={expanded === issue.id}
            onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)}
            onOpen={() => setRoute({ name: "issue", id: issue.id })}
          />
        ))}
      </div>
    </>
  );
};

const IssueAiCard = ({ issue, site, expanded, onToggle, onOpen }) => {
  const fix = AI_FIX_LIBRARY[issue.id] || AI_FIX_LIBRARY.default;
  const sevColor = { critical: "var(--red)", high: "var(--amber)", medium: "var(--cyan)", low: "var(--text-tertiary)" }[issue.severity];
  return (
    <div className="card" style={{ overflow: "hidden", borderColor: expanded ? `${sevColor === "var(--red)" ? "rgba(239,68,68,0.30)" : sevColor === "var(--amber)" ? "rgba(245,158,11,0.30)" : "rgba(0,229,255,0.25)"}` : undefined }}>
      {/* Header — clickable */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          gap: 14, alignItems: "center",
          padding: "16px 18px",
          background: "transparent", border: 0,
          textAlign: "left", cursor: "pointer",
          color: "inherit", font: "inherit",
        }}
        aria-expanded={expanded}
      >
        <div style={{
          width: 6, height: 44, borderRadius: 3, background: sevColor,
          boxShadow: `0 0 12px ${sevColor === "var(--red)" ? "rgba(239,68,68,0.5)" : sevColor === "var(--amber)" ? "rgba(245,158,11,0.45)" : "rgba(0,229,255,0.4)"}`,
        }}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <SeverityChip level={issue.severity}/>
            <Badge tone="ghost">{issue.category}</Badge>
            <Badge tone="ghost">{issue.status}</Badge>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{issue.title}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            <span className="mono">{issue.page}</span> · detected {issue.detected} · owner {issue.owner}
          </div>
        </div>
        <Badge tone="med"><Icon name="sparkles" size={11}/> Fix ready</Badge>
        <span className="mono dim" style={{ fontSize: 11 }}>conf {issue.confidence}%</span>
        <Icon name="chevronDown" size={16} style={{ transition: "transform 180ms", transform: expanded ? "rotate(180deg)" : "none", color: "var(--text-tertiary)" }}/>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-soft)", padding: "16px 18px 18px", background: "rgba(0,229,255,0.02)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
            {/* Left: AI recommendation */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="ai-tag"><Icon name="sparkles" size={11}/> Horus recommends</span>
                <span className="dim" style={{ fontSize: 11.5 }}>{fix.timeEstimate} · {fix.difficulty}</span>
              </div>

              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, lineHeight: 1.45, marginBottom: 14 }}>
                {fix.summary}
              </div>

              <div className="label-strip" style={{ marginBottom: 8 }}>Steps to fix</div>
              <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.7 }}>
                {fix.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>

              {fix.code && (
                <>
                  <div className="label-strip" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{fix.codeLabel || "Suggested patch"}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em", textTransform: "none" }}>{fix.codeFile}</span>
                  </div>
                  <CodeBlock content={fix.code}/>
                </>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {fix.canAutoApply
                  ? <button className="btn primary sm"><Icon name="sparkles" size={12}/> Apply fix automatically</button>
                  : <button className="btn primary sm"><Icon name="code" size={12}/> Copy patch</button>}
                <button className="btn sm"><Icon name="plus" size={12}/> Create ticket</button>
                <button className="btn sm" onClick={onOpen}><Icon name="arrow" size={12}/> Open full detail</button>
                <button className="btn ghost sm"><Icon name="x" size={12}/> Ignore</button>
              </div>
            </div>

            {/* Right: impact + alternatives + similar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                <div className="label-strip" style={{ marginBottom: 8 }}>If fixed</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  {fix.impact.map((line, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <Icon name="check" size={12} style={{ color: "var(--green)", marginTop: 4, flex: "0 0 12px" }}/>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {fix.alternatives && (
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 8 }}>Alternative approaches</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fix.alternatives.map((alt, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{alt.title}</div>
                        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{alt.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: "12px 14px", background: "rgba(217,160,91,0.05)", border: "1px solid rgba(217,160,91,0.20)", borderRadius: 10 }}>
                <div className="label-strip" style={{ marginBottom: 6, color: "var(--gold)" }}>Worth knowing</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>{fix.context}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CodeBlock = ({ content }) => (
  <pre style={{
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
  }}>{content.split("\n").map((line, i) => {
    let color = "var(--text-secondary)";
    if (line.startsWith("- ")) color = "#FCA5A5";
    else if (line.startsWith("+ ")) color = "#86EFAC";
    else if (line.startsWith("// ") || line.startsWith("# ")) color = "var(--text-dim)";
    return <div key={i} style={{ color }}>{line || "\u00A0"}</div>;
  })}</pre>
);

const AI_FIX_LIBRARY = {
  i1: {
    summary: "Restore the hero CTA on mobile breakpoints by removing the .u-hide-mobile class that was added in the last theme update.",
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
    code: `- <a class=\"hero-cta primary u-hide-mobile\" href=\"/get-started\">\n+ <a class=\"hero-cta primary\" href=\"/get-started\">\n    Open an account\n  </a>`,
    impact: [
      "Restores 41% of mobile conversion path",
      "Removes the critical visual regression flag",
      "No risk to desktop layout (class only affected mobile)",
    ],
    alternatives: [
      { title: "CSS override (safer for theme updates)", note: "Add `.u-hide-mobile.hero-cta { display: inline-flex !important; }` in child theme stylesheet — survives parent theme updates." },
      { title: "Roll back theme to 4.6.9", note: "Reverts the change everywhere. Use only if other elements are also broken." },
    ],
    context: "This class was introduced upstream in Astra 4.6.10 as a utility. It's harmless elsewhere on the site but happens to land on a conversion CTA here.",
  },
  i2: {
    summary: "Roll back Form-Pro to 4.1.9 to restore form submissions, then stage the 4.2.1 upgrade with the new endpoint config.",
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
      { title: "Hotfix the new endpoint URL", note: "If the team can't roll back, patch the form action attribute in JS to point at the new REST endpoint. Higher risk." },
    ],
    context: "Form-Pro 4.2.1 changed its submission endpoint without backwards compatibility. Several agencies have reported the same regression — a 4.2.2 patch is in beta.",
  },
  i3: {
    summary: "Stage WooCommerce 9.0 on a copy of the production site, run the regression suite against checkout, then schedule the prod update for a low-traffic window.",
    timeEstimate: "~2 hours staging",
    difficulty: "Hard · major version",
    canAutoApply: false,
    steps: [
      "Spin up a staging clone of Gentech via the hosting panel",
      "Apply WooCommerce 9.0 update on staging only",
      "Run the cart → checkout → thank-you regression test (Horus has a saved suite)",
      "Verify custom checkout hooks in `gentech-custom/woo-hooks.php` still fire",
      "If clean, schedule the production update for Sunday 02:00 SAST",
    ],
    code: `// Hooks to verify after upgrade — these are non-standard\nadd_action('woocommerce_checkout_order_processed', 'gt_post_to_crm', 10, 3);\nadd_filter('woocommerce_payment_complete_order_status', 'gt_paid_status', 10, 3);\nadd_action('woocommerce_thankyou', 'gt_track_conversion', 10, 1);`,
    codeLabel: "Custom hooks to verify",
    codeFile: "gentech-custom/woo-hooks.php",
    impact: [
      "Avoids checkout outage on the highest-revenue site",
      "Confirms upgrade safety before production",
      "Documents the staging test for the client report",
    ],
    alternatives: [
      { title: "Defer until 9.0.x patch release", note: "Wait for 9.0.2 (expected ~2 weeks) which has fixes for the hooks-priority change. Lower risk but holds back security patches." },
    ],
    context: "WooCommerce 9.0 changes hook execution priority on the checkout flow. Custom code that relies on the old order is the most common source of regressions.",
  },
  i4: {
    summary: "Renew the Let's Encrypt certificate immediately and restore the auto-renew cron that was paused during the last server maintenance.",
    timeEstimate: "~5 min",
    difficulty: "Easy · server task",
    canAutoApply: true,
    steps: [
      "SSH into the host and run `certbot renew` to force renewal now",
      "Verify the new cert with `certbot certificates`",
      "Re-enable the auto-renew systemd timer: `systemctl enable --now certbot.timer`",
      "Add the timer to the server's monitoring stack so a future pause raises an alert",
    ],
    code: `# Renew immediately\nsudo certbot renew\n\n# Verify\nsudo certbot certificates\n\n# Re-enable auto-renew\nsudo systemctl enable --now certbot.timer\nsudo systemctl status certbot.timer`,
    codeLabel: "Server commands",
    codeFile: "host shell",
    impact: [
      "Avoids browser security warnings",
      "No SEO penalty from an expired cert",
      "Auto-renew restored — prevents recurrence",
    ],
    alternatives: [
      { title: "Switch to wildcard cert via DNS challenge", note: "If subdomains keep multiplying, a wildcard cert is easier to maintain than per-host issuance." },
    ],
    context: "The auto-renew cron was disabled during a routine kernel update on 8 May and never re-enabled. The certbot config itself is fine.",
  },
  i5: {
    summary: "Confirm the homepage subhead change with the marketing editor. If unintended, restore the previous copy from the WordPress revision history.",
    timeEstimate: "~10 min",
    difficulty: "Easy · content review",
    canAutoApply: false,
    steps: [
      "Open the homepage in WP-admin → Revisions",
      "Compare current revision with the version from 16 May",
      "Either restore the older revision, or confirm the change with the editor and mark this issue resolved",
      "If keeping the change, add a tone-of-voice annotation to the brand style guide",
    ],
    code: `- We help South African businesses grow with smart finance.\n+ Smart finance for South African businesses.`,
    codeLabel: "Copy diff",
    codeFile: "Homepage · hero subheading",
    impact: [
      "Tone-of-voice consistency restored",
      "Avoids cascading copy drift on subpages",
    ],
    alternatives: [
      { title: "Lock content edits behind approval", note: "Flexcom's editor role could be moved behind an approval workflow for high-impact pages." },
    ],
    context: "Horus didn't find a matching content ticket. The change came from the marketing editor's account at 10:48 today, but no JIRA reference was attached.",
  },
  i6: {
    summary: "Add explicit width and height attributes to the embedded video so the browser can reserve space before the video loads.",
    timeEstimate: "~5 min",
    difficulty: "Easy · markup",
    canAutoApply: true,
    steps: [
      "Locate the video embed on /services (line 84 of services-template.php)",
      "Add `width` and `height` attributes matching the video's intrinsic ratio (16:9)",
      "Or wrap in a CSS aspect-ratio container",
      "Re-run Lighthouse to confirm CLS drops back to ≤ 0.05",
    ],
    code: `- <iframe src=\"https://player.vimeo.com/video/...\" allowfullscreen></iframe>\n+ <iframe src=\"https://player.vimeo.com/video/...\"\n+         width=\"960\" height=\"540\"\n+         style=\"aspect-ratio: 16/9; width: 100%; height: auto;\"\n+         allowfullscreen></iframe>`,
    codeLabel: "Patch",
    codeFile: "wp-content/themes/acme/services-template.php · line 84",
    impact: [
      "CLS returns to baseline 0.04",
      "Removes the perceived layout shift on first paint",
      "Small but positive SEO signal",
    ],
    alternatives: [
      { title: "CSS aspect-ratio wrapper", note: "If multiple embeds exist, define `.video-embed { aspect-ratio: 16/9; }` once in the theme stylesheet." },
    ],
    context: "Core Web Vitals weights CLS heavily. A single embed without intrinsic sizing can push a page from 'Good' to 'Needs improvement'.",
  },
  i7: {
    summary: "Reinstate the Google Tag Manager container on the homepage. The tag is missing from the <head> across all pages after the last deploy.",
    timeEstimate: "~10 min",
    difficulty: "Easy · template edit",
    canAutoApply: true,
    steps: [
      "Open header.php in the active theme",
      "Restore the GTM container snippet at the top of <head>",
      "Verify in Tag Assistant that GTM-XJ8FZP fires on at least 3 pages",
      "Add a Horus rule to alert if the snippet disappears again",
    ],
    code: `<!-- Google Tag Manager -->\n+ <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n+ new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n+ j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n+ 'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n+ })(window,document,'script','dataLayer','GTM-XJ8FZP');</script>\n<!-- End Google Tag Manager -->`,
    codeLabel: "Reinstate snippet",
    codeFile: "wp-content/themes/greenfield/header.php · before </head>",
    impact: [
      "Conversion tracking resumes — fills today's data gap",
      "Marketing campaigns regain attribution accuracy",
      "Closes the analytics blind spot",
    ],
    alternatives: [
      { title: "Use a GTM plugin instead of theme edits", note: "WP-GTM plugin survives theme updates, but adds one more thing to manage." },
    ],
    context: "Horus diffs the rendered <head> daily. The script was present yesterday at 18:00 and missing at 08:31 today — clean indication of a deploy-time removal.",
  },
  i8: {
    summary: "Patch the null-check in cart.min.js. The error occurs when the cart loads before the shipping module has populated.",
    timeEstimate: "~30 min",
    difficulty: "Medium · JS hotfix",
    canAutoApply: false,
    steps: [
      "Reproduce locally with shipping module mocked as null",
      "Add a guard in `getShippingTotal()` (line 412) before reading `.amount`",
      "Bundle and minify, deploy to staging",
      "Verify the error rate drops on the staging endpoint",
    ],
    code: `// cart.min.js · line 412 (after demangling)\n- const total = shipping.amount + cart.subtotal;\n+ const total = (shipping && shipping.amount ? shipping.amount : 0) + cart.subtotal;`,
    codeLabel: "Hotfix",
    codeFile: "wp-content/plugins/tarsus-cart/cart.min.js",
    impact: [
      "JS error rate returns to baseline (~2/hour)",
      "Checkout drop-off recovers",
      "Removes the visible console error users may report",
    ],
    alternatives: [
      { title: "Roll back the cart plugin one version", note: "Reverts cleanly but loses recent shipping-rules improvements." },
    ],
    context: "The error was introduced in the cart-v3 refactor on 12 May. It only fires when the shipping AJAX call is slower than the cart render — explains why it didn't surface in staging.",
  },
  i9: {
    summary: "Re-upload the team photo to the WordPress media library, or update the reference to use the asset that's currently in storage.",
    timeEstimate: "~5 min",
    difficulty: "Easy · content fix",
    canAutoApply: false,
    steps: [
      "Check WordPress Media Library for team-thandi.jpg — restore from trash if soft-deleted",
      "If gone, request a fresh portrait from the team",
      "Update /about/team to point at the new asset URL",
      "Run Horus' image-availability scan to confirm no other broken assets",
    ],
    code: `<!-- /about/team · team grid -->\n- <img src=\"/uploads/2024/team-thandi.jpg\" alt=\"Thandi Mokoena\">\n+ <img src=\"/uploads/2025/team-thandi.jpg\" alt=\"Thandi Mokoena\">`,
    codeLabel: "Reference update",
    codeFile: "Team page · WP Block Editor",
    impact: [
      "Visual gap on the team page closes",
      "No more 404 noise in server logs",
    ],
    context: "404s on image assets are easy to miss — they don't break rendering, just leave gaps. Horus catches them on every scan.",
  },
  i10: {
    summary: "Tighten the Content-Security-Policy by removing 'unsafe-inline' from script-src and adding nonces to the inline scripts that need them.",
    timeEstimate: "~45 min",
    difficulty: "Medium · security hardening",
    canAutoApply: false,
    steps: [
      "Audit inline <script> tags across the site (Horus has a list of 7)",
      "Generate per-request nonces in PHP",
      "Replace 'unsafe-inline' with `'nonce-{NONCE}'` in the CSP header",
      "Update the 7 inline scripts to include the nonce attribute",
      "Test in report-only mode for 24 hours, then enforce",
    ],
    code: `- Content-Security-Policy: script-src 'self' 'unsafe-inline' https://www.googletagmanager.com\n+ Content-Security-Policy: script-src 'self' 'nonce-{NONCE}' https://www.googletagmanager.com`,
    codeLabel: "Header change",
    codeFile: "nginx/conf.d/gentech.conf",
    impact: [
      "Closes a class of XSS risk",
      "Restores the strict CSP that was in place before",
      "Pleases the security questionnaire from new B2B prospects",
    ],
    alternatives: [
      { title: "Hash-based CSP", note: "Use SHA-256 hashes of each inline script. Works for static inline content, but breaks for templated scripts." },
    ],
    context: "'unsafe-inline' was added during the last deploy to silence a CSP violation. It's a common shortcut, but defeats most of the policy's value.",
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
    impact: [
      "Resolves the flagged issue",
      "Restores expected behaviour",
    ],
    context: "Horus tailors recommendations per issue. The full detail view includes evidence screenshots and the change history.",
  },
};

Object.assign(window, { IssuesTab });
