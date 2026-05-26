const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Parse .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.trim();
    }
  });
}

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!dbPassword || !supabaseUrl) {
  console.error("Missing database password or url in env");
  process.exit(1);
}

// Hostname can be extracted from supabaseUrl: https://[ref].supabase.co
const projectRef = supabaseUrl.split('//')[1].split('.')[0];
const dbHost = 'aws-0-eu-west-1.pooler.supabase.com';

const config = {
  host: dbHost,
  port: 6543,
  database: 'postgres',
  user: `postgres.${projectRef}`,
  password: dbPassword,
  ssl: { rejectUnauthorized: false }
};

const migrations = [
  { file: '20260522000000_init_schema.sql', checkTable: 'sites' },
  { file: '20260523000000_phase1_extended.sql', checkTable: 'profiles' },
  { file: '20260523200000_phase2_monitoring.sql', checkTable: 'uptime_checks' },
  { file: '20260523300000_phase3_wordpress.sql', checkTable: 'wordpress_snapshots' },
  { file: '20260523400000_phase4_playwright.sql', checkTable: 'playwright_checks' },
  { file: '20260523500000_phase5_reports.sql', checkTable: 'reports' },
  { file: '20260523600000_phase6_analytics.sql', checkTable: 'site_integrations' },
  { file: '20260523700000_phase7_ai.sql', checkTable: 'ai_messages' }
];

async function checkTableExists(client, tableName) {
  try {
    const res = await client.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );`,
      [tableName]
    );
    return res.rows[0].exists;
  } catch (err) {
    console.error(`Error checking if table ${tableName} exists:`, err.message);
    return false;
  }
}

async function run() {
  const client = new Client(config);
  try {
    console.log(`Connecting to database at ${dbHost}...`);
    await client.connect();
    console.log("Connected successfully.\n");

    for (const m of migrations) {
      console.log(`Checking table '${m.checkTable}' for migration '${m.file}'...`);
      const exists = await checkTableExists(client, m.checkTable);
      
      if (exists) {
        console.log(`-> Migration '${m.file}' is already applied.`);
      } else {
        console.log(`-> Migration '${m.file}' is missing. Executing...`);
        const migrationFilePath = path.resolve(__dirname, `../supabase/migrations/${m.file}`);
        if (!fs.existsSync(migrationFilePath)) {
          console.error(`Migration file ${m.file} not found!`);
          continue;
        }
        
        const sql = fs.readFileSync(migrationFilePath, 'utf8');
        try {
          await client.query(sql);
          console.log(`-> SUCCESS: Migration '${m.file}' applied.`);
        } catch (execErr) {
          console.error(`-> FAILED executing '${m.file}':`, execErr.message);
        }
      }
      console.log();
    }
  } catch (err) {
    console.error("Database connection/migration error:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
