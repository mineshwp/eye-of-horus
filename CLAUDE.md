# CLAUDE.md

# EYE OF HORUS
AI Website Monitoring, QA, Reporting & Client Intelligence Platform

---

# PROJECT OVERVIEW

Eye of Horus is an AI-powered website monitoring and reporting platform built for Wetpaint.

The system monitors client websites, tracks issues, runs automated visual and form testing, analyses analytics and UX data, monitors WordPress security and updates, and generates monthly AI-assisted reports for clients.

The platform combines:

- Technical monitoring
- WordPress intelligence
- UX monitoring
- AI-generated reporting
- Visual regression testing
- Security monitoring
- Client portals
- Automated QA workflows

The platform must feel premium, futuristic, intelligent and operationally efficient.

---

# CORE STACK

Frontend:
- Next.js
- TypeScript
- Tailwind
- shadcn/ui

Backend:
- Supabase
- PostgreSQL
- Supabase Storage
- Supabase Auth

Automation:
- GitHub Actions
- Playwright

AI:
- OpenAI API

Email:
- Resend

WordPress Integration:
- Custom Eye of Horus WordPress plugin

---

# PRIMARY OBJECTIVE

Create a centralised system where Wetpaint can:

- Monitor all client websites
- Detect technical issues
- Detect WordPress update issues
- Monitor forms
- Monitor UX behaviour
- Run automated Playwright checks
- Generate monthly reports
- Give clients portal access to approved reports

The system should reduce manual QA and reporting work while improving oversight and proactive support.

---

# IMPORTANT PROJECT RULES

## 1. REPORTS ARE SNAPSHOTS

Reports must NEVER show live data.

Reports always represent the previous completed month.

Example:
- Current date: May 2026
- Report shown to client: April 2026

Reports are historical snapshots.

---

## 2. CLIENTS ARE READ-ONLY

Clients can:
- View reports
- Print reports
- Download PDFs
- View historical reports

Clients cannot:
- Edit reports
- View live data
- Trigger scans
- Update plugins
- Access admin tools

---

## 3. WETPAINT ADMINS CONTROL EVERYTHING

Wetpaint Admins and Super Admins can:
- Edit reports
- Approve reports
- Trigger scans
- Update WordPress plugins
- Configure Playwright tests
- Invite clients
- Manage client access

---

## 4. WORDPRESS UPDATES MUST BECOME ISSUES

Any detected WordPress update:
- Plugin
- Theme
- Core update

must create an issue in:
- Dashboard Open Issues
- Issues tab
- WordPress tab

---

## 5. PLAYWRIGHT RUNS PER CLIENT

Playwright checks are NOT global.

Each client website:
- Has its own tests
- Has its own screenshots
- Has its own logs
- Has its own history
- Has its own Watchtower Checks tab

---

# UI SECTIONS

## Dashboard
Overview of:
- Open issues
- Security warnings
- WordPress updates
- Form failures
- Watchtower failures
- Analytics summary
- UX alerts

---

## Analytics
Contains:
- Google Analytics data
- Traffic data
- User journeys
- Microsoft Clarity UX Signals
- Heatmaps
- Scroll depth
- Rage clicks
- Dead clicks
- Engagement insights

Microsoft Clarity MUST live under Analytics.

---

## WordPress
Contains:
- Plugin updates
- Theme updates
- Core updates
- Installed plugins
- Version comparisons
- Update buttons
- WordPress health

Admins can manually update plugins from this screen.

---

## Security
Security data comes from Wordfence through the custom WordPress plugin.

Display:
- Firewall status
- Scan status
- Malware alerts
- Attack attempts
- Vulnerabilities
- Security warnings

---

## Forms
WPForms integration only for initial release.

Display:
- Total submissions
- Abandonment data
- Form conversion data
- Field-level analytics
- Multiple-choice statistics

Example:

Province:
- Gauteng — 22
- Western Cape — 14

---

## Watchtower Checks
Previously called History.

This section contains:
- Playwright results
- Visual regression history
- Form testing results
- Screenshot comparisons
- Logs
- Failed checks
- Historical runs

---

# WORDPRESS PLUGIN REQUIREMENTS

The custom WordPress plugin acts as the bridge between WordPress and Eye of Horus.

The plugin must:
- Authenticate securely
- Send site data to the app
- Fetch WordPress updates
- Read Wordfence data
- Read WPForms data
- Trigger plugin updates securely
- Return site health data

The plugin should expose secure REST API endpoints.

Never expose sensitive WordPress credentials publicly.

---

# PLAYWRIGHT SYSTEM

Playwright is a core system.

Purpose:
- Detect visual changes
- Detect broken layouts
- Test forms
- Capture screenshots
- Detect regressions

---

# PLAYWRIGHT SETTINGS

Each client can configure:
- Pages to test
- Forms to test
- CSS selectors/classes
- Enabled checks
- Visual testing
- Form testing

