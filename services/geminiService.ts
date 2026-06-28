import {
  DailyProgram,
  ProgramData,
  Staff,
  LeaveRequest,
  IncomingDuty,
  ShiftConfig,
  Skill,
  Flight,
} from "../types";
import { AVAILABLE_SKILLS } from "../constants";

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number;
  alerts?: { type: "danger" | "warning"; message: string }[];
}

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

// --- RETRY LOGIC ENGINE ---
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  baseDelay = 1500,
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Safely convert error to string
      let errStr = "";
      if (typeof error === "string") {
        errStr = error;
      } else if (error?.message) {
        errStr = error.message;
      } else {
        try {
          errStr = JSON.stringify(error);
        } catch (e) {
          errStr = String(error);
        }
      }

      // Detect specific 503 / Overload signals from Google
      const isRetryable =
        error?.status === 503 ||
        error?.code === 503 ||
        errStr.includes("503") ||
        errStr.includes("overloaded") ||
        errStr.includes("high demand") ||
        errStr.includes("temporary") ||
        errStr.includes("quota") ||
        errStr.includes("UNAVAILABLE");

      if (isRetryable && i < retries - 1) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        const delayTime = baseDelay * Math.pow(2, i) + jitter;
        console.warn(
          `Gemini API Busy (503). Retrying in ${Math.round(delayTime)}ms... (Attempt ${i + 1}/${retries})`,
        );
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

  let clean = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Direct JSON Parse Error, attempting recovery:", e);
  }

  // Fallback: Locate outermost brackets
  const firstOpenArray = clean.indexOf("[");
  const firstOpenObject = clean.indexOf("{");

  let startIdx = -1;
  let endIdx = -1;

  if (
    firstOpenArray !== -1 &&
    (firstOpenObject === -1 || firstOpenArray < firstOpenObject)
  ) {
    startIdx = firstOpenArray;
    endIdx = clean.lastIndexOf("]");
  } else if (firstOpenObject !== -1) {
    startIdx = firstOpenObject;
    endIdx = clean.lastIndexOf("}");
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    clean = clean.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error after slicing:", e);
    // Last ditch: try to append brackets if missing
    try {
      if (clean.trim().startsWith("[") && !clean.trim().endsWith("]"))
        return JSON.parse(clean + "]");
      if (clean.trim().startsWith("{") && !clean.trim().endsWith("}"))
        return JSON.parse(clean + "}");
    } catch (err2) {}
    return null;
  }
};

const aiFetch = async (model: string, contents: any, config?: any) => {
  const result = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, contents, config }),
  });
  if (!result.ok) {
    const errorData = await result.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch from AI service");
  }
  return await result.json();
};

