import { NextRequest, NextResponse } from 'next/server';
import { sendAlert, type AlertType } from '@/lib/notifications/alerts';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const { siteId, siteName, siteUrl, alertType, issueTitle, severity, issueId } = body as {
    siteId?: string;
    siteName?: string;
    siteUrl?: string;
    alertType?: AlertType;
    issueTitle?: string;
    severity?: 'critical' | 'high' | 'medium';
    issueId?: string;
  };

  if (!siteId || !alertType || !issueTitle) {
    return NextResponse.json(
      { error: 'siteId, alertType, and issueTitle are required' },
      { status: 400 },
    );
  }

  const result = await sendAlert({
    siteId,
    siteName: siteName ?? siteId,
    siteUrl: siteUrl ?? '',
    alertType,
    issueTitle,
    severity: severity ?? 'critical',
    issueId,
    detectedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, ...result });
}
