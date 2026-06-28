import { createClient } from "@supabase/supabase-js";
import {
  Flight,
  Staff,
  ShiftConfig,
  DailyProgram,
  LeaveRequest,
  IncomingDuty,
  ProgramVersion,
  UserProfile,
  AuditLog,
  Airport,
} from "../types";

const SUPABASE_URL =
  (import.meta as any).env.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const isConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 5;

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const auth = {
  async signUp(email: string, pass: string) {
    const client = supabase;
    if (!client) return { error: new Error("Cloud Uplink Not Configured") };
    return await client.auth.signUp({ email, password: pass });
  },
  async signIn(email: string, pass: string) {
    const client = supabase;
    if (!client) return { error: new Error("Cloud Uplink Not Configured") };
    return await client.auth.signInWithPassword({ email, password: pass });
  },
  async signOut() {
    const client = supabase;
    if (!client) return;
    return await client.auth.signOut();
  },
  async getSession(): Promise<any> {
    const client = supabase;
    if (!client) return null;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        console.warn("Session fetch error:", error.message);
        if (error.message.toLowerCase().includes("refresh token")) {
          await client.auth.signOut().catch(() => {});
          
          if (typeof window !== "undefined") {
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
                  localStorage.removeItem(key);
                }
              }
            } catch (e) {
              // ignore localStorage errors
            }
          }
        }
        return null;
      }
      return data?.session || null;
    } catch (e) {
      console.warn("getSession exception:", e);
      return null;
    }
  },
  onAuthStateChange(callback: (session: any) => void) {
    const client = supabase;
    if (!client) return () => {};
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => subscription.unsubscribe();
  },
};

