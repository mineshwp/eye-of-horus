#!/usr/bin/env node
// Eye of Horus — Morning Digest sender (cloud, no Claude required)
//
// Fetches the morning-summary Edge Function and emails a formatted digest via
// Resend. Designed to run from GitHub Actions on a daily cron, so delivery does
// not depend on the Claude app being open or on any network allowlist.
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL   e.g. https://axojqlmrjjgrcumnjsiw.supabase.co
//   SUMMARY_SECRET             the x-eoh-secret value set on the Edge Function
//   EMAIL_PROVIDER_API_KEY     Resend API key
// Optional env:
//   EMAIL_FROM_ADDRESS         default: reports@eyeofhorus.agency
//   DIGEST_TO                  default: minesh@wetpaint.co.za

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUMMARY_SECRET;
const RESEND_KEY = process.env.EMAIL_PROVIDER_API_KEY;
const FROM = process.env.EMAIL_FROM_ADDRESS || "reports@eyeofhorus.agency";
const TO = process.env.DIGEST_TO || "minesh@wetpaint.co.za";

function fail(msg) {
  console.error(`[morning-digest] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("NEXT_PUBLIC_SUPABASE_URL is not set");
if (!SECRET) fail("SUMMARY_SECRET is not set");

const ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/morning-summary`;

const today = new Date().toLocaleDateString("en-ZA", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

async function sendEmail(subject, html, text) {
  if (!RESEND_KEY) {
    console.log("[morning-digest] EMAIL_PROVIDER_API_KEY not set — printing instead:");
    console.log(subject);
    console.log(text);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html, text }),
  });
  if (!res.ok) fail(`Resend send failed: ${res.status} ${await res.text()}`);
  console.log(`[morning-digest] Email sent to ${TO}`);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

async function main() {
  let data;
  try {
    const res = await fetch(ENDPOINT, { headers: { "x-eoh-secret": SECRET } });
    if (!res.ok) {
      const body = await res.text();
      // Email the failure so silence never hides a problem.
      const subject = `⚠️ Eye of Horus digest failed (${res.status}) · ${today}`;
      const msg = `The morning-summary function returned ${res.status}.\n\n${body}`;
      await sendEmail(subject, `<pre>${esc(msg)}</pre>`, msg);
      fail(`Endpoint returned ${res.status}: ${body}`);
    }
    data = await res.json();
  } catch (err) {
    const subject = `⚠️ Eye of Horus digest failed · ${today}`;
    const msg = `Could not reach the morning-summary function.\n\n${String(err)}`;
    await sendEmail(subject, `<pre>${esc(msg)}</pre>`, msg);
    fail(String(err));
  }

  const t = data.totals ?? {};
  const headline =
    `${t.open_issues ?? 0} open issues · ` +
    `${t.wp_updates_pending ?? 0} WP updates · ` +
    `${t.sites_down_24h ?? 0} sites with downtime · ` +
    `${t.form_failures_24h ?? 0} form fails · ` +
    `${t.watchtower_failures_24h ?? 0} watchtower fails`;

  const allClear =
    (t.open_issues ?? 0) === 0 &&
    (t.wp_updates_pending ?? 0) === 0 &&
    (t.sites_down_24h ?? 0) === 0 &&
    (t.form_failures_24h ?? 0) === 0 &&
    (t.watchtower_failures_24h ?? 0) === 0;

  // ── Plain-text body ──────────────────────────────────────────────────────
  const lines = [];
  lines.push(`Eye of Horus — Morning Health Digest · ${today}`);
  lines.push("");
  lines.push(allClear ? "✅ All clear across all sites." : `Headline: ${headline}`);
  lines.push("");

  if ((data.open_issues ?? []).length) {
    lines.push("── Open issues ──");
    for (const i of data.open_issues)
      lines.push(`• [${(i.severity || "").toUpperCase()}] ${i.site}: ${i.title} (${i.category})`);
    lines.push("");
  }
  if ((data.wp_updates ?? []).length) {
    lines.push("── WordPress updates pending ──");
    for (const w of data.wp_updates)
      lines.push(`• ${w.site}: ${w.target} ${w.from}→${w.to} (risk: ${w.risk})`);
    lines.push("");
  }
  if ((data.form_failures ?? []).length) {
    lines.push("── Form failures (24h) ──");
    for (const f of data.form_failures)
      lines.push(`• ${f.site}: ${f.form_name || f.page_url} — ${f.result_message || "failed"}`);
    lines.push("");
  }
  if ((data.watchtower_failures ?? []).length) {
    lines.push("── Watchtower failures (24h) ──");
    for (const c of data.watchtower_failures)
      lines.push(`• ${c.site} (${c.device}): ${c.summary || "check failed"}`);
    lines.push("");
  }

  lines.push("── Per-site (uptime 24h · performance) ──");
  for (const s of data.sites ?? []) {
    const up = s.uptime_24h;
    const upStr = up ? (up.uptime_pct === null ? "no checks" : `${up.uptime_pct}% up`) : "no data";
    const d = s.performance?.desktop?.score;
    const m = s.performance?.mobile?.score;
    const perfStr = `desktop ${d ?? "—"} / mobile ${m ?? "—"}`;
    const flags = [];
    if (up && up.down > 0) flags.push(`${up.down} down`);
    if (typeof d === "number" && d < 50) flags.push("desktop perf poor");
    if (typeof m === "number" && m < 50) flags.push("mobile perf poor");
    lines.push(`• ${s.name}: ${upStr} · ${perfStr}${flags.length ? `  ⚠️ ${flags.join(", ")}` : ""}`);
  }
  lines.push("");
  lines.push(allClear
    ? "Bottom line: nothing needs attention today."
    : "Bottom line: review the items above.");

  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.5">
    <h2 style="margin:0 0 4px">Eye of Horus — Morning Health Digest</h2>
    <div style="color:#666;margin-bottom:12px">${today}</div>
    <p style="font-weight:600">${allClear ? "✅ All clear across all sites." : esc(headline)}</p>
    <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f6f7f9;padding:12px;border-radius:8px">${esc(text)}</pre>
  </div>`;

  const subject = allClear
    ? `✅ Eye of Horus — all clear · ${today}`
    : `Eye of Horus digest: ${headline} · ${today}`;

  await sendEmail(subject, html, text);
}

main();
