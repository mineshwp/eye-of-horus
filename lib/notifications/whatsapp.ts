export interface WhatsAppResult {
  sent: boolean;
  /** True when sending was skipped because Twilio isn't configured (not a real send). */
  skipped?: boolean;
  error?: string;
}

export async function sendWhatsApp(to: string, body: string): Promise<WhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    // Do NOT report success — surface the misconfiguration honestly so the
    // notification log records a 'skipped' entry instead of a fake 'sent'.
    console.warn(`[whatsapp] Not configured (TWILIO_* missing) — skipping send to ${to}`);
    return { sent: false, skipped: true, error: 'WhatsApp not configured (TWILIO_* env vars missing)' };
  }

  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const fromNumber = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: body }).toString(),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('[whatsapp] Send failed:', err);
      return { sent: false, error: err.slice(0, 200) };
    }

    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp] Error:', msg);
    return { sent: false, error: msg };
  }
}

export function buildWhatsAppAlertMessage(params: {
  siteName: string;
  siteUrl: string;
  alertType: string;
  issueTitle: string;
  severity: string;
  detectedAt: string;
  dashboardUrl: string;
}): string {
  const { siteName, siteUrl, alertType, issueTitle, severity, detectedAt, dashboardUrl } = params;
  const severityEmoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : '🟡';
  return `${severityEmoji} *Eye of Horus Alert*

*Client:* ${siteName}
*Site:* ${siteUrl}
*Alert:* ${alertType}
*Issue:* ${issueTitle}
*Severity:* ${severity.toUpperCase()}
*Detected:* ${detectedAt}

View dashboard: ${dashboardUrl}`;
}
