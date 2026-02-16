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

  // Create Strict Manifest of required shifts
  // We explicitly list every shift to force the LLM to account for them
  const shiftManifest = data.shifts.map(s => `ID: "${s.id}" | Date: ${s.pickupDate} | Time: ${s.pickupTime}-${s.endTime} | MinStaff: ${s.minStaff}`).join('\n');

  const prompt = `
    ROLE: AVIATION ROSTER SOLVER (STRICT MANIFEST ENFORCEMENT)
    OBJECTIVE: Generate a ${config.numDays}-day operational roster starting ${config.startDate}.

    ### CRITICAL: THE SHIFT MANIFEST
    You are legally required to staff exactly ${data.shifts.length} shift slots.
    Below is the list of Shift IDs that MUST appear in your output assignments.
    
    MANIFEST:
    ${shiftManifest}

    **VERIFICATION PROTOCOL**: 
    1. Read the Manifest.
    2. For EACH Shift ID in the Manifest, generate assignments.
    3. Do NOT stop until every single ID has been processed.
    4. If a shift is missing in the output, the program is invalid.

    ### PHASE 1: MATHEMATICAL DISTRIBUTION (THE "OFF DAY" STRATEGY)
    Before assigning shifts, calculate the daily numbers:
    1. **DEMAND**: Sum of 'minStaff' for all shifts on Day X.
    2. **ROSTER SUPPLY**: Count of 'Roster' staff active on Day X.
    3. **LOCAL GAP**: Demand - Roster Supply.
    4. **LOCAL SUPPLY**: Total 'Local' staff count.
    5. **OFF TARGET**: Local Supply - Local Gap.
    
    **STRATEGY**: 
    - You must assign 'Day Off' to exactly {OFF TARGET} Local staff each day.
    - **CRITICAL**: You must ROTATE these off days. Do not give everyone Sat/Sun off. Distribute off days evenly (Mon, Tue, Wed...) to ensure the "Gap" is always filled.

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
    - Use **Local** staff second (excluding those selected for 'Day Off' in Phase 1).

    ### PHASE 4: EMERGENCY OVERRIDE (FORCE FILL)
    - **CHECK**: If a shift is still understaffed (Current < MinStaff).
    - **ACTION**: CANCEL the 'Day Off' for needed Local staff.
    - **RULE**: It is better to burn a Local credit (work 6 days) than to leave a shift understaffed.
    - **ZERO SHIFT RULE**: If staff like ML-ATZ, MN-ATZ have 0 shifts, they MUST be prioritized for these gaps.

    ### PHASE 5: REST BARRIER
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
    - **Optimization**: If you assign an LC who is also SL, they cover BOTH requirements.
    - **Swap**: You can swap out a generic Agent to bring in a qualified LC/SL staff.

    #### 2. MINIMUM STAFF COMPLIANCE (FORCE FILL)
    - **Check \`minStaff\`**: If count < \`minStaff\`:
       1. **FORCE FILL**: Identify Local staff with 0 shifts.
       2. **ASSIGN**: Add them to the shift immediately.
       3. **NOTE**: Do not leave gaps. Understaffing is forbidden.
    
    #### 3. REST BARRIER
    - Ensure >${constraints.minRestHours}h rest gaps.

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