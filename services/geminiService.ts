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
          day: { type: Type.INTEGER, description: "Must be 0 or greater. 0 is the start date." },
          dateString: { type: Type.STRING },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                staffId: { type: Type.STRING, description: "Must use actual staff ID or 'GAP' if no qualified personnel available." },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING, description: "Exact abbreviations: (SL), (Duty), (RMP), (LF), (LC), (OPS)" },
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

     // If safeToWorkDate is before or at rosterStart, they are available.
     if (safeToWorkDate.getTime() <= rosterStart.getTime()) return null;

     const diffMs = safeToWorkDate.getTime() - rosterStart.getTime();
     const diffDays = diffMs / (1000 * 60 * 60 * 24);
     
     // clamped lockedDayIndex to 0 to prevent "negative days" logical errors
     const lockedDayIndex = Math.max(0, Math.floor(diffDays));
     const timeStr = `${String(safeToWorkDate.getHours()).padStart(2, '0')}:${String(safeToWorkDate.getMinutes()).padStart(2, '0')}`;
     
     return { 
       staffId: duty.staffId, 
       lockedUntilDay: lockedDayIndex, 
       lockedUntilTime: timeStr,
       reason: `Resting until Day ${lockedDayIndex+1} at ${timeStr}`
     };
  }).filter(Boolean);

  const prompt = `
    AVIATION GROUND HANDLING INTELLIGENCE SYSTEM - SkyOPS Station Program
    TASK: Generate an Optimized Weekly Staff Program.
    WINDOW: Starting ${config.startDate} for ${config.numDays} days.
    
    IMPORTANT RULES:
    1. NEVER use negative day indices. The start date ${config.startDate} is Day 0.
    2. 12h rest minimum between duty periods.
    3. Check LEAVE_LOG for dates: "Day off", "Annual leave", "Lieu leave", "Sick leave".
    4. Check STAFF contract dates: If Day is outside workFromDate/workToDate, they are UNAVAILABLE (Roster leave).
    5. Respect FATIGUE LOCKS provided below.
    
    FATIGUE LOCKS (Staff resting from previous duties):
    ${JSON.stringify(fatigueLocks)}
    
    STAFF: ${JSON.stringify(data.staff)}
    LEAVE: ${JSON.stringify(data.leaveRequests)}
    SHIFTS: ${JSON.stringify(data.shifts)}
    FLIGHTS: ${JSON.stringify(data.flights)}
    
    RETURN: JSON following schema. 
    If a shift starts on Day X but a staff member is locked until Day X+1, do NOT assign them.
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
    throw new Error(err.message || "Engine failure during program calculation.");
  }
};

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Extract station data (${options.targetType}) into JSON.` }];
  if (options.textData) parts.push({ text: options.textData });
  if (options.media) options.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: 'application/json' }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `INSTRUCTION: ${instruction}` }, { text: `CONTEXT: ${JSON.stringify(data.programs)}` }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 16000 } }
  });
  return safeParseJson(response.text);
};