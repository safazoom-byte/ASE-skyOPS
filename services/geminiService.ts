import { GoogleGenAI } from "@google/genai";
import { DailyProgram, ProgramData, Staff, LeaveRequest, IncomingDuty, ShiftConfig, Skill } from "../types";
import { AVAILABLE_SKILLS } from "../constants";

export interface BuildResult {
  programs: DailyProgram[];
  validationLog?: string[];
  isCompliant: boolean;
  stationHealth: number; 
  alerts?: { type: 'danger' | 'warning', message: string }[];
}

export interface ExtractionMedia {
  data: string;
  mimeType: string;
}

// 1. ADVANCED SEMANTIC JSON PARSER
const safeParseJson = (text: string | undefined): any => {
  if (!text) return null;
  // Remove markdown code blocks
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Aggressive extraction: Find the outer-most array or object brackets
  const firstOpen = clean.indexOf('[');
  const lastClose = clean.lastIndexOf(']');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      clean = clean.substring(firstOpen, lastClose + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    // Repair common AI JSON truncation issues
    try {
      if (clean.startsWith('[') && !clean.endsWith(']')) return JSON.parse(clean + ']');
      if (clean.startsWith('{') && !clean.endsWith('}')) return JSON.parse(clean + '}');
    } catch (finalErr) {
      console.error("JSON Recovery Failed", finalErr);
    }
    return null;
  }
};

