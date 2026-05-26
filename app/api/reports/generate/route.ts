import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { compileReport } from '@/lib/reports/compiler';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { siteId, clientId, reportType = 'monthly', periodStart, periodEnd } = (body as {
    siteId?: string;
    clientId?: string;
    reportType?: string;
    periodStart?: string;
    periodEnd?: string;
  }) || {};

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Default period: current month
  const now = new Date();
  const start = periodStart ? new Date(periodStart) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodEnd ? new Date(periodEnd) : now;

  // Generate a unique share token
  const shareToken = crypto.randomBytes(24).toString('hex');

  // Insert placeholder report
  const { data: report, error: insertErr } = await supabase
    .from('reports')
    .insert({
      site_id: siteId,
      client_id: clientId || null,
      report_type: reportType,
      period_start: start.toISOString().split('T')[0],
      period_end: end.toISOString().split('T')[0],
      status: 'generating',
      share_token: shareToken,
      title: `${reportType === 'monthly' ? 'Monthly' : 'Daily'} Report — ${start.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`,
    })
    .select()
    .single();

  if (insertErr || !report) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 });
  }

  try {
    // Compile report data
    const content = await compileReport(siteId, start, end);

    // Build executive summary
    const execSummary = [
      `${content.siteName} maintained a health score of ${content.health.score}/100 during this period.`,
      content.issues.critical > 0
        ? `${content.issues.critical} critical issue${content.issues.critical > 1 ? 's were' : ' was'} detected requiring immediate attention.`
        : 'No critical issues were detected.',
      content.issues.resolved > 0
        ? `${content.issues.resolved} issue${content.issues.resolved > 1 ? 's' : ''} resolved during this period.`
        : '',
      `Uptime maintained at ${content.health.uptimePercent}%.`,
      content.wordpress.pluginsNeedingUpdate > 0
        ? `${content.wordpress.pluginsNeedingUpdate} WordPress plugin update${content.wordpress.pluginsNeedingUpdate > 1 ? 's' : ''} pending.`
        : 'All WordPress plugins are up to date.',
    ].filter(Boolean).join(' ');

    // Update report with compiled content
    const { error: updateErr } = await supabase
      .from('reports')
      .update({
        status: 'ready',
        content,
        executive_summary: execSummary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    return NextResponse.json({
      ok: true,
      reportId: report.id,
      shareToken,
      shareUrl: `${process.env.APP_URL || ''}/report/${shareToken}`,
      executiveSummary: execSummary,
    });

  } catch (err: unknown) {
    await supabase.from('reports').update({ status: 'error' }).eq('id', report.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Report generation failed' },
      { status: 500 },
    );
  }
}
