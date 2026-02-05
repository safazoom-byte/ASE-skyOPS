
import { createClient } from '@supabase/supabase-js';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';

/**
 * Robust environment variable retrieval for Vite/Vercel environments.
 */
const getEnv = (key: string): string => {
  try {
    // 1. Check process.env (Vite 'define' or Node env)
    // 2. Check import.meta.env (Standard Vite)
    // 3. Check window global
    const val = (window as any).process?.env?.[key] || 
                (import.meta as any).env?.[`VITE_${key}`] || 
                (window as any)[key] || 
                "";
    return typeof val === 'string' ? val : "";
  } catch { return ""; }
};

const SUPABASE_URL = getEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY');

const isConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 5;

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const auth = {
  async signUp(email: string, pass: string) {
    if (!supabase) return { error: new Error("Cloud Uplink Not Configured") };
    return await supabase.auth.signUp({ email, password: pass });
  },
  async signIn(email: string, pass: string) {
    if (!supabase) return { error: new Error("Cloud Uplink Not Configured") };
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },
  async signOut() {
    if (!supabase) return;
    return await supabase.auth.signOut();
  },
  async getSession() {
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch { return null; }
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
      const session = await auth.getSession();
      if (!session) return null;

      // Parallel fetching for high performance
      const [fRes, sRes, shRes, pRes] = await Promise.all([
        supabase.from('flights').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('programs').select('*')
      ]);

      if (fRes.error) console.error("Flights fetch error:", fRes.error);
      if (sRes.error) console.error("Staff fetch error:", sRes.error);

      return {
        flights: (fRes.data || []).map(f => ({
          id: f.id,
          flightNumber: f.flight_number,
          from: f.origin,
          to: f.destination,
          sta: f.sta,
          std: f.std,
          date: f.flight_date,
          type: f.flight_type || 'Turnaround',
          day: f.day || 0,
          priority: 'Standard'
        })),
        staff: (sRes.data || []).map(s => ({
          id: s.id,
          name: s.name,
          initials: s.initials,
          type: s.type,
          workPattern: s.work_pattern,
          isRamp: !!s.is_ramp,
          isShiftLeader: !!s.is_shift_leader,
          isOps: !!s.is_operations,
          isLoadControl: !!s.is_load_control,
          isLostFound: !!s.is_lost_found,
          powerRate: s.power_rate || 75,
          maxShiftsPerWeek: s.max_shifts_per_week || 5,
          workFromDate: s.work_from_date,
          workToDate: s.work_to_date
        })),
        shifts: (shRes.data || []).map(s => ({
          id: s.id,
          day: s.day || 0,
          pickupDate: s.pickup_date,
          pickupTime: s.pickup_time,
          endDate: s.end_date,
          endTime: s.end_time,
          minStaff: s.min_staff || 1,
          maxStaff: s.max_staff || 10,
          roleCounts: s.role_counts || {},
          flightIds: s.flight_ids || []
        })),
        programs: (pRes.data || []).map(p => ({
          day: p.day,
          dateString: p.date_string,
          assignments: p.assignments || [],
          offDuty: p.off_duty || []
        }))
      };
    } catch (e) { 
      console.error("Critical database fetch failure:", e);
      return null; 
    }
  },

  async upsertFlight(f: Flight) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('flights').upsert({
      id: f.id, 
      user_id: session.user.id, 
      flight_number: f.flightNumber, 
      origin: f.from,
      destination: f.to, 
      sta: f.sta || null, 
      std: f.std || null, 
      flight_date: f.date,
      flight_type: f.type, 
      day: f.day
    });
    if (error) console.error("Flight upsert error:", error);
  },

  async upsertStaff(s: Staff) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('staff').upsert({
      id: s.id, 
      user_id: session.user.id, 
      name: s.name, 
      initials: s.initials,
      type: s.type, 
      work_pattern: s.workPattern, 
      is_ramp: s.isRamp,
      is_shift_leader: s.isShiftLeader, 
      is_operations: s.isOps,
      is_load_control: s.isLoadControl, 
      is_lost_found: s.isLostFound,
      power_rate: s.powerRate, 
      max_shifts_per_week: s.maxShiftsPerWeek,
      work_from_date: s.workFromDate || null, 
      work_to_date: s.workToDate || null
    });
    if (error) console.error("Staff upsert error:", error);
  },

  async upsertShift(s: ShiftConfig) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    // Fix: Access correct camelCase properties from ShiftConfig interface for snake_case DB columns
    const { error } = await supabase.from('shifts').upsert({
      id: s.id, 
      user_id: session.user.id, 
      day: s.day, 
      pickup_date: s.pickupDate,
      pickup_time: s.pickupTime, 
      end_date: s.endDate, 
      end_time: s.endTime,
      min_staff: s.minStaff || 1, 
      max_staff: s.maxStaff || 10,
      role_counts: s.roleCounts || {}, 
      flight_ids: s.flightIds || []
    });
    if (error) console.error("Shift upsert error:", error);
  },

  async savePrograms(programs: DailyProgram[]) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    try {
      // Clean old entries first to avoid duplicates
      await supabase.from('programs').delete().eq('user_id', session.user.id);
      const { error } = await supabase.from('programs').insert(
        programs.map(p => ({
          user_id: session.user.id, 
          day: p.day, 
          date_string: p.dateString || '',
          assignments: p.assignments || [], 
          off_duty: p.offDuty || []
        }))
      );
      if (error) console.error("Programs save error:", error);
    } catch (e) {
      console.error("Failed to save programs:", e);
    }
  },

  async deleteFlight(id: string) { if (supabase) await supabase.from('flights').delete().eq('id', id); },
  async deleteStaff(id: string) { if (supabase) await supabase.from('staff').delete().eq('id', id); },
  async deleteShift(id: string) { if (supabase) await supabase.from('shifts').delete().eq('id', id); }
};
