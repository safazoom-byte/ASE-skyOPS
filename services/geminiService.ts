import { GoogleGenAI, Type } from "@google/genai";
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from "../types";

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

const parseAIError = (error: any): string => {
  console.error("AI Service Error:", error);
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch (err) {
    return "Unknown AI Service Error";
  }
};

export async function extractDataFromContent(content: { 
  media?: ExtractionMedia[], 
  textData?: string 
}): Promise<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';
  
  const prompt = `
    Act as a Station Operations Analyst. Extract structured data from these Aviation documents.
    1. FLIGHT SCHEDULE: Extract Flight numbers, Route (From/To), STA, STD.
    2. PERSONNEL LIST: Extract Staff names and initials.
    3. SHIFT DEFINITIONS: Look for recurring shift patterns, duty start times (pickup times), and required staff numbers (min/max).
    
    IMPORTANT: The operational week starts on FRIDAY. 
    Days are 0-indexed (0=Friday, 1=Saturday, 2=Sunday, 3=Monday, 4=Tuesday, 5=Wednesday, 6=Thursday).
    If a shift/flight is daily, generate records for all 7 days.
  `;

  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) {
      content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    }
    if (content.textData) parts.push({ text: `RAW DATA:\n${content.textData}` });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: { 
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
                  day: { type: Type.NUMBER },
                  type: { type: Type.STRING }
                },
                required: ["flightNumber", "from", "to", "day"]
              }
            },
            staff: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  initials: { type: Type.STRING }
                },
                required: ["name"]
              }
            },
            shifts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
                  pickupTime: { type: Type.STRING },
                  minStaff: { type: Type.NUMBER },
                  maxStaff: { type: Type.NUMBER }
                },
                required: ["day", "pickupTime"]
              }
            }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    const flights = (result.flights || []).map((f: any) => ({
      ...f,
      id: Math.random().toString(36).substr(2, 9),
      type: f.type || 'Turnaround'
    }));
    const staff = (result.staff || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      maxShiftsPerWeek: 5,
      skillRatings: {}
    }));
    const shifts = (result.shifts || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      minStaff: s.minStaff || 4,
      maxStaff: s.maxStaff || 8,
      flightIds: []
    }));
    
    return { flights, staff, shifts };
  } catch (error) {
    throw new Error(parseAIError(error));
  }
}

export async function extractStaffOnly(content: { media?: ExtractionMedia[], textData?: string }): Promise<Staff[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Extract staff names and initials from the provided personnel list. Ignore any group or department info.`;
  try {
    const parts: any[] = [{ text: prompt }];
    if (content.media) content.media.forEach(m => parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }));
    if (content.textData) parts.push({ text: content.textData });
    
    const response = await ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: { parts }, 
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            staff: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  initials: { type: Type.STRING }
                },
                required: ["name"]
              }
            }
          }
        }
      } 
    });
    const result = JSON.parse(response.text || "{}");
    return (result.staff || []).map((s: any) => ({ ...s, id: Math.random().toString(36).substr(2, 9), maxShiftsPerWeek: 5, skillRatings: {} }));
  } catch (error) { 
    throw new Error(parseAIError(error));
  }
}

export async function generateAIProgram(data: ProgramData, qmsContext?: string, options?: { minHours?: number, customRules?: string, numDays?: number, mode?: 'standard' | 'deep', fairRotation?: boolean }): Promise<DailyProgram[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const isDeep = options?.mode === 'deep';
  const model = isDeep ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  const fairRotationClause = options?.fairRotation ? `
    - FAIR ROTATION IS MANDATORY: You must rotate undesirable shifts (pickups before 07:00 or after 21:00) among all staff. 
    - No single staff member should be assigned an early morning or late night shift more than twice in the period if others have fewer.
    - Balance the total number of shifts per person as equally as possible within their maxShiftsPerWeek constraints.` : '';

  const prompt = `
    Act as a professional aviation ground handling scheduler. Create a ${options?.numDays || 7}-day staff program based on DEFINED SHIFT SLOTS.
    
    IMPORTANT: THE PROGRAM STARTS ON FRIDAY.
    Day index 0 = Friday, 1 = Saturday, 2 = Sunday, 3 = Monday, 4 = Tuesday, 5 = Wednesday, 6 = Thursday.

    CORE OPERATIONAL DATA:
    1. PERSONNEL (STAFF): ${JSON.stringify(data.staff)}
    2. DEFINED SHIFTS (SLOTS): ${JSON.stringify(data.shifts)}
    3. FLIGHTS: ${JSON.stringify(data.flights.filter(f => f.day < (options?.numDays || 7)))}
    
    STRICT SCHEDULING LOGIC:
    - Every assignment must link to a 'shiftId' from the provided DEFINED SHIFTS.
    - Aim to stay between 'minStaff' and 'maxStaff' for each shift.
    - Staff cannot exceed their 'maxShiftsPerWeek' (default is 5 if not specified).
    ${fairRotationClause}
    
    USER CUSTOM INSTRUCTIONS:
    ${options?.customRules || "Ensure fair distribution and coverage."}
    
    OUTPUT FORMAT: Return a JSON array of DailyProgram objects.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        ...(isDeep ? { thinkingConfig: { thinkingBudget: 16384 }, maxOutputTokens: 32000 } : {}),
        responseMimeType: "application/json",
        responseSchema: {
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
                  required: ["id", "staffId", "flightId", "role", "shiftId"]
                }
              }
            },
            required: ["day", "assignments"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { 
    throw new Error(parseAIError(error));
  }
}

/**
 * Updates an existing program based on natural language instructions.
 */
export async function modifyProgramWithAI(
  instruction: string, 
  data: ProgramData
): Promise<DailyProgram[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Act as an Expert Station Scheduler. You are given a user instruction to modify a weekly flight handling program.
    
    USER INSTRUCTION: "${instruction}"

    CURRENT CONTEXT:
    - Staff: ${JSON.stringify(data.staff.map(s => ({ id: s.id, name: s.name, initials: s.initials })))}
    - Flights: ${JSON.stringify(data.flights.map(f => ({ id: f.id, flightNumber: f.flightNumber, day: f.day })))}
    - Current Programs: ${JSON.stringify(data.programs)}

    TASK:
    - Apply the change requested by the user.
    - If the user wants to swap people, swap them.
    - If the user wants to remove someone, remove them.
    - If the user wants to add someone to a flight, create a new assignment object with a unique 'id'.
    - Ensure IDs for staff, flights, and shifts remain consistent with the provided data.
    - RETURN THE ENTIRE UPDATED DailyProgram[] ARRAY.

    STRICT: Return ONLY valid JSON representing the full DailyProgram[] array. No conversational text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
                  required: ["id", "staffId", "flightId", "role", "shiftId"]
                }
              }
            },
            required: ["day", "assignments"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.text || "[]");
    return Array.isArray(parsed) ? parsed : data.programs;
  } catch (error) {
    throw new Error(parseAIError(error));
  }
}