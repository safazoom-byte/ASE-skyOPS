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
                staffId: { type: Type.STRING, description: "Must match a real ID from the personnel list. Use 'VACANT' if no one is eligible." },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING, description: "Standard role. If covering multiple roles, use 'LC+SL' or 'LC+OPS'." },
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
                type: { type: Type.STRING, description: "Type of day off, e.g., 'Day off'." }
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
    COMMAND: STATION OPERATIONS COMMAND - SMART CALCULATION PIPELINE
    
    CRITICAL CALCULATION LOGIC:
    1. DEMAND-FIRST AUDIT: 
       - For each day, calculate the total 'minStaff' required across all shifts. This is the Master Headcount.
    
    2. RESOURCE HIERARCHY (CONTRACT vs LOCAL):
       - PRIORITY 1: Assign all available ROSTER (Contract) staff first. They must be utilized fully if within contract dates and rested.
       - PRIORITY 2: Only assign LOCAL staff if Roster staff cannot meet the 'minStaff' headcount target for that day.
       - AUTO DAY-OFF: Any Local staff member not required to reach the 'minStaff' floor is automatically assigned a "Day off".

    3. MULTI-ROLE OPTIMIZATION (EFFICIENCY):
       - SMART RULE: Only the following pairs are permitted for multi-role optimization:
         * [Load Control (LC) + Shift Leader (SL)]
         * [Load Control (LC) + Operations (OPS)]
       - If a person is qualified for LC and SL, you MUST assign them as 'LC+SL' for the shift.
       - If a person is qualified for LC and OPS, you MUST assign them as 'LC+OPS' for the shift.
       - One person covering two roles counts as ONE head towards 'minStaff' but fulfills both role requirements.
       - DO NOT assign two people if one person is qualified to cover these pairs.

    4. LABOR COMPLIANCE (THE 5/2 LAW):
       - LOCAL STAFF: Strictly limited to 5 shifts per 7-day period.
       - EXCLUSION RULE: No Local staff member can work 4, 6, or 7 shifts. It must be exactly 5 shifts per week OR 0 if demand is low.
       - Rest of the days are hard-locked to "Day off".

    5. ANTI-HALLUCINATION & INTEGRITY:
       - NEVER use initials or IDs not in the PERSONNEL list.
       - ABSOLUTELY NO "??".
       - If a position is unfillable due to rest/5-day limits, use staffId: 'VACANT'.

    STATION PARAMS:
    - Min Rest: ${config.minRestHours} hours
    - Start Date: ${config.startDate}
    - Duration: ${config.numDays} days

    INPUT DATA:
    - PERSONNEL: ${JSON.stringify(data.staff)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - REST LOCKS: ${JSON.stringify(data.incomingDuties)}
    - LEAVE: ${JSON.stringify(data.leaveRequests)}
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