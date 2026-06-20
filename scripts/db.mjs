import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

// Read .env if running from workspace root
let databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const match = envFile.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
    if (match) {
      databaseUrl = match[1];
    }
  } catch (e) {
    // ignore
  }
}

if (!databaseUrl) {
  console.error('SUPABASE_DATABASE_URL environment variable is required.');
  process.exit(1);
}

const sql = postgres(databaseUrl, { ssl: 'require' });

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Please provide a SQL query as the first argument.");
    process.exit(1);
  }
  
  try {
    const result = await sql.unsafe(query);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
