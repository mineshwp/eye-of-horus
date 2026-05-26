# Eye of Horus — Progress Log

## Latest Update
**2026-05-26 — Production URL corrected, RLS recursion fixed, session persistence added.**

### What was done this session
- **Correct production URL identified:** `https://eye-of-horus-2point0-alpha.vercel.app` (mineshwp personal Vercel account, auto-deploys from GitHub). The `wetpaint` team Vercel project (`eye-of-horus-2point0.vercel.app`) is stale and should be deleted.
- **`APP_URL` must be updated** in the mineshwp Vercel project env vars to `https://eye-of-horus-2point0-alpha.vercel.app`
- **SignIn.tsx** — removed hardcoded demo credentials (mia.patel@wetpaint.co.za / Horus_2026). Fields now start empty.
- **SignIn.tsx** — removed hardcoded client names from preview-tease (Tarsus, Acme, Gentech). Replaced with generic feature description.
- **`supabase/migrations/20260526000000_clear_seed_data.sql`** — run in Supabase SQL Editor to clear demo data ✅
- **`supabase/migrations/20260526100000_fix_rls_recursion.sql`** — fixes infinite recursion in RLS policies. Created `get_my_role()` SECURITY DEFINER function. Run in Supabase SQL Editor.
- **`lib/supabase.ts`** — added `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` to Supabase client config.
- **`app/(dashboard)/admin/clients/page.tsx`** — added `getUser()` session check before client insert to surface session errors clearly.
- **`.npmrc`** — added `playwright_skip_browser_download=1` to prevent Playwright browser download during Vercel build.
- **`vercel.json`** — added `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` env var (belt-and-suspenders alongside .npmrc).
- Super admin profile created in Supabase for minesh@wetpaint.co.za with role=super_admin, status=active.

### Pending
- Run `20260526100000_fix_rls_recursion.sql` in Supabase SQL Editor if not done yet.
- Update `APP_URL` env var in mineshwp Vercel project dashboard to `https://eye-of-horus-2point0-alpha.vercel.app`.
- Delete stale `wetpaint` team Vercel project to avoid confusion.

---

**Previous: 2026-05-26 — Production-ready: all demo seed data cleared, all pages now fully DB-driven.**

### What was done this session
- Created migration `20260526000000_clear_seed_data.sql` — deletes all demo seed data (Acme Finance, Tarsus, Greenfield, etc.) from `sites`, `issues`, `wp_updates`, `clients`, `activities`. User will add their real clients.
- **AppContext** (`context/AppContext.tsx`) — removed all hardcoded "Mia Patel", "mia.patel@wetpaint.co.za", "Director · Wetpaint" references. Now fetches `profiles` table after Supabase auth to get the logged-in user's real name and role. Timestamps use real `toLocaleTimeString()` instead of "Just now".
- **Dashboard** (`app/(dashboard)/dashboard/page.tsx`) — KPI deltas now compute from live data (e.g. critical count, healthy count). Sparklines reduced to current value instead of hardcoded fake history. Subtitle text is data-driven.
- **Issue detail** (`app/(dashboard)/issues/[id]/page.tsx`) — owners list now fetched from `profiles` table. Note attribution uses `currentUser.name`. All `i1`/`i2` hardcoded evidence blocks removed; replaced with generic evidence from `issue.evidence` JSONB field. Suggested fix now uses `issue.recommended` from DB.
- **Reports** (`app/(dashboard)/reports/page.tsx`) — complete rewrite of all tab content. WeeklySummary, PortfolioCards, ClientReady, InternalDev, and Trends tabs all compute from live AppContext data. No hardcoded company names remain.
- **WP updates** (`app/(dashboard)/wp/page.tsx`) — hardcoded history array removed; replaced with live WP-type activities from the activity feed. Recommended order now dynamically sorted by risk and flag from `wp_updates` table.
- **Visual regression** (`app/(dashboard)/regression/page.tsx`) — removed all `selectedSiteId === "acme"` conditionals. Defaults to first real site. Change list shows real visual regression issues from DB. Empty states shown when no baseline or data exists.
- **Settings** (`app/(dashboard)/settings/page.tsx`) — removed "applies to: Acme Finance", hardcoded "18 pages" badge, "Connected · #wetpaint-alerts", "https://hooks.wetpaint.co.za/horus" webhook URL, and "Configured · test user". All replaced with generic/instructional text.
- TypeScript check passes cleanly (0 errors).

---

**Previous: 2026-05-26 — Platform is LIVE. All DB migrations applied. Ready for credentials.**

