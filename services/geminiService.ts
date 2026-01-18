
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
    CRITICAL EXTRACTION TASK: Convert the provided aviation ground handling documents (Excel/CSV/PDF/Images) into structured JSON.
    
    STRICT COMPLIANCE RULES:
    1. DO NOT SUMMARIZE. You must extract EVERY SINGLE ROW of staff and flights found in the source.
    2. 1-TO-1 MAPPING: Each row in the source file must correspond to one entry in the JSON arrays.
    3. NO OMISSION: Even if data seems redundant or extensive, include all records.
    4. DATE FORMAT: Ensure all dates are YYYY-MM-DD.
    
    Context Date: ${params.startDate || 'Current Operational Week'}
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `RAW SOURCE DATA (CSV FORMAT):\n${params.textData}` });
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
      temperature: 0, // Deterministic extraction
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 2048 },
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
                date: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['Arrival', 'Departure', 'Turnaround'] }
              },
              required: ["flightNumber", "date"]
            }
          },
          staff: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                initials: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['Local', 'Roster'] },
                powerRate: { type: Type.NUMBER },
                workFromDate: { type: Type.STRING },
                workToDate: { type: Type.STRING },
                skillRatings: { type: Type.OBJECT }
              },
              required: ["name"]
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
                roleCounts: { type: Type.OBJECT }
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
      - "Off", "Day off", "Requested" -> 'DAY OFF' (Priority for Local 5/2 pattern).
      - "AL", "Annual", "Leave" -> 'ANNUAL LEAVE'.
      - "Sick" -> 'SICK LEAVE'.
      - "Lieu" -> 'LIEU LEAVE'.
    - If no keyword is present (e.g., "MZ 12May"), default to 'DAY OFF' for Local staff and 'ROSTER LEAVE' for Roster staff.
    - Note: You must correctly map specific dates to the generated days.

    CHECKLIST 3 - LOCAL 5/2 CALCULATION:
    - For every 'Local' staff member, exactly 2 days out of 7 MUST be 'OFF'.
    - Use the processed absences from Checklist 2 as the first choice for these 2 days.
    - If a specific Day Off is requested, it MUST be one of these two days.
    - Resulting 2 days MUST go in 'offDuty' array.

    CHECKLIST 4 - ROSTER CALCULATION:
    - 'Roster' staff are OFF if: 
      a) Today is outside their [workFromDate, workToDate] contract range (Result: 'ROSTER LEAVE').
      b) Today matches a request in the Absence Box (Result: 'ANNUAL LEAVE' or specified type).

    CHECKLIST 5 - ROLE MATRIX: Honor 'roleCounts' for every shift.

    CHECKLIST 6 - MINIMUM STAFFING: Every shift MUST meet 'minStaff'.

    STATION RESERVE LOGIC:
    - If personnel are On-Duty but not assigned to a shift, they are "Station Reserve". 
    - DO NOT put them in 'offDuty' unless they are officially on leave/off.
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
    Strictly maintain the 6-point checklist and over-staffing rules. 
    Use the 5/2 pattern calculation for Local staff and Contract-based logic for Roster staff.
    Unassigned on-duty staff = Station Reserve (not in offDuty).
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
