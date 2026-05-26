import { notFound } from 'next/navigation';
import { PrintButton } from './PrintButton';
import type { ReportContent, ReportIssue } from '@/lib/reports/types';

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
