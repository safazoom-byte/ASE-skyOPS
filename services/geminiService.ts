
import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty } from "../types";

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

    ### STRATEGIC PROTOCOL: HYBRID EFFICIENCY (HIGHEST PRIORITY)
    **Goal**: Minimize headcount per shift by utilizing multi-skilled staff.
    **Rule**: If a shift requires BOTH a Shift Leader (SL) and a Load Controller (LC):
      1. You MUST first look for a staff member who has BOTH \`isShiftLeader: true\` AND \`isLoadControl: true\`.
      2. Assign them the role "SL+LC".
      3. This single assignment satisfies 1 SL count AND 1 LC count.
      4. ONLY after exhausting hybrid candidates should you assign separate SL and LC staff.
      
    *Example*: Shift needs 2 SL and 1 LC.
    - BAD: Assign Staff A (SL), Staff B (SL), Staff C (LC). Total: 3 pax.
    - GOOD: Assign Staff A (SL+LC) [Counts as 1 SL, 1 LC], Assign Staff B (SL). Total: 2 pax.

    ### CRITICAL LOGIC REQUIREMENTS (STRICT ENFORCEMENT):
    1. **QUALIFICATION LOCK**: DO NOT assign roles based on names or initials. Use the boolean flags in the staff data:
       - Role "LC" ONLY if "isLoadControl" is true.
       - Role "RMP" ONLY if "isRamp" is true.
       - Role "SL" ONLY if "isShiftLeader" is true.
       - Role "OPS" ONLY if "isOps" is true.
       - Role "LF" ONLY if "isLostFound" is true.
       - Role "SL+LC" ONLY if "isShiftLeader" AND "isLoadControl" are BOTH true.
       If a staff member has NO valid flags for a required role, they can only be assigned to a general slot with role "".

    2. **ROSTER STAFF PRIORITY**: Exhaust Roster staff (initials ending in -HMB) first. Use them up to 7 shifts if their contract window allows within this ${config.numDays}-day period. 
    
    3. **LOCAL STAFF CAPPING**: Strictly limit Local staff (initials ending in -ATZ) to a maximum of 5 shifts per week.
    
    4. **DAY OFF MAPPING**: If a Local staff member is not required for shift headcount, assign them a "DAY OFF" for that date. 

    5. **MIN STAFF GAP FILLING**: Ensure every shift reaches "minStaff" headcount. If specialist roles are filled but headcount is low, fill remaining slots with available staff using role "".

    6. **REST COMPLIANCE**: Ensure exactly ${config.minRestHours} hours of rest between consecutive shifts.

    ### FORMATTING RULES:
    - Roles MUST be one of: "SL", "LC", "SL+LC", "OPS", "LF", "RMP", or "".
    - Combined roles like "SL+LC" are only allowed if staff has BOTH qualifications.

    ### STATION DATA:
    - STAFF: ${JSON.stringify(data.staff)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - PREVIOUS DUTIES: ${JSON.stringify(data.incomingDuties)}
    - LEAVE/ABSENCE: ${JSON.stringify(data.leaveRequests)}

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
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR PROTOCOL v2.0
    ROLE: Senior Aviation Roster Specialist
    OBJECTIVE: Resolve specific violations in the roster WITHOUT creating new ones.

    ### THE "DO NO HARM" DOCTRINE:
    1. **PRESERVE EXISTING**: Do NOT move, remove, or change any staff assignment that is currently valid. Only touch assignments explicitly flagged in the audit report or necessary to fill a gap.
    2. **LEGALITY OVER COVERAGE**: It is better to leave a shift understaffed than to assign a staff member illegally (e.g. working 6th day for Local, or <${constraints.minRestHours}h rest).

    ### HYBRID STRATEGY (SL+LC):
    - If a shift is missing BOTH Shift Leader (SL) and Load Control (LC), prioritize assigning a staff with BOTH skills to role "SL+LC".
    - This satisfies both requirements with 1 person.

    ### CRITICAL AUDIT REPORT (TARGETS):
    ${auditReport}

    ### EXECUTION RULES:

    1. **FIXING "MISSING STAFF" (UNDERSTAFFING)**:
       - Identify the date and shift time.
       - **Scan the Staff Registry** for candidates who are:
         a) **OFF DUTY**: Not currently assigned to any shift on this date.
         b) **RESTED**: Have > ${constraints.minRestHours} hours gap from their previous shift (check previous day).
         c) **LEGAL (Local)**: Have NOT reached 5 days of work in this block.
         d) **LEGAL (Roster)**: Are within their 'workFromDate' and 'workToDate'.
       - **Action**: Assign the first available candidate who meets ALL criteria. If no one fits, leave it empty.

    2. **FIXING "CONTRACT ERROR" (OVERWORK)**:
       - If a Local staff is working > 5 days, REMOVE them from the shift that causes the least operational impact (e.g. a shift where they are extra, or a general role).
       - If a Roster staff is working outside contract dates, REMOVE them immediately.

    3. **FIXING "ROLE ERROR" (MISSING SPECIALIST)**:
       - If a shift needs a Shift Leader (SL) and has none, find an existing staff on that shift who has 'isShiftLeader=true' and upgrade their role to 'SL'.
       - If no one on shift matches, SWAP a non-specialist staff member with an available Shift Leader from the registry (following rest/legal rules).

    ### DATA SOURCES:
    - **Staff Attributes**: ${JSON.stringify(data.staff.map(s => ({ 
        id: s.id, 
        initials: s.initials, 
        type: s.type, 
        quals: {
          SL: s.isShiftLeader, 
          LC: s.isLoadControl, 
          RMP: s.isRamp, 
          OPS: s.isOps, 
          LF: s.isLostFound
        },
        dates: { from: s.workFromDate, to: s.workToDate }
      })))}
    - **Shift Definitions**: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, min: s.minStaff, reqRoles: s.roleCounts, start: s.pickupTime, end: s.endTime })))}
    - **Current Roster State**: ${JSON.stringify(currentPrograms)}

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
