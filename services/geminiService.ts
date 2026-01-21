import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, OffDutyRecord } from "../types.ts";

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
  type: '5/2_VIOLATION' | 'MIN_STAFF_SHORTAGE' | 'ZERO_LEAKAGE_FAILURE' | 'SKILL_GAP' | 'DATA_MALFORMED';
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

const auditRoster = (result: any, data: ProgramData, numDays: number): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  
  let programs = result?.programs;
  if (!programs && Array.isArray(result)) {
    programs = result;
  }
  
  if (!programs || !Array.isArray(programs) || programs.length === 0) {
    return [{ type: 'DATA_MALFORMED', message: 'CRITICAL: Roster structure is invalid or AI returned an empty sequence.' }];
  }

  const safeStaff = data.staff || [];
  const staffWorkCounts = new Map<string, number>();
  
  safeStaff.filter(s => s.type === 'Local').forEach(s => staffWorkCounts.set(s.id, 0));

  programs.forEach((prog: any) => {
    const assignments = prog.assignments || [];
    const progDate = prog.dateString || data.shifts.find(s => s.day === prog.day)?.pickupDate;

    assignments.forEach((a: any) => {
      if (staffWorkCounts.has(a.staffId)) {
        staffWorkCounts.set(a.staffId, (staffWorkCounts.get(a.staffId) || 0) + 1);
      }
    });

    if (progDate) {
      data.shifts.filter(s => s.pickupDate === progDate).forEach(sh => {
        const staffOnThisShift = assignments.filter((a: any) => a.shiftId === sh.id);
        if (staffOnThisShift.length < sh.minStaff) {
          violations.push({ 
            type: 'MIN_STAFF_SHORTAGE', 
            message: `Day ${prog.day + 1}: Shift ${sh.pickupTime} understaffed (${staffOnThisShift.length}/${sh.minStaff})` 
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
        message: `Agent ${s?.initials || id} violates 5/2 Law: ${count} days assigned.` 
      });
    }
  });

  return violations;
};

const rosterSchema = {
  type: Type.OBJECT,
  properties: {
    programs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.NUMBER },
          dateString: { type: Type.STRING },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                staffId: { type: Type.STRING },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING },
                shiftId: { type: Type.STRING }
              },
              required: ["id", "staffId", "flightId", "role"]
            }
          },
          offDuty: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                staffId: { type: Type.STRING },
                type: { type: Type.STRING }
              },
              required: ["staffId", "type"]
            }
          }
        },
        required: ["day", "assignments"]
      }
    },
    recommendations: {
      type: Type.OBJECT,
      properties: {
        idealStaffCount: { type: Type.NUMBER },
        currentStaffCount: { type: Type.NUMBER },
        skillGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
        hireAdvice: { type: Type.STRING },
        healthScore: { type: Type.NUMBER }
      }
    }
  },
  required: ["programs"]
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string, customRules?: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    COMMAND: Generate Station Roster Handling Plan.
    MODEL: Gemini 3 Pro
    STATION CONTEXT: Aviation Ground Handling
    
    LAWS (MANDATORY):
    1. 5/2 LAW: No "Local" agent works more than 5 days in this ${config.numDays}-day window.
    2. MIN REST: Exactly ${config.minRestHours} hours between shifts.
    3. ROLE PRIORITY: Every shift MUST have 1 Shift Leader and 1 Load Control if requested in Shift Matrix.
    4. ZERO LEAKAGE: Use available staff before allowing understaffing.
    
    Registry Context: ${constraintsLog}
    
    DATA:
    - Flights: ${JSON.stringify(data.flights)}
    - Staff: ${JSON.stringify(data.staff)}
    - Shifts: ${JSON.stringify(data.shifts)}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: rosterSchema
    }
  });

  const parsed = safeParseJson(response.text);
  const violations = auditRoster(parsed, data, config.numDays);

  return {
    programs: parsed?.programs || [],
    shortageReport: [],
    recommendations: parsed?.recommendations,
    validationLog: violations.map(v => v.message),
    isCompliant: violations.length === 0
  };
};

export const refineAIProgram = async (previous: BuildResult, data: ProgramData, pass: number, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    REFINEMENT PASS ${pass}: 
    Current Roster has ${previous.validationLog?.length || 0} violations.
    Target: 100% compliance with 5/2 Law and operational minimums.
    
    Logic Focus: ${pass === 2 ? 'Strict Logic & Rest Alignment' : 'Equity & Continuity Balancing'}
    
    Current Plan: ${JSON.stringify(previous.programs)}
    Available Resources: ${JSON.stringify({ staff: data.staff, flights: data.flights, shifts: data.shifts })}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: rosterSchema
    }
  });

  const parsed = safeParseJson(response.text);
  const violations = auditRoster(parsed, data, config.numDays);

  return {
    programs: parsed?.programs || [],
    shortageReport: [],
    recommendations: parsed?.recommendations,
    validationLog: violations.map(v => v.message),
    isCompliant: violations.length === 0
  };
};

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    Extract station handling data into a valid JSON object.
    Context Date: ${options.startDate || 'Current'}
    Target Data Category: ${options.targetType}

    MANDATORY JSON STRUCTURE:
    {
      "flights": [
        { "flightNumber": "string", "from": "string", "to": "string", "sta": "HH:mm", "std": "HH:mm", "date": "YYYY-MM-DD" }
      ],
      "staff": [
        { "name": "string", "initials": "string", "type": "Local|Roster", "powerRate": number, "skillRatings": { "Skill": "Yes|No" } }
      ],
      "shifts": [
        { "pickupDate": "YYYY-MM-DD", "pickupTime": "HH:mm", "endDate": "YYYY-MM-DD", "endTime": "HH:mm", "minStaff": number, "maxStaff": number }
      ]
    }
    
    Use the provided content below for extraction. If a category has no data, return an empty array for that key.
  `;

  const parts: any[] = [{ text: prompt }];
  
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) {
    options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { responseMimeType: 'application/json' }
  });

  return safeParseJson(response.text);
};

export const identifyMapping = async (rows: any[][], target: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    Identify which spreadsheet columns correspond to these fields: ${target}.
    Sample Rows: ${JSON.stringify(rows.slice(0, 5))}
    Return a mapping object: { "columnMap": { "field": columnIndex } }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          columnMap: {
            type: Type.OBJECT,
            additionalProperties: { type: Type.NUMBER }
          }
        },
        required: ["columnMap"]
      }
    }
  });

  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const parts: any[] = [
    { text: `COMMAND: Modify roster based on instruction: "${instruction}"` },
    { text: `CURRENT STATE: ${JSON.stringify(data)}` }
  ];

  if (media.length > 0) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      systemInstruction: "You are an expert aviation scheduler. Adjust the roster based on natural language commands while preserving legality (5/2 Law). Return updated programs list and a brief explanation.",
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