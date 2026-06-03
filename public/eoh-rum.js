/*!
 * Eye of Horus — Real-User Monitoring (RUM) client
 * Lightweight, consent-gated. No cookies; uses localStorage/sessionStorage only.
 *
 * Embed:
 *   <script src="https://<app>/eoh-rum.js" data-eoh="TRACKING_ID" defer></script>
 * The WordPress plugin injects this automatically (Phase 3 plugin step).
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      for (var i = s.length - 1; i >= 0; i--) {
        if (s[i].src && s[i].src.indexOf("eoh-rum.js") !== -1) return s[i];
      }
      return null;
    })();
  if (!script) return;

  var trackingId = script.getAttribute("data-eoh");
  if (!trackingId) return;

  // Endpoints are served from the same origin as the script.
  var base = script.src.replace(/\/eoh-rum\.js.*$/, "");
  var INGEST = base + "/api/rum/ingest";
  var CONFIG = base + "/api/rum/config?t=" + encodeURIComponent(trackingId);

  var LS = "eoh_vid";
  var SS = "eoh_sid";
  var SS_TS = "eoh_sid_ts";
  var SESSION_TTL = 30 * 60 * 1000; // 30 minutes

  // ── Identity ────────────────────────────────────────────────────────────
  function uid() {
    try {
      return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    } catch (e) {
      return String(Date.now()) + Math.random().toString(16).slice(2);
    }
  }
  function store(api, k, v) { try { window[api].setItem(k, v); } catch (e) {} }
  function read(api, k) { try { return window[api].getItem(k); } catch (e) { return null; } }

  var visitorId = read("localStorage", LS);
  var isReturning = !!visitorId;
  // Generate but DON'T persist the visitor ID yet — persistence waits until the
  // consent gate confirms collection is allowed (see gate()).
  if (!visitorId) { visitorId = uid(); }

  var now = Date.now();
  var sid = read("sessionStorage", SS);
  var sidTs = parseInt(read("sessionStorage", SS_TS) || "0", 10);
  if (!sid || !sidTs || now - sidTs > SESSION_TTL) sid = uid();
  store("sessionStorage", SS, sid);
  store("sessionStorage", SS_TS, String(now));

  function device() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (navigator.userAgentData && navigator.userAgentData.mobile) return "mobile";
    if (w > 0 && w < 768) return "mobile";
    if (w >= 768 && w < 1024) return "tablet";
    return "desktop";
  }
  function sourceFromReferrer() {
    try {
      var u = new URL(document.location.href);
      var utm = u.searchParams.get("utm_source");
      if (utm) return utm;
      if (document.referrer) {
        var rh = new URL(document.referrer).hostname;
        if (rh && rh !== location.hostname) return rh;
      }
    } catch (e) {}
    return "direct";
  }

  var path = function () { return location.pathname + location.search; };
  var entryPath = path();

  // ── Buffers ─────────────────────────────────────────────────────────────
  var vitals = [];
  var events = [];
  var maxScroll = 0;
  var sent = false;
  // Collection is disallowed until the consent gate explicitly enables it.
  // This prevents a fast page-exit from flushing before config resolves.
  var allowed = false;

  function pushEvent(type, target, value, meta) {
    events.push({ type: type, path: path(), target: target || null, value: value != null ? String(value) : null, meta: meta || {} });
  }

  // ── Core Web Vitals (minimal, no external lib) ───────────────────────────
  var THRESH = {
    LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800],
  };
  function rate(metric, v) {
    var t = THRESH[metric];
    if (!t) return null;
    return v <= t[0] ? "good" : v <= t[1] ? "needs-improvement" : "poor";
  }
  function addVital(metric, value) {
    if (value == null || isNaN(value)) return;
    var v = Math.round(metric === "CLS" ? value * 1000 : value) / (metric === "CLS" ? 1000 : 1);
    vitals.push({ metric: metric, value: v, rating: rate(metric, v), path: path() });
  }

  function observe(type, cb) {
    try {
      var po = new PerformanceObserver(function (list) { cb(list.getEntries(), po); });
      po.observe({ type: type, buffered: true });
      return po;
    } catch (e) { return null; }
  }

  // TTFB
  try {
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.responseStart > 0) addVital("TTFB", nav.responseStart);
  } catch (e) {}

  // FCP
  observe("paint", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].name === "first-contentful-paint") addVital("FCP", entries[i].startTime);
    }
  });

  // LCP — keep the latest until the page is backgrounded.
  var lcpValue = 0;
  observe("largest-contentful-paint", function (entries) {
    var last = entries[entries.length - 1];
    if (last) lcpValue = last.renderTime || last.loadTime || last.startTime;
  });

  // CLS — sum unexpected layout shifts.
  var clsValue = 0;
  observe("layout-shift", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].hadRecentInput) clsValue += entries[i].value;
    }
  });

  // INP — approximate as the worst interaction event duration.
  var inpValue = 0;
  observe("event", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].duration > inpValue) inpValue = entries[i].duration;
    }
  });

  // ── Interaction tracking ─────────────────────────────────────────────────
  var DOWNLOAD_RE = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|dmg|exe|pkg|mp4|mp3|wav|rar|gz|tar)(\?|$)/i;
  var lastClicks = [];

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target && e.target.closest ? e.target.closest("a,button,[role=button],[data-eoh-cta]") : null;

      // Rage-click detection: 3+ clicks within 700ms near the same point.
      var n = Date.now();
      lastClicks.push({ t: n, x: e.clientX, y: e.clientY });
      lastClicks = lastClicks.filter(function (c) { return n - c.t < 700; });
      if (lastClicks.length >= 3) {
        var near = lastClicks.every(function (c) {
          return Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40;
        });
        if (near) { pushEvent("rage_click", path(), Math.round(e.clientX) + "," + Math.round(e.clientY)); lastClicks = []; }
      }

      if (!t) return;
      var label = (t.getAttribute("data-eoh-cta") || t.textContent || "").trim().slice(0, 80);

      // Viewport-relative click position (%) for the heatmap.
      var vw = window.innerWidth || 1;
      var vh = document.documentElement.clientHeight || window.innerHeight || 1;
      var coords = { x: Math.max(0, Math.min(100, Math.round((e.clientX / vw) * 100))), y: Math.max(0, Math.min(100, Math.round((e.clientY / vh) * 100))) };

      if (t.tagName === "A" && t.href) {
        var href = t.href;
        var isOutbound = false;
        try { isOutbound = new URL(href).hostname !== location.hostname; } catch (e2) {}
        if (DOWNLOAD_RE.test(href)) pushEvent("download", href, label, coords);
        else if (isOutbound) pushEvent("outbound", href, label, coords);
        else if (t.hasAttribute("data-eoh-cta")) pushEvent("cta", href, label, coords);
        else pushEvent("click", href, label, coords);
      } else {
        pushEvent(t.hasAttribute("data-eoh-cta") ? "cta" : "click", null, label, coords);
      }
    },
    true
  );

  // On-site search (WordPress ?s=, plus ?q= / ?search= / ?query=).
  try {
    var sp = new URL(location.href).searchParams;
    var q = sp.get("s") || sp.get("q") || sp.get("search") || sp.get("query");
    if (q && q.trim()) pushEvent("search", path(), q.trim().slice(0, 120));
  } catch (e) {}

  // Scroll depth.
  function onScroll() {
    var h = document.documentElement;
    var denom = (h.scrollHeight - h.clientHeight) || 1;
    var pct = Math.min(100, Math.round((h.scrollTop || window.pageYOffset || 0) / denom * 100));
    if (pct > maxScroll) maxScroll = pct;
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Initial pageview.
  pushEvent("pageview", path(), null, { title: (document.title || "").slice(0, 120) });

  // ── Flush ─────────────────────────────────────────────────────────────────
  function payload() {
    if (lcpValue) addVital("LCP", lcpValue);
    if (clsValue) addVital("CLS", clsValue);
    if (inpValue) addVital("INP", inpValue);
    lcpValue = clsValue = inpValue = 0;
    if (maxScroll > 0) pushEvent("scroll", path(), maxScroll);

    return {
      t: trackingId,
      session: {
        sessionId: sid,
        visitorId: visitorId,
        isReturning: isReturning,
        entryPath: entryPath,
        referrer: document.referrer ? document.referrer.slice(0, 300) : null,
        source: sourceFromReferrer(),
        device: device(),
      },
      exitPath: path(),
      vitals: vitals.splice(0),
      events: events.splice(0),
    };
  }

  function flush() {
    if (sent || !allowed) return;
    var body = payload();
    if (!body.vitals.length && !body.events.length) return;
    sent = true;
    try {
      var blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      if (navigator.sendBeacon && navigator.sendBeacon(INGEST, blob)) return;
    } catch (e) {}
    try {
      fetch(INGEST, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, keepalive: true });
    } catch (e2) {}
  }

  function onHidden() { if (document.visibilityState === "hidden") flush(); }
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", flush);

  // ── Consent gate ────────────────────────────────────────────────────────
  // Modes: "on" (collect, subject to DNT), "opt-in" (collect only after consent
  // is granted), "opt-out" (collect unless consent is explicitly withdrawn).
  // Consent is read from / written to localStorage key "eoh_consent".
  // Sites can call window.eohSetConsent(true|false) from their cookie banner.
  var CONSENT_KEY = "eoh_consent";

  function consentValue() {
    var v = read("localStorage", CONSENT_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return null; // unset
  }
  function dntOn() {
    try {
      if (navigator.globalPrivacyControl === true) return true;
      var d = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      return d === "1" || d === "yes" || d === 1;
    } catch (e) { return false; }
  }

  function detach() {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", flush);
    sent = true; // ensures no flush happens
  }

  // Public API so a consent banner can grant/revoke at runtime.
  window.eohSetConsent = function (granted) {
    store("localStorage", CONSENT_KEY, granted ? "1" : "0");
  };

  function gate(cfg) {
    if (!cfg || cfg.enabled === false) { detach(); return; }
    if (cfg.respectDnt !== false && dntOn()) { detach(); return; }

    var mode = cfg.consentMode || "on";
    var consent = consentValue();
    if (mode === "opt-in" && consent !== true) { detach(); return; }
    if (mode === "opt-out" && consent === false) { detach(); return; }
    // Collection is permitted — enable flushing and persist the visitor ID now.
    allowed = true;
    store("localStorage", LS, visitorId);
  }

  try {
    fetch(CONFIG, { method: "GET" })
      .then(function (r) { return r.ok ? r.json() : { enabled: false }; })
      .then(gate)
      .catch(function () { detach(); /* network error → fail closed */ });
  } catch (e) { detach(); /* fail closed */ }
})();
