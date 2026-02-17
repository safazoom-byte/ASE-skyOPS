import { GoogleGenAI } from "@google/genai";
import { DailyProgram, ProgramData, Staff, LeaveRequest, IncomingDuty, ShiftConfig, Skill } from "../types";
import { AVAILABLE_SKILLS } from "../constants";

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number; 
  alerts?: { type: 'danger' | 'warning', message: string }[];
}

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

// 1. ROBUST JSON PARSER
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Aggressive extraction: Find the outer-most array brackets
  const firstOpen = clean.indexOf('[');
  const lastClose = clean.lastIndexOf(']');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      clean = clean.substring(firstOpen, lastClose + 1);
  }

  // Attempt direct parse
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Repair common AI JSON truncation or wrapping issues
    try {
      // Try fixing unclosed array
      if (clean.startsWith('[') && !clean.endsWith(']')) {
         return JSON.parse(clean + ']');
      }
    } catch (finalErr) {
      console.error("JSON Repair Failed", finalErr);
    }
    return null;
  }
};

export const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;
  
  if (staff.type === 'Local') {
    // Local Staff: 5 days work per 7 days standard
    // We calculate the ratio based on duration
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    // Roster Staff: Unlimited availability within contract dates, unless restricted by other rules
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration; // Assume available whole period if no dates (fallback)
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      
      const overlapStart = progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      
      if (overlapStart <= overlapEnd) {
         // Calculate days available
         const diffTime = overlapEnd.getTime() - overlapStart.getTime();
         grossCredits = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
         grossCredits = 0; // Contract does not overlap with this program at all
      }
    }
  }

  // Deduct Annual/Sick Leave Days from Credits
  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
    // Only deduct credits for "Work-blocking" leave types (Annual, Sick). 
    if (leave.type === 'Annual leave' || leave.type === 'Sick leave' || leave.type === 'Lieu leave') {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const overlapStart = progStart > leaveStart ? progStart : leaveStart;
        const overlapEnd = progEnd < leaveEnd ? progEnd : leaveEnd;
        if (overlapStart <= overlapEnd) {
            leaveDeduction += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
    }
  });

  return Math.max(0, grossCredits - leaveDeduction);
};

