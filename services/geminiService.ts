import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill } from "../types";

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

export interface ShortageWarning {
  staffName: string;
  flightNumber: string;
  actualRest: number;
  targetRest: number;
  reason: string;
}

export interface ResourceRecommendation {
  idealStaffCount: number;
  currentStaffCount: number;
  skillGaps: string[];
  hireAdvice: string;
  healthScore: number;
}

export interface BuildResult {
  programs: DailyProgram[];
  shortageReport: ShortageWarning[];
  recommendations?: ResourceRecommendation;
}

/**
 * Advanced JSON repair utility to handle common LLM output errors 
 */
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
    const endIdx = Math.max(cleanText.lastIndexOf('}'), cleanText.lastIndexOf(']'));
    if (startIdx === Infinity || endIdx === -1) return null;
    let jsonCandidate = cleanText.slice(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (e2) {
      return null;
    }
  }
};

export const extractDataFromContent = async (params: { 
  textData?: string, 
  media?: ExtractionMedia[],
  startDate?: string,
  targetType?: 'flights' | 'staff' | 'shifts' | 'all'
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const target = params.targetType || 'all';
  
  const systemInstruction = `
    ACT AS AN AVIATION LOGISTICS DATA ARCHITECT.
    OBJECTIVE: Extract and normalize station data from a "Dual Master Sheet" (Combined Shifts & Flights).

    EXTRACTION RULES FOR DUAL SHEETS:
    If a row contains columns like "Shift Start", "Role Matrix", and "Flight No", you MUST create BOTH a Flight and a Shift object.

    1. SHIFT EXTRACTION:
       - 'Shift Start Date' -> pickupDate (YYYY-MM-DD)
       - 'Shift Start Time' -> pickupTime (HH:mm)
       - 'Shift End Date' -> endDate (YYYY-MM-DD)
       - 'Shift End Time' -> endTime (HH:mm)
       - 'Min Staff' / 'Max Staff' -> numeric values
       - 'Target Power' -> targetPower
       - 'Role Matrix' (e.g., "Shift Leader: 1, Ramp: 2"): Parse this string into the 'roleCounts' object with counts for each skill.
       - 'Flight No' -> Add this value to the shift's 'flightIds' array.

    2. FLIGHT EXTRACTION:
       - 'Flight No' -> flightNumber
       - 'Value_Date' -> date (YYYY-MM-DD)
       - 'Value_STA' -> sta (HH:mm, ignore if "NS")
       - 'Value_STD' -> std (HH:mm, ignore if "NS")
       - 'Value_FROM' -> from
       - 'Value_TO' -> to
       - Flight Type: If both STA and STD exist, use "Turnaround".

    3. STAFF REGISTRY (If provided):
       - 'Full Name' -> name
       - 'Initials' -> initials
       - 'Power Rate' -> powerRate (numeric)
       - Discipline columns (Shift Leader, Operations, Ramp, Load Control, Lost and Found): Map "YES"/"NO" to "Yes"/"No".

    DATE NORMALIZATION:
    - Support DD/MM/YYYY and YYYY-MM-DD. Always output YYYY-MM-DD in JSON.
    - Reference Date for calculations: ${params.startDate || 'today'}.
  `;

  const prompt = `
    TARGET MODE: ${target.toUpperCase()}
    SOURCE DATA:
    ${params.textData || "Analyze provided image for the combined Shift and Flight schedule."}
  `;

  const parts: any[] = [{ text: prompt }];
  if (Array.isArray(params.media)) {
    params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { 
        systemInstruction,
        responseMimeType: "application/json", 
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  flightNumber: { type: Type.STRING },
                  from: { type: Type.STRING },
                  to: { type: Type.STRING },
                  sta: { type: Type.STRING },
                  std: { type: Type.STRING },
                  date: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              }
            },
            staff: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  initials: { type: Type.STRING },
                  type: { type: Type.STRING },
                  powerRate: { type: Type.NUMBER },
                  workFromDate: { type: Type.STRING },
                  workToDate: { type: Type.STRING },
                  skillRatings: { 
                    type: Type.OBJECT,
                    properties: {
                      'Shift Leader': { type: Type.STRING },
                      'Operations': { type: Type.STRING },
                      'Ramp': { type: Type.STRING },
                      'Load Control': { type: Type.STRING },
                      'Lost and Found': { type: Type.STRING }
                    }
                  }
                }
              }
            },
            shifts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pickupDate: { type: Type.STRING },
                  pickupTime: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  minStaff: { type: Type.NUMBER },
                  maxStaff: { type: Type.NUMBER },
                  targetPower: { type: Type.NUMBER },
                  flightIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                  roleCounts: {
                    type: Type.OBJECT,
                    properties: {
                      'Shift Leader': { type: Type.NUMBER },
                      'Operations': { type: Type.NUMBER },
                      'Ramp': { type: Type.NUMBER },
                      'Load Control': { type: Type.NUMBER },
                      'Lost and Found': { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    return safeParseJson(response.text);
  } catch (error) {
    console.error("Extraction Error:", error);
    throw error;
  }
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = "Aviation Logistics Engine. Build valid multi-day staff rosters in JSON. Respect contract dates and 5/2 local work patterns.";
  const prompt = `Window: ${config.numDays} days from ${config.startDate}. Data: ${JSON.stringify(data)}. Constraints: ${constraintsLog}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 8000 },
        maxOutputTokens: 16000
      }
    });
    const result = safeParseJson(response.text);
    if (!result || !result.programs) throw new Error("Output validation failed.");
    return result;
  } catch (error) {
    console.error("Generation Error:", error);
    throw error;
  }
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `Roster State: ${JSON.stringify(data.programs)}` },
    { text: `Instruction: ${instruction}` }
  ];
  if (Array.isArray(media)) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { programs: data.programs, explanation: "Failed to process modification." };
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};