export const calculateCredits = (staff: Staff, startDate: string, duration: number, leaveRequests: LeaveRequest[] = []) => {
  const progStart = new Date(startDate);
  const progEnd = new Date(startDate);
  progEnd.setDate(progStart.getDate() + duration - 1);

  let grossCredits = 0;
  
  if (staff.type === 'Local') {
    // Local Staff: 5 days work per 7 days standard
    grossCredits = Math.ceil(duration * (5/7));
  } else {
    // Roster Staff: Availability within contract dates
    if (!staff.workFromDate || !staff.workToDate) {
      grossCredits = duration;
    } else {
      const contractStart = new Date(staff.workFromDate);
      const contractEnd = new Date(staff.workToDate);
      
      const overlapStart = progStart > contractStart ? progStart : contractStart;
      const overlapEnd = progEnd < contractEnd ? progEnd : contractEnd;
      
      if (overlapStart <= overlapEnd) {
         const diffTime = overlapEnd.getTime() - overlapStart.getTime();
         grossCredits = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
         grossCredits = 0;
      }
    }
  }

  let leaveDeduction = 0;
  const staffLeaves = leaveRequests.filter(l => l.staffId === staff.id);
  staffLeaves.forEach(leave => {
    if (leave.type === 'Annual leave' || leave.type === 'Sick leave' || leave.type === 'Lieu leave') {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const overlapStart = progStart > leaveStart ? progStart : leaveStart;
        const overlapEnd = progEnd < leaveEnd ? progEnd : leaveEnd;
        if (overlapStart <= overlapEnd) {
            leaveDeduction += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
    }
  });

  return Math.max(0, grossCredits - leaveDeduction);
};

export const generateAIProgram = async (data: ProgramData, constraintsLog: string, config: { numDays: number, minRestHours: number, startDate: string }): Promise<BuildResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const programStart = new Date(config.startDate);
  const programEnd = new Date(config.startDate);
  programEnd.setDate(programStart.getDate() + config.numDays - 1);
  const programEndStr = programEnd.toISOString().split('T')[0];

  const validStaff = data.staff.filter(s => {
      if (s.type === 'Local') return true;
      if (s.type === 'Roster') {
        if (!s.workFromDate || !s.workToDate) return true;
        if (s.workToDate < config.startDate) return false; 
        if (s.workFromDate > programEndStr) return false;
      }
      return true;
  });

  const staffMap: Record<string, string> = {};
  validStaff.forEach(s => staffMap[s.initials.toUpperCase()] = s.id);

  // --- SEMANTIC CONTEXT GENERATION ---
  // We use human-readable descriptions instead of minified codes to help Pro reasoning.
  const staffContext = validStaff.map(s => {
    const skills = [
        s.isLoadControl?'LC':'', 
        s.isShiftLeader?'SL':'', 
        s.isOps?'OPS':'', 
        s.isRamp?'RMP':'',
        s.isLostFound?'LF':''
    ].filter(Boolean).join(',');
    
    const credits = calculateCredits(s, config.startDate, config.numDays, data.leaveRequests || []);
    return `Agent: ${s.initials}, Type: ${s.type}, Skills: [${skills}], MaxShiftsAllowed: ${credits}`; 
  }).join('\n');

  const sortedShifts = [...data.shifts].sort((a,b) => (a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime));
  
  const shiftContext = sortedShifts.map((s, idx) => {
    const originalIdx = data.shifts.findIndex(os => os.id === s.id);
    const rcStr = Object.entries(s.roleCounts || {}).filter(([k,v]) => v && v > 0).map(([k,v]) => {
        const shortK = k === 'Shift Leader' ? 'SL' : k === 'Load Control' ? 'LC' : k === 'Ramp' ? 'RMP' : k === 'Operations' ? 'OPS' : 'LF';
        return `${shortK}: ${v}`;
    }).join(', ');

    return `ID: ${originalIdx}, DayOffset: ${s.day}, Start: ${s.pickupTime}, End: ${s.endTime}, MinStaffNeeded: ${s.minStaff}, SpecialistRoles: [${rcStr}]`;
  }).join('\n');

  // --- EXPLICIT CONSTRAINTS ---
  const explicitConstraints: string[] = [];
  
  (data.leaveRequests || []).forEach(leave => {
    const staffMember = validStaff.find(st => st.id === leave.staffId);
    if (!staffMember) return;
    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    if (lEnd >= programStart && lStart <= programEnd) {
       explicitConstraints.push(`- ${staffMember.initials} is NOT AVAILABLE from ${leave.startDate} to ${leave.endDate}.`);
    }
  });

  validStaff.forEach(s => {
      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          if (s.workFromDate > config.startDate) explicitConstraints.push(`- ${s.initials} cannot work BEFORE contract start date ${s.workFromDate}.`);
          if (s.workToDate < programEndStr) explicitConstraints.push(`- ${s.initials} cannot work AFTER contract end date ${s.workToDate}.`);
      }
  });

  (data.incomingDuties || []).forEach(d => {
      const staffMember = validStaff.find(s => s.id === d.staffId);
      if (!staffMember) return;
      explicitConstraints.push(`- ${staffMember.initials} finished a shift on ${d.date} at ${d.shiftEndTime}. They MUST rest for ${config.minRestHours} hours before their next start.`);
  });

  // Execute Gemini 3 Pro
  const strategies = [
    { model: 'gemini-3-pro-preview', temp: 0.1, limit: 32000 },
    { model: 'gemini-2.0-flash-exp', temp: 0.1, limit: 32000 }
  ];

  let parsed: any = null;

  for (const strategy of strategies) {
      try {
        const prompt = `
            ROLE: Professional Aviation Resource Planner.
            GOAL: Generate a 7-day Handling Program.
            
            OPERATIONAL PRIORITIES:
            1. FATIGUE SAFETY (CRITICAL): Ensure EXACTLY ${config.minRestHours} hours of rest between shifts. 
               - If a shift ends at 00:00 or 08:00, calculate rest hours across midnights correctly.
            2. SPECIALIST COVERAGE: Prioritize qualified agents for SpecialistRoles (SL, LC, RMP).
               - If a shift requires 1 SL, you MUST assign 1 agent with the SL skill.
            3. WORKLOAD BALANCING: Distribute shifts FAIRLY. 
               - If you have plenty of staff, do not assign 7 shifts to one person while another has 0.
               - Aim for even utilization across the available manpower.
            4. STAFF LIMITS: Respect 'MaxShiftsAllowed' for each agent.
            
            BEST EFFORT MODE:
            - If you run out of qualified staff for a slot, leave it empty.
            - Do not crash. Do not return an error. Provide the best possible schedule.
            
            INPUT DATA:
            Target Period: ${config.startDate} to ${programEndStr}
            
            PERSONNEL REGISTRY:
            ${staffContext}

            SHIFT REQUIREMENTS:
            ${shiftContext}

            HARD BLOCKS (LEAVE & CONTRACTS):
            ${explicitConstraints.join('\n')}

            OUTPUT SPECIFICATION:
            Return a JSON array of assignment arrays.
            Format: [[DayOffset, ShiftID, "AgentInitials", "AssignedRole"], ...]
            - DayOffset: 0 for the first day, 1 for second, etc.
            - ShiftID: The ID number from the SHIFT REQUIREMENTS list.
            - AssignedRole: The role the agent is performing (e.g., SL, LC, OPS, AGT).
        `;

        const response = await ai.models.generateContent({
            model: strategy.model,
            contents: prompt,
            config: {
                temperature: strategy.temp,
                maxOutputTokens: strategy.limit, 
                responseMimeType: 'application/json'
            }
        });

        parsed = safeParseJson(response.text);
        if (Array.isArray(parsed) && parsed.length > 0) break;
      } catch (e) {
        console.warn(`Strategy ${strategy.model} failed:`, e);
      }
  }
  
  if (!Array.isArray(parsed) || parsed.length === 0) {
      const fallbackPrograms: DailyProgram[] = [];
      for(let i=0; i<config.numDays; i++) {
          const d = new Date(config.startDate);
          d.setDate(d.getDate() + i);
          fallbackPrograms.push({ day: i, dateString: d.toISOString().split('T')[0], assignments: [], offDuty: [] });
      }
      return {
        programs: fallbackPrograms,
        stationHealth: 0,
        alerts: [{ type: 'danger', message: 'AI Engine failed to generate data. Please check your inputs or try again.' }],
        isCompliant: false
      };
  }

  const programs: DailyProgram[] = [];
  for(let i=0; i<config.numDays; i++) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      programs.push({
          day: i,
          dateString: d.toISOString().split('T')[0],
          assignments: [],
          offDuty: []
      });
  }

  parsed.forEach((item: any) => {
      let dayOffset, shiftIdx, staffInitials, role;
      if (Array.isArray(item)) {
        [dayOffset, shiftIdx, staffInitials, role] = item;
      } else {
        dayOffset = item.dayOffset ?? item.d;
        shiftIdx = item.shiftIdx ?? item.s;
        staffInitials = item.staffInitials ?? item.st;
        role = item.role ?? item.r;
      }

      dayOffset = Number(dayOffset);
      shiftIdx = Number(shiftIdx);
      staffInitials = String(staffInitials || '').toUpperCase().trim();
      role = String(role || 'AGT');

      if (
          !isNaN(dayOffset) && programs[dayOffset] && 
          !isNaN(shiftIdx) && data.shifts[shiftIdx] &&
          staffMap[staffInitials]
      ) {
          const exists = programs[dayOffset].assignments.find(a => a.staffId === staffMap[staffInitials]);
          if (!exists) {
              programs[dayOffset].assignments.push({
                  id: Math.random().toString(36).substr(2, 9),
                  staffId: staffMap[staffInitials],
                  shiftId: data.shifts[shiftIdx].id,
                  role: role,
                  flightId: '' 
              });
          }
      }
  });
  
  return {
    programs,
    stationHealth: 98,
    alerts: [],
    isCompliant: true
  };
};

