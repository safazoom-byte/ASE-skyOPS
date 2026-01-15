
import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment } from "../types";

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
  healthScore: number; // 0-100
}

export interface BuildResult {
  programs: DailyProgram[];
  shortageReport: ShortageWarning[];
  recommendations?: ResourceRecommendation;
}

/**
 * Utility to clean and parse JSON from AI response.
 */
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Initial JSON Parse Error. Attempting fix...", e);
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    const lastBrace = cleanText.lastIndexOf('}');
    const lastBracket = cleanText.lastIndexOf(']');
    
    let start = -1;
    let end = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
      end = lastBrace;
    } else if (firstBracket !== -1) {
      start = firstBracket;
      end = lastBracket;
    }
    
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = cleanText.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch (e2) {
        console.error("Secondary JSON Parse Error:", e2);
      }
    }
    
    return null;
  }
};

const parseAIError = (error: any): string => {
  console.error("AI Service Error:", error);
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  if (typeof error === 'string') return error;
  return "Station Intelligence is currently unresponsive. Please check your data or try again later.";
};

export async function extractDataFromContent(content: { 
  media?: ExtractionMedia[], 
  textData?: string,
  startDate?: string
}): Promise<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Use pro model for complex extraction logic to ensure date accuracy
  const modelName = 'gemini-3-pro-preview';
  
  const startDateStr = content.startDate || new Date().toISOString().split('T')[0];

  const prompt = `
    Act as a Station Operations Analyst. Extract structured data from these Aviation ground handling documents.
    
    CRITICAL CONTEXT:
    The user's current operational program starts on: ${startDateStr}.
    
    1. FLIGHT SCHEDULE: Extract Flight numbers, Route (From/To), STA, and STD.
       DAY INDEX CALCULATION: 
       - You MUST calculate the 'day' property as an integer.
       - ${startDateStr} is Day 0.
       - If you see a specific date (e.g., "Jan 15"), calculate its offset from ${startDateStr}.
       - If you see weekdays (e.g., "Monday"), find the first "Monday" occurring on or after ${startDateStr} and calculate the offset.
       - If no date is found, assume Day 0 but try your best to infer sequence.

    2. SHIFT SLOTS: 
       Identify Shift times/slots. Link flights visually associated with those shifts.
       Calculate 'day' index using the same relative logic as above.

    3. PERSONNEL: Names, initials, and qualifications.
    
    Return the data as a clean JSON object following the schema. Ensure all 'day' values are calculated relative to the start date provided.
  `;

  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) {
      content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    }
    if (content.textData) parts.push({ text: `RAW CONTENT:\n${content.textData}` });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: parts },
      config: { 
        responseMimeType: "application/json",
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
                  day: { type: Type.NUMBER, description: "Relative day index where Day 0 is " + startDateStr },
                  type: { type: Type.STRING }
                },
                required: ["flightNumber", "from", "to", "day"]
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
                  skillRatings: {
                    type: Type.OBJECT,
                    properties: {
                      'Ramp': { type: Type.STRING },
                      'Load Control': { type: Type.STRING },
                      'Lost and Found': { type: Type.STRING },
                      'Shift Leader': { type: Type.STRING },
                      'Operations': { type: Type.STRING }
                    }
                  }
                },
                required: ["name"]
              }
            },
            shifts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
                  pickupTime: { type: Type.STRING },
                  flightNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
                  minStaff: { type: Type.NUMBER },
                  maxStaff: { type: Type.NUMBER }
                },
                required: ["day", "pickupTime"]
              }
            }
          }
        }
      }
    });

    const result = safeParseJson(response.text) || { flights: [], staff: [], shifts: [] };
    
    const flights = (result.flights || []).map((f: any) => ({ 
      ...f, 
      id: Math.random().toString(36).substr(2, 9), 
      type: f.type || 'Turnaround' 
    }));

    const staff = (result.staff || []).map((s: any) => ({ 
      ...s, 
      id: Math.random().toString(36).substr(2, 9), 
      type: s.type || 'Local', 
      powerRate: s.powerRate || 75,
      maxShiftsPerWeek: s.type === 'Local' ? 5 : 7, 
      skillRatings: s.skillRatings || {} 
    }));

    const shifts = (result.shifts || []).map((s: any) => {
      const linkedIds: string[] = [];
      if (s.flightNumbers && Array.isArray(s.flightNumbers)) {
        s.flightNumbers.forEach((fNum: string) => {
          const match = flights.find((f: any) => 
            f.flightNumber.toUpperCase().includes(fNum.toUpperCase()) || fNum.toUpperCase().includes(f.flightNumber.toUpperCase())
          );
          if (match) linkedIds.push(match.id);
        });
      }

      return { 
        ...s, 
        id: Math.random().toString(36).substr(2, 9), 
        minStaff: s.minStaff || 4, 
        maxStaff: s.maxStaff || 8, 
        targetPower: s.targetPower || 75, 
        roleCounts: s.roleCounts || {}, 
        flightIds: linkedIds 
      };
    });

    return { flights, staff, shifts, programs: [] };
  } catch (error) {
    throw new Error(parseAIError(error));
  }
}

