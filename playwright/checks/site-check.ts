import { Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { DeviceConfig } from '../devices';
import { compareScreenshots } from './visual-regression';

export interface SiteCheckInput {
  id: string;
  url: string;
  name: string;
  /** Page path being checked (e.g. "/", "/about"). Used to keep per-page baselines separate. */
  pagePath?: string;
  /** When true, the runner will attempt to fill and submit contact forms. Default false. */
  testFormSubmissions?: boolean;
}

/** Slugify a page path into a filesystem/storage-safe segment. */
export function pagePathSlug(pagePath: string): string {
  const slug = pagePath.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return slug || "home";
}

export interface FormFound {
  action: string | null;
  method: string;
  fieldsCount: number;
  hasSubmit: boolean;
  inputTypes: string[];
}

export interface FormTestResult {
  formIndex: number;
  action: string | null;
  submitted: boolean;
  successDetected: boolean;
  successIndicator: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
}

export interface SiteCheckResult {
  siteId: string;
  device: string;
  url: string;
  pagePath: string;
  status: 'pass' | 'fail' | 'error';
  httpStatus: number | null;
  loadTimeMs: number | null;
  pageTitle: string | null;
  metaDescription: string | null;
  isNoindexed: boolean;
  hasH1: boolean;
  hasNavigation: boolean;
  consoleErrors: string[];
  networkErrors: string[];
  screenshotPath: string | null;
  screenshotUrl: string | null;
  baselinePath: string | null;
  baselineUrl: string | null;
  diffPath: string | null;
  diffUrl: string | null;
  diffPercentage: number | null;
  regressionDetected: boolean;
  regressionThreshold: number;
  formsFound: FormFound[];
  formTestResults: FormTestResult[];
  issuesFound: string[];
  errorMessage: string | null;
  checkedAt: string;
}

const SCREENSHOT_BASE = path.join(process.cwd(), 'public', 'playwright-data');
const TIMEOUT = 30000;
const REGRESSION_THRESHOLD = 10;

export async function checkSite(
  browser: Browser,
  site: SiteCheckInput,
  device: DeviceConfig,
): Promise<SiteCheckResult> {
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
    ignoreHTTPSErrors: false,
  });

  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const checkedAt = new Date().toISOString();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  });

  page.on('requestfailed', (req) => {
    networkErrors.push(
      `${req.method()} ${req.url()} — ${req.failure()?.errorText || 'failed'}`,
    );
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400 && !res.url().includes('favicon')) {
      networkErrors.push(`HTTP ${status}: ${res.url().slice(0, 120)}`);
    }
  });

  const issuesFound: string[] = [];
  let httpStatus: number | null = null;
  let loadTimeMs: number | null = null;
  let pageTitle: string | null = null;
  let metaDescription: string | null = null;
  let isNoindexed = false;
  let hasH1 = false;
  let hasNavigation = false;
  let formsFound: FormFound[] = [];
  let screenshotPath: string | null = null;
  let screenshotUrl: string | null = null;
  let baselinePath: string | null = null;
  let baselineUrl: string | null = null;
  let diffPath: string | null = null;
  let diffUrl: string | null = null;
  let diffPercentage: number | null = null;
  let regressionDetected = false;
  let status: 'pass' | 'fail' | 'error' = 'pass';
  let errorMessage: string | null = null;
  const formTestResults: FormTestResult[] = [];

  try {
    const start = Date.now();
    const response = await page.goto(site.url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT,
    });
    loadTimeMs = Date.now() - start;

    if (response) {
      httpStatus = response.status();
      if (httpStatus >= 400) {
        issuesFound.push(`HTTP ${httpStatus} response`);
        status = 'fail';
      }
    }

    // Wait a bit for JS to render
    await page.waitForTimeout(1500);

    // Page title
    pageTitle = await page.title().catch(() => null);
    if (!pageTitle) {
      issuesFound.push('Missing page title');
      status = 'fail';
    }

    // Meta description
    metaDescription = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute('content'))
      .catch(() => null);

    // Noindex check
    const robotsMeta = await page
      .$eval('meta[name="robots"]', (el) => el.getAttribute('content') || '')
      .catch(() => '');
    isNoindexed = robotsMeta.toLowerCase().includes('noindex');
    if (isNoindexed) {
      issuesFound.push('Page has noindex meta tag');
      status = 'fail';
    }

    // H1 check
    hasH1 = await page.$('h1').then((el) => el !== null).catch(() => false);
    if (!hasH1) {
      issuesFound.push('Missing H1 heading');
    }

    // Navigation check (nav element or header)
    hasNavigation = await page.$('nav, header').then((el) => el !== null).catch(() => false);
    if (!hasNavigation) {
      issuesFound.push('No navigation element detected');
      status = 'fail';
    }

    // Forms detection
    formsFound = await page
      .$$eval('form', (forms) =>
        forms.map((form) => {
          const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          return {
            action: form.getAttribute('action'),
            method: form.getAttribute('method') || 'get',
            fieldsCount: inputs.length,
            hasSubmit: submitBtn !== null,
            inputTypes: inputs
              .map((i) => (i as HTMLInputElement).type || i.tagName.toLowerCase())
              .filter((t) => t !== 'hidden'),
          };
        }),
      )
      .catch(() => []);

    // Console errors threshold
    if (consoleErrors.length >= 3) {
      issuesFound.push(`${consoleErrors.length} console errors detected`);
      status = 'fail';
    }

    // Screenshot — namespaced by page so multi-page baselines don't collide
    const slug = pagePathSlug(site.pagePath ?? "/");
    const screenshotDir = path.join(SCREENSHOT_BASE, site.id, slug, device.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotFilename = `check_${Date.now()}.png`;
    screenshotPath = path.join(screenshotDir, screenshotFilename);
    screenshotUrl = `/playwright-data/${site.id}/${slug}/${device.name}/${screenshotFilename}`;

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      type: 'png',
    });

    // Visual regression comparison
    baselinePath = path.join(screenshotDir, 'baseline.png');
    baselineUrl = `/playwright-data/${site.id}/${slug}/${device.name}/baseline.png`;

    if (fs.existsSync(baselinePath)) {
      const diffFilename = `diff_${Date.now()}.png`;
      const diffFilePath = path.join(screenshotDir, diffFilename);

      const diff = await compareScreenshots(
        baselinePath,
        screenshotPath,
        diffFilePath,
        REGRESSION_THRESHOLD,
      );

      diffPercentage = diff.diffPercentage;
      diffPath = diffFilePath;
      diffUrl = `/playwright-data/${site.id}/${slug}/${device.name}/${diffFilename}`;
      regressionDetected = !diff.matched;

      if (regressionDetected) {
        issuesFound.push(`Visual regression: ${diffPercentage}% difference from baseline`);
        status = 'fail';
      }
    } else {
      // No baseline — save current screenshot as baseline
      fs.copyFileSync(screenshotPath, baselinePath);
      console.log(`  Set initial baseline for ${site.name} on ${device.name}`);
    }

    // --- Optional form submission testing ---
    // Only runs when site.testFormSubmissions is true (e.g. weekly via TEST_FORM_SUBMISSIONS=true env var).
    // Limits to the first qualifying contact form to minimise unwanted submissions.
    if (site.testFormSubmissions && formsFound.length > 0) {
      for (let fi = 0; fi < Math.min(formsFound.length, 2); fi++) {
        const formData = formsFound[fi];
        const testResult: FormTestResult = {
          formIndex: fi,
          action: formData.action,
          submitted: false,
          successDetected: false,
          successIndicator: null,
          skippedReason: null,
          errorMessage: null,
        };

        try {
          if (!formData.hasSubmit) {
            testResult.skippedReason = 'no submit button';
            formTestResults.push(testResult);
            continue;
          }

          // Require at least one email field OR two text/textarea fields to treat as a contact form
          const contactFields = formData.inputTypes.filter((t) =>
            ['text', 'email', 'tel', 'textarea'].includes(t),
          );
          if (!contactFields.includes('email') && contactFields.length < 2) {
            testResult.skippedReason = 'not a contact form';
            formTestResults.push(testResult);
            continue;
          }

          const formLocator = page.locator('form').nth(fi);

          // Skip if CAPTCHA is present — we can't solve it
          const hasCaptcha = await formLocator
            .locator('.g-recaptcha, .cf-turnstile, .h-captcha, [data-sitekey]')
            .count()
            .then((n) => n > 0)
            .catch(() => false);
          if (hasCaptcha) {
            testResult.skippedReason = 'CAPTCHA detected';
            formTestResults.push(testResult);
            continue;
          }

          // Fill visible inputs with clearly fake test data
          const visibleInputs = formLocator.locator(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
              ':not([type="checkbox"]):not([type="radio"]):not([type="reset"]), textarea',
          );
          const inputCount = await visibleInputs.count();

          for (let ii = 0; ii < inputCount; ii++) {
            const input = visibleInputs.nth(ii);
            const inputType = ((await input.getAttribute('type')) || 'text').toLowerCase();
            const inputName = ((await input.getAttribute('name')) || '').toLowerCase();
            const tagName = await input.evaluate((el) => el.tagName.toLowerCase());

            let value = 'Playwright QA Test';
            if (inputType === 'email') {
              value = 'qa-test@test.invalid';
            } else if (inputType === 'tel' || inputName.includes('phone') || inputName.includes('tel')) {
              value = '0000000000';
            } else if (inputName.includes('name')) {
              value = 'Playwright QA';
            } else if (inputName.includes('subject') || inputName.includes('topic')) {
              value = 'Automated QA Test — Eye of Horus';
            } else if (tagName === 'textarea') {
              value =
                'Automated monitoring test from Eye of Horus QA. Please disregard this submission.';
            }

            await input.fill(value).catch(() => null);
          }

          // Submit and wait up to 5 seconds for a navigation or DOM response
          const submitLocator = formLocator
            .locator('button[type="submit"], input[type="submit"]')
            .first();
          testResult.submitted = true;

          const [navResponse] = await Promise.all([
            page.waitForNavigation({ timeout: 5000 }).catch(() => null),
            submitLocator.click().catch(() => null),
          ]);

          // Detect success via URL change
          if (navResponse) {
            const finalUrl = page.url();
            if (/thank|success|confirm|sent|merci/i.test(finalUrl)) {
              testResult.successDetected = true;
              testResult.successIndicator = `redirect → ${finalUrl}`;
            }
          }

          // Detect success via page body text
          if (!testResult.successDetected) {
            const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
            const successKeywords = [
              'thank you',
              "thanks!",
              'message received',
              "we'll be in touch",
              'successfully sent',
              'submission received',
              'form submitted',
              'message has been sent',
            ];
            for (const kw of successKeywords) {
              if (bodyText.toLowerCase().includes(kw)) {
                testResult.successDetected = true;
                testResult.successIndicator = `text found: "${kw}"`;
                break;
              }
            }
          }

          if (testResult.submitted && !testResult.successDetected) {
            issuesFound.push(`Form ${fi + 1} submitted but no success signal detected`);
            if (status === 'pass') status = 'fail';
          }

          // Re-navigate back if we need to test more forms and the page changed
          if (fi < Math.min(formsFound.length, 2) - 1) {
            await page
              .goto(site.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
              .catch(() => null);
            await page.waitForTimeout(1000);
          }
        } catch (err: unknown) {
          testResult.errorMessage = err instanceof Error ? err.message : String(err);
        }

        formTestResults.push(testResult);
      }
    }
  } catch (err: unknown) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    issuesFound.push(`Check failed: ${errorMessage}`);
  } finally {
    await page.close();
    await context.close();
  }

  return {
    siteId: site.id,
    device: device.name,
    url: site.url,
    pagePath: site.pagePath ?? "/",
    status,
    httpStatus,
    loadTimeMs,
    pageTitle,
    metaDescription,
    isNoindexed,
    hasH1,
    hasNavigation,
    consoleErrors: consoleErrors.slice(0, 10),
    networkErrors: networkErrors
      .filter((e) => !e.includes('analytics') && !e.includes('fonts.google'))
      .slice(0, 10),
    screenshotPath,
    screenshotUrl,
    baselinePath,
    baselineUrl,
    diffPath,
    diffUrl,
    diffPercentage,
    regressionDetected,
    regressionThreshold: REGRESSION_THRESHOLD,
    formsFound,
    formTestResults,
    issuesFound,
    errorMessage,
    checkedAt,
  };
}
