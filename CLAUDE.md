# CLAUDE.md — Eye of Horus 2.0

AI Website Monitoring, QA, Reporting & Client Intelligence Platform built for Wetpaint.

---

## MANDATORY WORKFLOW

1. Read **this file** first.
2. Read `Eye of Horus 2.0/progress.md` second — continue from the latest unfinished task.
3. Update `progress.md` after every session. Append only — never delete history.
4. Run `npx tsc --noEmit` before finishing any session. Fix all errors before stopping.
5. Run `npm run build` before declaring any feature complete.

---

## REPOSITORY LAYOUT

```
eye-of-horus-2point0/              ← root (you are here)
├── Eye of Horus 2.0/              ← Next.js app — ALL work goes here
│   ├── app/                       ← App Router pages + API routes
│   ├── components/                ← Shared UI (Sidebar, Topbar, SignIn, ui.tsx)
│   ├── context/AppContext.tsx     ← Global state, auth, Supabase data
│   ├── lib/                       ← Business logic (checks, analytics, AI, reports)
│   ├── playwright/                ← Playwright runner (excluded from Next.js build)
│   ├── supabase/migrations/       ← All DB migrations (apply in filename order)
│   ├── docs/                      ← Architecture and spec docs
│   ├── progress.md                ← Session history (append-only)
│   └── CLAUDE.md                  ← App-level detail (read alongside this file)
└── CLAUDE.md                      ← This file
```

**Always work inside `Eye of Horus 2.0/`.** The root-level `components/` and `context/` folders are legacy — do not touch them.

---

## TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript, React 19 |
| Styling | Tailwind CSS v4, custom primitives in `components/ui.tsx` |
| Database | Supabase (PostgreSQL) with RLS on every table |
| Auth | Supabase Auth — `persistSession: true`, `autoRefreshToken: true` |
| Storage | Supabase Storage — private bucket `watchtower-artifacts` |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — Haiku for speed, Sonnet for depth |
| Email | Resend via `lib/reports/email-template.ts` |
| Analytics | Google Analytics 4, Google Search Console, Microsoft Clarity |
| QA | Playwright + pixelmatch (visual regression) |
| Deployment | Vercel — mineshwp account — auto-deploys from GitHub |
| WordPress | Custom plugin `eye-of-horus-client.php` — sends data via REST API |

---

## CURRENT STATE

**Platform is live** at `https://eye-of-horus-2point0-alpha.vercel.app`.

All DB migrations are applied. No demo/seed data remains. The app is fully database-driven.

**Active goal: cleanup and hardening.** Every feature must work end-to-end — UI → API → DB → response. No stubs, no silent failures, no TODO comments left in user-facing code.

---

## CLEANUP RULES (enforced from this session forward)

1. **Every UI element must connect to real data.** Wire it to the DB or remove it.
2. **Every button must do something.** Implement the handler or hide the button.
3. **Every API route must be auth-guarded.** Use `getApiUser()` from `lib/auth/index.ts`. Cron routes use `CRON_SECRET` bearer token.
4. **Every error must be surfaced.** No empty `catch {}`. No silent failures. Show a toast or inline error.
5. **No TypeScript `any`.** Replace with proper types. Verify with `npx tsc --noEmit`.
6. **No `console.log` in production paths.** Use `console.error` for genuine errors only.
7. **No hardcoded IDs, names, or URLs.** Everything from DB or env vars.
8. **RLS on every table.** Server-side API routes use the service role key to bypass RLS intentionally.

---

## ROLES & PERMISSIONS

| Role | Access |
|---|---|
| `super_admin` | Full access to everything |
| `admin` | Full access except super-admin settings |
| `client` | Read-only: approved reports for their company only |

RLS enforces tenant isolation. The `get_my_role()` SECURITY DEFINER function avoids recursion in policies.

---

## DATABASE

**Client-side:** `lib/supabase.ts` — anon key, respects RLS.
**Server-side (API routes):** create a service-role client to bypass RLS.

### All confirmed production tables
`sites`, `issues`, `wp_updates`, `activities`, `profiles`, `clients`, `client_users`, `access_requests`, `uptime_checks`, `checks`, `performance_metrics`, `wordpress_snapshots`, `playwright_checks`, `playwright_baselines`, `form_checks`, `reports`, `report_schedules`, `analytics_snapshots`, `search_console_snapshots`, `clarity_snapshots`, `site_integrations`, `ai_messages`, `notification_logs`, `alert_settings`, `domain_checks`, `global_settings`, `seo_crawls`, `a11y_audits`, `rum_events`, `rum_sessions`, `button_actions`, `business_inputs`

