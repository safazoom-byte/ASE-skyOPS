
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
  validationLog?: string[];
  isCompliant: boolean;
  hasBlockers: boolean; 
}

export interface ConstraintViolation {
  type: '5/2_VIOLATION' | 'MIN_STAFF_SHORTAGE' | 'ZERO_LEAKAGE_FAILURE' | 'SKILL_GAP' | 'DATA_MALFORMED' | 'UNASSIGNED_ROLE';
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
          if (stack.length === 0) {
            lastValidIdx = i + 1;
            break; 
          }
        }
      }
    }
    
    if (lastValidIdx > 0) {
      try { return JSON.parse(candidate.slice(0, lastValidIdx)); } catch (e2) {}
    }
    return null;
  }
};

const auditRoster = (result: any, data: ProgramData, numDays: number): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  const programs = result?.programs;
  
  if (!programs || !Array.isArray(programs) || programs.length === 0) {
    return [{ type: 'DATA_MALFORMED', message: 'CRITICAL: Engine failed to construct the assignment grid.', severity: 'BLOCKER' }];
  }

  const safeStaff = data.staff || [];
  const staffWorkCounts = new Map<string, number>();
  safeStaff.forEach(s => staffWorkCounts.set(s.id, 0));

  programs.forEach(prog => {
    const assignments = prog.assignments || [];
    
    const gaps = assignments.filter(a => !a.staffId || a.staffId === 'GAP');
    if (gaps.length > 0) {
      violations.push({
        type: 'UNASSIGNED_ROLE',
        message: `Day ${prog.day + 1}: ${gaps.length} positions left vacant (marked as GAP).`,
        severity: 'WARNING'
      });
    }

    assignments.forEach(a => {
      if (a.staffId && a.staffId !== 'GAP' && staffWorkCounts.has(a.staffId)) {
        staffWorkCounts.set(a.staffId, (staffWorkCounts.get(a.staffId) || 0) + 1);
      }
    });

    if (data.shifts) {
      data.shifts.filter(s => s.pickupDate === prog.dateString).forEach(sh => {
        const staffOnThisShift = assignments.filter(a => a.shiftId === sh.id && a.staffId && a.staffId !== 'GAP');
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
    const s = safeStaff.find(st => st.id === id);
    if (count > (s?.maxShiftsPerWeek || 5)) {
      violations.push({ 
        type: '5/2_VIOLATION', 
        message: `Agent ${s?.initials || id}: Shift limit exceeded (${count} days). Coverage prioritized.`,
        severity: 'WARNING'
      });
    }
  });

  return violations;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string, customRules?: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    COMMAND: Generate STATION HANDLING PLAN (Aviation Operations).
    WINDOW: ${config.numDays} Days starting from ${config.startDate}
    
    CRITICAL RULE: 
    For EVERY shift provided in the DATA list, you MUST generate assignments. 
    If you cannot find available staff for a specific shift requirement, use staffId: "GAP".
    DO NOT OMIT ANY SHIFT.
    
    GOALS:
    1. Coverage: Ensure all shifts reach their minStaff requirement.
    2. Skills: Respect Shift Leader, Load Control, Ramp, etc.
    3. Rest: Maintain ${config.minRestHours}h minimum rest between duties.
    
    CONSTRAINTS:
    - Max Days/Week: 5 (Preferred)
    - Context: ${constraintsLog}
    
    DATA:
    - Staff: ${JSON.stringify(data.staff.map(s => ({id: s.id, name: s.name, initials: s.initials, skills: [s.isShiftLeader?'Shift Leader':'', s.isLoadControl?'Load Control':'', s.isRamp?'Ramp':'', s.isOps?'Operations':'', s.isLostFound?'Lost and Found':''].filter(Boolean)})))}
    - Shifts: ${JSON.stringify(data.shifts)}
    
    OUTPUT FORMAT: JSON ONLY
    {
      "programs": [
        {
          "day": number (0-indexed offset),
          "dateString": "YYYY-MM-DD",
          "assignments": [
             { "id": "uuid", "staffId": "staff_id_or_GAP", "role": "Skill", "shiftId": "shift_id", "flightId": "optional_flight_id" }
          ],
          "offDuty": [ { "staffId": "staff_id", "type": "DAY OFF" } ]
        }
      ],
      "recommendations": { "healthScore": number, "hireAdvice": "string" }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        systemInstruction: "You are a professional Aviation Scheduler. You always produce a complete JSON handling plan. You prioritize station coverage over all other rules. You use 'GAP' to signify empty slots that need hiring or overtime."
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
  } catch (err) {
    console.error("AI Generation Error:", err);
    throw new Error("Logic engine timeout. Reduce the window or check staff availability.");
  }
};

export const refineAIProgram = async (previous: BuildResult, data: ProgramData, pass: number, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    REFINEMENT PASS ${pass}: 
    Station Log: ${previous.validationLog?.join('; ') || 'Structural check passed'}.
    
    TASK: 
    1. Fix staff swaps to resolve rest violations.
    2. Fill "GAP" IDs if any other agent is available and qualified.
    3. Ensure every shift from the master registry is represented in the output.
    
    INPUT: ${JSON.stringify(previous.programs)}
    
    Return FULL JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "You are an optimizer. Refine the provided roster JSON. Maintain valid structure. Ensure all shifts are covered."
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
  const parts: any[] = [{ text: `Extract station handling data (${options.targetType}) into JSON. Base date: ${options.startDate || 'today'}.` }];
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "Expert OCR and data extractor for aviation. Flight numbers, times, staff details."
    }
  });
  return safeParseJson(response.text);
};

export const identifyMapping = async (rows: any[][], target: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Map these sample rows to fields: ${target}. Rows: ${JSON.stringify(rows.slice(0, 5))}. Return JSON { "columnMap": { "field": index } }`;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: 'application/json' }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `INSTRUCTION: ${instruction}` }, { text: `DATA: ${JSON.stringify(data)}` }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      systemInstruction: "Senior Roster Manager. Update existing JSON programs based on instructions. Maintain schema and operational laws."
    }
  });
  return safeParseJson(response.text);
};
