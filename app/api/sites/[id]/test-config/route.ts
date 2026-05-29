import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiUser, unauthorizedResponse } from "@/lib/auth/index";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface TestPage {
  path: string;
  label?: string;
  visual?: boolean;
}

export interface TestForm {
  path: string;
  label?: string;
  selector?: string;
  fields?: Record<string, string>;
  successText?: string;
}

export interface TestConfig {
  pages: TestPage[];
  forms: TestForm[];
}

const EMPTY: TestConfig = { pages: [], forms: [] };

function sanitize(input: unknown): TestConfig {
  const obj = (input ?? {}) as Record<string, unknown>;
  const pages = Array.isArray(obj.pages) ? obj.pages : [];
  const forms = Array.isArray(obj.forms) ? obj.forms : [];
  return {
    pages: pages
      .map((p) => p as Record<string, unknown>)
      .filter((p) => typeof p.path === "string" && (p.path as string).trim())
      .map((p) => ({
        path: (p.path as string).trim(),
        label: typeof p.label === "string" ? p.label : undefined,
        visual: p.visual !== false,
      })),
    forms: forms
      .map((f) => f as Record<string, unknown>)
      .filter((f) => typeof f.path === "string" && (f.path as string).trim())
      .map((f) => ({
        path: (f.path as string).trim(),
        label: typeof f.label === "string" ? f.label : undefined,
        selector: typeof f.selector === "string" && f.selector.trim() ? f.selector.trim() : undefined,
        fields:
          f.fields && typeof f.fields === "object"
            ? Object.fromEntries(
                Object.entries(f.fields as Record<string, unknown>)
                  .filter(([, v]) => typeof v === "string")
                  .map(([k, v]) => [k, v as string]),
              )
            : undefined,
        successText: typeof f.successText === "string" ? f.successText : undefined,
      })),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const supabase = getServerClient();
  const { data, error } = await supabase.from("sites").select("test_config").eq("id", id).single();

  if (error || !data) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  return NextResponse.json({ config: sanitize(data.test_config) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = sanitize((body as Record<string, unknown>)?.config ?? EMPTY);

  const supabase = getServerClient();
  const { error } = await supabase.from("sites").update({ test_config: config }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, config });
}
