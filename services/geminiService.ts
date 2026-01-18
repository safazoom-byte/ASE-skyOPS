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
    1. ZERO OMISSION: Extract every single row. If the source has 100 staff, you return 100 staff.
    2. UNIQUE IDENTIFICATION: Generate unique initials for every staff member.
    3. ACCURACY: Capture every flight's STA/STD, Sector, and Date exactly.
    
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
                skillRatings: { type: Type.OBJECT }
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these STRICT MANDATORY RULES. 
    FAILURE TO COMPLY WITH THESE RULES IS AN OPERATIONAL BREACH:
    
    1. ROSTER LEAVE (CONTRACT BOUNDS): 
       - Staff of type 'Roster' have 'workFromDate' and 'workToDate'. 
       - IF the program date is BEFORE 'workFromDate' OR AFTER 'workToDate', that staff member MUST be placed in the 'offDuty' list for that day with type 'ROSTER LEAVE'.
       - They are strictly FORBIDDEN from being assigned to any shift or flight on those dates.

    2. LOCAL OFF DAYS (5/2 PATTERN):
       - Staff of type 'Local' MUST NOT work more than 5 consecutive days.
       - They MUST have exactly 2 days OFF (type 'DAY OFF') in the 'offDuty' array after 5 days of work.

    3. ABSENCE REGISTRY (PRIORITY 1):
       - Check the 'Personnel Absence & Requests' box immediately.
       - If a staff member is requested OFF, they MUST be in the 'offDuty' array for those dates.

    4. NO STANDBY LIMBO:
       - Every staff member for every day must have a clear status.
       - If they are not assigned to a flight shift, they MUST be in the 'offDuty' array.
       - NEVER use the term "Station Reserve" or "Standby" in assignments. 
       - If they aren't working a flight, they are in the Leaves Registry.

    5. DAY 1 REST GUARD: 
       - Check 'Previous Duty Log'. Staff need ${config.minRestHours} hours rest from their previous finish time before their first shift in this new period.

    OUTPUT FORMAT:
    - programs: Array of DailyProgram objects.
    - shortageReport: Array of ShortageWarning.
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days starting from ${config.startDate}
    Staff List: ${JSON.stringify(data.staff)}
    Flight Schedule: ${JSON.stringify(data.flights)}
    Shift Templates: ${JSON.stringify(data.shifts)}
    Station Logs: ${constraintsLog}
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