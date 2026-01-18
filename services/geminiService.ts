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
    STRICT DATA FIDELITY TASK: Extract ALL staff and flight data from the provided documents.
    
    INTEGRITY CONSTRAINTS:
    1. ZERO OMISSION: You are forbidden from summarizing. If the source has 150 rows, the JSON MUST have 150 objects.
    2. ROW-COUNT VERIFICATION: Mentally count every row before generating. The total count of 'staff' and 'flights' must match the source exactly.
    3. UNIQUE IDENTIFICATION: Generate unique initials (2-3 letters) for every staff member if they are missing in the source. Do not reuse initials for different names.
    4. ACCURACY: Capture every flight's STA/STD, Sector, and Date without rounding times.
    
    Context Date: ${params.startDate || 'Current Operational Period'}
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `SOURCE DATA:\n${params.textData}` });
  if (params.media) {
    params.media.forEach(m => {
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', 
    contents: { parts },
    config: { 
      responseMimeType: "application/json", 
      temperature: 0,
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
                skillRatings: { 
                  type: Type.OBJECT,
                  properties: {
                    'Ramp': { type: Type.STRING, enum: ['Yes', 'No'] },
                    'Load Control': { type: Type.STRING, enum: ['Yes', 'No'] },
                    'Lost and Found': { type: Type.STRING, enum: ['Yes', 'No'] },
                    'Shift Leader': { type: Type.STRING, enum: ['Yes', 'No'] },
                    'Operations': { type: Type.STRING, enum: ['Yes', 'No'] }
                  },
                  description: "Mapping of staff proficiency per role."
                }
              },
              required: ["name", "initials"]
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
                roleCounts: { 
                  type: Type.OBJECT,
                  properties: {
                    'Ramp': { type: Type.NUMBER },
                    'Load Control': { type: Type.NUMBER },
                    'Lost and Found': { type: Type.NUMBER },
                    'Shift Leader': { type: Type.NUMBER },
                    'Operations': { type: Type.NUMBER }
                  },
                  description: "Minimum personnel required for each specific role."
                }
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these 6 STRICT CHECKLIST POINTS:
    
    1. DAY 1 REST GUARD: You must analyze the 'Previous Duty Log'. If staff finished at 02:00, they cannot start before 14:00 (assuming 12h rest).
    2. ABSENCE REGISTRY: You must parse the 'Personnel Absence & Requests' box. If it says 'MZ Off 12May', MZ MUST be 'DAY OFF' on that date. 
    3. LOCAL 5/2 PATTERN: Staff categorized as 'Local' MUST have 2 days off per 7-day period. Do not assign them to more than 5 consecutive days.
    4. CONTRACT VALIDATION: Staff categorized as 'Roster' can only work between their 'workFromDate' and 'workToDate'.
    5. ROLE MATRIX: If a shift requires a 'Shift Leader', you MUST assign one. Do not use an agent without that skill rating for a SL role.
    6. COVERAGE MINIMUMS: Never assign fewer staff than 'minStaff' required for a shift. If resources are tight, trigger a ShortageWarning rather than breaking coverage.

    OUTPUT FORMAT:
    - programs: Array of DailyProgram objects.
    - shortageReport: Array of ShortageWarning if any rest/coverage rules are bent.
    - recommendations: ResourceRecommendation (HireAdvice, HealthScore 0-100).
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days from ${config.startDate}
    Registry: 
    Staff: ${JSON.stringify(data.staff)}
    Flights: ${JSON.stringify(data.flights)}
    Shifts: ${JSON.stringify(data.shifts)}
    
    Station Input Log: ${constraintsLog}
    Custom Directives: ${config.customRules}
    Target Rest: ${config.minRestHours} Hours.
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
  if (!result || !result.programs) throw new Error("Program assembly logic failed.");
  return result;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `Data: ${JSON.stringify(data)}` },
    { text: `Instruction: ${instruction}` }
  ];
  if (media) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json"
    }
  });

  return safeParseJson(response.text);
};