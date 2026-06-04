import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/reports/email-template';
import { sendWhatsApp, buildWhatsAppAlertMessage } from './whatsapp';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertType =
  | 'site_down'
  | 'ssl_critical'
  | 'ssl_expiring'
  | 'critical_issue'
  | 'http_error'
  | 'performance_critical'
  | 'domain_expiring'
  // Phase 1c — analytics-based triggers (email only for now)
  | 'performance_drop'
  | 'traffic_drop'
  | 'js_error_spike'
  | 'conversion_drop';

export interface AlertPayload {
  siteId: string;
  siteName: string;
  siteUrl: string;
  alertType: AlertType;
  issueTitle: string;
  severity: 'critical' | 'high' | 'medium';
  issueId?: string;
  detectedAt?: string;
  /**
   * When true, only the email channel is used and WhatsApp is skipped.
   * TODO(whatsapp): enable WhatsApp for analytics-based triggers later — the user
   * deferred WhatsApp wiring for these new trigger types (2026-06-03).
   */
  emailOnly?: boolean;
}

interface AlertSettings {
  email_recipients: string[];
  whatsapp_recipients: string[];
  email_alerts_enabled: boolean;
  whatsapp_alerts_enabled: boolean;
  alert_on_site_down: boolean;
  alert_on_ssl_critical: boolean;
  alert_on_critical_issues: boolean;
  dedup_window_hours: number;
  // Phase 1c toggles (may be absent on older rows → treated as enabled)
  alert_on_performance_drop?: boolean;
  alert_on_traffic_drop?: boolean;
  alert_on_js_errors?: boolean;
  alert_on_conversion_drop?: boolean;
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Alert settings ───────────────────────────────────────────────────────────

export async function getAlertSettings(): Promise<AlertSettings | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const { data } = await supabase.from('alert_settings').select('*').eq('id', 1).single();
  return data as AlertSettings | null;
}

