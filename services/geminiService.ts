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
  
  // Enriched staff mapping
  const staffContext = data.staff.map(s => ({ 
    id: s.id, 
    initials: s.initials, 
    type: s.type, 
    workFrom: s.workFromDate, 
    workTo: s.workToDate, 
    skills: { 
      SL: s.isShiftLeader, 
      LC: s.isLoadControl, 
      RMP: s.isRamp,
      OPS: s.isOps,
      LF: s.isLostFound
    } 
  }));

  // PHASE 0: HARD REST ENFORCEMENT PRE-CALCULATION
  // Calculate exact availability time for each staff in the rest log and explicitly BAN them from conflicting shifts.
  const restBans: string[] = [];
  if (data.incomingDuties && data.incomingDuties.length > 0) {
    data.incomingDuties.forEach(duty => {
      const staffMember = data.staff.find(s => s.id === duty.staffId);
      if (!staffMember) return;

      const lastShiftEnd = new Date(`${duty.date}T${duty.shiftEndTime}`);
      const availableAt = new Date(lastShiftEnd.getTime() + (config.minRestHours * 60 * 60 * 1000));

      data.shifts.forEach(shift => {
        const shiftStart = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
        
        // If the shift starts BEFORE the staff member is available (considering minRestHours)
        if (shiftStart < availableAt) {
           restBans.push(`- CONSTRAINT: Staff '${staffMember.id}' (${staffMember.initials}) MUST NOT be assigned to Shift ID '${shift.id}' (Shift Start: ${shift.pickupDate} ${shift.pickupTime}). REASON: Resting until ${availableAt.toISOString()}.`);
        }
      });
    });
  }

  // Create Strict Manifest of required shifts
  // We include the Day Index to help the AI map it to the 'programs' array
  const shiftManifest = data.shifts.map(s => `ID: "${s.id}" | DayIndex: ${s.day} (${s.pickupDate}) | Time: ${s.pickupTime}-${s.endTime} | MinStaff: ${s.minStaff}`).join('\n');

  // DETERMINISTIC FAIRNESS ANCHORS
  // Calculate specific off-days for Local staff to ensure 5-on/2-off rotation.
  // We group staff into blocks of 5 and rotate their off-days.
  const localStaff = data.staff.filter(s => s.type === 'Local');
  const fairnessTable = localStaff.map((s, i) => {
    // Logic: Group 0 (Indices 0-4) gets Day 1 & 2 Off.
    // Logic: Group 1 (Indices 5-9) gets Day 3 & 4 Off.
    // ... wrapping around the numDays.
    const groupIndex = Math.floor(i / 5);
    const startDayOffset = (groupIndex * 2) % config.numDays;
    
    // Day numbers are 1-based for the prompt
    // We handle the 0-index wrap around to ensure valid day numbers
    const d1 = startDayOffset + 1;
    const d2 = ((startDayOffset + 1) % config.numDays) + 1;

    return `- ${s.initials} (Index ${i}): FORCE OFF on Day ${d1} and Day ${d2} (Has 0 credits)`;
  }).join('\n');

  const prompt = `
    ROLE: AVIATION ROSTER SOLVER (STRICT MANIFEST + CREDIT ENFORCEMENT)
    OBJECTIVE: Generate a ${config.numDays}-day operational roster starting ${config.startDate}.

    ### PHASE 0: HARD CONSTRAINTS (REST LOG ENFORCEMENT)
    **CRITICAL**: The following assignments are PHYSICALLY IMPOSSIBLE due to fatigue laws.
    You MUST NOT assign these staff to these specific shifts under any circumstances.
    ${restBans.length > 0 ? restBans.join('\n') : "No rest violations detected from previous logs."}

    ### CRITICAL: THE SHIFT MANIFEST
    You are legally required to staff exactly ${data.shifts.length} shift slots.
    Below is the list of Shift IDs that MUST appear in your output assignments.
    
    MANIFEST:
    ${shiftManifest}

    **VERIFICATION PROTOCOL**: 
    1. Read the Manifest.
    2. For EACH Shift ID in the Manifest, generate assignments matching 'MinStaff'.
    3. Do NOT stop until every single ID has been processed.
    4. If a shift is missing in the output, the program is invalid.

    ### PHASE 1: CREDIT LIMIT & FAIRNESS (STRICT)
    **RULE**: Local Staff have a strict credit of **5 SHIFTS MAXIMUM**.
    - If a staff member works 5 shifts, they have **0 CREDITS LEFT**.
    - You must NOT assign them a 6th shift.
    
    **OFF-DAY ANCHORS (MANDATORY)**:
    To ensure the 5-shift limit is met evenly, follow these anchors:
    ${fairnessTable}
    *Instructions: If a staff is listed as FORCE OFF for Day X, do NOT assign them under any circumstances. Leave the shift understaffed if necessary.*

    ### PHASE 2: SPECIALIST ASSIGNMENT (DUAL ROLE OPTIMIZATION)
    For each shift, assign roles in this STRICT order:
    
    1. **LOAD CONTROL (LC) - HIGHEST PRIORITY**
       - Assign a qualified LC staff member (Roster preferred, then Local).
       - **OPTIMIZATION**: If the assigned LC staff is *also* a Shift Leader (SL), you count them towards the SL requirement too.
       - *Example*: Shift needs 1 LC, 1 SL. Staff 'AZ' (has LC & SL) is assigned to 'LC'. Now Shift needs 0 SL. (Saved 1 headcount).

    2. **SHIFT LEADER (SL)**
       - Assign remaining SLs needed (if not covered by the LC optimization).

    3. **RAMP / OPS / LOST & FOUND**
       - Assign remaining specialist roles.

    ### PHASE 3: GENERAL FILL (AGENT ROLE)
    - Fill the remaining slots to reach 'minStaff'.
    - Use **Roster** staff first.
    - Use **Local** staff second (checking the Fairness Table to skip those anchored as OFF).
    - **CRITICAL**: If you run out of staff (due to rest, leave, or off-days), **LEAVE THE SLOT EMPTY**. It is better to return an understaffed roster than an illegal one.

    ### PHASE 4: REST BARRIER
    - 16:00 to 00:00 is only 8 hours. Illegal if minRest is 12.

    STATION DATA:
    - STAFF POOL: ${JSON.stringify(staffContext)}
    - SHIFTS CONFIG: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, pickupTime: s.pickupTime, endTime: s.endTime, roleCounts: s.roleCounts, minStaff: s.minStaff })))}
    - FLIGHT SCHEDULE: ${JSON.stringify(data.flights.map(f => ({ id: f.id, fn: f.flightNumber, date: f.date })))}
    - REST LOG: ${JSON.stringify(data.incomingDuties)}
    - LEAVE: ${JSON.stringify(data.leaveRequests)}

    OUTPUT: Return JSON matching the schema.
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

    INSTRUCTIONS:
    1. EXTRACT FLIGHTS: Look for flight numbers, sectors, times.
    2. EXTRACT STAFF: Look for names, initials, roles. Look for date ranges (Start/End dates) and capture them as workFromDate/workToDate.
    3. EXTRACT SHIFTS: Look for duty start/end times.
    4. EXTRACT LEAVE/ABSENCE: Look for "Leave Registry", "Absence", "Days Off". Return as 'leaveRequests' array.
    5. EXTRACT REST/FATIGUE: Look for "Rest Log", "Previous Duties", "Fatigue Audit". Return as 'incomingDuties' array.
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
  
  // Enriched staff mapping for Repair context
  const staffContext = data.staff.map(s => ({ 
    id: s.id, 
    initials: s.initials, 
    type: s.type, 
    workFrom: s.workFromDate, 
    workTo: s.workToDate,
    skills: { 
      SL: s.isShiftLeader, 
      LC: s.isLoadControl, 
      RMP: s.isRamp,
      OPS: s.isOps,
      LF: s.isLostFound
    } 
  }));

  const prompt = `
    COMMAND: STATION OPERATIONS COMMAND - SURGICAL REPAIR (PRIORITY MODE)
    OBJECTIVE: Fix violations in the roster below while strictly adhering to the Station Allocation Protocol.

    ### VIOLATION REPORT (PRIORITY FIXES):
    ${auditReport}

    ### ALLOCATION PROTOCOL (ENFORCE DURING REPAIR):
    
    #### 1. DUAL ROLE & LC PRIORITY (CRITICAL)
    - **Load Control (LC)**: Must be filled.
    - **Optimization**: If the assigned LC staff is *also* a Shift Leader (SL), you count them towards the SL requirement too.
    - **Swap**: You can swap out a generic Agent to bring in a qualified LC/SL staff.

    #### 2. MINIMUM STAFF COMPLIANCE
    - **Check \`minStaff\`**: Try to fill to \`minStaff\`.
    - **CONSTRAINT**: Do NOT assign staff if it violates their 5-shift limit or rest rules.
    - **NOTE**: It is better to leave a gap (understaffed) than to violate the law/contracts.
    
    #### 3. REST BARRIER
    - Ensure >${constraints.minRestHours}h rest gaps.
    
    #### 4. CREDIT LIMIT (REPAIR MODE)
    - If a Local staff has 5 shifts, DO NOT ASSIGN them a 6th shift. No exceptions.

    ### DATA SOURCES:
    - Staff Pool: ${JSON.stringify(staffContext)}
    - Shift Specs: ${JSON.stringify(data.shifts.map(s => ({ id: s.id, roleCounts: s.roleCounts, minStaff: s.minStaff })))}
    - Current Roster: ${JSON.stringify(currentPrograms)}

    ### OUTPUT FORMAT:
    Return a JSON object containing the FULL updated 'programs' array.
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