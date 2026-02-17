import { GoogleGenAI } from "@google/genai";
import { DailyProgram, ProgramData, Staff, LeaveRequest, IncomingDuty } from "../types";

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
  
  // Attempt direct parse
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Repair common AI JSON truncation or wrapping issues
    try {
      if (clean.startsWith('[') && !clean.endsWith(']')) {
        const variants = [']', '}]', '"}]', '"]', '0}]', 'T"}]']; 
        for (const suffix of variants) {
            try { return JSON.parse(clean + suffix); } catch (err) {}
        }
        // Last resort: cut to last closing brace
        const lastObjectEnd = clean.lastIndexOf('}');
        if (lastObjectEnd > 0) {
            return JSON.parse(clean.substring(0, lastObjectEnd + 1) + ']');
        }
      }
      // Try finding the array inside text
      const startIdx = clean.indexOf('[');
      const endIdx = clean.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) {
          return JSON.parse(clean.substring(startIdx, endIdx + 1));
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

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. FILTER STAFF BY DATE (Strict Mode) & INCOMING DUTY REST
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  const validStaff = data.staff.filter(s => {
      // Locals are always valid
      if (s.type === 'Local') return true;
      
      // Roster staff must have dates defined and be active
      if (s.type === 'Roster') {
        if (!s.workFromDate || !s.workToDate) return false;
        if (s.workToDate < config.startDate) return false; 
        if (s.workFromDate > programEndStr) return false;
      }
      return true;
  });

  // 2. Prepare Staff Map & Context
  const staffMap: Record<string, string> = {}; // Initials -> ID
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

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
    
    return `ID:${s.initials}|Type:${s.type}|Skills:${skills}|Credits:${credits}`;
  }).join('\n');

  // Explicitly list shifts sorted chronologically to help the AI flow
  const sortedShifts = [...data.shifts].sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime));
  
  const shiftContext = sortedShifts.map((s, idx) => {
    const originalIdx = data.shifts.findIndex(os => os.id === s.id);
    return `Index:${originalIdx}|Day:${s.day}|Time:${s.pickupTime}|MinStaff:${s.minStaff}|Roles:${JSON.stringify(s.roleCounts)}`;
  }).join('\n');

  // 3. Prepare Constraints
  const explicitConstraints: string[] = [];
  
  // A. Leave Requests (Hard Blocks)
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = validStaff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd >= programStart && lStart <= programEnd) {
       explicitConstraints.push(`- ${staffMember.initials} is UNAVAILABLE from ${leave.startDate} to ${leave.endDate} (Reason: ${leave.type}).`);
    }
  });

  // B. Roster Contract Boundaries
  validStaff.forEach(s => {
      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          if (s.workFromDate > config.startDate) {
              explicitConstraints.push(`- ${s.initials} CONTRACT STARTS ${s.workFromDate}. DO NOT ASSIGN BEFORE.`);
          }
          if (s.workToDate < programEndStr) {
              explicitConstraints.push(`- ${s.initials} CONTRACT ENDS ${s.workToDate}. DO NOT ASSIGN AFTER.`);
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
          explicitConstraints.push(`- ${staffMember.initials} is RESTING until ${freeAtStr}. ABSOLUTELY NO SHIFTS BEFORE THIS TIME.`);
      }
  });

  // 4. Define Strategy
  // We prioritize the most capable model for complex constraint solving
  const strategies = [
    { model: 'gemini-3-pro-preview', temp: 0.3 },
    { model: 'gemini-2.0-flash-exp', temp: 0.2 }
  ];

  let parsed: any = null;

  for (const strategy of strategies) {
      try {
        const prompt = `
            ROLE: Master Aviation Scheduler.
            MISSION: FILL EVERY SHIFT (OPERATION FIRST, RULES SECOND).
            
            STRICT ALGORITHM (FOLLOW EXACTLY):
            1. SORT shifts chronologically (already done in input).
            2. ITERATE through every shift one by one.
            3. IDENTIFY required 'MinStaff' count.
            4. FIND available staff (not on Leave, not Resting).
            5. ALLOCATE staff using this priority:
               a. Staff with Credits > 0.
               b. Staff with Credits = 0 (OVERTIME).
            
            CRITICAL RULES:
            - **NEVER** leave a shift empty if a human is available, even if they have 0 credits.
            - **NEVER** leave a shift empty if they have worked consecutive days.
            - **PRIORITY**: FLIGHT OPERATION > STAFF COMFORT.
            - If you run out of staff with credits, you MUST assign staff with 0 credits.
            - Ensure qualified staff (LC, SL) are assigned where RoleNeeds dictate.
            
            INPUT DATA:
            Period: ${config.startDate} to ${programEndStr}.
            
            STAFF POOL (ID | Type | Skills | Credits):
            ${staffContext}

            SHIFTS TO FILL (Index | Day | Time | MinStaff | RoleNeeds):
            ${shiftContext}

            CONSTRAINTS (Hard Blocks - Do Not Violate):
            ${explicitConstraints.join('\n')}

            OUTPUT FORMAT:
            JSON Array ONLY. Use Initials for 'staff'.
            [
              { "day": 0, "shift": 0, "staff": "MS-ATZ", "role": "LC" },
              { "day": 0, "shift": 0, "staff": "AG-HMB", "role": "AGT" }
            ]
            
            Return ONLY valid JSON.
        `;

        const response = await ai.models.generateContent({
            model: strategy.model,
            contents: prompt,
            config: {
                temperature: strategy.temp,
                maxOutputTokens: 20000, // Increased to ensure full week generation
                responseMimeType: 'application/json'
            }
        });

        parsed = safeParseJson(response.text);
        if (Array.isArray(parsed) && parsed.length > 0) break;
      } catch (e) {
        console.warn(`Strategy ${strategy.model} failed:`, e);
      }
  }
  
  if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AI failed to generate a valid roster. Please try a shorter date range or check staff availability.");
  }

  // 5. Reconstruct Data
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
      const dayOffset = typeof item.day === 'string' ? parseInt(item.day) : item.day;
      const shiftIdx = typeof item.shift === 'string' ? parseInt(item.shift) : item.shift;
      const staffInitials = String(item.staff || '').toUpperCase().trim();
      const role = String(item.role || 'AGT');

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
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
    }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    ROSTER MODIFICATION.
    Instruction: ${instruction}
    
    Current Roster: ${JSON.stringify(data.programs.map(p => ({d: p.dateString, a: p.assignments})))}
    Staff Map: ${JSON.stringify(data.staff.map(s => ({id: s.id, i: s.initials})))}
    
    Return strict JSON: { "programs": [ ...updated programs... ], "explanation": "string" }
  `;
  
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
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

  const prompt = `
    FIX VIOLATIONS in Roster.
    Errors:
    ${auditReport}
    
    CAPACITY FORECAST:
    ${capacitySummary}
    
    Data:
    ROSTER: ${JSON.stringify(currentPrograms.map(p => ({d: p.dateString, a: p.assignments})))}
    
    TASK: Reassign staff to solve issues.
    CRITICAL: YOU MUST FILL ALL SHIFTS. If a staff member has 0 credits but is the only option to meet MinStaff, ASSIGN THEM. Do not leave empty slots.
    Return strictly: { "programs": [ ...full updated programs array... ] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      }
    });
    const parsed = safeParseJson(response.text);
    return { programs: parsed.programs || [] };
  } catch (err: any) {
    throw new Error("Repair failed.");
  }
};