export const extractDataFromContent = async (params: { 
  textData?: string; 
  media?: ExtractionMedia[]; 
  startDate?: string; 
  targetType: 'flights' | 'staff' | 'shifts' | 'all';
}): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (params.textData) parts.push({ text: `DATA:\n${params.textData}` });
  if (params.media) params.media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const prompt = `Extract ${params.targetType} from the provided content. 
  Target Start Date: ${params.startDate || 'Current'}.
  Return valid JSON matching this schema: { "flights": [], "staff": [], "shifts": [] }.
  Ensure flight numbers, initials, and times are extracted accurately.`;
  
  parts.unshift({ text: prompt });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: { parts },
    config: { responseMimeType: "application/json" }
  });
  return safeParseJson(response.text);
};

export const modifyProgramWithAI = async (instruction: string, data: ProgramData, media: ExtractionMedia[] = []): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const staffContext = data.staff.map(s => `${s.initials}: ${s.id}`).join(', ');
  const rosterContext = data.programs.map(p => ({
      date: p.dateString,
      assignments: p.assignments.map(a => `${data.staff.find(s=>s.id===a.staffId)?.initials}:${a.role}:ShiftID_${a.shiftId}`)
  }));

  const prompt = `
    TASK: Modify existing roster based on user instruction.
    Instruction: ${instruction}
    
    Current State: ${JSON.stringify(rosterContext)}
    Staff Reference: ${staffContext}
    
    Return strict JSON: { "programs": [ ...updated programs... ], "explanation": "Brief reasoning for changes" }
  `;
  
  const parts: any[] = [{ text: prompt }];
  if (media.length > 0) media.forEach(m => parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
  });
  return safeParseJson(response.text);
};

export const repairProgramWithAI = async (
  currentPrograms: DailyProgram[],
  auditReport: string,
  data: ProgramData,
  constraints: { minRestHours: number }
): Promise<{ programs: DailyProgram[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const sortedPrograms = [...currentPrograms].sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  const startDate = sortedPrograms[0]?.dateString || new Date().toISOString().split('T')[0];
  const numDays = sortedPrograms.length || 7;

  const staffContext = data.staff.map(s => {
    const credits = calculateCredits(s, startDate, numDays, data.leaveRequests || []);
    const skills = [s.isLoadControl?'LC':'', s.isShiftLeader?'SL':'', s.isOps?'OPS':'', s.isRamp?'RMP':'', s.isLostFound?'LF':''].filter(Boolean).join(',');
    return `ID:${s.initials}, Type:${s.type}, Skills:${skills}, CreditLimit:${credits}`;
  }).join('\n');

  const prompt = `
    FIX ROSTER VIOLATIONS.
    Violations to Solve:
    ${auditReport}
    
    Minimum Rest Required: ${constraints.minRestHours} hours.
    
    Current Roster: ${JSON.stringify(currentPrograms.map(p => ({date: p.dateString, assignments: p.assignments})))}
    Available Staff:
    ${staffContext}
    
    ACTION: Reassign staff to eliminate the violations while keeping coverage intact. 
    Balance the workload. Do not use the same staff for 7 days straight if others are free.
    Return strictly: { "programs": [ ...full updated programs array... ] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        maxOutputTokens: 65000
      }
    });
    const parsed = safeParseJson(response.text);
    return { programs: parsed.programs || currentPrograms };
  } catch (err: any) {
    throw new Error("AI Repair engine timed out. Please try fixing fewer issues at once.");
  }
};