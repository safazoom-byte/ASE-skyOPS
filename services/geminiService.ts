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
                staffId: { type: Type.STRING, description: "Actual staff ID or 'GAP' for missing coverage." },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING, description: "Skill role name." },
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
                type: { type: Type.STRING, enum: ["Day off", "Annual leave", "Lieu leave", "Sick leave", "Roster leave"] }
              },
              required: ["staffId", "type"]
            }
          }
        },
        required: ["day", "dateString", "assignments"]
      }
    },
    stationHealth: { type: Type.NUMBER, description: "Operational health percentage (0-100)" },
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
     if (safeToWorkDate.getTime() <= rosterStart.getTime()) return null;
     const diffMs = safeToWorkDate.getTime() - rosterStart.getTime();
     const diffDays = diffMs / (1000 * 60 * 60 * 24);
     const lockedDayIndex = Math.max(0, Math.floor(diffDays));
     const timeStr = `${String(safeToWorkDate.getHours()).padStart(2, '0')}:${String(safeToWorkDate.getMinutes()).padStart(2, '0')}`;
     return { staffId: duty.staffId, lockedUntilDay: lockedDayIndex, lockedUntilTime: timeStr };
  }).filter(Boolean);

  const prompt = `
    AVIATION GROUND HANDLING INTELLIGENCE SYSTEM - SkyOPS Station Program
    TASK: Generate an Optimized Multi-Day Staff Program.
    WINDOW: Start: ${config.startDate}, Duration: ${config.numDays} days.
    
    STRICT OPERATIONAL CONSTRAINTS:
    1. LOCAL STAFF 5/2 PATTERN (CRITICAL): Every 'Local' staff member MUST have EXACTLY 5 working shifts and 2 "Day off" records within any 7-day period. 
       - Off days DO NOT need to be sequential. 
       - You MUST track a "counter" for each local staff member to ensure exactly 5 shifts and 2 off days.
       - Every unassigned day for a local staff member MUST be included in the "offDuty" array as type "Day off".
    2. ROLE MATCHING (STRICTEST ROLE): Check each shift's "roleCounts" (e.g., Shift Leader: 1, Ramp: 2). You MUST assign personnel who possess the corresponding skill (isShiftLeader, isRamp, etc.) in their profile. Never assign a person to a role they aren't qualified for.
    3. MANDATORY STAFFING: The "minStaff" value in ShiftConfig is a HARD REQUIREMENT. Never assign fewer personnel than this. Use 'GAP' if no qualified personnel are available.
    4. MAX STAFFING: Target "maxStaff" if qualified personnel are available and have remaining shift capacity (max 5 per 7 days).
    5. ZERO NEGATIVE INDICES: Day 0 is the program start date.
    6. MANDATORY REST: Ensure at least ${config.minRestHours}h between any two shifts.
    7. FATIGUE MANAGEMENT: Obey FATIGUE LOCKS.
    8. LEAVE CATEGORIES: 
       - Map specific leaves (Annual, Lieu, Sick) from LEAVE_LOG to "offDuty".
       - Roster staff outside contract dates must be in "offDuty" as "Roster leave".

    INPUT REGISTRIES:
    STAFF: ${JSON.stringify(data.staff)}
    LEAVE_LOG: ${JSON.stringify(data.leaveRequests)}
    SHIFTS: ${JSON.stringify(data.shifts)}
    FLIGHTS: ${JSON.stringify(data.flights)}
    FATIGUE: ${JSON.stringify(fatigueLocks)}
    
    OUTPUT: Return JSON matching schema. Propose a sequence that satisfies ALL role requirements while maintaining the 5/2 pattern for all 100% of the local staff.
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
  return safeParseJson(response.text);
};