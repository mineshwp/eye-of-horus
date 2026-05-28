import { notFound } from 'next/navigation';
import { PrintButton } from './PrintButton';
import type { ReportContent, ReportIssue, WPFormStat, WPFormBreakdown, ReportSecurity } from '@/lib/reports/types';

interface ReportPageProps {
  params: Promise<{ token: string }>;
}

interface ReportRecord {
  id: string;
  period_start: string;
  period_end: string;
  executive_summary: string | null;
  content: ReportContent;
}

async function getReport(token: string): Promise<ReportRecord | null> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/reports/share/${token}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.report ?? null;
  } catch {
    return null;
  }
}

export default async function PublicReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  const report = await getReport(token);

  if (!report) {
    notFound();
  }

  const content = report.content;
  const periodStart = new Date(report.period_start);
  const periodEnd = new Date(report.period_end);
  const periodLabel = `${periodStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })} – ${periodEnd.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const healthColor = content.health.score >= 90 ? '#22C55E' : content.health.score >= 75 ? '#F59E0B' : '#EF4444';
  const healthDelta = content.health.score - content.health.previousScore;
  const uptimeDelta = content.health.uptimePercent - content.health.previousUptimePercent;

  return (
    <div className="report-container">
      {/* Header */}
      <div className="report-header">
        <div>
          <div className="report-logo">Eye of Horus · Website Report</div>
          <div className="report-title">{content.siteName}</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{content.siteUrl}</div>
        </div>
        <div className="report-meta">
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, color: '#111827', marginBottom: 2 }}>{periodLabel}</div>
            <div>Generated {new Date(content.generatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <PrintButton />
        </div>
      </div>

      {/* Executive Summary */}
      <div className="report-section">
        <div className="section-title">Executive Summary</div>
        <div style={{ fontSize: 15, color: '#374151', lineHeight: 1.7, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          {report.executive_summary}
        </div>
      </div>

      {/* Health Metrics */}
      <div className="report-section">
        <div className="section-title">Health Overview</div>
        <div className="metric-grid">
          <div className="metric-card" style={{ borderTop: `3px solid ${healthColor}` }}>
            <div className="metric-label">Health Score</div>
            <div className="metric-value" style={{ color: healthColor }}>
              {content.health.score}
              <span style={{ fontSize: 14, color: '#9ca3af' }}>/100</span>
            </div>
            <div className={`metric-delta ${healthDelta >= 0 ? 'delta-up' : 'delta-down'}`}>
              {healthDelta >= 0 ? '▲' : '▼'} {Math.abs(healthDelta)} vs last period
            </div>
            <div className="health-bar">
              <div className="health-fill" style={{ width: `${content.health.score}%`, background: healthColor }} />
            </div>
          </div>
          <div className="metric-card" style={{ borderTop: '3px solid #22C55E' }}>
            <div className="metric-label">Uptime</div>
            <div className="metric-value" style={{ color: '#22C55E' }}>
              {content.health.uptimePercent}
              <span style={{ fontSize: 14, color: '#9ca3af' }}>%</span>
            </div>
            <div className={`metric-delta ${uptimeDelta >= 0 ? 'delta-up' : 'delta-down'}`}>
              {uptimeDelta >= 0 ? '▲' : '▼'} {Math.abs(uptimeDelta).toFixed(2)}% vs last period
            </div>
          </div>
          <div className="metric-card" style={{ borderTop: '3px solid #EF4444' }}>
            <div className="metric-label">Critical Issues</div>
            <div className="metric-value" style={{ color: content.issues.critical > 0 ? '#EF4444' : '#22C55E' }}>
              {content.issues.critical}
            </div>
            <div className="metric-delta" style={{ color: '#6b7280' }}>{content.issues.open} total open</div>
          </div>
          <div className="metric-card" style={{ borderTop: '3px solid #3B82F6' }}>
            <div className="metric-label">Issues Resolved</div>
            <div className="metric-value" style={{ color: '#3B82F6' }}>{content.issues.resolved}</div>
            <div className="metric-delta" style={{ color: '#6b7280' }}>this period</div>
          </div>
        </div>
      </div>

      {/* Issues */}
      {content.issues.topIssues && content.issues.topIssues.length > 0 && (
        <div className="report-section">
          <div className="section-title">Issues This Period</div>
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0 20px' }}>
            {content.issues.topIssues.map((issue: ReportIssue, i: number) => (
              <div key={i} className="issue-row">
                <span className={`severity-badge sev-${issue.severity}`}>{issue.severity}</span>
                <span style={{ flex: 1, color: '#374151' }}>{issue.title}</span>
                <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{issue.status}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            Showing top {content.issues.topIssues.length} of {content.issues.newThisPeriod} issues detected this period.
          </div>
        </div>
      )}

      {/* WordPress */}
      {content.wordpress.version && (
        <div className="report-section print-break">
          <div className="section-title">WordPress Status</div>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">WP Version</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginTop: 4 }}>{content.wordpress.version}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">PHP Version</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginTop: 4 }}>{content.wordpress.phpVersion || '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Plugin Updates</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: content.wordpress.pluginsNeedingUpdate > 0 ? '#F59E0B' : '#22C55E', marginTop: 4 }}>
                {content.wordpress.pluginsNeedingUpdate}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>pending updates</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Security Flags</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: content.wordpress.securityFlags?.length > 0 ? '#EF4444' : '#22C55E', marginTop: 4 }}>
                {content.wordpress.securityFlags?.length || 0}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {content.wordpress.securityFlags?.join(', ') || 'None detected'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QA Checks */}
      {content.playwright.totalChecks > 0 && (
        <div className="report-section">
          <div className="section-title">Automated QA Checks</div>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Pass Rate</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: content.playwright.passRate >= 90 ? '#22C55E' : '#EF4444' }}>
                {content.playwright.passRate}%
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Checks</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{content.playwright.totalChecks}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Visual Regressions</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: content.playwright.regressions > 0 ? '#EF4444' : '#22C55E' }}>
                {content.playwright.regressions}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WPForms Submission Data */}
      {content.forms.wpforms && content.forms.wpforms.length > 0 && (
        <div className="report-section print-break">
          <div className="section-title">Form Performance</div>

          {/* Summary KPIs */}
          <div className="metric-grid" style={{ marginBottom: 20 }}>
            <div className="metric-card" style={{ borderTop: '3px solid #22C55E' }}>
              <div className="metric-label">Completed this month</div>
              <div className="metric-value" style={{ color: '#22C55E' }}>{(content.forms.totalCompletedThisMonth ?? 0).toLocaleString()}</div>
              {(content.forms.totalCompletedLastMonth ?? 0) > 0 && (
                <div className={`metric-delta ${(content.forms.totalCompletedThisMonth ?? 0) >= (content.forms.totalCompletedLastMonth ?? 0) ? 'delta-up' : 'delta-down'}`}>
                  {(content.forms.totalCompletedThisMonth ?? 0) >= (content.forms.totalCompletedLastMonth ?? 0) ? '▲' : '▼'} {Math.abs((content.forms.totalCompletedThisMonth ?? 0) - (content.forms.totalCompletedLastMonth ?? 0))} vs last month
                </div>
              )}
            </div>
            <div className="metric-card" style={{ borderTop: '3px solid #F59E0B' }}>
              <div className="metric-label">Abandoned this month</div>
              <div className="metric-value" style={{ color: (content.forms.totalAbandonedThisMonth ?? 0) > 0 ? '#F59E0B' : '#22C55E' }}>{(content.forms.totalAbandonedThisMonth ?? 0).toLocaleString()}</div>
              {((content.forms.totalCompletedThisMonth ?? 0) + (content.forms.totalAbandonedThisMonth ?? 0)) > 0 && (
                <div className="metric-delta" style={{ color: '#6b7280' }}>
                  {Math.round(((content.forms.totalAbandonedThisMonth ?? 0) / ((content.forms.totalCompletedThisMonth ?? 0) + (content.forms.totalAbandonedThisMonth ?? 0))) * 100)}% abandonment rate
                </div>
              )}
            </div>
          </div>

          {/* Per-form table */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '10px 20px', background: '#f3f4f6', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <div>Form</div>
              <div style={{ textAlign: 'right' }}>Completed ✓</div>
              <div style={{ textAlign: 'right' }}>Abandoned ✗</div>
              <div style={{ textAlign: 'right' }}>This month</div>
              <div style={{ textAlign: 'right' }}>Last month</div>
            </div>
            {content.forms.wpforms.map((f: WPFormStat, i: number) => {
              const trend = f.completedMonth - f.completedLast;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px 20px', borderTop: '1px solid #e5e7eb', alignItems: 'center' }}>
                  <div style={{ fontWeight: 500, color: '#111827', fontSize: 14 }}>{f.name}</div>
                  <div style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{f.completedTotal.toLocaleString()}</div>
                  <div style={{ textAlign: 'right', color: f.abandonedTotal > 0 ? '#d97706' : '#6b7280' }}>{f.abandonedTotal.toLocaleString()}</div>
                  <div style={{ textAlign: 'right' }}>{f.completedMonth.toLocaleString()}</div>
                  <div style={{ textAlign: 'right', color: '#6b7280' }}>
                    {f.completedLast.toLocaleString()}
                    {f.completedLast > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: trend >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {trend >= 0 ? '▲' : '▼'}{Math.abs(trend)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Abandonment reasons */}
          {content.forms.abandonmentReasons && content.forms.abandonmentReasons.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Top reasons for abandonment (last 30 days)</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {content.forms.abandonmentReasons.map((r, i) => (
                  <div key={i} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 16px', textAlign: 'center', minWidth: 140 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{r.count}</div>
                    <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>{r.field} not filled</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field breakdowns */}
          {content.forms.fieldBreakdowns && content.forms.fieldBreakdowns.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Field breakdowns (last 30 days · completed entries)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {content.forms.fieldBreakdowns.map((bd: WPFormBreakdown, bi: number) => {
                  const maxCount = bd.values[0]?.count ?? 1;
                  const total = bd.values.reduce((s, v) => s + v.count, 0);
                  return (
                    <div key={bi} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{bd.field}</div>
                      {bd.values.slice(0, 8).map((v, vi) => (
                        <div key={vi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                            <span style={{ color: '#374151' }}>{v.value || '(empty)'}</span>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{v.count} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({Math.round((v.count / total) * 100)}%)</span></span>
                          </div>
                          <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${Math.round((v.count / maxCount) * 100)}%`, background: '#3b82f6', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                      {bd.values.length > 8 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>+{bd.values.length - 8} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security (Wordfence) */}
      {content.security && (
        <div className="report-section print-break">
          <div className="section-title">Security (Wordfence)</div>
          {(() => {
            const sec = content.security as ReportSecurity;
            const attackRows = [
              { label: 'Today',  d: sec.attacks_today  },
              { label: 'Week',   d: sec.attacks_week   },
              { label: 'Month',  d: sec.attacks_month  },
            ];
            return (
              <>
                {/* Status items */}
                <div className="metric-grid" style={{ marginBottom: 20 }}>
                  <div className="metric-card">
                    <div className="metric-label">WAF</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: sec.waf_enabled ? '#22C55E' : '#EF4444', marginTop: 4 }}>
                      {sec.waf_enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Web Application Firewall</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Firewall Rules</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: sec.waf_rules_premium ? '#0D9488' : '#F59E0B', marginTop: 4 }}>
                      {sec.waf_rules_premium ? 'Premium' : 'Free'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sec.waf_rules_premium ? 'Real-time rule updates' : 'Delayed rule updates'}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">IP Blocklist</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: sec.ip_blocklist_enabled ? '#22C55E' : '#F59E0B', marginTop: 4 }}>
                      {sec.ip_blocklist_enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Real-time IP blocklist</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Brute Force</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: sec.brute_force_enabled ? '#22C55E' : '#F59E0B', marginTop: 4 }}>
                      {sec.brute_force_enabled ? 'Protected' : 'Disabled'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Login brute force protection</div>
                  </div>
                </div>

                {/* Attack summary table */}
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ padding: '10px 20px', background: '#f3f4f6', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    Attacks Blocked by Wordfence Firewall
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '8px 20px', fontSize: 11, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    <div>Period</div>
                    <div style={{ textAlign: 'right' as const }}>Complex</div>
                    <div style={{ textAlign: 'right' as const }}>Brute Force</div>
                    <div style={{ textAlign: 'right' as const }}>Blocklist</div>
                    <div style={{ textAlign: 'right' as const }}>Total</div>
                  </div>
                  {attackRows.map(({ label, d }) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 20px', borderTop: '1px solid #e5e7eb', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{label}</div>
                      <div style={{ textAlign: 'right' as const }}>{d.complex.toLocaleString()}</div>
                      <div style={{ textAlign: 'right' as const }}>{d.brute_force.toLocaleString()}</div>
                      <div style={{ textAlign: 'right' as const }}>{d.blocklist.toLocaleString()}</div>
                      <div style={{ textAlign: 'right' as const, fontWeight: 700, color: d.total > 0 ? '#111827' : '#9ca3af' }}>{d.total.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Scan issues count */}
                {sec.scan_issues_count > 0 && (
                  <div style={{ background: sec.malware_found ? '#fef2f2' : '#fffbeb', border: `1px solid ${sec.malware_found ? '#fecaca' : '#fde68a'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: sec.malware_found ? '#dc2626' : '#d97706' }}>{sec.scan_issues_count}</span>
                    <span style={{ fontSize: 13, color: sec.malware_found ? '#991b1b' : '#92400e' }}>
                      {sec.malware_found ? 'Wordfence scan detected malware — immediate action required.' : `Wordfence scan has ${sec.scan_issues_count} open issue${sec.scan_issues_count !== 1 ? 's' : ''} — review recommended.`}
                    </span>
                  </div>
                )}

                {/* Top countries */}
                {sec.top_countries && sec.top_countries.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Top Countries by Attacks — Last 7 Days</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                      {sec.top_countries.slice(0, 5).map((c, i) => (
                        <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const, minWidth: 120 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{c.count.toLocaleString()}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{c.country}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last scan time */}
                {sec.last_scan_time && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                    Last Wordfence scan: {new Date(sec.last_scan_time).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Recommendations */}
      <div className="report-section">
        <div className="section-title">Recommendations</div>
        <ul className="rec-list">
          {content.recommendations.map((rec: string, i: number) => (
            <li key={i}>{rec}</li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="report-footer">
        <div>Prepared by Wetpaint · Eye of Horus platform</div>
        <div>Confidential — {new Date(content.generatedAt).toLocaleDateString('en-ZA')}</div>
      </div>
    </div>
  );
}
