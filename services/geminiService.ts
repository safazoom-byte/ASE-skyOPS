
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

const normalizeDate = (d?: any): string | undefined => {
  if (!d) return undefined;
  if (typeof d === 'number') {
    const date = new Date((d - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d).trim();
    return date.toISOString().split('T')[0];
  } catch {
    return String(d).trim();
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
  
  const normalizedFlights = data.flights.map(f => ({ ...f, date: normalizeDate(f.date) }));
  const normalizedStaff = data.staff.map(s => ({ 
    ...s, 
    workFromDate: normalizeDate(s.workFromDate), 
    workToDate: normalizeDate(s.workToDate) 
  }));
  const normalizedShifts = data.shifts.map(sh => ({ ...sh, pickupDate: normalizeDate(sh.pickupDate) }));

  const prompt = `
    ACT AS AN AVIATION LOGISTICS ENGINE (SKY-OPS PRO).
    CORE OBJECTIVE: Generate a ground handling weekly program with 100% adherence to SHIFT ROLE REQUIREMENTS.
    REFERENCE START DATE: ${options.startDate}
    PROGRAM DURATION: ${options.numDays} days.
    MINIMUM REST BUFFER: ${options.minRestHours} hours.
    
    INPUT DATA:
    - FLIGHTS: ${JSON.stringify(normalizedFlights.map(f => ({ id: f.id, fn: f.flightNumber, sta: f.sta, std: f.std, date: f.date })))}
    - DUTY SHIFTS: ${JSON.stringify(normalizedShifts.map(s => ({ 
        id: s.id, 
        date: s.pickupDate, 
        pickupTime: s.pickupTime,
        endTime: s.endTime,
        min: s.minStaff,
        roles: s.roleCounts,
        flights: s.flightIds
      })))}
    - STAFF REGISTRY: ${JSON.stringify(normalizedStaff.map(s => ({ 
        id: s.id, 
        name: s.name, 
        skills: s.skillRatings,
        from: s.workFromDate, 
        to: s.workToDate,
        type: s.type
      })))}
    
    STRICT OPERATIONAL CONSTRAINTS:
    1. ROLE FULFILLMENT: Fulfill role requirements for each shift using available qualified staff.
    2. COVERAGE MAPPING (CRITICAL): If you assign a staff member to cover a position because another staff member is on 'offDuty', you MUST set 'coveringStaffId' to the ID of the person being replaced. 
    3. REST-TIME VALIDATION: Only select "Coverage" staff who have had at least ${options.minRestHours} hours of rest since their last shift.
    4. SHORTAGE LOAD BALANCING: If manpower is short, prioritize core safety roles (Shift Leader, Ramp).
    5. SHIFT-CENTRIC MAPPING: Every assignment MUST be linked to a 'shiftId'.
    6. RECOMMENDATIONS: Analyze if the station needs more staff based on the gaps found.

    OUTPUT FORMAT: Return strictly JSON with 'programs', 'shortageReport', and 'recommendations'.
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
                        shiftId: { type: Type.STRING },
                        coveringStaffId: { type: Type.STRING, description: "ID of the staff member on leave who is being covered" }
                      },
                      required: ["id", "staffId", "flightId", "role", "shiftId"]
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
                required: ["day", "assignments", "offDuty"]
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
            },
            recommendations: {
              type: Type.OBJECT,
              properties: {
                idealStaffCount: { type: Type.NUMBER },
                currentStaffCount: { type: Type.NUMBER },
                skillGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                hireAdvice: { type: Type.STRING },
                healthScore: { type: Type.NUMBER }
              },
              required: ["idealStaffCount", "currentStaffCount", "skillGaps", "hireAdvice", "healthScore"]
            }
          },
          required: ["programs", "recommendations"]
        }
      }
    });

    const result = safeParseJson(response.text);
    if (!result || !result.programs) {
      throw new Error("AI engine failed to assemble the logic.");
    }

    return {
      programs: result.programs,
      shortageReport: result.shortageReport || [],
      recommendations: result.recommendations
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
    
    EXTRACTION RULES FOR STAFF (MANDATORY):
    1. Full Name: Extract the complete name.
    2. Initials: Extract or generate initials (e.g. "MZ").
    3. Category & Pattern:
       - If "Local" or "Fixed": Set type "Local" and pattern "5 Days On / 2 Off".
       - If "Roster": Set type "Roster" and pattern "Continuous (Roster)".
    4. Contract Dates: Capture "Start/From" and "End/To" dates as YYYY-MM-DD.
    5. Power Rate: Default to 75 if not specified. Value should be 50-100.
    6. Skill Proficiency Matrix: Identify if staff is qualified for: "Ramp", "Load Control", "Lost and Found", "Shift Leader", "Operations". Return "Yes" or "No" for each.
    
    JSON STRUCTURE:
    {
      "flights": [{ "id": "fl_1", "flightNumber": "...", "sta": "...", "std": "...", "date": "YYYY-MM-DD", "from": "...", "to": "..." }],
      "staff": [{ 
        "name": "Full Name", 
        "initials": "MZ", 
        "type": "Local/Roster", 
        "workFromDate": "YYYY-MM-DD", 
        "workToDate": "YYYY-MM-DD", 
        "powerRate": 75,
        "skillRatings": { "Ramp": "Yes/No", "Load Control": "Yes/No", "Lost and Found": "Yes/No", "Shift Leader": "Yes/No", "Operations": "Yes/No" } 
      }],
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
      name: s.name || "Unknown Staff",
      initials: (s.initials || generateInitials(s.name || "US")).toUpperCase(), 
      skillRatings: s.skillRatings || {}, 
      powerRate: s.powerRate || 75, 
      type: s.type || 'Local', 
      workPattern: s.type === 'Roster' ? 'Continuous (Roster)' : '5 Days On / 2 Off',
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
  const prompt = `Modify roster: "${instruction}". 
  STRICT RULES:
  1. Maintain 100% coverage of required roles.
  2. SHORTAGE MITIGATION: If instruction creates a shortage, distribute the deficit across shifts to maintain minimum coverage.
  3. REST RECOVERY: Identify staff with sufficient rest time from previous duties to cover new gaps.
  4. Use flexible/split rest for ALL Local staff.
  5. Return strictly JSON.`;

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
