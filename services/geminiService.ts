
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

export const sanitizeRole = (role: string): Skill => {
  const r = role.toLowerCase().trim();
  if (r.includes('found') || r.includes('lost') || r === 'lf' || r === 'l&f' || r === 'lost and found' || r === 'lost&found') return 'Lost and Found';
  if (r.includes('leader') || r === 'sl') return 'Shift Leader';
  if (r.includes('ops') || r.includes('operations') || r === 'op') return 'Operations';
  if (r.includes('ramp') || r === 'rmp') return 'Ramp';
  if (r.includes('load') || r === 'lc') return 'Load Control';
  if (r.includes('gate') || r.includes('check')) return 'Gate / Check-in';
  return 'Duty'; // Fallback to Duty as per instructions
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
  Recognize 'Lost and Found' specifically. Also map 'minStaff' and 'maxStaff' for shifts.
  For powerRate, look for columns containing 'rate', 'power', or '%'.
  For Roster dates, map 'workFromDate' (Contract Start) and 'workToDate' (Contract End).`;
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
  const systemInstruction = `Aviation Data Architect. Extract flight, staff, and shift records.
  Role names: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found', 'Gate / Check-in'.`;

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
                  powerRate: { type: Type.NUMBER },
                  workFromDate: { type: Type.STRING },
                  workToDate: { type: Type.STRING },
                  skillRatings: { 
                    type: Type.OBJECT, 
                    properties: { 
                      Ramp: { type: Type.STRING }, 
                      Operations: { type: Type.STRING }, 
                      'Load Control': { type: Type.STRING }, 
                      'Shift Leader': { type: Type.STRING },
                      'Lost and Found': { type: Type.STRING },
                      'Gate / Check-in': { type: Type.STRING }
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
                  minStaff: { type: Type.NUMBER },
                  maxStaff: { type: Type.NUMBER },
                  roleCounts: {
                    type: Type.OBJECT,
                    properties: {
                      'Shift Leader': { type: Type.NUMBER },
                      'Operations': { type: Type.NUMBER },
                      'Ramp': { type: Type.NUMBER },
                      'Load Control': { type: Type.NUMBER },
                      'Lost and Found': { type: Type.NUMBER },
                      'Gate / Check-in': { type: Type.NUMBER }
                    }
                  }
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
  
  const systemInstruction = `Aviation Roster Engine. Generate a daily station program.
  
  MANDATORY ROLE NAMING:
  - Specialist Roles: 'Shift Leader', 'Load Control', 'Ramp', 'Lost and Found', 'Operations'.
  - Generic Role: ALL other staff members assigned to a shift MUST be labeled as 'Duty'. Never use 'Support' or 'Ops' (use 'Operations' or 'Duty' only).
  
  PREVIOUS DAY REST GUARD:
  - Input Format: "KA-ATZ - AF-ATZ - FG-ATZ (2026-01-23 04:00)".
  - Logic: Extract initials (KA, AF, FG) and date/time. These staff finished work at the given time.
  - Calculate rest gap between this finish time and their first Day 1 shift start.
  - If gap < ${config.minRestHours} hours, they are disqualified from Day 1 shifts and must be in offDuty.
  
  100% PERSONNEL REGISTRY:
  - Every staff member in the 'staff' array MUST appear in the output for every day.
  - If a staff member is not assigned to a flight shift, they MUST be listed in 'offDuty'.
  - Categorize absences using: 'DAY OFF', 'ROSTER LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE', 'LIEU LEAVE', or 'NIL'.
  - Local staff (Permanent) usually get 2 Days Off per 7 days.
  - Roster staff outside their contract dates MUST be in ROSTER LEAVE.
  
  STRICT HEADCOUNT:
  - Every shift MUST meet 'minStaff'. Fill gaps with 'Duty' role.
  - Returns a DailyProgram array for ${config.numDays} days starting from ${config.startDate}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Roster Window: ${config.startDate} for ${config.numDays} days. Data: ${JSON.stringify(data)}. Constraints: ${constraintsLog}`,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.INTEGER },
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
                      required: ['staffId', 'flightId', 'role']
                    }
                  },
                  offDuty: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        staffId: { type: Type.STRING },
                        type: { type: Type.STRING }
                      }
                    }
                  }
                },
                required: ['day', 'assignments', 'offDuty']
              }
            },
            shortageReport: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  staffName: { type: Type.STRING },
                  flightNumber: { type: Type.STRING },
                  actualRest: { type: Type.NUMBER },
                  targetRest: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                }
              }
            },
            recommendations: {
              type: Type.OBJECT,
              properties: {
                idealStaffCount: { type: Type.NUMBER },
                currentStaffCount: { type: Type.NUMBER },
                skillGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                hireAdvice: { type: Type.STRING },
                healthScore: { type: Type.NUMBER }
              }
            }
          },
          required: ['programs']
        },
        thinkingConfig: { thinkingBudget: 16384 }
      }
    });
    
    const result = safeParseJson(response.text);
    if (!result || !result.programs || result.programs.length === 0) {
      throw new Error("Roster engine failed to solve headcount. Verify availability.");
    }
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
  const parts: any[] = [{ text: `Instruction: ${instruction}. Use 'Duty' as fallback role.` }, { text: `State: ${JSON.stringify(data.programs)}` }];
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