export async function generateAIProgram(data: ProgramData, qmsContext?: string, options?: { minHours?: number, customRules?: string, numDays?: number, mode?: 'standard' | 'deep', fairRotation?: boolean, minRestHours?: number }): Promise<BuildResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  const prompt = `
    Create a ${options?.numDays || 7}-day aviation ground handling staff program.
    
    CORE MANDATE: 
    For every shift, assign staff to satisfy 'roleCounts'. 
    AVERAGE 'powerRate' of the team assigned to a shift MUST meet 'targetPower'.

    DATA:
    - Staff: ${JSON.stringify(data.staff.map(s => ({ id: s.id, name: s.name, type: s.type, skills: s.skillRatings, power: s.powerRate })))}
    - Shifts: ${JSON.stringify(data.shifts)}
    - Flights: ${JSON.stringify(data.flights.filter(f => f.day < (options?.numDays || 7)))}

    RULES:
    - Minimum rest: ${options?.minRestHours || 12} hours.
    - Custom constraints: ${options?.customRules || "None"}

    RETURN JSON:
    - programs: DailyProgram[]
    - shortageReport: { staffName, flightNumber, actualRest, targetRest, reason }[]
    - recommendations: { idealStaffCount, currentStaffCount, hireAdvice, healthScore }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeParseJson(response.text) || { programs: [], shortageReport: [] };
    return {
      programs: parsed.programs || [],
      shortageReport: parsed.shortageReport || [],
      recommendations: parsed.recommendations
    };
  } catch (error) { 
    throw new Error(parseAIError(error)); 
  }
}

export async function modifyProgramWithAI(instruction: string, data: ProgramData, media?: ExtractionMedia[]): Promise<{ programs: DailyProgram[], explanation: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const contextPrompt = `Modify the current ground handling program based on: "${instruction}". Return JSON with 'programs' and 'explanation'.`;
  try {
    const parts: any[] = [{ text: contextPrompt }];
    if (media?.length) media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: parts },
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeParseJson(response.text) || {};
    return { programs: parsed.programs || data.programs, explanation: parsed.explanation || "Processed modification request." };
  } catch (error) { throw new Error(parseAIError(error)); }
}

export async function extractStaffOnly(content: { media?: ExtractionMedia[], textData?: string }): Promise<Staff[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Extract aviation staff personnel. Return JSON with 'staff' array containing name, initials, and qualifications.`;
  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    if (content.textData) parts.push({ text: content.textData });
    const response = await ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts: parts }, 
      config: { responseMimeType: "application/json" } 
    });
    const result = safeParseJson(response.text) || { staff: [] };
    return (result.staff || []).map((s: any) => ({ 
      ...s, 
      id: Math.random().toString(36).substr(2, 9), 
      type: s.type || 'Local', 
      powerRate: s.powerRate || 75,
      maxShiftsPerWeek: s.type === 'Local' ? 5 : 7, 
      skillRatings: s.skillRatings || {} 
    }));
  } catch (error) { 
    throw new Error(parseAIError(error));
  }
}
