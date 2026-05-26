import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { compileReport } from '@/lib/reports/compiler';
import { buildDailyEmailHtml, buildDailyEmailText, sendEmail } from '@/lib/reports/email-template';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Protect with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all active sites
  const { data: sites } = await supabase.from('sites').select('id, name, url').not('url', 'is', null);

  if (!sites || sites.length === 0) {
    return NextResponse.json({ ok: true, message: 'No sites to report on' });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Compile reports for all sites in parallel (batch 5 at a time)
  const siteReports: Array<{ siteName: string; content: Awaited<ReturnType<typeof compileReport>> }> = [];

  for (let i = 0; i < sites.length; i += 5) {
    const batch = (sites as Array<{ id: string; name: string; url: string }>).slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (site) => {
        const content = await compileReport(site.id, todayStart, now);
        return { siteName: site.name, content };
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') siteReports.push(result.value);
    }
  }

  const dateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const html = buildDailyEmailHtml(siteReports, dateStr);
  const text = buildDailyEmailText(siteReports, dateStr);

  // Get alert email recipients from env
  const recipients = (process.env.ALERT_EMAIL_RECIPIENTS || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.log('[email-daily] No ALERT_EMAIL_RECIPIENTS configured — logging summary');
    console.log(text);
    return NextResponse.json({ ok: true, message: 'No recipients configured — logged to console' });
  }

  const sent = await sendEmail(recipients, `Eye of Horus Daily — ${dateStr}`, html, text);

  return NextResponse.json({
    ok: sent,
    sites: siteReports.length,
    recipients: recipients.length,
    date: dateStr,
  });
}
