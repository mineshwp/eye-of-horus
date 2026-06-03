import { NextRequest, NextResponse } from 'next/server';
import { getAlertSettings, updateAlertSettings } from '@/lib/notifications/alerts';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const settings = await getAlertSettings();
  if (!settings) return NextResponse.json({ settings: null, reason: 'Supabase not configured' });
  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const {
    emailRecipients,
    whatsappRecipients,
    emailEnabled,
    whatsappEnabled,
    alertOnSiteDown,
    alertOnSslCritical,
    alertOnCriticalIssues,
    dedupWindowHours,
    alertOnPerformanceDrop,
    alertOnTrafficDrop,
    alertOnJsErrors,
    alertOnConversionDrop,
  } = body as {
    emailRecipients?: string[];
    whatsappRecipients?: string[];
    emailEnabled?: boolean;
    whatsappEnabled?: boolean;
    alertOnSiteDown?: boolean;
    alertOnSslCritical?: boolean;
    alertOnCriticalIssues?: boolean;
    dedupWindowHours?: number;
    alertOnPerformanceDrop?: boolean;
    alertOnTrafficDrop?: boolean;
    alertOnJsErrors?: boolean;
    alertOnConversionDrop?: boolean;
  };

  const updates: Record<string, unknown> = {};
  if (emailRecipients !== undefined) updates.email_recipients = emailRecipients;
  if (whatsappRecipients !== undefined) updates.whatsapp_recipients = whatsappRecipients;
  if (emailEnabled !== undefined) updates.email_alerts_enabled = emailEnabled;
  if (whatsappEnabled !== undefined) updates.whatsapp_alerts_enabled = whatsappEnabled;
  if (alertOnSiteDown !== undefined) updates.alert_on_site_down = alertOnSiteDown;
  if (alertOnSslCritical !== undefined) updates.alert_on_ssl_critical = alertOnSslCritical;
  if (alertOnCriticalIssues !== undefined) updates.alert_on_critical_issues = alertOnCriticalIssues;
  if (dedupWindowHours !== undefined) updates.dedup_window_hours = dedupWindowHours;
  if (alertOnPerformanceDrop !== undefined) updates.alert_on_performance_drop = alertOnPerformanceDrop;
  if (alertOnTrafficDrop !== undefined) updates.alert_on_traffic_drop = alertOnTrafficDrop;
  if (alertOnJsErrors !== undefined) updates.alert_on_js_errors = alertOnJsErrors;
  if (alertOnConversionDrop !== undefined) updates.alert_on_conversion_drop = alertOnConversionDrop;

  const ok = await updateAlertSettings(updates as Parameters<typeof updateAlertSettings>[0]);
  if (!ok) return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });

  await logAudit({ actorEmail: user.email, action: 'alert_settings.update', targetType: 'alert_settings', detail: { keys: Object.keys(updates) } });

  const settings = await getAlertSettings();
  return NextResponse.json({ ok: true, settings });
}
