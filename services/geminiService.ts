
import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty } from "../types";

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number; 
  alerts?: { type: 'danger' | 'warning', message: string }[];
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
                staffId: { type: Type.STRING, description: "Must exactly match an ID from the personnel list. NO HALLUCINATIONS. Use 'VACANT' only if zero staff are available." },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING, description: "Role codes: SL, OPS, RMP, LC, LF. ONLY combinations allowed: 'SL+LC' or 'LC+OPS'. All other roles MUST be single." },
                shiftId: { type: Type.STRING }
              },
              required: ["id", "staffId", "role", "shiftId"]
            }
          },
          offDuty: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                staffId: { type: Type.STRING },
                type: { type: Type.STRING }
              },
              required: ["staffId", "type"]
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
    COMMAND: STATION OPERATIONS COMMAND - MASTER ROSTER CALCULATION
    OBJECTIVE: Build a 100% compliant program with ZERO vacancies if staff are available and STRICT labor law adherence.

    ### CRITICAL CONSTRAINTS (MANDATORY):

    1. ZERO-VACANCY PROTOCOL:
       - You are STRICTLY FORBIDDEN from using 'VACANT' if there is ANY rested, qualified staff member in the 'STANDBY (RESERVE)' or 'Personnel Registry' pool.
       - Staff of type 'Roster' are contracted to be available 24/7. Unless they have a 'Rest Lock' or 'Leave Request', they MUST be assigned to fill shifts before declaring a vacancy.
       - If a shift is below 'maxStaff', you MUST fill it with available personnel. Leaving slots 'VACANT' while staff are on Standby is a CRITICAL FAILURE.

    2. THE 5/2 LABOR LAW (STRICT 5-SHIFT CAP):
       - LOCAL STAFF (type: 'Local') MUST work EXACTLY 5 shifts and have EXACTLY 2 days off per 7-day period.
       - FORBIDDEN: NEVER assign 6 or 7 shifts to a local staff member. 
       - MONITORING: Staff like MA-ATZ, SK-ATZ, FT-ATZ must NEVER exceed 5 shifts. 
       - EQUAL LOADING: Prioritize staff with fewer shifts (e.g., MR-ATZ who only has 4) to fill gaps until they reach their 5-shift target.
       - ACTIVATE CHAIN OF THOUGHT: For every local person, maintain a count. Once they hit 5 shifts, they are LOCKED.

    3. SKILL-BASED ROLE LOCKDOWN:
       - CHECK STAFF QUALIFICATIONS: Use 'isShiftLeader', 'isLoadControl', 'isOps', 'isRamp', 'isLostFound' booleans.
       - PERMITTED MULTI-ROLES: ONLY 'SL+LC' and 'LC+OPS' are allowed as combined roles for a single person. 
       - QUALIFICATION CHECK: To assign 'SL+LC', they MUST have both skills TRUE in their registry entry.

    4. SPECIALIST UTILIZATION:
       - Every shift MUST have at least one SL (Shift Leader) and one LC (Load Control) if requirements specify them.
       - If a shift has a LC vacancy, you MUST search the 'Standby' pool for ANY person with 'isLoadControl: true' before declaring a gap.

    5. DEMAND PRIORITIZATION:
       - 1st: Fill 'minStaff' with required specialists (matching their skill booleans).
       - 2nd: Fill up to 'maxStaff' using 'General' role for any rested staff who are under their 5-shift limit.
       - 3rd: Only use 'VACANT' if EVERY rested, qualified person has reached their 5-shift limit or is on leave.

    ### PARAMS:
    - Min Rest: ${config.minRestHours}h
    - Start Date: ${config.startDate}
    - Duration: ${config.numDays} days

    ### DATA:
    - PERSONNEL REGISTRY: ${JSON.stringify(data.staff)}
    - PLANNED SHIFTS: ${JSON.stringify(data.shifts)}
    - FATIGUE/REST LOCKS: ${JSON.stringify(data.incomingDuties)}
    - LEAVE REQUESTS: ${JSON.stringify(data.leaveRequests)}
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

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Extract station data for ${options.targetType} into a structured JSON format.` }];
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: 'application/json' }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `CONTEXT: Current handling programs: ${JSON.stringify(data.programs)}` },
    { text: `INSTRUCTION: ${instruction}` },
    { text: `Available Staff: ${JSON.stringify(data.staff)}` }
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
