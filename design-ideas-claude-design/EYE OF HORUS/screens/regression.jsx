/* global React, Icon, Badge, Tabs, Favicon */
// Visual Regression / Change Comparison
const Regression = ({ setRoute }) => {
  const D = window.HORUS_DATA;
  const [viewport, setViewport] = React.useState("Mobile");
  const [pageSel, setPageSel] = React.useState("/  · Homepage");

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="diff" size={22}/>
            Visual changes
            <Badge tone="crit" dot>1 critical diff</Badge>
          </h1>
          <p className="page-sub">Side-by-side baseline vs. latest scan. Horus highlights changed regions and explains what type of change it sees.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn">Flag as issue</button>
          <button className="btn primary"><Icon name="check" size={13}/> Approve change</button>
        </div>
      </div>

      {/* Selector row */}
      <div className="card" style={{ marginBottom: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Favicon site={D.sites[0]} size={28}/>
          <select className="select" defaultValue="Acme Finance">
            {D.sites.map(s => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ height: 24, width: 1, background: "var(--border-soft)" }}/>
        <div>
          <div className="label-strip" style={{ marginBottom: 4 }}>Page</div>
          <select className="select" value={pageSel} onChange={e => setPageSel(e.target.value)}>
            <option>/  · Homepage</option>
            <option>/services</option>
            <option>/about</option>
            <option>/contact-us</option>
            <option>/account/login</option>
          </select>
        </div>
        <div>
          <div className="label-strip" style={{ marginBottom: 4 }}>Compare</div>
          <select className="select" defaultValue="Today 09:14 vs 7 days ago">
            <option>Today 09:14 vs 7 days ago</option>
            <option>Today 09:14 vs yesterday</option>
            <option>Today 09:14 vs last approved baseline</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="label-strip">Viewport</span>
          <Tabs tabs={["Desktop", "Tablet", "Mobile"]} active={viewport} onChange={setViewport}/>
        </div>
      </div>

      {/* Comparison */}
      <div className="grid-2eq" style={{ marginBottom: 18, alignItems: "start" }}>
        <ComparisonPane label="Baseline" subtitle="7 days ago · approved" viewport={viewport} showCTA mode="baseline"/>
        <ComparisonPane label="Current"  subtitle="Today · 09:14" viewport={viewport} showCTA={false} mode="current"/>
      </div>

      {/* Changes list + AI panel */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3><Icon name="diff" size={14}/> Detected changes</h3>
            <span className="h-sub">{viewport} viewport · 4 changes</span>
          </div>
          <div>
            <ChangeRow
              tone="crit"
              type="Broken component"
              label="Hero CTA — 'Open an account' missing"
              region="Region 12% / 62% · 55% × 10%"
              conf={96}
              active
              onOpen={() => setRoute({ name: "issue", id: "i1" })}
            />
            <ChangeRow
              tone="warn"
              type="Layout shift"
              label="Hero subheading moved up 24px on mobile"
              region="Region 12% / 28% · 60% × 6%"
              conf={88}
            />
            <ChangeRow
              tone="info"
              type="Copy change"
              label="Footer link 'Insights' renamed to 'Resources'"
              region="Region 4% / 92% · 12% × 4%"
              conf={99}
            />
            <ChangeRow
              tone="info"
              type="Styling change"
              label="Primary brand color shifted 4% lighter"
              region="Global · 17 elements affected"
              conf={84}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="ai-callout">
            <span className="ai-tag"><Icon name="sparkles" size={11}/> Horus explanation</span>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, lineHeight: 1.4, marginTop: 10 }}>
              The hero CTA "Open an account" was removed from the mobile viewport in the last theme update.
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
              This element drives 41% of mobile lead form submissions in the last 30 days. The change correlates with theme update Astra 4.6.10 deployed yesterday at 12:04. No matching ticket was found.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <Badge tone="med" lg>96% confidence</Badge>
              <Badge tone="ghost">DOM diff</Badge>
              <Badge tone="ghost">Visual diff</Badge>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Verdict</h3></div>
            <div className="card-pad">
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
                Once you decide on this scan, Horus will use it as the new baseline for future comparisons.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn primary full"><Icon name="check" size={13}/> Approve change · set new baseline</button>
                <button className="btn full"><Icon name="x" size={13}/> Flag as issue · open ticket</button>
                <button className="btn ghost full">Defer · review at standup</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChangeRow = ({ tone, type, label, region, conf, active, onOpen }) => (
  <div className="feed-item" style={{ background: active ? "rgba(239,68,68,0.05)" : undefined }} onClick={onOpen}>
    <div className="feed-icon" style={{
      borderColor: tone === "crit" ? "rgba(239,68,68,0.4)" : tone === "warn" ? "rgba(245,158,11,0.4)" : "rgba(0,229,255,0.3)",
      color: tone === "crit" ? "#FCA5A5" : tone === "warn" ? "#FCD37A" : "#7DE4F2"
    }}>
      <Icon name={tone === "crit" ? "issue" : tone === "warn" ? "diff" : "code"} size={14}/>
    </div>
    <div className="feed-body">
      <div className="feed-title">{label}</div>
      <div className="feed-meta">
        <span>{type}</span><span className="pip"/>
        <span className="mono">{region}</span>
      </div>
    </div>
    <Badge tone="ghost">{conf}%</Badge>
  </div>
);

const ComparisonPane = ({ label, subtitle, viewport, showCTA, mode }) => {
  const isMobile = viewport === "Mobile";
  const isTablet = viewport === "Tablet";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div className="label-strip">{label}</div>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <Badge tone="ghost"><Icon name={isMobile ? "mobile" : isTablet ? "tablet" : "desktop"} size={11}/> {viewport}</Badge>
      </div>

      <div className={`viewport-mock ${isTablet ? "tablet" : ""} ${isMobile ? "mobile" : ""}`} style={{ height: isMobile ? 480 : 420 }}>
        <div className="vp-head">
          <div className="vp-dots"><span/><span/><span/></div>
          <div className="vp-url">acmefinance.co.za</div>
        </div>
        <div className="vp-content">
          <div className="mock-block h1"/>
          <div className="mock-block p"/>
          <div className="mock-block p s"/>
          <div className="mock-block img" style={{ minHeight: isMobile ? 100 : 140 }}/>
          {showCTA && <div className="mock-block btn-pri"/>}
          {!showCTA && mode === "current" && isMobile && (
            <div style={{
              border: "2px dashed var(--red)",
              borderRadius: 6,
              padding: 10,
              background: "rgba(239,68,68,0.08)",
              color: "#FCA5A5",
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              textAlign: "center",
            }}>missing element</div>
          )}
          <div className="mock-block p"/>
          <div className="mock-block p s"/>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }}/>
            <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }}/>
            {!isMobile && <div className="mock-block" style={{ flex: 1, height: 50, background: "rgba(255,255,255,0.03)" }}/>}
          </div>
        </div>

        {/* Diff overlays only on current */}
        {mode === "current" && (
          <>
            {isMobile ? (
              <div className="diff-overlay crit" style={{ left: "8%", top: "62%", width: "84%", height: "10%" }}>
                <span className="tag">CRIT · missing CTA</span>
              </div>
            ) : (
              <div className="diff-overlay warn" style={{ left: "8%", top: "28%", width: "60%", height: "6%" }}>
                <span className="tag">WARN · layout shift</span>
              </div>
            )}
            <div className="diff-overlay" style={{ left: "4%", top: "84%", width: "20%", height: "4%" }}>
              <span className="tag">copy change</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

window.Regression = Regression;
