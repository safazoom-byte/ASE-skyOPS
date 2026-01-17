
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
    CORE OBJECTIVE: Generate a high-performance ground handling weekly program based on FLIGHTS and DUTY SHIFTS.
    
    INPUT PARAMETERS:
    - WINDOW: ${options.startDate} for ${options.numDays} days.
    - FLIGHTS: ${JSON.stringify(data.flights.map(f => ({ id: f.id, fn: f.flightNumber, sta: f.sta, std: f.std, date: f.date })))}
    - DUTY SHIFTS (CONSTRAINTS): ${JSON.stringify(data.shifts.map(s => ({ 
        id: s.id, 
        date: s.pickupDate, 
        time: `${s.pickupTime}-${s.endTime}`,
        min: s.minStaff,
        max: s.maxStaff,
        roles: s.roleCounts,
        flights: s.flightIds
      })))}
    - STAFF REGISTRY: ${JSON.stringify(data.staff.map(s => ({ 
        id: s.id, 
        name: s.name, 
        skills: s.skillRatings,
        pattern: s.workPattern,
        from: s.workFromDate, 
        to: s.workToDate 
      })))}
    
    ASSIGNMENT LOGIC (STRICT HIERARCHY):
    1. TWO-PHASE ASSIGNMENT:
       - PHASE A (SPECIAL ROLES): For every shift, assign staff who meet the specific "roles" (e.g., if roles say Shift Leader: 1, find a staff member with Shift Leader skill).
       - PHASE B (MINIMUM FILL): If the shift still has fewer staff than the "min" requirement after Phase A, assign ANY available qualified staff to reach that minimum count.
    2. SHIFT LINKING: Only assign staff to flights that are explicitly linked in the "flights" array of the Shift object.
    3. TEMPORAL AVAILABILITY: Respect [from, to] dates for all personnel.
    4. REST: Ensure ${options.minRestHours} hours buffer between duties.
    5. LEAVE: Categorize unassigned staff as 'DAY OFF', 'ANNUAL LEAVE', etc.
    
    MANDATORY OUTPUT: Return strictly JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: { 
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json"
      }
    });

    const result = safeParseJson(response.text);
    return {
      programs: result.programs || [],
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

  const prompt = `
    ACT AS AN AVIATION DATA EXTRACTOR. 
    TASK: Extract Flights, Staff, and DUTY SHIFTS.
    
    EXTRACTION RULES:
    1. Flights: Extract all flight details.
    2. Staff: Extract all personnel.
    3. Shifts: Identify the operational shifts/duties. Link them to flights if specified.
    
    JSON STRUCTURE:
    {
      "flights": [{ "id": "fl_1", "flightNumber": "...", "sta": "...", "std": "...", "date": "...", "from": "...", "to": "..." }],
      "staff": [{ "name": "...", "initials": "...", "type": "Local/Roster", "skillRatings": { "SkillName": "Yes/No" } }],
      "shifts": [{ "id": "sh_1", "pickupDate": "...", "pickupTime": "HH:mm", "endDate": "...", "endTime": "HH:mm", "minStaff": 4, "maxStaff": 8, "flightIds": ["fl_1"] }]
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
      date: f.date || startDateStr, 
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
      workFromDate: s.workFromDate || startDateStr,
      workToDate: s.workToDate
    }));

    const extractedShifts = (result.shifts || []).map((sh: any) => {
      const shiftId = sh.id || Math.random().toString(36).substr(2, 9);
      const dateVal = sh.pickupDate || startDateStr;
      
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
        endDate: sh.endDate || dateVal,
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
