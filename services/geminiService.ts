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

// --- HELPER: Calculate Available Credits (Considers Leave) ---
const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;

  if (staff.type === 'Local') {
    grossCredits = 5; // Hard limit for locals
  } else {
    // For Roster, calculate contract overlap days
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = 0; 
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
      
      // Determine if Shift A ends on the next day (Overnight shift)
      // e.g., 22:00 - 06:00 (ends next day), 16:00 - 00:00 (ends next day at 0/24)
      const endsOnNextDay = shiftAEndVal < shiftAStartVal;
      
      let gap = 0;
      if (endsOnNextDay) {
         // Shift A ends on Day N+1. Shift B starts on Day N+1.
         // Gap is the direct difference in hours.
         gap = shiftBStartVal - shiftAEndVal;
      } else {
         // Shift A ends on Day N. Shift B starts on Day N+1.
         // Gap = Time left in Day N + Time into Day N+1.
         gap = (24 - shiftAEndVal) + shiftBStartVal;
      }

      if (gap < minRestHours) {
        constraints.push(`- RULE: If staff works Shift '${shiftA.pickupTime}-${shiftA.endTime}', they are BANNED from next day's '${shiftB.pickupTime}' shift (Gap: ${gap.toFixed(1)}h).`);
      }
    });
  });
  return constraints;
};

// --- HELPER: Generate Contract Blackouts (Date-Specific) ---
const generateContractBlackouts = (staffList: Staff[], startDate: string, duration: number) => {
  const blackouts: string[] = [];
  const programDates: string[] = [];
  const start = new Date(startDate);
  
  for(let i=0; i<duration; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    programDates.push(d.toISOString().split('T')[0]);
  }

  staffList.filter(s => s.type === 'Roster').forEach(s => {
    if (!s.workFromDate || !s.workToDate) return; 
    
    // Explicitly list dates OUTSIDE contract
    const invalidDates = programDates.filter(date => date < s.workFromDate! || date > s.workToDate!);
    
    if (invalidDates.length > 0) {
      blackouts.push(`- ${s.initials} (${s.id}) is OFF-CONTRACT (Invalid) on: [${invalidDates.join(', ')}]. DO NOT ASSIGN.`);
    }
  });
  return blackouts;
};

