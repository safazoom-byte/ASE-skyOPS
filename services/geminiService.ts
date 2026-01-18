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
       - IF the date being planned is BEFORE 'workFromDate' OR AFTER 'workToDate', that staff member MUST be placed in the 'offDuty' list for that day with type 'ROSTER LEAVE'.
       - They are strictly FORBIDDEN from being assigned to any shift on those dates.

    2. LOCAL OFF DAYS (5/2 PATTERN):
       - Staff of type 'Local' MUST have exactly 2 days OFF every 7 days.
       - Staff of type 'Local' MUST NOT work more than 5 consecutive days.
       - If a Local staff member has worked 5 days, the next 2 days MUST be marked as 'DAY OFF' in the 'offDuty' list.

    3. ABSENCE REGISTRY (PRIORITY 1):
       - You MUST parse the 'Personnel Absence & Requests' box immediately.
       - If it says 'MZ Off 12May' or 'AH Annual Leave 13-15May', those staff MUST be moved to the 'offDuty' array for those specific dates. 
       - Explicitly use 'ANNUAL LEAVE', 'SICK LEAVE', or 'DAY OFF' as specified in the text.

    4. NO STANDBY LIMBO:
       - Every staff member for every day must have a definitive state. 
       - If they are not assigned to a shift AND they are not on leave, they simply don't appear in assignments.
       - HOWEVER, if they are meant to be OFF (Rule 1, 2, or 3), they MUST be in 'offDuty'.

    5. DAY 1 REST GUARD: 
       - Check 'Previous Duty Log'. Staff need ${config.minRestHours} hours rest from their previous finish time.

    6. ROLE MATRIX & COVERAGE:
       - 'Shift Leader' roles are mandatory if requested in 'roleCounts'.
       - Never drop below 'minStaff' unless it's impossible, then trigger a 'ShortageWarning'.

    OUTPUT FORMAT:
    - programs: Array of DailyProgram objects.
    - shortageReport: Array of ShortageWarning if rest/coverage rules are bent.
    - recommendations: ResourceRecommendation (HireAdvice, HealthScore 0-100).
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days starting from ${config.startDate}
    
    Current System Registry:
    Staff List: ${JSON.stringify(data.staff)}
    Flight Schedule: ${JSON.stringify(data.flights)}
    Shift Templates: ${JSON.stringify(data.shifts)}
    
    Manual Station Logs (HIGH PRIORITY): 
    ${constraintsLog}
    
    Target Settings:
    Custom Directives: ${config.customRules}
    Minimum Rest: ${config.minRestHours} Hours.
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