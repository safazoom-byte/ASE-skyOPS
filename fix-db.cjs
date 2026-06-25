const fs = require('fs');
let content = fs.readFileSync('services/supabaseService.ts', 'utf8');

// Replacements for mutations
const mutationFunctions = [
    'upsertFlight', 'upsertStaff', 'upsertShift', 'upsertLeave', 'upsertLeaves',
    'upsertIncomingDuty', 'upsertIncomingDuties', 'deleteFlight', 'deleteStaff',
    'deleteShift', 'deleteLeave', 'deleteIncomingDuty', 'saveProgramVersion',
    'deleteProgramVersion'
];

for (const fn of mutationFunctions) {
    const regex = new RegExp(`(async ${fn}\\(.*?\\) \\{\\s+const client = supabase;\\s+if \\(\\!client\\) return;\\s+)const session = await auth\\.getSession\\(\\);\\s+if \\(\\!session\\) return;`, 'g');
    content = content.replace(regex, `$1const ctx = await this.getMutationContext();\n    if (!ctx) return;`);
    
    // Also replace in delete methods that don't have if(!client) return;
    const deleteRegex = new RegExp(`(async ${fn}\\(.*?\\) \\{\\s+const client = supabase;\\s+)const session = await auth\\.getSession\\(\\);\\s+if \\(client && session\\)`, 'g');
    content = content.replace(deleteRegex, `$1const ctx = await this.getMutationContext();\n    if (client && ctx)`);
}

// Replace user_id: session.user.id with user_id: ctx.userId, airport_id: ctx.airportId
content = content.replace(/user_id: session\.user\.id/g, 'user_id: ctx.userId,\n      airport_id: ctx.airportId');

// Replace .eq("user_id", session.user.id) with .eq(ctx.matchCol, ctx.matchVal)
// But only inside the functions we changed!
// A simpler regex is: if it's following `if (client && ctx)` or `const ctx = ...` we should have it.
content = content.replace(/\.eq\("user_id", session\.user\.id\)/g, '.eq(ctx.matchCol, ctx.matchVal)');

fs.writeFileSync('services/supabaseService.ts', content);
