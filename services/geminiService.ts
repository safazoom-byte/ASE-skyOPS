
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

  // --- PHASE 1: CAPACITY HEATMAP & STRATEGIC BRIEFING ---
  const dailyDemand: Record<number, number> = {};
  
  for(let i=0; i<config.numDays; i++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    const dStr = d.toISOString().split('T')[0];
    
    // Demand: Sum of minStaff for all shifts this day
    dailyDemand[i] = data.shifts
      .filter(s => s.pickupDate === dStr)
      .reduce((acc, curr) => acc + curr.minStaff, 0);
  }

  // Calculate "Light Days" (Lowest Demand)
  // We identify the bottom 2 days to enforce Local off-days if the period is ~1 week
  const lightDays = Object.entries(dailyDemand)
    .sort(([,a], [,b]) => a - b)
    .slice(0, 2)
    .map(([day]) => parseInt(day));

  const operationalBriefing = `
    WEEKLY STRATEGIC PLAN (GLOBAL SOLVER):
    - Target: Exactly 5 work days for Local staff (5/2 Pattern).
    - Light Days (Low Demand): DayOffsets ${lightDays.join(', ')}. Locals are PRE-ALLOCATED OFF on these days via DailyMap.
    - Heavy Days: All other days. Prioritize full deployment.
    - Specialist Priority: Assign Roster Specialists first to 'heavy' roles. 
    - LC+SL Optimization: Staff marked [DUAL_LC_SL] are force multipliers. Assigning them to LC satisfies 1 SL requirement too.
  `;

  // --- PHASE 2: STAFF CONTEXT & AVAILABILITY MAPPING ---
  const staffContext = data.staff.map(s => {
    const skills = [
      s.isLoadControl?'LC':'', 
      s.isShiftLeader?'SL':'', 
      s.isOps?'OPS':'', 
      s.isRamp?'RMP':'', 
      s.isLostFound?'LF':''
    ].filter(Boolean).join(',');
    
    // Check for Dual Role Super-Token
    const isDualLCSL = s.isLoadControl && s.isShiftLeader;
    const dualTag = isDualLCSL ? ' [DUAL_LC_SL]' : '';
    
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    
    let dailyAvail = "";
    for(let i=0; i<config.numDays; i++) {
        const d = new Date(config.startDate);
        d.setDate(d.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        
        // 1. Check Leave
        const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        
        // 2. Check Contract (Roster)
        const outOfContract = s.type === 'Roster' && s.workFromDate && s.workToDate && (dStr < s.workFromDate || dStr > s.workToDate);
        
        // 3. Strategic Off-Day Enforcement (Local)
        // If Local, and this is a "Light Day", force off to achieve 5/2 ratio
        let forceOff = false;
        if (s.type === 'Local' && !onLeave && config.numDays >= 5) {
            if (lightDays.includes(i)) forceOff = true;
        }

        if (onLeave || outOfContract || forceOff) {
            dailyAvail += "0";
        } else {
            dailyAvail += "1";
        }
    }

    const lastDuty = (data.incomingDuties || []).filter(iduty => iduty.staffId === s.id).sort((a,b) => b.date.localeCompare(a.date))[0];
    const restContext = lastDuty ? `[REST_LOG: Ended ${lastDuty.date} at ${lastDuty.shiftEndTime}]` : "[REST_LOG: None]";

    return `Agent: ${s.initials}, Type: ${s.type}, Skills: [${skills}]${dualTag}, MaxShifts: ${credits}, DailyMap: ${dailyAvail}, ${restContext}`; 
  }).join('\n');

  // --- PHASE 3: SHIFT CONTEXT ---
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
    ROLE: Global Strategic Roster Architect
    MISSION: Create a weekly program using a "Big Basket" approach.
    
    ${operationalBriefing}

    PHASED EXECUTION RULES:
    1. EXHAUST ROSTER FIRST: Fill all specialist needs (LC, SL, OPS, RMP, LF) with Roster staff before using Locals.
    2. LOCAL 5/2 BALANCING: Ensure Local staff work exactly their MaxShifts. The DailyMap has strictly pre-calculated their OFF days (0). You MUST respect DailyMap.
    3. LC+SL SYNERGY: If an agent has [DUAL_LC_SL], assigning them to 'LC' role counts as covering 1 'SL' requirement too. Optimize this!
    4. REST MANDATE: Minimum ${config.minRestHours}h gap. Use REST_LOG for Day 0 calculations.
    5. NO GO ZONES: DailyMap '0' means NO WORK allowed (Leave/Contract/Forced Off).

    OUTPUT FORMAT: JSON Array of arrays [[DayOffset, ShiftID, "Initials", "AssignedRole"], ...]
    Note: "AssignedRole" must be one of: LC, SL, OPS, RMP, LF, or AGT (for general).

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
      config: { 
        temperature: 0.1, 
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 4000 } 
      }
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
    alerts: parsed ? [] : [{ type: 'danger', message: 'Strategic Engine timeout. Check logic constraints.' }],
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
