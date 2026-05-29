import { Browser } from 'playwright';
import { DeviceConfig } from '../devices';

export interface FormConfig {
  path: string;
  label?: string;
  selector?: string;
  fields?: Record<string, string>;
  successText?: string;
}

export interface ConfiguredFormResult {
  path: string;
  label: string | null;
  submitted: boolean;
  successDetected: boolean;
  successIndicator: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
}

const TIMEOUT = 30000;

/**
 * Navigates to a configured form's page, fills the mapped fields, submits,
 * and checks for the configured success text. Field keys are matched against
 * each input's name, id, or placeholder (case-insensitive substring).
 */
export async function testConfiguredForm(
  browser: Browser,
  baseUrl: string,
  device: DeviceConfig,
  form: FormConfig,
): Promise<ConfiguredFormResult> {
  const result: ConfiguredFormResult = {
    path: form.path,
    label: form.label ?? null,
    submitted: false,
    successDetected: false,
    successIndicator: null,
    skippedReason: null,
    errorMessage: null,
  };

  const url = new URL(form.path, baseUrl).toString();
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(1200);

    const formLocator = form.selector ? page.locator(form.selector).first() : page.locator('form').first();
    if ((await formLocator.count()) === 0) {
      result.skippedReason = `form not found (${form.selector ?? 'form'})`;
      return result;
    }

    // CAPTCHA guard — cannot solve, so don't submit.
    const hasCaptcha = await formLocator
      .locator('.g-recaptcha, .cf-turnstile, .h-captcha, [data-sitekey]')
      .count()
      .then((n) => n > 0)
      .catch(() => false);
    if (hasCaptcha) {
      result.skippedReason = 'CAPTCHA detected';
      return result;
    }

    // Fill configured fields by matching name/id/placeholder.
    const entries = Object.entries(form.fields ?? {});
    if (entries.length === 0) {
      result.skippedReason = 'no field values configured';
      return result;
    }

    const inputs = formLocator.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
    );
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const name = ((await input.getAttribute('name')) || '').toLowerCase();
      const id = ((await input.getAttribute('id')) || '').toLowerCase();
      const placeholder = ((await input.getAttribute('placeholder')) || '').toLowerCase();
      const match = entries.find(([key]) => {
        const k = key.toLowerCase();
        return name.includes(k) || id.includes(k) || placeholder.includes(k);
      });
      if (match) {
        await input.fill(match[1]).catch(() => null);
      }
    }

    const submit = formLocator.locator('button[type="submit"], input[type="submit"]').first();
    if ((await submit.count()) === 0) {
      result.skippedReason = 'no submit button';
      return result;
    }

    result.submitted = true;
    const [nav] = await Promise.all([
      page.waitForNavigation({ timeout: 6000 }).catch(() => null),
      submit.click().catch(() => null),
    ]);

    const successText = (form.successText ?? '').trim().toLowerCase();
    if (successText) {
      const body = ((await page.textContent('body').catch(() => '')) ?? '').toLowerCase();
      if (body.includes(successText)) {
        result.successDetected = true;
        result.successIndicator = `text found: "${form.successText}"`;
      }
    } else if (nav && /thank|success|confirm|sent|merci/i.test(page.url())) {
      result.successDetected = true;
      result.successIndicator = `redirect → ${page.url()}`;
    }
  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    await page.close().catch(() => null);
    await context.close().catch(() => null);
  }

  return result;
}
