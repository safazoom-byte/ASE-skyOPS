
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
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let start = -1;
    let end = -1;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
      end = cleanText.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      start = firstBracket;
      end = cleanText.lastIndexOf(']');
    }
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(cleanText.slice(start, end + 1)); } catch (e2) {}
    }
    return null;
  }
};

export async function extractDataFromContent(content: { 
  media?: ExtractionMedia[], 
  textData?: string,
  startDate?: string
}): Promise<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const startDateStr = content.startDate || new Date().toISOString().split('T')[0];

  const prompt = `
    Extract structured aviation ground handling data from the provided documents.
    
    IMPORTANT DATE MAPPING RULES:
    The operational Target Window starts on: ${startDateStr}.
    - This start date (${startDateStr}) MUST be treated as Day 0.
    - If a flight or shift is on ${startDateStr}, its 'day' index is 0.
    - If it's on the next day, 'day' is 1, and so on.
    - If the document contains specific dates (e.g., "25 Oct"), calculate the integer 'day' offset from ${startDateStr}.
    
    Data to Extract:
    1. Flights: Flight number, Route, STA/STD, and the calculated 'day' index.
    2. Personnel: Name, initials, and power rate.
    3. Shifts: Pickup time and the calculated 'day' index.
    
    Return the result as a clean JSON object.
  `;

  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    if (content.textData) parts.push({ text: content.textData });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
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
                  flightNumber: {type: Type.STRING}, 
                  from: {type: Type.STRING}, 
                  to: {type: Type.STRING}, 
                  sta: {type: Type.STRING}, 
                  std: {type: Type.STRING}, 
                  day: {type: Type.NUMBER}, 
                  type: {type: Type.STRING} 
                },
                required: ["flightNumber", "day"]
              } 
            },
            staff: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: {type: Type.STRING}, 
                  initials: {type: Type.STRING}, 
                  powerRate: {type: Type.NUMBER} 
                },
                required: ["name"]
              } 
            },
            shifts: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  day: {type: Type.NUMBER}, 
                  pickupTime: {type: Type.STRING}, 
                  flightNumbers: {type: Type.ARRAY, items: {type: Type.STRING}} 
                },
                required: ["day", "pickupTime"]
              } 
            }
          }
        }
      }
    });

    const result = safeParseJson(response.text) || { flights: [], staff: [], shifts: [] };
    
    const flights: Flight[] = (result.flights || []).map((f: any) => ({
      ...f,
      id: Math.random().toString(36).substr(2, 9),
      type: f.type || 'Turnaround'
    }));

    const staff: Staff[] = (result.staff || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      type: 'Local',
      powerRate: s.powerRate || 75,
      skillRatings: {},
      maxShiftsPerWeek: 5
    }));

    const shifts: ShiftConfig[] = (result.shifts || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      minStaff: 4,
      maxStaff: 8,
      targetPower: 75,
      flightIds: (s.flightNumbers || []).map((fNum: string) => 
        flights.find(f => f.flightNumber === fNum)?.id
      ).filter(Boolean)
    }));

    return { flights, staff, shifts, programs: [] };
  } catch (error) { 
    console.error(error);
    throw new Error("Station Intelligence was unable to extract logical patterns from these documents."); 
  }
}

export async function generateAIProgram(data: ProgramData, qmsContext: string, options: any): Promise<BuildResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Act as a Station Program Manager. Build a roster for ${options.numDays} days.
    Flights: ${JSON.stringify(data.flights)}
    Personnel: ${JSON.stringify(data.staff)}
    Rules: ${options.customRules}
    Min Rest: ${options.minRestHours} hours.
    
    Return JSON with 'programs' and 'shortageReport'.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
    throw new Error("AI Program generation failed."); 
  }
}

export async function modifyProgramWithAI(instruction: string, data: ProgramData, media?: ExtractionMedia[]): Promise<{ programs: DailyProgram[], explanation: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Modify the existing roster based on this instruction: "${instruction}".
    Current Data: ${JSON.stringify(data.programs)}
    Return JSON with 'programs' and 'explanation'.
  `;
  try {
    const parts: any[] = [{ text: prompt }];
    if (media?.length) media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeParseJson(response.text) || {};
    return { 
      programs: parsed.programs || data.programs, 
      explanation: parsed.explanation || "No changes proposed." 
    };
  } catch (error) { 
    throw new Error("Roster modification failed."); 
  }
}

export async function extractStaffOnly(content: { media?: ExtractionMedia[], textData?: string }): Promise<Staff[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = "Extract all staff names and initials from this text.";
  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    if (content.textData) parts.push({ text: content.textData });

    const response = await ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            staff: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, initials: {type: Type.STRING}} } }
          }
        }
      }
    });
    const result = safeParseJson(response.text) || { staff: [] };
    return (result.staff || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      type: 'Local',
      powerRate: 75,
      skillRatings: {},
      maxShiftsPerWeek: 5
    }));
  } catch (error) { return []; }
}
