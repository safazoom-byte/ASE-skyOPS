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
 * Enhanced JSON parser that attempts to repair truncated or malformed JSON 
 * by balancing brackets and stripping markdown noise.
 */
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  // Try standard parse first
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
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        const last = stack.pop();
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          if (stack.length === 0) lastValidIdx = i + 1;
        }
      }
    }
    
    if (lastValidIdx > 0) {
      try {
        return JSON.parse(candidate.slice(0, lastValidIdx));
      } catch (e2) {}
    }

    let repaired = candidate;
    const repairStack = [...stack];
    while (repairStack.length > 0) {
      const last = repairStack.pop();
      repaired += (last === '{' ? '}' : ']');
    }

    try {
      return JSON.parse(repaired);
    } catch (e3) {
      console.error("JSON Repair Failed:", e3);
      return null;
    }
  }
};

export const identifyMapping = async (sampleRows: any[][], targetType: 'flights' | 'staff' | 'shifts' | 'all'): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `Aviation Data Expert. Identify 0-based column indices for the provided data. 
  If a column is not clearly found or is empty, return -1 for that field. 
  STRICT JSON ONLY.`;
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
          },
          required: ["detectedTarget", "columnMap"]
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
  const target = params.targetType || 'all';
  const systemInstruction = `Aviation Data Architect. 
  Mission: Extract structured flight, staff, and shift data.
  HARD RULE: Always use FULL ROLE NAMES. NO ABBREVIATIONS.
  - Role Names: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found'.
  - If the user says "Tomorrow", calculate date based on system current window start: ${params.startDate || 'today'}.
  - Relational Mapping: If a shift is linked to a flight number, extract the flight number in the shift object.
  - Use YYYY-MM-DD for dates and HH:mm for times.
  - PowerRate: Default to 75.
  STRICT JSON ONLY.`;

  const promptText = `Extract station data. 
  Current Window Start: ${params.startDate}.
  Input: ${params.textData || "Images attached."}`;

  const parts: any[] = [{ text: promptText }];
  if (params.media) {
    params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { 
        systemInstruction,
        responseMimeType: "application/json", 
        temperature: 0.1,
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
                  date: { type: Type.STRING },
                  type: { type: Type.STRING }
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
  
  const systemInstruction = `Aviation Roster Engine. STRICT JSON ONLY.
  Mission: Generate weekly station program covering flights handling.
  HARD CONSTRAINTS:
  1. Flight-Shift Linkage: Each shift is EXPLICITLY LINKED to specific flightIds. Personnel assigned to a shift MUST cover those linked flights.
  2. Full Role Names: Use full names only: 'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found'.
  3. Skill Matching: Only assign staff to roles if their skillRating is 'Yes'.
  4. Role Requirements: Respect roleCounts in each shift strictly.
  5. Scarcity: Prioritize 'Shift Leader' and 'Operations' as they are compliance-critical.
  6. Rest: Minimum ${config.minRestHours}h rest between shifts.`;

  const promptText = `Build roster. Data: ${JSON.stringify(data)}.
  Respect explicit flightIds linkage in shifts.
  Population Period: ${config.numDays} days from ${config.startDate}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: promptText,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 8192 },
        maxOutputTokens: 16384,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
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
                      required: ["staffId", "flightId", "role"]
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
                required: ["day", "assignments"]
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
                },
                required: ["staffName", "reason"]
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
              },
              required: ["idealStaffCount", "healthScore"]
            }
          },
          required: ["programs", "shortageReport"]
        }
      }
    });

    const result = safeParseJson(response.text);
    if (!result || !result.programs) {
      throw new Error("Logic Engine: No programs returned.");
    }
    return result;
  } catch (error: any) {
    console.error("Roster Engine Critical Failure:", error);
    throw error;
  }
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `Roster State: ${JSON.stringify(data.programs)}` },
    { text: `Instruction: ${instruction}` }
  ];
  if (media) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            programs: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
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
                      }
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
                }
              } 
            },
            explanation: { type: Type.STRING }
          },
          required: ["programs", "explanation"]
        }
      }
    });
    const result = safeParseJson(response.text);
    return result || { programs: data.programs, explanation: "Modification error." };
  } catch (error) {
    throw error;
  }
};