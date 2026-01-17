
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
    Deep Scan Task: Professional Aviation Data Extraction (Excellent Precision Required).
    Context Date/Reference: ${params.startDate || 'Current Operational Week'}

    RECOGNITION RULES:
    1. FLIGHT HEADERS: Map "Flt", "Flt No", "Service", "Flight ID" to 'flightNumber'. 
    2. TIME HEADERS: Map "STA", "Arrival", "Arv", "In" to 'sta'. Map "STD", "Departure", "Dep", "Out" to 'std'.
    3. SECTOR HEADERS: Map "From/To", "Origin/Dest", "Sector", "Route" to 'from' and 'to'.
    4. STAFF HEADERS: Map "Agent", "Employee", "Name" to 'name'. Map "MZ", "Code", "ID" to 'initials'.
    5. PATTERN MATCHING: 
       - If you see "XX123", it is a Flight Number. 
       - If you see 3-letter uppercase (e.g. DXB, LHR), it is a Sector.
       - If you see "HH:mm", it is a Time.
    6. DATE NORMALIZATION: Force all dates to YYYY-MM-DD. Use ${params.startDate} to infer the year/month for entries like "12 May".

    OUTPUT STRUCTURE:
    Return a structured JSON containing:
    - flights: Array of { flightNumber, from, to, sta, std, date }
    - staff: Array of { name, initials, type (Local/Roster), skills (array) }
    - shifts: Array of { pickupDate, pickupTime, endDate, endTime, minStaff, maxStaff }
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `RAW DOCUMENT DATA SOURCE:\n${params.textData}` });
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
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          flights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                flightNumber: { type: Type.STRING, description: "e.g. EK 123" },
                from: { type: Type.STRING, description: "Origin IATA" },
                to: { type: Type.STRING, description: "Destination IATA" },
                sta: { type: Type.STRING, description: "HH:mm" },
                std: { type: Type.STRING, description: "HH:mm" },
                date: { type: Type.STRING, description: "YYYY-MM-DD" }
              }
            }
          },
          staff: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                initials: { type: Type.STRING, description: "2-3 character ID" },
                type: { type: Type.STRING, description: "Must be 'Local' or 'Roster'" },
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these 6 STRICT CHECKLIST RULES:

    CHECKLIST 1 - DAY 1 REST: Parse "Previous Duty Log". On Day 1 (${config.startDate}), ensure staff assigned have >= ${config.minRestHours} hours rest from their previous finish time.
    
    CHECKLIST 2 - UNIFIED ABSENCE PROCESSING:
    - Scan the "Personnel Absence & Requests" box for any mentions of initials and dates.
    - Categorize based on keywords:
      - "Off", "Day off", "Requested" -> 'DAY OFF'.
      - "AL", "Annual", "Leave" -> 'ANNUAL LEAVE'.
      - "Sick" -> 'SICK LEAVE'.
    - Default to 'DAY OFF' for Local staff and 'ROSTER LEAVE' for Roster staff if today matches their request.

    CHECKLIST 3 - LOCAL 5/2 CALCULATION:
    - For every 'Local' staff member, exactly 2 days out of 7 MUST be 'OFF'.
    - Use the processed absences from Checklist 2 as the first choice.

    CHECKLIST 4 - ROSTER CALCULATION:
    - 'Roster' staff are OFF if outside their contract range or requested leave.

    CHECKLIST 5 - ROLE MATRIX: Honor 'roleCounts' for every shift.

    CHECKLIST 6 - MINIMUM STAFFING: Every shift MUST meet 'minStaff'.

    STATION RESERVE LOGIC:
    - On-duty staff not assigned to a shift = "Station Reserve".
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days from ${config.startDate}
    Registry: Staff: ${JSON.stringify(data.staff)}, Flights: ${JSON.stringify(data.flights)}, Shifts: ${JSON.stringify(data.shifts)}
    Constraints: ${constraintsLog}
    Custom Rules: ${config.customRules}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
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
    You are an "Operational Coordinator". 
    Strictly maintain the 6-point checklist.
    Use the 5/2 pattern calculation for Local staff.
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
};
