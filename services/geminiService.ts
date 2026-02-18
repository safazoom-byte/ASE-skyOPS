
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
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

// --- RETRY LOGIC ENGINE ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(operation: () => Promise<T>, retries = 5, baseDelay = 2000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Detect specific 503 / Overload signals from Google
      const isRetryable = 
        error?.status === 503 || 
        error?.code === 503 ||
        (error?.message && (
          error.message.includes('503') || 
          error.message.includes('overloaded') || 
          error.message.includes('high demand') ||
          error.message.includes('temporary') ||
          error.message.includes('quota')
        ));

      if (isRetryable && i < retries - 1) {
        // Exponential backoff with jitter: 2s, 4s, 8s, 16s... + random ms
        const jitter = Math.random() * 500;
        const delayTime = (baseDelay * Math.pow(2, i)) + jitter;
        console.warn(`Gemini API Busy (503). Retrying in ${Math.round(delayTime)}ms... (Attempt ${i + 1}/${retries})`);
        await wait(delayTime);
        continue;
      }
      
      // If error is not retryable (e.g., 400 Bad Request) or max retries reached, throw immediately
      throw error;
    }
  }
  throw lastError;
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

  // --- PHASE 2: STAFF CONTEXT & AVAILABILITY MAPPING (V2 ENHANCED) ---
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
    
    // Fatigue Score Calculation
    const lastDuty = (data.incomingDuties || []).filter(iduty => iduty.staffId === s.id).sort((a,b) => b.date.localeCompare(a.date))[0];
    let fatigueLevel = "FRESH";
    let lastDutyInfo = "No recent duty";

    if (lastDuty) {
        const lastDutyDate = new Date(lastDuty.date);
        const programStartDate = new Date(config.startDate);
        const diffTime = programStartDate.getTime() - lastDutyDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays <= 1) {
             const [h] = lastDuty.shiftEndTime.split(':').map(Number);
             if (h >= 20 || h <= 4) fatigueLevel = "CRITICAL_FATIGUE (Night Turnaround)";
             else fatigueLevel = "MODERATE_FATIGUE";
        }
        lastDutyInfo = `Ended ${lastDuty.date} ${lastDuty.shiftEndTime}`;
    }

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

    return `ID: ${s.initials}, Role: ${s.type}, Rank: ${s.powerRate}%, Skills: [${skills}]${dualTag}, AllocatableShifts: ${credits}, Fatigue: ${fatigueLevel} (${lastDutyInfo}), AvailPattern: ${dailyAvail}`; 
  }).join('\n');

  // --- PHASE 3: SHIFT CONTEXT (V2 ENHANCED WAVE LOGIC) ---
  const shiftContext = [...data.shifts]
    .sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime))
    .map((s, idx) => {
      // Use original index from the data array to allow safe lookup later
      const originalIdx = data.shifts.findIndex(os => os.id === s.id);
      const needs = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => `${k.substring(0,2).toUpperCase()}:${v}`).join(', ');
      
      const h = parseInt(s.pickupTime.split(':')[0]);
      let wave = "NIGHT_OPS";
      if (h >= 4 && h < 12) wave = "AM_WAVE";
      else if (h >= 12 && h < 20) wave = "PM_WAVE";

      return `Ref: ${originalIdx}, Day: ${s.pickupDate}, Slot: ${s.pickupTime}-${s.endTime} (${wave}), MinReq: ${s.minStaff}, SpecialistNeeds: [${needs}]`;
    }).join('\n');

  const operationalBriefing = `
    GLOBAL MATRIX SOLVER V2 (HIGH FIDELITY MODE):
    
    MANPOWER BLUEPRINT (HARD MATHEMATICAL LIMITS):
    ${blueprintBlock}

    STRATEGIC ALLOCATION PROTOCOL (3-PASS SYSTEM):
    
    PASS 1: COMMAND STRUCTURE (SL & LC)
    - Assign 'Shift Leaders' and 'Load Control' first.
    - DISTRIBUTE TALENT: Do not cluster all senior staff in the AM Wave. Ensure Night Ops have at least 1 senior capability if possible.
    - Use [DUAL_LC_SL] agents efficiently to cover double requirements where legal.

    PASS 2: SPECIALIST CORE (OPS, RMP, LF)
    - Fill 'Operations', 'Ramp', and 'Lost & Found' requirements next.
    - Match skills strictly. An agent without 'RMP' skill cannot cover a 'RMP' requirement.

    PASS 3: GENERAL WORKFORCE & FATIGUE MANAGEMENT
    - Fill remaining 'MinReq' slots with General Agents.
    - FATIGUE CHECK: Agents marked 'CRITICAL_FATIGUE' should NOT be assigned to early AM starts on Day 0.
    - CONTINUITY: If an agent works PM_WAVE on Day 0, prefer PM_WAVE for Day 1 to avoid body clock disruption.

    CONSTRAINT CHECKS:
    1. ROSTER PRIORITY: Contract staff must fulfill their 'AllocatableShifts' before Locals.
    2. FORCE OFF: Ensure exactly 'LOCAL_FORCE_OFF' locals are left empty (no assignments) per day. Prioritize resting high-fatigue agents.
    3. REST: ${config.minRestHours}h minimum rest between shifts is MANDATORY.
  `;

  const prompt = `
    ROLE: Global Strategic Roster Architect
    MISSION: Assign staff to shifts adhering strictly to the MANPOWER BLUEPRINT.
    
    ${operationalBriefing}

    EXECUTION STEPS:
    1. Read the "MANPOWER BLUEPRINT" for Day X. It tells you exactly how many Locals to use and how many to rest.
    2. Read "AvailPattern" for each agent. '0' means physically unavailable (Leave/Contract). '1' means available.
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

  // Wrap the call in withRetry to handle 503s
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        temperature: 0.1, 
        responseMimeType: 'application/json',
        // Increased thinking budget for complex solving
        thinkingConfig: { thinkingBudget: 4096 } 
      }
  }));

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
  
  // Wrap extraction call with retry
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts }, 
      config: { responseMimeType: "application/json" } 
  }));
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `TASK: Modify roster. Instruction: ${instruction}. Current: ${JSON.stringify(data.programs)}. Return { "programs": [], "explanation": "" }`;
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  // Wrap modification call with retry
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts }, 
      config: { responseMimeType: "application/json" } 
  }));
  return safeParseJson(response.text);
};

export const repairProgramWithAI = async (currentPrograms: DailyProgram[], auditReport: string, data: ProgramData, constraints: { minRestHours: number }): Promise<{ programs: DailyProgram[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `FIX ROSTER. Violations: ${auditReport}. Rules: 5/2 local rule, 12h rest, roster contract dates. Return: { "programs": [] }`;
  
  // Wrap repair call with retry
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ 
      model: 'gemini-3-pro-preview', 
      contents: prompt, 
      config: { responseMimeType: 'application/json' } 
  }));
  return { programs: safeParseJson(response.text)?.programs || currentPrograms };
};
