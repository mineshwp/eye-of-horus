/* global React, ReactDOM */
// Eye of Horus — App router
const { useState, useEffect } = React;

const App = () => {
  const [authed, setAuthed] = useState(false);
  const [route, setRoute] = useState({ name: "dashboard" });
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("horus-theme") || "dark"; } catch (e) { return "dark"; }
  });
  useEffect(() => {
    // Sign-in is always dark for legibility; in-app respects the user's choice
    document.documentElement.setAttribute("data-theme", authed ? theme : "dark");
    try { localStorage.setItem("horus-theme", theme); } catch (e) {}
  }, [theme, authed]);
  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  // Keyboard quick-nav: g d / g s / g i / g r / g w / g p / g c
  useEffect(() => {
    if (!authed) return;
    let last = 0; let pending = false;
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const now = Date.now();
      if (e.key === "g") { pending = true; last = now; return; }
      if (pending && now - last < 800) {
        pending = false;
        if (e.key === "d") setRoute({ name: "dashboard" });
        if (e.key === "s") setRoute({ name: "site", id: "acme" });
        if (e.key === "i") setRoute({ name: "issue", id: "i1" });
        if (e.key === "r") setRoute({ name: "regression" });
        if (e.key === "w") setRoute({ name: "wp" });
        if (e.key === "p") setRoute({ name: "reports" });
        if (e.key === "c") setRoute({ name: "settings" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed]);

  if (!authed) return <SignIn onEnter={() => setAuthed(true)} />;

  let crumbs = ["Workspace"];
  let body = null;
  switch (route.name) {
    case "dashboard":
      crumbs = ["Wetpaint", "Command Centre"];
      body = <Dashboard setRoute={setRoute}/>;
      break;
    case "site":
      const s = window.HORUS_DATA.sites.find(x => x.id === route.id);
      crumbs = ["Wetpaint", "Websites", s ? s.name : "Site"];
      body = <SiteDetail siteId={route.id} setRoute={setRoute}/>;
      break;
    case "issue":
      const iss = window.HORUS_DATA.issues.find(x => x.id === route.id);
      const isSite = iss && window.HORUS_DATA.sites.find(x => x.id === iss.siteId);
      crumbs = ["Wetpaint", "Websites", isSite ? isSite.name : "", "Issue"];
      body = <IssueDetail issueId={route.id} setRoute={setRoute}/>;
      break;
    case "regression":
      crumbs = ["Wetpaint", "Visual changes"];
      body = <Regression setRoute={setRoute}/>;
      break;
    case "wp":
      crumbs = ["Wetpaint", "WordPress updates"];
      body = <WpUpdates setRoute={setRoute}/>;
      break;
    case "reports":
      crumbs = ["Wetpaint", "Reports & insights"];
      body = <Reports setRoute={setRoute}/>;
      break;
    case "settings":
      crumbs = ["Wetpaint", "Monitoring & configuration"];
      body = <Settings setRoute={setRoute}/>;
      break;
    default:
      body = <Dashboard setRoute={setRoute}/>;
  }

  return (
    <>
      <div className="app-bg"/>
      <div className="app-shell">
        <Sidebar route={route} setRoute={setRoute}/>
        <div className="main">
          <Topbar crumbs={crumbs} onJumpSignIn={() => setAuthed(false)} theme={theme} onToggleTheme={toggleTheme}/>
          {body}
        </div>
      </div>
      <HelperPill route={route}/>
    </>
  );
};

const HelperPill = ({ route }) => (
  <div className="helper-pill" title="Prototype tips">
    <span className="pdot"/>
    <span>Prototype · click rows &amp; cards to navigate · press <span className="mono" style={{ color: "var(--cyan)" }}>G&nbsp;then&nbsp;D/S/I/R/W/P/C</span></span>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
