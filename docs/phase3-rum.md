# Phase 3 — Frontend Tracking Script (RUM) — Progress

The structural unlock: a lightweight, consent-gated client script that sends real-user data
to Eye of Horus. Unblocks field Core Web Vitals, click/CTA/outbound/download tracking,
on-site search terms, returning-vs-new visitors, entry/exit pages, journeys, and heatmap data.

Status legend: ✅ done · 🟡 in progress · ⬜ not started

---

## Architecture

```
[ visitor browser ]
   public/eoh-rum.js  (loaded by the site; consent-gated)
        │  batched beacons (sendBeacon / fetch keepalive)
        ▼
   POST /api/rum/ingest        ← public, no auth; identifies site via tracking_id + Origin check
        │  service-role writes
        ▼
   rum_sessions / rum_vitals / rum_events
        │
        ▼
   dashboard UI (Analytics / Performance tabs)  +  reports compiler
```

- **tracking_id** — a *public* per-site id embedded in the script (NOT the secret `api_key`).
  Ingest maps tracking_id → site and validates the request `Origin`/`Referer` against the site URL.
- **Consent** — script only sends after consent (config-driven mode; defaults to on for now,
  full GDPR modes land in Phase 4). IP is never stored; only coarse signals.

---

## Checklist

### Foundation (this phase, app-side)
- ✅ Schema: `rum_sessions`, `rum_vitals`, `rum_events`; `sites.tracking_id` (public, unique) + `sites.rum_enabled` — migration `20260603500000_rum.sql`
- ✅ Apply migration to live
- ✅ Client script `public/eoh-rum.js` — web-vitals (LCP/INP/CLS/FCP/TTFB), session + visitor id (new vs returning), pageview/entry/exit, clicks (CTA/outbound/download), on-site search, rage-click + scroll-depth, batched via `sendBeacon`
- ✅ Ingest endpoint `POST /api/rum/ingest` — tracking_id → site, Origin check, batched insert, service-role
- ✅ Config endpoint `GET /api/rum/config?t=<tracking_id>` — returns `{ enabled, consentMode }`
- ✅ Build + lint clean

### WordPress plugin
- ✅ Plugin v2.4.0 prints `eoh-rum.js` in `wp_footer` with the site's `tracking_id` (cached from the sync response)
- ✅ Enable/disable in the EoH dashboard (`sites.rum_enabled`) is authoritative; plugin honors it via the sync response (`rum` object on `/api/wordpress`)
- ✅ Local opt-out checkbox in plugin settings ("Front-end analytics") + dashboard status line
- ✅ `tracking_id` + embed snippet surfaced in EoH site → Integrations → Real-User Monitoring card (toggle + copy); works for non-WP sites too
- ✅ Plugin zip rebuilt (`wordpress plugin/extracted/eye-of-horus-client.zip`, no __MACOSX cruft)
- ⬜ Framework auto-detect (WP now; design for Webflow/Shopify/custom later)
- ⬜ Event-tracking setup wizard (define CTA selectors, search param, funnels) — currently uses sensible defaults (`data-eoh-cta`, `?s/q/search/query`)

### UI surfacing
- ✅ Server aggregation endpoint `GET /api/rum/summary?siteId&days` (p75 vitals, sessions, events; row-capped at 5000/table for the alpha)
- ✅ Field Core Web Vitals panel (Performance tab) — real-user p75 with good/needs-work/poor ratings, clearly distinguished from the lab/PSI scores; friendly empty/disabled states
- ✅ Visitor-behaviour section (Analytics tab): sessions, returning %, avg scroll depth, rage clicks, top CTAs, on-site search terms, outbound links, downloads, entry/exit pages, devices, traffic sources
- ✅ Broken-journey detection — `lib/rum/analyze.ts` `detectBrokenJourneys()` flags pages where ≥40% of multi-page visits drop off (min 10 drop-offs, 20 multi-page sessions); logs Issues (category "UX journey"); runs in the daily cron
- ✅ Feed field-CWV + RUM traffic into the reports compiler — field LCP p75 drives a Performance recommendation; RUM session count is a traffic-weight fallback when GA is absent
- ✅ Scroll depth by page ("engagement heatmap-lite") — `summary.events.scrollByPage`, rendered as per-page bars in the Analytics behaviour section
- ✅ Spatial click heatmap — script now captures viewport-relative click coords (in event `meta`); `GET /api/rum/heatmap` returns points + the latest Watchtower desktop screenshot; rendered as a dot overlay with a page selector in the Analytics behaviour section. (Viewport-level; full-page screenshots would improve below-the-fold accuracy.)
- ✅ **High-traffic 404** (carried from Phase 1c) — solved via cross-reference, not direct detection: `detectHighTraffic404s()` in `lib/rum/analyze.ts` matches the SEO crawler's internal 4xx links against RUM traffic on those paths (≥5 hits/30d) and logs a high-severity Issue. Runs in the daily cron.

### Phase 4 hooks (later)
- ⬜ Consent modes (opt-in/opt-out), IP anonymisation already inherent, PII redaction at ingest
- ⬜ High-traffic 404 alert (deferred from Phase 1c — needs this RUM data)

---

## Notes / decisions
- 2026-06-03: Started Phase 3. Built the app-side vertical slice (schema → script → ingest →
  config). **Foundation complete & live** — migration `20260603500000_rum.sql` applied; the
  existing site got a unique `tracking_id`. Data can flow end-to-end TODAY by embedding:
  `<script src="https://eye-of-horus-2point0-alpha.vercel.app/eoh-rum.js" data-eoh="<tracking_id>" defer></script>`
  and setting `sites.rum_enabled = true` for that site.
- Tracking id is public by design; security rests on the Origin/Referer check + the fact that
  only aggregate behavioural data is accepted (no writes to other tables).
- INP is approximated as the worst `event`-timing duration (no web-vitals lib, keeps script tiny).
- **Remaining before this is useful in-product:** (1) plugin auto-injects the script + an
  enable/consent toggle; (2) surface `tracking_id` in EoH site settings for manual embed;
  (3) dashboard panels to read the new tables. RUM stays off per-site (`rum_enabled=false`)
  until the plugin/admin enables it, so nothing collects prematurely.
