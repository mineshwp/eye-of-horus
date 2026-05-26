const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually to get service role key and url
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
  console.log("Connecting to Supabase at " + supabaseUrl + "...");
  const { data: sites, error } = await supabase.from('sites').select('*');
  if (error) {
    console.error("Error fetching sites:", error);
    return;
  }
  console.log("Current sites in DB:");
  sites.forEach(s => console.log(`- ${s.id}: ${s.name} (${s.url})`));

  // Find sites to delete (case insensitive checking for reporting or minesh)
  const toDelete = sites.filter(s => 
    s.name.toLowerCase().includes('reporting') || 
    s.url.toLowerCase().includes('reporting') ||
    s.id.toLowerCase().includes('reporting') ||
    s.name.toLowerCase().includes('minesh') || 
    s.url.toLowerCase().includes('minesh') ||
    s.id.toLowerCase().includes('minesh')
  );

  if (toDelete.length === 0) {
    console.log("\nNo sites matching 'reporting' or 'minesh' found in DB.");
  } else {
    console.log("\nFound sites to delete:", toDelete.map(s => `${s.id} (${s.name})`));
    for (const site of toDelete) {
      console.log(`Deleting site: ${site.id}...`);
      const { error: delErr } = await supabase.from('sites').delete().eq('id', site.id);
      if (delErr) {
        console.error(`Error deleting site ${site.id}:`, delErr);
      } else {
        console.log(`Successfully deleted site ${site.id}`);
      }
    }
  }
}

run();
