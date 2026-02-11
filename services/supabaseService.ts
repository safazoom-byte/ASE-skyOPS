
import { createClient } from '@supabase/supabase-js';
import { Flight, Staff, ShiftConfig, DailyProgram, LeaveRequest, IncomingDuty } from '../types';

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

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

      const [fRes, sRes, shRes, pRes, lRes, iRes] = await Promise.all([
        supabase.from('flights').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('programs').select('*'),
        supabase.from('leave_requests').select('*'),
        supabase.from('incoming_duties').select('*')
      ]);

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
        })),
        leaveRequests: (lRes.data || []).map(l => ({
          id: l.id,
          staffId: l.staff_id,
          startDate: l.start_date,
          endDate: l.end_date,
          type: l.leave_type
        })),
        incomingDuties: (iRes.data || []).map(i => ({
          id: i.id,
          staffId: i.staff_id,
          date: i.date,
          shiftEndTime: i.shift_end_time
        }))
      };
    } catch (e) { 
      console.error("Database fetch failure:", e);
      return null; 
    }
  },

  async upsertFlight(f: Flight) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('flights').upsert({
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
  },

  async upsertStaff(s: Staff) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('staff').upsert({
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
  },

  async upsertShift(s: ShiftConfig) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('shifts').upsert({
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
  },

  async upsertLeave(l: LeaveRequest) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('leave_requests').upsert({
      id: l.id,
      user_id: session.user.id,
      staff_id: l.staffId,
      start_date: l.startDate,
      end_date: l.endDate,
      leave_type: l.type
    });
  },

  async upsertLeaves(leaves: LeaveRequest[]) {
    if (!supabase || leaves.length === 0) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('leave_requests').upsert(
      leaves.map(l => ({
        id: l.id,
        user_id: session.user.id,
        staff_id: l.staffId,
        start_date: l.startDate,
        end_date: l.endDate,
        leave_type: l.type
      }))
    );
  },

  async upsertIncomingDuty(d: IncomingDuty) {
    if (!supabase) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('incoming_duties').upsert({
      id: d.id,
      user_id: session.user.id,
      staff_id: d.staffId,
      date: d.date,
      shift_end_time: d.shiftEndTime
    });
  },

  async upsertIncomingDuties(duties: IncomingDuty[]) {
    if (!supabase || duties.length === 0) return;
    const session = await auth.getSession();
    if (!session) return;
    await supabase.from('incoming_duties').upsert(
      duties.map(d => ({
        id: d.id,
        user_id: session.user.id,
        staff_id: d.staffId,
        date: d.date,
        shift_end_time: d.shiftEndTime
      }))
    );
  },

  async savePrograms(programs: DailyProgram[]) {
    if (!supabase || programs.length === 0) return;
    const session = await auth.getSession();
    if (!session) return;

    const datesToOverwrite = programs.map(p => p.dateString).filter(Boolean);
    
    if (datesToOverwrite.length > 0) {
      await supabase.from('programs')
        .delete()
        .eq('user_id', session.user.id)
        .in('date_string', datesToOverwrite);
    }

    await supabase.from('programs').insert(
      programs.map(p => ({
        user_id: session.user.id, 
        day: p.day, 
        date_string: p.dateString || '',
        assignments: p.assignments || [], 
        off_duty: p.offDuty || []
      }))
    );
  },

  async deleteFlight(id: string) { if (supabase) await supabase.from('flights').delete().eq('id', id); },
  async deleteStaff(id: string) { if (supabase) await supabase.from('staff').delete().eq('id', id); },
  async deleteShift(id: string) { if (supabase) await supabase.from('shifts').delete().eq('id', id); },
  async deleteLeave(id: string) { if (supabase) await supabase.from('leave_requests').delete().eq('id', id); },
  async deleteIncomingDuty(id: string) { if (supabase) await supabase.from('incoming_duties').delete().eq('id', id); }
};
