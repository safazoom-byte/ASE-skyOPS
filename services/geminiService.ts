
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
  if (r.includes('leader') || r === 'sl' || r === 'shiftleader') return 'Shift Leader';
  if (r.includes('ops') || r.includes('operations') || r === 'op' || r === 'operation') return 'Operations';
  if (r.includes('ramp') || r === 'rmp') return 'Ramp';
  if (r.includes('load') || r === 'lc' || r === 'loadcontrol') return 'Load Control';
  return 'Duty'; 
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
  const systemInstruction = `Aviation Data Expert. Identify 0-based column indices for station data mapping. 
  Recognize 'Lost and Found' specifically. Also map 'minStaff' and 'maxStaff' for shifts.
  Identify individual skill columns like 'Ramp', 'OPS', 'SL', 'LC', 'LF'.
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
                roleMatrix: { type: Type.INTEGER },
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
  Role names: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found'.
  Ensure Roster start/end dates are captured correctly as workFromDate and workToDate.`;

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
                  minStaff: { type: Type.NUMBER },
                  maxStaff: { type: Type.NUMBER },
                  roleCounts: {
                    type: Type.OBJECT,
                    properties: {
                      'Shift Leader': { type: Type.NUMBER },
                      'Operations': { type: Type.NUMBER },
                      'Ramp': { type: Type.NUMBER },
                      'Load Control': { type: Type.NUMBER },
                      'Lost and Found': { type: Type.NUMBER }
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
  
  const systemInstruction = `Aviation Roster Engine. Generate a daily station program with ABSOLUTE compliance.
  
  1. MASTER TRUTH - THE ABSENCE BOX (Personnel Requests):
  - Any staff mentioned as 'OFF', 'LEAVE', 'SICK', 'ANNUAL', 'ROSTER' for a date MUST be moved to 'offDuty' immediately and excluded from all availability for that day.
  
  2. NO IDLE STAFF (FILL MINSTAFF OR FAIL):
  - CRITICAL: You are PROHIBITED from leaving staff as 'NIL' (Available) if any shift on that day is below its 'minStaff' headcount.
  - You MUST exhaust the available pool to ensure all shifts reach 'minStaff'.
  - Aim for 'maxStaff' for all shifts if the pool allows.
  
  3. MANDATORY SAFETY MINIMUMS (FOR FLIGHT SHIFTS):
  - Every shift linked to a flight MUST be assigned at least 1 Shift Leader (SL) and 1 Load Control (LC) as the very first step.
  - You are FORBIDDEN from returning a shift that has 0 Shift Leaders or 0 Load Controllers if qualified people are available in the registry.
  
  4. FULL ROLE DIVERSITY:
  - After safety minimums (SL/LC), fulfill the rest of the 'roleCounts' (Ramp, Operations, Lost and Found).
  - If a shift needs 5 people but you only have 3 specialists, the remaining 2 MUST be filled by available staff assigned with the role 'Duty'. 
  - Do NOT leave slots empty just because a specialist is missing; use generic 'Duty' staff to meet 'minStaff'.
  
  5. FLEXIBLE LOCAL 5/2 RULE:
  - 'Local' staff MUST get 2 days off for every 5 days worked. 
  - THESE 2 DAYS DO NOT NEED TO BE SEQUENTIAL. They can be split (e.g., Tuesday and Saturday).
  - Prioritize these legally required days off.
  
  6. ROSTER STAFF CONTRACTS:
  - Staff are 'ROSTER LEAVE' if the date is outside their 'workFromDate'/'workToDate'.
  
  7. FULL ACCOUNTABILITY:
  - Every person in the registry MUST appear in 'assignments' OR 'offDuty' for every day. 
  - Use 'NIL' only for staff who are excess to operational needs after ALL shifts have reached their maximum capacity.`;

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
                      },
                      required: ['staffId', 'type']
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
        thinkingConfig: { thinkingBudget: 24000 }
      }
    });
    
    const result = safeParseJson(response.text);
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
  const parts: any[] = [{ text: `Instruction: ${instruction}. MANDATORY: Fill shifts to at least 'minStaff' before marking staff as 'NIL'. Ensure 1 SL and 1 LC per flight shift. 5/2 rule for Local staff is flexible (non-sequential).` }, { text: `State: ${JSON.stringify(data.programs)}` }];
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
