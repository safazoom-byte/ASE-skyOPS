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

// Robust JSON extraction helper that handles both code blocks and raw text
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks and whitespace
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Attempt to extract JSON object/array from text if dirty
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    
    // Determine which outer wrapper appears first/valid
    let start = -1;
    let end = -1;
    
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
       start = firstBracket;
       end = lastBracket;
    } else if (firstBrace !== -1) {
       start = firstBrace;
       end = lastBrace;
    }

    if (start !== -1 && end !== -1) {
       try { return JSON.parse(clean.substring(start, end + 1)); } catch (e2) {}
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

  // 3. Define Strategy
  // Use Pro model for logic. Use STRING mode to avoid JSON number/string type conflicts.
  // Fallback to Flash in text mode if strict JSON fails.
  const strategies = [
    { model: 'gemini-3-pro-preview', mode: 'json' },
    { model: 'gemini-2.0-flash-exp', mode: 'text' }
  ];

  let parsed: any = null;
  let lastError: any = null;

  for (const strategy of strategies) {
      try {
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

            OUTPUT INSTRUCTIONS:
            Return a JSON object with a single property "matrix".
            "matrix" is an array of arrays.
            Each inner array MUST BE STRINGS: ["DayOffset", "StaffIndex", "ShiftIndex", "RoleCode"]
            
            Example: [["0", "1", "4", "LC"], ["0", "2", "4", "AGT"]]
            
            - DayOffset: "0" to "${config.numDays-1}"
            - StaffIndex: Reference index from STAFF list
            - ShiftIndex: Reference index from SHIFTS list
            - RoleCode: "LC", "SL", "OPS", "RMP", "LF", or "AGT"
            ${strategy.mode === 'text' ? 'RETURN RAW JSON ONLY. NO MARKDOWN.' : ''}
        `;

        const requestConfig: any = {
            temperature: 0.2,
            maxOutputTokens: 8192,
        };
        
        if (strategy.mode === 'json') {
            requestConfig.responseMimeType = 'application/json';
        }

        const response = await ai.models.generateContent({
            model: strategy.model,
            contents: prompt,
            config: requestConfig
        });

        parsed = safeParseJson(response.text);
        
        // Validate basic structure
        if (parsed && parsed.matrix && Array.isArray(parsed.matrix)) {
            // Check if it's not empty or looks reasonably valid
            if (parsed.matrix.length > 0) {
                break; // Success!
            }
        }
      } catch (e) {
        console.warn(`Strategy ${strategy.model} failed:`, e);
        lastError = e;
      }
  }
  
  if (!parsed || !parsed.matrix || !Array.isArray(parsed.matrix)) {
      throw new Error("AI failed to generate a roster. Please ensure you have Shifts and Staff registered, or try a shorter date range.");
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
  parsed.matrix.forEach((row: any[]) => {
      // Parse Strings back to Integers safely
      const dayOff = parseInt(String(row[0]));
      const sIdx = parseInt(String(row[1]));
      const shIdx = parseInt(String(row[2]));
      const role = String(row[3]);
      
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
      model: 'gemini-3-pro-preview', // Pro model for complex repairs
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