---
name: claude-website-qa
description: comprehensive website qa automation for claude using playwright-first browser testing, verbal database verification, frontend checks, form testing, link and button crawling, issue reporting, and retesting. use when the user asks claude to qa a website, test all pages, links, buttons, forms, frontend behaviour, database impact, cross-device behaviour, accessibility basics, performance signals, or confirm whether reported website issues have been fixed.
---

# Claude Website QA

Use this skill to run or guide a full website QA pass similar to an agentic browser-testing workflow. Prefer Playwright for browser automation because it supports Chromium, Firefox, WebKit, screenshots, traces, network inspection, accessibility checks, and repeatable retests.

## Core behaviour

1. Start by identifying the target site, environment, login details if provided, test scope, and any destructive-action limits.
2. If details are missing, proceed with safe public-page QA and clearly list assumptions. Do not invent credentials, database access, or admin permissions.
3. Build a test plan before testing. Cover discovery, navigation, forms, buttons, frontend behaviour, responsive views, console/network errors, accessibility basics, SEO basics, and database/API verification where possible.
4. Use Playwright-first automation for repeatable browser checks. Use manual/verbal checks for anything that cannot be safely automated or accessed.
5. Capture evidence for every issue: URL, steps to reproduce, expected result, actual result, severity, screenshots/traces where available, console/network errors, and suspected cause.
6. Produce a full QA report with status fields: `new`, `open`, `fixed`, `partially fixed`, `not reproducible`, `blocked`, or `needs retest`.
7. During a retest, focus on previously reported issues first, then perform a regression smoke pass around affected pages/components.

## Recommended tool choice

Use Playwright as the default testing framework. It is usually the best option for this workflow because it can:

- Crawl and interact with pages, links, buttons, forms, menus, modals, tabs, and accordions.
- Test Chromium, Firefox, and WebKit.
- Capture screenshots, videos, traces, console logs, and failed network requests.
- Simulate mobile and desktop viewports.
- Validate redirects, HTTP status codes, and broken resources.
- Run the same checks again after fixes to confirm status.

Use complementary tools only when needed:

- `axe-core` or Playwright accessibility snapshots for accessibility checks.
- Lighthouse/PageSpeed only for deeper performance audits.
- Direct API or database queries only when credentials and safe read/write rules are provided.
- CMS/admin inspection only when login access is explicitly provided.

## QA workflow

### 1. Intake and assumptions

Collect or infer:

- Website URL and environment: production, staging, local, or preview.
- Auth requirements and test account details.
- Forms that may submit real leads/orders and whether test submissions are allowed.
- Database/CMS stack if known. If unknown, describe checks verbally and verify through UI/API evidence.
- Devices/browsers required. Default to desktop Chrome plus mobile viewport unless broader coverage is requested.

For destructive workflows, never complete a real payment, delete content, publish content, or send real customer messages unless explicitly authorised.

### 2. Discovery crawl

Map the website:

- Start from the homepage and crawl internal links within the same domain.
- Record each unique URL, page title, status code, canonical, meta title/description presence, and visible H1.
- Flag 4xx/5xx pages, redirect loops, mixed content, broken images, missing titles, missing H1s, duplicate obvious content, and unexpected external navigation.
- Respect robots, rate limits, and authentication boundaries.

### 3. Link and button testing

For each page:

- Test visible internal links, external links, nav links, footer links, CTA buttons, icon links, and menu items.
- Verify that buttons either navigate, submit, open a modal, toggle content, download a file, or otherwise produce an expected visible change.
- Flag dead buttons, `#` links, javascript void links with no behaviour, inaccessible controls, broken downloads, and unexpected new-tab behaviour.

### 4. Form testing

For every form:

- Identify fields, required fields, validation messages, anti-spam/captcha behaviour, success state, and error state.
- Submit safe test data only. Use clearly marked test values such as `QA Test` and `qa-test@example.com`.
- Validate required-field errors, invalid email/phone handling, success message, redirect/thank-you page, and email/CRM/database impact if access is available.
- If form submission could create a real order, payment, support ticket, or live lead, ask for permission or stop before final submit and mark as blocked.

### 5. Frontend checks

Check:

- Layout at desktop, tablet, and mobile widths.
- Header, nav, dropdowns, hamburger menu, accordions, sliders, tabs, filters, search, pagination, modals, cookie banners, embedded videos/maps, and downloads.
- Console errors, unhandled promise rejections, failed network requests, missing assets, mixed content, CORS errors, and slow third-party scripts.
- Visual regressions, overlapping text, off-canvas content, broken images, contrast concerns, focus states, keyboard navigation basics, and visible loading states.

### 6. Database/API/CMS verification

Only perform direct database checks if credentials and safe query rules are provided. Prefer read-only queries.

When database access is available:

- Before submission, record baseline row counts or target records.
- Submit a test form/action.
- Verify created/updated records, timestamps, field values, relations, and duplicate prevention.
- Clean up test data only if authorised.

When database access is not available:

- Verify through UI, admin panel, confirmation emails, webhook logs, CRM records, API responses, or network requests.
- Clearly label database findings as `verbally verified`, `inferred from UI/API`, or `blocked: no database access`.

### 7. Reporting

Use the report template in `references/report-template.md`. Always include:

- Executive summary.
- Scope and assumptions.
- Environment and tools used.
- Coverage summary.
- Issue table with severity, status, owner if known, evidence, and retest result.
- Form test results.
- Link/button crawl results.
- Frontend/browser errors.
- Database/API verification notes.
- Recommended next actions.

Severity guidance:

- `critical`: Blocks core conversion, login, checkout, data integrity, or exposes security/privacy risk.
- `high`: Major feature broken or significant user journey failure.
- `medium`: Noticeable functional, layout, validation, or content issue with workaround.
- `low`: Cosmetic, minor accessibility, minor content, or polish issue.

### 8. Retesting and fixed confirmation

When confirming fixes:

1. Re-run the exact reproduction steps for each issue.
2. Compare expected versus actual result.
3. Update status: `fixed`, `partially fixed`, `still open`, `not reproducible`, or `blocked`.
4. Capture fresh evidence.
5. Run a short regression test around the affected area.
6. Produce a fixed-status report, not just a list of closed items.

## Bundled resources

- `references/report-template.md`: Full QA report structure.
- `references/playwright-test-plan.md`: Recommended automated test coverage.
- `scripts/create-playwright-qa-scaffold.py`: Generates a starter Playwright QA project with crawl, link, form, console, and responsive checks.

Use the scaffold script when the user wants starter files for a QA project. After generating files, instruct the user to install dependencies with `npm install` and run tests with `npx playwright test`.