---

# PLAYWRIGHT AUTOMATION

GitHub Actions must:
- Run scheduled tests
- Support manual triggers
- Install Playwright
- Run tests
- Upload screenshots/logs to Supabase

Workflow file:

text .github/workflows/playwright.yml 

---

# SUPABASE STORAGE STRUCTURE

Use ONE private storage bucket.

Bucket name example:

text watchtower-artifacts 

Folder structure:

text /client-id/   /yyyy-mm/     /run-id/       screenshots/       diffs/       logs/       reports/ 

Example:

text /sadv/2026-05/run_001/screenshots/homepage.png 

This structure is important for:
- History
- Auditing
- Monthly reporting
- Visual comparisons

---

# REPORTING SYSTEM

Reports are monthly.

Reports require approval before client access.

Status flow:
- Draft
- Pending Approval
- Approved

Only approved reports:
- Appear in client portal
- Can be emailed
- Can generate PDFs

---

# AI REPORTING

Use OpenAI to generate:
- Intro copy
- Plain-English summaries
- Performance analysis
- Recommendations
- Status explanations

Admins can edit AI-generated copy before approval.

---

# EMAIL SYSTEM

Use Resend for:
- Client invites
- Report emails
- Approval emails
- Notifications

Keep API keys server-side only.

---

# CLIENT PORTAL

Clients can:
- Register
- Login
- View approved reports
- Download PDFs
- Print reports
- View historical reports

Clients only see their own company data.

---

# REPORT LINKS

Public report links:
- Remain active
- Always show latest approved previous-month report

Logged-in users can access full report history.

---

# DEVELOPMENT STAGES

# STAGE 1 — STRUCTURE & UI FIXES
Tasks:
- Move Clarity into Analytics
- Rename History to Watchtower Checks
- Improve dashboard issue visibility

---

# STAGE 2 — WORDPRESS UPDATE ISSUES
Tasks:
- Detect updates
- Create issues automatically
- Show issues on dashboard
- Add update buttons

---

# STAGE 3 — WORDFENCE INTEGRATION
Tasks:
- Extend plugin
- Fetch Wordfence data
- Display security insights

---

# STAGE 4 — WPFORMS ANALYTICS
Tasks:
- Fetch submissions
- Fetch abandonment
- Field analytics
- Multiple-choice stats

---

# STAGE 5 — PLAYWRIGHT FOUNDATION
Tasks:
- Client Playwright settings
- Screenshot system
- Form testing
- Supabase uploads

---

# STAGE 6 — GITHUB ACTIONS
Tasks:
- Scheduled runs
- Manual runs
- Upload logs/screenshots
- Save run history

---

# STAGE 7 — WATCHTOWER DASHBOARD
Tasks:
- Show test history
- Screenshot diffs
- Failed tests
- Logs
- Run summaries

---

# STAGE 8 — REPORTING SYSTEM
Tasks:
- Monthly snapshots
- Approval workflow
- AI summaries
- Report editing

---

# STAGE 9 — PDF & EMAIL DELIVERY
Tasks:
- Generate PDFs
- Email reports
- Public report links

---

# STAGE 10 — CLIENT PORTAL
Tasks:
- Registration
- Approval flow
- Client permissions
- Historical reports

---

# DATABASE REQUIREMENTS

Need tables for:
- clients
- websites
- issues
- wordpress_updates
- wordfence_scans
- forms
- form_submissions
- form_abandonment
- playwright_runs
- playwright_results
- screenshots
- reports
- report_sections
- report_revisions
- client_users
- invitations

---

# IMPORTANT ENGINEERING RULES

- Always use TypeScript.
- Use reusable components.
- Use proper loading states.
- Use proper error handling.
- Never expose secrets on frontend.
- Use Supabase RLS everywhere.
- Keep architecture modular.
- Keep all systems multi-tenant.
- Build scalable structures from the beginning.

---

# CLAUDE WORKFLOW RULES

Claude must:
1. Read CLAUDE.md first.
2. Read progress.md second.
3. Continue from latest unfinished stage.
4. Update progress.md after completing tasks.
5. Create documentation files inside /docs when needed.
6. Never remove previous progress history.
7. Keep commits clean and descriptive.

---

# REQUIRED DOCUMENTATION FILES

Claude should generate and maintain:

text /docs/architecture.md /docs/database-schema.md /docs/api-spec.md /docs/playwright-system.md /docs/reporting-system.md /docs/wordpress-plugin.md 

---

# SUCCESS CRITERIA

Eye of Horus succeeds when Wetpaint can:

- Monitor all client websites centrally
- Detect issues proactively
- Reduce manual QA
- Automate reporting
- Track UX and visual problems
- Give clients premium reporting access
- Operate faster with fewer manual processes

The platform should feel like an AI-powered operations centre for client websites.