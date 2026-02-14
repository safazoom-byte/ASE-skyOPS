import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty } from "../types";

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

const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    if (startIdx === Infinity) return null;
    let candidate = cleanText.slice(startIdx);
    let stack: string[] = [];
    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) return JSON.parse(candidate.slice(0, i + 1));
        }
      }
    }
    return null;
  }
};

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
              },
              required: ["id", "staffId", "role", "shiftId"]
            }
          }
        },
        required: ["day", "dateString", "assignments"]
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

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - MASTER PROGRAM BUILDER
    OBJECTIVE: Build a ${config.numDays}-day program starting ${config.startDate}.

    ### 1. CREDENTIAL VERIFICATION (STRICT QUALIFICATION FIREWALL)
    You are FORBIDDEN from assigning a specialist role unless the staff member has the specific boolean flag in the database:
    - Role "SL" (Shift Leader) -> REQUIRED: \`isShiftLeader: true\`
    - Role "LC" (Load Control) -> REQUIRED: \`isLoadControl: true\`
    - Role "OPS" (Operations) -> REQUIRED: \`isOps: true\`
    - Role "LF" (Lost & Found) -> REQUIRED: \`isLostFound: true\`
    - Role "RMP" (Ramp) -> REQUIRED: \`isRamp: true\`
    - Role "SL+LC" -> REQUIRED: BOTH \`isShiftLeader: true\` AND \`isLoadControl: true\`
    
    *Violation Check*: If you assign "MK-HMB" to "SL" but their data says \`isShiftLeader: false\`, the roster is ILLEGAL.

    ### 2. EXECUTION STRATEGY: TWO-PHASE FILLING
    **PHASE A: CRITICAL COVERAGE (Target: minStaff)**
    - Iterate through every shift in the period.
    - Fill specialist roles first (SL, LC, etc.) using qualified staff.
    - Fill remaining slots with General staff until \`minStaff\` is reached.
    - PRIORITIZE: Roster staff (contracts) first, then Local staff.
    - RESTRICTION: Local staff max 5 shifts/week. Roster staff max 7/week (continuous).

    **PHASE B: OPTIMIZATION & MOBILIZATION (Target: maxStaff)**
    - After Phase A is complete for all days, scan the STANDBY pool (staff not assigned).
    - If a shift is currently below \`maxStaff\`:
      - Identify available staff who are (a) Off-duty, (b) Legal (rested), (c) Within contract limits, (d) NOT in Leave/Rest logs.
      - **ASSIGN THEM IMMEDIATELY** to fill the gap up to \`maxStaff\`.
      - **DO NOT** leave legal staff on Standby if a shift has empty capacity below \`maxStaff\`. Maximize workforce utilization.
    
    ### 3. LEGALITY & SWAP PROTOCOL (The "No Hole" Rule)
    - **Scenario**: A Local staff member reaches 6 shifts (Illegal).
    - **Old Rule**: Delete the shift (Creates understaffing).
    - **NEW RULE**: **SWAP**. Find a staff member currently on STANDBY or DAY OFF who is legal.
      - Remove the over-limit staff.
      - Insert the Standby staff into that slot.
      - PRESERVE the role if possible (e.g., if removing an SL, swap with another SL).
    
    ### 4. UNAVAILABILITY PROTOCOLS
    - **LEAVE REGISTRY**: Staff in "LEAVE/ABSENCE" are LOCKED OUT for the entire day. No exceptions.
    - **REST LOG (TIME-BASED FATIGUE LOCK)**: 
      - Check 'PREVIOUS DUTIES' (REST LOG) for entries matching the schedule date.
      - Staff are **LOCKED** until they complete **${config.minRestHours} hours of rest** after their last shift end.
      - **FORMULA**: \`SafeStartTime = RestLogEntry.shiftEndTime + ${config.minRestHours} hours\`
      - **RULE**: You MAY assign them to a shift ONLY IF \`Shift.pickupTime\` >= \`SafeStartTime\`.
      - **EXAMPLE**: If Rest Log says finished at 04:00, and min rest is 12h, they are FREE after 16:00. You CANNOT assign them to a 06:00 shift, but you CAN assign them to a 17:00 shift.
    - **REST COMPLIANCE**: Ensure exactly ${config.minRestHours} hours of rest between consecutive shifts in the generated roster.

    ### 5. HYBRID EFFICIENCY (SL+LC)
    - If a shift needs 1 SL and 1 LC, try to find *one* person with both flags and assign "SL+LC". This saves 1 headcount.

    ### STATION DATA:
    - STAFF: ${JSON.stringify(data.staff)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - PREVIOUS DUTIES (REST LOG): ${JSON.stringify(data.incomingDuties)}
    - LEAVE/ABSENCE (OFF-DUTY REGISTRY): ${JSON.stringify(data.leaveRequests)}

    ### OUTPUT:
    Return JSON matching the ROSTER_SCHEMA. 
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    const parsed = safeParseJson(response.text);
    return {
      programs: parsed.programs || [],
      stationHealth: parsed.stationHealth || 0,
      alerts: parsed.alerts || [],
      isCompliant: true
    };
  } catch (err: any) {
    throw new Error(err.message || "AI Engine failure.");
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
    COMMAND: STATION REGISTRY EXTRACTION
    OBJECTIVE: Parse and extract aviation station data into structured JSON.
    TARGET: ${params.targetType}
    STATION_START_DATE: ${params.startDate || 'N/A'}
  `;
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
  const parts: any[] = [
    { text: `CONTEXT: Current programs: ${JSON.stringify(data.programs)}` },
    { text: `INSTRUCTION: ${instruction}` },
    { text: `Staff: ${JSON.stringify(data.staff)}` }
  ];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 16000 }
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
  
  // *** CRITICAL UPGRADE: Cloning Logic from generateAIProgram to Repair Engine ***
  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR PROTOCOL v5.0 (ULTIMA)
    ROLE: Senior Aviation Roster Specialist
    OBJECTIVE: Fix the specific violations in the roster below while strictly adhering to Station Rules.

    ### 1. CREDENTIAL CHECK (ZERO TOLERANCE FIREWALL)
    - **FAKE ROLE VIOLATION**: If a staff member is assigned a role (SL, LC, OPS, etc.) but lacks the boolean flag in 'Staff Attributes', you MUST fix this.
    - **Fix**: SWAP the unqualified staff with a qualified staff member from Standby/Off-Duty. If none available, remove the role label but keep the staff (if General is okay).
    - **Flags**:
       - SL -> \`isShiftLeader: true\`
       - LC -> \`isLoadControl: true\`
       - RMP -> \`isRamp: true\`
       - OPS -> \`isOps: true\`

    ### 2. EXCLUSION ZONE (LEAVE & REST LOCK)
    - **LEAVE REGISTRY**: Staff listed in 'LEAVE REGISTRY' (check date range) are **INVISIBLE**. Remove them if assigned.
    - **REST LOG (TIME-BASED FATIGUE LOCK)**:
      - Staff listed in 'REST LOG' are **LOCKED** until they complete **${constraints.minRestHours} hours** of rest after their shift end.
      - **CALCULATION**: 
        1. Find 'REST LOG' entry: { staffId, date, shiftEndTime }.
        2. Determine 'SafeStartTime' = shiftEndTime + ${constraints.minRestHours}h.
        3. If assigned shift starts BEFORE 'SafeStartTime', this is an **ILLEGAL ASSIGNMENT**.
      - **ACTION**: **REMOVE IMMEDIATELY** and SWAP if possible.
      - Do NOT swap *in* a person who is in the Leave/Rest registry during their blocked time.

    ### 3. ABBREVIATION PROTOCOL (STRICT STYLE GUIDE)
    - **DO NOT** use full words like "Shift Leader" or "Ramp".
    - **MUST USE**: "SL", "LC", "RMP", "OPS", "LF", "SL+LC".
    - **ACTION**: Rename all roles in the program to match these codes.

    ### 4. THE "SMART SWAP" MANDATE (Fixing Overwork)
    - **Scenario**: Local staff working > 5 days (6th day violation) or Roster staff > 7 days.
    - **Old Action**: Delete assignment (Creates understaffing).
    - **NEW ACTION**: **SWAP**.
      1. Identify a replacement staff member from STANDBY who is (a) Qualified, (b) Rested, (c) Legal, (d) Not on Leave.
      2. Remove the overworked staff.
      3. Insert the replacement staff into the exact same slot.

    ### 5. HYBRID EFFICIENCY (SL+LC)
    - If a shift needs 1 SL and 1 LC, and you have a staff member with BOTH flags, assign "SL+LC" to save headcount.

    ### 6. THE "MOBILIZATION" MANDATE (Fixing Understaffing)
    - **Scenario**: Shift headcount < minStaff OR (Shift < maxStaff AND Standby available).
    - **Action**: SCAN the available staff pool (Standby).
    - **Execute**: Assign legal staff to fill empty slots until maxStaff is reached.

    ### CRITICAL AUDIT REPORT (TARGETS TO FIX):
    ${auditReport}

    ### DATA SOURCES:
    - Staff Attributes: ${JSON.stringify(data.staff.map(s => ({ 
        id: s.id, 
        initials: s.initials, 
        type: s.type, 
        quals: {
          SL: s.isShiftLeader, 
          LC: s.isLoadControl, 
          RMP: s.isRamp, 
          OPS: s.isOps, 
          LF: s.isLostFound
        },
        maxShifts: s.maxShiftsPerWeek
      })))}
    - Shift Definitions: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, min: s.minStaff, max: s.maxStaff, reqRoles: s.roleCounts, start: s.pickupTime, end: s.endTime })))}
    - **LEAVE REGISTRY (LOCKED OUT)**: ${JSON.stringify(data.leaveRequests)}
    - **REST LOG (LOCKED OUT)**: ${JSON.stringify(data.incomingDuties)}
    - Current Roster: ${JSON.stringify(currentPrograms)}

    ### OUTPUT FORMAT:
    Return a JSON object containing the FULL updated 'programs' array. 
    Matches standard ROSTER_SCHEMA.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: ROSTER_SCHEMA,
        thinkingConfig: { thinkingBudget: 32768 }
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