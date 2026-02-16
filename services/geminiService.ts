import { GoogleGenAI } from "@google/genai";
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
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
      } catch (e2) {
         return null;
      }
    }
    return null;
  }
};

const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date) => {
  const s1 = new Date(Date.UTC(start1.getUTCFullYear(), start1.getUTCMonth(), start1.getUTCDate()));
  const e1 = new Date(Date.UTC(end1.getUTCFullYear(), end1.getUTCMonth(), end1.getUTCDate()));
  const s2 = new Date(Date.UTC(start2.getUTCFullYear(), start2.getUTCMonth(), start2.getUTCDate()));
  const e2 = new Date(Date.UTC(end2.getUTCFullYear(), end2.getUTCMonth(), end2.getUTCDate()));
  const overlapStart = s1 > s2 ? s1 : s2;
  const overlapEnd = e1 < e2 ? e1 : e2;
  if (overlapStart > overlapEnd) return 0;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
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
      grossCredits = getOverlapDays(progStart, progEnd, contractStart, contractEnd);
    }
  }

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    leaveDeduction += getOverlapDays(progStart, progEnd, leaveStart, leaveEnd);
  });
  return Math.max(0, grossCredits - leaveDeduction);
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Prepare Mappings (Real ID <-> Short ID)
  // This prevents the AI from hallucinating complex UUIDs and saves tokens.
  const staffMap = new Map<string, string>(); // Real -> S0
  const revStaffMap = new Map<string, string>(); // S0 -> Real
  
  const shiftMap = new Map<string, string>(); // Real -> H0
  const revShiftMap = new Map<string, string>(); // H0 -> Real

  data.staff.forEach((s, i) => {
    const short = `S${i}`;
    staffMap.set(s.id, short);
    revStaffMap.set(short, s.id);
  });

  data.shifts.forEach((s, i) => {
    const short = `H${i}`;
    shiftMap.set(s.id, short);
    revShiftMap.set(short, s.id);
  });

  // 2. Prepare Staff Data with Short IDs
  const creditBank: Record<string, number> = {};
  data.staff.forEach(s => {
    creditBank[s.id] = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
  });

  const availableStaffContext = data.staff.map(s => {
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':''].filter(Boolean).join(',');
    return `${staffMap.get(s.id)}|${s.initials}|${skills}|${creditBank[s.id]}`;
  });

  // 3. Prepare Constraints
  const leaveBlackouts: string[] = [];
  const start = new Date(config.startDate);
  const end = new Date(config.startDate);
  end.setDate(start.getDate() + config.numDays - 1);

  (data.leaveRequests || []).forEach(leave => {
    const s = data.staff.find(st => st.id === leave.staffId);
    if (!s) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd < start || lStart > end) return;
    leaveBlackouts.push(`- ${staffMap.get(s.id)} (${s.initials}) OFF on ${leave.startDate} to ${leave.endDate}`);
  });

  // 4. Build Prompt
  const prompt = `
    ROLE: Build ${config.numDays}-day roster (${config.startDate}).
    
    STAFF [ID|Initials|Skills|Credits]:
    ${availableStaffContext.join('\n')}

    SHIFTS [ID|Time|Requirements]:
    ${data.shifts.map(s => `${shiftMap.get(s.id)}|${s.pickupTime}-${s.endTime}|${JSON.stringify(s.roleCounts)}`).join('\n')}

    CONSTRAINTS:
    ${leaveBlackouts.join('\n')}
    - Min Rest: ${config.minRestHours}h between shifts.
    
    TASK: Assign STAFF to SHIFTS for each day.
    OUTPUT: JSON Array. Keys: "dt" (YYYY-MM-DD), "s" (StaffID), "sh" (ShiftID), "r" (Role).
    Format: [{"dt":"2026-02-20","s":"S0","sh":"H0","r":"LC"}, ...]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        temperature: 0.1, 
        maxOutputTokens: 8192,
      }
    });

    const parsedArray = safeParseJson(response.text);
    if (!Array.isArray(parsedArray)) throw new Error("Invalid AI Output Format");

    // 5. Reconstruct State
    const programs: DailyProgram[] = [];
    
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

    parsedArray.forEach((item: any) => {
        const prog = programs.find(p => p.dateString === item.dt);
        const realStaffId = revStaffMap.get(item.s);
        const realShiftId = revShiftMap.get(item.sh);
        
        if (prog && realStaffId && realShiftId) {
            prog.assignments.push({
                id: Math.random().toString(36).substr(2, 9),
                staffId: realStaffId,
                shiftId: realShiftId,
                role: item.r || 'Agent',
                flightId: '' 
            });
        }
    });
    
    return {
      programs,
      stationHealth: 95,
      alerts: [],
      isCompliant: true
    };

  } catch (err: any) {
    console.error("Gemini Error:", err);
    throw new Error(`Build Failed: ${err.message}`);
  }
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
    config: { responseMimeType: "application/json" }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Pass compact IDs to save context
  const parts: any[] = [
    { text: `ROSTER: ${JSON.stringify(data.programs.map(p => ({d: p.dateString, a: p.assignments})))}` },
    { text: `REQ: ${instruction}` },
    { text: `STAFF: ${JSON.stringify(data.staff.map(s => ({id: s.id, i: s.initials})))}` }
  ];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
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
  const prompt = `FIX VIOLATIONS:\n${auditReport}\nROSTER: ${JSON.stringify(currentPrograms)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const parsed = safeParseJson(response.text);
    return { programs: parsed.programs || [] };
  } catch (err: any) {
    throw new Error("Repair failed.");
  }
};
