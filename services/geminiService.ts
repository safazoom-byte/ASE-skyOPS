
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
  hasBlockers: boolean; // Structural failures
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
  // Deep clean for markdown blocks or leading/trailing text
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // If standard parse fails, try searching for the first object or array start
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    if (startIdx === Infinity) return null;
    let candidate = cleanText.slice(startIdx);
    
    // Attempt to find the matching closing bracket
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
    
    // Check if assignments are missing staffIds (GAPS)
    const gaps = assignments.filter(a => !a.staffId || a.staffId === 'GAP');
    if (gaps.length > 0) {
      violations.push({
        type: 'UNASSIGNED_ROLE',
        message: `Day ${prog.day + 1}: ${gaps.length} unassigned positions (marked as GAP).`,
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
    if (count > 5) {
      const s = safeStaff.find(st => st.id === id);
      violations.push({ 
        type: '5/2_VIOLATION', 
        message: `Agent ${s?.initials || id}: 5/2 Law violation (${count} days). Coverage prioritized.`,
        severity: 'WARNING'
      });
    }
  });

  return violations;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string, customRules?: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Using Flash for initial draft to prioritize speed and basic structural adherence
  const prompt = `
    COMMAND: Generate Preliminary Station Roster.
    STATION: Aviation Ground Handling Operations
    
    GOAL: 100% COVERAGE FOR ALL SHIFTS.
    
    INSTRUCTIONS:
    1. If you cannot find enough staff for a shift, assign "GAP" to the staffId. DO NOT leave the shift empty.
    2. Prioritize Coverage > Shift Leader Presence > Rest Hours > 5/2 Law.
    3. Ensure every shift in the DATA list is represented in the output for its corresponding date.
    
    CONSTRAINTS:
    - Minimum Rest: ${config.minRestHours}h
    - Max Days/Week: 5 (Preferred)
    - Context: ${constraintsLog}
    
    DATA:
    - Staff: ${JSON.stringify(data.staff.map(s => ({id: s.id, initials: s.initials, skills: [s.isShiftLeader?'Shift Leader':'', s.isLoadControl?'Load Control':'', s.isRamp?'Ramp':'', s.isOps?'Operations':'', s.isLostFound?'Lost and Found':''].filter(Boolean)})))}
    - Shifts: ${JSON.stringify(data.shifts)}
    
    OUTPUT FORMAT: JSON ONLY
    {
      "programs": [
        {
          "day": number,
          "dateString": "YYYY-MM-DD",
          "assignments": [
             { "id": "uuid", "staffId": "staff_id_or_GAP", "flightId": "optional", "role": "Skill", "shiftId": "shift_id" }
          ],
          "offDuty": []
        }
      ],
      "recommendations": { "healthScore": number, "hireAdvice": "string" }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        systemInstruction: "You are a specialized Roster Engine. You output valid JSON representing a ground handling schedule. You never say 'I cannot' - you always provide a draft, using 'GAP' for unfilled spots."
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
    throw new Error("The logic engine timed out or returned an invalid structure. Please reduce the date range or check your registry.");
  }
};

export const refineAIProgram = async (previous: BuildResult, data: ProgramData, pass: number, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    REFINEMENT PASS ${pass}: 
    Current Roster Status: ${previous.validationLog?.join('; ') || 'No major issues'}.
    
    TASK: 
    1. Swap staff to fix Rest Hour violations where possible.
    2. Try to replace "GAP" staffIds with available agents who aren't working that day.
    3. Ensure Shift Leaders are present in all slots that require them.
    
    INPUT ROSTER: ${JSON.stringify(previous.programs)}
    
    Return the FULL UPDATED JSON object.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      systemInstruction: "You are a Roster Optimizer. Focus on fixing specific logic errors and filling GAPs in the provided JSON."
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
    model: 'gemini-3-flash-preview',
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
