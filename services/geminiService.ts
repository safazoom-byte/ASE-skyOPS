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
                staffId: { type: Type.STRING },
                flightId: { type: Type.STRING },
                role: { type: Type.STRING },
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
    AVIATION GROUND HANDLING COMMAND CENTER - ROSTER ENGINE
    PERIOD: ${config.startDate} for ${config.numDays} days.

    ABSOLUTE PRIORITIES (MANDATORY):
    1. **MINIMUM STAFFING (PRIORITY #1)**: Every single shift MUST have at least 'minStaff' number of agents. It is an operational failure to leave a shift under-staffed. You MUST assign available staff to reach 'minStaff' before considering any other patterns.
    2. **LOCAL STAFF 5/2 PATTERN**: All staff categorized as 'Local' MUST work exactly 5 days and have 2 days off in any 7-day period. This is strictly required.
    3. **SPECIALIST SLOTS**: Assign 'Shift Leader' and 'Ramp' qualified personnel to their required slots first.
    4. **SMART DISTRIBUTION**: Distribute staff workload fairly. Avoid giving one person all the shifts and others none.
    5. **FATIGUE SAFETY**: Maintain ${config.minRestHours}h rest between shifts. 

    If a conflict occurs, you MUST prioritize MIN STAFF coverage over rest/patterns, but try to satisfy all. If coverage is still impossible, use 'GAP' in staffId and flag it.

    INPUT CONTEXT:
    - PERSONNEL: ${JSON.stringify(data.staff)}
    - UNAVAILABILITY/LEAVE: ${JSON.stringify(data.leaveRequests)}
    - OPERATIONAL SLOTS: ${JSON.stringify(data.shifts)}
    - FATIGUE LOCKS: ${JSON.stringify(fatigueLocks)}

    OUTPUT:
    - Return a DailyProgram for each day in the requested ${config.numDays} day period.
    - Local staff not working MUST be in 'offDuty' with type 'Day off'.
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
  return safeParseJson(response.text);
};