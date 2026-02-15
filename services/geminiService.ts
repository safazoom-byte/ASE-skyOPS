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
    ROLE: AVIATION ROSTER SOLVER (STRICT CONSTRAINT ENGINE)
    OBJECTIVE: Generate a ${config.numDays}-day operational roster starting ${config.startDate}.

    ### 1. THE "TOKEN BUCKET" RULE (CRITICAL FOR LOCAL STAFF)
    You MUST mentally maintain a "Day Credit" counter for every staff member:
    - **LOCAL STAFF**: Start with **5 CREDITS**.
      - Every time you assign a Local staff member to a day, **DEDUCT 1 CREDIT**.
      - **FATAL ERROR**: If Credits = 0, you **CANNOT** assign this person again. They are unavailable.
      - **MANDATORY**: Local staff MUST have 2 days off (0 assignments) in this 7-day period.
    - **ROSTER STAFF**: Start with **7 CREDITS**.
      - Use them for up to 7 days if they are within their contract dates ('workFromDate' to 'workToDate').

    ### 2. THE "REST BARRIER" (FATIGUE SAFETY)
    - Before assigning a staff member to a shift, check their **PREVIOUS SHIFT END TIME**.
    - **CALCULATION**: (NewShift_Start_Time - PreviousShift_End_Time) MUST be >= ${config.minRestHours} hours.
    - Check the provided 'REST LOG' (IncomingDuties) for duties ending before Day 1.
    - **FATAL ERROR**: Assigning a staff member with < ${config.minRestHours}h rest (e.g. 16:00 to 00:00, then starting 08:00 next day) is FORBIDDEN.

    ### 3. ASSIGNMENT HIERARCHY
    1. **FILL SPECIALISTS**: Assign 'Shift Leader' (SL), 'Load Control' (LC), 'Ramp' (RMP), 'Ops' (OPS) roles first.
    2. **UTILIZE ROSTER STAFF**: Prioritize 'Roster' staff to preserve 'Local' staff credits.
    3. **FILL LOCALS**: Use 'Local' staff to fill remaining slots, strictly adhering to the 5-Credit limit.
    4. **VACANCY**: If no staff are legal (due to Credits or Rest), leave the slot unassigned or use a different eligible staff member. Do NOT force an illegal assignment.

    STATION DATA:
    - STAFF POOL: ${JSON.stringify(data.staff.map(s => ({ id: s.id, initials: s.initials, type: s.type, workFrom: s.workFromDate, workTo: s.workToDate, skills: { SL: s.isShiftLeader, LC: s.isLoadControl, RMP: s.isRamp } })))}
    - SHIFTS CONFIG: ${JSON.stringify(data.shifts)}
    - FLIGHT SCHEDULE: ${JSON.stringify(data.flights.map(f => ({ id: f.id, fn: f.flightNumber, date: f.date })))}
    - REST LOG (PREV DUTIES): ${JSON.stringify(data.incomingDuties)}
    - LEAVE (ABSENCE): ${JSON.stringify(data.leaveRequests)}

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
  
  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR PROTOCOL v9.0 (STRICT MODE)
    OBJECTIVE: Fix violations in the roster below.

    ### VIOLATION REPORT:
    ${auditReport}

    ### REPAIR INSTRUCTIONS (ZERO TOLERANCE):
    1. **REMOVE ILLEGAL ASSIGNMENTS**: Immediately unassign any Local staff member flagged for working >5 days.
    2. **FILL WITH STANDBY**: Replace the removed staff with Roster staff who are currently 'Standby' (not working that day) and are valid within their contract dates.
    3. **REST BUFFER**: If a violation is "FATIGUE RISK" (<${constraints.minRestHours}h), swap the fatigued agent with a fresh one.
    
    ### DATA SOURCES:
    - Staff: ${JSON.stringify(data.staff)}
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