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

// 1. ADVANCED SEMANTIC JSON PARSER
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Aggressive extraction: Find the outer-most array or object brackets
  const firstOpen = clean.indexOf('[');
  const lastClose = clean.lastIndexOf(']');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      clean = clean.substring(firstOpen, lastClose + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    // Repair common AI JSON truncation issues
    try {
      if (clean.startsWith('[') && !clean.endsWith(']')) return JSON.parse(clean + ']');
      if (clean.startsWith('{') && !clean.endsWith('}')) return JSON.parse(clean + '}');
    } catch (finalErr) {
      console.error("JSON Recovery Failed", finalErr);
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
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    // Roster Staff: Availability within contract dates
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration;
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      
      const overlapStart = progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      
      if (overlapStart <= overlapEnd) {
         const diffTime = overlapEnd.getTime() - overlapStart.getTime();
         grossCredits = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
         grossCredits = 0;
      }
    }
  }

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
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
  
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  // --- STRICT ACTIVE POOL FILTERING ---
  // Completely ignore staff whose contract has not started or has ended.
  const validStaff = data.staff.filter(s => {
      if (s.type === 'Local') return true;
      if (s.type === 'Roster') {
        if (!s.workFromDate || !s.workToDate) return true;
        const sStart = s.workFromDate;
        const sEnd = s.workToDate;
        // Staff must be active for at least one day within the target period
        return (sStart <= programEndStr && sEnd >= config.startDate);
      }
      return true;
  });

  const staffMap: Record<string, string> = {};
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

  // --- STRATEGIC ANALYSIS: DEMAND HEATMAP ---
  // We calculate the load for every day to guide the "Light Day" off-day strategy
  const dailyLoad: Record<string, { total: number, sl: number, lc: number, rmp: number, ops: number, lf: number }> = {};
  
  for(let i=0; i<config.numDays; i++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    
    let dayTotal = 0;
    let daySL = 0;
    let dayLC = 0;
    let dayRMP = 0;
    let dayOPS = 0;
    let dayLF = 0;

    data.shifts.filter(s => s.pickupDate === dateStr).forEach(s => {
       dayTotal += s.minStaff || 0;
       daySL += s.roleCounts?.['Shift Leader'] || 0;
       dayLC += s.roleCounts?.['Load Control'] || 0;
       dayRMP += s.roleCounts?.['Ramp'] || 0;
       dayOPS += s.roleCounts?.['Operations'] || 0;
       dayLF += s.roleCounts?.['Lost and Found'] || 0;
    });

    dailyLoad[dateStr] = { total: dayTotal, sl: daySL, lc: dayLC, rmp: dayRMP, ops: dayOPS, lf: dayLF };
  }

  // Identify "Light Days" (lowest total demand) to suggest as off-days for Locals
  const sortedDaysByLoad = Object.entries(dailyLoad).sort(([,a], [,b]) => a.total - b.total);
  const lightDays = sortedDaysByLoad.slice(0, 3).map(([date]) => date); // Top 3 lightest days

  // --- SEMANTIC CONTEXT GENERATION ---
  const staffContext = validStaff.map(s => {
    const skills = [
        s.isLoadControl?'LC':'', 
        s.isShiftLeader?'SL':'', 
        s.isOps?'OPS':'', 
        s.isRamp?'RMP':'',
        s.isLostFound?'LF':''
    ].filter(Boolean).join(',');
    
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    return `Agent: ${s.initials}, Type: ${s.type}, Skills: [${skills}], MaxShiftsAllowed: ${credits}`; 
  }).join('\n');

  const sortedShifts = [...data.shifts].sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime));
  
  const shiftContext = sortedShifts.map((s, idx) => {
    const originalIdx = data.shifts.findIndex(os => os.id === s.id);
    const rcStr = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => {
        const shortK = k === 'Shift Leader' ? 'SL' : k === 'Load Control' ? 'LC' : k === 'Ramp' ? 'RMP' : k === 'Operations' ? 'OPS' : 'Lost and Found' ? 'LF' : k;
        return `${shortK}: ${v}`;
    }).join(', ');

    return `ID: ${originalIdx}, Date: ${s.pickupDate}, Start: ${s.pickupTime}, End: ${s.endTime}, MinStaff: ${s.minStaff}, Needs: [${rcStr}]`;
  }).join('\n');

  // --- EXPLICIT CONSTRAINTS ---
  const explicitConstraints: string[] = [];
  
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = validStaff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd >= programStart && lStart <= programEnd) {
       explicitConstraints.push(`- ${staffMember.initials} is NOT AVAILABLE (Leave) from ${leave.startDate} to ${leave.endDate}.`);
    }
  });

  validStaff.forEach(s => {
      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          if (s.workFromDate > config.startDate) explicitConstraints.push(`- ${s.initials} cannot work BEFORE contract start date ${s.workFromDate}.`);
          if (s.workToDate < programEndStr) explicitConstraints.push(`- ${s.initials} cannot work AFTER contract end date ${s.workToDate}.`);
      }
  });

  (data.incomingDuties || []).forEach(d => {
      const staffMember = validStaff.find(s => s.id === d.staffId);
      if (!staffMember) return;
      explicitConstraints.push(`- ${staffMember.initials} finished a previous duty on ${d.date} at ${d.shiftEndTime}. They MUST rest for ${config.minRestHours} hours.`);
  });

  // Execute Gemini
  const strategies = [
    { model: 'gemini-3-pro-preview', temp: 0.1, limit: 60000 },
    { model: 'gemini-3-flash-preview', temp: 0.1, limit: 30000 }
  ];

  let parsed: any = null;

  for (const strategy of strategies) {
      try {
        const prompt = `
            ROLE: Senior Aviation Operations Strategist.
            MISSION: Construct a 7-day master operations schedule using a GLOBAL MATRIX STRATEGY.
            
            STRATEGIC BRIEFING:
            1. HEAVY DAYS vs LIGHT DAYS:
               - Calculated Light Days (Ideal for Local Off-Days): ${lightDays.join(', ')}.
               - Heavy Days (Maximize Staff): The remaining days.
            
            2. EXECUTION PROTOCOL (The 4-Phase Matrix Solver):
            
               PHASE A: SPECIALIST MAPPING (CRITICAL)
               - Map [SL, LC, RMP, OPS, LF] roles to shifts FIRST. 
               - These are scarce resources. DO NOT waste a specialist on a generic 'AGT' role if a specialist role is open.
               - Ensure every 'Needs' requirement in the shift list is met by a qualified person.
               
               PHASE B: OFF-DAY TARGETING
               - Local Staff (Type: Local) need 2 days off per 7 days.
               - STRATEGY: Assign their off-days primarily on the "Light Days" listed above.
               - This preserves maximum workforce for the Heavy Days.
               
               PHASE C: ROSTER STAFF FILL
               - Roster Staff (Type: Roster) work continuously within their contract dates.
               - Use them to cover the bulk of the "General" slots.
               
               PHASE D: LOCAL STAFF FILL
               - Use remaining Local Staff to fill gaps.
               - Ensure NO shift is left below 'MinStaff'.
            
            OPERATIONAL RULES:
            - REST MANDATE: Minimum ${config.minRestHours} hours rest between any two shifts.
            - SKILL ASSIGNMENT: Only assign SL/LC/RMP/OPS/LF roles to staff with those skills.
            - ACTIVE POOL ONLY: Use only the provided active personnel.
            
            INPUT:
            Period: ${config.startDate} to ${programEndStr}
            ACTIVE PERSONNEL POOL:
            ${staffContext}
            SHIFTS TO COVER:
            ${shiftContext}
            HARD CONSTRAINTS:
            ${explicitConstraints.join('\n')}

            OUTPUT FORMAT:
            JSON array of arrays: [[DayOffset, ShiftID, "Initials", "AssignedRole"], ...]
            Example: [[0, 5, "AB-HMB", "SL"], [0, 12, "NK-ATZ", "LC"], [0, 5, "JJ-HMB", "AGT"]]
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
  
  const finalPrograms: DailyProgram[] = [];
  for(let i=0; i<config.numDays; i++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      finalPrograms.push({ day: i, dateString: d.toISOString().split('T')[0], assignments: [], offDuty: [] });
  }

  if (Array.isArray(parsed)) {
    parsed.forEach((item: any) => {
        let dayOffset, shiftIdx, staffInitials, role;
        if (Array.isArray(item)) {
          [dayOffset, shiftIdx, staffInitials, role] = item;
        } else {
          dayOffset = item.dayOffset ?? item.d;
          shiftIdx = item.shiftIdx ?? item.s;
          staffInitials = item.staffInitials ?? item.st;
          role = item.role ?? item.r;
        }

        dayOffset = Number(dayOffset);
        shiftIdx = Number(shiftIdx);
        staffInitials = String(staffInitials || '').toUpperCase().trim();
        role = String(role || 'AGT');

        if (!isNaN(dayOffset) && finalPrograms[dayOffset] && !isNaN(shiftIdx) && data.shifts[shiftIdx] && staffMap[staffInitials]) {
            const exists = finalPrograms[dayOffset].assignments.find(a => a.staffId === staffMap[staffInitials]);
            if (!exists) {
                finalPrograms[dayOffset].assignments.push({
                    id: Math.random().toString(36).substr(2, 9),
                    staffId: staffMap[staffInitials],
                    shiftId: data.shifts[shiftIdx].id,
                    role: role,
                    flightId: '' 
                });
            }
        }
    });
  }
  
  return {
    programs: finalPrograms,
    stationHealth: parsed ? 100 : 0,
    alerts: parsed ? [] : [{ type: 'danger', message: 'The AI could not generate a complete roster. Please check staffing availability.' }],
    isCompliant: !!parsed
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
  
  const prompt = `Extract ${params.targetType} from the provided content. 
  Target Start Date: ${params.startDate || 'Current'}.
  Return valid JSON matching this schema: { "flights": [], "staff": [], "shifts": [] }.
  Ensure flight numbers, initials, and times are extracted accurately.`;
  
  parts.unshift({ text: prompt });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const staffContext = data.staff.map(s => `${s.initials}: ${s.id}`).join(', ');
  const rosterContext = data.programs.map(p => ({
      date: p.dateString,
      assignments: p.assignments.map(a => `${data.staff.find(s=>s.id===a.staffId)?.initials}:${a.role}:ShiftID_${a.shiftId}`)
  }));

  const prompt = `
    TASK: Modify existing roster based on user instruction.
    Instruction: ${instruction}
    
    Current State: ${JSON.stringify(rosterContext)}
    Staff Reference: ${staffContext}
    
    Return strict JSON: { "programs": [ ...updated programs... ], "explanation": "Brief reasoning for changes" }
  `;
  
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
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

  const sortedPrograms = [...currentPrograms].sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  const startDate = sortedPrograms[0]?.dateString || new Date().toISOString().split('T')[0];
  const numDays = sortedPrograms.length || 7;

  const staffContext = data.staff.map(s => {
    const credits = calculateCredits(s, startDate, numDays, data.leaveRequests || []);
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':'', s.isLostFound?'LF':''].filter(Boolean).join(',');
    return `ID:${s.initials}, Type:${s.type}, Skills:${skills}, CreditLimit:${credits}`;
  }).join('\n');

  const prompt = `
    FIX ROSTER VIOLATIONS.
    Violations to Solve:
    ${auditReport}
    
    Minimum Rest Required: ${constraints.minRestHours} hours.
    
    Current Roster: ${JSON.stringify(currentPrograms.map(p => ({date: p.dateString, assignments: p.assignments})))}
    Available Staff:
    ${staffContext}
    
    ACTION: Reassign staff to eliminate the violations while keeping coverage intact. 
    Balance the workload. Do not use the same staff for 7 days straight if others are free.
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
    return { programs: parsed.programs || currentPrograms };
  } catch (err: any) {
    throw new Error("AI Repair engine timed out. Please try fixing fewer issues at once.");
  }
};