### What was done this session
- Fixed type mismatch in `supabase/migrations/20260523800000_phase8_alerts.sql` — `notification_logs.issue_id` changed from `uuid` to `text` to match `issues.id TEXT` primary key
- All 10 database migrations confirmed applied successfully (Supabase SQL Editor — "Success. No rows returned")
- App deployed to Vercel: `https://eye-of-horus-2point0.vercel.app`
- Vercel env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_URL`
- Daily email hook activated in `app/api/cron/daily/route.ts` (guarded — only fires when `ALERT_EMAIL_RECIPIENTS` is set)
- Helper scripts created: `scripts/run-migrations.ts`, `scripts/build-idempotent-migrations.ts`
- `.env.local` updated with `CRON_SECRET` and `APP_URL=http://localhost:3000`

### Current database state (confirmed via REST API 2026-05-26)
All 25 tables exist and are returning 200: `sites`, `issues`, `wp_updates`, `activities`, `profiles`, `clients`, `client_users`, `access_requests`, `uptime_checks`, `checks`, `performance_metrics`, `wordpress_snapshots`, `playwright_checks`, `playwright_baselines`, `form_checks`, `reports`, `report_schedules`, `analytics_snapshots`, `search_console_snapshots`, `clarity_snapshots`, `site_integrations`, `ai_messages`, `notification_logs`, `alert_settings`, `domain_checks`

**Previous: 2026-05-23 (audit)** — Full project audit completed. All 8 phases + 3 post-phase enhancements are code-complete (38 routes, build passes). Outstanding items before production go-live documented below. Key gap identified: `GOOGLE_SERVICE_ACCOUNT_JSON` is read by `lib/analytics/google-auth.ts` but was missing from `.env.example` — now added. See "Next Recommended Task" for full deployment checklist.

