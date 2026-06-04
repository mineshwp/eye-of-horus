import { createClient } from '@supabase/supabase-js';
import type { ReportContent, ReportSecurity, ReportPillars, ReportChange, ReportRecommendation } from './types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role not configured');
  return createClient(url, key);
}

export async function compileReport(
  siteId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ReportContent> {
  const supabase = getServiceClient();
  const startIso = periodStart.toISOString();
  const endIso = periodEnd.toISOString();

  // Previous period (same duration, prior window)
  const duration = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - duration);

  // Fetch site info
  const { data: site } = await supabase
    .from('sites')
    .select('id, name, url, health, status')
    .eq('id', siteId)
    .single();

  // Current period issues
  const { data: issuesCurrent } = await supabase
    .from('issues')
    .select('id, title, severity, category, status, detected_at')
    .eq('site_id', siteId)
    .gte('detected_at', startIso)
    .lte('detected_at', endIso);

  // Resolved issues this period
  const { data: resolvedIssues } = await supabase
    .from('issues')
    .select('id')
    .eq('site_id', siteId)
    .eq('status', 'Resolved')
    .gte('detected_at', startIso);

  // Uptime checks current period
  const { data: uptimeCurrent } = await supabase
    .from('uptime_checks')
    .select('status')
    .eq('site_id', siteId)
    .gte('checked_at', startIso)
    .lte('checked_at', endIso);

  // Uptime checks previous period
  const { data: uptimePrev } = await supabase
    .from('uptime_checks')
    .select('status')
    .eq('site_id', siteId)
    .gte('checked_at', prevStart.toISOString())
    .lte('checked_at', periodStart.toISOString());

  // WordPress snapshot AS AT the end of the reported month — reports are
  // historical snapshots of the previous completed month, never live data
  // (CLAUDE.md rule #1). Using the month-end snapshot also captures Wordfence
  // attack counts while they're still fresh in wfHits (Wordfence prunes that
  // log over time), so the report's "last month" figures stay accurate forever.
  const snapshotCols = 'wp_version, php_version, server_data, security_data, plugin_data, form_data, wordfence_data, created_at';
  let { data: wpSnapshots } = await supabase
    .from('wordpress_snapshots')
    .select(snapshotCols)
    .eq('site_id', siteId)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(1);
  // Fallback: if there's no snapshot at/before the period end (e.g. the plugin
  // was connected only after the period), use the earliest available one.
  if (!wpSnapshots || wpSnapshots.length === 0) {
    ({ data: wpSnapshots } = await supabase
      .from('wordpress_snapshots')
      .select(snapshotCols)
      .eq('site_id', siteId)
      .order('created_at', { ascending: true })
      .limit(1));
  }

  // Playwright checks current period
  const { data: playwrightChecks } = await supabase
    .from('playwright_checks')
    .select('status, regression_detected')
    .eq('site_id', siteId)
    .gte('checked_at', startIso)
    .lte('checked_at', endIso);

  // Form checks
  const { data: formChecks } = await supabase
    .from('form_checks')
    .select('status')
    .eq('site_id', siteId)
    .gte('created_at', startIso);

  // ── Phase 1d data sources (latest snapshots, for pillars + what-changed) ────
  // Performance: last two desktop rows (latest + previous for the change diff).
  const { data: perfRows } = await supabase
    .from('performance_metrics')
    .select('performance_score, accessibility_score, seo_score, created_at')
    .eq('site_id', siteId)
    .eq('device', 'desktop')
    .order('created_at', { ascending: false })
    .limit(2);

  // SEO crawl audit (drives the SEO pillar + broken-link rec).
  const { data: seoRows } = await supabase
    .from('seo_audits')
    .select('score, broken_links_count, has_sitemap, missing_titles, checked_at')
    .eq('site_id', siteId)
    .order('checked_at', { ascending: false })
    .limit(1);

  // Microsoft Clarity (UX pillar + JS-error signal).
  const { data: clarityRows } = await supabase
    .from('clarity_snapshots')
    .select('metrics, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1);

  // GA4 analytics (traffic, for what-changed + recommendation weighting).
  const { data: gaRows } = await supabase
    .from('analytics_snapshots')
    .select('metrics, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1);

  // Accessibility violations from the latest Watchtower check.
  const { data: a11yRows } = await supabase
    .from('playwright_checks')
    .select('a11y_serious_count, a11y_violation_count, checked_at')
    .eq('site_id', siteId)
    .gt('a11y_violation_count', 0)
    .order('checked_at', { ascending: false })
    .limit(1);

  // Real-user field data (Phase 3): LCP p75 + session volume over the period.
  const { data: rumVitalRows } = await supabase
    .from("rum_vitals")
    .select("value")
    .eq("site_id", siteId)
    .eq("metric", "LCP")
    .gte("created_at", startIso)
    .limit(5000);
  const { count: rumSessionCount } = await supabase
    .from("rum_sessions")
    .select("*", { count: "exact", head: true })
    .eq("site_id", siteId)
    .gte("started_at", startIso);

  // Previous report (for a real previous health score instead of an estimate).
  const { data: prevReportRows } = await supabase
    .from('reports')
    .select('content, period_end')
    .eq('site_id', siteId)
    .lt('period_end', periodStart.toISOString().split('T')[0])
    .in('status', ['draft', 'pending_approval', 'approved', 'ready'])
    .order('period_end', { ascending: false })
    .limit(1);

  // Calculate health scores
  const currentScore = (site as { health?: number } | null)?.health ?? 0;
  // Previous score — read the prior report's real health score; fall back to
  // the current score (flat) when there's no earlier report.
  const prevReportContent = prevReportRows?.[0]?.content as ReportContent | undefined;
  const previousScore = prevReportContent?.health?.score ?? currentScore;

  // Calculate uptime %
  const calcUptime = (checks: { status: string }[] | null) => {
    if (!checks || checks.length === 0) return 100;
    const up = checks.filter((c) => c.status === 'up').length;
    return Math.round((up / checks.length) * 10000) / 100;
  };
  const uptimePercent = calcUptime(uptimeCurrent);
  const previousUptimePercent = calcUptime(uptimePrev);

  // Issues aggregation
  const issues = (issuesCurrent as Array<{ id: string; title: string; severity: string; category: string; status: string; detected_at: string }>) || [];
  // App statuses are New / Investigating / In Progress / Resolved — "open" is anything not resolved.
  const open = issues.filter((i) => i.status !== 'Resolved').length;
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const high = issues.filter((i) => i.severity === 'high').length;
  const medium = issues.filter((i) => i.severity === 'medium').length;
  const low = issues.filter((i) => i.severity === 'low').length;

  // WordPress data
  const wpSnap = wpSnapshots?.[0];
  // plugin_data is an array of plugins; count those with an update available.
  const pluginData = Array.isArray(wpSnap?.plugin_data)
    ? (wpSnap!.plugin_data as Array<{ update_available?: boolean }>)
    : [];
  const pluginsNeedingUpdate = pluginData.filter((p) => p.update_available).length;
  const secData = wpSnap?.security_data as { debug_mode?: boolean; admin_users?: number; error_log_lines?: unknown[] } | null;
  const securityFlags: string[] = [];
  if (secData?.debug_mode) securityFlags.push('Debug mode enabled');
  if (secData?.admin_users && secData.admin_users > 3) securityFlags.push(`${secData.admin_users} admin accounts`);
  if (Array.isArray(secData?.error_log_lines) && secData!.error_log_lines!.length > 0) securityFlags.push('PHP error log exposed');

  // Wordfence security data
  type WfAttackPeriod = { complex?: number; brute_force?: number; blocklist?: number; total?: number } | null;
  const wfData = (wpSnap as unknown as { wordfence_data?: {
    active?: boolean;
    waf_enabled?: boolean;
    waf_rules_premium?: boolean;
    ip_blocklist_enabled?: boolean;
    brute_force_enabled?: boolean;
    attacks_today?: WfAttackPeriod;
    attacks_week?: WfAttackPeriod;
    attacks_month?: WfAttackPeriod;
    scan_issues_count?: number;
    malware_found?: boolean;
    top_countries?: { country: string; count: number }[];
    last_scan_time?: string | null;
  } | null })?.wordfence_data ?? null;

  const normAttack = (p: WfAttackPeriod): { complex: number; brute_force: number; blocklist: number; total: number } => ({
    complex:     p?.complex     ?? 0,
    brute_force: p?.brute_force ?? 0,
    blocklist:   p?.blocklist   ?? 0,
    total:       p?.total       ?? 0,
  });

  const reportSecurity: ReportSecurity | undefined = wfData?.active ? {
    waf_enabled:           wfData.waf_enabled          ?? false,
    waf_rules_premium:     wfData.waf_rules_premium     ?? false,
    ip_blocklist_enabled:  wfData.ip_blocklist_enabled  ?? false,
    brute_force_enabled:   wfData.brute_force_enabled   ?? false,
    attacks_today:         normAttack(wfData.attacks_today  ?? null),
    attacks_week:          normAttack(wfData.attacks_week   ?? null),
    attacks_month:         normAttack(wfData.attacks_month  ?? null),
    scan_issues_count:     wfData.scan_issues_count  ?? 0,
    malware_found:         wfData.malware_found       ?? false,
    top_countries:         wfData.top_countries       ?? [],
    last_scan_time:        wfData.last_scan_time      ?? null,
  } : undefined;

  // WPForms submission data from WordPress snapshot
  type WPFormEntry = {
    plugin: string;
    name?: string;
    id?: number;
    active?: boolean;
    completed_total?: number | null;
    abandoned_total?: number | null;
    completed_month?: number | null;
    abandoned_month?: number | null;
    completed_last?: number | null;
    abandoned_last?: number | null;
    field_breakdowns?: { field: string; values: { value: string; count: number }[] }[];
    abandonment_reasons?: { field: string; count: number }[];
  };
  const wpFormEntries = ((wpSnap?.form_data as WPFormEntry[] | null) ?? [])
    .filter((f) => f.plugin === 'WPForms' && f.completed_total != null);

  const wpformStats = wpFormEntries.map((f) => ({
    name: f.name ?? `Form ${f.id ?? 'Unknown'}`,
    id: f.id ?? 0,
    completedTotal:  f.completed_total  ?? 0,
    abandonedTotal:  f.abandoned_total  ?? 0,
    completedMonth:  f.completed_month  ?? 0,
    abandonedMonth:  f.abandoned_month  ?? 0,
    completedLast:   f.completed_last   ?? 0,
    abandonedLast:   f.abandoned_last   ?? 0,
  }));

  // Aggregate field breakdowns across all forms
  const breakdownMap: Record<string, { value: string; count: number }[]> = {};
  for (const f of wpFormEntries) {
    for (const bd of (f.field_breakdowns ?? [])) {
      if (!breakdownMap[bd.field]) breakdownMap[bd.field] = [];
      for (const v of bd.values) {
        const existing = breakdownMap[bd.field].find((x) => x.value === v.value);
        if (existing) existing.count += v.count; else breakdownMap[bd.field].push({ ...v });
      }
    }
  }
  const wpFieldBreakdowns = Object.entries(breakdownMap).map(([field, values]) => ({
    field,
    values: values.sort((a, b) => b.count - a.count).slice(0, 10),
  }));

  // Aggregate abandonment reasons
  const abandonMap: Record<string, number> = {};
  for (const f of wpFormEntries) {
    for (const r of (f.abandonment_reasons ?? [])) {
      abandonMap[r.field] = (abandonMap[r.field] ?? 0) + r.count;
    }
  }
  const wpAbandonReasons = Object.entries(abandonMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([field, count]) => ({ field, count }));

  const totalCompletedThisMonth = wpformStats.reduce((s, f) => s + f.completedMonth, 0);
  const totalAbandonedThisMonth = wpformStats.reduce((s, f) => s + f.abandonedMonth, 0);
  const totalCompletedLastMonth = wpformStats.reduce((s, f) => s + f.completedLast,  0);

  // Playwright aggregation
  const pwChecks = (playwrightChecks as Array<{ status: string; regression_detected: boolean }>) || [];
  const pwPassed = pwChecks.filter((c) => c.status === 'pass').length;
  const pwFailed = pwChecks.filter((c) => c.status !== 'pass').length;
  const pwRegressions = pwChecks.filter((c) => c.regression_detected).length;
  const pwPassRate = pwChecks.length > 0 ? Math.round((pwPassed / pwChecks.length) * 100) : 100;

  // Forms
  const fChecks = (formChecks as Array<{ status: string }>) || [];
  const fPassed = fChecks.filter((c) => c.status === 'pass').length;

  // Auto-generate recommendations
  const recommendations: string[] = [];
  if (pluginsNeedingUpdate > 0) {
    recommendations.push(`Update ${pluginsNeedingUpdate} WordPress plugin${pluginsNeedingUpdate > 1 ? 's' : ''} to latest versions.`);
  }
  if (securityFlags.length > 0) {
    recommendations.push(`Address security flags: ${securityFlags.join(', ')}.`);
  }
  if (uptimePercent < 99.9) {
    recommendations.push(`Investigate uptime issues — current month uptime is ${uptimePercent}%.`);
  }
  if (critical > 0) {
    recommendations.push(`Resolve ${critical} critical issue${critical > 1 ? 's' : ''} as a priority.`);
  }
  if (pwRegressions > 0) {
    recommendations.push(`Review ${pwRegressions} visual regression${pwRegressions > 1 ? 's' : ''} in the QA checks.`);
  }
  if (wpformStats.length > 0 && totalCompletedLastMonth > 0 && totalCompletedThisMonth < totalCompletedLastMonth * 0.7) {
    const drop = Math.round((1 - totalCompletedThisMonth / totalCompletedLastMonth) * 100);
    recommendations.push(`Form completions dropped ${drop}% vs last month (${totalCompletedThisMonth} vs ${totalCompletedLastMonth}) — review form visibility and functionality.`);
  }
  if (wpformStats.length > 0 && (totalCompletedThisMonth + totalAbandonedThisMonth) > 0) {
    const rate = Math.round((totalAbandonedThisMonth / (totalCompletedThisMonth + totalAbandonedThisMonth)) * 100);
    if (rate > 20) {
      const topReason = wpAbandonReasons[0];
      recommendations.push(`Form abandonment rate is ${rate}% this month${topReason ? ` — top reason: "${topReason.field}" (${topReason.count} entries)` : ''}.`);
    }
  }
  if (reportSecurity?.malware_found) recommendations.push('Malware detected by Wordfence — immediate review and cleanup required.');
  if (reportSecurity && !reportSecurity.waf_enabled) recommendations.push('Wordfence WAF is disabled — enable it for firewall protection against complex attacks.');
  if (reportSecurity && reportSecurity.scan_issues_count > 5) recommendations.push(`Wordfence scan has ${reportSecurity.scan_issues_count} open issues — review and resolve promptly.`);

  if (recommendations.length === 0) {
    recommendations.push('All systems healthy. Continue monitoring and schedule the next quarterly review.');
  }

  // ── Phase 1d: 5-pillar executive score ──────────────────────────────────────
  const perfLatest = perfRows?.[0] as { performance_score: number | null; accessibility_score: number | null; seo_score: number | null } | undefined;
  const perfPrev = perfRows?.[1] as { performance_score: number | null } | undefined;
  const seoAudit = seoRows?.[0] as { score: number | null; broken_links_count: number; has_sitemap: boolean | null; missing_titles: number } | undefined;
  const clarityMetrics = clarityRows?.[0]?.metrics as { rageClicks?: number; deadClicks?: number; jsErrors?: number; scrollDepth?: number } | undefined;
  const gaMetrics = gaRows?.[0]?.metrics as { sessions?: number; engagementRate?: number; previousPeriod?: { sessions?: number } | null } | undefined;
  const a11yLatest = a11yRows?.[0] as { a11y_serious_count: number; a11y_violation_count: number } | undefined;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  // Performance pillar — Lighthouse desktop score.
  const performancePillar = typeof perfLatest?.performance_score === 'number' ? clamp(perfLatest.performance_score) : null;

  // SEO pillar — crawl audit score, else Lighthouse SEO score.
  const seoPillar =
    typeof seoAudit?.score === 'number' ? clamp(seoAudit.score)
    : typeof perfLatest?.seo_score === 'number' ? clamp(perfLatest.seo_score)
    : null;

  // Accessibility pillar — Lighthouse a11y score, penalised by serious axe violations.
  let accessibilityPillar: number | null = null;
  if (typeof perfLatest?.accessibility_score === 'number') {
    accessibilityPillar = clamp(perfLatest.accessibility_score - (a11yLatest?.a11y_serious_count ?? 0) * 5);
  } else if (a11yLatest) {
    accessibilityPillar = clamp(100 - a11yLatest.a11y_serious_count * 10 - a11yLatest.a11y_violation_count * 2);
  }

  // UX pillar — Clarity friction signals (rage/dead clicks, JS errors), else GA engagement.
  let uxPillar: number | null = null;
  if (clarityMetrics) {
    uxPillar = clamp(
      100 -
      (clarityMetrics.rageClicks ?? 0) * 2 -
      Math.floor((clarityMetrics.deadClicks ?? 0) / 2) -
      (clarityMetrics.jsErrors ?? 0) * 3,
    );
  } else if (typeof gaMetrics?.engagementRate === 'number') {
    uxPillar = clamp(gaMetrics.engagementRate);
  }

  // Reliability pillar — uptime, penalised by critical issues.
  const reliabilityPillar = clamp(uptimePercent - critical * 10);

  const pillarValues = [performancePillar, uxPillar, seoPillar, accessibilityPillar, reliabilityPillar]
    .filter((v): v is number => typeof v === 'number');
  const overall = pillarValues.length > 0
    ? Math.round(pillarValues.reduce((s, v) => s + v, 0) / pillarValues.length)
    : currentScore;

  const pillars: ReportPillars = {
    performance: performancePillar,
    ux: uxPillar,
    seo: seoPillar,
    accessibility: accessibilityPillar,
    reliability: reliabilityPillar,
    overall,
  };

  // ── Phase 1d: what-changed (real diffs, current vs previous) ─────────────────
  const changes: ReportChange[] = [];
  const pushChange = (
    metric: string,
    current: number,
    previous: number,
    higherIsBetter: boolean,
    unit?: string,
  ) => {
    if (previous === 0 && current === 0) return;
    const deltaPct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 1000) / 10;
    const direction: ReportChange['direction'] = current > previous ? 'up' : current < previous ? 'down' : 'flat';
    if (direction === 'flat') return;
    changes.push({
      metric,
      current,
      previous,
      deltaPct,
      direction,
      good: higherIsBetter ? current >= previous : current <= previous,
      unit,
    });
  };

  pushChange('Health score', currentScore, previousScore, true);
  pushChange('Uptime', uptimePercent, previousUptimePercent, true, '%');
  if (perfLatest?.performance_score != null && perfPrev?.performance_score != null) {
    pushChange('Performance score', clamp(perfLatest.performance_score), clamp(perfPrev.performance_score), true);
  }
  if (gaMetrics?.sessions != null && gaMetrics?.previousPeriod?.sessions != null) {
    pushChange('Sessions', gaMetrics.sessions, gaMetrics.previousPeriod.sessions, true);
  }
  if (typeof totalCompletedThisMonth === 'number' && totalCompletedLastMonth > 0) {
    pushChange('Form submissions', totalCompletedThisMonth, totalCompletedLastMonth, true);
  }

  // ── Phase 1d: impact-ranked recommendations (weighted by traffic) ────────────
  // Traffic factor: high-traffic sites get SEO/perf/UX recs boosted (those issues
  // affect more visitors). log-scaled so it saturates rather than dominating.
  // Use GA sessions for traffic weighting; fall back to real-user session count.
  const sessions = gaMetrics?.sessions ?? 0;
  const trafficSessions = sessions > 0 ? sessions : (rumSessionCount ?? 0);
  const trafficFactor = trafficSessions > 0 ? Math.min(1.5, Math.log10(trafficSessions + 1) / 2) : 0;

  // Field (real-user) LCP p75 — the experience actual visitors get.
  const lcpVals = (rumVitalRows ?? []).map((r) => Number((r as { value: number }).value)).filter((n) => isFinite(n)).sort((a, b) => a - b);
  const fieldLcpP75 = lcpVals.length ? lcpVals[Math.max(0, Math.min(lcpVals.length - 1, Math.ceil(0.75 * lcpVals.length) - 1))] : null;
  const SEVERITY_WEIGHT = { high: 60, medium: 30, low: 12 } as const;
  const TRAFFIC_RELEVANT = new Set(['SEO', 'Performance', 'UX', 'Forms']);

  const rec = (
    text: string,
    priority: 'high' | 'medium' | 'low',
    category: string,
  ): ReportRecommendation => {
    const base = SEVERITY_WEIGHT[priority];
    const boost = TRAFFIC_RELEVANT.has(category) ? base * trafficFactor : 0;
    return { text, priority, category, impactScore: Math.round(base + boost) };
  };

  const ranked: ReportRecommendation[] = [];
  if (reportSecurity?.malware_found) ranked.push(rec('Malware detected by Wordfence — immediate review and cleanup required.', 'high', 'Security'));
  if (critical > 0) ranked.push(rec(`Resolve ${critical} critical issue${critical > 1 ? 's' : ''} as a priority.`, 'high', 'Reliability'));
  if (uptimePercent < 99.9) ranked.push(rec(`Investigate uptime issues — uptime is ${uptimePercent}% this period.`, 'high', 'Reliability'));
  if (seoAudit && seoAudit.broken_links_count > 0) ranked.push(rec(`Fix ${seoAudit.broken_links_count} broken link${seoAudit.broken_links_count > 1 ? 's' : ''} found in the SEO crawl.`, seoAudit.broken_links_count > 5 ? 'high' : 'medium', 'SEO'));
  if (seoAudit?.has_sitemap === false) ranked.push(rec('Publish an XML sitemap to improve search-engine indexing.', 'medium', 'SEO'));
  if (seoAudit && seoAudit.missing_titles > 0) ranked.push(rec(`Add title tags to ${seoAudit.missing_titles} page${seoAudit.missing_titles > 1 ? 's' : ''} missing them.`, 'medium', 'SEO'));
  if (typeof performancePillar === 'number' && performancePillar < 70) ranked.push(rec(`Improve page performance — desktop score is ${performancePillar}/100.`, performancePillar < 50 ? 'high' : 'medium', 'Performance'));
  if (typeof fieldLcpP75 === 'number' && fieldLcpP75 > 2500) ranked.push(rec(`Real visitors experience slow loading — field LCP (p75) is ${(fieldLcpP75 / 1000).toFixed(1)}s${rumSessionCount ? ` across ${rumSessionCount.toLocaleString()} sessions` : ''}. Aim for under 2.5s.`, fieldLcpP75 > 4000 ? 'high' : 'medium', 'Performance'));
  if (typeof accessibilityPillar === 'number' && accessibilityPillar < 80) ranked.push(rec(`Address accessibility — ${a11yLatest?.a11y_serious_count ?? 0} serious WCAG violation${(a11yLatest?.a11y_serious_count ?? 0) === 1 ? '' : 's'} detected.`, accessibilityPillar < 60 ? 'high' : 'medium', 'Accessibility'));
  if ((clarityMetrics?.rageClicks ?? 0) > 10) ranked.push(rec(`Reduce UX friction — ${clarityMetrics!.rageClicks} rage-click sessions detected.`, 'medium', 'UX'));
  if (pluginsNeedingUpdate > 0) ranked.push(rec(`Update ${pluginsNeedingUpdate} WordPress plugin${pluginsNeedingUpdate > 1 ? 's' : ''} to the latest versions.`, 'medium', 'WordPress'));
  if (securityFlags.length > 0) ranked.push(rec(`Address security flags: ${securityFlags.join(', ')}.`, 'medium', 'Security'));
  if (wpformStats.length > 0 && totalCompletedLastMonth > 0 && totalCompletedThisMonth < totalCompletedLastMonth * 0.7) {
    const drop = Math.round((1 - totalCompletedThisMonth / totalCompletedLastMonth) * 100);
    ranked.push(rec(`Form completions dropped ${drop}% vs last month — review form visibility and functionality.`, 'high', 'Forms'));
  }
  const rankedRecommendations = ranked.sort((a, b) => b.impactScore - a.impactScore);

  const siteData = site as { name?: string; url?: string } | null;

  return {
    health: { score: currentScore, previousScore, uptimePercent, previousUptimePercent },
    pillars,
    changes,
    issues: {
      open,
      resolved: resolvedIssues?.length ?? 0,
      critical,
      high,
      medium,
      low,
      newThisPeriod: issues.length,
      topIssues: issues
        .filter((i) => i.severity === 'critical' || i.severity === 'high')
        .slice(0, 5)
        .map((i) => ({
          title: i.title,
          severity: i.severity,
          category: i.category,
          status: i.status,
          detected_at: i.detected_at,
        })),
    },
    wordpress: {
      version: wpSnap?.wp_version ?? null,
      phpVersion: (wpSnap as { php_version?: string } | undefined)?.php_version ?? null,
      pluginsNeedingUpdate,
      securityFlags,
      lastSync: wpSnap?.created_at ?? null,
    },
    playwright: {
      totalChecks: pwChecks.length,
      passed: pwPassed,
      failed: pwFailed,
      regressions: pwRegressions,
      passRate: pwPassRate,
    },
    forms: {
      detected: fChecks.length,
      tested: fChecks.filter((c) => c.status !== 'not_tested').length,
      passed: fPassed,
      ...(wpformStats.length > 0 && {
        wpforms: wpformStats,
        fieldBreakdowns: wpFieldBreakdowns.length > 0 ? wpFieldBreakdowns : undefined,
        abandonmentReasons: wpAbandonReasons.length > 0 ? wpAbandonReasons : undefined,
        totalCompletedThisMonth,
        totalAbandonedThisMonth,
        totalCompletedLastMonth,
      }),
    },
    security: reportSecurity,
    recommendations,
    rankedRecommendations,
    siteName: siteData?.name ?? 'Unknown site',
    siteUrl: siteData?.url ?? '',
    generatedAt: new Date().toISOString(),
  };
}
