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
                role: { type: Type.STRING, description: "Must be: SL, OPS, RMP, LC, LF, or 'General'" },
                shiftId: { type: Type.STRING }
              },
              required: ["id", "staffId", "role", "shiftId"]
            }
          },
          offDuty: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                staffId: { type: Type.STRING },
                type: { type: Type.STRING }
              },
              required: ["staffId", "type"]
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
  const rosterStart = new Date(config.startDate);
  rosterStart.setHours(0,0,0,0);

  const fatigueLocks = (data.incomingDuties || []).map(duty => {
     const [h, m] = duty.shiftEndTime.split(':').map(Number);
     const dutyEndDate = new Date(duty.date);
     dutyEndDate.setHours(h, m, 0, 0);
     const safeToWorkDate = new Date(dutyEndDate);
     safeToWorkDate.setHours(safeToWorkDate.getHours() + config.minRestHours);
     if (safeToWorkDate.getTime() <= rosterStart.getTime()) return null;
     const diffMs = safeToWorkDate.getTime() - rosterStart.getTime();
     const diffDays = diffMs / (1000 * 60 * 60 * 24);
     const lockedDayIndex = Math.max(0, Math.floor(diffDays));
     const timeStr = `${String(safeToWorkDate.getHours()).padStart(2, '0')}:${String(safeToWorkDate.getMinutes()).padStart(2, '0')}`;
     return { staffId: duty.staffId, lockedUntilDay: lockedDayIndex, lockedUntilTime: timeStr };
  }).filter(Boolean);

  const prompt = `
    FLIGHT HANDLING OPERATIONS COMMAND - STATION ROSTER GENERATION
    PERIOD: ${config.startDate} for ${config.numDays} days.

    CRITICAL OPERATIONAL DIRECTIVES (MANDATORY):
    1. **ZERO-RESERVE ENFORCEMENT**: 
       - It is a CRITICAL FAILURE to have staff in "Standby (Reserve)" while any shift on the same day is below its 'minStaff' count.
       - You MUST assign all available, rested, and qualified personnel to shifts until ALL 'minStaff' requirements are met.
       - Only place staff in "Standby (Reserve)" if EVERY shift that day has already reached its 'maxStaff' or no qualified personnel remain.

    2. **MANDATORY SKILL CHECK**: 
       - ROLE 'SL': Only if 'isShiftLeader' is true.
       - ROLE 'OPS': Only if 'isOps' is true.
       - ROLE 'LC': Only if 'isLoadControl' is true.
       - ROLE 'RMP': Only if 'isRamp' is true.
       - ROLE 'LF': Only if 'isLostFound' is true.
       - General headcount filling (General) can be used to meet 'minStaff'.

    3. **FLIGHT COVERAGE**:
       - Each shift handles specific flights. Assignments must follow the 'shiftId' logic.
       - Ensure specialists are distributed based on the complexity of flights in those shifts.

    4. **OPTIMIZED MANNING**:
       - Aim for 'maxStaff' if personnel are available and rested.

    5. **REST & LABOR PATTERNS**:
       - Minimum ${config.minRestHours}h rest between any two shifts.
       - "Local" staff: Max 5 shifts in 7 days (resulting in 2 "Days Off").

    INPUT CONTEXT:
    - STAFF: ${JSON.stringify(data.staff)}
    - LEAVE: ${JSON.stringify(data.leaveRequests)}
    - SHIFTS: ${JSON.stringify(data.shifts)}
    - FATIGUE: ${JSON.stringify(fatigueLocks)}
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

export const extractDataFromContent = async (options: { textData?: string, media?: ExtractionMedia[], startDate?: string, targetType: string }): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Extract station data for ${options.targetType} into a structured JSON format.` }];
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
  const parts: any[] = [
    { text: `CONTEXT: Current handling programs: ${JSON.stringify(data.programs)}` },
    { text: `INSTRUCTION: ${instruction}` },
    { text: `Available Staff: ${JSON.stringify(data.staff)}` }
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
  // Fixed: changed result.text to response.text to use the defined variable
  return safeParseJson(response.text);
};