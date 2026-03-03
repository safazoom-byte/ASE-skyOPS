
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

async function withRetry<T>(operation: () => Promise<T>, retries = 3, baseDelay = 1500): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Safely convert error to string
      let errStr = '';
      if (typeof error === 'string') {
        errStr = error;
      } else if (error?.message) {
        errStr = error.message;
      } else {
        try { errStr = JSON.stringify(error); } catch (e) { errStr = String(error); }
      }

      // Detect specific 503 / Overload signals from Google
      const isRetryable = 
        error?.status === 503 || 
        error?.code === 503 ||
        errStr.includes('503') || 
        errStr.includes('overloaded') || 
        errStr.includes('high demand') ||
        errStr.includes('temporary') ||
        errStr.includes('quota') ||
        errStr.includes('UNAVAILABLE');

      if (isRetryable && i < retries - 1) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        const delayTime = (baseDelay * Math.pow(2, i)) + jitter;
        console.warn(`Gemini API Busy (503). Retrying in ${Math.round(delayTime)}ms... (Attempt ${i + 1}/${retries})`);
        await wait(delayTime);
        continue;
      }
      
      // If error is not retryable or max retries reached, throw immediately
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
    if (staff.rosterPeriods && staff.rosterPeriods.length > 0) {
      grossCredits = 0;
      staff.rosterPeriods.forEach(period => {
        const pStart = new Date(period.start);
        const pEnd = new Date(period.end);
        const overlapStart = progStart > pStart ? progStart : pStart;
        const overlapEnd = progEnd < pEnd ? progEnd : pEnd;
        if (overlapStart <= overlapEnd) {
           const diffTime = overlapEnd.getTime() - overlapStart.getTime();
           grossCredits += Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
      });
    } else if (!staff.workFromDate || !staff.workToDate) {
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
  if (!process.env.API_KEY) {
    throw new Error("Missing Gemini API Key. Please set VITE_API_KEY in your Vercel environment variables.");
  }
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
        if (s.rosterPeriods && s.rosterPeriods.length > 0) {
            const inPeriod = s.rosterPeriods.some(p => dStr >= p.start && dStr <= p.end);
            if (!inPeriod) return false;
        } else {
            if (!s.workFromDate || !s.workToDate) return false;
            if (dStr < s.workFromDate || dStr > s.workToDate) return false;
        }

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
        let outOfContract = false;
        if (s.type === 'Roster') {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                outOfContract = !s.rosterPeriods.some(p => dStr >= p.start && dStr <= p.end);
            } else if (s.workFromDate && s.workToDate) {
                outOfContract = dStr < s.workFromDate || dStr > s.workToDate;
            }
        }
        
        if (onLeave || outOfContract) {
            dailyAvail += "0";
        } else {
            dailyAvail += "1";
        }
    }

    return `ID: ${s.initials}, Role: ${s.type}, Rank: ${s.powerRate}%, Skills: [${skills}]${dualTag}, AllocatableShifts: ${credits}, Fatigue: ${fatigueLevel} (${lastDutyInfo}), AvailPattern: ${dailyAvail}`; 
  }).join('\n');

  // --- PHASE 2: MASTER ROSTER PLANNING (DAYS OFF) ---
  const daysOffPrompt = `
    ROLE: Global Strategic Roster Architect
    MISSION: Assign exactly 2 Days Off for each 'Local' staff member for the ${config.numDays}-day period.
    
    MANPOWER BLUEPRINT (DAILY TARGETS):
    ${blueprintBlock}
    
    STAFF CONTEXT:
    ${staffContext}
    
    INSTRUCTIONS:
    1. Analyze the Blueprint to see which days need the most people.
    2. For every Local staff member, pick exactly 2 days to be "OFF" (0 to ${config.numDays-1}).
    3. Pick days where 'LOCAL_WORK_TARGET' is low.
    4. Ensure Specialist Roles (SL, LC, RMP, OPS) are available every single day. Do not give all SLs the same day off.
    5. Roster staff do not get days off assigned here (they follow their contract/leave).
    
    OUTPUT FORMAT:
    STRICTLY RETURN ONLY A RAW JSON OBJECT. NO MARKDOWN.
    Format: { "Initials": [offDay1, offDay2], ... }
  `;

  const daysOffResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: daysOffPrompt,
      config: { temperature: 0.1, responseMimeType: 'application/json' }
  }));

  const plannedDaysOff: Record<string, number[]> = safeParseJson(daysOffResponse.text) || {};

  // SANITIZED INITIALIZATION
  const finalPrograms: DailyProgram[] = Array.from({length: config.numDays}).map((_, i) => {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      return { day: i, dateString: d.toISOString().split('T')[0], assignments: [] };
  });

  let validAssignmentsCount = 0;
  const staffLastEndTime = new Map<string, Date>();
  if (data.incomingDuties) {
    data.incomingDuties.forEach(d => {
      staffLastEndTime.set(d.staffId, new Date(`${d.date}T${d.shiftEndTime}`));
    });
  }
  const staffWorkload = new Map<string, number>();
  data.staff.forEach(s => staffWorkload.set(s.id, 0));

  // --- PHASE 3: HYBRID ENGINE - DETERMINISTIC SHIFT ALLOCATION ---
  // We now use pure TypeScript to assign shifts based on the AI's Days Off plan.
  // This guarantees 0 mistakes, perfect 12h rest compliance, and blazing speed.

  // Sort shifts chronologically across the entire period
  const sortedShifts = [...data.shifts].sort((a,b) => `${a.pickupDate}T${a.pickupTime}`.localeCompare(`${b.pickupDate}T${b.pickupTime}`));

  sortedShifts.forEach(shift => {
      const dayOffset = finalPrograms.findIndex(p => p.dateString === shift.pickupDate);
      if (dayOffset === -1) return;
      
      const program = finalPrograms[dayOffset];
      const dStr = shift.pickupDate;
      const shiftStart = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
      const shiftEnd = new Date(`${shift.endDate}T${shift.endTime}`);

      // Helper to find available staff
      const getAvailableStaff = (roleKey?: string) => {
          return data.staff.filter(s => {
              // 1. Check Leave
              const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
              if (onLeave) return false;

              // 2. Check Contract (Roster)
              if (s.type === 'Roster') {
                  if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                      const inContract = s.rosterPeriods.some(p => dStr >= p.start && dStr <= p.end);
                      if (!inContract) return false;
                  } else if (s.workFromDate && s.workToDate) {
                      if (dStr < s.workFromDate || dStr > s.workToDate) return false;
                  }
              }

              // 3. Check AI Planned Days Off (Local)
              const isPlannedOff = plannedDaysOff[s.initials.toUpperCase()]?.includes(dayOffset);
              if (isPlannedOff) return false;

              // 4. Check 1 Shift Per Day Rule
              const alreadyWorkingToday = program.assignments.some(a => a.staffId === s.id);
              if (alreadyWorkingToday) return false;

              // 5. Check 12h Rest Rule
              const lastEnd = staffLastEndTime.get(s.id);
              if (lastEnd) {
                  const restHours = (shiftStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
                  if (restHours < config.minRestHours) return false;
              }

              // 6. Check Specific Role Skill (if requested)
              if (roleKey) {
                  if (roleKey === 'LC' && !s.isLoadControl) return false;
                  if (roleKey === 'SL' && !s.isShiftLeader) return false;
                  if (roleKey === 'RMP' && !s.isRamp) return false;
                  if (roleKey === 'OPS' && !s.isOps) return false;
                  if (roleKey === 'LF' && !s.isLostFound) return false;
              }

              return true;
          }).sort((a, b) => {
              // Priority 1: Roster staff first (to save Local days)
              if (a.type === 'Roster' && b.type === 'Local') return -1;
              if (a.type === 'Local' && b.type === 'Roster') return 1;
              
              // Priority 2: Balance workload
              const workA = staffWorkload.get(a.id) || 0;
              const workB = staffWorkload.get(b.id) || 0;
              return workA - workB;
          });
      };

      // PASS 1: Fulfill specific role requirements
      if (shift.roleCounts) {
          Object.entries(shift.roleCounts).forEach(([role, count]) => {
              if (!count) return;
              let roleKey = role;
              if (role === 'Load Control') roleKey = 'LC';
              if (role === 'Shift Leader') roleKey = 'SL';
              if (role === 'Ramp') roleKey = 'RMP';
              if (role === 'Operations') roleKey = 'OPS';
              if (role === 'Lost and Found') roleKey = 'LF';

              for (let i = 0; i < count; i++) {
                  const available = getAvailableStaff(roleKey);
                  if (available.length > 0) {
                      const chosen = available[0];
                      program.assignments.push({
                          id: Math.random().toString(36).substr(2, 9),
                          staffId: chosen.id,
                          shiftId: shift.id,
                          role: roleKey,
                          flightId: ''
                      });
                      validAssignmentsCount++;
                      staffLastEndTime.set(chosen.id, shiftEnd);
                      staffWorkload.set(chosen.id, (staffWorkload.get(chosen.id) || 0) + 1);
                  }
              }
          });
      }

      // PASS 2: Fill remaining headcount up to maxStaff
      const currentAssigned = program.assignments.filter(a => a.shiftId === shift.id).length;
      const targetStaff = shift.maxStaff || shift.minStaff;
      
      for (let i = currentAssigned; i < targetStaff; i++) {
          const available = getAvailableStaff(); // No specific role required
          if (available.length > 0) {
              const chosen = available[0];
              program.assignments.push({
                  id: Math.random().toString(36).substr(2, 9),
                  staffId: chosen.id,
                  shiftId: shift.id,
                  role: 'AGT',
                  flightId: ''
              });
              validAssignmentsCount++;
              staffLastEndTime.set(chosen.id, shiftEnd);
              staffWorkload.set(chosen.id, (staffWorkload.get(chosen.id) || 0) + 1);
          } else {
              break; // No more available staff for this shift
          }
      }
  });

  const stationHealth = validAssignmentsCount > 0 ? 100 : 0;
  
  return {
    programs: finalPrograms,
    stationHealth,
    alerts: stationHealth === 0 ? [{ type: 'danger', message: 'CRITICAL: Engine failed to generate valid assignments. Check staff/shift inputs.' }] : [],
    isCompliant: stationHealth === 100
  };
};

export const extractDataFromContent = async (params: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  if (!process.env.API_KEY) {
    throw new Error("Missing Gemini API Key. Please set VITE_API_KEY in your Vercel environment variables.");
  }
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
      model: 'gemini-3.1-pro-preview', 
      contents: prompt, 
      config: { responseMimeType: 'application/json' } 
  }));
  return { programs: safeParseJson(response.text)?.programs || currentPrograms };
};
