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
 */
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
    const endIdx = Math.max(cleanText.lastIndexOf('}'), cleanText.lastIndexOf(']'));
    if (startIdx === Infinity || endIdx === -1) return null;
    let jsonCandidate = cleanText.slice(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (e2) {
      return null;
    }
  }
};

/**
 * New Smart-Map Service: Identifies column indexes for local parsing
 */
export const identifyMapping = async (sampleRows: any[][], targetType: 'flights' | 'staff' | 'shifts' | 'all'): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    ACT AS AN AVIATION DATA MAPPING SPECIALIST.
    GIVEN A SAMPLE OF SPREADSHEET ROWS, IDENTIFY THE COLUMN INDEX (0-based) FOR EACH REQUIRED FIELD.

    REQUIRED FIELDS BY TARGET:
    - FLIGHTS: flightNumber, from, to, sta, std, date
    - STAFF: name, initials, type, powerRate, workFromDate, workToDate, skill_Ramp, skill_LoadControl, skill_Operations, skill_ShiftLeader
    - SHIFTS: pickupDate, pickupTime, endDate, endTime, minStaff, maxStaff

    OUTPUT JSON ONLY.
  `;

  const prompt = `
    TARGET CATEGORY: ${targetType.toUpperCase()}
    SAMPLE ROWS (First row is usually headers):
    ${JSON.stringify(sampleRows.slice(0, 5))}

    Identify which column index maps to which required field. Return -1 if not found.
  `;

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
                // Flights fields
                flightNumber: { type: Type.INTEGER },
                from: { type: Type.INTEGER },
                to: { type: Type.INTEGER },
                sta: { type: Type.INTEGER },
                std: { type: Type.INTEGER },
                date: { type: Type.INTEGER },
                // Staff fields
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
                // Shifts fields
                pickupDate: { type: Type.INTEGER },
                pickupTime: { type: Type.INTEGER },
                endDate: { type: Type.INTEGER },
                endTime: { type: Type.INTEGER },
                minStaff: { type: Type.INTEGER },
                maxStaff: { type: Type.INTEGER },
              },
              required: ["flightNumber", "name", "pickupDate"] // Ensure some properties are identified as required keys in the response object
            }
          },
          required: ["detectedTarget", "columnMap"]
        }
      }
    });
    return safeParseJson(response.text);
  } catch (error) {
    console.error("Mapping Identification Error:", error);
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
  
  const systemInstruction = `
    ACT AS AN AVIATION LOGISTICS DATA ARCHITECT.
    OBJECTIVE: Extract and normalize station data from images/text into strict JSON.

    1. STAFF REGISTRY NORMALIZATION:
       - 'Full Name' -> name (String)
       - 'Initials' -> initials (String)
       - 'Category' -> type ('Local' or 'Roster'). Match "Permanent", "Fixed", "Local", "Full Time" to 'Local'. Match "Variable", "Rostered", "External", "Contractor" to 'Roster'.
       - 'Power Rate' -> powerRate (Number). Look for headers: "Power %", "Efficiency", "Rate", "Performance", "Power". Strip percentage signs and map "100" or "0.95" to numbers like 100 or 95. Default to 75.
       - 'Work From' -> workFromDate (String, YYYY-MM-DD). ONLY FOR ROSTER STAFF. Match headers: "Contract Start", "Start Date", "From", "Work From". Convert from formats like DD/MM/YYYY or MM/DD/YYYY.
       - 'Work To' -> workToDate (String, YYYY-MM-DD). ONLY FOR ROSTER STAFF. Match headers: "Contract End", "End Date", "To", "Work To". Convert from formats like DD/MM/YYYY or MM/DD/YYYY.
       - LOCAL STAFF: If type is 'Local', explicitly IGNORE any 'Work From' or 'Work To' dates as they work a permanent 5/2 cycle.
       - Skills: Map "YES"/"NO", "TRUE"/"FALSE", or "X" marks to "Yes"/"No".

    2. DUAL SHEET (Combined Shifts + Flights):
       - If a row has "Shift Start" AND "Flight No", create BOTH a Flight and a Shift object.
       - Use 'Role Matrix' (e.g., "Ramp: 2") to populate roleCounts.

    3. DATE/TIME STANDARDS:
       - All dates MUST be YYYY-MM-DD.
       - All times MUST be HH:mm (24h).
       - Reference Year: ${params.startDate?.split('-')[0] || new Date().getFullYear()}.
  `;

  const prompt = `
    TARGET MODE: ${target.toUpperCase()}
    SOURCE DATA:
    ${params.textData || "Analyze provided content for operational data."}
  `;

  const parts: any[] = [{ text: prompt }];
  if (Array.isArray(params.media)) {
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
                required: ["name", "initials"]
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

    const parsed = safeParseJson(response.text);
    return parsed || { flights: [], staff: [], shifts: [] };
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
    ACT AS A HIGH-PRECISION AVIATION ROSTERING ENGINE.
    GOAL: Generate a multi-day staff roster in valid JSON.

    CONSTRAINTS:
    1. CATEGORY LOGIC:
       - LOCAL STAFF: Work a permanent 5-on/2-off pattern. Ignore workFrom/To dates.
       - ROSTER STAFF: Availability is STRICTLY limited to [workFromDate, workToDate]. Do not assign outside these bounds.
    2. MINIMUM REST: Every staff member MUST have at least ${config.minRestHours} hours of rest between shifts.
    3. ROLE MATRIX: Honor the 'roleCounts' for each shift. Assign personnel with appropriate 'skillRatings'.
    4. POWER RATE: Prioritize staff with higher power rates (e.g., 90-100%) for complex turnaround shifts.
    5. ABSENCE BOX: Strictly follow the OFF/NIL requests in the provided constraints.

    OUTPUT FORMAT: Strictly follow the responseSchema.
  `;

  const prompt = `
    OPERATIONAL WINDOW: ${config.numDays} days starting from ${config.startDate}.
    INPUT DATA: ${JSON.stringify(data)}
    CONSTRAINTS/LOGS: ${constraintsLog}
    CUSTOM RULES: ${config.customRules}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 12000 },
        maxOutputTokens: 20000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
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
              required: ["healthScore"]
            }
          },
          required: ["programs", "shortageReport"]
        }
      }
    });

    const result = safeParseJson(response.text);
    if (!result || !result.programs) throw new Error("Logic Engine output missing required roster structure.");
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
      config: { responseMimeType: "application/json" }
    });
    return safeParseJson(response.text) || { programs: data.programs, explanation: "Failed to process modification." };
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};
