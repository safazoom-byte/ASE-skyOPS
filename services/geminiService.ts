import { GoogleGenAI, Type } from "@google/genai";
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
  
  // 1. Clean Markdown wrappers commonly returned by LLMs
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    // 2. If direct parse fails, try to find the outermost JSON object or array
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
      } catch (e2) {
        // Continue to fallback
      }
    }
    
    console.error("JSON Parse Failed:", text);
    return null;
  }
};

// Simplified Schema for Robustness
const ROSTER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    programs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.INTEGER },
          dateString: { type: Type.STRING },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                staffId: { type: Type.STRING },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING },
                shiftId: { type: Type.STRING }
              }
            }
          }
        }
      }
    },
    stationHealth: { type: Type.NUMBER },
    alerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          message: { type: Type.STRING }
        }
      }
    }
  },
  required: ["programs", "stationHealth"]
};

// --- HELPER: Calculate Overlap Days ---
const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date) => {
  const overlapStart = start1 > start2 ? start1 : start2;
  const overlapEnd = end1 < end2 ? end1 : end2;
  
  if (overlapStart > overlapEnd) return 0;
  
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// --- HELPER: Calculate Available Credits (Considers Leave & Duration) ---
const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;

  if (staff.type === 'Local') {
    // Scale credits based on duration (approx 5 days work per 7 days = ~71% utilization)
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    // For Roster, calculate contract overlap days
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration; // Assume full availability if data missing
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      grossCredits = getOverlapDays(progStart, progEnd, contractStart, contractEnd);
    }
  }

  // Deduct Leave Days
  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  
  staffLeaves.forEach(leave => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    const overlap = getOverlapDays(progStart, progEnd, leaveStart, leaveEnd);
    leaveDeduction += overlap;
  });

  return Math.max(0, grossCredits - leaveDeduction);
};

// --- HELPER: Generate Forbidden Transitions (Rest Violations) ---
const generateRestConstraints = (shifts: ShiftConfig[], minRestHours: number) => {
  const constraints: string[] = [];
  shifts.forEach(shiftA => {
    shifts.forEach(shiftB => {
      const [endH, endM] = shiftA.endTime.split(':').map(Number);
      const [startH, startM] = shiftA.pickupTime.split(':').map(Number);
      const [nextStartH, nextStartM] = shiftB.pickupTime.split(':').map(Number);
      
      const shiftAEndVal = endH + endM/60;
      const shiftAStartVal = startH + startM/60;
      const shiftBStartVal = nextStartH + nextStartM/60;
      
      const endsOnNextDay = shiftAEndVal < shiftAStartVal;
      
      let gap = 0;
      if (endsOnNextDay) {
         gap = shiftBStartVal - shiftAEndVal;
      } else {
         gap = (24 - shiftAEndVal) + shiftBStartVal;
      }

      if (gap < minRestHours) {
        constraints.push(`- RULE: If staff works Shift '${shiftA.pickupTime}-${shiftA.endTime}', they are BANNED from next day's '${shiftB.pickupTime}' shift (Gap: ${gap.toFixed(1)}h).`);
      }
    });
  });
  return constraints;
};

// --- HELPER: Generate Contract Info ---
const generateContractContext = (staffList: Staff[], startDate: string, duration: number) => {
  const context: string[] = [];
  const programDates: string[] = [];
  const start = new Date(startDate);
  
  for(let i=0; i<duration; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    programDates.push(d.toISOString().split('T')[0]);
  }

  staffList.filter(s => s.type === 'Roster').forEach(s => {
    if (!s.workFromDate || !s.workToDate) return; 
    const invalidDates = programDates.filter(date => date < s.workFromDate! || date > s.workToDate!);
    if (invalidDates.length > 0) {
      context.push(`- ${s.initials} (${s.id}) is Out-Of-Contract (NO WORK PERMITTED) on: [${invalidDates.join(', ')}].`);
    }
  });
  return context;
};

