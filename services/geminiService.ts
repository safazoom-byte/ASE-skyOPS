
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

const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks and any trailing/leading whitespace
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // If standard parse fails, try to find the first '{' and last '}'
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try {
        return JSON.parse(cleanText.slice(startIdx, endIdx + 1));
      } catch (e2) {
        console.error("Critical JSON Parse Failure:", e2);
      }
    }
    // Try array if object fails
    const startArr = cleanText.indexOf('[');
    const endArr = cleanText.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      try {
        return JSON.parse(cleanText.slice(startArr, endArr + 1));
      } catch (e3) {
        console.error("Critical JSON Array Parse Failure:", e3);
      }
    }
    return null;
  }
};

export const extractDataFromContent = async (params: { 
  textData?: string, 
  media?: ExtractionMedia[],
  startDate?: string 
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    CRITICAL EXTRACTION TASK: Convert the provided aviation ground handling documents (Excel/CSV/PDF/Images) into structured JSON.
    
    STRICT COMPLIANCE RULES:
    1. DO NOT SUMMARIZE. You must extract EVERY SINGLE ROW of staff and flights found in the source.
    2. 1-TO-1 MAPPING: Each row in the source file must correspond to one entry in the JSON arrays.
    3. NO OMISSION: Even if data seems redundant or extensive, include all records.
    4. DATE FORMAT: Ensure all dates are YYYY-MM-DD.
    5. SKILLS: Mapping proficiency: If a person is qualified, use "Yes", otherwise "No".
    
    Context Date: ${params.startDate || 'Current Operational Week'}
  `;

  const parts: any[] = [{ text: prompt }];
  if (params.textData) parts.push({ text: `RAW SOURCE DATA (CSV FORMAT):\n${params.textData}` });
  if (params.media) {
    params.media.forEach(m => {
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json", 
      temperature: 0, 
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 2048 },
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
                type: { type: Type.STRING, enum: ['Arrival', 'Departure', 'Turnaround'] }
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
                type: { type: Type.STRING, enum: ['Local', 'Roster'] },
                powerRate: { type: Type.NUMBER },
                workFromDate: { type: Type.STRING },
                workToDate: { type: Type.STRING },
                skillRatings: { 
                  type: Type.OBJECT,
                  description: "Proficiency in specific station skills",
                  properties: {
                    "Ramp": { type: Type.STRING, enum: ["Yes", "No"] },
                    "Load Control": { type: Type.STRING, enum: ["Yes", "No"] },
                    "Lost and Found": { type: Type.STRING, enum: ["Yes", "No"] },
                    "Shift Leader": { type: Type.STRING, enum: ["Yes", "No"] },
                    "Operations": { type: Type.STRING, enum: ["Yes", "No"] }
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
                roleCounts: { 
                  type: Type.OBJECT,
                  description: "Number of staff required for specific roles in this shift",
                  properties: {
                    "Ramp": { type: Type.INTEGER },
                    "Load Control": { type: Type.INTEGER },
                    "Lost and Found": { type: Type.INTEGER },
                    "Shift Leader": { type: Type.INTEGER },
                    "Operations": { type: Type.INTEGER }
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
};

export const generateAIProgram = async (
  data: ProgramData,
  constraintsLog: string,
  config: { numDays: number, customRules: string, minRestHours: number, startDate: string }
): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these STRICT CHECKLIST RULES:

    1. DAY 1 REST: On Day 1 (${config.startDate}), staff assigned must have >= ${config.minRestHours} hours rest since their "Previous Duty Log" finish time.
    2. ABSENCE LOGIC: Scan "Personnel Absence & Requests" box. Map initials and dates to specific leave types (DAY OFF, ANNUAL LEAVE, etc.).
    3. LOCAL 5/2 PATTERN: For 'Local' staff, exactly 2 days per 7-day period must be 'offDuty'. Use requested dates first.
    4. ROSTER CONTRACTS: 'Roster' staff are OFF (ROSTER LEAVE) if today is outside their [workFromDate, workToDate] range.
    5. SHIFT COVERAGE: Every shift MUST meet 'minStaff' and honor 'roleCounts' for specific skills (Shift Leader, etc.).
    6. STATION RESERVE: On-duty staff not assigned to a shift are "Station Reserve". They are NOT in 'offDuty'.

    OUTPUT FORMAT: You must return a valid JSON object matching the requested schema.
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days from ${config.startDate}
    Registry: Staff: ${JSON.stringify(data.staff)}, Flights: ${JSON.stringify(data.flights)}, Shifts: ${JSON.stringify(data.shifts)}
    Constraints: ${constraintsLog}
    Custom Rules: ${config.customRules}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 16000 },
      responseSchema: {
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
                    }
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
        required: ["programs", "shortageReport"]
      }
    }
  });

  const result = safeParseJson(response.text);
  if (!result || !result.programs) {
    console.error("Logic Assembly Failure Details:", response.text);
    throw new Error("Logic assembly failed. The AI engine returned an incompatible format.");
  }
  return result;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are an "Operational Coordinator". 
    Strictly maintain the 6-point checklist and over-staffing rules. 
    Use the 5/2 pattern calculation for Local staff and Contract-based logic for Roster staff.
    Unassigned on-duty staff = Station Reserve (not in offDuty).
  `;

  const parts: any[] = [
    { text: `Current Data: ${JSON.stringify(data)}` },
    { text: `Instruction: ${instruction}` }
  ];
  
  if (media) {
    media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          programs: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          explanation: { type: Type.STRING }
        },
        required: ["programs", "explanation"]
      }
    }
  });

  return safeParseJson(response.text);
};
