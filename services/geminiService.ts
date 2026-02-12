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
                staffId: { type: Type.STRING },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING },
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
              }
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
    OBJECTIVE: Build a 7-day program with REINFORCED REVISION LOGIC.

    ### PHASE 1: DAILY DEMAND & ASSIGNMENT
    For each day in the 7-day period:
    1. Calculate 'minStaff' required for all shifts on that specific day.
    2. Assign 'Roster' staff first, but ONLY if the current date is within their [workFromDate] and [workToDate].
    3. Fill the remaining gap to meet 'minStaff' using 'Local' staff.
    4. Any 'Local' staff NOT used for that day must be explicitly marked as "Day off" in the [offDuty] array.

    ### PHASE 2: ROLE CONSOLIDATION (RESTRICTED PAIRS)
    To optimize headcount and meet minimum staff, use multi-skilled personnel:
    - If a shift needs SL and LC, and a person is qualified for both, assign as "LC+SL".
    - If a shift needs OPS and LC, and a person is qualified for both, assign as "LC+OPS".
    - HARD LIMIT: Never assign 3 roles. Max is 2 roles (e.g., LC+SL).

    ### PHASE 3: DOUBLE-PASS REVISION (CRITICAL AUDIT)
    PASS 1 (SAFETY AUDIT): Check every shift. If assigned headcount < minStaff, you MUST add more Local staff. Do not leave a shift under-staffed if Local staff are available.
    PASS 2 (WORKLOAD BALANCE): Count total weekly shifts for Local staff. If anyone has > 5 shifts, swap their extra shifts with staff who have < 5 shifts. 

    ### CONTEXT DATA:
    - PERSONNEL: ${JSON.stringify(data.staff)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - LEAVE: ${JSON.stringify(data.leaveRequests)}
    - REST: ${JSON.stringify(data.incomingDuties)}
    - START: ${config.startDate}

    EXECUTION: I will revise the draft twice before final JSON output to ensure every shift meets minStaff and Local staff adhere to the 5/2 rule.
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