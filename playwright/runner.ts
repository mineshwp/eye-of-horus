import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { checkSite, pagePathSlug } from './checks/site-check';
import { testConfiguredForm, FormConfig } from './checks/form-check';
import { DEVICES } from './devices';
import { uploadArtifact, downloadArtifact, artifactKey, baselineKey } from './storage';

// Format matches app/api/wordpress/route.ts:nowLabel().
function nowLabel(): string {
  return new Date().toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function issueId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

// Map a finding title to the canonical (category, change_type, page) triplet so
// Playwright-detected issues show up alongside WordPress ones on the Issues page.
function classify(issueTitle: string, pagePath: string): {
  category: string; changeType: string; page: string;
} {
  if (/visual regression/i.test(issueTitle)) {
    return { category: 'Visual regression', changeType: 'Layout/visual change', page: pagePath };
  }
  if (/noindex/i.test(issueTitle)) {
    return { category: 'SEO', changeType: 'Indexability change', page: pagePath };
  }
  if (/HTTP [45]\d{2}/i.test(issueTitle)) {
    return { category: 'Availability', changeType: 'Server error', page: pagePath };
  }
  if (/console errors/i.test(issueTitle)) {
    return { category: 'JS error', changeType: 'Console error spike', page: pagePath };
  }
  if (/missing.*title|h1|navigation/i.test(issueTitle)) {
    return { category: 'Playwright', changeType: 'Page structure', page: pagePath };
  }
  return { category: 'Playwright', changeType: 'QA failure', page: pagePath };
}

interface TestPage { path: string; label?: string; visual?: boolean }
interface TestConfig { pages?: TestPage[]; forms?: FormConfig[] }

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
    .select('id, url, name, test_config')
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

          const config = (site.test_config ?? {}) as TestConfig;
          const configuredPages = (config.pages ?? []).filter((p) => p && p.path);
          // Fall back to scanning the homepage when no pages are configured.
          const pages: TestPage[] =
            configuredPages.length > 0 ? configuredPages : [{ path: '/', label: 'Home', visual: true }];

          for (const pg of pages) {
            const pageUrl = new URL(pg.path, site.url).toString();
            const slug = pagePathSlug(pg.path);

            for (const device of DEVICES) {
            try {
              // Pull the stored baseline (if any) into the local path checkSite expects,
              // so visual regression works across ephemeral CI runs.
              const localBaseline = path.join(
                process.cwd(), 'public', 'playwright-data', site.id, slug, device.name, 'baseline.png',
              );
              await downloadArtifact(supabase, baselineKey(site.id, slug, device.name), localBaseline);

              const result = await checkSite(
                browser,
                { id: site.id, url: pageUrl, name: site.name, pagePath: pg.path, testFormSubmissions },
                device,
              );
              totalChecks++;
              if (result.status !== 'pass') totalFailed++;

              // Upload artifacts to Supabase Storage and use those URLs in the DB.
              if (result.screenshotPath) {
                const url = await uploadArtifact(
                  supabase, result.screenshotPath, artifactKey(site.id, `screenshots/${slug}/${device.name}`, path.basename(result.screenshotPath)),
                );
                if (url) result.screenshotUrl = url;
              }
              if (result.diffPath) {
                const url = await uploadArtifact(
                  supabase, result.diffPath, artifactKey(site.id, `diffs/${slug}/${device.name}`, path.basename(result.diffPath)),
                );
                if (url) result.diffUrl = url;
              }
              if (result.baselinePath) {
                const url = await uploadArtifact(supabase, result.baselinePath, baselineKey(site.id, slug, device.name));
                if (url) result.baselineUrl = url;
              }

              // Insert check result into Supabase
              const { error: insertErr } = await supabase.from('playwright_checks').insert({
                site_id: result.siteId,
                device: result.device,
                url: result.url,
                page_path: result.pagePath,
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
                a11y_violations: result.a11yViolations,
                a11y_violation_count: result.a11yViolationCount,
                a11y_serious_count: result.a11ySeriousCount,
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

              // Create issues for findings — canonical shape from app/api/wordpress/route.ts.
              if (result.issuesFound.length > 0) {
                totalIssues += result.issuesFound.length;

                for (const issueTitle of result.issuesFound) {
                  // Skip duplicates — same title + open-ish status on this site.
                  const { data: existing } = await supabase
                    .from('issues')
                    .select('id')
                    .eq('site_id', site.id)
                    .eq('title', issueTitle)
                    .in('status', ['New', 'Investigating', 'In Progress'])
                    .limit(1);

                  if (existing && existing.length > 0) continue;

                  const severity =
                    issueTitle.includes('regression') ||
                    issueTitle.includes('noindex') ||
                    /HTTP [5]\d{2}/.test(issueTitle)
                      ? 'high'
                      : issueTitle.includes('console errors') ||
                          issueTitle.includes('navigation')
                        ? 'medium'
                        : 'low';

                  const cls = classify(issueTitle, pg.path);
                  await supabase.from('issues').insert({
                    id: issueId('pw'),
                    site_id: site.id,
                    title: issueTitle,
                    severity,
                    impact:
                      cls.category === 'Visual regression'
                        ? 'Visual regression detected vs approved baseline.'
                        : cls.category === 'Availability'
                          ? 'Page returned a non-2xx response — visitors may see an error.'
                          : 'Automated Watchtower check flagged this page.',
                    category: cls.category,
                    page: cls.page,
                    recommended:
                      cls.category === 'Visual regression'
                        ? 'Review the Visual changes tab and either approve the new baseline or revert the change.'
                        : 'Open the site detail Watchtower Checks tab for the failing run.',
                    owner: 'Unassigned',
                    status: 'New',
                    detected: nowLabel(),
                    change_type: cls.changeType,
                    confidence: cls.category === 'Visual regression' ? 95 : 85,
                    evidence: {
                      device: device.name,
                      page_path: pg.path,
                      checked_at: result.checkedAt,
                      diff_percentage: result.diffPercentage,
                      diff_url: result.diffUrl,
                      screenshot_url: result.screenshotUrl,
                    },
                  });
                }
              }

              // Create issues for serious/critical accessibility violations.
              // Deduped by title across devices/pages so the same WCAG rule
              // doesn't spawn one issue per device.
              for (const v of result.a11yViolations) {
                if (v.impact !== 'serious' && v.impact !== 'critical') continue;

                const title = `Accessibility: ${v.help}`;
                const { data: existingA11y } = await supabase
                  .from('issues')
                  .select('id')
                  .eq('site_id', site.id)
                  .eq('title', title)
                  .in('status', ['New', 'Investigating', 'In Progress'])
                  .limit(1);
                if (existingA11y && existingA11y.length > 0) continue;

                totalIssues++;
                await supabase.from('issues').insert({
                  id: issueId('a11y'),
                  site_id: site.id,
                  title,
                  severity: v.impact === 'critical' ? 'high' : 'medium',
                  impact: `${v.nodes} element${v.nodes === 1 ? '' : 's'} affected — ${v.description}`,
                  category: 'Accessibility',
                  page: pg.path,
                  recommended: `Fix per WCAG guidance: ${v.helpUrl}`,
                  owner: 'Unassigned',
                  status: 'New',
                  detected: nowLabel(),
                  change_type: 'Accessibility audit',
                  confidence: 90,
                  evidence: {
                    rule: v.id,
                    impact: v.impact,
                    nodes: v.nodes,
                    sample_targets: v.sampleTargets,
                    help_url: v.helpUrl,
                    page_path: pg.path,
                    device: device.name,
                  },
                });
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
            } // end device loop
          } // end page loop

          // --- Configured form testing ---
          const forms = (config.forms ?? []).filter((f) => f && f.path);
          if (forms.length > 0 && testFormSubmissions) {
            for (const form of forms) {
              try {
                const fr = await testConfiguredForm(browser, site.url, DEVICES[0], form);
                let formStatus: 'pass' | 'fail' | 'skipped' | 'not_tested' = 'not_tested';
                let resultMessage = 'Form not tested';
                if (fr.skippedReason) {
                  formStatus = 'skipped';
                  resultMessage = `Skipped: ${fr.skippedReason}`;
                } else if (fr.submitted) {
                  formStatus = fr.successDetected ? 'pass' : 'fail';
                  resultMessage = fr.successDetected
                    ? `Submission OK — ${fr.successIndicator}`
                    : fr.errorMessage
                      ? `Submission error: ${fr.errorMessage}`
                      : 'Submitted but no success signal detected';
                }

                await supabase.from('form_checks').insert({
                  site_id: site.id,
                  form_name: form.label || form.path,
                  page_url: new URL(form.path, site.url).toString(),
                  status: formStatus,
                  submission_tested: fr.submitted,
                  fields_count: Object.keys(form.fields ?? {}).length,
                  result_message: resultMessage,
                });

                if (formStatus === 'fail') {
                  const title = `Form test failed: ${form.label || form.path}`;
                  const { data: existing } = await supabase
                    .from('issues')
                    .select('id')
                    .eq('site_id', site.id)
                    .eq('title', title)
                    .in('status', ['New', 'Investigating', 'In Progress'])
                    .limit(1);
                  if (!existing || existing.length === 0) {
                    await supabase.from('issues').insert({
                      id: issueId('pw'),
                      site_id: site.id,
                      title,
                      severity: 'high',
                      impact: 'Form submission could not be confirmed — inbound leads may be lost.',
                      category: 'Form failure',
                      page: form.path,
                      recommended:
                        'Check the configured form on the live site — submission did not confirm success.',
                      owner: 'Unassigned',
                      status: 'New',
                      detected: nowLabel(),
                      change_type: 'Form submission failure',
                      confidence: 90,
                      evidence: { result_message: resultMessage, form_path: form.path },
                    });
                    totalIssues++;
                  }
                }
                console.log(`[runner]   form ${form.path}: ${formStatus}`);
              } catch (err) {
                console.error(`[runner]   form ${form.path} error:`, err instanceof Error ? err.message : err);
              }
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
