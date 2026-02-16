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
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    try {
      if (clean.startsWith('[') && !clean.endsWith(']')) {
        const variants = [']', '}]', '"}]', '"]', '0}]']; 
        for (const suffix of variants) {
            try { return JSON.parse(clean + suffix); } catch (err) {}
        }
        const lastObjectEnd = clean.lastIndexOf('}');
        if (lastObjectEnd > 0) {
            return JSON.parse(clean.substring(0, lastObjectEnd + 1) + ']');
        }
      }
    } catch (finalErr) {
      console.error("JSON Repair Failed", finalErr);
    }
    return null;
  }
};

const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
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
    // "Day off" requests just block specific days but don't necessarily reduce the 5-day work requirement if possible to fit elsewhere,
    // BUT usually if a user requests a day off, they expect it to count towards their 2 days off.
    // However, if they take 'Annual Leave', that reduces the work days.
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
      // Locals are always valid (unless manually removed, handled elsewhere)
      if (s.type === 'Local') return true;
      
      // Roster staff must have dates defined and be active
      if (s.type === 'Roster') {
        if (!s.workFromDate || !s.workToDate) return false;
        // Check for ANY overlap. If their contract ends before program starts, or starts after program ends, remove them.
        if (s.workToDate < config.startDate) return false; 
        if (s.workFromDate > programEndStr) return false;
      }
      return true;
  });

  // 2. Prepare Staff Map & Context
  const staffMap: Record<string, string> = {}; // Initials -> ID
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

  // Ratio calculation for the prompt
  const localCount = validStaff.filter(s => s.type === 'Local').length;
  const rosterCount = validStaff.filter(s => s.type === 'Roster').length;
  const totalCount = localCount + rosterCount;
  const localRatio = totalCount > 0 ? (localCount / totalCount).toFixed(2) : "0.5";

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

  const shiftContext = data.shifts.map((s, idx) => {
    // Explicitly listing Min Staff to force AI compliance
    return `ID:${idx}|Time:${s.pickupTime}-${s.endTime}|MinStaff:${s.minStaff}|Roles:${JSON.stringify(s.roleCounts)}`;
  }).join('\n');

  // 3. Prepare Constraints
  const explicitConstraints: string[] = [];
  
  // A. Leave Requests (Hard Blocks)
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = validStaff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    // Overlap check
    if (lEnd >= programStart && lStart <= programEnd) {
       explicitConstraints.push(`- ${staffMember.initials} is UNAVAILABLE from ${leave.startDate} to ${leave.endDate} (Reason: ${leave.type}).`);
    }
  });

  // B. Roster Contract Boundaries (Partial Weeks)
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

  // C. Incoming Duty Rest Logic (Rest Log)
  (data.incomingDuties || []).forEach(d => {
      const staffMember = validStaff.find(s => s.id === d.staffId);
      if (!staffMember) return;
      // Calculate when they are free: ShiftEnd + MinRest
      const shiftEnd = new Date(`${d.date}T${d.shiftEndTime}`);
      const freeAt = new Date(shiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));
      
      // We format this for the AI to understand "Block until X time"
      // If freeAt is within the program window
      if (freeAt > programStart) {
          const freeAtStr = freeAt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
          explicitConstraints.push(`- ${staffMember.initials} is RESTING until ${freeAtStr}. ABSOLUTELY NO SHIFTS BEFORE THIS TIME.`);
      }
  });

  // 4. Define Strategy
  const strategies = [
    { model: 'gemini-3-pro-preview', temp: 0.15 },
    { model: 'gemini-2.0-flash-exp', temp: 0.1 }
  ];

  let parsed: any = null;

  for (const strategy of strategies) {
      try {
        const prompt = `
            ROLE: Master Aviation Scheduler.
            GOAL: Build a weekly roster strictly following the HIERARCHY OF ALLOCATION and CREDIT LIMITS.

            INPUT DATA:
            Period: ${config.startDate} to ${programEndStr}.
            
            STAFF LIST (ID | Type | Skills | Credits):
            ${staffContext}

            SHIFTS (ID | Time | MinStaff | RoleNeeds):
            ${shiftContext}

            HIERARCHY OF ALLOCATION (Execute strictly in this order per shift):
            1. **Load Control (LC)**: Fill 'Load Control' needs using ONLY 'LC' skilled staff. Assign Role="LC".
            2. **Shift Leader (SL)**: Fill 'Shift Leader' needs using ONLY 'SL' skilled staff. Assign Role="SL".
               *OPTIMIZATION*: If a staff member assigned to LC also has SL skill, you MAY count them towards the SL requirement logic, but prioritize filling the SL slot with a distinct person if headcount allows.
            3. **Operations (OPS)**: Fill 'Operations' needs using 'OPS' staff. Assign Role="OPS".
            4. **Ramp (RMP)**: Fill 'Ramp' needs using 'RMP' staff. Assign Role="RMP".
            5. **Lost & Found (LF)**: Fill 'Lost and Found' needs using 'LF' staff. Assign Role="LF".
            6. **MINIMUM STAFF**: Fill remaining slots until 'MinStaff' is reached using ANY available staff. Assign Role="AGT".
            7. **RATIO BALANCE**: If 'MinStaff' reached but 'MaxStaff' not reached, add extra staff based on Credits availability. Maintain approx ${localRatio} ratio of Locals. Assign Role="AGT".

            MANDATORY RULES:
            - **CREDITS**: Staff have a 'Credits' value. This is the TARGET number of shifts they should work. Do not exceed it significantly.
            - **NO 0.0H REST**: If staff works Late (ends >20:00), NO Early shift (starts <12:00) next day.
            - **CONTRACTS**: Do not assign Roster staff outside their contract dates.
            - **LOCAL BALANCE**: Distribute "Days Off" for Locals evenly. Do not leave Sunday empty (ensure at least some locals work every day).
            - **REST LOG**: Respect the resting constraints listed below.

            CONSTRAINTS:
            ${explicitConstraints.join('\n')}

            OUTPUT FORMAT:
            JSON Array. Use Initials for 'staff'.
            [
              { "day": 0, "shift": 0, "staff": "MS-ATZ", "role": "LC" },
              { "day": 0, "shift": 0, "staff": "AG-HMB", "role": "AGT" }
            ]
            
            IMPORTANT: Return ONLY valid JSON.
        `;

        const response = await ai.models.generateContent({
            model: strategy.model,
            contents: prompt,
            config: {
                temperature: strategy.temp,
                maxOutputTokens: 8192,
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
  
  const prompt = `
    FIX VIOLATIONS in Roster.
    Errors:
    ${auditReport}
    
    Data:
    ROSTER: ${JSON.stringify(currentPrograms.map(p => ({d: p.dateString, a: p.assignments})))}
    STAFF: ${JSON.stringify(data.staff.map(s => ({id: s.id, i: s.initials, s: s.isShiftLeader?'SL':'AGT'})))}
    
    TASK: Reassign staff to solve issues. Keep structure.
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