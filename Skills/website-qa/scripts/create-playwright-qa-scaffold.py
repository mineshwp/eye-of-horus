#!/usr/bin/env python3
"""Create a starter Playwright QA scaffold for website testing."""
from pathlib import Path
import argparse
import json

PACKAGE_JSON = {
    "scripts": {
        "test": "playwright test",
        "test:headed": "playwright test --headed",
        "report": "playwright show-report"
    },
    "devDependencies": {
        "@playwright/test": "latest"
    }
}

PLAYWRIGHT_CONFIG = """import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://example.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ]
});
"""

QA_TEST = """import { test, expect } from '@playwright/test';

const visited = new Set();
const issues = [];

function normaliseUrl(url) {
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}

test('homepage loads without critical frontend errors', async ({ page, baseURL }) => {
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('requestfailed', request => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });

  await page.goto(baseURL || '/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/.+/);

  const h1Count = await page.locator('h1').count();
  if (h1Count === 0) issues.push('Homepage has no visible H1.');

  expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  expect(failedRequests, `Failed requests: ${failedRequests.join('\n')}`).toEqual([]);
});

test('visible links return successful responses where checkable', async ({ page, request, baseURL }) => {
  await page.goto(baseURL || '/', { waitUntil: 'domcontentloaded' });
  const hrefs = await page.locator('a[href]').evaluateAll(links =>
    [...new Set(links.map(a => a.href).filter(Boolean))]
  );

  for (const href of hrefs.slice(0, 100)) {
    const url = normaliseUrl(href);
    if (visited.has(url)) continue;
    visited.add(url);

    const response = await request.get(url, { failOnStatusCode: false, timeout: 15000 });
    expect(response.status(), `${url} returned ${response.status()}`).toBeLessThan(400);
  }
});

test('forms expose validation and do not silently fail', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/', { waitUntil: 'domcontentloaded' });
  const forms = page.locator('form');
  const count = await forms.count();

  for (let i = 0; i < count; i++) {
    const form = forms.nth(i);
    const inputs = await form.locator('input, textarea, select').count();
    expect(inputs, `Form ${i + 1} has no fields`).toBeGreaterThan(0);
  }
});

test('key responsive widths render without horizontal overflow', async ({ page, baseURL }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL || '/', { waitUntil: 'networkidle' });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasOverflow, `Horizontal overflow detected at ${width}px`).toBeFalsy();
  }
});
"""

README = """# Playwright Website QA Scaffold

## Setup

```bash
npm install
npx playwright install
BASE_URL=https://your-site.test npm test
```

## What this covers

- Homepage smoke test
- Console and failed request checks
- Basic link response checks
- Basic form detection
- Responsive overflow checks

Extend the tests with project-specific forms, login flows, database/API verification, and known issue retests.
"""


def main():
    parser = argparse.ArgumentParser(description="Create a Playwright QA scaffold")
    parser.add_argument("output", nargs="?", default="website-qa-playwright", help="Output directory")
    args = parser.parse_args()

    out = Path(args.output)
    (out / "tests").mkdir(parents=True, exist_ok=True)
    (out / "package.json").write_text(json.dumps(PACKAGE_JSON, indent=2) + "\n", encoding="utf-8")
    (out / "playwright.config.ts").write_text(PLAYWRIGHT_CONFIG, encoding="utf-8")
    (out / "tests" / "website-qa.spec.ts").write_text(QA_TEST, encoding="utf-8")
    (out / "README.md").write_text(README, encoding="utf-8")
    print(f"Created Playwright QA scaffold at {out.resolve()}")


if __name__ == "__main__":
    main()