export async function updateAlertSettings(
  updates: Partial<Omit<AlertSettings, 'id'>>,
): Promise<boolean> {
  const supabase = getClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('alert_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 1);
  return !error;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function wasRecentlyAlerted(
  supabase: SupabaseClient,
  siteId: string,
  alertType: string,
  channel: string,
  windowHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('site_id', siteId)
    .eq('alert_type', alertType)
    .eq('channel', channel)
    .eq('status', 'sent')
    .gte('created_at', since)
    .limit(1);
  return !!(data && data.length > 0);
}

// ─── Log helper ───────────────────────────────────────────────────────────────

async function logNotification(
  supabase: SupabaseClient,
  params: {
    siteId: string;
    issueId?: string;
    channel: 'email' | 'whatsapp';
    recipient: string;
    status: 'sent' | 'failed' | 'skipped';
    alertType: string;
    subject?: string;
    message?: string;
    error?: string;
  },
) {
  await supabase.from('notification_logs').insert({
    site_id: params.siteId,
    issue_id: params.issueId ?? null,
    channel: params.channel,
    recipient: params.recipient,
    status: params.status,
    alert_type: params.alertType,
    subject: params.subject ?? null,
    message: params.message?.slice(0, 1000) ?? null,
    error: params.error?.slice(0, 500) ?? null,
  });
}

// ─── Email alert template ─────────────────────────────────────────────────────

function buildAlertEmailHtml(payload: AlertPayload, dashboardUrl: string): string {
  const severityColor =
    payload.severity === 'critical' ? '#EF4444' : payload.severity === 'high' ? '#F59E0B' : '#D9A05B';
  const alertTypeLabel: Record<AlertType, string> = {
    site_down: 'Site is down',
    ssl_critical: 'SSL certificate critical',
    ssl_expiring: 'SSL certificate expiring soon',
    critical_issue: 'Critical issue detected',
    http_error: 'HTTP error',
    performance_critical: 'Performance critical',
    domain_expiring: 'Domain expiring soon',
    performance_drop: 'Performance score dropped',
    traffic_drop: 'Traffic dropped sharply',
    js_error_spike: 'JavaScript errors spiked',
    conversion_drop: 'Form submissions dropped',
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Eye of Horus Alert</title></head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e9ec;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #1e2432;">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;">Eye of Horus · Urgent Alert</div>
      <div style="font-size:20px;font-weight:600;color:#e8e9ec;">Action required: ${alertTypeLabel[payload.alertType] ?? payload.alertType}</div>
    </div>

    <div style="background:#1a0808;border:1px solid rgba(239,68,68,0.35);border-left:3px solid ${severityColor};border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${severityColor};margin-bottom:8px;">${payload.severity.toUpperCase()} SEVERITY</div>
      <div style="font-size:17px;font-weight:600;color:#e8e9ec;margin-bottom:6px;">${payload.issueTitle}</div>
      <div style="font-size:13px;color:#9ba3af;margin-top:6px;">Client: <strong style="color:#e8e9ec;">${payload.siteName}</strong></div>
      <div style="font-size:13px;color:#9ba3af;margin-top:2px;">Website: <a href="${payload.siteUrl}" style="color:#00E5FF;">${payload.siteUrl}</a></div>
      <div style="font-size:12px;color:#6b7280;margin-top:8px;">Detected: ${payload.detectedAt ?? new Date().toISOString()}</div>
    </div>

    <div style="margin-bottom:24px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#D9A05B;color:#0a0c12;font-weight:600;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">
        View in Eye of Horus →
      </a>
    </div>

    <div style="font-size:11px;color:#4b5563;border-top:1px solid #1e2432;padding-top:16px;">
      This is an automated alert from Eye of Horus. You are receiving this because you are listed as an alert recipient.
      To adjust alert settings, visit the monitoring configuration page.
    </div>
  </div>
</body>
</html>`;
}

function buildAlertEmailText(payload: AlertPayload, dashboardUrl: string): string {
  return `EYE OF HORUS ALERT — ${payload.severity.toUpperCase()}

Client: ${payload.siteName}
Website: ${payload.siteUrl}
Issue: ${payload.issueTitle}
Severity: ${payload.severity.toUpperCase()}
Detected: ${payload.detectedAt ?? new Date().toISOString()}

View dashboard: ${dashboardUrl}`;
}

// ─── Main: send alert for a site event ───────────────────────────────────────

export async function sendAlert(payload: AlertPayload): Promise<{
  emailsSent: number;
  whatsappSent: number;
  skipped: number;
}> {
  const supabase = getClient();
  if (!supabase) return { emailsSent: 0, whatsappSent: 0, skipped: 0 };

  const settings = await getAlertSettings();
  if (!settings) return { emailsSent: 0, whatsappSent: 0, skipped: 0 };

  // Respect a manual snooze on the linked issue (Issue detail → "Snooze · 24h").
  if (payload.issueId) {
    const { data: snoozedIssue } = await supabase
      .from('issues')
      .select('snoozed_until')
      .eq('id', payload.issueId)
      .maybeSingle();
    const snoozedUntil = (snoozedIssue as { snoozed_until?: string | null } | null)?.snoozed_until;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) {
      console.log(`[alerts] Snooze skip — issue ${payload.issueId} snoozed until ${snoozedUntil}`);
      return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
    }
  }

  // Check if this alert type is enabled
  if (payload.alertType === 'site_down' && !settings.alert_on_site_down) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  if (
    (payload.alertType === 'ssl_critical' || payload.alertType === 'ssl_expiring') &&
    !settings.alert_on_ssl_critical
  ) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  if (payload.alertType === 'critical_issue' && !settings.alert_on_critical_issues) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  // Phase 1c analytics triggers — default enabled when the column is absent/null.
  if (payload.alertType === 'performance_drop' && settings.alert_on_performance_drop === false) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  if (payload.alertType === 'traffic_drop' && settings.alert_on_traffic_drop === false) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  if (payload.alertType === 'js_error_spike' && settings.alert_on_js_errors === false) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }
  if (payload.alertType === 'conversion_drop' && settings.alert_on_conversion_drop === false) {
    return { emailsSent: 0, whatsappSent: 0, skipped: 1 };
  }

  const appUrl = process.env.APP_URL ?? 'https://eyeofhorus.agency';
  const dashboardUrl = `${appUrl}/sites/${payload.siteId}`;
  const detectedAt = payload.detectedAt ?? new Date().toISOString();
  const subject = `[${payload.severity.toUpperCase()}] ${payload.siteName} — ${payload.issueTitle}`;

  let emailsSent = 0;
  let whatsappSent = 0;
  let skipped = 0;

  // ── Email alerts ──────────────────────────────────────────────────────────
  if (settings.email_alerts_enabled && settings.email_recipients.length > 0) {
    // Dedup: only send if not already alerted via email for this site + alert type recently
    const alreadySent = await wasRecentlyAlerted(
      supabase,
      payload.siteId,
      payload.alertType,
      'email',
      settings.dedup_window_hours,
    );

    if (alreadySent) {
      skipped++;
      console.log(`[alerts] Email dedup skip — ${payload.siteName} ${payload.alertType} (within ${settings.dedup_window_hours}h)`);
    } else {
      const html = buildAlertEmailHtml({ ...payload, detectedAt }, dashboardUrl);
      const text = buildAlertEmailText({ ...payload, detectedAt }, dashboardUrl);
      const sent = await sendEmail(settings.email_recipients, subject, html, text);

      for (const recipient of settings.email_recipients) {
        await logNotification(supabase, {
          siteId: payload.siteId,
          issueId: payload.issueId,
          channel: 'email',
          recipient,
          status: sent ? 'sent' : 'failed',
          alertType: payload.alertType,
          subject,
          message: text,
        });
      }

      if (sent) emailsSent++;
    }
  }

  // ── WhatsApp alerts ───────────────────────────────────────────────────────
  // emailOnly skips WhatsApp (deferred for the Phase 1c analytics triggers).
  if (!payload.emailOnly && settings.whatsapp_alerts_enabled && settings.whatsapp_recipients.length > 0) {
    const alreadySent = await wasRecentlyAlerted(
      supabase,
      payload.siteId,
      payload.alertType,
      'whatsapp',
      settings.dedup_window_hours,
    );

    if (alreadySent) {
      skipped++;
    } else {
      const waBody = buildWhatsAppAlertMessage({
        siteName: payload.siteName,
        siteUrl: payload.siteUrl,
        alertType: payload.alertType,
        issueTitle: payload.issueTitle,
        severity: payload.severity,
        detectedAt,
        dashboardUrl,
      });

      for (const recipient of settings.whatsapp_recipients) {
        const result = await sendWhatsApp(recipient, waBody);
        await logNotification(supabase, {
          siteId: payload.siteId,
          issueId: payload.issueId,
          channel: 'whatsapp',
          recipient,
          status: result.skipped ? 'skipped' : result.sent ? 'sent' : 'failed',
          alertType: payload.alertType,
          message: waBody,
          error: result.error,
        });
        if (result.sent) whatsappSent++;
        else if (result.skipped) skipped++;
      }
    }
  }

  return { emailsSent, whatsappSent, skipped };
}

// ─── Convenience: evaluate check results and fire alerts automatically ────────

export async function fireAlertsForCheckResults(
  results: Array<{
    siteId: string;
    siteName: string;
    siteUrl: string;
    uptimeStatus: 'up' | 'down' | 'degraded';
    status: 'healthy' | 'attention' | 'critical';
    sslCheck?: { valid: boolean; daysRemaining: number | null };
    domainCheck?: { daysRemaining: number | null };
    issuesCreated: string[];
  }>,
): Promise<{ totalEmailsSent: number; totalWhatsappSent: number }> {
  let totalEmailsSent = 0;
  let totalWhatsappSent = 0;

  for (const result of results) {
    const detectedAt = new Date().toISOString();

    if (result.uptimeStatus === 'down') {
      const r = await sendAlert({
        siteId: result.siteId,
        siteName: result.siteName,
        siteUrl: result.siteUrl,
        alertType: 'site_down',
        issueTitle: `${result.siteName} is unreachable`,
        severity: 'critical',
        detectedAt,
      });
      totalEmailsSent += r.emailsSent;
      totalWhatsappSent += r.whatsappSent;
    }

    if (result.sslCheck && result.sslCheck.valid && result.sslCheck.daysRemaining !== null) {
      if (result.sslCheck.daysRemaining < 7) {
        const r = await sendAlert({
          siteId: result.siteId,
          siteName: result.siteName,
          siteUrl: result.siteUrl,
          alertType: 'ssl_critical',
          issueTitle: `SSL certificate expires in ${result.sslCheck.daysRemaining} day${result.sslCheck.daysRemaining === 1 ? '' : 's'}`,
          severity: 'critical',
          detectedAt,
        });
        totalEmailsSent += r.emailsSent;
        totalWhatsappSent += r.whatsappSent;
      }
    }

    if (result.domainCheck && result.domainCheck.daysRemaining !== null && result.domainCheck.daysRemaining < 7) {
      const r = await sendAlert({
        siteId: result.siteId,
        siteName: result.siteName,
        siteUrl: result.siteUrl,
        alertType: 'domain_expiring',
        issueTitle: `Domain expires in ${result.domainCheck.daysRemaining} day${result.domainCheck.daysRemaining === 1 ? '' : 's'} — renew immediately`,
        severity: 'critical',
        detectedAt,
      });
      totalEmailsSent += r.emailsSent;
      totalWhatsappSent += r.whatsappSent;
    }

    if (result.status === 'critical' && result.issuesCreated.length > 0) {
      const r = await sendAlert({
        siteId: result.siteId,
        siteName: result.siteName,
        siteUrl: result.siteUrl,
        alertType: 'critical_issue',
        issueTitle: result.issuesCreated[0],
        severity: 'critical',
        detectedAt,
      });
      totalEmailsSent += r.emailsSent;
      totalWhatsappSent += r.whatsappSent;
    }
  }

  return { totalEmailsSent, totalWhatsappSent };
}

// ─── Phase 1c: analytics-based alerts (email only) ────────────────────────────
// Diffs the latest vs previous snapshot tables to detect meaningful drops/spikes.
// WhatsApp is intentionally skipped (emailOnly) until WhatsApp wiring is added.

const PERF_DROP_POINTS = 15;        // performance score drop that triggers an alert
const TRAFFIC_DROP_PCT = 0.3;       // 30% session drop vs previous period
const TRAFFIC_MIN_PREV_SESSIONS = 50;
const JS_ERROR_MIN = 5;             // minimum js errors before a spike counts
const JS_ERROR_SPIKE_FACTOR = 2;    // latest >= 2× previous
const CONVERSION_DROP_PCT = 0.4;    // 40% drop in monthly form submissions
const CONVERSION_MIN_PREV = 5;

export async function fireAnalyticsAlerts(): Promise<{
  emailsSent: number;
  skipped: number;
  evaluated: number;
}> {
  const supabase = getClient();
  if (!supabase) return { emailsSent: 0, skipped: 0, evaluated: 0 };

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, url')
    .eq('status', 'active');
  if (!sites || sites.length === 0) return { emailsSent: 0, skipped: 0, evaluated: 0 };

  let emailsSent = 0;
  let skipped = 0;
  let evaluated = 0;

  for (const site of sites as Array<{ id: string; name: string; url: string }>) {
    const base = { siteId: site.id, siteName: site.name, siteUrl: site.url, emailOnly: true as const };
    const fire = async (
      alertType: AlertType,
      issueTitle: string,
      severity: 'critical' | 'high' | 'medium',
    ) => {
      evaluated++;
      const r = await sendAlert({ ...base, alertType, issueTitle, severity });
      emailsSent += r.emailsSent;
      skipped += r.skipped;
    };

    // ── Performance-score drop (desktop) ──────────────────────────────────────
    const { data: perf } = await supabase
      .from('performance_metrics')
      .select('performance_score, created_at')
      .eq('site_id', site.id)
      .eq('device', 'desktop')
      .order('created_at', { ascending: false })
      .limit(2);
    if (perf && perf.length === 2) {
      const latest = perf[0].performance_score as number | null;
      const prev = perf[1].performance_score as number | null;
      if (typeof latest === 'number' && typeof prev === 'number' && prev - latest >= PERF_DROP_POINTS) {
        await fire('performance_drop', `Desktop performance score fell ${prev} → ${latest} (−${prev - latest} pts)`, 'high');
      }
    }

    // ── Traffic drop (GA4 sessions vs previous period) ────────────────────────
    const { data: ga } = await supabase
      .from('analytics_snapshots')
      .select('metrics, created_at')
      .eq('site_id', site.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const gaMetrics = ga?.[0]?.metrics as
      | { sessions?: number; previousPeriod?: { sessions?: number } | null }
      | undefined;
    if (gaMetrics) {
      const cur = gaMetrics.sessions ?? 0;
      const prevSessions = gaMetrics.previousPeriod?.sessions ?? 0;
      if (
        prevSessions >= TRAFFIC_MIN_PREV_SESSIONS &&
        cur < prevSessions * (1 - TRAFFIC_DROP_PCT)
      ) {
        const pct = Math.round(((prevSessions - cur) / prevSessions) * 100);
        await fire('traffic_drop', `Sessions down ${pct}% vs previous period (${prevSessions} → ${cur})`, 'high');
      }
    }

    // ── JS-error spike (Microsoft Clarity) ────────────────────────────────────
    const { data: clarity } = await supabase
      .from('clarity_snapshots')
      .select('metrics, created_at')
      .eq('site_id', site.id)
      .order('created_at', { ascending: false })
      .limit(2);
    if (clarity && clarity.length === 2) {
      const latestErr = Number((clarity[0].metrics as { jsErrors?: number } | null)?.jsErrors ?? 0);
      const prevErr = Number((clarity[1].metrics as { jsErrors?: number } | null)?.jsErrors ?? 0);
      if (latestErr >= JS_ERROR_MIN && latestErr >= Math.max(prevErr, 1) * JS_ERROR_SPIKE_FACTOR) {
        await fire('js_error_spike', `JavaScript errors spiked ${prevErr} → ${latestErr} sessions affected`, 'medium');
      }
    }

    // ── Conversion drop (WordPress form submissions, month over month) ────────
    const { data: wp } = await supabase
      .from('wordpress_snapshots')
      .select('form_data, created_at')
      .eq('site_id', site.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const forms = wp?.[0]?.form_data as
      | Array<{ submissions_month?: number; submissions_prev_month?: number }>
      | undefined;
    if (Array.isArray(forms) && forms.length > 0) {
      const curSub = forms.reduce((s, f) => s + (Number(f.submissions_month) || 0), 0);
      const prevSub = forms.reduce((s, f) => s + (Number(f.submissions_prev_month) || 0), 0);
      if (prevSub >= CONVERSION_MIN_PREV && curSub < prevSub * (1 - CONVERSION_DROP_PCT)) {
        const pct = Math.round(((prevSub - curSub) / prevSub) * 100);
        await fire('conversion_drop', `Form submissions down ${pct}% month-over-month (${prevSub} → ${curSub})`, 'high');
      }
    }
  }

  return { emailsSent, skipped, evaluated };
}