### Adding a migration
1. Create: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Write idempotent SQL (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
3. Apply via Supabase SQL Editor or `supabase db push`
4. Record in `progress.md`

---

## REPORT RULES (non-negotiable)

- Reports are **monthly snapshots of the previous month**. Never live data.
- Status flow: `draft` → `pending_approval` → `approved` (or `rejected` back to `draft`)
- Clients only ever see `approved` reports.
- Share tokens are permanent — approved reports always accessible at `/report/[token]`.

---

## KEY FILES

| File | Purpose |
|---|---|
| `app/(dashboard)/sites/[id]/page.tsx` | Main site detail page — all tabs |
| `context/AppContext.tsx` | Global state: auth, sites, issues, `runScan()`, `apiFetch()` |
| `lib/auth/index.ts` | `getApiUser()`, `apiFetch()`, `unauthorizedResponse()` |
| `lib/supabase.ts` | Supabase anon client |
| `lib/checks/index.ts` | Check orchestrator (HTTP, SSL, SEO, domain) |
| `lib/reports/compiler.ts` | Pulls DB data → builds `ReportContent` |
| `components/ui.tsx` | All shared UI primitives (Badge, KPI, Tabs, Sparkline, etc.) |
| `vercel.json` | Cron schedules + build config |

---

## CRON JOBS

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/uptime` | `*/15 * * * *` | Lightweight HTTP availability checks |
| `/api/cron/daily` | `0 2 * * *` | Full checks: SSL, SEO, domain, PageSpeed, analytics sync |
| `/api/cron/monthly` | `30 0 1 * *` | Auto-generate previous month's reports for all sites |

All cron routes require `Authorization: Bearer <CRON_SECRET>`.

---

## ENVIRONMENT VARIABLES

Set in Vercel → Settings → Environment Variables → Production.

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=               # console.anthropic.com

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=     # Full JSON key stringified as single line
GOOGLE_ANALYTICS_PROPERTY_ID=
GOOGLE_SEARCH_CONSOLE_SITE_URL=

# Microsoft Clarity
CLARITY_API_KEY=

# Email — Resend
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM_ADDRESS=
ALERT_EMAIL_RECIPIENTS=          # Comma-separated

# WhatsApp — Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# App
APP_URL=https://eye-of-horus-2point0-alpha.vercel.app
CRON_SECRET=                     # Strong random string

# GitHub (for Watchtower "Re-scan now" button)
GITHUB_REPO=                     # owner/repo format
GITHUB_TOKEN=                    # PAT with actions:write
```

---

## WORDPRESS PLUGIN

Current version: **v2.3.0** — `wordpress plugin/extracted/eye-of-horus-client/eye-of-horus-client.php`

Authentication: `X-EOH-KEY` header matched against `sites.api_key`.

Data collected per sync: WP/PHP/MySQL versions, all plugins (active/inactive/update available), themes, Wordfence security data, WPForms submission counts per form (total / this month / last month), other detected form plugins, server info (DB size, cron, timezone).

To install on a new client site:
1. Dashboard → Sites → [Site] → Integrations tab → Generate API Key
2. Install the plugin zip on the WordPress site
3. Enter dashboard URL + API key in plugin settings → Save → Sync Now

---

## PLAYWRIGHT / WATCHTOWER

```bash
npm run check:playwright    # runs tsx playwright/runner.ts
```

3 devices per run: desktop (1440px), tablet (768px), mobile (390px iPhone UA).

Storage: private Supabase bucket `watchtower-artifacts`. All URLs are signed (1-year TTL).

Results write to: `playwright_checks`, `playwright_baselines`, `issues`.

GitHub Actions: `.github/workflows/playwright.yml` — needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repo secrets.

---

## COMMON COMMANDS

```bash
cd "Eye of Horus 2.0"

npm run dev               # local dev server
npx tsc --noEmit          # type check — must pass before any commit
npm run build             # production build — must pass before declaring feature done
npm run check:playwright  # run Watchtower checks
vercel --prod             # deploy to production
```

---

## ENGINEERING RULES

- Always TypeScript. No `any`. No implicit types on function params.
- Reusable components. If you write a UI pattern twice, extract it.
- Always add loading states and empty states.
- Never expose secrets to the frontend. API keys stay server-side only.
- RLS on every table. Service role bypasses it server-side — that is intentional.
- Multi-tenant by default. Every query must be scoped to the correct site/client.
- Write idempotent migrations. Never destructive without explicit confirmation.

---

## WHAT NOT TO DO

- Do not add demo or seed data.
- Do not use `alert()` or `confirm()` — use toast or inline error UI.
- Do not add code to root-level `components/` or `context/`.
- Do not commit `.env.local` or any secrets.
- Do not delete entries from `progress.md`.
- Do not use `localStorage` for auth. Use Supabase session only.
- Do not leave `// TODO` comments in user-facing code — either implement or remove.