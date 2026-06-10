import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

// Triggers the Watchtower Playwright GitHub Actions workflow via workflow_dispatch.
// Playwright can't run inside the Vercel serverless runtime, so the actual browser
// scan happens in CI. Requires these env vars:
//   GITHUB_REPO   e.g. "wetpaint/eye-of-horus-2point0"
//   GITHUB_TOKEN  a PAT or fine-grained token with "actions: write" on the repo
//   GITHUB_REF    optional branch/ref to run on (defaults to "main")
//   GITHUB_WORKFLOW_FILE optional workflow filename (defaults to "playwright.yml")
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const ref = process.env.GITHUB_REF || "main";
  const workflow = process.env.GITHUB_WORKFLOW_FILE || "playwright.yml";

  if (!repo || !token) {
    return NextResponse.json(
      {
        ok: false,
        error: "Playwright runs happen in GitHub Actions, which isn't configured.",
        detail:
          "Set GITHUB_REPO and GITHUB_TOKEN (actions: write) env vars, or run `npm run check:playwright` locally / on a schedule.",
      },
      { status: 503 },
    );
  }

  let testForms = false;
  let siteId = "";
  try {
    const body = await request.json();
    testForms = body?.testForms === true;
    siteId = typeof body?.siteId === "string" ? body.siteId : "";
  } catch {
    /* no body is fine */
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: { test_forms: String(testForms), site_id: siteId },
      }),
    });

    if (res.status === 204) {
      return NextResponse.json({ ok: true, message: "Watchtower scan triggered." });
    }
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `GitHub returned HTTP ${res.status}`, detail },
      { status: 502 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Could not reach GitHub", detail: String(err) },
      { status: 502 },
    );
  }
}
