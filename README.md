# Eye of Horus

**AI-powered website monitoring, QA, reporting, analytics, and strategy platform for agencies managing multiple client websites.**

Eye of Horus watches what changes, prioritises what matters, and helps your team act before small issues become client problems.

---

## What It Does

- Monitors client websites continuously across desktop, tablet, and mobile
- Detects technical, security, UX, SEO, uptime, performance, and WordPress issues
- Runs automated QA checks using Playwright
- Tests forms including A-Forms and other WordPress form plugins
- Generates daily internal issue summaries
- Generates monthly client-facing reports
- Uses AI to read, explain, and answer questions about reports
- Alerts the team by email and WhatsApp when urgent issues occur

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js · TypeScript · Tailwind CSS · App Router |
| Database | Supabase (Postgres + RLS + Auth) |
| QA Automation | Playwright |
| Performance | Lighthouse · Core Web Vitals |
| AI | OpenAI |
| Notifications | Resend (email) · Twilio WhatsApp API |
| Analytics | Google Analytics · Google Search Console · Microsoft Clarity |
| CMS Integration | Custom WordPress plugin |

---

## Getting Started

### 1. Clone the repo

```bash
git clone <repo-url>
cd eye-of-horus-2point0
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in your Supabase URL, Supabase anon key, and other credentials in `.env.local`.

### 4. Run the database migrations

In the Supabase dashboard, run the SQL files in `supabase/migrations/` in order.

The migrations create all required tables and seed sample data for development.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
eye-of-horus-2point0/
├── app/
│   ├── (dashboard)/         # Protected app shell (auth required)
│   │   ├── dashboard/       # Main Command Centre
│   │   ├── sites/[id]/      # Client site detail
│   │   ├── issues/[id]/     # Issue detail
│   │   ├── admin/
│   │   │   └── clients/     # Client management (admin only)
│   │   ├── regression/      # Visual regression viewer
│   │   ├── wp/              # WordPress update queue
│   │   ├── reports/         # Reports hub
│   │   └── settings/        # Monitoring configuration
│   ├── request-access/      # Public access request form
│   ├── api/
│   │   └── wordpress/       # WordPress plugin data endpoint
│   ├── layout.tsx
│   └── page.tsx             # Root → SignIn
├── components/
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   ├── SignIn.tsx
│   └── ui.tsx               # Shared UI primitives
├── context/
│   └── AppContext.tsx        # Auth, data, global state
├── lib/
│   ├── supabase.ts
│   └── auth/
│       └── index.ts          # Auth helpers
├── supabase/
│   └── migrations/           # SQL migrations (run in order)
├── public/
│   ├── horus-logo.png
│   └── horus-mark.png
├── wordpress plugin/         # Eye of Horus Client WP plugin
├── .env.example
├── CLAUDE.md
└── progress.md
```

---

## User Roles

| Role | Access |
|---|---|
| Super Admin | All clients, all settings, user management |
| Admin | Assigned clients, settings, reports, alerts |
| Client | Own reports only (via login or share link) |

There is no public registration. New users submit a **Request Access** form, which notifies admins for approval.

---

## Build Phases

| Phase | Status |
|---|---|
| Phase 1 — Foundation | In progress |
| Phase 2 — Client Monitoring Basics | Not started |
| Phase 3 — WordPress Plugin | Not started |
| Phase 4 — Playwright QA | Not started |
| Phase 5 — Reporting | Not started |
| Phase 6 — Analytics Integrations | Not started |
| Phase 7 — AI Layer | Not started |
| Phase 8 — Alerts | Not started |

See `progress.md` for the detailed handover log.

---

## Environment Variables

See `.env.example` for all required variables and descriptions.
Never commit `.env.local` or any file containing real credentials.

---

## Security

- Supabase Row Level Security (RLS) is enabled on all tables
- Clients cannot access other clients' data
- All API endpoints validate auth, role, and client access
- WordPress plugin requests are authenticated via site API key
- Secrets are stored only in environment variables, never in code
