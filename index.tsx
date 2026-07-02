import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import "mobile-drag-drop/default.css";

// Initialize mobile drag-and-drop polyfill
polyfill({
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});

// Prevent scrolling while dragging on mobile
window.addEventListener("touchmove", function () {}, { passive: false });

// Global error handlers for Supabase Invalid Refresh Token stuck state
window.addEventListener("error", (e) => {
  if (e.message?.includes("Invalid Refresh Token")) {
    e.preventDefault();
    localStorage.clear();
    window.location.reload();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("Invalid Refresh Token") || e.reason?.message?.includes("Refresh Token Not Found")) {
    e.preventDefault();
    localStorage.clear();
    window.location.reload();
  }
});

import {
  Plane,
  Users,
  Clock,
  LayoutDashboard,
  X,
  Activity,
  CalendarDays,
  Zap,
  Loader2,
  LogOut,
  Compass,
  Terminal,
  Trash2,
  Plus,
  Briefcase,
  Moon,
  Lock,
  Search,
  Calendar as CalendarIcon,
  ChevronRight,
  ShieldAlert,
  Eraser,
  Sparkles,
  Shield,
  Settings,
  Cloud,
  Layers,
  Timer,
  CheckCircle2,
  PieChart,
  PlaneTakeoff,
} from "lucide-react";
import "./style.css";

import {
  Flight,
  Staff,
  DailyProgram,
  ShiftConfig,
  LeaveRequest,
  LeaveType,
  IncomingDuty,
  ProgramVersion,
  UserProfile,
  normalizeFlightNumber,
  Assignment,
} from "./types";
import { FlightManager } from "./components/FlightManager";
import { StaffManager } from "./components/StaffManager";
import { ShiftManager } from "./components/ShiftManager";
import { ProgramDisplay } from "./components/ProgramDisplay";
import { ProgramChat } from "./components/ProgramChat";
import { ProgramScanner } from "./components/ProgramScanner";
import { GithubSync } from "./components/GithubSync";
import { CapacityForecast } from "./components/CapacityForecast";
import { StationStatistics } from "./components/StationStatistics";
import { CommandCenter } from "./components/CommandCenter";
import { AirlineManager } from "./components/AirlineManager";
import { Auth } from "./components/Auth";
import { SkyOpsLogo } from "./components/Logo";
import { PreRosterModal } from "./components/PreRosterModal";
import { generateAIProgram } from "./services/geminiService";
import { db, supabase, auth } from "./services/supabaseService";
import { Session } from "@supabase/supabase-js";
import { ManualAssignment } from "./types";

