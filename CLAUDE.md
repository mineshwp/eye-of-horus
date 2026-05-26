CLAUDE.md — Eye of Horus

Project Name

Eye of Horus

Core Positioning

Eye of Horus watches what changes, prioritises what matters, and helps your team act before small issues become client problems.

Eye of Horus is an AI-powered website monitoring, QA, reporting, analytics, and strategy platform for agencies managing multiple client websites.

The platform helps the agency monitor client websites, detect issues early, understand what matters most, generate reports, and use AI to assist with fixes, insights, strategy, SEO, content, and competitor analysis.

⸻

1. Important Design Reference

There is an existing Claude Design concept that must be used as the visual direction for this project.

Design reference location:

/Users/mineshsingh/Documents/Wetpaint/SAAS/eye-of-horus-2point0/design-ideas-claude-design/EYE OF HORUS

Claude must inspect and follow this design style before building the interface.

The app should follow the visual direction, layout style, tone, colour feel, spacing, component style, and overall premium look from this design reference.

Claude may write and improve the copy where needed, but the visual style should remain aligned with the approved design direction.

Do not invent a completely different visual language unless explicitly instructed.

⸻

2. Primary Objective

Build a SaaS-style internal agency platform that monitors client websites and generates automated technical, performance, analytics, SEO, UX, uptime, form, and marketing reports.

The app should:

1. Monitor client websites for updates and issues.
2. Detect technical, security, UX, UI, SEO, uptime, analytics, and performance problems.
3. Run automated QA checks.
4. Test forms, including A-Forms and other common WordPress forms.
5. Generate daily internal issue summaries.
6. Generate monthly client-facing reports.
7. Allow AI to read, explain, and answer questions about reports.
8. Allow AI to assist with website fixes.
9. Allow AI to provide marketing strategy, SEO recommendations, content ideas, competitor research, and competitor analysis.
10. Alert the team by email and WhatsApp when urgent issues occur.

⸻

3. Tech Stack

Use the following stack:

Frontend

* Next.js
* TypeScript
* Tailwind CSS
* App Router
* Responsive layout
* Print-friendly report views

Backend / Database

* Supabase
    * Auth
    * Postgres database
    * Row Level Security
    * Storage if needed
    * Edge Functions if required

Automation / Testing

* Playwright
* Chrome DevTools MCP
* Lighthouse / Core Web Vitals checks
* Scheduled background jobs

Integrations

* WordPress plugin
* Google Search Console
* Google Analytics
* Microsoft Clarity
* OpenAI
* WhatsApp API via Twilio WhatsApp API or Whapi.cloud
* Email sending service such as Resend, SendGrid, Postmark, or another suitable provider

⸻

4. High-Level System Architecture

The system should follow a three-layer structure.

4.1 The Agent — WordPress Plugin

The WordPress plugin collects inside-the-site data.

It should report:

* WordPress version
* PHP version
* Active theme
* Parent theme
* Active plugins
* Plugin versions
* Available plugin updates
* Available WordPress core updates
* Available theme updates
* Site health status
* Basic server information
* Database size
* Error log summaries where possible
* Failed login attempts where possible
* Forms installed
* A-Forms submissions if available
* Form submission counts
* Security plugin status where possible
* Uptime heartbeat from the WordPress side

The plugin must securely communicate with the Eye of Horus dashboard using an API key or site token.

4.2 The Scout — Playwright / External Website Checks

The Scout checks websites from the outside.

It should run:

* Uptime checks
* HTTP status checks
* SSL certificate checks
* Domain expiry checks
* Visual regression checks
* Mobile, tablet, and desktop checks
* Form testing
* Console error detection
* Network error detection
* Lighthouse performance checks
* Core Web Vitals checks
* Broken layout detection
* Broken links where practical
* Basic SEO checks
* Page speed checks

4.3 The Brain — Supabase + OpenAI

The Brain stores data, creates insights, and generates reports.

It should:

* Store historical data
* Keep 18 months of reporting history
* Delete or archive anything older than 18 months
* Generate daily internal summaries
* Generate monthly client-facing reports
* Prioritise issues by severity
* Explain why issues matter
* Recommend fixes
* Answer questions about reports
* Assist with SEO and marketing strategy
* Assist with competitor research and analysis
* Generate blog ideas and content briefs from real data

⸻

5. Progress Tracking Requirement

Create and maintain a file called:

progress.md

This file must exist in the root of the project.

progress.md is the project handover log. It must be updated after every meaningful development step so that any future Claude Code, Codex, or Antigravity session can continue from where the previous session stopped.

Claude must update progress.md:

* Before ending a session
* Before switching major tasks
* After completing any major feature
* After creating or modifying important files
* After adding database migrations
* After adding environment variables
* After running tests
* After discovering bugs, blockers, or important implementation decisions

When updating progress.md, add the newest progress update near the top of the file under a dated entry, so the latest status is always easy to find.

If Claude runs out of context or tokens, the next session should first read:

1. CLAUDE.md
2. progress.md
3. README.md
4. Relevant files mentioned in progress.md

Claude must never store API keys, tokens, passwords, private credentials, or sensitive client data in progress.md.

Required progress.md Structure

Create the initial progress.md using this structure:

# Eye of Horus — Progress Log
## Latest Update
No work has been completed yet.
---
## Current Phase
Phase 1 — Foundation
---
## Current Status
Not started.
---
## Completed Work
- None yet.
---
## Files Created
- None yet.
---
## Files Modified
- None yet.
---
## Important Decisions
- Use Next.js, TypeScript, Tailwind CSS, and Supabase.
- Use Supabase Auth with role-based access.
- Do not allow public registration.
- Use Request Access workflow instead.
- Keep secrets out of the repository.
- Follow the approved design reference located at:
  `/Users/mineshsingh/Documents/Wetpaint/SAAS/eye-of-horus-2point0/design-ideas-claude-design/EYE OF HORUS`
