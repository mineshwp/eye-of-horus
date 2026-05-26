import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { checkSite } from './checks/site-check';
import { DEVICES } from './devices';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const CONCURRENCY = 2; // sites to check in parallel

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[runner] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Set TEST_FORM_SUBMISSIONS=true in .env.local to enable form fill+submit testing.
  // Intentionally off by default — form submissions can trigger real client emails.
  const testFormSubmissions = process.env.TEST_FORM_SUBMISSIONS === 'true';
  if (testFormSubmissions) {
    console.log('[runner] Form submission testing ENABLED — will fill and submit contact forms');
  }

  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, url, name')
    .not('url', 'is', null);

  if (error || !sites) {
    console.error('[runner] Failed to fetch sites:', error?.message);
    process.exit(1);
  }

  console.log(
    `[runner] Found ${sites.length} sites — checking on ${DEVICES.length} devices each`,
  );

  const browser = await chromium.launch({ headless: true });
  let totalChecks = 0;
  let totalFailed = 0;
  let totalIssues = 0;

  try {
    // Process sites in batches
    for (let i = 0; i < sites.length; i += CONCURRENCY) {
      const batch = sites.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (site) => {
          console.log(`[runner] Checking: ${site.name} (${site.url})`);

          for (const device of DEVICES) {
            try {
              const result = await checkSite(browser, { ...site, testFormSubmissions }, device);
              totalChecks++;
              if (result.status !== 'pass') totalFailed++;

              // Insert check result into Supabase
              const { error: insertErr } = await supabase.from('playwright_checks').insert({
                site_id: result.siteId,
                device: result.device,
                url: result.url,
                status: result.status,
                http_status: result.httpStatus,
                load_time_ms: result.loadTimeMs,
                page_title: result.pageTitle,
                meta_description: result.metaDescription,
                is_noindexed: result.isNoindexed,
                has_h1: result.hasH1,
                has_navigation: result.hasNavigation,
                console_errors: result.consoleErrors,
                network_errors: result.networkErrors,
                screenshot_url: result.screenshotUrl,
                baseline_url: result.baselineUrl,
                diff_url: result.diffUrl,
                diff_percentage: result.diffPercentage,
                regression_detected: result.regressionDetected,
                regression_threshold: result.regressionThreshold,
                forms_found: result.formsFound,
                issues_created: result.issuesFound.length,
                error_message: result.errorMessage,
                checked_at: result.checkedAt,
              });

              if (insertErr) {
                console.error(
                  `[runner] Failed to insert check for ${site.name}/${device.name}:`,
                  insertErr.message,
                );
              }

              // Create issues for findings
              if (result.issuesFound.length > 0) {
                totalIssues += result.issuesFound.length;

                for (const issueTitle of result.issuesFound) {
                  // Skip duplicates — check for open issue with same title + site
                  const { data: existing } = await supabase
                    .from('issues')
                    .select('id')
                    .eq('site_id', site.id)
                    .eq('title', issueTitle)
                    .eq('status', 'open')
                    .limit(1);

                  if (existing && existing.length > 0) continue;

                  const severity =
                    issueTitle.includes('regression') ||
                    issueTitle.includes('noindex') ||
                    issueTitle.includes('HTTP 5')
                      ? 'high'
                      : issueTitle.includes('console errors') ||
                          issueTitle.includes('navigation')
                        ? 'medium'
                        : 'low';

                  await supabase.from('issues').insert({
                    site_id: site.id,
                    category: 'playwright',
                    severity,
                    title: issueTitle,
                    description: `Detected during automated Playwright QA check on ${device.name} at ${result.checkedAt}`,
                    recommended_action:
                      'Review the site detail History tab for screenshots and details.',
                    status: 'open',
                    detected_at: result.checkedAt,
                  });
                }
              }

              // Insert form checks — use actual test results when available
              if (result.formsFound.length > 0) {
                for (let fi = 0; fi < result.formsFound.length; fi++) {
                  const form = result.formsFound[fi];
                  const testResult = result.formTestResults.find((r) => r.formIndex === fi);

                  let formStatus: 'pass' | 'fail' | 'not_tested' | 'skipped' = 'not_tested';
                  let resultMessage = `Form detected with ${form.fieldsCount} fields (${form.inputTypes.join(', ')})`;
                  let submissionTested = false;

                  if (testResult) {
                    submissionTested = testResult.submitted;
                    if (testResult.skippedReason) {
                      formStatus = 'skipped';
                      resultMessage = `Skipped: ${testResult.skippedReason}`;
                    } else if (testResult.submitted) {
                      formStatus = testResult.successDetected ? 'pass' : 'fail';
                      resultMessage = testResult.successDetected
                        ? `Submission OK — ${testResult.successIndicator}`
                        : testResult.errorMessage
                          ? `Submission error: ${testResult.errorMessage}`
                          : 'Submitted but no success signal detected';
                    }
                  }

                  await supabase.from('form_checks').insert({
                    site_id: site.id,
                    form_name: form.action || `Form ${fi + 1}`,
                    page_url: result.url,
                    status: formStatus,
                    submission_tested: submissionTested,
                    fields_count: form.fieldsCount,
                    result_message: resultMessage,
                  });
                }
              }

              const icon =
                result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '!';
              console.log(
                `[runner]   ${icon} ${device.name}: ${result.status} (${result.loadTimeMs}ms, ${result.issuesFound.length} issues)`,
              );
            } catch (err) {
              console.error(
                `[runner]   Error on ${device.name}:`,
                err instanceof Error ? err.message : err,
              );
              totalChecks++;
              totalFailed++;
            }
          }
        }),
      );
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\n[runner] Done — ${totalChecks} checks, ${totalFailed} failed, ${totalIssues} new issues`,
  );
}

main().catch((err) => {
  console.error('[runner] Fatal:', err);
  process.exit(1);
});
