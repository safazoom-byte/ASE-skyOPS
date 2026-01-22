
import { createClient } from '@supabase/supabase-js';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("SKY_OPS_CRITICAL: Supabase environment variables are missing. Cloud Sync disabled.");
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const auth = {
  async signUp(email: string, pass: string) {
    if (!supabase) return { error: new Error("Supabase is not configured.") };
    return await supabase.auth.signUp({ email, password: pass });
  },
  async signIn(email: string, pass: string) {
    if (!supabase) return { error: new Error("Supabase is not configured.") };
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },
  async signOut() {
    if (!supabase) return;
    return await supabase.auth.signOut();
  },
  async getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthStateChange(callback: (session: any) => void) {
    if (!supabase) return () => {};
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => subscription.unsubscribe();
  }
};

export const db = {
  async fetchAll() {
    if (!supabase) return null;
    try {
      const [fRes, sRes, shRes, pRes] = await Promise.all([
        supabase.from('flights').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('programs').select('*')
      ]);

      return {
        flights: (fRes.data || []).map(f => ({
          ...f,
          flightNumber: f.flight_number,
          from: f.origin,
          to: f.destination,
          sta: f.sta,
          std: f.std,
          date: f.flight_date,
          type: f.flight_type
        })),
        staff: (sRes.data || []).map(s => ({
          ...s,
          id: s.id,
          name: s.name,
          initials: s.initials,
          type: s.type,
          workPattern: s.work_pattern,
          isRamp: !!s.is_ramp,
          isShiftLeader: !!s.is_shift_leader,
          isOps: !!s.is_ops,
          isLoadControl: !!s.is_load_control,
          isLostFound: !!s.is_lost_found,
          powerRate: s.power_rate,
          maxShiftsPerWeek: s.max_shifts_per_week,
          workFromDate: s.work_from_date,
          workToDate: s.work_to_date
        })),
        shifts: (shRes.data || []).map(s => ({
          ...s,
          pickupDate: s.pickup_date,
          pickupTime: s.pickup_time,
          endDate: s.end_date,
          endTime: s.end_time,
          minStaff: s.min_staff,
          maxStaff: s.max_staff,
          roleCounts: s.role_counts || {},
          flightIds: s.flight_ids || []
        })),
        programs: (pRes.data || []).map(p => ({
          ...p,
          dateString: p.date_string,
          assignments: p.assignments || [],
          offDuty: p.off_duty || []
        }))
      };
    } catch (e) {
      console.error("Supabase Fetch Error:", e);
      return null;
    }
  },

  async upsertFlight(f: Flight) {
    if (!supabase) return;
    const { error } = await supabase.from('flights').upsert({
      id: f.id,
      flight_number: f.flightNumber,
      origin: f.from,
      destination: f.to,
      sta: f.sta,
      std: f.std,
      flight_date: f.date,
      flight_type: f.type,
      day: f.day
    });
    if (error) {
       console.error("Supabase Flight Upsert Error:", error);
       throw error;
    }
  },

  async upsertStaff(s: Staff) {
    if (!supabase) return;
    const { error } = await supabase.from('staff').upsert({
      id: s.id,
      name: s.name,
      initials: s.initials,
      type: s.type,
      work_pattern: s.workPattern,
      is_ramp: s.isRamp,
      is_shift_leader: s.isShiftLeader,
      is_ops: s.isOps,
      is_load_control: s.isLoadControl,
      is_lost_found: s.isLostFound,
      power_rate: s.powerRate,
      max_shifts_per_week: s.maxShiftsPerWeek,
      work_from_date: s.workFromDate,
      work_to_date: s.workToDate
    });
    if (error) {
       console.error("Supabase Staff Upsert Error:", error);
       throw error;
    }
  },

  async upsertShift(s: ShiftConfig) {
    if (!supabase) return;
    const { error } = await supabase.from('shifts').upsert({
      id: s.id,
      day: s.day,
      pickup_date: s.pickupDate,
      pickup_time: s.pickupTime,
      end_date: s.endDate,
      end_time: s.endTime,
      min_staff: s.minStaff,
      max_staff: s.maxStaff,
      role_counts: s.roleCounts,
      flight_ids: s.flightIds
    });
    if (error) {
       console.error("Supabase Shift Upsert Error:", error);
       throw error;
    }
  },

  async savePrograms(programs: DailyProgram[]) {
    if (!supabase) return;
    try {
      await supabase.from('programs').delete().neq('id', '0'); 
      const { error } = await supabase.from('programs').insert(
        programs.map(p => ({
          day: p.day,
          date_string: p.dateString,
          assignments: p.assignments,
          off_duty: p.offDuty
        }))
      );
      if (error) throw error;
    } catch (e) {
      console.error("Supabase Program Save Error:", e);
    }
  },

  async deleteFlight(id: string) { if (supabase) await supabase.from('flights').delete().eq('id', id); },
  async deleteStaff(id: string) { if (supabase) await supabase.from('staff').delete().eq('id', id); },
  async deleteShift(id: string) { if (supabase) await supabase.from('shifts').delete().eq('id', id); }
};