export const calculateCredits = (
  staff: Staff,
  startDate: string,
  duration: number,
  leaveRequests: LeaveRequest[] = [],
) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter((l) => l.staffId === staff.id);
  staffLeaves.forEach((leave) => {
    if (
      [
        "Annual leave",
        "Sick leave",
        "Lieu leave",
        "Day off",
        "Roster leave",
      ].includes(leave.type)
    ) {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      const overlapStart = progStart > leaveStart ? progStart : leaveStart;
      const overlapEnd = progEnd < leaveEnd ? progEnd : leaveEnd;
      if (overlapStart <= overlapEnd) {
        leaveDeduction +=
          Math.floor(
            (overlapEnd.getTime() - overlapStart.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
      }
    }
  });

  if (staff.type === "Local") {
    // 5/2 Rule Logic adjusted for leaves
    const activeDays = Math.max(0, duration - leaveDeduction);
    let grossCredits = Math.round(activeDays * (5 / 7));
    // Fallback for short periods (e.g. 1-4 days) to allow utilization
    if (duration < 7 && duration > 0) {
      grossCredits = Math.ceil(activeDays * 0.8);
    }
    return grossCredits;
  } else {
    let grossCredits = 0;
    if (staff.rosterPeriods && staff.rosterPeriods.length > 0) {
      grossCredits = 0;
      staff.rosterPeriods.forEach((period) => {
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
      const overlapStart =
        progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      if (overlapStart <= overlapEnd) {
        const diffTime = overlapEnd.getTime() - overlapStart.getTime();
        grossCredits = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
        grossCredits = 0;
      }
    }
    return Math.max(0, grossCredits - leaveDeduction);
  }
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number; minRestHours: number; startDate: string },
): Promise<BuildResult> => {
  data.staff = data.staff.filter((s) => s.isActive !== false);
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split("T")[0];

  // --- PHASE 1: DEMAND-DRIVEN DAYS OFF PLANNING (SMOOTHING ALGORITHM) ---
  const plannedDaysOff: Record<string, number[]> = {};
  const localStaff = data.staff.filter((s) => s.type === "Local");

  // 1. Calculate Daily Local Demand & Surplus
  const dailyLocalDemand = new Array(config.numDays).fill(0);
  const dailySurplus = new Array(config.numDays).fill(0);

  for (let dayOffset = 0; dayOffset < config.numDays; dayOffset++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + dayOffset);
    const dStr = d.toISOString().split("T")[0];

    let targetHeadcount = 0;
    data.shifts
      .filter((s) => s.pickupDate === dStr)
      .forEach((s) => {
        targetHeadcount += s.maxStaff || s.minStaff;
      });

    let rosterCount = 0;
    data.staff
      .filter((s) => s.type === "Roster")
      .forEach((s) => {
        const onLeave = data.leaveRequests?.some(
          (l) => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr,
        );
        let inContract = false;
        if (s.rosterPeriods && s.rosterPeriods.length > 0) {
          inContract = s.rosterPeriods.some(
            (p) => dStr >= p.start && dStr <= p.end,
          );
        } else if (s.workFromDate && s.workToDate) {
          inContract = dStr >= s.workFromDate && dStr <= s.workToDate;
        }
        if (!onLeave && inContract) rosterCount++;
      });

    dailyLocalDemand[dayOffset] = Math.max(0, targetHeadcount - rosterCount);
    dailySurplus[dayOffset] = localStaff.length - dailyLocalDemand[dayOffset];
  }

  // 2. Calculate Target Off Quotas
  const requiredOffPerStaff = new Map<string, number>();
  let totalDaysOffNeeded = 0;
  
  localStaff.forEach((s) => {
    let leaveDeduction = 0;
    const staffLeaves = data.leaveRequests?.filter((l) => l.staffId === s.id) || [];
    staffLeaves.forEach((leave) => {
      if (["Annual leave", "Sick leave", "Lieu leave", "Day off", "Roster leave"].includes(leave.type)) {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const overlapStart = programStart > leaveStart ? programStart : leaveStart;
        const overlapEnd = programEnd < leaveEnd ? programEnd : leaveEnd;
        if (overlapStart <= overlapEnd) {
          leaveDeduction += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
      }
    });
    
    const activeDays = Math.max(0, config.numDays - leaveDeduction);
    const maxWorking = Math.round(activeDays * (5 / 7));
    const requiredOff = Math.max(0, activeDays - maxWorking);
    
    requiredOffPerStaff.set(s.id, requiredOff);
    totalDaysOffNeeded += requiredOff;
  });

  const dailyOffQuota = new Array(config.numDays).fill(0);

  // Distribute days off to the days with the highest surplus first
  for (let i = 0; i < totalDaysOffNeeded; i++) {
    let maxSurplusIdx = 0;
    let maxSurplusVal = -Infinity;
    for (let d = 0; d < config.numDays; d++) {
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
    LF: new Array(config.numDays).fill(0),
    LBR: new Array(config.numDays).fill(0),
  };

  // Sort staff: specialists first, so they get distributed evenly
  const sortedLocals = [...localStaff].sort((a, b) => {
    const aSkills =
      (a.isLoadControl ? 1 : 0) + (a.isShiftLeader ? 1 : 0) + (a.isOps ? 1 : 0);
    const bSkills =
      (b.isLoadControl ? 1 : 0) + (b.isShiftLeader ? 1 : 0) + (b.isOps ? 1 : 0);
    return bSkills - aSkills;
  });

  sortedLocals.forEach((s) => {
    const init = s.initials.toUpperCase();
    plannedDaysOff[init] = [];
    const requiredOff = requiredOffPerStaff.get(s.id) || 0;

    for (let i = 0; i < requiredOff; i++) {
      let bestDay = -1;
      let bestScore = -Infinity;

      for (let d = 0; d < config.numDays; d++) {
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
        if (s.isLabour) skillOffCountsPerDay.LBR[bestDay]++;
      }
    }
  });

  // SANITIZED INITIALIZATION
  const finalPrograms: DailyProgram[] = Array.from({
    length: config.numDays,
  }).map((_, i) => {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    return {
      day: i,
      dateString: d.toISOString().split("T")[0],
      assignments: [],
    };
  });

  let validAssignmentsCount = 0;
  const staffLastEndTime = new Map<string, Date>();
  if (data.incomingDuties) {
    const prevDay = new Date(config.startDate);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = prevDay.toISOString().split("T")[0];

    data.incomingDuties.forEach((d) => {
      // Only consider incoming duties that actually match the day before the start date
      if (d.date && d.date !== prevDayStr) {
        return;
      }
      staffLastEndTime.set(
        d.staffId,
        new Date(`${d.date || prevDayStr}T${d.shiftEndTime}`),
      );
    });
  }
  const staffWorkload = new Map<string, number>();
  data.staff.forEach((s) => staffWorkload.set(s.id, 0));

  // --- PHASE 3: HYBRID ENGINE - DETERMINISTIC SHIFT ALLOCATION ---
  // We now use pure TypeScript to assign shifts based on the AI's Days Off plan.
  // This guarantees 0 mistakes, perfect 12h rest compliance, and blazing speed.

  for (let dayOffset = 0; dayOffset < config.numDays; dayOffset++) {
    const program = finalPrograms[dayOffset];
    const dStr = program.dateString || "";
    const dailyShifts = data.shifts
      .filter((s) => s.pickupDate === dStr)
      .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

    // Helper to find available staff for a specific shift
    const getAvailableStaff = (shift: any, roleKey?: string) => {
      const shiftStart = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
      return data.staff
        .filter((s) => {
          // 1. Check Leave
          const onLeave = data.leaveRequests?.some(
            (l) =>
              l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr,
          );
          if (onLeave) return false;

          // 2. Check Contract (Roster)
          if (s.type === "Roster") {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              const inContract = s.rosterPeriods.some(
                (p) => dStr >= p.start && dStr <= p.end,
              );
              if (!inContract) return false;
            } else if (s.workFromDate && s.workToDate) {
              if (dStr < s.workFromDate || dStr > s.workToDate) return false;
            }
          }

          // 3. Check AI Planned Days Off (Local)
          const isPlannedOff =
            plannedDaysOff[s.initials.toUpperCase()]?.includes(dayOffset);
          if (isPlannedOff) return false;

          // 4. Check 1 Shift Per Day Rule
          const alreadyWorkingToday = program.assignments.some(
            (a) => a.staffId === s.id,
          );
          if (alreadyWorkingToday) return false;

          // 5. Check 12h Rest Rule
          const lastEnd = staffLastEndTime.get(s.id);
          if (lastEnd) {
            const restHours =
              (shiftStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
            if (restHours < config.minRestHours) return false;
          }

          // 6. Check Specific Role Skill (if requested)
          if (roleKey) {
            const isLCKey = roleKey === "LC" || roleKey === "Load Control";
            const isSLKey = roleKey === "SL" || roleKey === "Shift Leader";
            const isRMPKey = roleKey === "RMP" || roleKey === "Ramp";
            const isOPSKey = roleKey === "OPS" || roleKey === "Operations";
            const isLFKey = roleKey === "LF" || roleKey === "Lost and Found";
            const isLBRKey = roleKey === "LBR" || roleKey === "Labour";
            const isSECKey = roleKey === "SEC" || roleKey === "Security";
            const isDRVKey = roleKey === "DRV" || roleKey === "Driver";
            const isACCKey = roleKey === "ACC" || roleKey === "Accountant";

            if (isLCKey && !(s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ")) return false;
            if (isSLKey && !(s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ")) return false;
            if (isRMPKey && !s.isRamp) return false;
            if (isOPSKey && !s.isOps) return false;
            if (isLFKey && !s.isLostFound) return false;
            if (isLBRKey && !s.isLabour) return false;
            if (isSECKey && !s.isSecurity) return false;
            if (isDRVKey && !s.isDriver) return false;
            if (isACCKey && !s.isAccountant) return false;

            // Highly restricted roles shouldn't fulfill general or different skill slots
            if (!isLBRKey && s.isLabour) return false;
            if (!isSECKey && s.isSecurity) return false;
            if (!isDRVKey && s.isDriver) return false;
            if (!isACCKey && s.isAccountant) return false;
          } else {
            // General slots - strictly exclude Labour, Security, Driver, and Accountant
            if (s.isLabour || s.isDriver || s.isSecurity || s.isAccountant) return false;
          }

          return true;
        })
        .sort((a, b) => {
          // Priority 1: Roster staff first (to save Local days)
          if (a.type === "Roster" && b.type === "Local") return -1;
          if (a.type === "Local" && b.type === "Roster") return 1;

          // Priority 2: Balance workload
          const workA = staffWorkload.get(a.id) || 0;
          const workB = staffWorkload.get(b.id) || 0;
          return workA - workB;
        });
    };

    // Helper to calculate exact shift end date handle cross day
    const getExactShiftEnd = (shift: any) => {
      let [ph, pm] = shift.pickupTime.split(":").map(Number);
      let [sh, sm] = shift.endTime.split(":").map(Number);
      const endDt = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
      endDt.setHours(sh, sm, 0, 0);
      if (sh < ph) endDt.setDate(endDt.getDate() + 1);
      return endDt;
    };

    // PASS 0: Process Manual Assignments
    if (data.manualAssignments && data.manualAssignments.length > 0) {
      data.manualAssignments.forEach((ma) => {
        const shift = dailyShifts.find((s) => s.id === ma.shiftId);
        if (shift) {
          const shiftEnd = getExactShiftEnd(shift);
          const st = data.staff.find((s) => s.id === ma.staffId);
          if (st) {
            // Only add if not already added to this shift
            const alreadyAssigned = program.assignments.some(
              (a) => a.staffId === ma.staffId && a.shiftId === ma.shiftId,
            );
            if (!alreadyAssigned) {
              program.assignments.push({
                id: crypto.randomUUID(),
                staffId: ma.staffId,
                shiftId: ma.shiftId,
                role: ma.roles.length > 0 ? ma.roles.join("+") : "AGT",
                flightId: "",
              });
              validAssignmentsCount++;
              staffLastEndTime.set(ma.staffId, shiftEnd);
              staffWorkload.set(
                ma.staffId,
                (staffWorkload.get(ma.staffId) || 0) + 1,
              );
            }
          }
        }
      });
    }

    // PASS 1: Fulfill specific role requirements for all shifts today
    dailyShifts.forEach((shift) => {
      const shiftEnd = getExactShiftEnd(shift);
      if (shift.roleCounts) {
        Object.entries(shift.roleCounts).forEach(([role, count]) => {
          if (!count) return;
          let roleKey = role;
          if (role === "Load Control") roleKey = "LC";
          if (role === "Shift Leader") roleKey = "SL";
          if (role === "Ramp") roleKey = "RMP";
          if (role === "Operations") roleKey = "OPS";
          if (role === "Lost and Found") roleKey = "LF";
          if (role === "Labour") roleKey = "LBR";
          if (role === "Security") roleKey = "SEC";
          if (role === "Driver") roleKey = "DRV";
          if (role === "Accountant") roleKey = "ACC";

          for (let i = 0; i < count; i++) {
            // Check if someone ALREADY on this shift can fulfill this role
            const shiftAssignments = program.assignments.filter(
              (a) => a.shiftId === shift.id,
            );
            const fulfilledCount = shiftAssignments.filter((a) => {
              const st = data.staff.find((s) => s.id === a.staffId);
              if (!st) return false;
              if (roleKey === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
              if (roleKey === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
              if (roleKey === "RMP" && !st.isRamp) return false;
              if (roleKey === "OPS" && !st.isOps) return false;
              if (roleKey === "LF" && !st.isLostFound) return false;
              if (roleKey === "LBR" && !st.isLabour) return false;
              if (roleKey === "SEC" && !st.isSecurity) return false;
              if (roleKey === "DRV" && !st.isDriver) return false;
              if (roleKey === "ACC" && !st.isAccountant) return false;

              if (
                a.role === roleKey ||
                a.role === role ||
                a.role.includes(roleKey)
              )
                return true;
                
              if (roleKey === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
              if (roleKey === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
              if (roleKey === "RMP" && st.isRamp) return true;
              if (roleKey === "OPS" && st.isOps) return true;
              if (roleKey === "LF" && st.isLostFound) return true;
              if (roleKey === "LBR" && st.isLabour) return true;
              if (roleKey === "SEC" && st.isSecurity) return true;
              if (roleKey === "DRV" && st.isDriver) return true;
              if (roleKey === "ACC" && st.isAccountant) return true;
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
                id: crypto.randomUUID(),
                staffId: chosen.id,
                shiftId: shift.id,
                role: roleKey,
                flightId: "",
              });
              validAssignmentsCount++;
              staffLastEndTime.set(chosen.id, shiftEnd);
              staffWorkload.set(
                chosen.id,
                (staffWorkload.get(chosen.id) || 0) + 1,
              );
            }
          }
        });
      }
    });

    // PASS 2: Fill all shifts up to minStaff (Round Robin)
    let addedInPass2 = true;
    while (addedInPass2) {
      addedInPass2 = false;
      dailyShifts.forEach((shift) => {
        const shiftEnd = getExactShiftEnd(shift);
        const currentAssigned = program.assignments.filter(
          (a) => a.shiftId === shift.id,
        ).length;
        if (currentAssigned < shift.minStaff) {
          const available = getAvailableStaff(shift);
          if (available.length > 0) {
            const chosen = available[0];
            program.assignments.push({
              id: crypto.randomUUID(),
              staffId: chosen.id,
              shiftId: shift.id,
              role: "AGT",
              flightId: "",
            });
            validAssignmentsCount++;
            staffLastEndTime.set(chosen.id, shiftEnd);
            staffWorkload.set(
              chosen.id,
              (staffWorkload.get(chosen.id) || 0) + 1,
            );
            addedInPass2 = true;
          }
        }
      });
    }

    // PASS 3: Fill all shifts up to maxStaff (Round Robin)
    let addedInPass3 = true;
    while (addedInPass3) {
      addedInPass3 = false;
      dailyShifts.forEach((shift) => {
        const shiftEnd = getExactShiftEnd(shift);
        const currentAssigned = program.assignments.filter(
          (a) => a.shiftId === shift.id,
        ).length;
        const targetStaff = shift.maxStaff || shift.minStaff;
        if (currentAssigned < targetStaff) {
          const available = getAvailableStaff(shift);
          if (available.length > 0) {
            const chosen = available[0];
            program.assignments.push({
              id: crypto.randomUUID(),
              staffId: chosen.id,
              shiftId: shift.id,
              role: "AGT",
              flightId: "",
            });
            validAssignmentsCount++;
            staffLastEndTime.set(chosen.id, shiftEnd);
            staffWorkload.set(
              chosen.id,
              (staffWorkload.get(chosen.id) || 0) + 1,
            );
            addedInPass3 = true;
          }
        }
      });
    }
  }

  // --- IMPROVEMENT 2: TRUE STATION HEALTH SCORE ---
  let totalRequiredStaff = 0;
  data.shifts.forEach((shift) => {
    const dayOffset = finalPrograms.findIndex(
      (p) => p.dateString === shift.pickupDate,
    );
    if (dayOffset !== -1) {
      totalRequiredStaff += shift.maxStaff || shift.minStaff;
    }
  });

  const stationHealth =
    totalRequiredStaff > 0
      ? Math.round((validAssignmentsCount / totalRequiredStaff) * 100)
      : 100;
  const boundedHealth = Math.min(100, Math.max(0, stationHealth));

  return {
    programs: finalPrograms,
    stationHealth: boundedHealth,
    alerts:
      boundedHealth < 100
        ? [
            {
              type: "warning",
              message: `Station Health is ${boundedHealth}%. Some shifts are understaffed.`,
            },
          ]
        : [],
    isCompliant: boundedHealth === 100,
  };
};

export const compareFlightsWithAI = async (
  media: ExtractionMedia[],
  currentFlights: Flight[],
  dateRangeStr: string
): Promise<{ added: Flight[], updated: Flight[], deletedIds: string[] }> => {
  const flightsStr = JSON.stringify(currentFlights, null, 2);
  
  const prompt = `You are an aviation scheduling assistant.
The user has uploaded a flight schedule (in the attached media) for the period: ${dateRangeStr}.
I am providing you the CURRENT flights we have in our database for this period:
${flightsStr}

YOUR TASK:
1. Extract ALL flights from the uploaded schedule image/file.
2. Compare the extracted flights with the CURRENT flights.
3. Identify:
   - "added": Flights in the new schedule that are NOT in the CURRENT list.
   - "updated": Flights that exist in BOTH but have changes (e.g. STA/STD time changes).
   - "deletedIds": IDs of flights that are in the CURRENT list but are MISSING from the new schedule.

RULES:
- Read tabular data carefully. The headers in the image are likely: 'Arr Flight', 'Arr Date', 'STA', 'Arr From', 'Station', 'Dep To', 'Dep Flight', 'Dep Date', 'STD'.
- Extract 'flightNumber': If both 'Arr Flight' and 'Dep Flight' exist (e.g. 'SM 0324' and 'AVL0405'), combine them as 'SM 0324/AVL0405'. If only one exists, use that.
- Extract 'date': Use 'Arr Date' or 'Dep Date'. Format strictly as 'YYYY-MM-DD'.
- Extract 'from': Use 'Arr From'. If empty, use a placeholder or guess.
- Extract 'to': Use 'Dep To'.
- Extract 'sta' (arrival time) from 'STA' column.
- Extract 'std' (departure time) from 'STD' column.
- Set 'type' to "Turnaround" if both STA and STD exist. Otherwise "Arrival" or "Departure".
- Ensure the types are correct. "added" and "updated" items MUST exactly match this JSON schema:
  {
    "flightNumber": "SM 0324/AVL0405",
    "from": "AJF",
    "to": "KWI",
    "sta": "01:10",
    "std": "03:00",
    "date": "2026-07-04",
    "type": "Turnaround"
  }
- Omit 'id', the system will generate it automatically.
- Compare these extracted flights against the CURRENT flights using "flightNumber" and "date" as primary matching keys.

Provide the result purely as a JSON object containing { "added": [], "updated": [], "deletedIds": [] }. Return ONLY JSON.`;

  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) {
    media.forEach((m) =>
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } })
    );
  }

  const response = await withRetry<{ text: string }>(() =>
    aiFetch(
      "gemini-2.5-flash",
      { parts },
      { responseMimeType: "application/json" }
    )
  );

  const text = response.text || "";
  const result = safeParseJson(text);
  if (!result || typeof result !== "object") {
    throw new Error("Failed to parse Gemini comparison response.");
  }

  return {
    added: Array.isArray(result.added) ? result.added.map((f: any) => ({ ...f, id: f.id || crypto.randomUUID() })) : [],
    updated: Array.isArray(result.updated) ? result.updated : [],
    deletedIds: Array.isArray(result.deletedIds) ? result.deletedIds : []
  };
};

export const extractDataFromContent = async (params: {
  textData?: string;
  media?: ExtractionMedia[];
  startDate?: string;
  targetType: string;
}): Promise<any> => {
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA:\n${params.textData}` });
  if (params.media)
    params.media.forEach((m) =>
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }),
    );
    const prompt = `Extract ${params.targetType} from the provided document or text. 
Target Start Date: ${params.startDate || "Current"}. 
If extracting flights, read tabular data carefully. You may encounter columns like "Flight Date", "Arrival", "Departure", "From", "To", "STA", "STD", "Status".
CRITICAL RULES FOR FLIGHTS:
1. Combine 'Arr Flight' and 'Dep Flight' (or 'Arrival' and 'Departure') into a single "flightNumber" if it is a turnaround (e.g., "SM 0324/0405" or "XY 279/280"). If only one flight number exists, use it.
2. Extract the date strictly as "YYYY-MM-DD". If the date includes a time (e.g. "2026-07-10T00:00:00"), extract only the date part. If it's "24APR2026", convert it to "2026-04-24".
3. Extract origin ('Arr From' or 'From') as "from" and destination ('Dep To' or 'To') as "to".
4. Extract arrival time ('STA') as "sta" and departure time ('STD') as "std". Format as "HH:mm" (remove trailing seconds if present, e.g. "07:55:00" -> "07:55").
5. For 'type', if both STA and STD are present, return 'Turnaround'. Otherwise, guess based on from/to (e.g. 'Arrival', 'Departure').
If a time is clearly missing or shows '***', do not map it or leave it empty.

Return valid JSON ONLY in this format:
{
  "flights": [
    { "flightNumber": "string", "from": "string", "to": "string", "sta": "HH:MM", "std": "HH:MM", "date": "YYYY-MM-DD", "type": "string" }
  ],
  "staff": [...],
  "shifts": [...]
}
Do not wrap in markdown or any other text.`;
  parts.unshift({ text: prompt });

  // Wrap extraction call with retry
  const response = await withRetry<{ text: string }>(() =>
    aiFetch(
      "gemini-2.5-flash",
      { parts },
      { responseMimeType: "application/json" }
    ),
  );
  
  const parsed = safeParseJson(response.text);
  if (parsed && parsed.flights) {
    parsed.flights = parsed.flights.map((f: any) => {
      let dateField = f.date;
      if (dateField && !/^\d{4}-\d{2}-\d{2}$/.test(dateField)) {
        const match = dateField.toUpperCase().match(/(\d{1,2})([A-Z]{3})(\d{2,4})/);
        if (match) {
          const months: Record<string, string> = {
            JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
            JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
          };
          let [_, day, monthStr, yearStr] = match;
          day = day.padStart(2, '0');
          const month = months[monthStr] || '01';
          let year = yearStr;
          if (year.length === 2) year = `20${year}`;
          dateField = `${year}-${month}-${day}`;
        } else {
          const pd = new Date(dateField);
          if (!isNaN(pd.getTime())) {
             dateField = pd.toISOString().split("T")[0];
          }
        }
      }
      return { ...f, date: dateField };
    });
  }
  return parsed;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media: ExtractionMedia[] = [],
): Promise<any> => {
  const prompt = `TASK: Modify roster. Instruction: ${instruction}. Current: ${JSON.stringify(data.programs)}. Return { "programs": [], "explanation": "" }`;
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0)
    media.forEach((m) =>
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }),
    );

  // Wrap modification call with retry
  const response = await withRetry<{ text: string }>(() =>
    aiFetch(
      "gemini-3.1-pro-preview",
      { parts },
      { responseMimeType: "application/json" }
    ),
  );
  const result = safeParseJson(response.text);
  if (result && Array.isArray(result.programs)) {
    const totalAssignments = result.programs.reduce((acc: number, p: any) => acc + (p.assignments?.length || 0), 0);
    if (totalAssignments > 0) {
      const newProgMap = new Map(result.programs.map((p: any) => [p.dateString, p]));
      result.programs = data.programs.map(oldP => newProgMap.get(oldP.dateString) || oldP);
    } else {
      result.programs = data.programs; // Reject empty wipe
    }
  }
  return result;
};

export const repairProgramWithAI = async (
  currentPrograms: DailyProgram[],
  auditReport: string,
  data: ProgramData,
  constraints: { minRestHours: number },
): Promise<{ programs: DailyProgram[] }> => {
  const prompt = `FIX ROSTER. Violations: ${auditReport}. Rules: 5/2 local rule, 12h rest, roster contract dates. Return: { "programs": [] }`;

  // Wrap repair call with retry
  const response = await withRetry<{ text: string }>(() =>
    aiFetch(
      "gemini-3.1-pro-preview",
      { parts: [{ text: prompt }] },
      { responseMimeType: "application/json" }
    ),
  );
  
  const result = safeParseJson(response.text);
  let newPrograms = result?.programs || currentPrograms;
  if (Array.isArray(newPrograms)) {
    const totalAssignments = newPrograms.reduce((acc: number, p: any) => acc + (p.assignments?.length || 0), 0);
    if (totalAssignments > 0) {
      const newProgMap = new Map(newPrograms.map((p: any) => [p.dateString, p]));
      newPrograms = currentPrograms.map(oldP => newProgMap.get(oldP.dateString) || oldP);
    } else {
      newPrograms = currentPrograms; // Reject empty wipe
    }
  }
  
  return {
    programs: newPrograms,
  };
};