const UI_PREF_KEYS = {
  START_DATE: "skyops_pref_start_date",
  END_DATE: "skyops_pref_end_date",
  REST_HOURS: "skyops_pref_min_rest",
  DURATION: "skyops_pref_duration",
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "flights"
    | "staff"
    | "shifts"
    | "program"
    | "statistics"
    | "command"
  >("dashboard");
  const [cloudStatus, setCloudStatus] = useState<
    "connected" | "offline" | "unconfigured" | "error"
  >("unconfigured");
  const [cloudError, setCloudError] = useState<string>("");

  const [startDate, setStartDate] = useState<string>(
    () =>
      localStorage.getItem(UI_PREF_KEYS.START_DATE) ||
      new Date().toISOString().split("T")[0],
  );
  const [programDuration, setProgramDuration] = useState<number>(() =>
    parseInt(localStorage.getItem(UI_PREF_KEYS.DURATION) || "7"),
  );
  const [endDate, setEndDate] = useState<string>(
    () =>
      localStorage.getItem(UI_PREF_KEYS.END_DATE) ||
      new Date().toISOString().split("T")[0],
  );
  const [minRestHours, setMinRestHours] = useState<number>(() =>
    parseInt(localStorage.getItem(UI_PREF_KEYS.REST_HOURS) || "12"),
  );

  // Initialize data
  const [flights, setFlights] = useState<Flight[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [programs, setPrograms] = useState<DailyProgram[]>([]);
  const [manualAssignments, setManualAssignments] = useState<
    ManualAssignment[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [incomingDuties, setIncomingDuties] = useState<IncomingDuty[]>([]);

  const [stationHealth, setStationHealth] = useState<number>(100);
  const [alerts, setAlerts] = useState<
    { type: "danger" | "warning"; message: string }[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreRosterModalOpen, setIsPreRosterModalOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<
    "flights" | "staff" | "shifts" | "all"
  >("all");
  const [notification, setNotification] = useState<string | null>(null);

  // Incoming Duties Logic (Rest Log)
  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<
    string[]
  >([]);
  const [incomingHour, setIncomingHour] = useState("06");
  const [incomingMin, setIncomingMin] = useState("00");
  const [incomingDate, setIncomingDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [incomingSearchTerm, setIncomingSearchTerm] = useState("");
  const [showIncomingShifts, setShowIncomingShifts] = useState(false);

  // Leave Registry Logic (Off-Duty)
  const [quickLeaveStaffIds, setQuickLeaveStaffIds] = useState<string[]>([]);
  const [quickLeaveStartDate, setQuickLeaveStartDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [quickLeaveEndDate, setQuickLeaveEndDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [quickLeaveType, setQuickLeaveType] = useState<LeaveType>("Day off");
  const [quickLeaveSearchTerm, setQuickLeaveSearchTerm] = useState("");

  // --- PREFERENCE PERSISTENCE EFFECTS ---
  useEffect(() => {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(start.getDate() + (programDuration - 1));
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, programDuration]);

  useEffect(() => {
    if (!programs.length || !startDate || !endDate) return;
    
    // Check if we need to backfill missing dates (e.g., if AI skipped a day)
    let hasMissing = false;
    const start = new Date(`${startDate}T12:00:00Z`);
    const end = new Date(`${endDate}T12:00:00Z`);
    const dateSet = new Set(programs.map(p => p.dateString));
    
    let current = new Date(start);
    while (current <= end) {
      const dStr = current.toISOString().split("T")[0];
      if (!dateSet.has(dStr)) {
        hasMissing = true;
        break;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    
    if (hasMissing) {
      setPrograms(prev => {
        const newPrograms = [...prev];
        let d = new Date(start);
        let idx = 0;
        while (d <= end) {
          const dStr = d.toISOString().split("T")[0];
          if (!newPrograms.some(p => p.dateString === dStr)) {
            newPrograms.push({
              day: idx,
              dateString: dStr,
              assignments: []
            });
          }
          d.setUTCDate(d.getUTCDate() + 1);
          idx++;
        }
        return newPrograms.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
      });
    }
  }, [programs, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem(UI_PREF_KEYS.START_DATE, startDate);
    localStorage.setItem(UI_PREF_KEYS.END_DATE, endDate);
    localStorage.setItem(UI_PREF_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(UI_PREF_KEYS.DURATION, programDuration.toString());
  }, [startDate, endDate, minRestHours, programDuration]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    let mounted = true;
    const syncCloudData = async () => {
      if (!supabase) {
        setCloudStatus("unconfigured");
        return;
      }
      try {
        const cloudData = await db.fetchAll();
        if (mounted && cloudData) {
          if (cloudData.flights?.length) setFlights(cloudData.flights);
          if (cloudData.staff?.length) setStaff(cloudData.staff);
          if (cloudData.shifts?.length) setShifts(cloudData.shifts);
          if (cloudData.programs?.length) setPrograms(cloudData.programs);
          if (cloudData.leaveRequests?.length)
            setLeaveRequests(cloudData.leaveRequests);
          if (cloudData.incomingDuties?.length)
            setIncomingDuties(cloudData.incomingDuties);
          setCloudStatus("connected");
        }
      } catch (e: any) {
        if (mounted) {
          setCloudStatus("error");
          if (e.message && e.message.includes("Failed to fetch")) {
            setCloudError("Network Error: Adblocker/VPN blocking connection");
          } else {
            setCloudError(e.message || "Unknown error");
          }
        }
      }
    };
    const checkAuth = async () => {
      if (!supabase) {
        setIsInitializing(false);
        setCloudStatus("unconfigured");
        return;
      }
      try {
        const s = await auth.getSession();
        if (mounted) {
          setSession(s);
          if (s) {
            db.getUserProfile().then((profile) => {
              if (mounted) setUserProfile(profile);
            });
            syncCloudData(); // Run in background without blocking initialization
          } else {
            setCloudStatus("unconfigured"); // Default to unconfigured instead of offline if logged out
          }
          setIsInitializing(false);
        }
      } catch (e: any) {
        if (mounted) {
          setCloudStatus("error");
          if (e.message && e.message.includes("Failed to fetch")) {
            setCloudError("Network Error: Could not connect to Supabase. This is usually caused by an Adblocker (like Brave Shields), VPN, or your network blocking access. Please disable your adblocker or try a different network.");
          } else {
            setCloudError(e.message || "Session fetch failed");
          }
          setIsInitializing(false);
        }
      }
    };
    checkAuth();

    // Safety fallback: if auth takes too long or hangs, force initialization to finish
    const fallbackTimer = setTimeout(() => {
      if (mounted && isInitializing) {
        console.warn("Initialization timed out, forcing render.");
        setIsInitializing(false);
      }
    }, 8000);

    let unsubscribe = () => {};
    if (supabase) {
      unsubscribe = auth.onAuthStateChange(async (s) => {
        if (mounted) {
          setSession(s);
          if (s) {
            db.getUserProfile().then((profile) => {
              if (mounted) setUserProfile(profile);
            });
            syncCloudData();
          } else {
            setUserProfile(null);
            setCloudStatus("unconfigured");
          }
        }
      });
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && supabase) {
        const s = await auth.getSession();
        if (s) syncCloudData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const confirmGenerateProgram = async (
    manualAssignments: ManualAssignment[] = [],
  ) => {
    setIsPreRosterModalOpen(false);

    if (userProfile) {
      if (!userProfile.isActive) {
        alert(
          "Your account has been frozen by the Master User. You cannot generate programs.",
        );
        return;
      }
      const dailyCount = await db.getAIGenerationCount(userProfile.id, "daily");
      if (dailyCount >= userProfile.aiDailyLimit) {
        alert(
          `Quota Reached: You have hit your daily limit of ${userProfile.aiDailyLimit} AI generations. Please contact your Master User to increase your limits.`,
        );
        return;
      }
      const weeklyCount = await db.getAIGenerationCount(
        userProfile.id,
        "weekly",
      );
      if (weeklyCount >= userProfile.aiWeeklyLimit) {
        alert(
          `Quota Reached: You have hit your weekly limit of ${userProfile.aiWeeklyLimit} AI generations.`,
        );
        return;
      }
      const monthlyCount = await db.getAIGenerationCount(
        userProfile.id,
        "monthly",
      );
      if (monthlyCount >= userProfile.aiMonthlyLimit) {
        alert(
          `Quota Reached: You have hit your monthly limit of ${userProfile.aiMonthlyLimit} AI generations.`,
        );
        return;
      }
    }

    const activeShifts = shifts.filter(
      (s) => s.pickupDate >= startDate && s.pickupDate <= endDate,
    );
    const eligibleStaff = staff.filter((s) => {
      if (s.type === "Local") return true;
      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
        return s.rosterPeriods.some(
          (p) => p.start <= endDate && p.end >= startDate,
        );
      }
      return (
        !s.workFromDate ||
        !s.workToDate ||
        (s.workFromDate <= endDate && s.workToDate >= startDate)
      );
    });
    if (activeShifts.length === 0) {
      alert(`No shifts found for period.`);
      return;
    }
    setIsGenerating(true);
    try {
      setManualAssignments(manualAssignments);
      const result = await generateAIProgram(
        {
          flights,
          staff: eligibleStaff,
          shifts: activeShifts,
          programs: [],
          leaveRequests,
          incomingDuties,
          manualAssignments,
        },
        "",
        { numDays: programDuration, minRestHours, startDate },
      );

      // Save current program as a version before overwriting if it has assignments
      if (programs.some((p) => p.assignments.length > 0)) {
        let versions: ProgramVersion[] = [];
        if (supabase) {
          try {
             versions = await db.getProgramVersions() || [];
          } catch(e) {}
        }
        
        const newVersion: ProgramVersion = {
          id: crypto.randomUUID(),
          versionNumber: versions.length + 1,
          name: `Auto-Save before AI Gen (${new Date().toLocaleTimeString()})`,
          createdAt: new Date().toISOString(),
          periodStart: startDate,
          periodEnd: endDate,
          programs: JSON.parse(JSON.stringify(programs)),
          stationHealth,
          isAutoSave: true,
        };
        let updatedVersions = [newVersion, ...versions];
        if (updatedVersions.length > 10) {
          updatedVersions = updatedVersions.slice(0, 10);
        }
        if (supabase) {
          await db.saveProgramVersion(newVersion);
        }
      }

      setPrograms(prev => {
        const merged = [...prev];
        result.programs.forEach((newP: any) => {
           const idx = merged.findIndex(p => p.dateString === newP.dateString);
           if (idx !== -1) merged[idx] = newP;
           else merged.push(newP);
        });
        return merged.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
      });
      setStationHealth(result.stationHealth);
      setAlerts(result.alerts || []);
      if (supabase) {
        await db.savePrograms(result.programs);
        await db.logAction(
          "GENERATE_AI",
          "PROGRAM",
          "AI_GEN",
          `Generated ${programDuration}-day program for ${activeShifts.length} shifts`,
        );
      }
      setActiveTab("program");
    } catch (err: any) {
      console.warn("Generation Error:", err);
      let msg = err.message || "Engine failure.";
      if (msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        msg =
          "Network Error: Could not connect to the AI service. This is usually caused by an Adblocker, VPN, or your network blocking access to Google's API. Please disable your adblocker or try a different network.";
      } else if (
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("UNAVAILABLE")
      ) {
        msg =
          "Google's AI servers are currently overloaded due to high demand. The system tried to reconnect multiple times but the servers are still busy. Please wait a minute or two and try generating again.";
      }
      alert(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDataExtracted = async (data: any) => {
    setShowScanner(false);

    if (data.flights && data.flights.length > 0) {
      setFlights((prev) => {
        const updated = [...prev];
        data.flights.forEach((f: Flight) => {
          const idx = updated.findIndex((existing) => existing.id === f.id);
          if (idx >= 0) updated[idx] = f;
          else updated.push(f);
          if (supabase) db.upsertFlight(f);
        });
        return updated;
      });
    }

    if (data.staff && data.staff.length > 0) {
      setStaff((prev) => {
        const updated = [...prev];
        data.staff.forEach((s: Staff) => {
          const idx = updated.findIndex((existing) => existing.id === s.id);
          if (idx >= 0) updated[idx] = s;
          else updated.push(s);
          if (supabase) db.upsertStaff(s);
        });
        return updated;
      });
    }

    if (data.shifts && data.shifts.length > 0) {
      setShifts((prev) => {
        const updated = [...prev];
        data.shifts.forEach((s: ShiftConfig) => {
          const idx = updated.findIndex((existing) => existing.id === s.id);
          if (idx >= 0) updated[idx] = s;
          else updated.push(s);
          if (supabase) db.upsertShift(s);
        });
        return updated;
      });
    }

    setNotification(`AI Sync Complete: ${data.flights?.length || 0} flights, ${data.staff?.length || 0} staff added/updated. (Check your date filters if they don't appear)`);
    setTimeout(() => setNotification(null), 3000);
  };

  // Improved matching logic to handle suffixes (e.g. MS-ATZ)
  const matchStaffToken = (token: string, staffList: Staff[]) => {
    const cleanToken = token.trim().toUpperCase();
    if (!cleanToken) return null;

    // 1. Exact Match
    const exact = staffList.find(
      (s) => s.initials.toUpperCase() === cleanToken,
    );
    if (exact) return exact.id;

    // 2. Prefix Match (Handling "MS-Atz" matching "MS-ATZ" or "MS" matching "MS-ATZ")
    const tokenPrefix = cleanToken.split("-")[0];
    const prefixMatch = staffList.find(
      (s) => s.initials.toUpperCase().split("-")[0] === tokenPrefix,
    );
    if (prefixMatch) return prefixMatch.id;

    return null;
  };

  const handleIncomingSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    if (val.includes(" ") || val.includes(",") || val.includes("\n")) {
      const tokens = val.split(/[\s,\n]+/);
      const idsToAdd: string[] = [];
      const remaining: string[] = [];

      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) {
          idsToAdd.push(matchedId);
        } else {
          remaining.push(token);
        }
      });

      if (idsToAdd.length > 0) {
        setIncomingSelectedStaffIds((prev) =>
          Array.from(new Set([...prev, ...idsToAdd])),
        );
        setIncomingSearchTerm(remaining.join(" "));
        return;
      }
    }
    setIncomingSearchTerm(val);
  };

  const handleQuickLeaveSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    if (val.includes(" ") || val.includes(",") || val.includes("\n")) {
      const tokens = val.split(/[\s,\n]+/);
      const idsToAdd: string[] = [];
      const remaining: string[] = [];

      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) {
          idsToAdd.push(matchedId);
        } else {
          remaining.push(token);
        }
      });

      if (idsToAdd.length > 0) {
        setQuickLeaveStaffIds((prev) =>
          Array.from(new Set([...prev, ...idsToAdd])),
        );
        setQuickLeaveSearchTerm(remaining.join(" "));
        return;
      }
    }
    setQuickLeaveSearchTerm(val);
  };

  const addIncomingDuties = async () => {
    const finalTime = `${incomingHour}:${incomingMin}`;
    const hr = parseInt(incomingHour);
    let endDateStr = incomingDate;
    if (hr < 12) {
      const dateObj = new Date(incomingDate);
      dateObj.setDate(dateObj.getDate() + 1);
      endDateStr = dateObj.toISOString().split("T")[0];
    }

    // Process input text on button click
    let finalIds = [...incomingSelectedStaffIds];
    if (incomingSearchTerm.trim()) {
      const tokens = incomingSearchTerm.split(/[\s,\n]+/);
      const remaining: string[] = [];
      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) finalIds.push(matchedId);
        else remaining.push(token);
      });
      // Clear processed tokens
      if (remaining.length === 0) setIncomingSearchTerm("");
      else setIncomingSearchTerm(remaining.join(" "));
    }
    finalIds = Array.from(new Set(finalIds));

    if (finalIds.length === 0) return;

    const newDuties: IncomingDuty[] = finalIds.map((sid) => ({
      id: crypto.randomUUID(),
      staffId: sid,
      date: endDateStr,
      shiftEndTime: finalTime,
    }));

    setIncomingDuties((prev) => [...prev, ...newDuties]);
    if (supabase) {
      await db.upsertIncomingDuties(newDuties);
      await db.logAction(
        "CREATE",
        "LEAVE",
        "BULK",
        `Added ${newDuties.length} rest log entries`,
      );
    }

    setIncomingSelectedStaffIds([]);
    setNotification(`${newDuties.length} Rest Log Entries Added`);
  };

  const getShiftsForIncomingDate = () => {
    const programForDate = programs.find((p) => p.dateString === incomingDate);
    if (!programForDate) return [];

    const shiftIds = Array.from(
      new Set(programForDate.assignments.map((a) => a.shiftId).filter(Boolean))
    ) as string[];

    return shiftIds
      .map((shiftId) => {
        const shift = shifts.find((s) => s.id === shiftId);
        if (!shift) return null;
        const assignments = programForDate.assignments.filter(
          (a) => a.shiftId === shiftId
        );
        const staffInitials = assignments
          .map((a) => staff.find((s) => s.id === a.staffId)?.initials)
          .filter(Boolean);
        return {
          shiftId,
          shift,
          staffInitials,
          assignments,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  };

  const handleAddShiftStaff = (assignments: Assignment[], shift: ShiftConfig) => {
    const idsToAdd = assignments.map((a) => a.staffId).filter(Boolean);
    if (idsToAdd.length > 0) {
      const newDuties: IncomingDuty[] = [];
      const startHr = parseInt(shift.pickupTime.split(":")[0]) || 0;
      const endHr = parseInt(shift.endTime.split(":")[0]) || 0;
      let endDateStr = incomingDate;
      if (endHr < startHr || (endHr < 12 && startHr > 12)) {
         // Overnight shift
         const dateObj = new Date(incomingDate);
         dateObj.setDate(dateObj.getDate() + 1);
         endDateStr = dateObj.toISOString().split("T")[0];
      }

      for (const sid of idsToAdd) {
        const alreadyExists = incomingDuties.some(d => d.staffId === sid && d.date === endDateStr && d.shiftEndTime === shift.endTime);
        if (!alreadyExists && !newDuties.some(d => d.staffId === sid && d.date === endDateStr && d.shiftEndTime === shift.endTime)) {
          newDuties.push({
            id: crypto.randomUUID(),
            staffId: sid,
            date: endDateStr,
            shiftEndTime: shift.endTime,
          });
        }
      }

      if (newDuties.length > 0) {
        setIncomingDuties((prev) => [...prev, ...newDuties]);
        if (supabase) {
          db.upsertIncomingDuties(newDuties);
          db.logAction(
            "CREATE",
            "LEAVE",
            "BULK",
            `Auto-added ${newDuties.length} rest log entries`
          );
        }
        setNotification(`${newDuties.length} Rest Log Entries Auto-Added`);
      } else {
        setNotification("Staff already in Rest Log for this shift.");
      }
    }
  };

  const addQuickLeave = async () => {
    // Process input text on button click
    let finalIds = [...quickLeaveStaffIds];
    if (quickLeaveSearchTerm.trim()) {
      const tokens = quickLeaveSearchTerm.split(/[\s,\n]+/);
      const remaining: string[] = [];
      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) finalIds.push(matchedId);
        else remaining.push(token);
      });
      // Clear processed tokens
      if (remaining.length === 0) setQuickLeaveSearchTerm("");
      else setQuickLeaveSearchTerm(remaining.join(" "));
    }
    finalIds = Array.from(new Set(finalIds));

    if (finalIds.length === 0) return;

    // Validation: Check for overlapping leaves
    const overlappingStaff: string[] = [];
    finalIds.forEach((id) => {
      const hasOverlap = leaveRequests.some(
        (l) =>
          l.staffId === id &&
          l.startDate <= quickLeaveEndDate &&
          l.endDate >= quickLeaveStartDate,
      );
      if (hasOverlap) {
        const st = staff.find((s) => s.id === id);
        if (st) overlappingStaff.push(st.initials);
      }
    });

    if (overlappingStaff.length > 0) {
      alert(
        `Cannot add leave. The following staff already have overlapping leave records: ${overlappingStaff.join(", ")}`,
      );
      return;
    }

    const newLeaves: LeaveRequest[] = finalIds.map((sid) => ({
      id: crypto.randomUUID(),
      staffId: sid,
      startDate: quickLeaveStartDate,
      endDate: quickLeaveEndDate,
      type: quickLeaveType,
    }));

    setLeaveRequests((prev) => [...prev, ...newLeaves]);
    if (supabase) {
      await db.upsertLeaves(newLeaves);
      await db.logAction(
        "CREATE",
        "LEAVE",
        "BULK",
        `Added ${newLeaves.length} absence entries`,
      );
    }

    setQuickLeaveStaffIds([]);
    setNotification(`${newLeaves.length} Absence Entries Added`);
  };

  const deleteIncomingDuty = async (id: string) => {
    if (userProfile && !userProfile.isActive) {
      alert("Your account is frozen.");
      return;
    }
    setIncomingDuties((prev) => prev.filter((d) => d.id !== id));
    if (supabase) {
      await db.deleteIncomingDuty(id);
      await db.logAction("DELETE", "LEAVE", id, `Deleted rest log entry`);
    }
  };

  const deleteLeaveRequest = async (id: string) => {
    if (userProfile && !userProfile.isActive) {
      alert("Your account is frozen.");
      return;
    }
    setLeaveRequests((prev) => prev.filter((l) => l.id !== id));
    if (supabase) {
      await db.deleteLeave(id);
      await db.logAction("DELETE", "LEAVE", id, `Deleted absence entry`);
    }
  };

  if (isInitializing)
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="text-blue-500 animate-spin" size={64} />
      </div>
    );
  if (!session && supabase) return <Auth error={cloudError} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-xs font-black uppercase tracking-widest">
            {notification}
          </span>
        </div>
      )}

      <header className="sticky top-0 z-[100] bg-white border-b border-slate-200 py-4 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SkyOpsLogo size={42} />
          <div>
            <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase leading-none">
              SkyOPS <span className="text-blue-600 font-light">AI</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div
                className={`w-2 h-2 rounded-full ${cloudStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}
              ></div>
              <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">
                {cloudStatus === "connected"
                  ? "AI Sync Active"
                  : cloudError
                    ? `Error: ${cloudError}`
                    : "Not Connected"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Desktop Nav */}
          <nav className="hidden xl:flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            {[
              "dashboard",
              "flights",
              "staff",
              "shifts",
              "program",
              "statistics",
            ].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic ${activeTab === tab ? "bg-slate-950 text-white shadow-md" : "text-slate-500"}`}
              >
                {tab}
              </button>
            ))}
            {(userProfile?.role === "super_admin" || userProfile?.role === "admin" || userProfile?.email === "safazoom@gmail.com") && (
              <button
                onClick={() => setActiveTab("command")}
                className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic flex items-center gap-1.5 ${activeTab === "command" ? "bg-emerald-600 text-white shadow-md" : "text-emerald-600 hover:bg-emerald-50"}`}
              >
                <Shield size={12} /> Command
              </button>
            )}
          </nav>
          <button
            onClick={() => auth.signOut()}
            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-12 pb-32">
        {activeTab === "command" && (userProfile?.role === "super_admin" || userProfile?.role === "admin" || userProfile?.email === "safazoom@gmail.com") && (
          <CommandCenter currentUser={userProfile} flights={flights} shifts={shifts} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === "dashboard" && (() => {
          const activeFlights = flights.filter(f => f.date && f.date >= startDate && f.date <= endDate);
          const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
          const eligibleStaff = staff.filter((s) => {
            if (s.type === "Local") return true;
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              return s.rosterPeriods.some(p => p.start <= endDate && p.end >= startDate);
            }
            return (!s.workFromDate || !s.workToDate || (s.workFromDate <= endDate && s.workToDate >= startDate));
          });
          
          return (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
              {[
                {
                  label: "Flights",
                  val: activeFlights.length,
                  icon: Plane,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  breakdown: Object.entries(
                    activeFlights.reduce((acc, f) => {
                      const match = (f.flightNumber || "").toUpperCase().match(/([A-Z]{2,3})\s*\d/);
                      const prefix = match ? match[1] : "OTHER";
                      acc[prefix] = (acc[prefix] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).slice(0, 4), // keep top 4
                },
                {
                  label: "Staff",
                  val: eligibleStaff.length,
                  icon: Users,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  breakdown: (() => {
                    let traffic = 0;
                    let security = 0;
                    let labour = 0;
                    let driver = 0;
                    let accountant = 0;
                    eligibleStaff.forEach(s => {
                      if (s.isSecurity) security++;
                      else if (s.isLabour) labour++;
                      else if (s.isDriver) driver++;
                      else if (s.isAccountant) accountant++;
                      else traffic++; // default others to Traffic
                    });
                    
                    const res: [string, number][] = [];
                    if (traffic > 0) res.push(["Traffic", traffic]);
                    if (security > 0) res.push(["Security", security]);
                    if (labour > 0) res.push(["Labour", labour]);
                    if (driver > 0) res.push(["Driver", driver]);
                    if (accountant > 0) res.push(["Accountant", accountant]);
                    return res;
                  })(),
                },
                {
                  label: "Shifts",
                  val: activeShifts.length,
                  icon: Clock,
                  color: "text-amber-500",
                  bg: "bg-amber-50",
                },
                {
                  label: "AI Health",
                  val: `${stationHealth}%`,
                  icon: Zap,
                  color: "text-blue-400",
                  bg: "bg-slate-900",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 md:h-40 ${stat.bg === "bg-slate-900" ? "bg-slate-900 text-white" : "relative overflow-hidden"}`}
                >
                  <div className="flex justify-between items-start">
                    <div
                      className={`w-8 h-8 md:w-10 md:h-10 ${stat.bg} rounded-lg md:rounded-xl flex items-center justify-center ${stat.color} z-10 relative`}
                    >
                      <stat.icon size={16} />
                    </div>
                    {stat.breakdown && (
                      <div className="flex flex-col items-end z-10 relative mt-1">
                        {stat.breakdown.map(([prefix, count]) => (
                          <div key={prefix} className="text-[9px] md:text-xs font-bold text-slate-500">
                            {prefix} <span className="text-slate-700">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="z-10 relative">
                    <h2 className="text-xl md:text-3xl font-black italic leading-none">
                      {stat.val}
                    </h2>
                    <p className="text-[7px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <CapacityForecast
              staff={staff}
              shifts={shifts}
              leaveRequests={leaveRequests}
              startDate={startDate}
              duration={programDuration}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-2 space-y-6 md:space-y-8">
                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                      <Moon size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                        Staff Rest Log
                      </h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                        Fatigue Prevention Engine
                      </p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                        <Zap size={10} className="text-blue-500" /> Group
                        Personnel Feed (Paste List)
                      </label>
                      <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        {incomingSelectedStaffIds.map((id) => (
                          <span
                            key={id}
                            className="px-2 py-1 bg-slate-950 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2"
                          >
                            {staff.find((st) => st.id === id)?.initials}
                            <button
                              onClick={() =>
                                setIncomingSelectedStaffIds((prev) =>
                                  prev.filter((x) => x !== id),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="flex-1 bg-transparent text-sm font-bold outline-none"
                          placeholder={
                            staff.length === 0
                              ? "No staff registered yet..."
                              : "Paste initials like: MS-Atz ML-atz..."
                          }
                          value={incomingSearchTerm}
                          onChange={handleIncomingSearchChange}
                          disabled={staff.length === 0}
                        />
                      </div>
                      {staff.length === 0 && (
                        <p className="text-[9px] font-bold text-rose-500 mt-2 ml-1">
                          Warning: Register personnel in 'Staff' tab first.
                        </p>
                      )}
                      {programs.length > 0 && (
                        <button
                          onClick={() => setShowIncomingShifts(!showIncomingShifts)}
                          className="mt-3 text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Zap size={12} /> Load Past Shifts from Date
                        </button>
                      )}
                    </div>
                    
                    {showIncomingShifts && (
                      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                            Shifts on {incomingDate}
                          </h5>
                          <button onClick={() => setShowIncomingShifts(false)} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                        </div>
                        {getShiftsForIncomingDate().length === 0 ? (
                          <p className="text-xs text-slate-500 italic font-medium">No shifts found in saved programs for this date.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {getShiftsForIncomingDate().map((s) => (
                              <div key={s.shiftId} className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-black text-slate-800">{s.shift.pickupTime} - {s.shift.endTime}</span>
                                  <button
                                    onClick={() => handleAddShiftStaff(s.assignments, s.shift)}
                                    className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                                  >
                                    ADD ALL
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 leading-tight">
                                  {s.staffInitials.join(", ")}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="date"
                        className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none"
                        value={incomingDate}
                        onChange={(e) => setIncomingDate(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <select
                          className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2"
                          value={incomingHour}
                          onChange={(e) => setIncomingHour(e.target.value)}
                        >
                          {Array.from({ length: 24 }).map((_, i) => (
                            <option key={i} value={String(i).padStart(2, "0")}>
                              {String(i).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2"
                          value={incomingMin}
                          onChange={(e) => setIncomingMin(e.target.value)}
                        >
                          {["00", "15", "30", "45"].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={addIncomingDuties}
                        disabled={
                          incomingSelectedStaffIds.length === 0 &&
                          !incomingSearchTerm.trim()
                        }
                        className="h-[56px] bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
                      >
                        <Lock size={16} /> Bulk Lock Registry
                      </button>
                    </div>

                    {/* Feedback List */}
                    <div className="pt-4 border-t border-slate-50">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Registered for {incomingDate}
                        </h5>
                        {(() => {
                          const nextDate = new Date(incomingDate);
                          nextDate.setDate(nextDate.getDate() + 1);
                          const nextDateStr = nextDate.toISOString().split("T")[0];
                          const visibleDuties = incomingDuties.filter((d) => {
                            const hr = parseInt(d.shiftEndTime.split(":")[0]) || 0;
                            if (hr < 12) return d.date === nextDateStr;
                            return d.date === incomingDate;
                          });

                          return (
                            <>
                              {visibleDuties.length > 0 && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Clear all registered duties for ${incomingDate}?`)) {
                                      const idsToDelete = visibleDuties.map(d => d.id);
                                      const newDuties = incomingDuties.filter(d => !idsToDelete.includes(d.id));
                                      setIncomingDuties(newDuties);
                                      if (supabase) {
                                        visibleDuties.forEach(d => db.deleteIncomingDuty(d.id));
                                      }
                                    }
                                  }}
                                  className="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded"
                                >
                                  CLEAR ALL
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const nextDate = new Date(incomingDate);
                          nextDate.setDate(nextDate.getDate() + 1);
                          const nextDateStr = nextDate.toISOString().split("T")[0];
                          const visibleDuties = incomingDuties.filter((d) => {
                            const hr = parseInt(d.shiftEndTime.split(":")[0]) || 0;
                            if (hr < 12) return d.date === nextDateStr;
                            return d.date === incomingDate;
                          });

                          if (visibleDuties.length === 0) {
                            return (
                              <span className="text-[9px] italic text-slate-300">
                                No entries yet.
                              </span>
                            );
                          }

                          return visibleDuties.map((d) => {
                            const availDate = new Date(
                              `${d.date}T${d.shiftEndTime}`,
                            );
                            availDate.setHours(
                              availDate.getHours() + minRestHours,
                            );
                            const availStr = availDate.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            });
                            const isNextDay =
                              availDate.getDate() !==
                              new Date(d.date).getDate();
                            return (
                              <div
                                key={d.id}
                                className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between gap-3 animate-in fade-in zoom-in group relative"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-amber-700 uppercase">
                                    {
                                      staff.find((s) => s.id === d.staffId)
                                        ?.initials
                                    }
                                  </span>
                                  <span className="text-[10px] font-bold text-amber-600">
                                    ({d.shiftEndTime} - {availStr}{isNextDay ? "+1" : ""})
                                  </span>
                                </div>
                                <button
                                  onClick={() => deleteIncomingDuty(d.id)}
                                  className="text-amber-400 hover:text-amber-600"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500">
                      <Briefcase size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                        Off-Duty Registry
                      </h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                        Manual Absence Registry
                      </p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                        <Zap size={10} className="text-indigo-500" /> Group
                        Personnel Feed
                      </label>
                      <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        {quickLeaveStaffIds.map((id) => (
                          <span
                            key={id}
                            className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2"
                          >
                            {staff.find((st) => st.id === id)?.initials}
                            <button
                              onClick={() =>
                                setQuickLeaveStaffIds((prev) =>
                                  prev.filter((x) => x !== id),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="flex-1 bg-transparent text-sm font-bold outline-none"
                          placeholder={
                            staff.length === 0
                              ? "No staff registered yet..."
                              : "Search or paste group initials..."
                          }
                          value={quickLeaveSearchTerm}
                          onChange={handleQuickLeaveSearchChange}
                          disabled={staff.length === 0}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          From
                        </label>
                        <input
                          type="date"
                          className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none"
                          value={quickLeaveStartDate}
                          onChange={(e) => {
                            setQuickLeaveStartDate(e.target.value);
                            if (e.target.value > quickLeaveEndDate)
                              setQuickLeaveEndDate(e.target.value);
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          To
                        </label>
                        <input
                          type="date"
                          className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none"
                          value={quickLeaveEndDate}
                          min={quickLeaveStartDate}
                          onChange={(e) => setQuickLeaveEndDate(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Type
                        </label>
                        <select
                          className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-4 outline-none"
                          value={quickLeaveType}
                          onChange={(e) =>
                            setQuickLeaveType(e.target.value as LeaveType)
                          }
                        >
                          <option value="Day off">Day off</option>
                          <option value="Annual leave">Annual leave</option>
                          <option value="Sick leave">Sick leave</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 justify-end">
                        <button
                          onClick={addQuickLeave}
                          disabled={
                            quickLeaveStaffIds.length === 0 &&
                            !quickLeaveSearchTerm.trim()
                          }
                          className="h-[56px] bg-indigo-600 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
                        >
                          <Plus size={16} /> Add Group Log
                        </button>
                      </div>
                    </div>

                    {/* Feedback List */}
                    <div className="pt-4 border-t border-slate-50">
                      <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                        Absences overlapping {quickLeaveStartDate} to{" "}
                        {quickLeaveEndDate}
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {leaveRequests.filter(
                          (l) =>
                            l.startDate <= quickLeaveEndDate &&
                            l.endDate >= quickLeaveStartDate,
                        ).length === 0 && (
                          <span className="text-[9px] italic text-slate-300">
                            No entries yet.
                          </span>
                        )}
                        {leaveRequests
                          .filter(
                            (l) =>
                              l.startDate <= quickLeaveEndDate &&
                              l.endDate >= quickLeaveStartDate,
                          )
                          .map((l) => (
                            <div
                              key={l.id}
                              className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2 animate-in fade-in zoom-in"
                            >
                              <span className="text-[10px] font-black text-indigo-700 uppercase">
                                {
                                  staff.find((s) => s.id === l.staffId)
                                    ?.initials
                                }
                              </span>
                              <span className="text-[10px] font-bold text-indigo-500">
                                {l.type}
                              </span>
                              <span className="text-[8px] font-bold text-indigo-400 bg-indigo-100 px-1 rounded">
                                {l.startDate === l.endDate
                                  ? l.startDate
                                  : `${l.startDate} - ${l.endDate}`}
                              </span>
                              <button
                                onClick={() => deleteLeaveRequest(l.id)}
                                className="text-indigo-400 hover:text-indigo-600"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-blue-500 shadow-xl">
                    <Terminal size={24} />
                  </div>
                  <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                    AI Command Control
                  </h4>
                </div>
                <div className="space-y-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">
                      Program Commencement
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-all"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-center italic mt-2">
                      Target Period: {startDate} &gt; {endDate}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block">
                      Period Duration
                    </label>
                    <select
                      value={programDuration}
                      onChange={(e) => setProgramDuration(parseInt(e.target.value))}
                      className="w-full h-[48px] px-4 bg-white border border-slate-200 rounded-xl font-black text-sm text-blue-600 outline-none text-center cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day} DAYS</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block flex items-center gap-2">
                      <Timer size={14} className="text-indigo-500" /> Rest
                      Threshold
                    </label>
                    <select
                      value={minRestHours}
                      onChange={(e) => setMinRestHours(parseInt(e.target.value))}
                      className="w-full h-[48px] px-4 bg-white border border-slate-200 rounded-xl font-black text-sm text-indigo-600 outline-none text-center cursor-pointer"
                    >
                      {Array.from({ length: 17 }, (_, i) => i + 8).map(hour => (
                        <option key={hour} value={hour}>{hour} HOURS</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setIsPreRosterModalOpen(true)}
                  disabled={isGenerating}
                  className="w-full py-8 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Sparkles size={24} className="text-blue-400" />
                  )}
                  {isGenerating ? "AI Analysis..." : "Build AI Program"}
                </button>
              </div>
            </div>
          </div>
          );
        })()}
        {activeTab === "flights" && (
          <FlightManager
            flights={flights}
            startDate={startDate}
            endDate={endDate}
            onAdd={(f) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const isDuplicate = flights.some(
                (existing) =>
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (isDuplicate) {
                alert(`Flight ${f.flightNumber} already exists on ${f.date}. Duplicates are not allowed.`);
                return;
              }
              
              setFlights((p) => [...p, f]);
              db.upsertFlight(f);
              db.logAction(
                "CREATE",
                "FLIGHT",
                f.id,
                `Added flight ${f.flightNumber}`,
              );
            }}
            onUpdate={(f) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const isDuplicate = flights.some(
                (existing) =>
                  existing.id !== f.id &&
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (isDuplicate) {
                alert(`Flight ${f.flightNumber} already exists on ${f.date}. Duplicates are not allowed.`);
                return;
              }

              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              db.upsertFlight(f);
              db.logAction(
                "UPDATE",
                "FLIGHT",
                f.id,
                `Updated flight ${f.flightNumber}`,
              );
            }}
            onDelete={(id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              setFlights((p) => p.filter((f) => f.id !== id));
              db.deleteFlight(id);
              db.logAction("DELETE", "FLIGHT", id, `Deleted flight`);
            }}
            onOpenScanner={() => {
              setScannerTarget("flights");
              setShowScanner(true);
            }}
          />
        )}
        {activeTab === "staff" && (
          <StaffManager
            staff={staff}
            onUpdate={(s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const isNew = !staff.find((o) => o.id === s.id);
              if (
                isNew &&
                userProfile &&
                staff.length >= userProfile.maxStaff
              ) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxStaff} staff members.`,
                );
                return;
              }
              setStaff((p) =>
                p.find((o) => o.id === s.id)
                  ? p.map((o) => (o.id === s.id ? s : o))
                  : [...p, s],
              );
              db.upsertStaff(s);
              db.logAction(
                isNew ? "CREATE" : "UPDATE",
                "STAFF",
                s.id,
                `${isNew ? "Added" : "Updated"} staff ${s.initials}`,
              );
            }}
            onDelete={(id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              setStaff((p) => p.filter((s) => s.id !== id));
              db.deleteStaff(id);
              db.logAction("DELETE", "STAFF", id, `Deleted staff member`);
              // --- IMPROVEMENT 4: GHOST ASSIGNMENTS CLEANUP ---
              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.staffId !== id),
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });
            }}
            onClearAll={() => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              staff.forEach((s) => db.deleteStaff(s.id));
              setStaff([]);
              db.logAction(
                "DELETE",
                "STAFF",
                "ALL",
                `Cleared all staff members`,
              );
              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: [],
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });
            }}
            onOpenScanner={() => {
              setScannerTarget("staff");
              setShowScanner(true);
            }}
            defaultMaxShifts={5}
          />
        )}
        {activeTab === "shifts" && (
          <ShiftManager
            shifts={shifts}
            flights={flights}
            staff={staff}
            leaveRequests={leaveRequests}
            startDate={startDate}
            endDate={endDate}
            onAdd={(s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              if (userProfile && shifts.length >= userProfile.maxShifts) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxShifts} shifts.`,
                );
                return;
              }
              setShifts((p) => [...p, s]);
              db.upsertShift(s);
              db.logAction(
                "CREATE",
                "SHIFT",
                s.id,
                `Added shift on ${s.pickupDate} ${s.pickupTime}`,
              );
            }}
            onUpdate={(s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              setShifts((p) => p.map((o) => (o.id === s.id ? s : o)));
              db.upsertShift(s);
              db.logAction(
                "UPDATE",
                "SHIFT",
                s.id,
                `Updated shift on ${s.pickupDate} ${s.pickupTime}`,
              );
            }}
            onDelete={(id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              setShifts((p) => p.filter((s) => s.id !== id));
              db.deleteShift(id);
              db.logAction("DELETE", "SHIFT", id, `Deleted shift`);
              // --- IMPROVEMENT 4: GHOST ASSIGNMENTS CLEANUP ---
              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.shiftId !== id),
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });
            }}
            onAddFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              setFlights((p) => [...p, f]);
              db.upsertFlight(f);
            }}
            onUpdateFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              db.upsertFlight(f);
            }}
            onDeleteFlight={(id) => {
              if (userProfile && !userProfile.isActive) return;
              setFlights((p) => p.filter((f) => f.id !== id));
              db.deleteFlight(id);
            }}
          />
        )}
        {activeTab === "program" && (
          <ProgramDisplay
            programs={programs}
            flights={flights}
            staff={staff}
            shifts={shifts}
            leaveRequests={leaveRequests}
            incomingDuties={incomingDuties}
            manualAssignments={manualAssignments}
            startDate={startDate}
            endDate={endDate}
            stationHealth={stationHealth}
            alerts={alerts}
            minRestHours={minRestHours}
            onUpdatePrograms={async (updated) => {
              // Find which programs actually changed
              const changedPrograms = updated.filter(u => {
                const prev = programs.find(p => p.dateString === u.dateString);
                if (!prev) return true;
                return JSON.stringify(prev) !== JSON.stringify(u);
              });

              setPrograms(updated);
              if (supabase && changedPrograms.length > 0) {
                 await db.savePrograms(changedPrograms);
              }
            }}
            onRestoreVersion={(v) => {
              setPrograms(prev => {
                const merged = [...prev];
                v.programs.forEach(newP => {
                   const idx = merged.findIndex(p => p.dateString === newP.dateString);
                   if (idx !== -1) merged[idx] = newP;
                   else merged.push(newP);
                });
                return merged.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
              });
              setStartDate(v.periodStart);
              setEndDate(v.periodEnd);
              setStationHealth(v.stationHealth);
              setNotification(`Restored version: ${v.name}`);
              if (supabase) db.savePrograms(v.programs);
            }}
            onUpdateLeaves={async (l: LeaveRequest[]) => {
              setLeaveRequests(l);
              if (supabase) {
                await db.upsertLeaves(l);
              }
            }}
          />
        )}

        {activeTab === "statistics" && (
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-12 animate-in fade-in duration-500">
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">
                  Station Analytics
                </h2>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                  <PieChart size={14} /> Comprehensive Manpower Report
                </p>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Period Start
                  </label>
                  <input
                    type="date"
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Period End
                  </label>
                  <input
                    type="date"
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <StationStatistics
              staff={staff}
              shifts={shifts}
              leaveRequests={leaveRequests}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        )}
      </main>

      {/* Mobile Footer Navigation */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 px-4 pb-6 z-[200] flex justify-between items-center shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] overflow-x-auto gap-2">
        {[
          { id: "dashboard", icon: LayoutDashboard, label: "Dash" },
          { id: "flights", icon: Plane, label: "Flights" },
          { id: "staff", icon: Users, label: "Staff" },
          { id: "shifts", icon: Clock, label: "Shifts" },
          { id: "program", icon: CalendarDays, label: "Roster" },
          { id: "statistics", icon: PieChart, label: "Stats" },
          ...((userProfile?.role === "super_admin" || userProfile?.role === "admin" || userProfile?.email === "safazoom@gmail.com")
            ? [{ id: "command", icon: Shield, label: "Cmd" }]
            : []),
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all min-w-[64px] ${
              activeTab === item.id
                ? item.id === "command"
                  ? "text-emerald-600 bg-emerald-50 scale-110"
                  : "text-blue-600 bg-blue-50 scale-110"
                : "text-slate-400 hover:bg-slate-50"
            }`}
          >
            <item.icon
              size={20}
              strokeWidth={activeTab === item.id ? 2.5 : 2}
            />
            <span className="text-[9px] font-black uppercase tracking-tight">
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <ProgramChat
        data={{ flights, staff, shifts, programs }}
        onUpdate={setPrograms}
      />

      <PreRosterModal
        isOpen={isPreRosterModalOpen}
        onClose={() => setIsPreRosterModalOpen(false)}
        onConfirm={confirmGenerateProgram}
        staff={staff}
        shifts={shifts}
        startDate={startDate}
        endDate={endDate}
      />

      {showScanner && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] overflow-hidden shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowScanner(false)}
              className="absolute top-6 right-6 z-10 p-3 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
            <ProgramScanner
              onDataExtracted={handleDataExtracted}
              startDate={startDate}
              numDays={programDuration}
              initialTarget={
                scannerTarget === "all" ? undefined : scannerTarget
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  // @ts-ignore
  const root = container._reactRootContainer || createRoot(container);
  // @ts-ignore
  container._reactRootContainer = root;
  root.render(<App />);
}