export const db = {
  async getMutationContext() {
    const session = await auth.getSession();
    if (!session) return null;
    const profile = await this.getUserProfile();
    return {
      userId: session.user.id,
      airportId: profile?.airport_id || null,
      matchCol: profile?.airport_id ? "airport_id" : "user_id",
      matchVal: profile?.airport_id ? profile.airport_id : session.user.id,
    };
  },

  async fetchAll() {
    const client = supabase;
    if (!client) return null;
    try {
      const session = await auth.getSession();
      if (!session) return null;
      
      const profile = await this.getUserProfile();
      const matchCol = profile?.airport_id ? "airport_id" : "user_id";
      const matchVal = profile?.airport_id ? profile.airport_id : session.user.id;

      const [fRes, sRes, shRes, pRes, lRes, iRes] = await Promise.all([
        client.from("flights").select("*").eq(matchCol, matchVal),
        client.from("staff").select("*").eq(matchCol, matchVal),
        client.from("shifts").select("*").eq(matchCol, matchVal),
        client.from("programs").select("*").eq(matchCol, matchVal),
        client
          .from("leave_requests")
          .select("*")
          .eq(matchCol, matchVal),
        client
          .from("incoming_duties")
          .select("*")
          .eq(matchCol, matchVal),
      ]);

      return {
        flights: (fRes.data || []).map((f: any) => ({
          id: f.id,
          flightNumber: f.flight_number,
          from: f.origin,
          to: f.destination,
          sta: f.sta,
          std: f.std,
          eta: f.eta,
          etd: f.etd,
          date: f.flight_date,
          type: f.flight_type || "Turnaround",
          day: f.day || 0,
          priority: "Standard" as "High" | "Standard" | "Low",
        })),
        staff: (sRes.data || []).map((s: any) => {
          let workPattern = s.work_pattern;
          let rosterPeriods = undefined;
          if (workPattern && workPattern.includes("|")) {
            const parts = workPattern.split("|");
            workPattern = parts[0];
            try {
              rosterPeriods = JSON.parse(parts[1]);
            } catch (e) {}
          }
          return {
            id: s.id,
            name: s.name,
            initials: s.initials,
            type: s.type,
            workPattern: workPattern,
            isRamp: !!s.is_ramp,
            isShiftLeader: !!s.is_shift_leader,
            isOps: !!s.is_operations,
            isLoadControl: !!s.is_load_control,
            isLostFound: !!s.is_lost_found,
            isLabour: !!s.is_labour,
            isSecurity: !!s.is_security,
            isDriver: !!s.is_driver,
            isAccountant: !!s.is_accountant,
            powerRate: s.power_rate || 75,
            maxShiftsPerWeek: s.max_shifts_per_week || 5,
            workFromDate: s.work_from_date,
            workToDate: s.work_to_date,
            rosterPeriods,
            isActive: s.is_active !== false,
          };
        }),
        shifts: (shRes.data || []).map((s: any) => ({
          id: s.id,
          day: s.day || 0,
          pickupDate: s.pickup_date,
          pickupTime: s.pickup_time,
          endDate: s.end_date,
          endTime: s.end_time,
          minStaff: s.min_staff || 1,
          maxStaff: s.max_staff || 10,
          roleCounts: s.role_counts || {},
          flightIds: s.flight_ids || [],
        })),
        programs: (pRes.data || []).map((p: any) => {
          const rawOffDuty = p.off_duty || [];
          const notesHacks = rawOffDuty.filter((od: any) => od.staffId === "NOTES_HACK");
          const actualOffDuty = rawOffDuty.filter((od: any) => od.staffId !== "NOTES_HACK");
          
          let notes = p.notes || {};
          if (notesHacks.length > 0) {
             notes = notesHacks[0].data || notes;
          }

          return {
            day: p.day,
            dateString: p.date_string,
            assignments: p.assignments || [],
            offDuty: actualOffDuty,
            notes: notes,
          };
        }),
        leaveRequests: (lRes.data || []).map((l: any) => ({
          id: l.id,
          staffId: l.staff_id,
          startDate: l.start_date,
          endDate: l.end_date,
          type: l.leave_type,
        })),
        incomingDuties: (iRes.data || []).map((i: any) => ({
          id: i.id,
          staffId: i.staff_id,
          date: i.date,
          shiftEndTime: i.shift_end_time,
        })),
      };
    } catch (e) {
      console.error("Database fetch failure:", e);
      return null;
    }
  },

  async upsertFlight(f: Flight) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("flights").upsert({
        id: f.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        flight_number: f.flightNumber,
        origin: f.from,
        destination: f.to,
        sta: f.sta || null,
        std: f.std || null,
        eta: f.eta || null,
        etd: f.etd || null,
        flight_date: f.date,
        flight_type: f.type,
        day: f.day,
      });
    } catch (e) {
      console.warn("Failed to upsert flight:", e);
    }
  },

  async upsertStaff(s: Staff) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("staff").upsert({
        id: s.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        name: s.name,
        initials: s.initials,
        type: s.type,
        work_pattern:
          s.type === "Roster" && s.rosterPeriods
            ? `${s.workPattern}|${JSON.stringify(s.rosterPeriods)}`
            : s.workPattern,
        is_ramp: s.isRamp,
        is_shift_leader: s.isShiftLeader,
        is_operations: s.isOps,
        is_load_control: s.isLoadControl,
        is_lost_found: s.isLostFound,
        is_labour: s.isLabour,
        is_security: s.isSecurity,
        is_driver: s.isDriver,
        is_accountant: s.isAccountant,
        power_rate: s.powerRate,
        max_shifts_per_week: s.maxShiftsPerWeek,
        work_from_date: s.workFromDate || null,
        work_to_date: s.workToDate || null,
        is_active: s.isActive !== false,
      });
    } catch (e) {
      console.warn("Failed to upsert staff:", e);
    }
  },

  async upsertShift(s: ShiftConfig) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("shifts").upsert({
        id: s.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        day: s.day,
        pickup_date: s.pickupDate,
        pickup_time: s.pickupTime,
        end_date: s.endDate,
        end_time: s.endTime,
        min_staff: s.minStaff || 1,
        max_staff: s.maxStaff || 10,
        role_counts: s.roleCounts || {},
        flight_ids: s.flightIds || [],
      });
    } catch (e) {
      console.warn("Failed to upsert shift:", e);
    }
  },

  async upsertLeave(l: LeaveRequest) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("leave_requests").upsert({
        id: l.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        staff_id: l.staffId,
        start_date: l.startDate,
        end_date: l.endDate,
        leave_type: l.type,
      });
    } catch (e) {
      console.warn("Failed to upsert leave:", e);
    }
  },

  async upsertLeaves(leaves: LeaveRequest[]) {
    const client = supabase;
    if (!client || leaves.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("leave_requests").upsert(
        leaves.map((l) => ({
          id: l.id,
          user_id: ctx.userId,
        airport_id: ctx.airportId,
          staff_id: l.staffId,
          start_date: l.startDate,
          end_date: l.endDate,
          leave_type: l.type,
        })),
      );
    } catch (e) {
      console.warn("Failed to upsert leaves:", e);
    }
  },

  async upsertIncomingDuty(d: IncomingDuty) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("incoming_duties").upsert({
        id: d.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        staff_id: d.staffId,
        date: d.date,
        shift_end_time: d.shiftEndTime,
      });
    } catch (e) {
      console.warn("Failed to upsert incoming duty:", e);
    }
  },

  async upsertIncomingDuties(duties: IncomingDuty[]) {
    const client = supabase;
    if (!client || duties.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("incoming_duties").upsert(
        duties.map((d) => ({
          id: d.id,
          user_id: ctx.userId,
        airport_id: ctx.airportId,
          staff_id: d.staffId,
          date: d.date,
          shift_end_time: d.shiftEndTime,
        })),
      );
    } catch (e) {
      console.warn("Failed to upsert incoming duties:", e);
    }
  },

  async savePrograms(programs: DailyProgram[]) {
    const client = supabase;
    if (!client || programs.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;

    const datesToOverwrite = programs.map((p) => p.dateString).filter(Boolean);

    try {
      if (datesToOverwrite.length > 0) {
        await client
          .from("programs")
          .delete()
          .eq(ctx.matchCol, ctx.matchVal)
          .in("date_string", datesToOverwrite);
      }

      await client.from("programs").insert(
        programs.map((p) => {
          const offDutyToSave = [
              ...(p.offDuty || []),
              { staffId: "NOTES_HACK", type: "NIL", data: p.notes || {} }
          ];

          return {
            user_id: ctx.userId,
            airport_id: ctx.airportId,
            day: p.day,
            date_string: p.dateString || "",
            assignments: p.assignments || [],
            off_duty: offDutyToSave,
          };
        }),
      );
    } catch (e) {
      console.warn("Failed to save programs:", e);
    }
  },

  async deleteFlight(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("flights").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete flight:", e);
      }
    }
  },
  async deleteStaff(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("staff").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete staff:", e);
      }
    }
  },
  async deleteShift(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("shifts").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete shift:", e);
      }
    }
  },
  async deleteLeave(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("leave_requests").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete leave:", e);
      }
    }
  },
  async deleteIncomingDuty(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("incoming_duties").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete incoming duty:", e);
      }
    }
  },

  async saveProgramVersion(v: ProgramVersion) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("program_versions").upsert({
        id: v.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        version_number: v.versionNumber,
        name: v.name,
        created_at: v.createdAt,
        period_start: v.periodStart,
        period_end: v.periodEnd,
        programs: v.programs,
        station_health: v.stationHealth,
        is_auto_save: v.isAutoSave || false,
      });
    } catch (e) {
      console.warn("Failed to save program version:", e);
    }
  },

  async getProgramVersions(): Promise<ProgramVersion[]> {
    const client = supabase;
    if (!client) return [];
    const ctx = await this.getMutationContext();
    if (!ctx) return [];
    const { data } = await client
      .from("program_versions")
      .select("*")
      .eq(ctx.matchCol, ctx.matchVal)
      .order("created_at", { ascending: false });
    if (!data) return [];
    return data.map((v: any) => ({
      id: v.id,
      versionNumber: v.version_number,
      name: v.name,
      createdAt: v.created_at,
      periodStart: v.period_start,
      periodEnd: v.period_end,
      programs: v.programs,
      stationHealth: v.station_health,
      isAutoSave: v.is_auto_save,
    }));
  },

  async deleteProgramVersion(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client
          .from("program_versions")
          .delete()
          .eq("id", id)
          .eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete program version:", e);
      }
    }
  },

  async getUserProfile(): Promise<UserProfile | null> {
    const session = await auth.getSession();
    if (!session) return null;

    // Fallback to local storage if no DB
    const localProfiles = JSON.parse(
      localStorage.getItem("skyops_user_profiles") || "[]",
    );
    let profile = localProfiles.find(
      (p: UserProfile) => p.id === session.user.id,
    );

    if (supabase) {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (data) {
          profile = {
            id: data.id,
            email: data.email,
            role: data.role || "planner",
            airport_id: data.airport_id,
            aiDailyLimit: data.ai_daily_limit ?? 5,
            aiWeeklyLimit: data.ai_weekly_limit ?? 20,
            aiMonthlyLimit: data.ai_monthly_limit ?? 50,
            maxStaff: data.max_staff ?? 50,
            maxShifts: data.max_shifts ?? 20,
            isActive: data.is_active ?? true,
            companyLogo: data.company_logo ?? "",
            skyopsLogo: data.skyops_logo ?? "",
            preparedBy: data.prepared_by ?? "",
            revisedBy: data.revised_by ?? "",
          };
        } else {
          // Check if a profile was pre-created by email
          const { data: emailData } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("email", session.user.email)
            .single();
          if (emailData) {
            // Update the ID to match the real auth ID
            await supabase
              .from("user_profiles")
              .delete()
              .eq("id", emailData.id); // Delete the temp one
            await supabase.from("user_profiles").insert({
              ...emailData,
              id: session.user.id, // Insert with real ID
            });
            profile = {
              id: session.user.id,
              email: emailData.email,
              role: emailData.role || "planner",
              airport_id: emailData.airport_id,
              aiDailyLimit: emailData.ai_daily_limit ?? 5,
              aiWeeklyLimit: emailData.ai_weekly_limit ?? 20,
              aiMonthlyLimit: emailData.ai_monthly_limit ?? 50,
              maxStaff: emailData.max_staff ?? 50,
              maxShifts: emailData.max_shifts ?? 20,
              isActive: emailData.is_active ?? true,
              companyLogo: emailData.company_logo ?? "",
              skyopsLogo: emailData.skyops_logo ?? "",
              preparedBy: emailData.prepared_by ?? "",
              revisedBy: emailData.revised_by ?? "",
            };
          }
        }
      } catch (e) {
        console.warn("Could not fetch profile from DB, using local");
      }
    }

    // If no profile exists, create a default one (first user is master)
    if (!profile) {
      const isFirstUser = localProfiles.length === 0;
      profile = {
        id: session.user.id,
        email: session.user.email,
        role: isFirstUser ? "master" : "planner",
        aiDailyLimit: 5,
        aiWeeklyLimit: 20,
        aiMonthlyLimit: 50,
        maxStaff: 50,
        maxShifts: 20,
        isActive: true,
        companyLogo: "",
        skyopsLogo: "",
        preparedBy: "Operation Control Center",
        revisedBy: "",
      };
      localProfiles.push(profile);
      try {
        localStorage.setItem(
          "skyops_user_profiles",
          JSON.stringify(localProfiles),
        );
      } catch (e) {}

      if (supabase) {
        try {
          const { error } = await supabase.from("user_profiles").insert({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            ai_daily_limit: profile.aiDailyLimit,
            ai_weekly_limit: profile.aiWeeklyLimit,
            ai_monthly_limit: profile.aiMonthlyLimit,
            max_staff: profile.maxStaff,
            max_shifts: profile.maxShifts,
            is_active: profile.isActive,
            company_logo: profile.companyLogo,
            skyops_logo: profile.skyopsLogo,
            prepared_by: profile.preparedBy,
            revised_by: profile.revisedBy,
          });
          if (error) console.error("Could not insert profile to DB:", error);
        } catch (e) {
          console.warn("Could not insert profile to DB", e);
        }
      }
    }
    return profile;
  },

  async getAllUserProfiles(): Promise<UserProfile[]> {
    const localProfiles = JSON.parse(
      localStorage.getItem("skyops_user_profiles") || "[]",
    );
    if (supabase) {
      try {
        const profile = await this.getUserProfile();
        let query = supabase.from("user_profiles").select("*");
        if (profile?.role === "admin" && profile?.airport_id) {
          query = query.eq("airport_id", profile.airport_id);
        }
        
        const { data, error } = await query;
        if (error) {
          console.error("Supabase select error:", error);
        }
        if (data) {
          const dbProfiles = data.map((d: any) => ({
            id: d.id,
            email: d.email,
            role: d.role,
            airport_id: d.airport_id,
            aiDailyLimit: d.ai_daily_limit,
            aiWeeklyLimit: d.ai_weekly_limit,
            aiMonthlyLimit: d.ai_monthly_limit,
            maxStaff: d.max_staff,
            maxShifts: d.max_shifts,
            isActive: d.is_active,
            companyLogo: d.company_logo ?? "",
            skyopsLogo: d.skyops_logo ?? "",
            preparedBy: d.prepared_by ?? "",
            revisedBy: d.revised_by ?? "",
          }));

          // Merge local profiles that aren't in the DB yet
          const missingInDb = localProfiles.filter(
            (lp: UserProfile) =>
              !dbProfiles.some((dp: UserProfile) => dp.email === lp.email),
          );

          // Auto-sync missing legacy users to DB
          if (missingInDb.length > 0) {
            for (const lp of missingInDb) {
              try {
                await supabase.from("user_profiles").upsert({
                  id: lp.id,
                  email: lp.email,
                  role: lp.role,
                  airport_id: lp.airport_id,
                  ai_daily_limit: lp.aiDailyLimit,
                  ai_weekly_limit: lp.aiWeeklyLimit,
                  ai_monthly_limit: lp.aiMonthlyLimit,
                  max_staff: lp.maxStaff,
                  max_shifts: lp.maxShifts,
                  is_active: lp.isActive,
                  company_logo: lp.companyLogo,
                  skyops_logo: lp.skyopsLogo,
                  prepared_by: lp.preparedBy,
                  revised_by: lp.revisedBy,
                });
              } catch (e) {
                console.warn("Auto-sync failed for user", lp.email, e);
              }
            }
          }

          return [...dbProfiles, ...missingInDb];
        }
      } catch (e) {
        console.warn("Could not fetch profiles from DB", e);
      }
    }
    return localProfiles;
  },

  async updateUserProfile(profile: UserProfile) {
    const localProfiles = JSON.parse(
      localStorage.getItem("skyops_user_profiles") || "[]",
    );
    const index = localProfiles.findIndex(
      (p: UserProfile) => p.id === profile.id,
    );
    if (index >= 0) {
      localProfiles[index] = profile;
    } else {
      localProfiles.push(profile);
    }
    
    try {
        localStorage.setItem("skyops_user_profiles", JSON.stringify(localProfiles));
    } catch (e) {
        console.warn("Could not save to localStorage (quota exceeded?), still trying DB...");
    }

    if (supabase) {
      try {
        const { error } = await supabase.from("user_profiles").upsert({
          id: profile.id,
          email: profile.email,
          role: profile.role,
          airport_id: profile.airport_id,
          ai_daily_limit: profile.aiDailyLimit,
          ai_weekly_limit: profile.aiWeeklyLimit,
          ai_monthly_limit: profile.aiMonthlyLimit,
          max_staff: profile.maxStaff,
          max_shifts: profile.maxShifts,
          is_active: profile.isActive,
          company_logo: profile.companyLogo,
          skyops_logo: profile.skyopsLogo,
          prepared_by: profile.preparedBy,
          revised_by: profile.revisedBy,
        });
        if (error) console.error("Could not update profile in DB:", error);
      } catch (e) {
        console.warn("Could not update profile in DB", e);
      }
    }
  },

  async deleteUserProfile(id: string) {
    const localProfiles = JSON.parse(
      localStorage.getItem("skyops_user_profiles") || "[]",
    );
    const updated = localProfiles.filter((p: UserProfile) => p.id !== id);
    localStorage.setItem("skyops_user_profiles", JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from("user_profiles").delete().eq("id", id);
      } catch (e) {
        console.warn("Could not delete profile from DB");
      }
    }
  },

  async createUserProfile(profile: UserProfile) {
    const localProfiles = JSON.parse(
      localStorage.getItem("skyops_user_profiles") || "[]",
    );
    localProfiles.push(profile);
    localStorage.setItem("skyops_user_profiles", JSON.stringify(localProfiles));

    if (supabase) {
      try {
        const { error } = await supabase.from("user_profiles").insert({
          id: profile.id,
          email: profile.email,
          role: profile.role,
          airport_id: profile.airport_id,
          ai_daily_limit: profile.aiDailyLimit,
          ai_weekly_limit: profile.aiWeeklyLimit,
          ai_monthly_limit: profile.aiMonthlyLimit,
          max_staff: profile.maxStaff,
          max_shifts: profile.maxShifts,
          is_active: profile.isActive,
          company_logo: profile.companyLogo,
          skyops_logo: profile.skyopsLogo,
          prepared_by: profile.preparedBy,
          revised_by: profile.revisedBy,
        });
        if (error) console.error("Supabase insert error:", error);
      } catch (e) {
        console.warn("Could not insert profile to DB", e);
      }
    }
  },

  async logAction(
    actionType: AuditLog["actionType"],
    entityType: AuditLog["entityType"],
    entityId: string,
    details: string,
  ) {
    const session = await auth.getSession();
    if (!session) return;
    const profile = await this.getUserProfile();

    const log: AuditLog = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      userEmail: session.user.email,
      actionType,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };

    const localLogs = JSON.parse(
      localStorage.getItem("skyops_audit_logs") || "[]",
    );
    localLogs.unshift(log);
    localStorage.setItem(
      "skyops_audit_logs",
      JSON.stringify(localLogs.slice(0, 1000)),
    ); // keep last 1000

    if (supabase) {
      try {
        await supabase.from("audit_logs").insert({
          id: log.id,
          user_id: log.userId,
          airport_id: profile?.airport_id,
          user_email: log.userEmail,
          action_type: log.actionType,
          entity_type: log.entityType,
          entity_id: log.entityId,
          details: log.details,
          created_at: log.createdAt,
        });
      } catch (e) {
        console.warn("Could not insert audit log to DB");
      }
    }
  },

  async getAirports(): Promise<Airport[]> {
    if (!supabase) return [];
    try {
      const { data } = await supabase.from("airports").select("*").order("name");
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async getAirlines(): Promise<import("../types").Airline[]> {
    if (!supabase) return [];
    try {
      const profile = await this.getUserProfile();
      let query = supabase.from("airlines").select("*").order("name");
      if (profile?.airport_id) {
         query = query.eq("airport_id", profile.airport_id);
      }
      const { data } = await query;
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async addAirline(airline: Omit<import("../types").Airline, "id">): Promise<void> {
    if (!supabase) return;
    try {
      const profile = await this.getUserProfile();
      await supabase.from("airlines").insert({
        name: airline.name,
        iata_code: airline.iata_code,
        airport_id: profile?.airport_id,
      });
    } catch (e) {
      console.warn("Could not insert airline");
    }
  },

  async updateAirline(id: string, airline: Partial<import("../types").Airline>): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from("airlines").update(airline).eq("id", id);
    } catch (e) {
      console.warn("Could not update airline");
    }
  },

  async deleteAirline(id: string): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from("airlines").delete().eq("id", id);
    } catch (e) {
      console.warn("Could not delete airline");
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (supabase) {
      try {
        const profile = await this.getUserProfile();
        let query = supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
          
        if (profile?.role === "admin" && profile?.airport_id) {
          query = query.eq("airport_id", profile.airport_id);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            userEmail: d.user_email,
            actionType: d.action_type,
            entityType: d.entity_type,
            entityId: d.entity_id,
            details: d.details,
            createdAt: d.created_at,
          }));
        }
      } catch (e) {
        console.warn("Could not fetch audit logs from DB");
      }
    }
    return JSON.parse(localStorage.getItem("skyops_audit_logs") || "[]");
  },

  async getAIGenerationCount(
    userId: string,
    period: "daily" | "weekly" | "monthly",
  ): Promise<number> {
    const logs = await this.getAuditLogs();
    const now = new Date();
    let startDate = new Date();

    if (period === "daily") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    return logs.filter(
      (l) =>
        l.userId === userId &&
        l.actionType === "GENERATE_AI" &&
        new Date(l.createdAt) >= startDate,
    ).length;
  },

  async exportDatabase() {
    const data = await this.fetchAll();
    if (!data) return null;
    const versions = await this.getProgramVersions();
    
    const exportData = {
      ...data,
      program_versions: versions,
      exportDate: new Date().toISOString()
    };
    return exportData;
  },

  async importDatabase(jsonData: string) {
    try {
      const data = JSON.parse(jsonData);
      
      // If there are flights, shifts, etc. save them
      if (data.flights && data.flights.length > 0) {
        for (const f of data.flights) await this.upsertFlight(f);
      }
      if (data.staff && data.staff.length > 0) {
        for (const s of data.staff) await this.upsertStaff(s);
      }
      if (data.shifts && data.shifts.length > 0) {
        for (const s of data.shifts) await this.upsertShift(s);
      }
      if (data.leave_requests && data.leave_requests.length > 0) {
        await this.upsertLeaves(data.leave_requests);
      }
      if (data.incoming_duties && data.incoming_duties.length > 0) {
        await this.upsertIncomingDuties(data.incoming_duties);
      }
      if (data.programs && data.programs.length > 0) {
        await this.savePrograms(data.programs);
      }
      if (data.program_versions && data.program_versions.length > 0) {
        for (const v of data.program_versions) await this.saveProgramVersion(v);
      }
      
      this.logAction("IMPORT", "DATABASE", "all", "Imported full database backup");
      return true;
    } catch (e) {
      console.error("Failed to import database", e);
      return false;
    }
  }
};
