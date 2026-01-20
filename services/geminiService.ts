import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig, Assignment, Skill } from "../types";

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

export interface ShortageWarning {
  staffName: string;
  flightNumber: string;
  actualRest: number;
  targetRest: number;
  reason: string;
}

export interface ResourceRecommendation {
  idealStaffCount: number;
  currentStaffCount: number;
  skillGaps: string[];
  hireAdvice: string;
  healthScore: number;
}

export interface BuildResult {
  programs: DailyProgram[];
  shortageReport: ShortageWarning[];
  recommendations?: ResourceRecommendation;
}

/**
 * Sanitizes role strings to ensure "Lost and Found" is always correctly formatted
 * and no abbreviations remain. This prevents production build mangling on Vercel.
 */
export const sanitizeRole = (role: string): Skill => {
  const r = role.toLowerCase().trim();
  if (r.includes('found') || r.includes('lost') || r === 'lf' || r === 'l&f' || r === 'lost and found' || r === 'lost&found') return 'Lost and Found';
  if (r.includes('leader') || r === 'sl') return 'Shift Leader';
  if (r.includes('ops') || r.includes('operations') || r === 'op') return 'Operations';
  if (r.includes('ramp') || r === 'rmp') return 'Ramp';
  if (r.includes('load') || r === 'lc') return 'Load Control';
  return 'Operations'; // Default
};

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
    const stack: string[] = [];
    let lastValidIdx = 0;
    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) lastValidIdx = i + 1;
        }
      }
    }
    if (lastValidIdx > 0) {
      try { return JSON.parse(candidate.slice(0, lastValidIdx)); } catch (e2) {}
    }
    return null;
  }
};

export const identifyMapping = async (sampleRows: any[][], targetType: 'flights' | 'staff' | 'shifts' | 'all'): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `Aviation Data Expert. Identify 0-based column indices. 
  CRITICAL: Map 'Lost and Found' columns specifically. Use FULL names only.`;
  const prompt = `Target: ${targetType}\nData Sample: ${JSON.stringify(sampleRows.slice(0, 5))}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedTarget: { type: Type.STRING },
            columnMap: { 
              type: Type.OBJECT,
              properties: {
                flightNumber: { type: Type.INTEGER },
                from: { type: Type.INTEGER },
                to: { type: Type.INTEGER },
                sta: { type: Type.INTEGER },
                std: { type: Type.INTEGER },
                date: { type: Type.INTEGER },
                name: { type: Type.INTEGER },
                initials: { type: Type.INTEGER },
                type: { type: Type.INTEGER },
                powerRate: { type: Type.INTEGER },
                workFromDate: { type: Type.INTEGER },
                workToDate: { type: Type.INTEGER },
                skill_Ramp: { type: Type.INTEGER },
                skill_LoadControl: { type: Type.INTEGER },
                skill_Operations: { type: Type.INTEGER },
                skill_ShiftLeader: { type: Type.INTEGER },
                'skill_Lost and Found': { type: Type.INTEGER },
                pickupDate: { type: Type.INTEGER },
                pickupTime: { type: Type.INTEGER },
                endDate: { type: Type.INTEGER },
                endTime: { type: Type.INTEGER },
                minStaff: { type: Type.INTEGER },
                maxStaff: { type: Type.INTEGER },
              }
            }
          }
        }
      }
    });
    return safeParseJson(response.text);
  } catch (error) {
    return null;
  }
};

export const extractDataFromContent = async (params: { 
  textData?: string, 
  media?: ExtractionMedia[],
  startDate?: string,
  targetType?: 'flights' | 'staff' | 'shifts' | 'all'
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `Aviation Data Architect. 
  Mission: Extract flight, staff, and shift data.
  HARD RULE: Always use FULL ROLE NAMES. NO ABBREVIATIONS.
  - Role Names: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found'.
  - Linkage: If a flight's STA or STD matches a shift's Start Time (pickupTime), link them.`;

  const parts: any[] = [{ text: `Extract station data from: ${params.textData || "Images"}` }];
  if (params.media) params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flights: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  flightNumber: { type: Type.STRING },
                  from: { type: Type.STRING },
                  to: { type: Type.STRING },
                  sta: { type: Type.STRING },
                  std: { type: Type.STRING },
                  date: { type: Type.STRING }
                }
              } 
            },
            staff: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  initials: { type: Type.STRING },
                  type: { type: Type.STRING },
                  skillRatings: { 
                    type: Type.OBJECT, 
                    properties: { 
                      Ramp: { type: Type.STRING }, 
                      Operations: { type: Type.STRING }, 
                      'Load Control': { type: Type.STRING }, 
                      'Shift Leader': { type: Type.STRING },
                      'Lost and Found': { type: Type.STRING }
                    } 
                  }
                }
              } 
            },
            shifts: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  pickupDate: { type: Type.STRING },
                  pickupTime: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  roleCounts: {
                    type: Type.OBJECT,
                    properties: {
                      'Shift Leader': { type: Type.NUMBER },
                      'Operations': { type: Type.NUMBER },
                      'Ramp': { type: Type.NUMBER },
                      'Load Control': { type: Type.NUMBER },
                      'Lost and Found': { type: Type.NUMBER }
                    }
                  },
                  flightIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              } 
            }
          }
        }
      }
    });
    return safeParseJson(response.text);
  } catch (error) {
    throw error;
  }
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `Aviation Roster Engine. STRICT JSON ONLY.
  Mission: Generate weekly station program.
  HARD CONSTRAINTS:
  1. Flight-Shift Linkage: Each shift handles its linked flightIds.
  2. Roles: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found'.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Build roster for period: ${config.startDate} (${config.numDays} days). Data: ${JSON.stringify(data)}`,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });
    const result = safeParseJson(response.text);
    if (!result || !result.programs) throw new Error("No program generated.");
    return result;
  } catch (error) {
    throw error;
  }
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: `Instruction: ${instruction}` }, { text: `State: ${JSON.stringify(data.programs)}` }];
  if (media) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { programs: data.programs, explanation: "Error modifying." };
  } catch (error) {
    throw error;
  }
};