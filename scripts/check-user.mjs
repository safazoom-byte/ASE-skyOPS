import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

let databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const match = envFile.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
    if (match) {
      databaseUrl = match[1];
    }
  } catch (e) {}
}

const sql = postgres(databaseUrl, { ssl: 'require' });

async function checkUser() {
  try {
    const res = await sql`SELECT email, role, airport_id FROM user_profiles WHERE email = 'mrzegho@icloud.com'`;
    console.log('USER_RESULT:', res);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await sql.end();
  }
}

checkUser();