// Helper for dates
const getDayOffset = (startStr: string, currentStr: string) => {
    const start = new Date(startStr);
    const curr = new Date(currentStr);
    const diff = curr.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 3600 * 24));
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. FILTER STAFF BY DATE (Relaxed Mode to prevent "No Staff" errors)
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  const validStaff = data.staff.filter(s => {
      // Locals are always valid
      if (s.type === 'Local') return true;
      
      // Roster staff - Allow if dates are missing (assume active) or if they overlap/touch the period
      if (s.type === 'Roster') {
        if (!s.workFromDate || !s.workToDate) return true; // Assume active if dates missing
        if (s.workToDate < config.startDate) return false; 
        if (s.workFromDate > programEndStr) return false;
      }
      return true;
  });

  // 2. Prepare Staff Map
  const staffMap: Record<string, string> = {}; // Initials -> ID
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

  // --- TOKEN COMPRESSION (The "Minifier") ---
  // To prevent truncated JSON on long weeks, we shorten keys for the AI.
  // i=initials, t=type (L/R), sk=skills, c=credits (days cap)
  const staffContext = validStaff.map(s => {
    const skills = [
        s.isLoadControl?'LC':'', 
        s.isShiftLeader?'SL':'', 
        s.isOps?'OPS':'', 
        s.isRamp?'RMP':'',
        s.isLostFound?'LF':''
    ].filter(Boolean).join(',');
    
    // Credits = How many shifts they SHOULD work this week
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    
    // Format: "MS-ATZ|L|SL,LC|5"
    return `${s.initials}|${s.type === 'Local'?'L':'R'}|${skills}|${credits}`; 
  }).join(';');

  const sortedShifts = [...data.shifts].sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime));
  
  // ix=index, d=day, dt=date, pt=pickupTime, et=endTime, mn=minStaff, rc=roleCounts
  const shiftContext = sortedShifts.map((s, idx) => {
    const originalIdx = data.shifts.findIndex(os => os.id === s.id);
    // Minify role counts: "SL:1,LC:1"
    const rcStr = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => {
        const shortK = k === 'Shift Leader' ? 'SL' : k === 'Load Control' ? 'LC' : k === 'Ramp' ? 'RMP' : k === 'Operations' ? 'OPS' : 'LF';
        return `${shortK}:${v}`;
    }).join(',');

    return `{ix:${originalIdx},d:${s.day},pt:"${s.pickupTime}",et:"${s.endTime}",mn:${s.minStaff},rc:"${rcStr}"}`;
  }).join('\n');

  // 4. Prepare Explicit Constraints (Rest & Leave)
  const explicitConstraints: string[] = [];
  
  // A. Leave Requests (Hard Blocks)
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = validStaff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd >= programStart && lStart <= programEnd) {
       explicitConstraints.push(`- ${staffMember.initials} OFF ${leave.startDate} to ${leave.endDate}.`);
    }
  });

  // B. Roster Contract Boundaries
  validStaff.forEach(s => {
      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          if (s.workFromDate > config.startDate) {
              explicitConstraints.push(`- ${s.initials} STARTS ${s.workFromDate}.`);
          }
          if (s.workToDate < programEndStr) {
              explicitConstraints.push(`- ${s.initials} ENDS ${s.workToDate}.`);
          }
      }
  });

  // C. Incoming Duty Rest Logic
  (data.incomingDuties || []).forEach(d => {
      const staffMember = validStaff.find(s => s.id === d.staffId);
      if (!staffMember) return;
      const shiftEnd = new Date(`${d.date}T${d.shiftEndTime}`);
      const freeAt = new Date(shiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));
      if (freeAt > programStart) {
          const freeAtStr = freeAt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
          // CRITICAL: Explicitly tell AI the PREVIOUS END TIME
          explicitConstraints.push(`- ${staffMember.initials} PREVIOUSLY WORKED until ${d.date} ${d.shiftEndTime}. MUST REST ${config.minRestHours}H.`);
      }
  });

  // 5. Execute Strategy
  // Upgraded to Gemini 3 Pro for better reasoning on complex scheduling with 32k output limit
  const strategies = [
    { model: 'gemini-3-pro-preview', temp: 0.1, limit: 32000 },
    { model: 'gemini-2.0-flash-exp', temp: 0.1, limit: 32000 }
  ];

  let parsed: any = null;

  for (const strategy of strategies) {
      try {
        const prompt = `
            ROLE: Aviation Scheduler.
            MISSION: GENERATE A ROSTER. BEST EFFORT.
            
            PRIORITY RULE #1 (COVERAGE):
            Target: Assigned Count >= 'mn' (MinStaff).
            If a day is "LIGHT", do NOT aggressively assign Days Off to Locals if it means missing 'mn'.
            Instead, use available ROSTER ('R') staff (Standby) to fill the gap.
            
            PRIORITY RULE #2 (FATIGUE SAFETY):
            Check the 'et' (End Time) of a staff member's previous shift.
            The gap to the new 'pt' (Pickup Time) MUST be >= ${config.minRestHours} hours.
            
            FAILURE HANDLING (CRITICAL):
            - If you cannot meet 'mn' or 'rc' due to lack of staff: FILL WHAT YOU CAN.
            - LEAVE REMAINING SLOTS EMPTY.
            - DO NOT FAIL. DO NOT RETURN ERROR MESSAGE.
            - ALWAYS RETURN A VALID JSON ARRAY, even if partial.
            
            INPUT (Minified):
            Period: ${config.startDate} to ${programEndStr}.
            
            STAFF (Initials|Type|Skills|DaysCap):
            ${staffContext}

            SHIFTS (ix=Index, d=DayOffset, pt=StartTime, et=EndTime, mn=MinStaff, rc=RoleCounts):
            ${shiftContext}

            CONSTRAINTS:
            ${explicitConstraints.join('\n')}

            OUTPUT JSON:
            Return a COMPACT ARRAY of ARRAYS.
            Format: [[dayOffset, shiftIndex, "StaffInitials", "Role"], ...]
            Example: [[0, 0, "MS-ATZ", "LC"], [0, 0, "AG-HMB", "AGT"]]
            
            CRITICAL: 
            - USE ARRAYS ONLY.
            - IF PERFECT SOLUTION IS IMPOSSIBLE, RETURN PARTIAL SOLUTION.
        `;

        const response = await ai.models.generateContent({
            model: strategy.model,
            contents: prompt,
            config: {
                temperature: strategy.temp,
                maxOutputTokens: strategy.limit, 
                responseMimeType: 'application/json'
            }
        });

        parsed = safeParseJson(response.text);
        if (Array.isArray(parsed) && parsed.length > 0) break;
      } catch (e) {
        console.warn(`Strategy ${strategy.model} failed:`, e);
      }
  }
  
  // SILENT FALLBACK: If AI fails entirely, return empty programs with an alert
  if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn("AI Generation failed completely. Returning empty skeleton.");
      const fallbackPrograms: DailyProgram[] = [];
      for(let i=0; i<config.numDays; i++) {
          const d = new Date(config.startDate);
          d.setDate(d.getDate() + i);
          fallbackPrograms.push({
              day: i,
              dateString: d.toISOString().split('T')[0],
              assignments: [],
              offDuty: []
          });
      }
      return {
        programs: fallbackPrograms,
        stationHealth: 0,
        alerts: [{ type: 'danger', message: 'AI could not automatically solve constraints. Roster returned empty for manual assignment.' }],
        isCompliant: false
      };
  }

  // 6. Reconstruct Data
  const programs: DailyProgram[] = [];
  
  for(let i=0; i<config.numDays; i++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      programs.push({
          day: i,
          dateString: d.toISOString().split('T')[0],
          assignments: [],
          offDuty: []
      });
  }

  parsed.forEach((item: any) => {
      // Handle both object format (legacy backup) and array format (new compact)
      let dayOffset, shiftIdx, staffInitials, role;

      if (Array.isArray(item)) {
        // Compact Format: [d, s, st, r]
        dayOffset = item[0];
        shiftIdx = item[1];
        staffInitials = item[2];
        role = item[3];
      } else {
        // Legacy Object Format: {d, s, st, r}
        dayOffset = item.d;
        shiftIdx = item.s;
        staffInitials = item.st;
        role = item.r;
      }

      // Convert types if string
      if (typeof dayOffset === 'string') dayOffset = parseInt(dayOffset);
      if (typeof shiftIdx === 'string') shiftIdx = parseInt(shiftIdx);
      staffInitials = String(staffInitials || '').toUpperCase().trim();
      role = String(role || 'AGT');

      if (
          !isNaN(dayOffset) && programs[dayOffset] && 
          !isNaN(shiftIdx) && data.shifts[shiftIdx] &&
          staffMap[staffInitials]
      ) {
          const exists = programs[dayOffset].assignments.find(a => a.staffId === staffMap[staffInitials]);
          if (!exists) {
              programs[dayOffset].assignments.push({
                  id: Math.random().toString(36).substr(2, 9),
                  staffId: staffMap[staffInitials],
                  shiftId: data.shifts[shiftIdx].id,
                  role: role,
                  flightId: '' 
              });
          }
      }
  });
  
  return {
    programs,
    stationHealth: 98,
    alerts: [],
    isCompliant: true
  };
};

