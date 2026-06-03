import { NextRequest, NextResponse } from "next/server";
import { ai, isAIConfigured } from "@/lib/ai/claude";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/ai/a11y-fix { rule, help, description, target } — a concrete,
// copy-pasteable fix for one accessibility violation.
export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { rule, help, description, target } = (await request.json().catch(() => ({}))) as {
    rule?: string; help?: string; description?: string; target?: string;
  };
  if (!help && !rule) return NextResponse.json({ error: "rule or help required" }, { status: 400 });
  if (!isAIConfigured()) return NextResponse.json({ fix: null, reason: "ANTHROPIC_API_KEY not configured" });

  const prompt = `An automated accessibility scan (axe-core) flagged this WCAG issue on a web page:

Rule: ${rule ?? "(unknown)"}
Issue: ${help ?? ""}
Detail: ${description ?? ""}
Example element selector: ${target ?? "(not provided)"}

Give a concise, practical fix a developer can apply. Include a short corrected HTML/CSS snippet where helpful. 3-5 sentences max. No preamble.`;

  const result = await ai(prompt, { model: "strategic", maxTokens: 400 });
  return NextResponse.json({ fix: result?.text ?? null });
}
