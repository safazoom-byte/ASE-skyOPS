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
 * Advanced JSON repair utility to handle common LLM output errors 
 * like missing commas or markdown wrapping.
 */
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  
  // 1. Remove markdown formatting if present
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  // 2. Direct Parse Attempt
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // 3. Extract the actual JSON block (finding first {/[ and last }/])
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    const endIdx = Math.max(
      cleanText.lastIndexOf('}'),
      cleanText.lastIndexOf(']')
    );
    
    if (startIdx === Infinity || endIdx === -1 || endIdx <= startIdx) return null;
    
    let jsonCandidate = cleanText.slice(startIdx, endIdx + 1);

    // 4. Aggressive Syntax Repair
    const repairJson = (str: string) => {
      let repaired = str.replace(/("[^"]*"\s*|\d+\s*|true\s*|false\s*|null\s*|\]\s*|\}\s*)(?=")/g, (match) => {
        const trimmed = match.trimEnd();
        if (!trimmed.endsWith(',') && !trimmed.endsWith('{') && !trimmed.endsWith('[')) {
          return trimmed + ', ';
        }
        return match;
      });
      repaired = repaired.replace(/,\s*([\]}])/g, '$1');
      return repaired;
    };

    try {
      return JSON.parse(jsonCandidate);
    } catch (e2) {
      try {
        const fixed = repairJson(jsonCandidate);
        return JSON.parse(fixed);
      } catch (e3) {
        console.error("JSON Repair Failed:", e3);
        return null;
      }
    }
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
  
  const prompt = `
    ACT AS AN AVIATION DATA ARCHITECT.
    TASK: ${target.toUpperCase()} DATA EXTRACTION.
    
    SOURCE DATA MAPPING RULES:
    
    1. STAFF SHEETS:
       - 'Full Name' -> name
       - 'Initials' -> initials
       - 'Category' -> type (Local or Roster)
       - 'Power Rate' -> powerRate (number)
       - 'Work From' -> workFromDate (YYYY-MM-DD)
       - 'Work To' -> workToDate (YYYY-MM-DD)
       - SKILL COLUMNS ('Shift Leader', 'Operations', 'Ramp', 'Load Contr', 'Lost and Found'): 
         - Value 'YES' -> 'Yes', 'NO' -> 'No'.
         - Map 'Load Contr' to 'Load Control' in the JSON object.

    2. SHIFT / SLOT SHEETS:
       - 'Shift Start Date' -> pickupDate
       - 'Shift Start Time' -> pickupTime
       - 'Shift End Date' -> endDate
       - 'Shift End Time' -> endTime
       - 'Min Staff' -> minStaff
       - 'Max Staff' -> maxStaff
       - 'Target Power' -> targetPower
       - 'Role Matrix' (e.g., "Shift Leader: 1, Ramp: 2"): Parse into roleCounts object.
       - FLIGHT COUPLING: If a row has 'Flight No' and 'Value_' columns (Value_STA, Value_STD, Value_From, Value_To):
         - Create a Flight object.
         - Link the Flight's number to the shift's flightIds array.

    3. GENERAL FORMATTING:
       - Reference Date for relative parsing: ${params.startDate || 'today'}.
       - All dates MUST be YYYY-MM-DD.
       - All times MUST be HH:mm.
       
    RETURN STRICT JSON ONLY.
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `SOURCE DATA:\n${params.textData}` });
  if (Array.isArray(params.media)) {
    params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: { 
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
                },
                required: ["flightNumber", "date"]
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
                      'Shift Leader': { type: Type.STRING },
                      'Operations': { type: Type.STRING },
                      'Ramp': { type: Type.STRING },
                      'Load Control': { type: Type.STRING },
                      'Lost and Found': { type: Type.STRING }
                    }
                  }
                },
                required: ["name"]
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
                  targetPower: { type: Type.NUMBER },
                  flightIds: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                },
                required: ["pickupDate", "pickupTime"]
              }
            }
          }
        }
      }
    });

    return safeParseJson(response.text);
  } catch (error) {
    console.error("Extraction Error:", error);
    throw error;
  }
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are the "Aviation Logistics Engine". Generate a valid multi-day staff roster in STRICT JSON.
    RULES:
    1. Roster Leave: No assignments outside contract dates (workFromDate to workToDate).
    2. Local Pattern: Enforce 2 days off after 5 work days.
    3. Absence Box: All staff listed in registry MUST be in offDuty if they are on leave.
    4. Completeness: Every staff member must appear in assignments or offDuty for EVERY day.
    5. JSON: Strict syntax, no trailing commas, no conversational text.
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days from ${config.startDate}
    Manpower: ${JSON.stringify(data.staff)}
    Flights: ${JSON.stringify(data.flights)}
    Shifts: ${JSON.stringify(data.shifts)}
    Constraints: ${constraintsLog}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 8000 },
        maxOutputTokens: 16000, 
        responseSchema: {
          type: Type.OBJECT,
          required: ["programs", "shortageReport"],
          properties: {
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["day", "dateString", "assignments", "offDuty"],
                properties: {
                  day: { type: Type.NUMBER },
                  dateString: { type: Type.STRING },
                  assignments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ["staffId", "role"],
                      properties: {
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
                      required: ["staffId", "type"],
                      properties: {
                        staffId: { type: Type.STRING },
                        type: { type: Type.STRING }
                      }
                    }
                  }
                }
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
            }
          }
        }
      }
    });

    const result = safeParseJson(response.text);
    if (!result || !Array.isArray(result.programs)) {
      throw new Error("Logic engine output failed validation. Please refine constraints and try again.");
    }
    return result;
  } catch (error) {
    console.error("Generation Error:", error);
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
  if (Array.isArray(media)) {
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
          required: ["programs", "explanation"],
          properties: {
            programs: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                required: ["day", "assignments", "offDuty"],
                properties: {
                  day: { type: Type.NUMBER },
                  dateString: { type: Type.STRING },
                  assignments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ["staffId", "role"],
                      properties: {
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
                      required: ["staffId", "type"],
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
          }
        }
      }
    });

    return safeParseJson(response.text) || { programs: data.programs, explanation: "Modification failed due to syntax constraints." };
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};
