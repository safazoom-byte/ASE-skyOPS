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
  // Strip markdown code blocks
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Try to extract JSON between the first { and last }
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
      const extracted = cleanText.slice(start, end + 1);
      try {
        return JSON.parse(extracted);
      } catch (e2) {
        console.error("Failed to parse extracted JSON segment:", e2);
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

export async function extractDataFromContent(content: { 
  media?: ExtractionMedia[], 
  textData?: string,
  startDate?: string
}): Promise<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const startDateStr = content.startDate || new Date().toISOString().split('T')[0];

  const prompt = `
    ACT AS A SENIOR AVIATION STATION MANAGER. 
    Analyze the provided document (image/pdf/csv) to reconstruct the station's operational state.

    TASK:
    1. EXTRACT ALL FLIGHTS: Find Flight Numbers (e.g., SM123), Origins/Destinations, STA (Arrival) and STD (Departure) times, and Dates.
    2. EXTRACT PERSONNEL: Find names, initials, power rates (50-100), and skills (Shift Leader, Operations, Ramp, etc.).
    3. MAP DATES: If weekdays are used, map them starting from ${startDateStr}.

    STRICT JSON OUTPUT FORMAT:
    {
      "flights": [{ "flightNumber": "string", "from": "string", "to": "string", "sta": "string", "std": "string", "date": "YYYY-MM-DD" }],
      "staff": [{ "name": "string", "initials": "string", "type": "Local|Roster", "powerRate": number, "skillRatings": { "Ramp": "Yes|No" } }],
      "shifts": [{ "date": "YYYY-MM-DD", "pickupTime": "HH:mm", "endTime": "HH:mm", "flightNumbers": ["string"] }]
    }
  `;

  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) {
      content.media.forEach(m => parts.push({ 
        inlineData: { mimeType: m.mimeType, data: m.data } 
      }));
    }
    if (content.textData) {
      parts.push({ text: `Source Data (CSV/Text):\n${content.textData}` });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: { 
        thinkingConfig: { thinkingBudget: 4000 },
        responseMimeType: "application/json"
      }
    });

    const result = safeParseJson(response.text);
    if (!result) throw new Error("AI returned unparseable content.");
    
    // Process results to ensure IDs and derived fields
    const flights: Flight[] = (result.flights || []).map((f: any) => {
      const dateVal = f.date || startDateStr;
      const start = new Date(startDateStr);
      const target = new Date(dateVal);
      const diffTime = isNaN(target.getTime()) ? 0 : target.getTime() - start.getTime();
      const dayOffset = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      return {
        ...f,
        id: Math.random().toString(36).substr(2, 9),
        type: f.type || (f.sta && f.std ? 'Turnaround' : f.sta ? 'Arrival' : 'Departure'),
        date: isNaN(target.getTime()) ? startDateStr : dateVal,
        day: dayOffset,
        flightNumber: (f.flightNumber || "UNK").toUpperCase(),
        from: (f.from || "UNK").toUpperCase(),
        to: (f.to || "UNK").toUpperCase()
      };
    });

    const staff: Staff[] = (result.staff || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      type: s.type === 'Roster' ? 'Roster' : 'Local',
      powerRate: s.powerRate || 75,
      initials: (s.initials || generateInitials(s.name)).toUpperCase(),
      skillRatings: s.skillRatings || {},
      maxShiftsPerWeek: s.type === 'Roster' ? 7 : 5
    }));

    const shifts: ShiftConfig[] = (result.shifts || []).map((s: any) => {
      const dateVal = s.date || startDateStr;
      const start = new Date(startDateStr);
      const target = new Date(dateVal);
      const diffTime = isNaN(target.getTime()) ? 0 : target.getTime() - start.getTime();
      const dayOffset = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      return {
        ...s,
        id: Math.random().toString(36).substr(2, 9),
        day: dayOffset,
        minStaff: 4,
        maxStaff: 8,
        targetPower: 75,
        flightIds: (s.flightNumbers || []).map((fNum: string) => {
          const cleanNum = fNum.replace(/\s+/g, '').toUpperCase();
          return flights.find(f => f.flightNumber.replace(/\s+/g, '').toUpperCase() === cleanNum && f.date === (isNaN(target.getTime()) ? startDateStr : dateVal))?.id;
        }).filter(Boolean)
      };
    });

    return { flights, staff, shifts, programs: [] };
  } catch (error) { 
    console.error("Deep Extraction Failed:", error);
    throw new Error("Operational pattern recognition failed. Ensure document clarity or try a different file format."); 
  }
}

export async function generateAIProgram(data: ProgramData, qmsContext: string, options: any): Promise<BuildResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Build a ground handling roster for ${options.numDays} days starting from ${options.startDate || 'today'}.
    FLIGHTS: ${JSON.stringify(data.flights)}
    STAFF: ${JSON.stringify(data.staff)}
    SHIFT_SLOTS: ${JSON.stringify(data.shifts)}
    CONSTRAINTS: Min Rest ${options.minRestHours}h. ${options.customRules}
    
    Output MUST be valid JSON.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: { 
        thinkingConfig: { thinkingBudget: 4000 },
        responseMimeType: "application/json" 
      }
    });
    const parsed = safeParseJson(response.text) || { programs: [], shortageReport: [] };
    return {
      programs: parsed.programs || [],
      shortageReport: parsed.shortageReport || [],
      recommendations: parsed.recommendations
    };
  } catch (error) { 
    console.error("AI Build Failed:", error);
    throw new Error("Roster build engine encountered a logic error."); 
  }
}

export async function modifyProgramWithAI(instruction: string, data: ProgramData, media?: ExtractionMedia[]): Promise<{ programs: DailyProgram[], explanation: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Modify the ground handling roster: "${instruction}". Return JSON with updated 'programs' and 'explanation'.`;
  try {
    const parts: any[] = [{ text: prompt }];
    if (media?.length) media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: { 
        thinkingConfig: { thinkingBudget: 2000 },
        responseMimeType: "application/json" 
      }
    });
    const parsed = safeParseJson(response.text) || {};
    return { 
      programs: parsed.programs || data.programs, 
      explanation: parsed.explanation || "Modified roster based on request." 
    };
  } catch (error) { 
    console.error("AI Modification Failed:", error);
    throw new Error("Logic refinement failed."); 
  }
}

export async function extractStaffOnly(content: { media?: ExtractionMedia[], textData?: string }): Promise<Staff[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Analyze the provided staff list. 
    Extract: Name, Initials, Category (Local/Roster), Power Rate (50-100), Skills (Shift Leader, Operations, Ramp, Load Control, Lost and Found).

    Return as JSON: { "staff": [{ "name": "...", "initials": "...", "type": "Local|Roster", "powerRate": 80, "skillRatings": { "Ramp": "Yes|No", ... } }] }
  `;
  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    if (content.textData) parts.push({ text: content.textData });

    const response = await ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    const result = safeParseJson(response.text) || { staff: [] };
    return (result.staff || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      type: s.type === 'Roster' ? 'Roster' : 'Local',
      powerRate: s.powerRate || 75,
      initials: (s.initials || generateInitials(s.name)).toUpperCase(),
      skillRatings: s.skillRatings || {},
      maxShiftsPerWeek: s.type === 'Roster' ? 7 : 5
    }));
  } catch (error) { 
    console.error("Staff Extraction Error:", error);
    return []; 
  }
}
