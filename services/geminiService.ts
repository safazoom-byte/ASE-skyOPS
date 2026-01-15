
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
    Extract structured aviation ground handling data.
    START DATE: ${startDateStr} (This is Day 0).
    Map all flights and shifts to an integer 'day' index relative to ${startDateStr}.
    Personnel: Name, initials, skills.
    Return JSON.
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
            flights: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { flightNumber: {type: Type.STRING}, from: {type: Type.STRING}, to: {type: Type.STRING}, sta: {type: Type.STRING}, std: {type: Type.STRING}, day: {type: Type.NUMBER}, type: {type: Type.STRING} } } },
            staff: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, initials: {type: Type.STRING}, powerRate: {type: Type.NUMBER} } } },
            shifts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { day: {type: Type.NUMBER}, pickupTime: {type: Type.STRING}, flightNumbers: {type: Type.ARRAY, items: {type: Type.STRING}} } } }
          }
        }
      }
    });

    const result = safeParseJson(response.text) || { flights: [], staff: [], shifts: [] };
    return {
      flights: (result.flights || []).map((f: any) => ({ ...f, id: Math.random().toString(36).substr(2, 9), type: f.type || 'Turnaround' })),
      staff: (result.staff || []).map((s: any) => ({ ...s, id: Math.random().toString(36).substr(2, 9), type: 'Local', powerRate: s.powerRate || 75, skillRatings: {}, maxShiftsPerWeek: 5 })),
      shifts: (result.shifts || []).map((s: any) => ({ ...s, id: Math.random().toString(36).substr(2, 9), minStaff: 4, maxStaff: 8, targetPower: 75, flightIds: [] })),
      programs: []
    };
  } catch (error) { throw new Error("AI Extraction Failure"); }
}

export async function generateAIProgram(data: ProgramData, qmsContext: string, options: any): Promise<BuildResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Build aviation staff program for ${options.numDays} days. Data: ${JSON.stringify(data)}. Rules: ${options.customRules}`;
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
  } catch (error) { throw new Error("AI Build Failure"); }
}

export async function modifyProgramWithAI(instruction: string, data: ProgramData, media?: ExtractionMedia[]): Promise<{ programs: DailyProgram[], explanation: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Modify program: ${instruction}. Data: ${JSON.stringify(data.programs)}`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeParseJson(response.text) || {};
    return { programs: parsed.programs || data.programs, explanation: parsed.explanation || "Done" };
  } catch (error) { throw new Error("AI Modification Failure"); }
}

export async function extractStaffOnly(content: { media?: ExtractionMedia[], textData?: string }): Promise<Staff[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'Extract staff' });
    return [];
  } catch (error) { return []; }
}
