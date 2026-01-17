
export type Skill = 'Ramp' | 'Load Control' | 'Lost and Found' | 'Shift Leader' | 'Operations';
export type ProficiencyLevel = 'Yes' | 'No';
export type StaffCategory = 'Local' | 'Roster';
export type WorkPattern = 'Continuous (Roster)' | '5 Days On / 2 Off';
export type LeaveType = 'DAY OFF' | 'ROSTER LEAVE' | 'LIEU LEAVE' | 'ANNUAL LEAVE' | 'SICK LEAVE' | 'NIL';

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
  date: string; // Mandatory date string (YYYY-MM-DD)
  day: number; // Offset for roster logic
  type: 'Arrival' | 'Departure' | 'Turnaround';
}

export interface Staff {
  id: string;
  name: string;
  initials: string; 
  type: StaffCategory;
  workPattern: WorkPattern;
  skillRatings: Partial<Record<Skill, ProficiencyLevel>>;
  powerRate: number; // 50-100
  maxShiftsPerWeek: number;
  workFromDate?: string;
  workToDate?: string;
}

export interface ShiftConfig {
  id: string;
  day: number; // 0-6 (The target operational day offset)
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm
  pickupDayOffset?: number; 
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
  coveringStaffId?: string; // ID of the person being covered
}

export interface OffDutyRecord {
  staffId: string;
  type: LeaveType;
}

export interface DailyProgram {
  day: number;
  dateString?: string;
  assignments: Assignment[];
  offDuty?: OffDutyRecord[];
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
