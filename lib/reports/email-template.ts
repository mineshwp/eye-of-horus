import type { ReportContent } from './types';

export function buildDailyEmailHtml(reports: Array<{ siteName: string; content: ReportContent }>, date: string): string {
  const critical = reports.filter((r) => r.content.issues.critical > 0);
  const attention = reports.filter((r) => r.content.health.score < 80 && r.content.issues.critical === 0);
  const healthy = reports.filter((r) => r.content.health.score >= 80 && r.content.issues.critical === 0);

  const siteRow = (r: { siteName: string; content: ReportContent }) => {
    const c = r.content;
    const statusColor = c.issues.critical > 0 ? '#EF4444' : c.health.score < 80 ? '#F59E0B' : '#22C55E';
    const statusText = c.issues.critical > 0 ? 'Critical' : c.health.score < 80 ? 'Attention' : 'Healthy';
    return `
      <tr style="border-bottom:1px solid #1e2432;">
        <td style="padding:12px 16px;font-weight:500;color:#e8e9ec;">${r.siteName}</td>
        <td style="padding:12px 16px;"><span style="color:${statusColor};font-weight:600;">${statusText}</span></td>
        <td style="padding:12px 16px;color:#9ba3af;">${c.health.score}/100</td>
        <td style="padding:12px 16px;color:#9ba3af;">${c.health.uptimePercent}%</td>
        <td style="padding:12px 16px;color:${c.issues.critical > 0 ? '#EF4444' : '#9ba3af'};">${c.issues.critical} critical</td>
        <td style="padding:12px 16px;color:#9ba3af;">${c.issues.open} open</td>
      </tr>
    `;
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Eye of Horus Daily Summary — ${date}</title></head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e9ec;">
  <div style="max-width:680px;margin:0 auto;padding:32px 24px;">

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #1e2432;">
      <div>
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Eye of Horus</div>
        <div style="font-size:22px;font-weight:600;color:#e8e9ec;">Daily Site Summary</div>
      </div>
      <div style="font-size:13px;color:#6b7280;">${date}</div>
    </div>

    ${critical.length > 0 ? `
    <div style="background:#1a0a0a;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#EF4444;margin-bottom:8px;">⚠ ${critical.length} site${critical.length > 1 ? 's' : ''} need immediate attention</div>
      ${critical.map((r) => `<div style="font-size:13px;color:#fca5a5;padding:4px 0;">· ${r.siteName} — ${r.content.issues.critical} critical issue${r.content.issues.critical > 1 ? 's' : ''}</div>`).join('')}
    </div>
    ` : ''}

    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#EF4444;">${critical.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Critical</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#F59E0B;">${attention.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Attention</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#22C55E;">${healthy.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Healthy</div>
      </div>
      <div style="flex:1;background:#0f1117;border:1px solid #1e2432;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:600;color:#e8e9ec;">${reports.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em;">Total sites</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#0f1117;border:1px solid #1e2432;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#0a0c12;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Site</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Status</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Health</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Uptime</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Critical</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Open</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map(siteRow).join('')}
      </tbody>
    </table>

    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #1e2432;text-align:center;font-size:11px;color:#4b5563;">
      Eye of Horus · Agency monitoring platform · Wetpaint
    </div>
  </div>
</body>
</html>`;
}

export function buildDailyEmailText(reports: Array<{ siteName: string; content: ReportContent }>, date: string): string {
  const lines = [
    `Eye of Horus Daily Summary — ${date}`,
    '='.repeat(50),
    '',
    `Total sites: ${reports.length}`,
    `Critical: ${reports.filter((r) => r.content.issues.critical > 0).length}`,
    `Attention: ${reports.filter((r) => r.content.health.score < 80).length}`,
    '',
    'Site Status:',
    '-'.repeat(30),
    ...reports.map((r) => {
      const c = r.content;
      const status = c.issues.critical > 0 ? 'CRITICAL' : c.health.score < 80 ? 'ATTENTION' : 'HEALTHY';
      return `${r.siteName}: ${status} | Health: ${c.health.score}/100 | Uptime: ${c.health.uptimePercent}% | Issues: ${c.issues.open} open`;
    }),
  ];
  return lines.join('\n');
}

export async function sendEmail(to: string | string[], subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS || 'reports@eyeofhorus.agency';

  if (!apiKey) {
    // Log to console when not configured — useful for development
    console.log(`[email] Would send to: ${Array.isArray(to) ? to.join(', ') : to}`);
    console.log(`[email] Subject: ${subject}`);
    console.log(`[email] Body preview: ${text.slice(0, 200)}...`);
    return true;
  }

  // Resend API (https://resend.com) — set RESEND_API_KEY as EMAIL_PROVIDER_API_KEY
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[email] Send failed:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email] Send error:', err);
    return false;
  }
}
