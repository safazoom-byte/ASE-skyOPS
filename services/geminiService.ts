import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty, LeaveRequest } from "../types";

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

const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  let cleanText = text.replace(/```json\n?|```/gi, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('{') === -1 && cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    if (startIdx === Infinity) return null;
    let candidate = cleanText.slice(startIdx);
    
    let stack: string[] = [];
    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) return JSON.parse(candidate.slice(0, i + 1));
        }
      }
    }
    return null;
  }
};

const ROSTER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    programs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.INTEGER },
          dateString: { type: Type.STRING },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                staffId: { type: Type.STRING },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING },
                shiftId: { type: Type.STRING }
              },
              required: ["id", "staffId", "role", "shiftId"]
            }
          }
        },
        required: ["day", "dateString", "assignments"]
      }
    },
    stationHealth: { type: Type.NUMBER },
    alerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          message: { type: Type.STRING }
        }
      }
    }
  },
  required: ["programs", "stationHealth"]
};

// --- HELPER: Calculate Overlap Days ---
const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date) => {
  const overlapStart = start1 > start2 ? start1 : start2;
  const overlapEnd = end1 < end2 ? end1 : end2;
  
  if (overlapStart > overlapEnd) return 0;
  
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// --- HELPER: Calculate Available Credits (Considers Leave & Duration) ---
const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;

  if (staff.type === 'Local') {
    // Scale credits based on duration (approx 5 days work per 7 days = ~71% utilization)
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    // For Roster, calculate contract overlap days
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration; // Assume full availability if data missing
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      grossCredits = getOverlapDays(progStart, progEnd, contractStart, contractEnd);
    }
  }

  // Deduct Leave Days
  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  
  staffLeaves.forEach(leave => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    const overlap = getOverlapDays(progStart, progEnd, leaveStart, leaveEnd);
    leaveDeduction += overlap;
  });

  return Math.max(0, grossCredits - leaveDeduction);
};

// --- HELPER: Generate Forbidden Transitions (Rest Violations) ---
const generateRestConstraints = (shifts: ShiftConfig[], minRestHours: number) => {
  const constraints: string[] = [];
  shifts.forEach(shiftA => {
    shifts.forEach(shiftB => {
      const [endH, endM] = shiftA.endTime.split(':').map(Number);
      const [startH, startM] = shiftA.pickupTime.split(':').map(Number);
      const [nextStartH, nextStartM] = shiftB.pickupTime.split(':').map(Number);
      
      const shiftAEndVal = endH + endM/60;
      const shiftAStartVal = startH + startM/60;
      const shiftBStartVal = nextStartH + nextStartM/60;
      
      const endsOnNextDay = shiftAEndVal < shiftAStartVal;
      
      let gap = 0;
      if (endsOnNextDay) {
         gap = shiftBStartVal - shiftAEndVal;
      } else {
         gap = (24 - shiftAEndVal) + shiftBStartVal;
      }

      if (gap < minRestHours) {
        constraints.push(`- RULE: If staff works Shift '${shiftA.pickupTime}-${shiftA.endTime}', they are BANNED from next day's '${shiftB.pickupTime}' shift (Gap: ${gap.toFixed(1)}h).`);
      }
    });
  });
  return constraints;
};

// --- HELPER: Generate Contract Info ---
const generateContractContext = (staffList: Staff[], startDate: string, duration: number) => {
  const context: string[] = [];
  const programDates: string[] = [];
  const start = new Date(startDate);
  
  for(let i=0; i<duration; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    programDates.push(d.toISOString().split('T')[0]);
  }

  staffList.filter(s => s.type === 'Roster').forEach(s => {
    if (!s.workFromDate || !s.workToDate) return; 
    const invalidDates = programDates.filter(date => date < s.workFromDate! || date > s.workToDate!);
    if (invalidDates.length > 0) {
      context.push(`- ${s.initials} (${s.id}) is Out-Of-Contract (NO WORK PERMITTED) on: [${invalidDates.join(', ')}].`);
    }
  });
  return context;
};

