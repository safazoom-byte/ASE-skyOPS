import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgresql://postgres:9wiXukWsS308uISl@db.hldvxfurkstqhmmktxsz.supabase.co:5432/postgres', { ssl: 'require' });

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Please provide a query.");
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
