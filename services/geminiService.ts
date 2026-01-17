
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
  if (parts.length < 2) return parts[0]?.substring(0, 2).toUpperCase() || "??";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const extractDataFromContent = async (params: { 
  textData?: string, 
  media?: ExtractionMedia[],
  startDate?: string 
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Extract aviation ground handling data into JSON.
    Context Date: ${params.startDate || 'Current Week'}
    
    Fields to find:
    - Flights: Flight Number, STA, STD, Date, Sectors.
    - Staff: Full Name, Initials, Skills (Shift Leader, Ramp, Load Control, L&F, Ops), Availability Dates (From/To), Category (Local/Roster).
    - Shifts: Pickup Time, End Time, Min Staff, and a list of 'flightNumbers' covered by this shift.
    
    Rules:
    - Dates must be YYYY-MM-DD.
    - Times must be HH:mm.
    - If a person has a date range next to their name, extract it as workFromDate and workToDate.
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `Raw Text Content:\n${params.textData}` });
  if (params.media) {
    params.media.forEach(m => {
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: { parts },
    config: { responseMimeType: "application/json" }
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster.
    
    STRICT COMPLIANCE RULES:
    1. LEAVE LOGGING: 
       - ROSTER STAFF: If a staff member is category 'Roster' and the day is outside their work dates (workFromDate to workToDate), they MUST be in 'offDuty' as 'ROSTER LEAVE'.
       - LOCAL STAFF: If a 'Local' staff member is not assigned a shift, they MUST be in 'offDuty' as 'DAY OFF'.
    2. NO STAFF LEFT BEHIND (MANDATORY): EVERY available staff member (those within their contract dates) MUST be assigned to an active shift UNLESS they have leave or insufficient rest.
       - Overstaffing is allowed and expected if there is surplus manpower.
    3. NO COVERAGE/SUBSTITUTION: The 'coveringStaffId' field is FORBIDDEN. Do not use it.
    4. FULL ACCOUNTING: Every person in the registry must appear in either 'assignments' or 'offDuty' for every single day.
    5. REST: Maintain ${config.minRestHours} hours minimum rest between duties.
    
    6. CARRY-OVER REST (DAY 1): Read the 'Operational Constraints' log. 
       Format for rest is 'Initials (YYYY-MM-DD HH:mm)', e.g., 'MZ (2026-05-10 22:00)'.
       Ensure they have ${config.minRestHours} hours of rest from that timestamp before their first shift on Day 1.
    
    7. SPECIFIC DAY OFF REQUESTS: Read the 'Operational Constraints' log. 
       Format is 'Initials (YYYY-MM-DD)', e.g., 'AH (2026-05-12)'.
       Place them in 'offDuty' with type 'DAY OFF'.
    
    8. ANNUAL LEAVE: Read the 'Operational Constraints' log. 
       Format is 'Initials Date', e.g., 'ah 16apr26'. 
       If a staff member is on annual leave:
       - Place them in 'offDuty' as 'ANNUAL LEAVE' for that date.
       - FOR 'LOCAL' STAFF: If they take ANY annual leave during the week, they MUST NOT work more than 4 DAYS in total for the entire week (instead of the usual 5).
       - FOR 'ROSTER' STAFF: They must not be assigned any shifts on the leave date.

    Output JSON:
    {
      "programs": [{"day": 0, "dateString": "YYYY-MM-DD", "assignments": [], "offDuty": []}],
      "shortageReport": [],
      "recommendations": {"healthScore": 0-100, "hireAdvice": "..."}
    }
  `;

  const prompt = `
    Data:
    - Start Date: ${config.startDate}
    - Operational Window: ${config.numDays} Days
    - Operational Constraints Log: ${constraintsLog}
    - Staff Registry: ${JSON.stringify(data.staff)}
    - Flight Schedule: ${JSON.stringify(data.flights)}
    - Duty Shifts: ${JSON.stringify(data.shifts)}
    - Additional Instructions: ${config.customRules}
    
    Task: Build the program. Enforce Annual Leave rules (Max 4 days work for Local staff on Leave) and the ${config.minRestHours}h rest rule.
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
  if (!result || !result.programs) throw new Error("Logic assembly failed. Ensure station data is complete.");
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
    MANDATORY RULES:
    - NO STAFF LEFT BEHIND: Every available staff member must have a shift.
    - NO COVERAGE: Do not use 'coveringStaffId'. All staff are standard assigned.
    - OVERSTAFFING: If manpower is high, assign extra staff to existing shifts.
    - LEAVE CATEGORIES: Put 'Roster' staff on 'ROSTER LEAVE' if out of contract dates. Put 'Local' staff on 'DAY OFF' if not working.
  `;

  const parts: any[] = [
    { text: `Current Data: ${JSON.stringify(data)}` },
    { text: `Instruction: ${instruction}` }
  ];
  
  if (media) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
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
