const fs = require('fs');

const files = [
  './components/FlightModalDialog.tsx',
  './components/ProgramScanner.tsx',
  './components/ProgramDisplay.tsx',
  './components/StaffManager.tsx',
  './components/DuplicatePeriodModal.tsx',
  './components/ShiftManager.tsx',
  './components/FlightManager.tsx',
  './services/geminiService.ts',
  './services/supabaseService.ts',
  './index.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  
  // Replace template literals with Math.random inside
  content = content.replace(/\`[^\`]*?\$\{Math\.random\(\)\.toString\(36\)\.substr(?:ing)?\([^)]+\)\}\`/g, 'crypto.randomUUID()');
  
  // Replace general Math.random().toString(36).substr(...) or substring(...)
  content = content.replace(/Math\.random\(\)\.toString\(36\)\.substr(?:ing)?\([^)]+\)/g, 'crypto.randomUUID()');

  fs.writeFileSync(file, content, 'utf-8');
});

console.log('Replaced UUIDs in ' + files.length + ' files');
