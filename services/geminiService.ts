
import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill } from "../types.ts";

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
  hasBlockers: boolean; // Structural failures
}

export interface ConstraintViolation {
  type: '5/2_VIOLATION' | 'MIN_STAFF_SHORTAGE' | 'ZERO_LEAKAGE_FAILURE' | 'SKILL_GAP' | 'DATA_MALFORMED';
  message: string;
  severity: 'BLOCKER' | 'WARNING';
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

const auditRoster = (result: any, data: ProgramData, _numDays: number): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  const programs = result?.programs;
  
  if (!programs || !Array.isArray(programs)) {
    return [{ type: 'DATA_MALFORMED', message: 'CRITICAL: Roster structure is invalid or empty.', severity: 'BLOCKER' }];
  }

  const safeStaff = data.staff || [];
  const staffWorkCounts = new Map<string, number>();
  
  safeStaff.filter(s => s.type === 'Local').forEach(s => staffWorkCounts.set(s.id, 0));

  programs.forEach(prog => {
    const assignments = prog.assignments || [];
    assignments.forEach(a => {
      if (staffWorkCounts.has(a.staffId)) {
        staffWorkCounts.set(a.staffId, (staffWorkCounts.get(a.staffId) || 0) + 1);
      }
    });

    if (data.shifts) {
      data.shifts.filter(s => s.pickupDate === prog.dateString).forEach(sh => {
        const staffOnThisShift = assignments.filter(a => a.shiftId === sh.id);
        if (staffOnThisShift.length < sh.minStaff) {
          violations.push({ 
            type: 'MIN_STAFF_SHORTAGE', 
            message: `Day ${prog.day + 1}: Shift ${sh.pickupTime} understaffed (${staffOnThisShift.length}/${sh.minStaff})`,
            severity: 'WARNING'
          });
        }
      });
    }
  });

  staffWorkCounts.forEach((count, id) => {
    if (count > 5) {
      const s = safeStaff.find(st => st.id === id);
      violations.push({ 
        type: '5/2_VIOLATION', 
        message: `Agent ${s?.initials || id} violates 5/2 Law: ${count} days assigned.`,
        severity: 'WARNING'
      });
    }
  });

  return violations;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string, customRules?: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    COMMAND: Generate Station Roster Handling Plan.
    STATION CONTEXT: Aviation Ground Handling
    
    PRIMARY OBJECTIVE: 100% Shift Coverage.
    
    LAWS:
    1. ROLE PRIORITY: Every shift MUST have specialists (isShiftLeader=true, isLoadControl=true, etc) as requested in roleCounts.
    2. MIN REST: ${config.minRestHours} hours between shifts.
    3. 5/2 LAW: Limit "Local" agents to 5 days, but prioritize coverage.
    
    Staff Data Schema: id, name, initials, type, isRamp, isShiftLeader, isOps, isLoadControl, isLostFound, powerRate.
    
    Registry Context: ${constraintsLog}
    
    DATA:
    - Flights: ${JSON.stringify(data.flights)}
    - Staff: ${JSON.stringify(data.staff)}
    - Shifts: ${JSON.stringify(data.shifts)}
    
    OUTPUT FORMAT: JSON ONLY
    {
      "programs": [DailyProgram],
      "recommendations": ResourceRecommendation
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "You are a world-class aviation operations scheduler. Precision and compliance with 5/2 labor laws and rest hours are mandatory."
    }
  });

  const parsed = safeParseJson(response.text);
  const violations = auditRoster(parsed, data, config.numDays);
  const hasBlockers = violations.some(v => v.severity === 'BLOCKER');

  return {
    programs: parsed?.programs || [],
    shortageReport: [],
    recommendations: parsed?.recommendations,
    validationLog: violations.map(v => v.message),
    isCompliant: violations.length === 0,
    hasBlockers
  };
};

export const refineAIProgram = async (previous: BuildResult, data: ProgramData, pass: number, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    REFINEMENT PASS ${pass}: 
    Current Roster has ${previous.validationLog?.length || 0} violations/warnings.
    Logic: ${pass === 2 ? 'Strict Logic & Rest Alignment' : 'Equity & Continuity Balancing'}
    
    Improve this roster: ${JSON.stringify(previous.programs)}
    Target Data: ${JSON.stringify({ staff: data.staff, flights: data.flights, shifts: data.shifts })}
    
    Response must be JSON ONLY.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "Refine the provided roster. Fix rest hour violations and ensure shift leaders are assigned where missing."
    }
  });

  const parsed = safeParseJson(response.text);
  const violations = auditRoster(parsed, data, config.numDays);
  const hasBlockers = violations.some(v => v.severity === 'BLOCKER');

  return {
    programs: parsed?.programs || [],
    shortageReport: [],
    recommendations: parsed?.recommendations,
    validationLog: violations.map(v => v.message),
    isCompliant: violations.length === 0,
    hasBlockers
  };
};

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = [{ text: `Extract station handling data (${options.targetType}) into JSON. Use ${options.startDate} as base date if needed.` }];
  
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) {
    options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "Extract flight numbers, times, staff names, and initials from images or text. Ensure YYYY-MM-DD date formatting."
    }
  });

  return safeParseJson(response.text);
};

export const identifyMapping = async (rows: any[][], target: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Given these sample rows from a sheet, map the columns to these fields: ${target}.
    Rows: ${JSON.stringify(rows.slice(0, 5))}
    Return JSON: { "columnMap": { "field": index } }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: 'application/json' }
  });

  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = [
    { text: `INSTRUCTION: ${instruction}` },
    { text: `CURRENT DATA: ${JSON.stringify(data)}` }
  ];

  if (media.length > 0) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      systemInstruction: "You are an expert aviation scheduler. Modify the existing roster based on user instructions. Ensure compliance with 5/2 Law and Rest Hours. Return the updated programs list and an explanation of changes."
    }
  });

  return safeParseJson(response.text);
};
