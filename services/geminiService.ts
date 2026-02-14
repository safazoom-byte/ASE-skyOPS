
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
  
  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - MASTER PROGRAM BUILDER
    OBJECTIVE: Build a ${config.numDays}-day program starting ${config.startDate}.

    ### 1. CREDENTIAL VERIFICATION (STRICT QUALIFICATION FIREWALL)
    You are FORBIDDEN from assigning a specialist role unless the staff member has the specific boolean flag in the database:
    - Role "SL" (Shift Leader) -> REQUIRED: \`isShiftLeader: true\`
    - Role "LC" (Load Control) -> REQUIRED: \`isLoadControl: true\`
    - Role "OPS" (Operations) -> REQUIRED: \`isOps: true\`
    - Role "LF" (Lost & Found) -> REQUIRED: \`isLostFound: true\`
    - Role "RMP" (Ramp) -> REQUIRED: \`isRamp: true\`
    
    ### 2. ABBREVIATION PROTOCOL (MANDATORY)
    - NEVER use full words like "Shift Leader".
    - YOU MUST USE THESE CODES ONLY: "SL", "LC", "RMP", "OPS", "LF", "SL+LC".
    
    ### 3. UNAVAILABILITY PROTOCOLS (ZERO TOLERANCE)
    - **CONTRACT DATES**: If staff.type == 'Roster', you MUST CHECK \`workFromDate\` and \`workToDate\`. 
      - If the Program Date is < workFromDate OR > workToDate, the staff member **DOES NOT EXIST**. DO NOT ASSIGN THEM.
    - **LEAVE REGISTRY**: Staff in "LEAVE/ABSENCE" are LOCKED OUT for the specific dates. No exceptions.
    - **REST LOG**: Check 'PREVIOUS DUTIES'. Staff are **LOCKED** until they complete **${config.minRestHours} hours of rest** after their last shift end.
      - Formula: \`SafeStartTime = LastShiftEnd + ${config.minRestHours} hours\`.
    
    ### 4. EXECUTION STRATEGY
    **PHASE A: COVERAGE**
    - Fill specialist roles (SL, LC) first.
    - Fill remaining with General staff up to \`minStaff\`.
    - **PRIORITY**: Use available Roster staff BEFORE Local staff to save costs.

    **PHASE B: OPTIMIZATION**
    - If a shift is below \`maxStaff\`, scan STANDBY pool.
    - Assign available, legal staff to fill the gap.
    - Maximize workforce utilization.

    ### 5. LEGALITY & SWAP
    - Local Staff: Max 5 shifts/week. Roster Staff: Max 7 shifts/week (continuous).
    - If a staff member hits their limit, **SWAP** them with a qualified Standby staff member. Do not leave the slot empty.

    ### STATION DATA:
    - STAFF: ${JSON.stringify(data.staff)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - FLIGHTS: ${JSON.stringify(data.flights)}
    - PREVIOUS DUTIES (REST LOG): ${JSON.stringify(data.incomingDuties)}
    - LEAVE/ABSENCE (OFF-DUTY REGISTRY): ${JSON.stringify(data.leaveRequests)}

    ### OUTPUT:
    Return JSON matching the ROSTER_SCHEMA. 
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
    2. EXTRACT STAFF: Look for names, initials, roles. CRITICAL: For 'Roster' or 'Contract' staff, look for date ranges (Start/End dates) and capture them as workFromDate/workToDate.
    3. EXTRACT SHIFTS: Look for duty start/end times.
    4. EXTRACT LEAVE/ABSENCE: Look for "Leave Registry", "Absence", "Days Off". Return as 'leaveRequests' array with { staffId (or initials), startDate, endDate, type }.
    5. EXTRACT REST/FATIGUE: Look for "Rest Log", "Previous Duties", "Fatigue Audit". Return as 'incomingDuties' array with { staffId (or initials), date, shiftEndTime }.
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
  
  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR PROTOCOL v5.0
    OBJECTIVE: Fix the specific violations in the roster below.

    ### 1. CREDENTIAL CHECK (ZERO TOLERANCE)
    - **FAKE ROLE VIOLATION**: If staff assigned "SL", "LC", etc. lacks the boolean flag, **SWAP** them out immediately.
    
    ### 2. EXCLUSION ZONE (LEAVE & REST & DATES)
    - **CONTRACT DATES (CRITICAL)**: Roster staff MUST NOT be assigned if the date is outside their \`workFromDate\` - \`workToDate\`. Remove and replace.
    - **LEAVE REGISTRY**: Staff in 'LEAVE REGISTRY' are **INVISIBLE**. Remove if assigned.
    - **REST LOG**: Staff in 'REST LOG' are **LOCKED** until ${constraints.minRestHours}h after shift end.
      - Action: If assigned during rest period, **REMOVE AND SWAP**.

    ### 3. ABBREVIATION PROTOCOL (STRICT)
    - **MUST USE**: "SL", "LC", "RMP", "OPS", "LF".
    - **DO NOT** use full words. Rename all roles to codes.

    ### 4. THE "SMART SWAP" MANDATE
    - **Scenario**: Staff over max shifts (Local > 5, Roster > 7).
    - **Action**: **SWAP**. Find a legal Standby staff member and replace the overworked staff. Preserve the role.

    ### 5. MOBILIZATION
    - **Scenario**: Shift < maxStaff.
    - **Action**: Assign legal Standby staff to fill empty slots.

    ### AUDIT REPORT:
    ${auditReport}

    ### DATA SOURCES:
    - Staff Attributes: ${JSON.stringify(data.staff.map(s => ({ 
        id: s.id, 
        initials: s.initials, 
        type: s.type, 
        contract: s.type === 'Roster' ? { from: s.workFromDate, to: s.workToDate } : 'PERM',
        quals: { SL: s.isShiftLeader, LC: s.isLoadControl, RMP: s.isRamp, OPS: s.isOps, LF: s.isLostFound }
      })))}
    - **LEAVE REGISTRY**: ${JSON.stringify(data.leaveRequests)}
    - **REST LOG**: ${JSON.stringify(data.incomingDuties)}
    - Current Roster: ${JSON.stringify(currentPrograms)}

    ### OUTPUT FORMAT:
    Return a JSON object containing the FULL updated 'programs' array. 
    Matches standard ROSTER_SCHEMA.
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
