import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

// GET /api/health — reports which server-side integrations are configured.
// Used by Settings → Integrations status so admins can see at a glance what
// is wired up vs. what silently no-ops. Never returns secret values, only booleans.
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const has = (...names: string[]) => names.every((n) => !!process.env[n]);

  const integrations = {
    supabaseServiceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
    ai: has("ANTHROPIC_API_KEY"),
    email: has("EMAIL_PROVIDER_API_KEY"),
    emailRecipients: !!process.env.ALERT_EMAIL_RECIPIENTS,
    whatsapp: has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"),
    pagespeed: has("PAGESPEED_API_KEY"),
    googleAnalytics: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN") || has("GOOGLE_SERVICE_ACCOUNT_JSON"),
    clarity: has("CLARITY_API_KEY"),
    playwright: has("GITHUB_REPO", "GITHUB_TOKEN"),
    cron: has("CRON_SECRET"),
  };

  const labels: Record<keyof typeof integrations, string> = {
    supabaseServiceRole: "Supabase service role",
    ai: "AI (Anthropic)",
    email: "Email delivery (Resend)",
    emailRecipients: "Alert email recipients",
    whatsapp: "WhatsApp (Twilio)",
    pagespeed: "PageSpeed Insights",
    googleAnalytics: "Google Analytics",
    clarity: "Microsoft Clarity",
    playwright: "Watchtower (GitHub Actions)",
    cron: "Scheduled jobs (cron)",
  };

  const items = (Object.keys(integrations) as Array<keyof typeof integrations>).map((key) => ({
    key,
    label: labels[key],
    configured: integrations[key],
  }));

  return NextResponse.json({ ok: true, integrations, items });
}
