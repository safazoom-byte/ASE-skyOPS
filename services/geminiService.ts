
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
  
  const systemInstruction = `You are the High-Brain Station Operations Architect. This is PASS 1: INITIAL DEPLOYMENT.

  STRICT SCHEMA REQUIREMENT: 
  You MUST return a JSON object with exactly these keys: 
  { "programs": DailyProgram[], "shortageReport": ShortageWarning[], "recommendations": ResourceRecommendation }

  OPERATIONAL COMMANDMENTS:
  1. HARD MINIMUMS: Every shift MUST meet its 'minStaff' count. Failing to meet minStaff while staff are idle is a critical error.
  2. ZERO LEAKAGE: If ANY shift is below 'maxStaff', NO QUALIFIED staff member can be placed in 'NIL' (Surplus). You MUST assign them to cover gaps.
  3. 5/2 LAW: Local staff work 5 days, 2 days OFF. 
  4. START DATE: ${config.startDate}, Length: ${config.numDays} days.
  5. REGISTRY: ${JSON.stringify(data.staff)}. SHIFTS: ${JSON.stringify(data.shifts)}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Draft a station roster for ${config.numDays} days. Constraints: ${constraintsLog}.`,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        maxOutputTokens: 40000,
        thinkingConfig: { thinkingBudget: 32000 }
      }
    });
    return safeParseJson(response.text);
  } catch (error) {
    throw error;
  }
};

export const refineAIProgram = async (
  currentResult: BuildResult,
  data: ProgramData,
  passNumber: number,
  config: { minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const passInstructions = passNumber === 2 
    ? `You are performing PASS 2: COMPLIANCE AUDIT.
       FIX 5/2 VIOLATIONS: 
       - Calculate total work days for every Local staff member.
       - If total > 5, FORCE exactly 2 days to 'DAY OFF'.
       - Use 'NIL' staff from other days to fill the new gaps.
       - If a shift is below 'minStaff', you HAVE to pull staff from 'NIL' categories immediately.`
    : `You are performing PASS 3: EQUITY OPTIMIZATION.
       - Balance coverage ratios across all shifts on the same day.
       - Ensure NO qualified staff member is left in 'NIL' (Available) if a shift is below 'maxStaff'.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Current Roster: ${JSON.stringify(currentResult)}. Refine this based on registry: ${JSON.stringify(data.staff)}.`,
      config: { 
        systemInstruction: passInstructions, 
        responseMimeType: "application/json",
        maxOutputTokens: 40000,
        thinkingConfig: { thinkingBudget: 32000 }
      }
    });
    const refined = safeParseJson(response.text);
    return refined || currentResult;
  } catch (error) {
    return currentResult;
  }
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Instruction: ${instruction}. Enforce 5/2 Local Law and Zero-Leakage.` }, { text: `State: ${JSON.stringify(data.programs)}` }];
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
