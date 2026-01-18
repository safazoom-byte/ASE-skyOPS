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
    const endIdx = Math.max(
      cleanText.lastIndexOf('}'),
      cleanText.lastIndexOf(']')
    );
    if (startIdx !== Infinity && endIdx !== -1 && endIdx > startIdx) {
      try {
        return JSON.parse(cleanText.slice(startIdx, endIdx + 1));
      } catch (e2) {
        console.error("JSON Parse Failure:", e2);
      }
    }
    return null;
  }
};

export const extractDataFromContent = async (params: { 
  textData?: string, 
  media?: ExtractionMedia[],
  startDate?: string 
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Aviation Logistics Deep Scan: Exhaustive Data Extraction.
    Reference Date: ${params.startDate || 'Current Operational Year'}

    STRICTNESS MANDATE:
    1. EXTRACT EVERY ROW: Do not skip rows. Do not summarize. If a row has a flight number or agent name, it MUST be included in the JSON.
    2. TREAT SEPARATE TIMES AS SEPARATE ENTRIES: If a flight number appears twice with different times (e.g., STA 10:00 and STD 12:00), extract BOTH as distinct items or a combined turnaround. 
    3. FUZZY HEADERS: Map columns by content if headers are missing.

    INTELLIGENT RECOGNITION (NEURAL MAPPING):
    - FLIGHTS: Look for patterns like "XX123", "SM 456". Even if headers say "Service" or are blank, if it looks like a flight number, extract it.
    - TIME: Columns with "HH:mm" or "HHmm" are STA/STD.
    - SECTORS: 3-letter uppercase (DXB, LHR, RUH) are Sectors (From/To).
    - STAFF: Names (e.g., "John Doe") and Initials (2-3 chars, e.g., "JD", "MZ").
    - DATES: Normalize to YYYY-MM-DD.

    OUTPUT:
    Return JSON with exhaustive arrays: flights, staff, shifts.
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `DATA SOURCE:\n${params.textData}` });
  if (params.media) {
    params.media.forEach(m => {
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 25000,
      thinkingConfig: { thinkingBudget: 16000 },
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
                date: { type: Type.STRING }
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
                type: { type: Type.STRING, description: "'Local' or 'Roster'" },
                skills: { type: Type.ARRAY, items: { type: Type.STRING } }
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
                maxStaff: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    }
  });

  return safeParseJson(response.text);
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are the "Aviation Logistics Engine". Create a multi-day staff roster.
    
    RULES:
    1. MIN REST: Ensure staff have >= ${config.minRestHours}h rest between duties.
    2. ABSENCE: Process "Personnel Absence" text. If "MZ Off 12May", MZ cannot work on that date.
    3. LOCAL 5/2: Local staff need 2 days off per week.
    4. ROSTER: Roster staff are active only within their range.
    5. SKILLS: Respect "roleCounts" in shifts.
  `;

  const prompt = `
    Window: ${config.numDays} Days from ${config.startDate}
    Staff: ${JSON.stringify(data.staff)}
    Flights: ${JSON.stringify(data.flights)}
    Shifts: ${JSON.stringify(data.shifts)}
    Constraints: ${constraintsLog}
    Rules: ${config.customRules}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
      maxOutputTokens: 25000,
      thinkingConfig: { thinkingBudget: 16000 }
    }
  });

  const result = safeParseJson(response.text);
  if (!result || !result.programs) throw new Error("Logic assembly failed.");
  return result;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Aviation Operational Coordinator. Apply instructions to the roster.
    If no change is requested, explain why.
  `;

  const parts: any[] = [
    { text: `Current Data: ${JSON.stringify(data)}` },
    { text: `Instruction: ${instruction}` }
  ];
  
  if (media) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          programs: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          explanation: { type: Type.STRING }
        },
        required: ["programs", "explanation"]
      }
    }
  });

  return safeParseJson(response.text);
}