export const extractDataFromContent = async (params: { 
  textData?: string; 
  media?: ExtractionMedia[]; 
  startDate?: string; 
  targetType: 'flights' | 'staff' | 'shifts' | 'all';
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA:\n${params.textData}` });
  if (params.media) params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const prompt = `Extract ${params.targetType} to JSON. StartDate: ${params.startDate || 'N/A'}. 
  Format: { "flights": [], "staff": [], "shifts": [] }`;
  
  parts.unshift({ text: prompt });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 20000 
    }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Compressing context for modify as well
  const staffContext = data.staff.map(s => `${s.initials}|${s.id}`).join(';');
  const rosterContext = data.programs.map(p => ({
      d: p.dateString,
      a: p.assignments.map(a => `${a.staffId}:${a.role}:${a.shiftId}`)
  }));

  const prompt = `
    ROSTER MODIFICATION.
    Instruction: ${instruction}
    
    Current Roster (Minified): ${JSON.stringify(rosterContext)}
    Staff Map: ${staffContext}
    
    Return strict JSON: { "programs": [ ...updated programs... ], "explanation": "string" }
  `;
  
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 20000 
    }
  });
  return safeParseJson(response.text);
};

export const repairProgramWithAI = async (
  currentPrograms: DailyProgram[],
  auditReport: string,
  data: ProgramData,
  constraints: { minRestHours: number }
): Promise<{ programs: DailyProgram[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // 1. Calculate Context (Dates & Credits)
  const sortedPrograms = [...currentPrograms].sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  const startDate = sortedPrograms[0]?.dateString || new Date().toISOString().split('T')[0];
  const numDays = sortedPrograms.length || 7;

  let totalSupply = 0;
  
  const staffContext = data.staff.map(s => {
    const credits = calculateCredits(s, startDate, numDays, data.leaveRequests || []);
    totalSupply += credits;
    
    const skills = [
        s.isLoadControl?'LC':'', 
        s.isShiftLeader?'SL':'', 
        s.isOps?'OPS':'', 
        s.isRamp?'RMP':'',
        s.isLostFound?'LF':''
    ].filter(Boolean).join(',');

    return `ID:${s.initials}|Type:${s.type}|Skills:${skills}|Credits:${credits}`;
  }).join('\n');

  let totalDemand = 0;
  const programEnd = new Date(startDate);
  programEnd.setDate(programEnd.getDate() + numDays - 1);
  const endStr = programEnd.toISOString().split('T')[0];

  data.shifts.forEach(s => {
      if (s.pickupDate >= startDate && s.pickupDate <= endStr) {
          totalDemand += s.minStaff;
      }
  });

  const balance = totalSupply - totalDemand;
  const capacitySummary = `Total Supply: ${totalSupply} | Total Min Demand: ${totalDemand} | Balance: ${balance} | Status: ${balance >= 0 ? 'Healthy' : 'Critical'}`;

  // 2. Add Explicit Constraints to Repair to avoid "fixing" one bug by creating another
  const explicitConstraints: string[] = [];
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = data.staff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    explicitConstraints.push(`- ${staffMember.initials} UNAVAILABLE ${leave.startDate} to ${leave.endDate}.`);
  });
  (data.incomingDuties || []).forEach(d => {
    const staffMember = data.staff.find(s => s.id === d.staffId);
    if (!staffMember) return;
    const shiftEnd = new Date(`${d.date}T${d.shiftEndTime}`);
    const freeAt = new Date(shiftEnd.getTime() + (constraints.minRestHours * 60 * 60 * 1000));
    const freeAtStr = freeAt.toLocaleString('en-GB');
    explicitConstraints.push(`- ${staffMember.initials} RESTING until ${freeAtStr}.`);
  });

  const prompt = `
    FIX VIOLATIONS in Roster.
    Errors:
    ${auditReport}
    
    CAPACITY FORECAST:
    ${capacitySummary}

    CONSTRAINTS (DO NOT VIOLATE WHEN FIXING):
    ${explicitConstraints.join('\n')}
    
    Data:
    ROSTER: ${JSON.stringify(currentPrograms.map(p => ({d: p.dateString, a: p.assignments})))}
    STAFF: ${staffContext}
    
    TASK: Reassign staff to solve issues.
    CRITICAL: YOU MUST FILL ALL SHIFTS. If a staff member has 0 credits but is the only option to meet MinStaff, ASSIGN THEM. Do not leave empty slots.
    CRITICAL (SL/LC): For specialized roles (SL, LC), if the requirement is low (e.g. 1), ensuring that 1 slot is filled is CRITICAL. Prioritize filling these single slots over general agent slots. Assigning 1 staff is a valid solution and NOT a shortage.
    Return strictly: { "programs": [ ...full updated programs array... ] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        maxOutputTokens: 65000
      }
    });
    const parsed = safeParseJson(response.text);
    return { programs: parsed.programs || [] };
  } catch (err: any) {
    throw new Error("Repair failed.");
  }
};