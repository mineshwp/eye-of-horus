import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DB_URL = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.${process.env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase Postgres');

  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`Running ${file}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.log(`  ⚠ ${file} — skipped (already applied)`);
      } else {
        console.error(`  ✗ ${file} — ERROR: ${msg}`);
        await client.end();
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log('\nAll migrations complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
