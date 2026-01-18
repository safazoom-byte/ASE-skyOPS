
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
 * Enhanced JSON parser with recovery for truncated responses.
 * Attempts to close open braces/brackets if the AI hits a token limit.
 */
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  
  // Strip Markdown markers
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  const balanceJson = (json: string): string => {
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
    }

    let balanced = json;
    if (inString) balanced += '"';
    while (openBraces > 0) {
      balanced += '}';
      openBraces--;
    }
    while (openBrackets > 0) {
      balanced += ']';
      openBrackets--;
    }
    return balanced;
  };

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    console.warn("Initial JSON parse failed, attempting recovery...");
    
    // Find the first JSON structure
    const startIdx = Math.min(
      cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'),
      cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('[')
    );
    
    if (startIdx !== Infinity) {
      try {
        const potentialJson = balanceJson(cleanText.slice(startIdx));
        return JSON.parse(potentialJson);
      } catch (e2) {
        console.error("JSON Recovery Failed:", e2);
        // Last ditch effort: try to strip trailing commas that often break truncated JSON
        try {
          const aggressive = cleanText.slice(startIdx).replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(balanceJson(aggressive));
        } catch (e3) {
          return null;
        }
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
  
  // Optimization: Pre-clean text data to reduce token bloat
  const cleanedTextData = params.textData?.split('\n')
    .filter(line => line.trim().length > 0 && !line.startsWith(',,,,'))
    .join('\n');

  const prompt = `
    ACT AS A RAW DATA CONVERTER (FLASH MODE).
    TASK: Convert ALL rows from the source into valid JSON.
    
    STRICT RULES:
    1. 1:1 FIDELITY: Every row in the spreadsheet MUST become an object in the JSON.
    2. HEADER AGNOSTIC: Map columns based on semantic meaning:
       - Personnel/Name/Staff/Agent -> 'name'
       - FLT/Flight/No -> 'flightNumber'
       - STA/Arrival -> 'sta'
       - STD/Departure -> 'std'
       - Category/Type/Class -> 'type'
    3. BULK HANDLING: Do not summarize. If there are 100 rows, output 100 objects.
    4. NO PREAMBLE: Start directly with JSON.
    
    Target Window: ${params.startDate || 'Latest'}
  `;

  const parts: any[] = [{ text: prompt }];
  if (cleanedTextData) parts.push({ text: `SOURCE DATA:\n${cleanedTextData}` });
  if (params.media) {
    params.media.forEach(m => {
      parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
    });
  }

  const response = await ai.models.generateContent({
    // Using flash-preview for high volume and faster inference
    model: 'gemini-3-flash-preview', 
    contents: { parts },
    config: { 
      responseMimeType: "application/json", 
      temperature: 0,
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 0 }, 
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
                  description: "Map available flags to Yes/No",
                  properties: {
                    "Ramp": { type: Type.STRING },
                    "Load Control": { type: Type.STRING },
                    "Lost and Found": { type: Type.STRING },
                    "Shift Leader": { type: Type.STRING },
                    "Operations": { type: Type.STRING }
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
                  properties: {
                    "Ramp": { type: Type.NUMBER },
                    "Load Control": { type: Type.NUMBER },
                    "Lost and Found": { type: Type.NUMBER },
                    "Shift Leader": { type: Type.NUMBER },
                    "Operations": { type: Type.NUMBER }
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
    You are the "Aviation Logistics Engine". Create a multi-day staff roster following these STRICT MANDATORY RULES. 
    FAILURE TO COMPLY WITH THESE RULES IS AN OPERATIONAL BREACH:
    
    1. ROSTER LEAVE (CONTRACT BOUNDS): 
       - Staff of type 'Roster' have 'workFromDate' and 'workToDate'. 
       - IF the program date is BEFORE 'workFromDate' OR AFTER 'workToDate', that staff member MUST be placed in the 'offDuty' list for that day with type 'ROSTER LEAVE'.
       - They are strictly FORBIDDEN from being assigned to any shift or flight on those dates.

    2. LOCAL OFF DAYS (5/2 PATTERN):
       - Staff of type 'Local' MUST NOT work more than 5 consecutive days.
       - They MUST have exactly 2 days OFF (type 'DAY OFF') in the 'offDuty' array after 5 days of work.

    3. ABSENCE REGISTRY (PRIORITY 1):
       - Check the 'Personnel Absence & Requests' box immediately.
       - If a staff member is requested OFF, they MUST be in the 'offDuty' array for those dates.

    4. NO STANDBY LIMBO:
       - Every staff member for every day must have a clear status.
       - If they are not assigned to a flight shift, they MUST be in the 'offDuty' array.
       - NEVER use the term "Station Reserve" or "Standby" in assignments. 
       - If they aren't working a flight, they are in the Leaves Registry.

    5. DAY 1 REST GUARD: 
       - Check 'Previous Duty Log'. Staff need ${config.minRestHours} hours rest from their previous finish time before their first shift in this new period.

    OUTPUT FORMAT:
    - programs: Array of DailyProgram objects.
    - shortageReport: Array of ShortageWarning.
  `;

  const prompt = `
    Operational Window: ${config.numDays} Days starting from ${config.startDate}
    Staff List: ${JSON.stringify(data.staff)}
    Flight Schedule: ${JSON.stringify(data.flights)}
    Shift Templates: ${JSON.stringify(data.shifts)}
    Station Logs: ${constraintsLog}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 16000 }
    }
  });

  const result = safeParseJson(response.text);
  if (!result || !result.programs) throw new Error("Program assembly logic failed.");
  return result;
};

export const modifyProgramWithAI = async (
  instruction: string,
  data: ProgramData,
  media?: ExtractionMedia[]
): Promise<{ programs: DailyProgram[], explanation: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `Data: ${JSON.stringify(data)}` },
    { text: `Instruction: ${instruction}` }
  ];
  if (media) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { 
      responseMimeType: "application/json"
    }
  });

  return safeParseJson(response.text);
};
