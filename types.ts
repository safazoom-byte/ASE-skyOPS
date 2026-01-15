
export type Skill = 'Ramp' | 'Load Control' | 'Lost and Found' | 'Shift Leader' | 'Operations';
export type ProficiencyLevel = 'Yes' | 'No';
export type StaffCategory = 'Local' | 'Roster';

export interface StaffSkill {
  skill: Skill;
  level: ProficiencyLevel;
}

export interface Flight {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  sta?: string; 
  std?: string; 
  day: number; 
  type: 'Arrival' | 'Departure' | 'Turnaround';
}

export interface Staff {
  id: string;
  name: string;
  initials?: string;
  type: StaffCategory;
  skillRatings: Partial<Record<Skill, ProficiencyLevel>>;
  powerRate: number; // 50-100
  maxShiftsPerWeek: number;
  workFromDate?: string;
  workToDate?: string;
}

export interface ShiftConfig {
  id: string;
  day: number; // 0-6
  pickupTime: string; // HH:mm
  endTime?: string; // HH:mm
  minStaff: number;
  maxStaff: number;
  targetPower?: number; // Combined power sum of assigned staff
  roleCounts?: Partial<Record<Skill, number>>; 
  flightIds?: string[]; 
}

export interface Assignment {
  id: string;
  staffId: string;
  flightId: string;
  role: Skill;
  shiftId?: string; 
}

export interface DailyProgram {
  day: number;
  dateString?: string;
  assignments: Assignment[];
}

export interface ProgramData {
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  programs: DailyProgram[];
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }

  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
}