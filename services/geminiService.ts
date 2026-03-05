
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
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  // --- PHASE 1: DEMAND-DRIVEN DAYS OFF PLANNING (SMOOTHING ALGORITHM) ---
  const plannedDaysOff: Record<string, number[]> = {};
  const localStaff = data.staff.filter(s => s.type === 'Local');
  
  // 1. Calculate Daily Local Demand & Surplus
  const dailyLocalDemand = new Array(config.numDays).fill(0);
  const dailySurplus = new Array(config.numDays).fill(0);
  
  for (let dayOffset = 0; dayOffset < config.numDays; dayOffset++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + dayOffset);
      const dStr = d.toISOString().split('T')[0];
      
      let targetHeadcount = 0;
      data.shifts.filter(s => s.pickupDate === dStr).forEach(s => {
          targetHeadcount += (s.maxStaff || s.minStaff);
      });
      
      let rosterCount = 0;
      data.staff.filter(s => s.type === 'Roster').forEach(s => {
          const onLeave = data.leaveRequests?.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
          let inContract = false;
          if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              inContract = s.rosterPeriods.some(p => dStr >= p.start && dStr <= p.end);
          } else if (s.workFromDate && s.workToDate) {
              inContract = dStr >= s.workFromDate && dStr <= s.workToDate;
          }
          if (!onLeave && inContract) rosterCount++;
      });
      
      dailyLocalDemand[dayOffset] = Math.max(0, targetHeadcount - rosterCount);
      dailySurplus[dayOffset] = localStaff.length - dailyLocalDemand[dayOffset];
  }
  
  // 2. Calculate Target Off Quotas
  let totalDaysOffNeeded = localStaff.length * 2;
  const dailyOffQuota = new Array(config.numDays).fill(0);
  
  // Distribute days off to the days with the highest surplus first
  for(let i=0; i<totalDaysOffNeeded; i++) {
      let maxSurplusIdx = 0;
      let maxSurplusVal = -Infinity;
      for(let d=0; d<config.numDays; d++) {
          const effectiveSurplus = dailySurplus[d] - dailyOffQuota[d];
          if (effectiveSurplus > maxSurplusVal) {
              maxSurplusVal = effectiveSurplus;
              maxSurplusIdx = d;
          }
      }
      dailyOffQuota[maxSurplusIdx]++;
  }
  
  // 3. Assign Days Off to Local Staff (Balancing Skills)
  const offCountsPerDay = new Array(config.numDays).fill(0);
  const skillOffCountsPerDay: Record<string, number[]> = {
      LC: new Array(config.numDays).fill(0),
      SL: new Array(config.numDays).fill(0),
      RMP: new Array(config.numDays).fill(0),
      OPS: new Array(config.numDays).fill(0),
      LF: new Array(config.numDays).fill(0)
  };
  
  // Sort staff: specialists first, so they get distributed evenly
  const sortedLocals = [...localStaff].sort((a, b) => {
      const aSkills = (a.isLoadControl?1:0) + (a.isShiftLeader?1:0) + (a.isOps?1:0);
      const bSkills = (b.isLoadControl?1:0) + (b.isShiftLeader?1:0) + (b.isOps?1:0);
      return bSkills - aSkills;
  });
  
  sortedLocals.forEach(s => {
      const init = s.initials.toUpperCase();
      plannedDaysOff[init] = [];
      
      for(let i=0; i<2; i++) {
          let bestDay = -1;
          let bestScore = -Infinity;
          
          for(let d=0; d<config.numDays; d++) {
              if (plannedDaysOff[init].includes(d)) continue;
              
              let score = dailyOffQuota[d] - offCountsPerDay[d];
              
              // Penalize if this day already has too many of this staff's skills off
              if (s.isLoadControl) score -= skillOffCountsPerDay.LC[d] * 2;
              if (s.isShiftLeader) score -= skillOffCountsPerDay.SL[d] * 2;
              if (s.isOps) score -= skillOffCountsPerDay.OPS[d] * 2;
              
              if (score > bestScore) {
                  bestScore = score;
                  bestDay = d;
              }
          }
          
          if (bestDay !== -1) {
              plannedDaysOff[init].push(bestDay);
              offCountsPerDay[bestDay]++;
              if (s.isLoadControl) skillOffCountsPerDay.LC[bestDay]++;
              if (s.isShiftLeader) skillOffCountsPerDay.SL[bestDay]++;
              if (s.isRamp) skillOffCountsPerDay.RMP[bestDay]++;
              if (s.isOps) skillOffCountsPerDay.OPS[bestDay]++;
              if (s.isLostFound) skillOffCountsPerDay.LF[bestDay]++;
          }
      }
  });

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

  for (let dayOffset = 0; dayOffset < config.numDays; dayOffset++) {
      const program = finalPrograms[dayOffset];
      const dStr = program.dateString;
      const dailyShifts = data.shifts.filter(s => s.pickupDate === dStr).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));

      // Helper to find available staff for a specific shift
      const getAvailableStaff = (shift: any, roleKey?: string) => {
          const shiftStart = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
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

      // PASS 1: Fulfill specific role requirements for all shifts today
      dailyShifts.forEach(shift => {
          const shiftEnd = new Date(`${shift.endDate}T${shift.endTime}`);
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
                      // Check if someone ALREADY on this shift can fulfill this role
                      const shiftAssignments = program.assignments.filter(a => a.shiftId === shift.id);
                      const fulfilledCount = shiftAssignments.filter(a => {
                          const st = data.staff.find(s => s.id === a.staffId);
                          if (!st) return false;
                          if (a.role === roleKey || a.role === role) return true;
                          if (roleKey === 'LC' && st.isLoadControl) return true;
                          if (roleKey === 'SL' && st.isShiftLeader) return true;
                          if (roleKey === 'RMP' && st.isRamp) return true;
                          if (roleKey === 'OPS' && st.isOps) return true;
                          if (roleKey === 'LF' && st.isLostFound) return true;
                          return false;
                      }).length;

                      // If we already have enough people with this skill on the shift, skip assigning a new one
                      if (fulfilledCount > i) {
                          continue;
                      }

                      const available = getAvailableStaff(shift, roleKey);
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
      });

      // PASS 2: Fill all shifts up to minStaff (Round Robin)
      let addedInPass2 = true;
      while (addedInPass2) {
          addedInPass2 = false;
          dailyShifts.forEach(shift => {
              const shiftEnd = new Date(`${shift.endDate}T${shift.endTime}`);
              const currentAssigned = program.assignments.filter(a => a.shiftId === shift.id).length;
              if (currentAssigned < shift.minStaff) {
                  const available = getAvailableStaff(shift);
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
                      addedInPass2 = true;
                  }
              }
          });
      }

      // PASS 3: Fill all shifts up to maxStaff (Round Robin)
      let addedInPass3 = true;
      while (addedInPass3) {
          addedInPass3 = false;
          dailyShifts.forEach(shift => {
              const shiftEnd = new Date(`${shift.endDate}T${shift.endTime}`);
              const currentAssigned = program.assignments.filter(a => a.shiftId === shift.id).length;
              const targetStaff = shift.maxStaff || shift.minStaff;
              if (currentAssigned < targetStaff) {
                  const available = getAvailableStaff(shift);
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
                      addedInPass3 = true;
                  }
              }
          });
      }
  }

  // --- IMPROVEMENT 2: TRUE STATION HEALTH SCORE ---
  let totalRequiredStaff = 0;
  data.shifts.forEach(shift => {
      const dayOffset = finalPrograms.findIndex(p => p.dateString === shift.pickupDate);
      if (dayOffset !== -1) {
          totalRequiredStaff += (shift.maxStaff || shift.minStaff);
      }
  });

  const stationHealth = totalRequiredStaff > 0 ? Math.round((validAssignmentsCount / totalRequiredStaff) * 100) : 100;
  const boundedHealth = Math.min(100, Math.max(0, stationHealth));
  
  return {
    programs: finalPrograms,
    stationHealth: boundedHealth,
    alerts: boundedHealth < 100 ? [{ type: 'warning', message: `Station Health is ${boundedHealth}%. Some shifts are understaffed.` }] : [],
    isCompliant: boundedHealth === 100
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
