
import { GoogleGenAI } from "@google/genai";
import { DailyProgram, ProgramData, Staff, LeaveRequest, IncomingDuty, ShiftConfig, Skill } from "../types";
import { AVAILABLE_SKILLS } from "../constants";

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

// 1. ADVANCED SEMANTIC JSON PARSER
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const firstOpen = clean.indexOf('[');
  const lastClose = clean.lastIndexOf(']');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      clean = clean.substring(firstOpen, lastClose + 1);
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    try {
      if (clean.startsWith('[') && !clean.endsWith(']')) return JSON.parse(clean + ']');
      if (clean.startsWith('{') && !clean.endsWith('}')) return JSON.parse(clean + '}');
    } catch (finalErr) {
      console.error("JSON Recovery Failed", finalErr);
    }
    return null;
  }
};

export const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;
  if (staff.type === 'Local') {
    grossCredits = Math.floor(duration * (5/7)); 
    if (duration < 7 && duration > 0) grossCredits = Math.ceil(duration * 0.75);
  } else {
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration;
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      const overlapStart = progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      if (overlapStart <= overlapEnd) {
         const diffTime = overlapEnd.getTime() - overlapStart.getTime();
         grossCredits = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
         grossCredits = 0; 
      }
    }
  }

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
    if (['Annual leave', 'Sick leave', 'Lieu leave', 'Day off', 'Roster leave'].includes(leave.type)) {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const overlapStart = progStart > leaveStart ? progStart : leaveStart;
        const overlapEnd = progEnd < leaveEnd ? progEnd : leaveEnd;
        if (overlapStart <= overlapEnd) {
            leaveDeduction += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
    }
  });

  return Math.max(0, grossCredits - leaveDeduction);
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  const staffMap: Record<string, string> = {};
  data.staff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

  // PRE-CALCULATE PER-DAY AVAILABILITY MATRIX
  const staffContext = data.staff.map(s => {
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':'', s.isLostFound?'LF':''].filter(Boolean).join(',');
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    
    // Day-by-Day availability string for AI: 0101101 (1=Available, 0=Leave/Outside Contract)
    let dailyAvail = "";
    for(let i=0; i<config.numDays; i++) {
        const d = new Date(config.startDate);
        d.setDate(d.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        const outOfContract = s.type === 'Roster' && s.workFromDate && s.workToDate && (dStr < s.workFromDate || dStr > s.workToDate);
        dailyAvail += (onLeave || outOfContract) ? "0" : "1";
    }

    // Historical Rest Context
    const lastDuty = (data.incomingDuties || []).filter(iduty => iduty.staffId === s.id).sort((a,b) => b.date.localeCompare(a.date))[0];
    const restContext = lastDuty ? `[PREV_DUTY_END: ${lastDuty.date}T${lastDuty.shiftEndTime}]` : "";

    return `Agent: ${s.initials}, Type: ${s.type}, Skills: [${skills}], MaxShifts: ${credits}, DailyMap: ${dailyAvail} ${restContext}`; 
  }).join('\n');

  const shiftContext = [...data.shifts]
    .sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime))
    .map((s, idx) => {
      const originalIdx = data.shifts.findIndex(os => os.id === s.id);
      const needs = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => `${k.substring(0,2).toUpperCase()}:${v}`).join(', ');
      return `ID: ${originalIdx}, DayOffset: ${getDayOffset(config.startDate, s.pickupDate)}, Time: ${s.pickupTime}-${s.endTime}, MinStaff: ${s.minStaff}, Needs: [${needs}]`;
    }).join('\n');

  function getDayOffset(start: string, target: string) {
    return Math.floor((new Date(target).getTime() - new Date(start).getTime()) / 86400000);
  }

  const prompt = `
    ROLE: Lead Aviation Scheduler
    MISSION: Generate a GROUND HANDLING ROSTER that is 100% compliant with labor laws and station safety.
    
    CRITICAL ZERO-TOLERANCE RULES:
    1. STICK TO THE DAILY MAP: If an Agent's DailyMap has a '0' at index N, DO NOT assign them on DayOffset N. 
       0 means they are ON LEAVE or OUTSIDE CONTRACT. Assignment here is a SEVERE ERROR.
    2. ONE SHIFT PER DAY: An agent CANNOT work two shifts on the same DayOffset. 
    3. THE 5/2 FATIGUE RULE: Local staff MUST NOT exceed their "MaxShifts" limit (usually 5). If they hit the limit, they are BANNED from more shifts.
    4. 12H REST MANDATE: If an agent finishes a shift at Time T1, their next shift start time must be at least T1 + 12 HOURS. 
       - Take PREV_DUTY_END into account for DayOffset 0.
    5. SKILL MATCHING: Only assign roles (SL, LC, OPS, RMP, LF) to agents who possess those skills.
    
    LOGIC:
    - ROSTER staff (Contractors) are your primary force. Maximize their utilization first.
    - LOCAL staff are backup. Do not overwork them.
    - If a shift needs 1 Shift Leader (SL), you MUST assign an agent with 'SL' skill to that shift.

    OUTPUT: JSON Array of arrays [[DayOffset, ShiftID, "Initials", "AssignedRole"], ...]
    DATA:
    Period: ${config.startDate} to ${programEndStr}
    STAFF:
    ${staffContext}
    SHIFTS:
    ${shiftContext}
  `;

  const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { temperature: 0.1, responseMimeType: 'application/json' }
  });

  const parsed = safeParseJson(response.text);
  const finalPrograms: DailyProgram[] = Array.from({length: config.numDays}).map((_, i) => {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      return { day: i, dateString: d.toISOString().split('T')[0], assignments: [] };
  });

  if (Array.isArray(parsed)) {
    parsed.forEach((item: any) => {
        const [dayOffset, shiftIdx, initials, role] = Array.isArray(item) ? item : [item.d, item.s, item.st, item.r];
        const staffId = staffMap[String(initials).toUpperCase()];
        if (finalPrograms[dayOffset] && data.shifts[shiftIdx] && staffId) {
            finalPrograms[dayOffset].assignments.push({
                id: Math.random().toString(36).substr(2, 9),
                staffId,
                shiftId: data.shifts[shiftIdx].id,
                role: role || 'AGT',
                flightId: '' 
            });
        }
    });
  }
  
  return {
    programs: finalPrograms,
    stationHealth: parsed ? 100 : 0,
    alerts: parsed ? [] : [{ type: 'danger', message: 'Logic engine timeout. Check manpower supply.' }],
    isCompliant: !!parsed
  };
};

export const extractDataFromContent = async (params: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA:\n${params.textData}` });
  if (params.media) params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const prompt = `Extract ${params.targetType} from provided content. Target Start: ${params.startDate || 'Current'}. Return valid JSON: { "flights": [], "staff": [], "shifts": [] }.`;
  parts.unshift({ text: prompt });
  const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts }, config: { responseMimeType: "application/json" } });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `TASK: Modify roster. Instruction: ${instruction}. Current: ${JSON.stringify(data.programs)}. Return { "programs": [], "explanation": "" }`;
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts }, config: { responseMimeType: "application/json" } });
  return safeParseJson(response.text);
};

export const repairProgramWithAI = async (currentPrograms: DailyProgram[], auditReport: string, data: ProgramData, constraints: { minRestHours: number }): Promise<{ programs: DailyProgram[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `FIX ROSTER. Violations: ${auditReport}. Rules: 5/2 local rule, 12h rest, roster contract dates. Return: { "programs": [] }`;
  const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt, config: { responseMimeType: 'application/json' } });
  return { programs: safeParseJson(response.text)?.programs || currentPrograms };
};
