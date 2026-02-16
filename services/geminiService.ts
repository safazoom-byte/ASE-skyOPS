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
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
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

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Enriched staff mapping to include ALL skills to prevent hallucinations
  const staffContext = data.staff.map(s => ({ 
    id: s.id, 
    initials: s.initials, 
    type: s.type, 
    workFrom: s.workFromDate, 
    workTo: s.workToDate, 
    skills: { 
      SL: s.isShiftLeader, 
      LC: s.isLoadControl, 
      RMP: s.isRamp,
      OPS: s.isOps,
      LF: s.isLostFound
    } 
  }));

  const prompt = `
    ROLE: AVIATION ROSTER SOLVER (ALGORITHMIC ENGINE)
    OBJECTIVE: Generate a ${config.numDays}-day operational roster starting ${config.startDate}.

    ### EXECUTION PROTOCOL (FOLLOW STRICTLY IN ORDER):

    #### STEP 1: PRIORITIZE "ROSTER" STAFF
    - Identify staff with type="Roster".
    - Check if the roster date falls within their 'workFrom' and 'workTo' dates.
    - **STRATEGY**: Maximize usage of these staff first as they do not have the 5-day limit (they work continuously within their block).

    #### STEP 2: ASSIGN SPECIFIC ROLES (MANDATORY)
    - **Scanning**: Check \`roleCounts\` for ALL requested roles (SL, LC, Ramp, Ops, LF).
    - **Priority Order**:
      1. Assign 'Shift Leader' (SL) & 'Load Control' (LC) first (Critical).
      2. Assign remaining roles (Ramp, Ops, LF) exactly as requested in \`roleCounts\`.
    - **Constraint**: Use Roster staff first, then Local. 
    - **Note**: If a role is NOT requested in \`roleCounts\`, do NOT assign it here.

    #### STEP 3: THE "CREDIT SYSTEM" (LOCAL STAFF LIMIT)
    - **LOCAL STAFF** start with **5 CREDITS** (Max 5 working days).
    - **DECREMENT**: Every assignment costs 1 Credit.
    - **STOP CONDITION**: When Credits = 0 (5 days worked), the staff member is **REMOVED** from the available pool for the rest of the period.
    - **VIOLATION PREVENTION**: It is strictly forbidden to assign a 6th shift to a Local staff member.

    #### STEP 4: MINIMUM STAFF COMPLIANCE (HEADCOUNT FILL)
    - **CHECK**: Calculate current \`total_assigned\` for the shift (from Step 2).
    - **LOOP**: WHILE \`total_assigned\` < \`minStaff\`:
       1. Assign an available staff member (Roster available OR Local with >0 credits).
       2. **ROLE LABELING**: Label them as **"Agent"** (Generic Filler).
          - **DO NOT** use "Ramp" or "Ops" here. Those are only for Step 2.
       3. Increment \`total_assigned\`.
    
    #### STEP 5: REST BARRIER
    - Ensure ${config.minRestHours} hours gap between shifts (check previous day's shift end time).

    ### ABSOLUTE LAWS (ZERO TOLERANCE):
    1. **QUALIFICATION MATCH**:
       - \`skills.SL=false\` CANNOT be assigned 'Shift Leader'.
       - \`skills.LC=false\` CANNOT be assigned 'Load Control'.
    2. **NO INVENTED ROLES**:
       - Only output roles explicitly requested in \`roleCounts\`.
       - For Step 4 (Fillers), use "Agent" only.

    STATION DATA:
    - STAFF POOL: ${JSON.stringify(staffContext)}
    - SHIFTS CONFIG: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, pickupTime: s.pickupTime, endTime: s.endTime, roleCounts: s.roleCounts, minStaff: s.minStaff })))}
    - FLIGHT SCHEDULE: ${JSON.stringify(data.flights.map(f => ({ id: f.id, fn: f.flightNumber, date: f.date })))}
    - REST LOG: ${JSON.stringify(data.incomingDuties)}
    - LEAVE: ${JSON.stringify(data.leaveRequests)}

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
  
  // Enriched staff mapping for Repair context
  const staffContext = data.staff.map(s => ({ 
    id: s.id, 
    initials: s.initials, 
    type: s.type, 
    workFrom: s.workFromDate, 
    workTo: s.workToDate,
    skills: { 
      SL: s.isShiftLeader, 
      LC: s.isLoadControl, 
      RMP: s.isRamp,
      OPS: s.isOps,
      LF: s.isLostFound
    } 
  }));

  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR (PRIORITY MODE)
    OBJECTIVE: Fix violations in the roster below while strictly adhering to the Station Allocation Protocol.

    ### VIOLATION REPORT (PRIORITY FIXES):
    ${auditReport}

    ### ALLOCATION PROTOCOL (ENFORCE DURING REPAIR):
    
    #### 1. QUALIFICATION & SPECIFIC ROLES
    - **Fix Qualification**: Swap staff if they lack the required skill.
    - **Specific Roles**: Ensure all roles in \`roleCounts\` are filled by qualified staff.
    
    #### 2. THE "CREDIT SYSTEM" (LOCAL STAFF LIMIT)
    - **HARD KILL**: If a Local staff member > 5 shifts, **DELETE** the extra shifts (Day 6, Day 7). 
    - It is better to have an EMPTY slot than an illegal 6th shift.
    
    #### 3. MINIMUM STAFF COMPLIANCE (HEADCOUNT FILL)
    - **Check \`minStaff\`**: If count < \`minStaff\`, fill the slot with a valid replacement.
    - **Priority**: Use ROSTER staff first, then LOCAL staff (with < 5 shifts).
    - **ROLE LABELING**: Label fillers as **"Agent"**. 
       - Do NOT use "Ramp" or "Ops" here (only in Step 1).
    
    #### 4. REST BARRIER
    - Ensure >${constraints.minRestHours}h rest gaps between shifts.

    ### DATA SOURCES:
    - Staff Pool: ${JSON.stringify(staffContext)}
    - Shift Specs: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, roleCounts: s.roleCounts, minStaff: s.minStaff })))}
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