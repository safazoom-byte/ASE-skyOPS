
import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, OffDutyRecord } from "../types";

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
  validationLog?: string[];
  isCompliant: boolean;
}

interface ConstraintViolation {
  type: '5/2_VIOLATION' | 'MIN_STAFF_SHORTAGE' | 'ZERO_LEAKAGE_FAILURE' | 'SKILL_GAP';
  message: string;
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

/**
 * FATAL AUDITOR (Hard Lockdown Engine)
 */
const auditRoster = (result: BuildResult, data: ProgramData, numDays: number): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  const { programs } = result;
  if (!programs || !Array.isArray(programs) || programs.length === 0) {
    return [{ type: '5/2_VIOLATION', message: 'FATAL: Roster is empty.' }];
  }

  // Calculate proportional work day target (5 days work per 7 days)
  const targetWorkDays = Math.round((numDays / 7) * 5);

  // 1. HARD AUDIT: 5/2 Law (Proportional)
  const staffWorkCounts = new Map<string, number>();
  data.staff.filter(s => s.type === 'Local').forEach(s => staffWorkCounts.set(s.id, 0));

  programs.forEach(p => {
    p.assignments.forEach(a => {
      if (staffWorkCounts.has(a.staffId)) {
        staffWorkCounts.set(a.staffId, (staffWorkCounts.get(a.staffId) || 0) + 1);
      }
    });
  });

  staffWorkCounts.forEach((count, id) => {
    const s = data.staff.find(st => st.id === id);
    if (count !== targetWorkDays) {
      violations.push({ 
        type: '5/2_VIOLATION', 
        message: `FATAL: Local Staff ${s?.initials} has ${count}/${targetWorkDays} work days. MUST BE EXACTLY ${targetWorkDays} for a ${numDays}-day window.` 
      });
    }
  });

  // 2. HARD AUDIT: Minimum Staffing & Zero Asset Leakage
  programs.forEach(p => {
    const shiftAssignments: Record<string, number> = {};
    p.assignments.forEach(a => { if (a.shiftId) shiftAssignments[a.shiftId] = (shiftAssignments[a.shiftId] || 0) + 1; });
    const idleStaffCount = (p.offDuty || []).filter(o => o.type === 'NIL').length;
    
    data.shifts.filter(s => s.pickupDate === p.dateString || s.day === p.day).forEach(s => {
      const assigned = shiftAssignments[s.id] || 0;
      if (assigned < s.minStaff) {
        if (idleStaffCount > 0) {
          violations.push({ 
            type: 'ZERO_LEAKAGE_FAILURE', 
            message: `FATAL: Day ${p.day+1} - Shift ${s.pickupTime} is in shortage (${assigned}/${s.minStaff}) while ${idleStaffCount} staff are idle (NIL). RE-ASSIGN NIL STAFF IMMEDIATELY.` 
          });
        }
      }
    });
  });

  return violations;
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let currentResult: BuildResult = { programs: [], shortageReport: [], isCompliant: false };
  let retryCount = 0;
  const maxRetries = 4;

  const basePrompt = `COMMAND: Generate an Aviation Station Roster for ${config.numDays} days starting ${config.startDate}.
  Registry Context: ${constraintsLog}
  LAWS: 1. 5/2 Law Proportional (${Math.round((config.numDays/7)*5)} work days). 2. Satiate Min Staffing. 3. Zero Leakage (No NIL if shortage).`;

  const systemInstruction = `Output valid JSON with keys: programs, shortageReport, recommendations.`;

  while (retryCount <= maxRetries) {
    const prompt = retryCount === 0 ? basePrompt : `REPAIR ERRORS:\n${currentResult.validationLog?.join('\n')}\n\nSTATE: ${JSON.stringify(currentResult.programs)}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { systemInstruction, responseMimeType: "application/json", maxOutputTokens: 40000, thinkingConfig: { thinkingBudget: 32000 } }
    });
    const parsed = safeParseJson(response.text);
    if (!parsed) { retryCount++; continue; }
    const violations = auditRoster(parsed, data, config.numDays);
    if (violations.length === 0) return { ...parsed, isCompliant: true };
    currentResult = { ...parsed, validationLog: violations.map(v => v.message), isCompliant: false };
    retryCount++;
  }
  return currentResult;
};

export const refineAIProgram = async (
  currentResult: BuildResult,
  data: ProgramData,
  passNumber: number,
  config: { minRestHours: number, startDate: string, numDays: number }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const instruction = passNumber === 2 ? "COMPLIANCE AUDIT: Fix remaining logic errors." : "EQUITY PASS: Balance load without breaking 5/2 Law.";
  
  let result = currentResult;
  let retry = 0;
  while (retry < 2) {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Roster: ${JSON.stringify(result)}. Instruction: ${instruction}.`,
      config: { systemInstruction: "Refine JSON. Do not break 5/2 Law.", responseMimeType: "application/json", maxOutputTokens: 40000, thinkingConfig: { thinkingBudget: 32000 } }
    });
    const parsed = safeParseJson(response.text);
    if (parsed) {
      const violations = auditRoster(parsed, data, config.numDays);
      if (violations.length === 0) return { ...parsed, isCompliant: true };
      result = { ...parsed, isCompliant: false, validationLog: violations.map(v => v.message) };
    }
    retry++;
  }
  return result;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Instruction: ${instruction}. Enforce 5/2 Local Law.` }, { text: `State: ${JSON.stringify(data.programs)}` }];
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
  const parts: any[] = [{ text: `Extract aviation data for ${targetType}.` }];
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
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Identify column indices for headers: ${JSON.stringify(headers)}`,
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { columnMap: {} };
  } catch (error) {
    return { columnMap: {} };
  }
};
