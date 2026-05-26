const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or service role key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking if 'ai_messages' table exists in Supabase...");
  
  // A simple select to check if the table exists
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
      console.log("'ai_messages' table does not exist. We need to run the SQL migration.");
      
      // Read SQL from migration file
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260523700000_phase7_ai.sql');
      if (!fs.existsSync(migrationPath)) {
        console.error("Migration file not found at: " + migrationPath);
        return;
      }
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log("Migration SQL content:");
      console.log(sql);
      
      console.log("\nNote: Standard supabase client cannot execute raw arbitrary DDL. We should check if we can run it via postgres connection or if the table is already there via a different migration or if we can run it.");
    } else {
      console.error("Error checking table:", error);
    }
  } else {
    console.log("'ai_messages' table exists! Code: Success.");
  }
}

run();
