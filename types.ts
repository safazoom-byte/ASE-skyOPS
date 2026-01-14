export type Skill = 'Ramp' | 'Load Control' | 'Lost and Found' | 'Shift Leader' | 'Operations';

export interface StaffSkill {
  skill: Skill;
  qualified: boolean;
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
  skillRatings: Partial<Record<Skill, boolean>>;
  maxShiftsPerWeek: number;
}

export interface ShiftConfig {
  id: string;
  day: number; // 0-6
  pickupTime: string; // HH:mm
  minStaff: number;
  maxStaff: number;
  roleCounts?: Partial<Record<Skill, number>>; // New: specific counts per role
  flightIds?: string[]; // Manually selected flights for this shift
}

export interface Assignment {
  id: string;
  staffId: string;
  flightId: string;
  role: Skill;
  shiftId?: string; // Link to the defined shift
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

// Global Type Declarations for Environment Variables and Custom Window Objects
/* Define the AIStudio interface to ensure identical property types across declarations */
export interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    /* Use the named AIStudio interface instead of an inline type to resolve modifier and type conflicts */
    aistudio: AIStudio;
  }
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
}