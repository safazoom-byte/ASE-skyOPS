import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill, IncomingDuty } from "../types";

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number; 
  alerts?: { type: 'danger' | 'warning', message: string }[];
}

const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Basic recovery for JSON fragmentation if AI output is truncated
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    if (startIdx === Infinity) return null;
    let candidate = cleanText.slice(startIdx);
    let stack: string[] = [];
    let lastValidIdx = 0;
    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) {
            lastValidIdx = i + 1;
            break; 
          }
        }
      }
    }
    if (lastValidIdx > 0) {
      try {
        return JSON.parse(candidate.slice(0, lastValidIdx));
      } catch (e2) {
        console.error("JSON fragmentation recovery failed", e2);
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
                staffId: { type: Type.STRING, description: "Must use actual staff ID or 'GAP' if no qualified personnel available." },
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
    stationHealth: { type: Type.NUMBER, description: "Operational readiness percentage 0-100" },
    alerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["danger", "warning"] },
          message: { type: Type.STRING }
        }
      }
    }
  },
  required: ["programs", "stationHealth"]
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Calculate lock times for incoming duties based on specific dates
  const rosterStart = new Date(config.startDate);
  rosterStart.setHours(0,0,0,0);

  const fatigueLocks = (data.incomingDuties || []).map(duty => {
     const [h, m] = duty.shiftEndTime.split(':').map(Number);
     const dutyEndDate = new Date(duty.date);
     dutyEndDate.setHours(h, m, 0, 0);

     // Add Minimum Rest
     const safeToWorkDate = new Date(dutyEndDate);
     safeToWorkDate.setHours(safeToWorkDate.getHours() + config.minRestHours);

     const diffMs = safeToWorkDate.getTime() - rosterStart.getTime();
     const diffDays = diffMs / (1000 * 60 * 60 * 24);
     
     if (diffDays < 0) return null; // Rest ended before program start

     const lockedDayIndex = Math.floor(diffDays);
     const lockedTimeH = safeToWorkDate.getHours();
     const lockedTimeM = safeToWorkDate.getMinutes();
     const timeStr = `${String(lockedTimeH).padStart(2, '0')}:${String(lockedTimeM).padStart(2, '0')}`;

     return {
       staffId: duty.staffId,
       lockedUntilDay: lockedDayIndex,
       lockedUntilTime: timeStr,
       note: `Resting until Day ${lockedDayIndex + 1} at ${timeStr}`
     };
  }).filter(Boolean);

  const prompt = `
    AVIATION GROUND HANDLING INTELLIGENCE SYSTEM
    TASK: Generate an Optimized Weekly Staff Program.
    
    WINDOW: Starting ${config.startDate} for ${config.numDays} days.
    MANDATORY REST: ${config.minRestHours} hours between duty cycles.
    
    HIERARCHY OF OPERATIONS:
    1. SAFETY FIRST: No staff can work two overlapping shifts. 12h rest is legally required.
    2. COMPANY COVER PRIORITY: Flights marked as 'Company Cover' or high priority MUST have experienced staff (Power Rate > 85) assigned.
    3. COVERAGE ASSURANCE: Every flight linked to a shift MUST have staff assigned. Prioritize filling slots over ideal patterns.
    4. LEAVE REQUESTS: DO NOT assign staff on days where they have a Leave Request in the provided LEAVE_LOG.
    5. FATIGUE MANAGEMENT:
       - Adhere strictly to FATIGUE LOCKS. Staff cannot work before their lock time.
       - FATIGUE LOCKS: ${JSON.stringify(fatigueLocks)}
    6. SPECIALIST MATCHING: 
       - 'Ramp' role requires isRamp: true.
       - 'Shift Leader' role requires isShiftLeader: true.
       - 'Load Control' requires isLoadControl: true.
    7. WORK PATTERNS:
       - 'Local' Staff: Prefer 5 days ON, 2 days OFF.
       - 'Roster' Staff: Available only within workFromDate and workToDate.
    8. GAP REPORTING: If absolutely no qualified staff fits the window, assign 'GAP'.
    
    INPUT DATA:
    STAFF REGISTRY: ${JSON.stringify(data.staff.map(s => ({ 
      id: s.id, 
      name: s.name, 
      type: s.type,
      workPattern: s.workPattern,
      availableFrom: s.workFromDate,
      availableTo: s.workToDate,
      skills: { SL: s.isShiftLeader, LC: s.isLoadControl, RM: s.isRamp, OP: s.isOps, LF: s.isLostFound }, 
      power: s.powerRate 
    })))}
    
    LEAVE_LOG: ${JSON.stringify(data.leaveRequests)}
    
    DUTY SLOTS (SHIFTS): ${JSON.stringify(data.shifts)}
    FLIGHT LOG: ${JSON.stringify(data.flights)}
    
    RETURN: JSON matching schema. Calculate stationHealth based on coverage percentage.
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
    if (!parsed || !parsed.programs) {
      throw new Error("Operational logic failure. AI engine could not resolve constraints.");
    }

    return {
      programs: parsed.programs,
      stationHealth: parsed.stationHealth || 0,
      alerts: parsed.alerts || [],
      isCompliant: true,
      validationLog: []
    };
  } catch (err: any) {
    console.error("Operational Fault:", err);
    throw new Error(err.message || "Engine failure during roster calculation.");
  }
};

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Extract station data (${options.targetType}) into JSON. Keys: flightNumber, from, to, sta, std, date, name, initials, pickupTime, endTime.` }];
  
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) {
    options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: 'application/json' }
  });
  
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `INSTRUCTION: ${instruction}` },
    { text: `CONTEXT: ${JSON.stringify(data.programs)}` }
  ];
  if (media.length > 0) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }
  
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