// --- HELPER: Generate Leave Blackouts ---
const generateLeaveBlackouts = (leaveRequests: LeaveRequest[], staffList: Staff[], startDate: string, duration: number) => {
  const blackouts: string[] = [];
  const start = new Date(startDate);
  const end = new Date(startDate);
  end.setDate(start.getDate() + duration - 1);

  leaveRequests.forEach(leave => {
    const s = staffList.find(st => st.id === leave.staffId);
    if (!s) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd < start || lStart > end) return;

    const datesBlocked: string[] = [];
    let curr = new Date(lStart);
    while (curr <= lEnd) {
      if (curr >= start && curr <= end) {
        datesBlocked.push(curr.toISOString().split('T')[0]);
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (datesBlocked.length > 0) {
      blackouts.push(`- ${s.initials} (${s.id}) is ON LEAVE (${leave.type}) on: [${datesBlocked.join(', ')}]. STRICTLY UNAVAILABLE.`);
    }
  });
  return blackouts;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const creditBank: Record<string, number> = {};
  data.staff.forEach(s => {
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    creditBank[s.id] = credits;
  });

  const availableStaff = data.staff.map(s => ({
    id: s.id,
    initials: s.initials,
    type: s.type,
    credits: creditBank[s.id], 
    skills: { LC: s.isLoadControl, SL: s.isShiftLeader, Ops: s.isOps, Ramp: s.isRamp, LF: s.isLostFound },
  }));

  const restRules = generateRestConstraints(data.shifts, config.minRestHours);
  const contractContext = generateContractContext(data.staff, config.startDate, config.numDays);
  const leaveBlackouts = generateLeaveBlackouts(data.leaveRequests || [], data.staff, config.startDate, config.numDays);
  
  const hardConstraints: string[] = [];
  if (data.incomingDuties && data.incomingDuties.length > 0) {
    data.incomingDuties.forEach(duty => {
      const staffMember = data.staff.find(s => s.id === duty.staffId);
      if (!staffMember) return;
      const lastShiftEnd = new Date(`${duty.date}T${duty.shiftEndTime}`);
      const availableAt = new Date(lastShiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));
      const progStart = new Date(config.startDate + "T00:00:00");
      if (availableAt > progStart) {
         hardConstraints.push(`- REST: ${staffMember.initials} resting until ${availableAt.toISOString()}. NO shifts before this time.`);
      }
    });
  }

  // CALCULATE WORKFORCE RATIO
  const totalStaffCount = availableStaff.length || 1;
  const localStaffCount = availableStaff.filter(s => s.type === 'Local').length;
  const rosterStaffCount = availableStaff.filter(s => s.type === 'Roster').length;
  const localRatio = Math.round((localStaffCount / totalStaffCount) * 100);
  const rosterRatio = 100 - localRatio;

  const prompt = `
    ROLE: MASTER AVIATION SCHEDULER
    OBJECTIVE: Build a ${config.numDays}-day roster starting ${config.startDate}.
    
    ### WORKFORCE METRICS:
    - **Local Staff:** ${localRatio}% of workforce.
    - **Roster Staff:** ${rosterRatio}% of workforce.

    ### EXECUTION LOGIC (STRICT SEQUENCE):

    **PHASE 1: SPECIALIST ROLES (Mandatory Priority)**
    1. **Assign LOAD CONTROL (LC):** Fill all LC requirements first.
       - *Optimization:* If an assigned LC staff has 'Shift Leader' (SL) skill, deduct 1 from the SL requirement for that shift.
    2. **Assign SHIFT LEADER (SL):** Fill remaining SL requirements.
    3. **Assign OTHERS:** Fill RAMP, OPS, and LF requirements.
    
    **PHASE 2: GENERAL HEADCOUNT (Ratio Distribution)**
    - Calculate remaining headcount needed to reach 'minStaff' for each shift.
    - **Distribution Rule:** Apply the station ratio (${rosterRatio}% Roster / ${localRatio}% Local) to the total shift strength.
    
    **PHASE 3: ALLOCATION PROCESS (One-by-One)**
    1. **Roster Staff Allocation:** 
       - Fill the Roster quota calculated in Phase 2.
       - Assign staff **one by one** to balance workload (avoid over/under working).
       - **CONSTRAINT:** STRICTLY check Contract Dates (workFromDate -> workToDate). If outside dates, CANNOT work.
    2. **Local Staff Allocation:**
       - Fill the Local quota.
       - Assign staff **one by one** to balance workload.
       - **CONSTRAINT:** Local staff MUST have **2 DAYS OFF** in this ${config.numDays}-day period.

    **PHASE 4: EXCLUSIONS**
    - If staff is in Leave Registry or Rest Log, they are STRICTLY EXCLUDED.

    ### ROLE LABELING INSTRUCTION:
    - For Phase 1 (Specialist): Use specific role names ("LC", "SL", "RAMP", "OPS", "LF").
    - For Phase 2 (General): Use the role name "Agent" or "General". (The report system will hide these labels, showing only initials).

    ### STAFF POOL:
    ${availableStaff.map(s => `- ${s.initials} (${s.type}) [Skills: ${s.skills.LC?'LC ':''}${s.skills.SL?'SL ':''}${s.skills.Ops?'OPS ':''}${s.skills.Ramp?'RMP ':''}${s.skills.LF?'LF':''}]`).join('\n')}

    ### EXCLUSIONS & RESTRICTIONS:
    ${contractContext.join('\n')}
    ${leaveBlackouts.join('\n')}
    ${hardConstraints.join('\n')}

    ### FORBIDDEN TRANSITIONS (REST LAWS):
    ${restRules.join('\n')}

    ### SHIFT REQUIREMENTS:
    - SHIFTS: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, time: `${s.pickupTime}-${s.endTime}`, minStaff: s.minStaff, roles: s.roleCounts })))}

    OUTPUT: Return JSON matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    const parsed = safeParseJson(response.text);
    return {
      programs: parsed.programs || [],
      stationHealth: parsed.stationHealth || 0,
      alerts: parsed.alerts || [],
      isCompliant: true
    };
  } catch (err: any) {
    throw new Error(err.message || "AI Engine failure.");
  }
};

export const extractDataFromContent = async (params: { 
  textData?: string; 
  media?: ExtractionMedia[]; 
  startDate?: string; 
  targetType: 'flights' | 'staff' | 'shifts' | 'all';
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA SOURCE TEXT:\n${params.textData}` });
  if (params.media && params.media.length > 0) {
    params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }
  const prompt = `
    COMMAND: STATION REGISTRY EXTRACTION
    OBJECTIVE: Parse and extract aviation station data into structured JSON.
    TARGET: ${params.targetType}
    STATION_START_DATE: ${params.startDate || 'N/A'}

    INSTRUCTIONS:
    1. EXTRACT FLIGHTS: Look for flight numbers, sectors, times.
    2. EXTRACT STAFF: Look for names, initials, roles. Look for date ranges (Start/End dates) and capture them as workFromDate/workToDate.
    3. EXTRACT SHIFTS: Look for duty start/end times.
    4. EXTRACT LEAVE/ABSENCE: Look for "Leave Registry", "Absence", "Days Off". Return as 'leaveRequests' array.
    5. EXTRACT REST/FATIGUE: Look for "Rest Log", "Previous Duties", "Fatigue Audit". Return as 'incomingDuties' array.
  `;
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
  const parts: any[] = [
    { text: `CONTEXT: Current programs: ${JSON.stringify(data.programs)}` },
    { text: `INSTRUCTION: ${instruction}` },
    { text: `Staff: ${JSON.stringify(data.staff)}` }
  ];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 16000 }
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
  
  const sortedPrograms = [...currentPrograms].sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  const startDate = sortedPrograms[0]?.dateString || new Date().toISOString().split('T')[0];
  const numDays = sortedPrograms.length || 7;

  // CALCULATE WORKFORCE RATIO
  const totalStaffCount = data.staff.length || 1;
  const localStaffCount = data.staff.filter(s => s.type === 'Local').length;
  const localRatio = Math.round((localStaffCount / totalStaffCount) * 100);
  const rosterRatio = 100 - localRatio;

  const restRules = generateRestConstraints(data.shifts, constraints.minRestHours);
  const contractContext = generateContractContext(data.staff, startDate, numDays);
  const leaveBlackouts = generateLeaveBlackouts(data.leaveRequests || [], data.staff, startDate, numDays);

  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR
    OBJECTIVE: Fix violations in the roster below using STRICT PHASED ALLOCATION.

    ### PRIORITY RULES & SEQUENCE:

    **PHASE 1: SPECIALIST ROLES (Mandatory)**
    1. **LC First:** Fill Load Control. If LC staff has SL skill, deduct 1 from SL demand.
    2. **SL Second:** Fill remaining Shift Leader demand.
    3. **Other Roles:** Fill RAMP, OPS, LF.
    
    **PHASE 2: GENERAL HEADCOUNT (Ratio-Based)**
    - Target **${rosterRatio}% Roster** and **${localRatio}% Local** for total shift count.
    - **Allocation:**
       1. Fill Roster Quota first (check Contract Dates).
       2. Fill Local Quota next (ensure 2 days off).
       3. Assign one-by-one to balance workload.

    ### ROLE LABELING:
    - Use specific names ("LC", "SL") for specialists.
    - Use "Agent" for general headcount filling.

    ### AVAILABILITY CONTEXT:
    ${contractContext.join('\n')}
    ${leaveBlackouts.join('\n')}

    ### VIOLATION REPORT (FIX THESE):
    ${auditReport}

    ### DATA SOURCES:
    - Staff Pool: ${JSON.stringify(data.staff.map(s => ({ id: s.id, initials: s.initials, type: s.type, skills: { LC: s.isLoadControl, SL: s.isShiftLeader, Ops: s.isOps, Ramp: s.isRamp } })))}
    - Shift Specs: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, time: `${s.pickupTime}-${s.endTime}`, minStaff: s.minStaff, roles: s.roleCounts })))}
    - Current Roster: ${JSON.stringify(currentPrograms)}

    ### OUTPUT FORMAT:
    Return a JSON object containing the FULL updated 'programs' array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    const parsed = safeParseJson(response.text);
    return {
      programs: parsed.programs || []
    };
  } catch (err: any) {
    throw new Error(err.message || "Repair failed.");
  }
};