**Previous: 2026-05-23** — Three post-phase enhancements complete: (1) Domain expiry checks via RDAP — `lib/checks/domain.ts` queries `rdap.org`, strips subdomains (handles `.co.za` etc.), parses expiry from events array, inserts into new `domain_checks` table, deducts from health score (<7d: -25 critical, <30d: -10 high), fires `domain_expiring` alerts. (2) Monthly report auto-generation cron — `app/api/cron/monthly/route.ts` runs on the 1st of each month at 00:30 UTC, calls `compileReport()` directly per site in batches of 3, inserts `reports` rows with `status: 'ready'`, sends completion email to `ALERT_EMAIL_RECIPIENTS`. `vercel.json` created. (3) Client-facing report portal — `app/(portal)/` standalone layout with `portal/login/page.tsx` (Supabase email/password auth, role-gated to `client`) and `portal/reports/page.tsx` (shows assigned client's monthly reports, links to `/report/[token]` for printable view). Build passes cleanly across all 38 routes.

---

## Current Phase
Live — Awaiting Third-Party Credentials

---

## Current Status
**Platform is fully deployed and all database migrations are applied.** The app loads and runs at `https://eye-of-horus-2point0-alpha.vercel.app` (mineshwp Vercel account, auto-deploys from GitHub pushes). Core monitoring, dashboard, site checks, and issue tracking all work. AI, email, and analytics features are built and wired but will return graceful fallbacks until their API keys are added to Vercel.

Routes live (38 total):
- Phases 1–3: Foundation, monitoring, WordPress plugin
- Phase 4: Playwright QA + visual regression
- Phase 5: Reports (daily email + monthly shareable)
- Phase 6: GA4, Search Console, Clarity analytics
- Phase 7: Full AI layer — 9 routes, chat, summaries, SEO briefs, strategy, blog ideas, competitor
- Phase 8: Email + WhatsApp alerts, dedup, recipient management, notification log
- Post-phase: Domain expiry (RDAP), monthly report cron, client portal (login + report list)

---

## Completed Work

### Post-Phase Enhancements ✅
- [x] `lib/checks/domain.ts` — RDAP domain expiry check; strips subdomains (handles `.co.za` etc.); 10s timeout; parses expiry from events array and registrar from vCard; graceful fallback on any error
- [x] `supabase/migrations/20260523900000_domain_checks.sql` — `domain_checks` table with RLS
- [x] `lib/checks/index.ts` — domain check runs in parallel with HTTP/SSL/SEO; `domainCheck` in `SiteCheckResult`; score deductions (<7d: −25 critical, <30d: −10 high); inserts into `domain_checks`
- [x] `lib/notifications/alerts.ts` — `domain_expiring` added to `AlertType`; `fireAlertsForCheckResults` accepts optional `domainCheck`; fires alert when <7 days remaining
- [x] `app/api/cron/daily/route.ts` — passes `domainCheck` through to `fireAlertsForCheckResults`
- [x] `app/api/cron/monthly/route.ts` — generates previous month's report for all sites in batches of 3; calls `compileReport()` directly; inserts `reports` rows with `status: 'ready'`; sends completion email to `ALERT_EMAIL_RECIPIENTS`; GET health check handler
- [x] `vercel.json` — daily cron `0 2 * * *`, monthly cron `30 0 1 * *`
- [x] `.env.example` — added `ALERT_EMAIL_RECIPIENTS=` (comma-separated)
- [x] `app/(portal)/layout.tsx` — standalone portal layout (no sidebar/topbar); Eye of Horus wordmark header
- [x] `app/(portal)/portal/login/page.tsx` — client portal login; Supabase `signInWithPassword`; role-gates to `client` only; redirects to `/portal/reports`
- [x] `app/(portal)/portal/reports/page.tsx` — auth-gated report list; fetches `client_users` → `reports` → `sites`; links each report to `/report/[share_token]`; sign-out button
- [x] Build passes cleanly across all 38 routes

### Phase 8 — Alerts ✅
- [x] DB migration — `notification_logs` + `alert_settings` singleton tables + RLS (`supabase/migrations/20260523800000_phase8_alerts.sql`)
- [x] `lib/notifications/whatsapp.ts` — Twilio WhatsApp REST API sender; `sendWhatsApp(to, body)`; `buildWhatsAppAlertMessage()` formatter; console fallback when credentials absent
- [x] `lib/notifications/alerts.ts` — Full alert orchestrator: `getAlertSettings()`, `updateAlertSettings()`, `sendAlert()` (dedup + email + WhatsApp + logging), `fireAlertsForCheckResults()` (evaluates site-down / SSL-critical / critical-issue triggers for batch check results)
- [x] `app/api/alerts/send/route.ts` — POST: manual alert trigger (siteId, alertType, issueTitle, severity)
- [x] `app/api/alerts/logs/route.ts` — GET: paginated notification log (filter by siteId, default limit 50)
- [x] `app/api/alerts/settings/route.ts` — GET: read alert settings; POST: update recipients, toggles, dedup window
- [x] `app/api/cron/daily/route.ts` — Wired `fireAlertsForCheckResults()` after site checks; alert counts in response summary
- [x] `app/(dashboard)/settings/page.tsx` — Alert Recipients card: add/remove email recipients, add/remove WhatsApp numbers, toggle email/WhatsApp channels, toggle alert types (site down, SSL critical, critical issues), test alert button, notification log viewer (`AlertLogCard`)
- [x] Build passes cleanly across all 34 routes

### Phase 7 — AI Layer ✅
- [x] `lib/ai/claude.ts` — Anthropic SDK client; `ai()` helper with fast/strategic model selection; `isAIConfigured()` guard
- [x] `app/api/ai/summary/route.ts` — POST: site health summary using Haiku; stored in `ai_messages`
- [x] `app/api/ai/chat/route.ts` — POST: multi-turn "Ask Horus" chat with site context (issues, uptime, WP); stored in `ai_messages`
- [x] `app/api/ai/issue/route.ts` — POST: deep issue analysis with fix guidance; stored in `ai_messages`
- [x] `app/api/ai/seo-brief/route.ts` — POST: keyword content brief from striking-distance GSC data; stored in `ai_messages`
- [x] `app/api/ai/competitor/route.ts` — POST: competitor positioning/SEO/UX analysis using Sonnet; stored in `ai_messages`
- [x] `app/api/ai/marketing-strategy/route.ts` — POST: 3-section strategy (quick wins, growth, risks) from real GA4/GSC data; uses Sonnet
- [x] `app/api/ai/blog-ideas/route.ts` — POST: 4 data-driven blog ideas from striking-distance keywords + top pages; uses Sonnet
- [x] Site detail page — Overview: AI summary callout + "Refresh summary" button + "Ask Horus" chat panel
- [x] Site detail page — SEO tab: "SEO Brief" button per striking-distance keyword; modal shows AI-generated 3-point content brief
- [x] Site detail page — Marketing tab: AI Strategy panel + Blog Ideas generator + Competitor Analysis input (all wired to live API)
- [x] Issue detail page — AI analysis auto-fetched on load from `/api/ai/issue`
- [x] Removed hardcoded fake campaign data from MarketingTab (CampaignRow, MarketingAlert components deleted)
- [x] Build passes cleanly across all 28 routes

### Phase 6 — Analytics Integrations ✅
- [x] DB migration — `analytics_snapshots`, `search_console_snapshots`, `clarity_snapshots`, `site_integrations` tables (`supabase/migrations/20260523600000_phase6_analytics.sql`)
- [x] `lib/analytics/google-auth.ts` — service account JWT auth using Node.js `crypto` (no extra packages)
- [x] `lib/analytics/google-analytics.ts` — GA4 Data API: sessions, users, engagement, top pages, channels, devices, countries, previous-period comparison
- [x] `lib/analytics/search-console.ts` — GSC: clicks, impressions, CTR, position; top queries/pages; striking-distance keywords (pos 11-20)
- [x] `lib/analytics/clarity.ts` — Clarity REST API: rage clicks, dead clicks, quick backs, excessive scrolls, JS errors, scroll depth
- [x] `app/api/analytics/refresh/route.ts` — POST: fetches all three sources and upserts snapshots
- [x] `app/api/analytics/snapshot/route.ts` — GET: returns latest snapshots for a site
- [x] `app/api/analytics/integrations/route.ts` — GET/POST: read and update per-site integration config
- [x] Site detail Analytics tab — real GA4 metrics grid, channel breakdown, device split, top pages, previous-period deltas; connection banner when not configured
- [x] Site detail SEO tab — real GSC metrics, top queries, top pages, keyword position shifts, striking-distance section with AI brief buttons
- [x] Site detail Marketing tab — real Clarity UX signals when connected; connection banner when not
- [x] Build passes cleanly across all 26 routes

### Phase 5 — Reporting ✅
- [x] DB migration — `reports` and `report_schedules` tables + RLS policies (`supabase/migrations/20260523500000_phase5_reports.sql`)
- [x] `lib/reports/types.ts` — `ReportContent`, `Report`, and sub-type interfaces
- [x] `lib/reports/compiler.ts` — pulls live data from Supabase (site info, issues, uptime checks, WP snapshots, Playwright checks, form checks), calculates scores, generates recommendations
- [x] `lib/reports/email-template.ts` — HTML + plain-text daily email builder; `sendEmail()` using Resend API (console fallback when key absent)
- [x] `app/api/reports/generate/route.ts` — POST: inserts a report row, compiles content, builds executive summary, updates to `ready`; returns `shareToken` + `shareUrl`
- [x] `app/api/reports/list/route.ts` — GET: returns paginated report list filtered by `siteId` or `clientId`
- [x] `app/api/reports/share/[token]/route.ts` — GET: public endpoint returns full report by share token (no auth required)
- [x] `app/api/reports/email-daily/route.ts` — POST: compiles reports for all sites in batches of 5, builds email, sends via `sendEmail()`; protected by `CRON_SECRET`
- [x] `app/report/[token]/layout.tsx` — standalone HTML/body layout for public report pages; includes print CSS, metric grid styles, severity badge styles
- [x] `app/report/[token]/PrintButton.tsx` — client component for `window.print()` (server component boundary)
- [x] `app/report/[token]/page.tsx` — server component; fetches report by token, renders executive summary, health metrics, issues, WordPress status, QA checks, recommendations, footer; print-safe
- [x] `app/(dashboard)/reports/page.tsx` — added "Generated" tab, `GeneratedReports` component, `handleGenerateReport` wired to API, `fetchReports` on mount; all existing tab content preserved unchanged
- [x] `app/api/cron/daily/route.ts` — added commented Phase 5 hook to trigger daily email after site checks
- [x] Build passes cleanly across all 22 routes (zero TypeScript errors)

### Phase 4 — Playwright QA ✅
- [x] DB migration — `playwright_checks`, `playwright_baselines`, `form_checks` tables + RLS policies (`supabase/migrations/20260523400000_phase4_playwright.sql`)
- [x] `playwright/devices.ts` — device config (desktop 1440×900, tablet 768×1024, mobile 390×844 iPhone UA)
- [x] `playwright/checks/visual-regression.ts` — pixelmatch diff, crops to min dimensions, saves diff PNG, returns `DiffResult`
- [x] `playwright/checks/site-check.ts` — full single-site/single-device check: HTTP status, load time, page title, meta description, noindex, H1, navigation, console errors, network errors, forms detection, screenshot, baseline set/compare
- [x] `playwright/runner.ts` — fetches all sites from Supabase, checks each on 3 devices (2 in parallel), writes `playwright_checks`, creates deduplicated `issues`, logs `form_checks`
- [x] `app/api/playwright/checks/route.ts` — GET endpoint; returns check history + baselines for a site
- [x] `app/api/playwright/baseline/route.ts` — POST endpoint; copies screenshot to baseline slot on filesystem + upserts `playwright_baselines`
- [x] `package.json` — added `playwright`, `pixelmatch`, `pngjs`, `dotenv` as devDependencies; added `tsx`; added `check:playwright` script
- [x] `tsconfig.json` — excluded `playwright/` and `wordpress plugin/` directories so Next.js build doesn't require Playwright packages to be installed
- [x] `.gitignore` — added `public/playwright-data/` to prevent screenshots from being committed
- [x] Site detail History tab — device switcher, screenshot + baseline/diff side-by-side, QA signals grid, errors panel, check history feed, "Set as baseline" button
- [x] Build passes cleanly across all 18 routes

### Phase 1 — Foundation ✅
- [x] Next.js 16 app with TypeScript, Tailwind CSS, App Router
- [x] Supabase client setup (`lib/supabase.ts`)
- [x] Auth layout with Supabase + localStorage fallback (development-friendly)
- [x] Sign In page with design-matched layout (`components/SignIn.tsx`)
- [x] Request Access page (`app/request-access/page.tsx`) — public form, stores in `access_requests` table
- [x] Dashboard layout with Sidebar + Topbar (`app/(dashboard)/layout.tsx`)
- [x] Command Centre dashboard (`app/(dashboard)/dashboard/page.tsx`)
- [x] Site detail page with tabs (`app/(dashboard)/sites/[id]/page.tsx`)
- [x] Issue detail page (`app/(dashboard)/issues/[id]/page.tsx`)
- [x] Visual Regression page (`app/(dashboard)/regression/page.tsx`)
- [x] WP Updates queue page (`app/(dashboard)/wp/page.tsx`)
- [x] Reports hub page (`app/(dashboard)/reports/page.tsx`)
- [x] Monitoring settings page (`app/(dashboard)/settings/page.tsx`)
- [x] Admin Clients management page (`app/(dashboard)/admin/clients/page.tsx`)
- [x] Shared UI primitives — Icon, Badge, SeverityChip, StatusChip, ScoreBar, Sparkline, KPI, Tabs, Favicon, HorusGlyph (`components/ui.tsx`)
- [x] AppContext — global state, auth, data fetching from Supabase (`context/AppContext.tsx`)
- [x] Auth helpers (`lib/auth/index.ts`)
- [x] WordPress API placeholder endpoint (`app/api/wordpress/route.ts`)
- [x] `.env.example`, `README.md`, `progress.md`
- [x] Design tokens matched to approved Claude Design reference (`app/globals.css`)
- [x] DB migrations: `sites`, `issues`, `wp_updates`, `activities`, `profiles`, `clients`, `client_users`, `access_requests` tables

### Phase 3 — WordPress Plugin ✅
- [x] DB migration — `wordpress_snapshots` table + `api_key` column on `sites` + index (`supabase/migrations/20260523300000_phase3_wordpress.sql`)
- [x] API key generation endpoint — `POST /api/sites/[id]/key` generates `eoh_` prefixed key, `GET` returns masked key (`app/api/sites/[id]/key/route.ts`)
- [x] `/api/wordpress` fully wired — reads `X-EOH-KEY` header, looks up site by `api_key`, inserts into `wordpress_snapshots`, updates `last_scan` (`app/api/wordpress/route.ts`)
- [x] WordPress plugin v2.0.0 — collects: WP/PHP/MySQL versions, theme (active + parent + update), all plugins (active/inactive/updates), security (debug mode, admin count, security plugin, error log), forms (A-Forms, WPForms, CF7, Gravity Forms, Ninja Forms, Elementor), server (DB size, cron status, timezone)
- [x] Plugin: test connection AJAX handler (`ajax_test_connection`)
- [x] Plugin: data module toggles in settings UI (enable/disable each collection type)
- [x] Plugin: debug mode logs payloads to WP debug log
- [x] Plugin: tracks form submissions from 6 form plugins via WP action hooks
- [x] Plugin admin JS updated — handles both Sync Now and Test Connection buttons with colour-coded feedback
- [x] Site detail WordPress tab — connection status, API endpoint display, key generation/rotation, core versions, server info, security panel, full plugin list with update badges, detected forms, pending update queue
- [x] Build passes cleanly across all 15 routes

### Phase 2 — Client Monitoring Basics ✅
- [x] DB migration — `uptime_checks`, `checks`, `performance_metrics` tables + RLS + data retention function (`supabase/migrations/20260523200000_phase2_monitoring.sql`)
- [x] HTTP check library — measures response time, HTTP status, redirect detection, 15s timeout (`lib/checks/http.ts`)
- [x] SSL certificate check — Node.js `tls.connect`, reads cert expiry, issuer, days remaining (`lib/checks/ssl.ts`)
- [x] SEO check — fetches up to 200KB of HTML, checks title, meta description, noindex, H1, canonical (`lib/checks/seo.ts`)
- [x] Check orchestrator — runs all three checks concurrently, calculates health score, creates Supabase issues for serious findings, updates site health, logs activity (`lib/checks/index.ts`)
- [x] `/api/checks/run` — POST endpoint for manual or full-scan checks; accepts `{ siteId }` or `{ runAll: true }` (`app/api/checks/run/route.ts`)
- [x] `/api/cron/daily` — Protected cron endpoint; validates `CRON_SECRET`; ready for Vercel Cron, Supabase pg_cron, or external scheduler (`app/api/cron/daily/route.ts`)
- [x] `AppContext.runScan` updated — calls `/api/checks/run` first; falls back to simulation if API unavailable; accepts optional `siteId`
- [x] Site detail page — fetches real `uptime_checks` from Supabase; shows coloured uptime history bar; shows live SSL status; "Re-scan now" triggers real check + refreshes history
- [x] Dashboard "Run full scan" and Topbar refresh icon — use safe `() => runScan()` wrappers (fixes MouseEvent type clash)

---

## Files Created

### Phase 1
- `app/page.tsx`, `app/layout.tsx`, `app/request-access/page.tsx`
- `app/(dashboard)/layout.tsx`, `dashboard/page.tsx`, `sites/[id]/page.tsx`, `issues/[id]/page.tsx`
- `app/(dashboard)/regression/page.tsx`, `wp/page.tsx`, `reports/page.tsx`, `settings/page.tsx`
- `app/(dashboard)/admin/clients/page.tsx`
- `app/api/wordpress/route.ts`
- `components/SignIn.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `ui.tsx`
- `context/AppContext.tsx`
- `lib/supabase.ts`, `lib/auth/index.ts`
- `supabase/migrations/20260522000000_init_schema.sql`
- `supabase/migrations/20260523000000_phase1_extended.sql`
- `.env.example`, `README.md`, `CLAUDE.md`, `progress.md`

### Phase 2
- `lib/checks/http.ts` — HTTP check (fetch, response time, status code)
- `lib/checks/ssl.ts` — SSL check (Node.js tls module, cert expiry)
- `lib/checks/seo.ts` — SEO check (HTML parse, title/desc/noindex/H1)
- `lib/checks/index.ts` — Orchestrator (runs all checks, writes to DB, creates issues)
- `app/api/checks/run/route.ts` — Manual check API endpoint
- `app/api/cron/daily/route.ts` — Daily cron endpoint
- `supabase/migrations/20260523200000_phase2_monitoring.sql`

### Phase 3
- `supabase/migrations/20260523300000_phase3_wordpress.sql` — `wordpress_snapshots` table + `api_key` column on `sites`
- `app/api/sites/[id]/key/route.ts` — API key generation (POST) and status check (GET)
- `app/api/wordpress/route.ts` — Updated to use `X-EOH-KEY`, persist to `wordpress_snapshots`
- `wordpress plugin/extracted/eye-of-horus-client/eye-of-horus-client.php` — v2.0.0 expanded plugin
- `wordpress plugin/extracted/eye-of-horus-client/assets/js/admin.js` — Sync + Test Connection handlers

### Phase 4
- `supabase/migrations/20260523400000_phase4_playwright.sql` — `playwright_checks`, `playwright_baselines`, `form_checks`
- `playwright/devices.ts` — device config constants
- `playwright/checks/visual-regression.ts` — pixelmatch screenshot diff
- `playwright/checks/site-check.ts` — single-site QA check orchestrator
- `playwright/runner.ts` — CLI runner (tsx playwright/runner.ts)
- `app/api/playwright/checks/route.ts` — GET check history
- `app/api/playwright/baseline/route.ts` — POST approve baseline

### Phase 5
- `supabase/migrations/20260523500000_phase5_reports.sql`
- `lib/reports/types.ts`
- `lib/reports/compiler.ts`
- `lib/reports/email-template.ts`
- `app/api/reports/generate/route.ts`
- `app/api/reports/list/route.ts`
- `app/api/reports/share/[token]/route.ts`
- `app/api/reports/email-daily/route.ts`
- `app/report/[token]/layout.tsx`
- `app/report/[token]/PrintButton.tsx`
- `app/report/[token]/page.tsx`

---

## Files Modified

### Phase 1
- `README.md` — replaced default Next.js content
- `components/SignIn.tsx` — wired "Request access" to `/request-access`
- `components/Sidebar.tsx` — added Admin section with Clients link

### Phase 2
- `context/AppContext.tsx` — `runScan` now calls `/api/checks/run`; simulation fallback; accepts optional `siteId`
- `app/(dashboard)/sites/[id]/page.tsx` — live uptime history bar from `uptime_checks` table; real SSL badge from latest check; `runScan(site.id)` on Re-scan button
- `app/(dashboard)/dashboard/page.tsx` — `onClick={() => runScan()}` wrapper fix
- `components/Topbar.tsx` — `onClick={() => runScan()}` wrapper fix

### Phase 3
- `app/(dashboard)/sites/[id]/page.tsx` — WordPress tab: live snapshot display, API key generation UI, plugin list, security panel, forms, server info

### Phase 4
- `app/(dashboard)/sites/[id]/page.tsx` — History tab wired with `HistoryTab` component; catch-all placeholder updated to exclude "History"
- `tsconfig.json` — excluded `playwright/` and `wordpress plugin/` from Next.js TS check
- `package.json` — added playwright/pixelmatch/pngjs/dotenv/tsx; added `check:playwright` script
- `.gitignore` — added `public/playwright-data/`

### Phase 5
- `app/(dashboard)/reports/page.tsx` — added "Generated" tab, GeneratedReports component, real generate/fetch wiring
- `app/api/cron/daily/route.ts` — added commented Phase 5 daily email hook

---

## Important Decisions

- **Auth strategy:** Supabase Auth primary; localStorage mock fallback for dev.
- **Sites vs Clients:** `sites` table = monitoring data. `clients` table = business entities. Separate by design.
- **Check execution:** Checks run server-side in Next.js API routes (Node.js runtime). The `tls` module is available because routes use Node.js, not Edge.
- **Concurrency:** All three checks for a site run in parallel (`Promise.all`). Multiple sites batch 3 at a time to avoid hammering servers.
- **Issue deduplication:** Before creating a new auto-generated issue, the orchestrator checks if an open issue with the same `category` and `site_id` already exists. Avoids flooding the issues table on repeated checks.
- **Scoring:** Base 100. Site down: −50. HTTP 4xx: −25. Response > 5s: −15. Response > 3s: −8. SSL invalid: −30. SSL < 7 days: −20. SSL < 30 days: −10. Noindex: −15. No title: −5.
- **RLS on monitoring tables:** `uptime_checks`, `checks`, `performance_metrics` require `auth.uid() IS NOT NULL`. Service role (used in API routes) always bypasses RLS.
- **Simulation fallback:** If Supabase is not configured or the check API fails, `runScan` falls back to a score simulation so the UI stays functional during development.
- **WordPress API endpoint:** Still placeholder — will be wired to `wordpress_snapshots` table in Phase 3 migration.

---

## Environment Variables Required

```env
# ─── Supabase (required to run at all) ──────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase project → Settings → API
SUPABASE_SERVICE_ROLE_KEY=        # Supabase project → Settings → API — used by check orchestrator to bypass RLS

# ─── Anthropic (required for AI layer — Phase 7) ────────────────────────────
ANTHROPIC_API_KEY=                # console.anthropic.com

# ─── OpenAI (referenced in env — confirm if needed alongside Anthropic) ─────
OPENAI_API_KEY=                   # platform.openai.com

# ─── Google (required for analytics — Phase 6) ──────────────────────────────
GOOGLE_SERVICE_ACCOUNT_JSON=      # GCP → IAM → Service Accounts → JSON key (stringified, single line)
GOOGLE_CLIENT_ID=                 # GCP → OAuth 2.0 credentials
GOOGLE_CLIENT_SECRET=             # GCP → OAuth 2.0 credentials
GOOGLE_ANALYTICS_PROPERTY_ID=    # GA4 → Admin → Property Settings
GOOGLE_SEARCH_CONSOLE_SITE_URL=  # Exact verified URL in Search Console

# ─── Microsoft Clarity (Phase 6) ────────────────────────────────────────────
CLARITY_API_KEY=                  # clarity.microsoft.com → Settings → API

# ─── Email — Resend (Phase 5 + 8) ───────────────────────────────────────────
EMAIL_PROVIDER_API_KEY=           # resend.com → API Keys
EMAIL_FROM_ADDRESS=               # A verified sending domain in Resend
ALERT_EMAIL_RECIPIENTS=           # Comma-separated team email addresses

# ─── WhatsApp — Twilio (Phase 8) ────────────────────────────────────────────
TWILIO_ACCOUNT_SID=               # console.twilio.com
TWILIO_AUTH_TOKEN=                # console.twilio.com
TWILIO_WHATSAPP_FROM=             # Twilio WhatsApp sandbox or approved sender number

# ─── App ────────────────────────────────────────────────────────────────────
APP_URL=                          # Production domain e.g. https://eye-of-horus.vercel.app
CRON_SECRET=                      # Any strong random string — protects /api/cron/daily and /api/cron/monthly

# ─── WordPress Plugin ───────────────────────────────────────────────────────
WORDPRESS_PLUGIN_SECRET=          # Any strong random string
```

**Note:** `GOOGLE_SERVICE_ACCOUNT_JSON` was missing from `.env.example` and has been added. The code in `lib/analytics/google-auth.ts` reads this variable directly. It should be the full service account JSON file contents as a single-line string.

---

## Database / Migration Notes

Run these in Supabase SQL Editor **in order**:

1. `20260522000000_init_schema.sql` — `sites`, `issues`, `wp_updates`, `activities` + seed data
2. `20260523000000_phase1_extended.sql` — `profiles`, `clients`, `client_users`, `access_requests` + seed clients
3. `20260523200000_phase2_monitoring.sql` — `uptime_checks`, `checks`, `performance_metrics` + data retention function

**Cron scheduling** — once Supabase is configured, add to `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/daily", "schedule": "0 2 * * *" }]
}
```
Vercel sends `CRON_SECRET` automatically in the Authorization header.

Future Phase migrations will add:
- `wordpress_snapshots` (Phase 3)
- `form_checks` (Phase 4)
- `reports`, `analytics_snapshots`, `search_console_snapshots`, `clarity_snapshots` (Phase 5/6)
- `ai_messages`, `notification_logs` (Phase 7/8)

---

## API Routes Built

| Route | Method | Purpose |
|---|---|---|
| `GET /api/checks/run` | GET | Health check |
| `POST /api/checks/run` | POST | Run check for one site (`siteId`) or all sites (`runAll: true`) |
| `GET /api/cron/daily` | GET | Health check (requires CRON_SECRET) |
| `POST /api/cron/daily` | POST | Run all site checks — for schedulers |
| `GET /api/wordpress` | GET | Health check |
| `POST /api/wordpress` | POST | WordPress plugin data receiver (Phase 3 placeholder) |

---

## Commands Run
- `npm install` — dependencies installed
- `npm run build` — ✅ passes across all 38 routes
- `vercel --prod` — ✅ deployed 2026-05-26
- `npx tsx scripts/build-idempotent-migrations.ts` — generates idempotent combined SQL
- All 10 DB migrations applied manually via Supabase SQL Editor ✅

---

## Tests Run
- `npm run build` passes cleanly across all 38 routes.
- Playwright runner not yet executed against production — requires `npx playwright install chromium` then `npm run check:playwright`.

---

## Known Issues / Blockers

- **First super_admin user not yet created.** After signing up via the login page, go to Supabase Dashboard → Table Editor → `profiles` → set `role = 'super_admin'` for your user row.
- **No third-party API keys set yet.** AI, email, and analytics features return graceful fallbacks until keys are added (see Next Recommended Task below).
- **Domain expiry UI panel not built.** The `domain_checks` table is populated by the check runner but no UI card exists yet on the Site Detail page to display days remaining / registrar / expiry date.
- **Playwright form submission testing not implemented.** The runner detects forms on pages but does not yet fill and submit test data.

---

## Next Recommended Task

### Add Remaining API Keys to Vercel (then redeploy)

All keys go in: Vercel Dashboard → eye-of-horus-2point0 → Settings → Environment Variables → Production.
After adding all keys, trigger a redeploy: `vercel --prod` from the project directory.

#### 1. Anthropic (AI features)
- `ANTHROPIC_API_KEY` — from console.anthropic.com → API Keys

#### 2. Email — Resend
- `EMAIL_PROVIDER_API_KEY` — from resend.com → API Keys
- `EMAIL_FROM_ADDRESS` — a verified sending address e.g. `alerts@wetpaint.co.za`
- `ALERT_EMAIL_RECIPIENTS` — comma-separated list e.g. `minesh@wetpaint.co.za,team@wetpaint.co.za`

#### 3. Google Analytics + Search Console
Steps to get `GOOGLE_SERVICE_ACCOUNT_JSON`:
1. console.cloud.google.com → Create/select project
2. APIs & Services → Library → enable **Google Analytics Data API** and **Google Search Console API**
3. IAM & Admin → Service Accounts → Create → name it `eye-of-horus-analytics` → download JSON key
4. Stringify: `cat key.json | jq -c .` and paste as `GOOGLE_SERVICE_ACCOUNT_JSON`
5. In GA4: Admin → Account Access Management → add service account email as Viewer
6. In Search Console: Settings → Users → add service account email as Restricted

Also set:
- `GOOGLE_ANALYTICS_PROPERTY_ID` — GA4 Admin → Property Settings → Property ID (a number)
- `GOOGLE_SEARCH_CONSOLE_SITE_URL` — exact verified URL e.g. `https://wetpaint.co.za/`

#### 4. Create first super_admin user
- Visit `https://eye-of-horus-2point0.vercel.app` → sign up
- In Supabase: Table Editor → `profiles` → set `role = 'super_admin'` for your user

#### 5. Optional — WhatsApp alerts
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — from console.twilio.com

#### 6. Optional — Microsoft Clarity
- `CLARITY_API_KEY` — clarity.microsoft.com → Settings → API

#### 7. WordPress Plugin (for each client site)
- Install plugin from `wordpress plugin/extracted/eye-of-horus-client/`
- In dashboard: Sites → [Site] → WordPress tab → Generate Key
- Enter dashboard URL + API key in plugin settings on the WordPress site

#### 8. Playwright QA (run locally when ready)
```bash
npx playwright install chromium
npm run check:playwright
```

#### 9. Two remaining UI features to build
- Domain expiry panel on Site Detail page (table exists, no card yet)
- Playwright form fill + submit testing (detection works, submission not implemented)
