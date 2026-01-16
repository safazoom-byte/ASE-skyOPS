import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from "../types";

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

const generateInitials = (name: string): string => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
};

export async function generateAIProgram(data: ProgramData, qmsContext: string, options: any): Promise<BuildResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    ACT AS AN AVIATION LOGISTICS ENGINE (SKY-OPS PRO).
    CORE OBJECTIVE: Generate a high-performance ground handling weekly program.
    
    INPUT PARAMETERS:
    - WINDOW: ${options.startDate} for ${options.numDays} days.
    - FLIGHTS: ${JSON.stringify(data.flights.map(f => ({ id: f.id, fn: f.flightNumber, sta: f.sta, std: f.std, date: f.date, from: f.from, to: f.to })))}
    - STAFF: ${JSON.stringify(data.staff.map(s => ({ id: s.id, name: s.name, initials: s.initials, skills: s.skillRatings })))}
    
    RULES:
    1. COMMAND: Every active shift window MUST have at least one 'Shift Leader'.
    2. SHIFT LEADER PRIORITY: List Shift Leaders first in assignments.
    3. LEAVE CATEGORIES: Every staff member not assigned to a flight must be in the 'offDuty' array.
    4. OFF DUTY STATUS: Use EXACTLY these categories: 'DAY OFF', 'ROSTER LEAVE', 'LIEU LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE'. 
       If no staff are in a category, do not include them, but try to distribute unassigned staff logically.
    5. REST: Ensure ${options.minRestHours} hours buffer.
    
    MANDATORY OUTPUT: Return strictly JSON following the defined schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: { 
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
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
                      required: ["id", "staffId", "flightId", "role"]
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
                required: ["day", "assignments"]
              }
            },
            shortageReport: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  staffName: { type: Type.STRING },
                  flightNumber: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          },
          required: ["programs"]
        }
      }
    });

    const result = safeParseJson(response.text);
    return {
      programs: result.programs,
      shortageReport: result.shortageReport || []
    };
  } catch (error: any) { 
    throw new Error(error.message || "Logic assembly failed."); 
  }
}

export async function extractDataFromContent(content: { 
  media?: ExtractionMedia[], 
  textData?: string,
  startDate?: string
}): Promise<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const startDateStr = content.startDate || new Date().toISOString().split('T')[0];

  const prompt = `ACT AS AN AVIATION DATA EXTRACTOR. Extract Flights and Staff. Return JSON.`;

  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) {
      content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    }
    if (content.textData) {
      parts.push({ text: content.textData });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    const result = safeParseJson(response.text);
    if (!result) throw new Error("Could not parse data.");
    
    return { 
      flights: (result.flights || []).map((f: any) => ({...f, id: Math.random().toString(36).substr(2, 9), date: f.date || startDateStr, day: 0})), 
      staff: (result.staff || []).map((s: any) => ({...s, id: Math.random().toString(36).substr(2, 9), initials: (s.initials || generateInitials(s.name)).toUpperCase(), skillRatings: s.skillRatings || {}, powerRate: s.powerRate || 75, type: 'Local', maxShiftsPerWeek: 5})), 
      shifts: [], 
      programs: [] 
    };
  } catch (error: any) { throw new Error("Extraction failed."); }
}

export async function modifyProgramWithAI(instruction: string, data: ProgramData, media?: ExtractionMedia[]): Promise<{ programs: DailyProgram[], explanation: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Modify roster: "${instruction}". Return JSON. Ensure SDU OFF AND LEAVES list is updated accordingly.`;
  try {
    const parts: any[] = [{ text: prompt }, { text: `Data: ${JSON.stringify(data.programs)}` }];
    if (media?.length) media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeParseJson(response.text) || {};
    return { programs: parsed.programs || data.programs, explanation: parsed.explanation || "Modified." };
  } catch (error) { throw new Error("Modification failed."); }
}