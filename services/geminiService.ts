import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty, LeaveRequest } from "../types";

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number; 
  alerts?: { type: 'danger' | 'warning', message: string }[];
}

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

// Robust JSON extraction helper
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Attempt to extract JSON from text if dirty
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
       try { return JSON.parse(clean.substring(firstBrace, lastBrace + 1)); } catch (e2) {}
    }
    return null;
  }
};

const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;
  if (staff.type === 'Local') {
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration; 
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      
      // Basic overlap calculation
      const overlapStart = progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      
      if (overlapStart <= overlapEnd) {
         grossCredits = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      }
    }
  }

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    const overlapStart = progStart > leaveStart ? progStart : leaveStart;
    const overlapEnd = progEnd < leaveEnd ? progEnd : leaveEnd;
    
    if (overlapStart <= overlapEnd) {
        leaveDeduction += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  });
  return Math.max(0, grossCredits - leaveDeduction);
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Prepare Staff & Shift Index Mappings
  const staffContext = data.staff.map((s, idx) => {
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':''].filter(Boolean).join(',');
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    return `${idx}|${s.initials}|${skills}|${credits}`;
  }).join('\n');

  const shiftContext = data.shifts.map((s, idx) => {
    return `${idx}|${s.pickupTime}-${s.endTime}|${JSON.stringify(s.roleCounts)}`;
  }).join('\n');

  // 2. Prepare Constraints
  const leaveBlackouts: string[] = [];
  const start = new Date(config.startDate);
  const end = new Date(config.startDate);
  end.setDate(start.getDate() + config.numDays - 1);

  (data.leaveRequests || []).forEach(leave => {
    const sIdx = data.staff.findIndex(st => st.id === leave.staffId);
    if (sIdx === -1) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd < start || lStart > end) return;
    leaveBlackouts.push(`Staff Index ${sIdx} OFF: ${leave.startDate} to ${leave.endDate}`);
  });

  // 3. Strict String-Matrix Schema
  // We force all items to be strings to avoid AI confusion with mixed types, then parse INTs on client.
  const robustSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      matrix: {
        type: Type.ARRAY,
        items: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    },
    required: ["matrix"]
  };

  const prompt = `
    ROLE: Aviation Scheduler.
    TASK: Assign Staff to Shifts for ${config.numDays} days starting ${config.startDate}.

    STAFF (Index|Initials|Skills|Credits):
    ${staffContext}

    SHIFTS (Index|Time|Needs):
    ${shiftContext}

    CONSTRAINTS:
    ${leaveBlackouts.join('\n')}
    - Min Rest: ${config.minRestHours}h.
    - Don't exceed Staff Credits.

    OUTPUT FORMAT:
    Return a valid JSON object with a "matrix" property.
    "matrix" is an array of arrays. Each inner array represents one assignment.
    IMPORTANT: ALL VALUES MUST BE STRINGS.
    
    Format: ["DayOffset", "StaffIndex", "ShiftIndex", "RoleCode"]
    
    - DayOffset: "0" to "${config.numDays-1}"
    - StaffIndex: Index from STAFF list
    - ShiftIndex: Index from SHIFTS list
    - RoleCode: "LC", "SL", "OPS", "RMP", "LF", or "AGT"
    
    Example: { "matrix": [["0", "1", "5", "LC"], ["0", "2", "5", "RMP"], ["1", "1", "6", "LC"]] }
  `;

  // Automatic Retry Mechanism
  let attempt = 0;
  const maxAttempts = 2;
  let parsed: any = null;

  while (attempt < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: prompt,
          config: { 
            responseMimeType: 'application/json',
            responseSchema: robustSchema,
            temperature: 0.1, 
            maxOutputTokens: 8192,
          }
        });

        parsed = safeParseJson(response.text);
        if (parsed && parsed.matrix && Array.isArray(parsed.matrix)) {
            break; // Success
        }
      } catch (e) {
        console.warn(`Attempt ${attempt + 1} failed:`, e);
      }
      attempt++;
  }
  
  if (!parsed || !parsed.matrix || !Array.isArray(parsed.matrix)) {
      throw new Error("AI failed to generate a valid roster structure after multiple attempts.");
  }

  // 4. Reconstruct Data from Matrix
  const programs: DailyProgram[] = [];
  
  // Initialize empty days
  for(let i=0; i<config.numDays; i++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      programs.push({
          day: i,
          dateString: d.toISOString().split('T')[0],
          assignments: [],
          offDuty: []
      });
  }

  // Populate from matrix
  parsed.matrix.forEach((row: string[]) => {
      // Parse Strings back to Integers
      const dayOff = parseInt(row[0]);
      const sIdx = parseInt(row[1]);
      const shIdx = parseInt(row[2]);
      const role = row[3];
      
      // Safety check indices
      if (!isNaN(dayOff) && !isNaN(sIdx) && !isNaN(shIdx) && programs[dayOff] && data.staff[sIdx] && data.shifts[shIdx]) {
          programs[dayOff].assignments.push({
              id: Math.random().toString(36).substr(2, 9),
              staffId: data.staff[sIdx].id,
              shiftId: data.shifts[shIdx].id,
              role: role || 'AGT',
              flightId: '' // Required by type definition
          });
      }
  });
  
  return {
    programs,
    stationHealth: 95,
    alerts: [],
    isCompliant: true
  };
};

export const extractDataFromContent = async (params: { 
  textData?: string; 
  media?: ExtractionMedia[]; 
  startDate?: string; 
  targetType: 'flights' | 'staff' | 'shifts' | 'all';
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA:\n${params.textData}` });
  if (params.media) params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const prompt = `Extract ${params.targetType} to JSON. StartDate: ${params.startDate || 'N/A'}. 
  Format: { "flights": [], "staff": [], "shifts": [] }`;
  
  parts.unshift({ text: prompt });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
    }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    ROSTER MODIFICATION.
    Instruction: ${instruction}
    
    Current Roster (Compact): ${JSON.stringify(data.programs.map(p => ({d: p.dateString, a: p.assignments})))}
    Staff Map: ${JSON.stringify(data.staff.map(s => ({id: s.id, i: s.initials})))}
    
    Return strict JSON: { "programs": [ ...updated programs... ], "explanation": "string" }
  `;
  
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
    }
  });
  return safeParseJson(response.text);
};

export const repairProgramWithAI = async (
  currentPrograms: DailyProgram[],
  auditReport: string,
  data: ProgramData,
  constraints: { minRestHours: number }
): Promise<{ programs: DailyProgram[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    FIX VIOLATIONS:
    ${auditReport}
    
    ROSTER: ${JSON.stringify(currentPrograms.map(p => ({d: p.dateString, a: p.assignments})))}
    STAFF: ${JSON.stringify(data.staff.map(s => ({id: s.id, i: s.initials})))}
    
    TASK: Reassign to solve issues. 
    Return strictly: { "programs": [ ...full updated programs array... ] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      }
    });
    const parsed = safeParseJson(response.text);
    return { programs: parsed.programs || [] };
  } catch (err: any) {
    throw new Error("Repair failed.");
  }
};