// --- HELPER: Generate Leave Blackouts ---
const generateLeaveBlackouts = (leaveRequests: LeaveRequest[], staffList: Staff[], startDate: string, duration: number) => {
  const blackouts: string[] = [];
  const start = new Date(startDate);
  const end = new Date(startDate);
  end.setDate(start.getDate() + duration - 1);

  leaveRequests.forEach(leave => {
    const s = staffList.find(st => st.id === leave.staffId);
    if (!s) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd < start || lStart > end) return;

    const datesBlocked: string[] = [];
    let curr = new Date(lStart);
    while (curr <= lEnd) {
      if (curr >= start && curr <= end) {
        datesBlocked.push(curr.toISOString().split('T')[0]);
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (datesBlocked.length > 0) {
      blackouts.push(`- ${s.initials} (${s.id}) is ON LEAVE (${leave.type}) on: [${datesBlocked.join(', ')}]. STRICTLY UNAVAILABLE.`);
    }
  });
  return blackouts;
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Prepare Credit Bank
  const creditBank: Record<string, number> = {};
  data.staff.forEach(s => {
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    creditBank[s.id] = credits;
  });

  const availableStaff = data.staff.map(s => ({
    id: s.id,
    initials: s.initials,
    type: s.type,
    credits: creditBank[s.id], 
    skills: { LC: s.isLoadControl, SL: s.isShiftLeader, Ops: s.isOps, Ramp: s.isRamp, LF: s.isLostFound },
  }));

  const restRules = generateRestConstraints(data.shifts, config.minRestHours);
  const contractContext = generateContractContext(data.staff, config.startDate, config.numDays);
  const leaveBlackouts = generateLeaveBlackouts(data.leaveRequests || [], data.staff, config.startDate, config.numDays);
  
  const hardConstraints: string[] = [];
  if (data.incomingDuties && data.incomingDuties.length > 0) {
    data.incomingDuties.forEach(duty => {
      const staffMember = data.staff.find(s => s.id === duty.staffId);
      if (!staffMember) return;
      const lastShiftEnd = new Date(`${duty.date}T${duty.shiftEndTime}`);
      const availableAt = new Date(lastShiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));
      const progStart = new Date(config.startDate + "T00:00:00");
      if (availableAt > progStart) {
         hardConstraints.push(`- REST: ${staffMember.initials} resting until ${availableAt.toISOString()}. NO shifts before this time.`);
      }
    });
  }

  // WorkForce Ratio
  const totalStaffCount = availableStaff.length || 1;
  const localStaffCount = availableStaff.filter(s => s.type === 'Local').length;
  const rosterStaffCount = availableStaff.filter(s => s.type === 'Roster').length;
  const localRatio = Math.round((localStaffCount / totalStaffCount) * 100);
  const rosterRatio = 100 - localRatio;

  const targetLocalOffPerDay = Math.ceil(localStaffCount * (2/7));
  const maxLocalPerDay = Math.max(0, localStaffCount - targetLocalOffPerDay);

  const prompt = `
    ROLE: MASTER AVIATION SCHEDULER
    TASK: Build a ${config.numDays}-day roster.
    START_DATE: ${config.startDate}

    **GOAL:** Fill all shift requirements using available staff, respecting skills, leave, and contracts.

    **STAFF POOL:**
    ${availableStaff.map(s => `- ${s.initials} (${s.type}) [Creds: ${s.credits}] Skills:${s.skills.LC?'LC':''}${s.skills.SL?'SL':''}${s.skills.Ops?'OPS':''}${s.skills.Ramp?'RMP':''}`).join('\n')}

    **RULES:**
    1. **CONTRACTS:** Roster staff ONLY work within contract dates.
    2. **LEAVE:** Staff on leave are UNAVAILABLE.
    3. **REST:** Minimum ${config.minRestHours}h rest between shifts.
    4. **LOCAL LIMIT:** Max ~${maxLocalPerDay} local staff working per day.
    5. **SKILLS:** Assign staff only to roles they have skills for (LC, SL, etc).
    6. **BEST EFFORT:** If perfect compliance isn't possible, FILL THE SHIFT ANYWAY and note the alert. DO NOT return empty.

    **CONSTRAINTS:**
    ${contractContext.join('\n')}
    ${leaveBlackouts.join('\n')}
    ${hardConstraints.join('\n')}
    ${restRules.slice(0, 50).join('\n')}... (and more rest rules)

    **SHIFTS TO FILL (Daily):**
    ${JSON.stringify(data.shifts.map(s => ({ id: s.id, time: `${s.pickupTime}-${s.endTime}`, needs: s.roleCounts })))}

    **OUTPUT:** JSON only.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        systemInstruction: "You are a robust roster engine. You MUST return a valid JSON object with 'programs' array populated, even if imperfect. Never return empty arrays.",
        maxOutputTokens: 8192,
      }
    });

    const parsed = safeParseJson(response.text);
    
    // Safety check: if programs array is missing or empty, throw specific error
    if (!parsed || !parsed.programs || !Array.isArray(parsed.programs) || parsed.programs.length === 0) {
      console.error("AI returned empty programs:", response.text);
      throw new Error("AI generated an empty roster. Check staff availability vs shift demand.");
    }
    
    return {
      programs: parsed.programs,
      stationHealth: parsed.stationHealth || 90,
      alerts: parsed.alerts || [],
      isCompliant: true
    };

  } catch (err: any) {
    console.error("Gemini Generation Error:", err);
    throw new Error(`Roster Build Failed: ${err.message}`);
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
  if (params.textData) parts.push({ text: `DATA SOURCE TEXT:\n${params.textData}` });
  if (params.media && params.media.length > 0) {
    params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }
  const prompt = `
    COMMAND: EXTRACT AVIATION DATA to JSON.
    TARGET: ${params.targetType}
    START_DATE: ${params.startDate || 'N/A'}
    
    Instructions:
    - Extract Flights (flightNumber, from, to, times)
    - Extract Staff (name, initials, type, skills)
    - Extract Shifts (start/end times)
    - Return JSON.
  `;
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
  const parts: any[] = [
    { text: `CURRENT ROSTER: ${JSON.stringify(data.programs)}` },
    { text: `USER REQUEST: ${instruction}` },
    { text: `STAFF: ${JSON.stringify(data.staff)}` }
  ];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      systemInstruction: "Modify the roster JSON based on user request. Return valid JSON.",
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
    FIX ROSTER VIOLATIONS:
    ${auditReport}
    
    CURRENT ROSTER: ${JSON.stringify(currentPrograms)}
    STAFF: ${JSON.stringify(data.staff.map(s => ({id: s.id, initials: s.initials, skills: s.isShiftLeader?'SL':''})))}
    
    TASK: Reassign staff to fix violations. Return full JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        maxOutputTokens: 8192
      }
    });
    const parsed = safeParseJson(response.text);
    return {
      programs: parsed.programs || []
    };
  } catch (err: any) {
    throw new Error(err.message || "Repair failed.");
  }
};