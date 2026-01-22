
import { createClient } from '@supabase/supabase-js';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill, ProficiencyLevel } from '../types.ts';

const SUPABASE_URL = (process.env as any).SUPABASE_URL;
const SUPABASE_ANON_KEY = (process.env as any).SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("SKY_OPS_CRITICAL: Supabase environment variables are missing. Authentication and Cloud Sync will be disabled.");
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const auth = {
  async signUp(email: string, pass: string) {
    if (!supabase) return { error: new Error("Supabase is not configured. Check Vercel environment variables.") };
    return await supabase.auth.signUp({ email, password: pass });
  },
  async signIn(email: string, pass: string) {
    if (!supabase) return { error: new Error("Supabase is not configured. Check Vercel environment variables.") };
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },
  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
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
      const [flights, staff, shifts, programs] = await Promise.all([
        supabase.from('flights').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('programs').select('*')
      ]);

      return {
        flights: flights.data || [],
        staff: (staff.data || []).map(s => {
          // Reconstruct skillRatings object from flat columns for the UI
          const skillRatings: Partial<Record<Skill, ProficiencyLevel>> = { ...(s.skill_ratings || {}) };
          
          const checkBool = (val: any) => (val === true || val === 'true' || val === 'Yes' || val === '1');

          skillRatings['Shift Leader'] = checkBool(s.is_shift_leader) ? 'Yes' : 'No';
          skillRatings['Operations'] = checkBool(s.is_operations) ? 'Yes' : 'No';
          skillRatings['Ramp'] = checkBool(s.is_ramp) ? 'Yes' : 'No';
          skillRatings['Load Control'] = checkBool(s.is_load_control) ? 'Yes' : 'No';
          skillRatings['Lost and Found'] = checkBool(s.is_lost_found) ? 'Yes' : 'No';

          return {
            id: s.id,
            name: s.name || 'Unknown Agent',
            initials: s.initials || '??',
            type: s.type || 'Local',
            workPattern: s.work_pattern || '5 Days On / 2 Off',
            powerRate: s.power_rate || 75,
            skillRatings,
            workFromDate: s.work_from_date,
            workToDate: s.work_to_date,
            maxShiftsPerWeek: 5
          };
        }),
        shifts: shifts.data || [],
        programs: (programs.data || []).map(p => ({
          day: p.roster_day,
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

  async upsertFlight(flight: Flight) {
    if (!supabase) return;
    const dbData = {
      id: flight.id,
      flight_number: flight.flightNumber,
      origin: flight.from,
      destination: flight.to,
      sta: flight.sta,
      std: flight.std,
      flight_date: flight.date,
      flight_type: flight.type
    };
    await supabase.from('flights').upsert(dbData);
  },

  async deleteFlight(id: string) {
    if (!supabase) return;
    await supabase.from('flights').delete().eq('id', id);
  },

  async upsertStaff(s: Staff) {
    if (!supabase) return;
    const checkYes = (val: any) => val === 'Yes';
    const dbData = {
      id: s.id,
      name: s.name,
      initials: s.initials,
      type: s.type,
      work_pattern: s.workPattern,
      power_rate: s.powerRate,
      skill_ratings: s.skillRatings || {},
      work_from_date: s.workFromDate,
      work_to_date: s.workToDate,
      is_shift_leader: checkYes(s.skillRatings?.['Shift Leader']),
      is_operations: checkYes(s.skillRatings?.['Operations']),
      is_ramp: checkYes(s.skillRatings?.['Ramp']),
      is_load_control: checkYes(s.skillRatings?.['Load Control']),
      is_lost_found: checkYes(s.skillRatings?.['Lost and Found'])
    };
    await supabase.from('staff').upsert(dbData);
  },

  async deleteStaff(id: string) {
    if (!supabase) return;
    await supabase.from('staff').delete().eq('id', id);
  },

  async truncateStaff() {
    if (!supabase) return;
    await supabase.from('staff').delete().neq('id', 'TRUNCATE_PLACEHOLDER');
  },

  async upsertShift(s: ShiftConfig) {
    if (!supabase) return;
    const dbData = {
      id: s.id,
      pickup_date: s.pickupDate,
      pickup_time: s.pickupTime,
      end_date: s.endDate,
      end_time: s.endTime,
      min_staff: s.minStaff,
      max_staff: s.maxStaff,
      role_counts: s.roleCounts || {},
      flight_ids: s.flightIds || []
    };
    await supabase.from('shifts').upsert(dbData);
  },

  async deleteShift(id: string) {
    if (!supabase) return;
    await supabase.from('shifts').delete().eq('id', id);
  },

  async savePrograms(programs: DailyProgram[]) {
    if (!supabase) return;
    await supabase.from('programs').delete().neq('roster_day', -1);
    const dbData = programs.map(p => ({
      roster_day: p.day,
      date_string: p.dateString,
      assignments: p.assignments || [],
      off_duty: p.offDuty || []
    }));
    await supabase.from('programs').insert(dbData);
  }
};
