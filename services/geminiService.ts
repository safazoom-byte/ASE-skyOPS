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
    // Local Staff: STRICT 5 days work per 7 days standard.
    // We floor/ceil to ensure they don't get over-assigned.
    grossCredits = Math.floor(duration * (5/7)); 
    // If duration is less than 7 days, we scale proportionally but conservatively.
    if (duration < 7 && duration > 0) grossCredits = Math.ceil(duration * 0.75);
  } else {
    // Roster Staff logic
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
         // Contract doesn't overlap? Assume availability if manually added to DB.
         grossCredits = duration; 
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

  const validStaff = data.staff; 
  const staffMap: Record<string, string> = {};
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

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
    
    // CRITICAL FIX: Tell AI the exact contract window so it doesn't assign outside it
    let contractInfo = "";
    if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
      contractInfo = `[CONTRACT: ${s.workFromDate} to ${s.workToDate}]`;
    }

    return `Agent: ${s.initials}, Type: ${s.type} ${contractInfo}, Skills: [${skills}], ShiftCreditLimit: ${credits}`; 
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
       explicitConstraints.push(`- ${staffMember.initials} is ON LEAVE from ${leave.startDate} to ${leave.endDate}. DO NOT ASSIGN.`);
    }
  });

  (data.incomingDuties || []).forEach(d => {
      const staffMember = validStaff.find(s => s.id === d.staffId);
      if (!staffMember) return;
      explicitConstraints.push(`- ${staffMember.initials} finished duty ${d.date} at ${d.shiftEndTime}. MUST REST ${config.minRestHours}H.`);
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
            ROLE: Senior Aviation Scheduler.
            MISSION: Create a 100% PERFECTLY BALANCED roster. No fatigue, no underutilization.
            
            THE "GOLDEN RULES" OF SCHEDULING (STRICT ENFORCEMENT):
            
            1. THE 5/2 RULE (FATIGUE SAFETY):
               - LOCAL Staff must have exactly 2 OFF DAYS in a 7-day period.
               - MAX 5 SHIFTS per person.
               - DO NOT assign a 6th shift. If a Local has 5 shifts, they are BANNED from more.
            
            2. THE ROSTER MANDATE (CONTRACTOR PRIORITY):
               - ROSTER Staff (Contractors) MUST work EVERY DAY of their contract.
               - IF a date is outside their [CONTRACT: Start to End], DO NOT assign them.
               - IF a date is inside their contract, they MUST work.
               - Assign Roster staff FIRST to fill the schedule base.
            
            3. THE ROBIN HOOD RULE (LOAD BALANCING):
               - STOP overworking the same people.
               - Before assigning a shift to someone with 4 or 5 shifts, LOOK for someone with 0, 1, or 2 shifts.
               - Use "Standby" staff (like MY-HMB, NK-ATZ) to fill gaps. 
               - AIM for everyone to have roughly equal shifts (e.g. everyone has 4-5 shifts).
            
            LOGIC FLOW:
            1. Assign SPECIALIST roles (SL, LC, OPS) to qualified Roster staff first, then qualified Local staff.
            2. Fill remaining slots with ROSTER staff (Force them to work).
            3. Fill remaining slots with LOCAL staff who have < 5 shifts.
            
            INPUT DATA:
            Period: ${config.startDate} to ${programEndStr}
            PERSONNEL (See ShiftCreditLimit & Contract):
            ${staffContext}
            SHIFTS:
            ${shiftContext}
            RESTRICTIONS:
            ${explicitConstraints.join('\n')}

            OUTPUT FORMAT:
            JSON array of arrays: [[DayOffset, ShiftID, "Initials", "AssignedRole"], ...]
            Example: [[0, 5, "AB-HMB", "SL"], [0, 12, "NK-ATZ", "LC"]]
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

  // Uses the updated calculateCredits which forces availability for Roster staff
  const staffContext = data.staff.map(s => {
    const credits = calculateCredits(s, startDate, numDays, data.leaveRequests || []);
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':'', s.isLostFound?'LF':''].filter(Boolean).join(',');
    
    // CRITICAL FIX: Include contract dates in repair context
    let contractInfo = "";
    if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
      contractInfo = `[CONTRACT: ${s.workFromDate} to ${s.workToDate}]`;
    }

    return `ID:${s.initials}, Type:${s.type} ${contractInfo}, Skills:${skills}, CreditLimit:${credits}`;
  }).join('\n');

  const prompt = `
    FIX ROSTER VIOLATIONS & BALANCE WORKLOAD.
    
    CRITICAL RULES (DO NOT BREAK):
    1. LOCALS: Must have 2 DAYS OFF. Max 5 shifts. No 7-day streaks.
    2. ROSTER: Must work EVERY DAY of contract. Prioritize them.
       - IF Date is outside [CONTRACT: Start to End], UNASSIGN them.
       - IF Date is inside, ASSIGN them.
    3. BALANCE: Swap Overworked Staff (>5 shifts) with Underutilized Staff (<3 shifts).
    
    Violations Detected:
    ${auditReport}
    
    Min Rest: ${constraints.minRestHours}h.
    
    Current Roster: ${JSON.stringify(currentPrograms.map(p => ({date: p.dateString, assignments: p.assignments})))}
    Available Staff:
    ${staffContext}
    
    ACTION: Perform swaps to satisfy the 5/2 rule for locals and utilize Roster staff fully.
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