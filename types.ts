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
declare global {
  /**
   * AIStudio interface for handling API key selection logic.
   * Defined inside declare global to ensure it matches the property type 
   * of window.aistudio in the global execution context.
   */
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    /**
     * Augmented Window interface to include aistudio.
     * Marked as optional to maintain compatibility with environment-provided types 
     * and avoid "identical modifiers" errors.
     */
    aistudio?: AIStudio;
  }

  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
}
