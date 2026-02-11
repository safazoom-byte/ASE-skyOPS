
export type Skill = 'Ramp' | 'Load Control' | 'Lost and Found' | 'Shift Leader' | 'Operations';
export type ProficiencyLevel = 'Yes' | 'No';
export type StaffCategory = 'Local' | 'Roster';
export type WorkPattern = 'Continuous (Roster)' | '5 Days On / 2 Off';
export type LeaveType = 'Day off' | 'Annual leave' | 'Lieu leave' | 'Sick leave' | 'Roster leave' | 'NIL';

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
  priority: 'High' | 'Standard' | 'Low';
  aircraftType?: string;
}

export interface Staff {
  id: string;
  name: string;
  initials: string; 
  type: StaffCategory;
  workPattern: WorkPattern;
  // Flattened for direct DB/Excel mapping
  isRamp: boolean;
  isShiftLeader: boolean;
  isOps: boolean;
  isLoadControl: boolean;
  isLostFound: boolean;
  powerRate: number; // 50-100
  maxShiftsPerWeek: number;
  workFromDate?: string;
  workToDate?: string;
}

export interface IncomingDuty {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD of when the shift ended
  shiftEndTime: string; // HH:mm
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
}

export interface ShiftConfig {
  id: string;
  day: number; // 0-6
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm
  pickupDayOffset?: number; 
  minStaff: number;
  maxStaff: number;
  targetPower?: number; 
  roleCounts?: Partial<Record<Skill, number>>; 
  flightIds?: string[]; 
  description?: string;
}

export interface Assignment {
  id: string;
  staffId: string;
  flightId: string;
  role: string; // Changed from Skill to string to support combined roles like 'SL+LC'
  shiftId?: string; 
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
  leaveRequests?: LeaveRequest[];
  incomingDuties?: IncomingDuty[];
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
