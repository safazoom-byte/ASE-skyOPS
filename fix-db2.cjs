const fs = require('fs');

const file = './services/supabaseService.ts';
let content = fs.readFileSync(file, 'utf-8');

const fns = [
  'upsertFlight',
  'upsertStaff',
  'upsertShift',
  'upsertLeave',
  'upsertLeaves',
  'upsertIncomingDuty',
  'upsertIncomingDuties',
  'savePrograms'
];

fns.forEach(fn => {
  const rx = new RegExp(`(async ${fn}\\(.*?\\) \\{\\s+const client = supabase;\\s+if \\(\\!client\\) return;\\s+)const session = await auth\\.getSession\\(\\);\\s+if \\(\\!session\\) return;`, 'g');
  content = content.replace(rx, `$1const ctx = await this.getMutationContext();\n    if (!ctx) return;`);
});

content = content.replace(/user_id: session\.user\.id/g, 'user_id: ctx.userId,\n        airport_id: ctx.airportId');
content = content.replace(/user_id: session\.user\.id,/g, 'user_id: ctx.userId,\n        airport_id: ctx.airportId,');

// There might be some manual fixes needed, let's just write to file and check
fs.writeFileSync(file, content, 'utf-8');
console.log("Updated supabaseService.ts context logic");
