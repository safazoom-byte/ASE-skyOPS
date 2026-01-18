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
    1. ZERO OMISSION: Extract every single row without summarization.
    2. ROW-COUNT VERIFICATION: Total count of staff and flights must match the source.
    3. UNIQUE IDENTIFICATION: Ensure unique initials for every staff member.
    4. ACCURACY: Capture flight times (STA/STD) and sector data exactly.
    
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
                    "Shift Leader": { type: Type.STRING, enum: ['Yes', 'No'] },
                    "Operations": { type: Type.STRING, enum: ['Yes', 'No'] },
                    "Ramp": { type: Type.STRING, enum: ['Yes', 'No'] },
                    "Load Control": { type: Type.STRING, enum: ['Yes', 'No'] },
                    "Lost and Found": { type: Type.STRING, enum: ['Yes', 'No'] }
                  }
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
                    "Shift Leader": { type: Type.INTEGER },
                    "Operations": { type: Type.INTEGER },
                    "Ramp": { type: Type.INTEGER },
                    "Load Control": { type: Type.INTEGER },
                    "Lost and Found": { type: Type.INTEGER }
                  }
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these STRICT MANDATORY RULES.
    
    1. ROSTER LEAVE (CONTRACT BOUNDS): 
       - Staff of type 'Roster' have 'workFromDate' and 'workToDate'. 
       - If the program date is NOT within their work period (Date < workFromDate OR Date > workToDate), they MUST be added to the 'offDuty' list with type 'ROSTER LEAVE'.
       - Never assign them to any shift if they are outside these dates.

    2. LOCAL OFF DAYS (5/2 PATTERN):
       - Local staff MUST have 2 days OFF (Type: 'DAY OFF') every 7 days.
       - Do not work Local staff more than 5 consecutive days.

    3. ABSENCE REGISTRY (PRIORITY):
       - Parse the 'Personnel Absence & Requests' box immediately and move requested staff to 'offDuty'.

    4. NO RESERVE/STANDBY LIMBO:
       - There is no "Station Reserve". Staff are either:
         a) Assigned to a specific shift.
         b) On official Leave/Off-Duty (MUST appear in offDuty).
       - Ensure every person listed for a day has a definitive assignment or an off-duty record.

    5. DAY 1 REST GUARD: 
       - Minimum ${config.minRestHours} hours rest from previous finish times required.

    OUTPUT FORMAT:
    - programs: Array of DailyProgram objects.
    - shortageReport: Array of ShortageWarning if rest/coverage rules are bent.
  `;

  const prompt = `
    Window: ${config.numDays} Days from ${config.startDate}
    Staff: ${JSON.stringify(data.staff)}
    Flights: ${JSON.stringify(data.flights)}
    Shifts: ${JSON.stringify(data.shifts)}
    Logs: ${constraintsLog}
    Directives: ${config.customRules}
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