---
## Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
APP_URL=
CRON_SECRET=
```
---
## Database / Migration Notes
- No migrations created yet.
---
## Commands Run
- None yet.
---
## Tests Run
- None yet.
---
## Known Issues / Blockers
- Supabase project details still need to be added.
- API credentials still need to be configured.
- GitHub token must be stored securely outside the repo.
- Approved design reference must be inspected before finalising UI direction.
---
## Next Recommended Task
Create the Next.js project foundation, Supabase setup, auth structure, dashboard shell, and initial database schema.

⸻

6. User Roles and Access

There should be no public registration page.

Instead, create a Request Access page.

Roles

Super Admin

Can:

* View all clients
* Add clients
* Add users
* Invite users
* Assign users to clients
* Manage integrations
* Manage schedules
* Manage reports
* View all checks and alerts
* Configure global settings

Admin

Can:

* View assigned or all clients depending on permissions
* Manage client settings
* View reports
* Trigger checks
* Manage alerts

Client

Can:

* View only assigned client reports
* Access monthly reports via login or secure share link
* Print reports
* Ask AI questions about their own report if enabled

Access Workflow

1. User visits Request Access page.
2. User submits name, email, company, and reason for access.
3. User is created with status pending.
4. Admin receives email notification.
5. Admin approves or rejects request.
6. If approved, admin assigns user to one or more clients.
7. User receives invite email.
8. Client users can only access data for their assigned client IDs.

Use Supabase Auth with a profiles table and client-user relationship table.

⸻

7. Main App Areas

7.1 Global Dashboard

The main dashboard should show all clients and their current health status.

Use a traffic light system:

* Green: Healthy
* Amber: Warning / needs attention
* Red: Critical issue
* Grey: No recent data or disconnected

Dashboard should show:

* Client name
* Website URL
* Overall score
* Uptime status
* WordPress update status
* Security status
* Performance score
* SEO score
* Form status
* Analytics status
* Last check time
* Most urgent issue
* Severity badge
* Quick action buttons

Critical clients should move to the top automatically.

7.2 Client Detail Dashboard

Each client should have a detailed dashboard with sections for:

* Overview
* Website health
* Uptime
* WordPress
* Plugins
* Themes
* Security
* Forms
* Performance
* SEO
* Analytics
* Clarity insights
* Google Search Console
* Google Analytics
* Visual regression
* Monthly reports
* AI insights
* Alerts
* Settings

7.3 Reports

There should be two major report types:

Daily Internal Report

Used by the agency team.

Should include:

* Which clients have issues
* Severity of each issue
* What changed since yesterday
* Websites down
* Urgent security issues
* Failed forms
* Major performance drops
* WordPress/plugin/theme updates
* Visual regression warnings
* Console errors
* Recommended actions
* AI-generated priority list

Monthly Client Report

Client-facing report.

Should include:

* Executive summary
* Website health summary
* Uptime report
* Performance report
* SEO report
* Google Analytics report
* Google Search Console report
* Microsoft Clarity UX insights
* Form submissions and lead tracking
* User journey insights
* Engagement metrics
* Technical issues resolved
* Opportunities for improvement
* AI marketing strategy recommendations
* Month-on-month comparison
* Historical trend data
* Clear next steps

Monthly reports must be printable.

Use Tailwind print utilities to:

* Hide navigation
* Hide dashboard-only controls
* Force page breaks between major sections
* Keep charts and section headings together
* Make reports clean on A4 paper
* Prevent awkward content breaks

⸻

8. Scheduling Requirements

Admins should be able to configure schedules in settings.

Daily Checks

Daily checks should run on:

* Mobile
* Tablet
* Desktop

Daily checks should be smaller and focused mainly on:

* Uptime
* HTTP status
* SSL status
* WordPress updates
* Plugin/theme changes
* Critical errors
* Console errors
* Form availability
* Basic performance changes
* Visual regression alerts

The admin must be able to set the time when automatic checks run.

Daily Email Summary

The system should send a daily internal email summary every morning.

The admin must be able to set the email send time.

The email should include:

* Critical issues first
* Client name
* Website URL
* Issue severity
* Issue summary
* Recommended action
* Link to dashboard

Monthly Reports

Monthly reports should:

* Generate on the 1st of every month
* Be compiled by 12:30am
* Allow this schedule to be changed in settings
* Include historical comparison data
* Be shareable with clients
* Be printable

Urgent Alerts

The system should immediately alert the team by email and optionally WhatsApp when:

* Website is down
* SSL is expired or near expiry
* Domain is near expiry
* Form test fails
* Site has critical WordPress/security issue
* Major visual regression is detected
* Major performance drop occurs
* Website returns 500 errors
* Website is blocked by malware/security warning

⸻

9. WordPress Plugin Requirements

Create a WordPress plugin called:

Eye of Horus Client

The plugin should connect a WordPress website to the Eye of Horus dashboard.

Plugin Settings Page

The plugin should have an admin settings page with:

* Dashboard API URL
* Site API key
* Connection status
* Last successful sync
* Manual sync button
* Enable/disable data types
* Debug mode
* Test connection button

Data to Collect

The plugin should collect:

* Site URL
* WordPress version
* PHP version
* MySQL version where possible
* Active theme
* Parent theme
* Theme version
* Active plugins
* Plugin versions
* Inactive plugins
* Available updates
* User count summary
* Admin user count
* Site health checks
* Cron status
* Debug status
* SSL status if possible
* Error log summaries where possible
* Database size where possible
* A-Forms data where available
* General form plugin data where possible

Form Tracking

The plugin should prioritise tracking:

* A-Forms
* WPForms
* Contact Form 7
* Gravity Forms
* Elementor Forms
* Ninja Forms

The app should be designed in a flexible way so more form plugins can be added later.

For each form, track:

* Form name
* Plugin source
* Number of submissions
* Last submission date
* Failed submissions if available
* Whether form exists on a public page
* Whether Playwright test passed or failed

Security

The plugin must:

* Never expose sensitive information publicly
* Use a secure API key/token
* Use WordPress nonces for admin actions
* Sanitize all input
* Escape all output
* Use capability checks
* Only allow admins to manage plugin settings
* Send data over HTTPS
* Support token rotation

⸻

10. External QA Checks

Use Playwright to run automated website checks.

Devices

Run checks for:

* Desktop
* Tablet
* Mobile

Daily QA Checks

Daily QA should check:

* Homepage loads
* Important pages load
* Contact page loads
* Forms are visible
* No major console errors
* No major network errors
* No 404 on critical assets
* HTTP status is valid
* Page title exists
* Meta description exists
* Page is not accidentally noindexed
* Page has visible content
* Navigation is usable
* Header and footer exist
* Screenshots can be captured
* Visual regression does not exceed threshold

Visual Regression

The system should:

1. Capture a baseline screenshot.
2. Capture a new screenshot during each check.
3. Compare new screenshot against baseline.
4. Flag visual differences above a configurable threshold.
5. Default threshold can be around 10%.
6. Allow admins to approve a new baseline.

Visual regression should be treated carefully. It should flag possible issues, not automatically assume every change is bad.

Form Testing

The system should:

* Identify forms on key pages
* Fill out test submissions where safe
* Use test data clearly marked as automated
* Run full form tests weekly by default
* Allow daily lightweight checks
* Confirm thank-you message, redirect, or successful response
* Flag failed submissions
* Track forms in monthly reports

For forms that send emails, avoid spamming clients. Provide configuration to disable live form submissions or use safe test modes where possible.

⸻

11. Analytics and Reporting Data

The system should track data useful to both the client and the agency.

The goal is not just to show numbers. The goal is to understand:

* Is the website working?
* Is it generating leads?
* Are users finding what they need?
* Where are users dropping off?
* What pages are performing?
* What pages need improvement?
* What should the agency do next?

Google Analytics

Track:

* Users
* Sessions
* New users
* Returning users
* Engagement rate
* Average engagement time
* Conversions
* Events
* Top pages
* Landing pages
* Traffic channels
* Source/medium
* Device breakdown
* Location breakdown
* Month-on-month changes

Google Search Console

Track:

* Clicks
* Impressions
* CTR
* Average position
* Top queries
* Top pages
* Queries in positions 11–20
* Pages losing traffic
* Pages gaining traffic
* SEO opportunities
* Indexing issues where available

Microsoft Clarity

Track:

* Rage clicks
* Dead clicks
* Excessive scrolling
* Quick backs
* JavaScript errors
* Popular pages
* Session insights
* UX friction points
* User behaviour patterns

Forms and Leads

Track:

* Number of form submissions
* Form source
* Lead source where possible
* Conversion rate
* Failed forms
* Form abandonment where possible
* Month-on-month lead changes

⸻

12. AI Requirements

AI is a major part of the product, but it must be useful and practical.

The AI should not simply summarise data. It should explain:

* What happened
* Why it matters
* How serious it is
* What should be done next
* What the likely business impact is

AI Features

The app should include:

1. AI daily issue summary.
2. AI monthly executive summary.
3. AI technical recommendations.
4. AI SEO recommendations.
5. AI marketing strategy recommendations.
6. AI content suggestions.
7. AI blog brief generation.
8. AI competitor research.
9. AI competitor analysis.
10. AI question answering over reports.
11. AI assistance for fixing website issues.

AI Prompt Style

Use a “So What?” layer.

Example instruction:

You are a senior technical strategist and digital marketing strategist for an agency. Do not only summarise the data. Explain what matters, why it matters, how urgent it is, and what action should be taken next.

AI Cost Management

Use different AI models for different tasks.

Suggested approach:

* Use cheaper models for daily summaries and classification.
* Use stronger models for monthly strategic reports.
* Do not run AI unnecessarily on every small data point.
* Store generated summaries.
* Reuse existing analysis where data has not changed.
* Generate deep analysis only when needed.

⸻

13. SEO and Content Intelligence

The app should use Google Search Console data to find SEO opportunities.

Striking Distance Keywords

Identify keywords ranking in positions 11–20.

For these keywords, AI should suggest:

* Pages to improve
* Blog topics
* Content briefs
* Internal linking ideas
* Metadata improvements
* FAQ ideas
* Schema recommendations where relevant

Blog Writing

AI should be able to create blog drafts using:

* Search Console data
* Existing page performance
* Competitor research
* Client industry
* Target keywords
* Agency-defined writing style

Blog writing should be an assisted feature, not automatic publishing.

⸻

14. Competitor Research

The system should allow admins to add competitors per client.

For each competitor, track or research:

* Website URL
* SEO visibility where possible
* Top pages
* Keywords where available
* Messaging
* Content strategy
* Paid media observations where available
* UX observations
* Performance comparison
* Strengths
* Weaknesses
* Opportunities

AI should generate competitor insights and recommendations.

⸻

15. Scoring System

Each client should have an overall health score.

Suggested score categories:

* Uptime
* Security
* WordPress health
* Performance
* SEO
* UX
* Analytics
* Forms
* Updates
* Visual stability

Each issue should have:

* Severity: low, medium, high, critical
* Category
* Client
* Website
* Detected date
* Status
* Recommended fix
* AI explanation
* Assigned user where needed

Critical issues should affect the score heavily.

⸻

16. Data Retention

Keep reporting and analytics history for 18 months.

Anything older than 18 months should be:

* Deleted, or
* Archived, depending on the implementation setting.

Use scheduled cleanup jobs.

Important historical data should be aggregated before deletion if needed.

⸻

17. Notifications

Email Notifications

Email notifications should be used for:

* Daily summaries
* Monthly report completion
* Access requests
* User invitations
* Critical alerts
* Failed checks

WhatsApp Notifications

WhatsApp should be used only for urgent alerts.

Use a proper provider such as:

* Twilio WhatsApp API
* Whapi.cloud

Avoid unofficial WhatsApp libraries.

Urgent WhatsApp alerts should include:

* Client name
* Website URL
* Issue
* Severity
* Time detected
* Dashboard link

⸻

18. Settings

The app should include settings for:

Global Settings

* Default daily check time
* Default daily email time
* Monthly report generation time
* Alert email recipients
* WhatsApp recipients
* Data retention period
* AI model preferences
* Report branding
* Company logo
* Default visual regression threshold

Client Settings

* Website URL
* WordPress plugin connection
* Google Analytics connection
* Google Search Console connection
* Clarity connection
* Competitor URLs
* Important pages to monitor
* Forms to test
* Alert preferences
* Report recipients
* Monthly report visibility
* Custom reporting notes

⸻

19. Suggested Database Structure

Use Supabase Postgres.

Core tables should include:

clients

Stores client information.

Fields:

* id
* name
* website_url
* status
* created_at
* updated_at

profiles

Stores user profile data linked to Supabase Auth.

Fields:

* id
* user_id
* full_name
* email
* role
* status
* created_at
* updated_at

client_users

Maps users to clients.

Fields:

* id
* client_id
* user_id
* role
* created_at

sites

Stores monitored website details.

Fields:

* id
* client_id
* url
* platform
* wordpress_connected
* api_key_hash
* last_seen_at
* created_at
* updated_at

wordpress_snapshots

Stores WordPress plugin data.

Fields:

* id
* site_id
* wp_version
* php_version
* theme_data
* plugin_data
* update_data
* security_data
* form_data
* raw_payload
* created_at

checks

Stores each automated check run.

Fields:

* id
* site_id
* check_type
* device
* status
* score
* started_at
* completed_at
* summary
* raw_result

issues

Stores detected issues.

Fields:

* id
* client_id
* site_id
* check_id
* category
* severity
* title
* description
* recommended_action
* ai_explanation
* status
* detected_at
* resolved_at

uptime_checks

Stores uptime results.

Fields:

* id
* site_id
* status
* http_status
* response_time_ms
* checked_at

performance_metrics

Stores Lighthouse and Core Web Vitals data.

Fields:

* id
* site_id
* device
* performance_score
* accessibility_score
* seo_score
* best_practices_score
* lcp
* cls
* inp
* fcp
* tti
* raw_result
* created_at

form_checks

Stores form test results.

Fields:

* id
* site_id
* form_name
* form_plugin
* page_url
* status
* submission_tested
* result_message
* created_at

analytics_snapshots

Stores Google Analytics data.

Fields:

* id
* client_id
* site_id
* period_start
* period_end
* metrics
* created_at

search_console_snapshots

Stores Search Console data.

Fields:

* id
* client_id
* site_id
* period_start
* period_end
* queries
* pages
* metrics
* created_at

clarity_snapshots

Stores Microsoft Clarity data.

Fields:

* id
* client_id
* site_id
* period_start
* period_end
* metrics
* insights
* created_at

reports

Stores generated reports.

Fields:

* id
* client_id
* report_type
* period_start
* period_end
* status
* executive_summary
* content
* share_token
* created_at
* updated_at

ai_messages

Stores AI interactions.

Fields:

* id
* client_id
* report_id
* user_id
* question
* answer
* context
* created_at

notification_logs

Stores sent notifications.

Fields:

* id
* client_id
* issue_id
* channel
* recipient
* status
* message
* created_at

⸻

20. MVP Build Order

Build the project in phases.

Phase 1 — Foundation

Create:

* Next.js app
* Supabase connection
* Auth
* Roles
* Client management
* Basic dashboard layout
* Client detail pages
* Protected routes
* Request access workflow
* Admin approval workflow
* progress.md
* .env.example
* Initial README.md

Phase 2 — Client Monitoring Basics

Create:

* Sites table
* Manual website check
* Uptime check
* HTTP status check
* SSL check
* Basic issue creation
* Traffic light dashboard status
* Daily check schedule

Phase 3 — WordPress Plugin

Create:

* WordPress plugin
* Plugin settings page
* API key connection
* Manual sync
* WordPress version tracking
* Plugin/theme tracking
* Update tracking
* Form plugin detection
* Dashboard endpoint to receive data

Phase 4 — Playwright QA

Create:

* Playwright test runner
* Desktop/mobile/tablet checks
* Screenshot capture
* Console error detection
* Basic form detection
* Visual regression baseline
* Visual regression comparison
* Issue creation from failed tests

Phase 5 — Reporting

Create:

* Daily internal report
* Daily email summary
* Monthly report structure
* Client-facing report page
* Shareable report link
* Print-friendly layout
* Historical comparison

Phase 6 — Analytics Integrations

Create:

* Google Analytics integration
* Google Search Console integration
* Microsoft Clarity integration
* Analytics dashboard cards
* Monthly analytics report sections
* SEO opportunity detection

Phase 7 — AI Layer

Create:

* AI report summaries
* AI issue prioritisation
* AI report Q&A
* AI recommended fixes
* AI SEO suggestions
* AI marketing strategy suggestions
* AI blog/content brief suggestions
* AI competitor analysis

Phase 8 — Alerts

Create:

* Email alerts
* WhatsApp alerts
* Alert settings
* Alert logs
* Urgent issue escalation

⸻

21. UI Requirements

The UI should feel:

* Premium
* Technical
* Clean
* Agency-friendly
* Easy to scan
* Dashboard-first
* Report-friendly
* Aligned with the approved Claude Design concept

Use:

* Cards
* Score indicators
* Traffic light statuses
* Severity badges
* Trend charts
* Clean tables
* Tabs for client detail pages
* Clear report sections
* Print-friendly monthly reports

The design should follow the existing local design reference:

/Users/mineshsingh/Documents/Wetpaint/SAAS/eye-of-horus-2point0/design-ideas-claude-design/EYE OF HORUS

Use that design as the main source of truth for:

* Layout style
* Colours
* Spacing
* Component direction
* Tone
* Visual hierarchy
* General interface feel

Claude can create or improve copy as needed.

⸻

22. Important Product Principles

1. The app must prioritise issues, not just collect data.
2. The app must explain why something matters.
3. The app must help the agency act quickly.
4. Client reports must be simple and useful.
5. Internal reports can be more technical.
6. AI should provide strategic value, not generic summaries.
7. Urgent issues must be impossible to miss.
8. Historical comparison is essential.
9. Reports must be printable.
10. The system must be built to scale to many clients.
11. Progress must always be documented in progress.md.
12. The approved design reference must guide the UI.

⸻

23. Security Requirements

Do not hard-code secrets.

Use environment variables for:

* Supabase URL
* Supabase anon key
* Supabase service role key
* OpenAI API key
* GitHub token
* Google API credentials
* Clarity credentials
* WhatsApp credentials
* Email provider keys

Never commit .env files.

Add .env.example.

Use RLS in Supabase.

Clients must never access other clients’ data.

API endpoints must validate:

* Auth
* Role
* Client access
* API tokens
* Request payloads

WordPress plugin requests must be authenticated.

Never put real secrets in:

* CLAUDE.md
* README.md
* progress.md
* .env.example
* Git commits
* Frontend client-side code

⸻

24. Environment Variables

Create .env.example with placeholders like:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLARITY_API_KEY=
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM_ADDRESS=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
APP_URL=
CRON_SECRET=
GITHUB_TOKEN=

Do not place real secrets inside this file.

⸻

25. Claude Development Instructions

When building this project:

1. Read this CLAUDE.md fully before writing code.
2. Inspect the approved design reference before finalising UI work.
3. Create and maintain progress.md.
4. Work in clear, small phases.
5. Do not try to build everything at once.
6. Start with the data model, auth, client management, and dashboard shell.
7. Create clean reusable components.
8. Use TypeScript properly.
9. Use Supabase RLS.
10. Keep admin and client permissions separate.
11. Make reporting pages print-friendly from the start.
12. Use placeholder integrations where API credentials are not yet available.
13. Build with future automation in mind.
14. Keep code clean and well-commented where useful.
15. Avoid hard-coded client-specific data.
16. Create sensible seed data for testing.
17. Add clear TODO comments for future integrations.
18. Do not expose secrets.
19. Do not commit real API keys or tokens.
20. Update progress.md after every meaningful development step.

⸻

26. First Task for Claude

Start by creating the project foundation.

Build:

1. Next.js app structure.
2. Supabase client setup.
3. Auth layout.
4. Login page.
5. Request access page.
6. Admin dashboard layout.
7. Client list page.
8. Client detail page.
9. Basic database schema SQL.
10. Role-based access structure.
11. Placeholder traffic light dashboard.
12. .env.example.
13. Initial README.md.
14. Initial progress.md.
15. Apply the approved design style from the local design reference.

Do not build the full AI layer yet.

Do not build the full WordPress plugin yet.

Do not build all integrations yet.

Prepare the app so those modules can be added cleanly later.

⸻

27. Suggested Initial Folder Structure

eye-of-horus/
├── app/
│   ├── admin/
│   │   ├── dashboard/
│   │   ├── clients/
│   │   ├── reports/
│   │   └── settings/
│   ├── client/
│   │   └── reports/
│   ├── auth/
│   │   ├── login/
│   │   └── request-access/
│   ├── api/
│   │   ├── checks/
│   │   ├── wordpress/
│   │   ├── reports/
│   │   └── webhooks/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── dashboard/
│   ├── reports/
│   ├── clients/
│   ├── ui/
│   └── layout/
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── checks/
│   ├── ai/
│   ├── reports/
│   └── notifications/
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── playwright/
│   ├── checks/
│   └── fixtures/
├── wordpress-plugin/
│   └── eye-of-horus-client/
├── public/
├── .env.example
├── README.md
├── progress.md
└── CLAUDE.md

⸻

