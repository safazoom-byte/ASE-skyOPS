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

async function migrate() {
  try {
    console.log("Creating airports table...");
    await sql`
      CREATE TABLE IF NOT EXISTS airports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        code TEXT NOT NULL
      );
    `;

    console.log("Adding airport_id to user_profiles...");
    await sql`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS airport_id UUID REFERENCES airports(id);
    `;
    
    const existingAirports = await sql`SELECT * FROM airports LIMIT 1`;
    let defaultAirportId;
    if (existingAirports.length === 0) {
      const inserted = await sql`
        INSERT INTO airports (name, code) VALUES ('Default Airport', 'DEF') RETURNING id;
      `;
      defaultAirportId = inserted[0].id;
    } else {
      defaultAirportId = existingAirports[0].id;
    }

    await sql`
      UPDATE user_profiles SET airport_id = ${defaultAirportId} WHERE airport_id IS NULL;
    `;
    
    await sql`
      UPDATE user_profiles SET role = 'admin' WHERE role = 'master';
    `;

    const tables = ['flights', 'staff', 'shifts', 'programs', 'leave_requests', 'incoming_duties', 'audit_logs'];
    
    for (const table of tables) {
      console.log(`Adding airport_id to ${table}...`);
      try {
        await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS airport_id UUID REFERENCES airports(id);`);
        await sql.unsafe(`UPDATE ${table} SET airport_id = '${defaultAirportId}' WHERE airport_id IS NULL;`);
      } catch(e) {
        console.log(`Error updating table ${table}: ${e.message}`);
      }
    }
    
    console.log("Migration successful");
  } catch(e) {
    console.error("Migration failed:", e);
  } finally {
    await sql.end();
  }
}

migrate();
