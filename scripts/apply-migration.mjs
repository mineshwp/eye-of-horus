// Apply a SINGLE migration file to the live Supabase Postgres.
//
// Unlike run-migrations.ts (which re-runs every file, including the destructive
// clear_seed_data migration), this applies only the file you name — safe to run
// at the end of a phase.
//
// Usage:
//   node scripts/apply-migration.mjs 20260603100000_seo_crawl.sql
//   node scripts/apply-migration.mjs            # applies the newest .sql file
//
// Reads SUPABASE_DB_PASSWORD and NEXT_PUBLIC_SUPABASE_URL from .env.local.
import { Client } from "pg";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

const password = process.env.SUPABASE_DB_PASSWORD;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!password || !url) {
  console.error("Missing SUPABASE_DB_PASSWORD or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
const ref = process.env.SUPABASE_PROJECT_REF || new URL(url).hostname.split(".")[0];

// Supabase deprecated direct IPv4 access to db.<ref>.supabase.co. Prefer the
// connection pooler (IPv4) cached by the CLI in supabase/.temp/pooler-url, and
// inject the DB password into it.
function buildConnectionString() {
  const poolerFile = join(process.cwd(), "supabase", ".temp", "pooler-url");
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync(poolerFile)) {
    const raw = readFileSync(poolerFile, "utf8").trim();
    return raw.replace(/^(postgresql:\/\/[^:@/]+)@/, `$1:${encodeURIComponent(password)}@`);
  }
  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const arg = process.argv[2];
const file =
  arg ??
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .at(-1);

if (!file) {
  console.error("No migration file found");
  process.exit(1);
}

const sql = readFileSync(join(migrationsDir, file), "utf8");

const client = new Client({
  connectionString: buildConnectionString(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Connected (project ${ref}) — applying ${file}`);
  await client.query(sql);
  console.log(`  ✓ ${file} applied successfully`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("already exists") || msg.includes("duplicate")) {
    console.log(`  ⚠ ${file} — some objects already exist (likely already applied): ${msg}`);
  } else {
    console.error(`  ✗ ${file} — ERROR: ${msg}`);
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