// --- HELPER: Generate Leave Blackouts (Date-Specific) ---
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
      blackouts.push(`- ${s.initials} (${s.id}) is ON LEAVE (${leave.type}) on: [${datesBlocked.join(', ')}]. DO NOT ASSIGN.`);
    }
  });
  return blackouts;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Calculate Credit Bank & Qualification Pools
  const creditBank: Record<string, number> = {};
  const lcPool: string[] = [];
  const slPool: string[] = [];
  
  data.staff.forEach(s => {
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    creditBank[s.id] = credits;
    if (s.isLoadControl) lcPool.push(`${s.initials} (${s.id})`);
    if (s.isShiftLeader) slPool.push(`${s.initials} (${s.id})`);
  });

  // 2. Filter Staff
  const availableStaff = data.staff.filter(s => creditBank[s.id] > 0).map(s => ({
    id: s.id,
    initials: s.initials,
    type: s.type,
    credits: creditBank[s.id],
    skills: { LC: s.isLoadControl, SL: s.isShiftLeader },
  }));

  // 3. Pre-calculate Rest, Contract, and Leave Blackouts
  const restRules = generateRestConstraints(data.shifts, config.minRestHours);
  const contractBlackouts = generateContractBlackouts(data.staff, config.startDate, config.numDays);
  const leaveBlackouts = generateLeaveBlackouts(data.leaveRequests || [], data.staff, config.startDate, config.numDays);

  // 4. Hard Constraints (Incoming Rest)
  const hardConstraints: string[] = [];
  if (data.incomingDuties && data.incomingDuties.length > 0) {
    data.incomingDuties.forEach(duty => {
      const staffMember = data.staff.find(s => s.id === duty.staffId);
      if (!staffMember) return;
      const lastShiftEnd = new Date(`${duty.date}T${duty.shiftEndTime}`);
      const availableAt = new Date(lastShiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));
      const progStart = new Date(config.startDate + "T00:00:00");
      if (availableAt > progStart) {
         hardConstraints.push(`- STARTUP BAN: ${staffMember.initials} is resting until ${availableAt.toISOString()}. NO shifts before this time.`);
      }
    });
  }

  // 5. Calculate Ratios for General Fill
  const localStaffCount = availableStaff.filter(s => s.type === 'Local').length;
  const rosterStaffCount = availableStaff.filter(s => s.type === 'Roster').length;
  const totalCount = localStaffCount + rosterStaffCount;
  const localRatio = totalCount > 0 ? Math.round((localStaffCount / totalCount) * 100) : 50;

  const prompt = `
    ROLE: MASTER AVIATION SCHEDULER
    OBJECTIVE: Build a ${config.numDays}-day roster starting ${config.startDate}.
    
    ### CORE LOGIC: THE CREDIT SYSTEM (STRICT)
    You have a "Wallet" of credits for each staff member.
    - **Local Staff:** Max 5 Credits (Minus any Leave Taken).
    - **Roster Staff:** Contract Days (Minus any Leave Taken).
    **CRITICAL RULE:** Every time you assign a staff member, mentally deduct 1 credit.
    **IF CREDITS == 0, THE STAFF MEMBER IS DEAD. DO NOT ASSIGN THEM AGAIN.**
    
    ### CREDIT BANK (STARTING BALANCE):
    ${availableStaff.map(s => `- ${s.initials} (${s.type}): ${s.credits} Credits`).join('\n')}

    ### AVAILABILITY BLACKOUTS (DATE SPECIFIC):
    Even if a staff has credits, **THEY CANNOT WORK** on specific dates if they are Off-Contract OR On-Leave.
    **CHECK THIS LIST FOR EVERY ASSIGNMENT:**
    ${contractBlackouts.join('\n')}
    ${leaveBlackouts.join('\n')}
    ${hardConstraints.join('\n')}

    ### ALLOCATION PIPELINE (FOLLOW IN ORDER FOR EACH SHIFT):

    #### STEP 1: LOAD CONTROL (LC) - THE PRIORITY
    - For every shift requiring LC, assign a qualified person from the **LC POOL**.
    - **LC POOL:** [${lcPool.join(', ')}]
    - **DUAL ROLE OPTIMIZATION:** If the chosen LC person is *also* a Shift Leader (SL), count them for BOTH roles.
      - *Output Format:* role: "LC/SL" (This reduces headcount needed for Step 2).
    - **STRICT ROLE CODES:** Output role MUST be one of: 'LC', 'SL', 'LC/SL'. Do not write 'Load Control'.

    #### STEP 2: SHIFT LEADER (SL)
    - Fill remaining SL slots using the **SL POOL**.
    - **SL POOL:** [${slPool.join(', ')}]
    - **SKIP** if Step 1 already covered the SL requirement via a Dual Role (LC/SL) assignment.
    - **STRICT ROLE CODES:** Output role MUST be 'SL'.

    #### STEP 3: GENERAL FILL (FAILOVER LOGIC)
    - Fill remaining 'MinStaff' slots.
    - **Preferred Ratio:** ${localRatio}% Local / ${100 - localRatio}% Roster.
    - **FAILOVER PROTOCOL (CRITICAL):**
      1. Try to pick a staff member matching the Ratio (e.g., Local).
      2. **CHECK:** Do they have Credits > 0? Are they free from Blackouts? Are they rested?
      3. **IF NO LOCAL IS AVAILABLE/VALID:** IMMEDIATELY pick a Roster staff instead (or vice versa).
      4. **DO NOT LEAVE A SLOT EMPTY ('??') UNLESS EVERY SINGLE STAFF MEMBER IN THE ENTIRE LIST IS UNAVAILABLE.**
      5. It is better to break the Ratio than to leave a slot empty.
    - **STRICT ROLE CODES:** For general staff, use 'OPS', 'RMP', or 'LF' ONLY if specific tasking is required. **Otherwise, default to 'Agent'**.
    - **IMPORTANT:** 'Agent' roles will be displayed as just initials (no label), which is the desired output for general staff.

    ### FORBIDDEN TRANSITIONS (REST LAWS - STRICT COMPLIANCE):
    The following shift combinations are ILLEGAL due to <${config.minRestHours}h rest:
    ${restRules.join('\n')}

    ### STATION DATA:
    - SHIFTS: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, time: `${s.pickupTime}-${s.endTime}`, minStaff: s.minStaff, roles: s.roleCounts })))}

    OUTPUT: Return JSON matching the schema. Ensure 'programs' array covers exactly ${config.numDays} days.
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
  
  // Infer start date and duration from currentPrograms to ensure accurate date-based logic
  const sortedPrograms = [...currentPrograms].sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  const startDate = sortedPrograms[0]?.dateString || new Date().toISOString().split('T')[0];
  const numDays = sortedPrograms.length || 7;

  // 1. Calculate Credit Bank & Qualification Pools (Synced with Generate)
  const creditBank: Record<string, number> = {};
  data.staff.forEach(s => {
     // Synced with generate logic: include leaveRequests for deduction
     const credits = calculateCredits(s, startDate, numDays, data.leaveRequests || []); 
     creditBank[s.id] = credits;
  });

  const lcPool = data.staff.filter(s => s.isLoadControl).map(s => s.initials);

  // 2. Pre-calculate Rest, Contract, and Leave Blackouts (Synced with Generate)
  const restRules = generateRestConstraints(data.shifts, constraints.minRestHours);
  const contractBlackouts = generateContractBlackouts(data.staff, startDate, numDays);
  const leaveBlackouts = generateLeaveBlackouts(data.leaveRequests || [], data.staff, startDate, numDays);

  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR (CREDIT & FAILOVER)
    OBJECTIVE: Fix violations in the roster below.

    ### CORE LOGIC: THE CREDIT SYSTEM (STRICT)
    - **Local Staff:** Max 5 Credits (Minus any Leave Taken).
    - **Roster Staff:** Contract Days (Minus any Leave Taken).
    **IF CREDITS == 0, THE STAFF MEMBER IS DEAD. DO NOT ASSIGN THEM AGAIN.**

    ### CREDIT BANK (REMAINING BUDGET):
    ${data.staff.map(s => `- ${s.initials} (${s.type}): ${creditBank[s.id]} Credits`).join('\n')}

    ### AVAILABILITY BLACKOUTS (DATE SPECIFIC):
    **CRITICAL: DO NOT ASSIGN STAFF ON THESE DATES:**
    ${contractBlackouts.join('\n')}
    ${leaveBlackouts.join('\n')}

    ### VIOLATION REPORT (PRIORITY FIXES):
    ${auditReport}

    ### REPAIR PROTOCOL:
    1. **FAILOVER:** If a slot needs filling and the preferred person has 0 credits or is blacklisted, **USE ANY AVAILABLE STAFF**. Do not leave it empty.
    2. **LC PRIORITY:** Ensure all shifts with Load Control needs have a qualified LC staff.
       - Use Dual Role (LC/SL) optimization if possible to save headcount.
    3. **REST GAPS:** Respect the following forbidden transitions (MANDATORY):
       ${restRules.join('\n')}
    4. **STRICT ROLE CODES:** 
       - ALLOWED: 'LC', 'SL', 'OPS', 'RMP', 'LF', 'LC/SL'.
       - **DEFAULT: 'Agent'** (for general staff, displays as initials only).
       - FORBIDDEN: 'General', 'Assistant'.

    ### DATA SOURCES:
    - Staff Pool: ${JSON.stringify(data.staff.map(s => ({ id: s.id, initials: s.initials, type: s.type, skills: { LC: s.isLoadControl, SL: s.isShiftLeader } })))}
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