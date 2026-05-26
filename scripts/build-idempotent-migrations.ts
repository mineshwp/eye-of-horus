import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

// Regex: matches the first line of any CREATE POLICY statement
// Groups: (1) full quoted or unquoted name, (2) table ref e.g. public.sites or just sites
const POLICY_RE = /^CREATE POLICY\s+("(?:[^"]+)"|[a-zA-Z_][a-zA-Z0-9_ ]*)\s+ON\s+((?:public\.)?[a-zA-Z_][a-zA-Z0-9_]*)/m;

function transformSQL(sql: string): string {
  const lines = sql.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(POLICY_RE);
    if (m) {
      const policyName = m[1];   // e.g. "Allow public select on sites"
      const tableName  = m[2];   // e.g. public.sites
      out.push(`DROP POLICY IF EXISTS ${policyName} ON ${tableName};`);
    }
    out.push(line);
  }

  return out.join('\n');
}

let combined = `-- Eye of Horus — Combined Idempotent Migrations
-- Generated: ${new Date().toISOString()}
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to run multiple times — DROP POLICY IF EXISTS guards prevent duplicates.

`;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  combined += `-- ${'='.repeat(60)}\n-- ${file}\n-- ${'='.repeat(60)}\n\n`;
  combined += transformSQL(sql);
  combined += '\n\n';
}

const outPath = join(process.cwd(), 'supabase', 'all_migrations_combined.sql');
writeFileSync(outPath, combined);
console.log(`Written ${combined.split('\n').length} lines → ${outPath}`);
