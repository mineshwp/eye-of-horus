# Playwright Website QA Test Plan

## Default coverage

Run these checks unless the user narrows the scope:

1. Homepage smoke test
2. Internal page crawl
3. Broken internal/external links
4. Button/CTA interaction checks
5. Form validation and safe submission checks
6. Console error and failed network request capture
7. Responsive checks at 1440, 1024, 768, and 390 widths
8. Basic accessibility checks: page title, headings, labels, alt text, focusable controls
9. SEO basics: title, meta description, canonical, H1
10. Retest mode for previously reported issues

## Suggested Playwright configuration

- Use Chromium by default for speed.
- Add Firefox and WebKit for final regression where time allows.
- Enable screenshot on failure and trace on first retry.
- Use retries in CI, but not locally when debugging.
- Keep generated evidence in `test-results/` and `playwright-report/`.

## Safe test data

Use obvious QA data:

- Name: QA Test
- Email: qa-test@example.com
- Phone: +27000000000
- Company: QA Test Company
- Message: This is a QA test submission. Please ignore.

## Retest procedure

For every reported issue:

1. Navigate to the exact URL.
2. Reproduce the original steps.
3. Capture current behaviour.
4. Compare against expected behaviour.
5. Update status.
6. Run a nearby regression check.
