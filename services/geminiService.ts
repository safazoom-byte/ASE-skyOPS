
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
  
  // 1. Try cleaning Markdown wrappers
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // 2. Locate the main array [...]
  const firstOpen = clean.indexOf('[');
  const lastClose = clean.lastIndexOf(']');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      clean = clean.substring(firstOpen, lastClose + 1);
  } else {
      // Fallback: Try locating an object {...} if array not found
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
          clean = clean.substring(firstBrace, lastBrace + 1);
      }
  }

  try {
    const parsed = JSON.parse(clean);
    // Unwrapping logic if the AI returned { "result": [...] } or similar
    if (!Array.isArray(parsed) && typeof parsed === 'object') {
        const values = Object.values(parsed);
        const arrayVal = values.find(v => Array.isArray(v));
        if (arrayVal) return arrayVal;
    }
    return parsed;
  } catch (e) {
    console.error("JSON Parse Error:", e);
    // Last ditch: try to append brackets if missing
    try {
      if (clean.trim().startsWith('[') && !clean.trim().endsWith(']')) return JSON.parse(clean + ']');
    } catch (err2) {}
    return null;
  }
};

export const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;
  if (staff.type === 'Local') {
    // 5/2 Rule Logic: For every 7 days, 5 days work.
    grossCredits = Math.floor(duration * (5/7)); 
    // Fallback for short periods (e.g. 1-4 days) to allow utilization
    if (duration < 7 && duration > 0) grossCredits = Math.ceil(duration * 0.8);
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

  // --- PHASE 1: GENERATE MANPOWER BLUEPRINT (THE "GOLD AUDIT" LOGIC) ---
  const totalLocalCount = data.staff.filter(s => s.type === 'Local').length;
  const dailyBlueprint: string[] = [];

  for(let i=0; i<config.numDays; i++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    const dStr = d.toISOString().split('T')[0];
    
    // 1. Calculate Demand
    const dailyDemand = data.shifts
      .filter(s => s.pickupDate === dStr)
      .reduce((acc, curr) => acc + curr.minStaff, 0);

    // 2. Calculate Roster Availability
    const activeRosterCount = data.staff.filter(s => {
        if (s.type !== 'Roster') return false;
        
        // Contract Check
        if (!s.workFromDate || !s.workToDate) return false;
        if (dStr < s.workFromDate || dStr > s.workToDate) return false;

        // Leave Check
        const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        if (onLeave) return false;

        return true;
    }).length;

    // 3. Calculate Local Requirements
    const localNeeded = Math.max(0, dailyDemand - activeRosterCount);
    
    // 4. Calculate Forced Off-Duty
    const localForceOff = Math.max(0, totalLocalCount - localNeeded);

    dailyBlueprint.push(
        `DATE ${dStr} (D${i}): Demand=${dailyDemand}. RosterAvailable=${activeRosterCount}. LOCAL_WORK_TARGET=${localNeeded}. LOCAL_FORCE_OFF=${localForceOff}.`
    );
  }

  const blueprintBlock = dailyBlueprint.join('\n');

  const operationalBriefing = `
    CRITICAL MANPOWER BLUEPRINT (EXECUTE STRICTLY):
    The station statistics have proven the following mathematical feasibility. You must NOT deviate from these numbers.
    
    ${blueprintBlock}

    STRATEGIC RULES:
    1. ROSTER PRIORITY: Roster staff (contractors) must be deployed first to cover their contract days.
    2. LOCAL OFF-DUTY ENFORCEMENT: For each date, you MUST assign exactly 'LOCAL_FORCE_OFF' count of Local staff to 'NO SHIFT'. 
       - Do not over-assign Locals. If the blueprint says 9 Locals off, pick the 9 with the highest fatigue or lowest credits and give them a day off.
    3. ROLE OPTIMIZATION:
       - [DUAL_LC_SL]: Staff with both Shift Leader and Load Control skills are force multipliers. Assigning them to LC satisfies 1 SL requirement visually.
    4. REST: Ensure ${config.minRestHours}h rest between shifts.
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
        
        const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        const outOfContract = s.type === 'Roster' && s.workFromDate && s.workToDate && (dStr < s.workFromDate || dStr > s.workToDate);
        
        if (onLeave || outOfContract) {
            dailyAvail += "0";
        } else {
            dailyAvail += "1";
        }
    }

    const lastDuty = (data.incomingDuties || []).filter(iduty => iduty.staffId === s.id).sort((a,b) => b.date.localeCompare(a.date))[0];
    const restContext = lastDuty ? `[REST_LOG: Ended ${lastDuty.date} at ${lastDuty.shiftEndTime}]` : "[REST_LOG: None]";

    return `Agent: ${s.initials}, Type: ${s.type}, Skills: [${skills}]${dualTag}, TargetShifts: ${credits}, DailyMap: ${dailyAvail}, ${restContext}`; 
  }).join('\n');

  // --- PHASE 3: SHIFT CONTEXT ---
  const shiftContext = [...data.shifts]
    .sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime))
    .map((s, idx) => {
      // Use original index from the data array to allow safe lookup later
      const originalIdx = data.shifts.findIndex(os => os.id === s.id);
      const needs = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => `${k.substring(0,2).toUpperCase()}:${v}`).join(', ');
      return `ID: ${originalIdx}, Date: ${s.pickupDate}, Time: ${s.pickupTime}-${s.endTime}, MinStaff: ${s.minStaff}, Needs: [${needs}]`;
    }).join('\n');

  const prompt = `
    ROLE: Global Strategic Roster Architect
    MISSION: Assign staff to shifts adhering strictly to the MANPOWER BLUEPRINT.
    
    ${operationalBriefing}

    EXECUTION STEPS:
    1. Read the "MANPOWER BLUEPRINT" for Day X. It tells you exactly how many Locals to use and how many to rest.
    2. Read "DailyMap" for each agent. '0' means physically unavailable (Leave/Contract). '1' means available.
    3. Fill the 'RosterAvailable' quota first using available Roster staff.
    4. Fill the 'LOCAL_WORK_TARGET' using available Local staff.
    5. The remaining Locals (equal to LOCAL_FORCE_OFF) MUST NOT be assigned shifts on that day.
    6. Ensure specialist roles (LC, SL, OPS, RMP) are covered by people with those skills.

    OUTPUT FORMAT: 
    STRICTLY RETURN ONLY A RAW JSON ARRAY. NO MARKDOWN. NO COMMENTS.
    Format: [[DayOffset, ShiftID, "Initials", "AssignedRole"], ...]
    
    Example: [[0, 2, "AB-HMB", "RMP"], [0, 2, "XY-ATZ", "LC"], [1, 5, "AB-HMB", "RMP"]]
    Note: DayOffset is 0 to ${config.numDays-1}. ShiftID is the ID provided in SHIFTS list.

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
        // Increased thinking budget for complex solving
        thinkingConfig: { thinkingBudget: 4096 } 
      }
  });

  const parsed = safeParseJson(response.text);
  
  // SANITIZED INITIALIZATION: Create empty days ONLY for the requested period.
  const finalPrograms: DailyProgram[] = Array.from({length: config.numDays}).map((_, i) => {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      return { day: i, dateString: d.toISOString().split('T')[0], assignments: [] };
  });

  let validAssignmentsCount = 0;

  if (Array.isArray(parsed)) {
    parsed.forEach((item: any) => {
        const [dayOffset, shiftIdx, initials, role] = Array.isArray(item) ? item : [item.d, item.s, item.st, item.r];
        const staffId = staffMap[String(initials).toUpperCase()];
        
        // Strict Boundary Check: Ensure dayOffset is within the 0..numDays-1 range
        if (typeof dayOffset === 'number' && dayOffset >= 0 && dayOffset < config.numDays && finalPrograms[dayOffset] && data.shifts[shiftIdx] && staffId) {
            finalPrograms[dayOffset].assignments.push({
                id: Math.random().toString(36).substr(2, 9),
                staffId,
                shiftId: data.shifts[shiftIdx].id,
                role: role || 'AGT',
                flightId: '' 
            });
            validAssignmentsCount++;
        }
    });
  }
  
  const stationHealth = (parsed && validAssignmentsCount > 0) ? 100 : 0;
  
  return {
    programs: finalPrograms,
    stationHealth,
    alerts: stationHealth === 0 ? [{ type: 'danger', message: 'CRITICAL: AI failed to generate valid assignments. Check staff/shift inputs.' }] : [],
    isCompliant: stationHealth === 100
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
