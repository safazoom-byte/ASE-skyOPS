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

async function update() {
  try {
    console.log("Updating airport name...");
    await sql`
      UPDATE airports SET name = 'HMB', code = 'HMB' WHERE name = 'Default Airport';
    `;
    
    console.log("Updating user role...");
    const updated = await sql`
      UPDATE user_profiles SET role = 'super_admin' WHERE email = 'safazoom@gmail.com' RETURNING *;
    `;
    console.log("Updated user:", updated);

    console.log("Done");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await sql.end();
  }
}

update();
