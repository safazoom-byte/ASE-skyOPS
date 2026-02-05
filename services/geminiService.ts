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
                role: { type: Type.STRING, description: "Must use exact abbreviations: (SL), (Duty), (RMP), (LF), (LC), (OPS)" },
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
  
  const rosterStart = new Date(config.startDate);
  rosterStart.setHours(0,0,0,0);

  const fatigueLocks = (data.incomingDuties || []).map(duty => {
     const [h, m] = duty.shiftEndTime.split(':').map(Number);
     const dutyEndDate = new Date(duty.date);
     dutyEndDate.setHours(h, m, 0, 0);

     const safeToWorkDate = new Date(dutyEndDate);
     safeToWorkDate.setHours(safeToWorkDate.getHours() + config.minRestHours);

     const diffMs = safeToWorkDate.getTime() - rosterStart.getTime();
     const diffDays = diffMs / (1000 * 60 * 60 * 24);
     
     if (diffDays < 0) return null;

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
    AVIATION GROUND HANDLING INTELLIGENCE SYSTEM - SkyOPS Station Program
    TASK: Generate an Optimized Weekly Staff Program.
    
    WINDOW: Starting ${config.startDate} for ${config.numDays} days.
    MANDATORY REST: ${config.minRestHours} hours.
    
    ROLE ABBREVIATIONS (CRITICAL):
    - Shift Leader -> use "(SL)" or "(Duty)" (if Power Rate > 95)
    - Ramp -> use "(RMP)"
    - Load Control -> use "(LC)"
    - Lost and Found -> use "(LF)"
    - Operations -> use "(OPS)"
    
    RULES:
    1. SAFETY: No overlapping shifts. Enforce 12h rest minimum.
    2. ASSIGNMENT: Assign staff based on initials format (e.g. AH-HMB).
    3. LEAVE: Check LEAVE_LOG and FATIGUE_LOCKS.
    4. COVERAGE: Fill all slots in the SHIFTS registry.
    
    FATIGUE LOCKS: ${JSON.stringify(fatigueLocks)}
    
    STAFF REGISTRY: ${JSON.stringify(data.staff.map(s => ({ 
      id: s.id, 
      name: s.name, 
      initials: s.initials,
      skills: { SL: s.isShiftLeader, LC: s.isLoadControl, RM: s.isRamp, OP: s.isOps, LF: s.isLostFound }, 
      power: s.powerRate 
    })))}
    
    LEAVE_LOG: ${JSON.stringify(data.leaveRequests)}
    SHIFTS: ${JSON.stringify(data.shifts)}
    FLIGHTS: ${JSON.stringify(data.flights)}
    
    RETURN: JSON following schema. Ensure roles are formatted EXACTLY as (SL), (Duty), (RMP), (LF), (LC), (OPS).
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
      throw new Error("Operational logic failure. Engine could not resolve constraints.");
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
