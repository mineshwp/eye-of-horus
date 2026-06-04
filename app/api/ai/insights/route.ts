import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ai, isAIConfigured } from '@/lib/ai/claude';
import { getApiUser, unauthorizedResponse } from '@/lib/auth/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Section = 'analytics' | 'seo' | 'performance' | 'security';

const SECTIONS: Section[] = ['analytics', 'seo', 'performance', 'security'];

const SECTION_FRAMING: Record<Section, string> = {
  analytics:
    'This is website analytics & visitor-behaviour data (traffic, engagement, channels, UX signals). Focus on what the numbers say about audience behaviour and growth.',
  seo:
    'This is SEO & search-performance data (rankings, clicks, impressions, technical audit, broken links). Focus on visibility, opportunities, and technical fixes.',
  performance:
    'This is site performance & reliability data (Core Web Vitals, page speed, uptime, accessibility). Focus on speed, stability, and user impact.',
  security:
    'This is website security data (SSL, domain expiry, firewall, malware scans, attack attempts). Focus on risk, exposure, and what needs hardening.',
};

function isSection(v: unknown): v is Section {
  return typeof v === 'string' && (SECTIONS as string[]).includes(v);
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// GET — return the most recent cached insight for a site + section.
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  const section = searchParams.get('section');

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  if (!isSection(section)) return NextResponse.json({ error: 'invalid section' }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ summary: null });

  const { data } = await supabase
    .from('ai_messages')
    .select('answer, created_at')
    .eq('site_id', siteId)
    .eq('message_type', 'summary')
    .eq('context->>section', section)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    summary: data?.answer ?? null,
    generatedAt: data?.created_at ?? null,
  });
}

// POST — generate a fresh insight for a site + section from the supplied context.
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const { siteId, section, context } = body as {
    siteId?: string;
    section?: string;
    context?: Record<string, unknown>;
  };

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  if (!isSection(section)) return NextResponse.json({ error: 'invalid section' }, { status: 400 });

  if (!isAIConfigured()) {
    return NextResponse.json({ summary: null, reason: 'ANTHROPIC_API_KEY not configured' });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ summary: null });

  const { data: site } = await supabase
    .from('sites')
    .select('name, url')
    .eq('id', siteId)
    .single();

  // Compact the context so we don't blow the prompt up with empty fields.
  const dataJson = JSON.stringify(context ?? {}, null, 2);

  const prompt = `Site: ${site?.name ?? 'Unknown'} (${site?.url ?? ''})
Section: ${section}
${SECTION_FRAMING[section]}

Latest ${section} data:
${dataJson}

Write a 2-3 sentence overview for the agency team. Cover: (1) what we learned from this data, (2) why it matters for this client, and (3) the recommended next step. Be specific to the numbers above — if the data is empty or not connected, say so and recommend connecting the relevant integration. Do not use bullet points or headings; write flowing prose.`;

  const result = await ai(prompt, { model: 'fast', maxTokens: 320 });

  if (result?.text) {
    await supabase.from('ai_messages').insert({
      site_id: siteId,
      message_type: 'summary',
      answer: result.text,
      model: result.model,
      tokens_used: result.inputTokens + result.outputTokens,
      context: { section },
    });
  }

  return NextResponse.json({ summary: result?.text ?? null, generatedAt: new Date().toISOString() });
}
