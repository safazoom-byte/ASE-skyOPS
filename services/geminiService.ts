
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

export const sanitizeRole = (role: string): Skill => {
  const r = role.toLowerCase().trim();
  if (r.includes('found') || r.includes('lost') || r === 'lf' || r === 'l&f' || r === 'lost and found' || r === 'lost&found') return 'Lost and Found';
  if (r.includes('leader') || r === 'sl' || r === 'shiftleader') return 'Shift Leader';
  if (r.includes('ops') || r.includes('operations') || r === 'op' || r === 'operation') return 'Operations';
  if (r.includes('ramp') || r === 'rmp') return 'Ramp';
  if (r.includes('load') || r === 'lc' || r === 'loadcontrol') return 'Load Control';
  return 'Duty'; 
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
    if (startIdx === Infinity) return null;
    let candidate = cleanText.slice(startIdx);
    const stack: string[] = [];
    let lastValidIdx = 0;
    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) lastValidIdx = i + 1;
        }
      }
    }
    if (lastValidIdx > 0) {
      try { return JSON.parse(candidate.slice(0, lastValidIdx)); } catch (e2) {}
    }
    return null;
  }
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `You are the High-Brain Station Operations Architect. Your mission: A ZERO-ERROR deployment-ready roster.

  STRICT OPERATIONAL COMMANDS:

  1. MANDATORY SPECIALIST ROLES (NON-NEGOTIABLE):
  - EVERY HANDLING SHIFT MUST have AT LEAST 1 'Shift Leader' AND 1 'Load Control'.
  - You MUST prioritize staff who are qualified (Skill Rating 'Yes') for these positions.
  - Do NOT assign generic 'Duty' roles to specialists until all SL/LC slots for that day are secure.

  2. RESOURCE SATURATION (NO IDLE STAFF):
  - Roster staff work every day of their contract.
  - If a shift is below its 'maxStaff' limit, YOU MUST assign available Roster staff to that shift until the limit is reached. 
  - Do NOT leave staff as 'Available' or 'NIL' if shifts are not yet at maximum capacity. This is an operational asset leakage.

  3. LOCAL STAFF 5/2 LAW:
  - Local staff MUST receive EXACTLY 2 days off per 7-day period. 
  - This is a legal compliance requirement.

  4. REST HOUR INTEGRITY (DAY 0 TETHERING):
  - Check 'Previous Day Duty Log' (Day 0).
  - Calculate rest: (Day 1 Start Time) minus (Day 0 End Time).
  - Personnel MUST have AT LEAST ${config.minRestHours} hours of rest. If violated, flag in shortageReport.

  5. DOUBLE-PASS VERIFICATION:
  - Before outputting, you MUST perform a secondary mental audit. 
  - "Does shift X have an SL?" "Does shift X have an LC?" "Is staff Y working too soon after their Day 0 shift?"
  - Correct any errors before final JSON generation.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Operational Window: ${config.startDate} (${config.numDays} days). 
      Registry: ${JSON.stringify(data.staff)}. 
      Flights: ${JSON.stringify(data.flights)}. 
      Shifts: ${JSON.stringify(data.shifts)}. 
      Previous History/Constraints: ${constraintsLog}.`,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    return safeParseJson(response.text);
  } catch (error) {
    throw error;
  }
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Instruction: ${instruction}. Focus on Specialist Security and Resource Utility.` }, { text: `State: ${JSON.stringify(data.programs)}` }];
  if (media) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text);
  } catch (error) {
    throw error;
  }
};

export const extractDataFromContent = async (options: {
  textData?: string;
  media?: ExtractionMedia[];
  startDate?: string;
  targetType?: 'flights' | 'staff' | 'shifts' | 'all';
}): Promise<ProgramData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { textData, media, startDate, targetType = 'all' } = options;
  const prompt = `Extract aviation operational data. Target: ${targetType}. Date context: ${startDate || 'N/A'}.`;
  const parts: any[] = [{ text: prompt }];
  if (textData) parts.push({ text: `Content: ${textData}` });
  if (media) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { flights: [], staff: [], shifts: [], programs: [] };
  } catch (error) {
    return { flights: [], staff: [], shifts: [], programs: [] };
  }
};

export const identifyMapping = async (rows: any[][], target: 'flights' | 'staff' | 'shifts' | 'all'): Promise<{ columnMap: Record<string, number> }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const headers = rows[0] || [];
  const prompt = `Identify column indices (0-based) for: flightNumber, from, to, sta, std, date, name, initials, type, powerRate, workFromDate, workToDate, skill_Ramp, skill_Operations, skill_LoadControl, skill_ShiftLeader, skill_Lost and Found, pickupDate, pickupTime, endDate, endTime, minStaff, maxStaff, roleMatrix. Headers: ${JSON.stringify(headers)}`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { columnMap: {} };
  } catch (error) {
    return { columnMap: {} };
  }
};
