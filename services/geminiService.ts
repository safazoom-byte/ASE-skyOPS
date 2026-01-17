
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

const normalizeDate = (d?: string): string | undefined => {
  if (!d) return undefined;
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toISOString().split('T')[0];
  } catch {
    return d;
  }
};

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
  
  // Normalize all input dates to ensure string comparison works for the AI
  const normalizedFlights = data.flights.map(f => ({ ...f, date: normalizeDate(f.date) }));
  const normalizedStaff = data.staff.map(s => ({ 
    ...s, 
    workFromDate: normalizeDate(s.workFromDate), 
    workToDate: normalizeDate(s.workToDate) 
  }));
  const normalizedShifts = data.shifts.map(sh => ({ ...sh, pickupDate: normalizeDate(sh.pickupDate) }));

  const prompt = `
    ACT AS AN AVIATION LOGISTICS ENGINE (SKY-OPS PRO).
    CORE OBJECTIVE: Generate a high-performance ground handling weekly program.
    
    OPERATIONAL WINDOW: ${options.startDate} for ${options.numDays} days.
    
    INPUT DATA:
    - FLIGHTS: ${JSON.stringify(normalizedFlights.map(f => ({ id: f.id, fn: f.flightNumber, sta: f.sta, std: f.std, date: f.date })))}
    - DUTY SHIFTS: ${JSON.stringify(normalizedShifts.map(s => ({ 
        id: s.id, 
        date: s.pickupDate, 
        min: s.minStaff,
        roles: s.roleCounts,
        flights: s.flightIds
      })))}
    - STAFF REGISTRY: ${JSON.stringify(normalizedStaff.map(s => ({ 
        id: s.id, 
        name: s.name, 
        skills: s.skillRatings,
        from: s.workFromDate, 
        to: s.workToDate 
      })))}
    
    STRICT COMPLIANCE RULES:
    1. AVAILABILITY PRE-CHECK (MANDATORY): For every assignment, you MUST verify: Is FlightDate >= Staff.from AND (Staff.to is empty OR FlightDate <= Staff.to)? 
       If NO, that staff member is INELIGIBLE for that specific day.
    2. TWO-PHASE ASSIGNMENT:
       - Phase 1: Assign Special Roles (Shift Leader, etc.) from eligible staff.
       - Phase 2: Fill minimum staff requirements from eligible staff.
    3. NO PARTIAL BUILDS: Do not return an empty array if you can fulfill at least some flights.
    4. UNASSIGNED STAFF: If a staff member is eligible but not assigned, categorize them as 'DAY OFF'.
    
    OUTPUT: Return strictly JSON.
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
                      }
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
    if (!result || !result.programs || result.programs.length === 0) {
      throw new Error("AI could not generate a valid program within the selected dates. Check staff availability.");
    }

    return {
      programs: result.programs,
      shortageReport: result.shortageReport || []
    };
  } catch (error: any) { 
    console.error("Program Generation Error:", error);
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

  const prompt = `
    ACT AS AN AVIATION DATA EXTRACTOR. 
    TASK: Extract Flights, Staff, and DUTY SHIFTS.
    
    EXTRACTION RULES:
    1. Flights: Extract Flight Number, STA, STD, Origin, Destination, and Date.
    2. Staff: Extract Personnel. Look for "Work From", "Effective Date", "Start Date", "End Date", or "Expiry". Map to YYYY-MM-DD.
    3. Shifts: Identify duties and link to flights via IDs.
    
    JSON STRUCTURE:
    {
      "flights": [{ "id": "fl_1", "flightNumber": "...", "sta": "...", "std": "...", "date": "YYYY-MM-DD", "from": "...", "to": "..." }],
      "staff": [{ "name": "...", "initials": "...", "type": "Local/Roster", "workFromDate": "YYYY-MM-DD", "workToDate": "YYYY-MM-DD", "skillRatings": { "SkillName": "Yes/No" } }],
      "shifts": [{ "id": "sh_1", "pickupDate": "YYYY-MM-DD", "pickupTime": "HH:mm", "endDate": "YYYY-MM-DD", "endTime": "HH:mm", "minStaff": 4, "flightIds": ["fl_1"] }]
    }
  `;

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
    
    const extractedFlights = (result.flights || []).map((f: any) => ({
      ...f, 
      id: f.id || Math.random().toString(36).substr(2, 9), 
      date: normalizeDate(f.date) || startDateStr, 
      day: 0
    }));

    const extractedStaff = (result.staff || []).map((s: any) => ({
      ...s, 
      id: Math.random().toString(36).substr(2, 9), 
      initials: (s.initials || generateInitials(s.name)).toUpperCase(), 
      skillRatings: s.skillRatings || {}, 
      powerRate: s.powerRate || 75, 
      type: s.type || 'Local', 
      workPattern: s.workPattern || (s.type === 'Roster' ? 'Continuous (Roster)' : '5 Days On / 2 Off'),
      maxShiftsPerWeek: 5, 
      workFromDate: normalizeDate(s.workFromDate) || startDateStr,
      workToDate: normalizeDate(s.workToDate)
    }));

    const extractedShifts = (result.shifts || []).map((sh: any) => {
      const shiftId = sh.id || Math.random().toString(36).substr(2, 9);
      const dateVal = normalizeDate(sh.pickupDate) || startDateStr;
      
      const start = new Date(startDateStr);
      start.setHours(0,0,0,0);
      const target = new Date(dateVal);
      target.setHours(0,0,0,0);
      const dayOffset = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ...sh,
        id: shiftId,
        day: dayOffset,
        pickupDate: dateVal,
        endDate: normalizeDate(sh.endDate) || dateVal,
        minStaff: sh.minStaff || 4,
        maxStaff: sh.maxStaff || 8,
        flightIds: sh.flightIds || []
      };
    });
    
    return { 
      flights: extractedFlights, 
      staff: extractedStaff, 
      shifts: extractedShifts, 
      programs: result.programs || [] 
    };
  } catch (error: any) { 
    console.error("Extraction error:", error);
    throw new Error("Extraction failed."); 
  }
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
