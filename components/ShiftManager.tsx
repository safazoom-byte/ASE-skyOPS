import React, { useState, useMemo, useEffect } from "react";
import { ShiftConfig, Flight, Skill, Staff, LeaveRequest } from "../types";
import { AVAILABLE_SKILLS, DAYS_OF_WEEK_FULL } from "../constants";
import * as XLSX from "xlsx";
import {
  Clock,
  Trash2,
  Edit2,
  Plus,
  Minus,
  FileDown,
  Calendar,
  Sparkles,
  Plane,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ArrowRight,
  Shield,
  Box,
  Truck,
  Terminal,
  Search,
  Activity,
  Layers,
  Zap,
  Layout,
  Lock,
  ChevronRight,
  ChevronLeft,
  MoveHorizontal,
  CalendarX,
  Coffee,
  AlertTriangle,
  X,
  Users,
} from "lucide-react";

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  staff: Staff[];
  leaveRequests: LeaveRequest[];
  startDate?: string;
  endDate?: string;
  onAdd: (s: ShiftConfig) => void;
  onUpdate: (s: ShiftConfig) => void;
  onDelete: (id: string) => void;
  onOpenScanner?: () => void;
}

export const ShiftManager: React.FC<Props> = ({
  shifts = [],
  flights = [],
  staff = [],
  leaveRequests = [],
  startDate,
  endDate,
  onAdd,
  onUpdate,
  onDelete,
  onOpenScanner,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ShiftConfig>>({
    pickupDate: startDate || new Date().toISOString().split("T")[0],
    pickupTime: "06:00",
    endDate: startDate || new Date().toISOString().split("T")[0],
    endTime: "14:00",
    minStaff: 2,
    maxStaff: 8,
    targetPower: 75,
    flightIds: [],
    roleCounts: {},
  });

  useEffect(() => {
    if (startDate && !editingId) {
      setFormData((prev) => ({
        ...prev,
        pickupDate: startDate,
        endDate: startDate,
      }));
    }
  }, [startDate, editingId]);

  // --- BULK SHIFT CREATOR STATE ---
  interface BulkShiftTemplate {
    id: string;
    pickupTime: string;
    endTime: string;
    minStaff: number;
    maxStaff: number;
    roleCounts: Record<string, number>;
  }

  const [showBulkModal, setShowBulkModal] = useState(false);

  // Weekly State
  const [bulkStartDate, setBulkStartDate] = useState(
    startDate || new Date().toISOString().split("T")[0],
  );
  const [bulkEndDate, setBulkEndDate] = useState(
    endDate ||
      (() => {
        const dStr = startDate || new Date().toISOString().split("T")[0];
        const d = new Date(dStr);
        d.setUTCDate(d.getUTCDate() + 6);
        return d.toISOString().split("T")[0];
      })(),
  );

  useEffect(() => {
    if (startDate) setBulkStartDate(startDate);
    if (endDate) setBulkEndDate(endDate);
  }, [startDate, endDate]);
  interface DailyPlan {
    dateStr: string;
    templates: BulkShiftTemplate[];
  }

  const [weeklyPlan, setWeeklyPlan] = useState<DailyPlan[]>([]);

  useEffect(() => {
    if (!bulkStartDate || !bulkEndDate) return;
    const start = new Date(bulkStartDate);
    const end = new Date(bulkEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 31 && start <= end) {
      setWeeklyPlan((prev) => {
        const newPlan: DailyPlan[] = [];
        let previousTemplates: BulkShiftTemplate[] = [
          {
            id: Math.random().toString(36).substr(2, 9),
            pickupTime: "06:00",
            endTime: "14:00",
            minStaff: 2,
            maxStaff: 8,
            roleCounts: {},
          },
        ];

        for (
          let d = new Date(start);
          d <= end;
          d.setUTCDate(d.getUTCDate() + 1)
        ) {
          const dStr = d.toISOString().split("T")[0];
          const existing = prev.find((p) => p.dateStr === dStr);
          if (existing) {
            newPlan.push(existing);
            previousTemplates = existing.templates;
          } else {
            // Copy previous day's template structure as default for new day
            const newDayTemplates = previousTemplates.map((t) => ({
              ...t,
              id: Math.random().toString(36).substr(2, 9),
            }));
            newPlan.push({ dateStr: dStr, templates: newDayTemplates });
          }
        }
        return newPlan;
      });
    }
  }, [bulkStartDate, bulkEndDate]);

  const handleBulkCreateWeekly = () => {
    const newShifts: ShiftConfig[] = [];

    weeklyPlan.forEach((dayPlan) => {
      dayPlan.templates.forEach((template) => {
        let endDateStr = dayPlan.dateStr;
        if (template.endTime < template.pickupTime) {
          const nextDay = new Date(dayPlan.dateStr);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          endDateStr = nextDay.toISOString().split("T")[0];
        }

        newShifts.push({
          id: Math.random().toString(36).substr(2, 9),
          day: getDayOffset(dayPlan.dateStr),
          pickupDate: dayPlan.dateStr,
          pickupTime: template.pickupTime,
          endDate: endDateStr,
          endTime: template.endTime,
          minStaff: template.minStaff,
          maxStaff: template.maxStaff,
          targetPower: 75,
          roleCounts: { ...template.roleCounts },
          flightIds: [],
        });
      });
    });

    if (newShifts.length === 0) {
      alert("No shifts matched your selection.");
      return;
    }

    if (
      !window.confirm(`This will create ${newShifts.length} shifts. Proceed?`)
    )
      return;

    newShifts.forEach((s) => onAdd(s));
    setShowBulkModal(false);
  };
  // --------------------------------

  const getDayOffset = (dateStr: string) => {
    if (!startDate || !dateStr) return 0;
    const start = new Date(startDate);
    const target = new Date(dateStr);
    if (isNaN(start.getTime()) || isNaN(target.getTime())) return 0;

    start.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - start.getTime();
    // Clamp to 0 to prevent negative indices
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  const availableFlights = useMemo(() => {
    if (!formData.pickupDate) return [];
    const targetDate = new Date(formData.pickupDate);
    return flights.filter((f) => {
      const flightDate = new Date(f.date);
      const diffDays =
        Math.abs(flightDate.getTime() - targetDate.getTime()) /
        (1000 * 60 * 60 * 24);
      return diffDays <= 1;
    });
  }, [flights, formData.pickupDate]);

  const engagedFlightIds = useMemo(() => {
    const engaged = new Set<string>();
    shifts.forEach((s) => {
      if (s.id !== editingId) {
        s.flightIds?.forEach((fid) => engaged.add(fid));
      }
    });
    return engaged;
  }, [shifts, editingId]);

  const toggleFlightEngagement = (flightId: string) => {
    if (engagedFlightIds.has(flightId)) return;
    const current = formData.flightIds || [];
    const next = current.includes(flightId)
      ? current.filter((id) => id !== flightId)
      : [...current, flightId];
    setFormData((prev) => ({ ...prev, flightIds: next }));
  };

  const formatTimeInput = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    if (cleaned.length <= 2) return cleaned;
    let hh = cleaned.slice(0, 2);
    let mm = cleaned.slice(2, 4);
    if (parseInt(hh) > 23) hh = "23";
    if (parseInt(mm) > 59) mm = "59";
    return hh + ":" + mm;
  };

  const calculateDuration = () => {
    if (!formData.pickupTime || !formData.endTime) return null;
    try {
      const [h1, m1] = formData.pickupTime.split(":").map(Number);
      const [h2, m2] = formData.endTime.split(":").map(Number);
      const startMins = h1 * 60 + (m1 || 0);
      let endMins = h2 * 60 + (m2 || 0);

      if (
        formData.endDate &&
        formData.pickupDate &&
        formData.endDate > formData.pickupDate
      ) {
        endMins += 1440;
      } else if (endMins < startMins) {
        endMins += 1440;
      }

      const diff = endMins - startMins;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hours}h ${mins}m`;
    } catch (e) {
      return null;
    }
  };

  const updateRoleCount = (skill: Skill, delta: number) => {
    const current = formData.roleCounts || {};
    const newVal = Math.max(0, (Number(current[skill]) || 0) + delta);
    setFormData((prev) => ({
      ...prev,
      roleCounts: { ...current, [skill]: newVal },
    }));
  };

  const getFlightById = (id: string) => flights.find((f) => f.id === id);
  const getStaffById = (id: string) => staff.find((s) => s.id === id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = {
      ...(formData as ShiftConfig),
      day: getDayOffset(formData.pickupDate!),
      id: editingId || Math.random().toString(36).substr(2, 9),
    };
    if (editingId) onUpdate(finalData);
    else onAdd(finalData);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      pickupDate: startDate || new Date().toISOString().split("T")[0],
      pickupTime: "06:00",
      endDate: startDate || new Date().toISOString().split("T")[0],
      endTime: "14:00",
      minStaff: 2,
      maxStaff: 8,
      targetPower: 75,
      flightIds: [],
      roleCounts: {},
    });
    setEditingId(null);
  };

  const startEdit = (shift: ShiftConfig) => {
    setEditingId(shift.id);
    setFormData({ ...shift });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getSkillIcon = (skill: string) => {
    switch (skill) {
      case "Shift Leader":
        return <Shield size={16} />;
      case "Load Control":
        return <Box size={16} />;
      case "Ramp":
        return <Truck size={16} />;
      case "Operations":
        return <Terminal size={16} />;
      case "Lost and Found":
        return <Search size={16} />;
      case "Labour":
        return <Users size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const getSkillCode = (skill: string) => {
    switch (skill) {
      case "Shift Leader":
        return "SL";
      case "Load Control":
        return "LC";
      case "Ramp":
        return "RMP";
      case "Operations":
        return "OPS";
      case "Lost and Found":
        return "LF";
      case "Labour":
        return "LBR";
      default:
        return "";
    }
  };

  const [isAutoLinkEnabled, setIsAutoLinkEnabled] = useState(() => {
    return localStorage.getItem("autoLinkFlights") === "true";
  });

  const onUpdateRef = React.useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!isAutoLinkEnabled || !flights.length || !filteredShifts.length) return;

    filteredShifts.forEach((shift) => {
      const shiftStart = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
      let shiftEnd = new Date(
        `${shift.endDate || shift.pickupDate}T${shift.endTime}`,
      );

      if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      const linkedFlights = flights.filter((f) => {
        let isLinked = false;

        const staTime = f.sta ? new Date(`${f.date}T${f.sta}`) : null;
        let stdTime = f.std ? new Date(`${f.date}T${f.std}`) : null;

        // Handle turnaround flights spanning midnight
        if (staTime && stdTime && f.std && f.sta && f.std < f.sta) {
          stdTime.setDate(stdTime.getDate() + 1);
        }

        if (staTime && staTime >= shiftStart && staTime <= shiftEnd)
          isLinked = true;
        if (stdTime && stdTime >= shiftStart && stdTime <= shiftEnd)
          isLinked = true;

        return isLinked;
      });

      const newFlightIds = linkedFlights.map((f) => f.id);
      const currentFlightIds = shift.flightIds || [];

      const isChanged =
        newFlightIds.length !== currentFlightIds.length ||
        !newFlightIds.every((id) => currentFlightIds.includes(id));

      if (isChanged) {
        onUpdateRef.current({ ...shift, flightIds: newFlightIds });
      }
    });
  }, [isAutoLinkEnabled, flights, shifts]);

  const toggleAutoLink = () => {
    const newVal = !isAutoLinkEnabled;
    setIsAutoLinkEnabled(newVal);
    localStorage.setItem("autoLinkFlights", String(newVal));
  };

  const getPhaseStyle = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    if (hour >= 4 && hour < 12)
      return { label: "Morning", color: "text-blue-500", bg: "bg-blue-500/10" };
    if (hour >= 12 && hour < 20)
      return {
        label: "Afternoon",
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      };
    return { label: "Night", color: "text-indigo-400", bg: "bg-indigo-400/10" };
  };

  const getShiftHealth = (s: ShiftConfig) => {
    const totalRequired = Object.values(s.roleCounts || {}).reduce(
      (acc, v) => acc + (v || 0),
      0,
    );
    const hasShiftLeader = (s.roleCounts?.["Shift Leader"] || 0) > 0;

    if (totalRequired < s.minStaff) return "critical";
    if (!hasShiftLeader) return "warning";
    return "healthy";
  };

  const filteredShifts = useMemo(() => {
    if (!startDate || !endDate) return shifts;
    return shifts.filter((s) => {
      const d = s.pickupDate || "9999-12-31";
      return d >= startDate && d <= endDate;
    });
  }, [shifts, startDate, endDate]);

  const timelineShifts = useMemo(() => {
    if (!filteredShifts.length) return [];
    return [...filteredShifts]
      .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime))
      .map((s) => {
        const [h, m] = s.pickupTime.split(":").map(Number);
        const startPercent = ((h * 60 + m) / 1440) * 100;
        const [eh, em] = s.endTime.split(":").map(Number);
        let endPercent = ((eh * 60 + em) / 1440) * 100;
        if (endPercent < startPercent) endPercent = 100;
        return {
          ...s,
          startPercent,
          width: Math.max(2, endPercent - startPercent),
        };
      });
  }, [filteredShifts]);

  const groupedShifts = useMemo(() => {
    const groups: Record<string, ShiftConfig[]> = {};
    [...filteredShifts]
      .sort(
        (a, b) =>
          (a.pickupDate || "").localeCompare(b.pickupDate || "") ||
          (a.pickupTime || "").localeCompare(b.pickupTime || ""),
      )
      .forEach((s) => {
        const dateStr = s.pickupDate || "Unknown Date";
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(s);
      });
    return groups;
  }, [filteredShifts]);

  const duplicateLastWeek = () => {
    if (!startDate) return;

    const sourceStartStr = window.prompt(
      "Enter origin start date (YYYY-MM-DD):",
      new Date(new Date(startDate).getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    );
    if (!sourceStartStr) return;
    const sourceEndStr = window.prompt(
      "Enter origin end date (YYYY-MM-DD):",
      new Date(new Date(sourceStartStr).getTime() + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    );
    if (!sourceEndStr) return;
    const targetStartStr = window.prompt(
      "Enter target start date to paste (YYYY-MM-DD):",
      startDate,
    );
    if (!targetStartStr) return;

    const sourceStart = new Date(sourceStartStr);
    const sourceEnd = new Date(sourceEndStr);
    const targetStart = new Date(targetStartStr);
    const diffDays = Math.round(
      (targetStart.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24),
    );

    const toDuplicate = shifts.filter((s) => {
      const d = new Date(s.pickupDate);
      return d >= sourceStart && d <= sourceEnd;
    });

    if (toDuplicate.length === 0) {
      alert("No shifts found in the origin period to duplicate.");
      return;
    }

    if (
      !window.confirm(
        `Found ${toDuplicate.length} shifts to duplicate. Proceed?`,
      )
    )
      return;

    toDuplicate.forEach((s) => {
      const pd = new Date(s.pickupDate);
      pd.setUTCDate(pd.getUTCDate() + diffDays);
      const ed = s.endDate ? new Date(s.endDate) : new Date(s.pickupDate);
      ed.setUTCDate(ed.getUTCDate() + diffDays);

      onAdd({
        ...s,
        id: Math.random().toString(36).substr(2, 9),
        pickupDate: pd.toISOString().split("T")[0],
        endDate: ed.toISOString().split("T")[0],
        day: getDayOffset(pd.toISOString().split("T")[0]),
      });
    });
  };

  const durationText = calculateDuration();

  return (
    <div className="space-y-8 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-4 md:gap-6 text-center md:text-left flex-col md:flex-row relative z-10">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Layout size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none">
              Operations Command
            </h3>
            <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-1 md:mt-2">
              Real-time Duty Management
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10">
          <button
            onClick={toggleAutoLink}
            className={`flex-1 px-6 py-4 md:px-8 md:py-5 rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl ${
              isAutoLinkEnabled
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 shadow-slate-900/20"
            }`}
          >
            <Zap
              size={16}
              className={`transition-transform ${isAutoLinkEnabled ? "text-yellow-300 group-hover:scale-110" : "text-slate-500"}`}
            />
            <div className="flex flex-col items-start text-left">
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic leading-none">
                Auto-Link
              </span>
              <span
                className={`text-[7px] font-bold uppercase tracking-wider mt-1 ${isAutoLinkEnabled ? "text-blue-200" : "text-slate-500"}`}
              >
                {isAutoLinkEnabled ? "Active" : "Disabled"}
              </span>
            </div>
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl shadow-amber-500/20"
          >
            <Layers
              size={16}
              className="group-hover:scale-110 transition-transform"
            />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">
              Master Template
            </span>
          </button>
          <button className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all">
            <FileDown size={18} className="text-emerald-400" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white">
              Report
            </span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <h4 className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3">
            <Layers size={16} className="text-blue-600" /> Station Coverage
            Ribbon
          </h4>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex gap-4">
              {["AM", "PM", "Night"].map((phase) => (
                <div key={phase} className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${phase === "AM" ? "bg-blue-500" : phase === "PM" ? "bg-amber-500" : "bg-indigo-400"}`}
                  ></div>
                  <span className="text-[7px] font-black uppercase text-slate-400">
                    {phase}
                  </span>
                </div>
              ))}
            </div>
            <div className="sm:hidden flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full animate-pulse">
              <MoveHorizontal size={10} className="text-blue-500" />
              <span className="text-[6px] font-black uppercase tracking-widest text-slate-400">
                Swipe
              </span>
            </div>
          </div>
        </div>

        <div className="relative overflow-x-auto no-scrollbar pb-2">
          <div className="relative h-28 md:h-32 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 p-4 min-w-[900px] md:min-w-full overflow-hidden">
            <div className="absolute inset-0 flex pointer-events-none px-6">
              {Array.from({ length: 25 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-full border-l border-slate-200/50 flex flex-col justify-end pb-2`}
                  style={{ position: "absolute", left: `${(i / 24) * 100}%` }}
                >
                  {i % 3 === 0 && (
                    <span className="text-[7px] font-black text-slate-300 ml-1 translate-y-2">
                      {i}:00
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="relative h-full flex flex-col justify-center gap-2 pt-2">
              {timelineShifts.map((s) => {
                const phase = getPhaseStyle(s.pickupTime);
                const health = getShiftHealth(s);
                return (
                  <div
                    key={s.id}
                    className={`h-6 md:h-7 rounded-full border-2 border-white shadow-md flex items-center px-4 transition-all hover:scale-[1.01] cursor-pointer ${phase.bg} ${health === "critical" ? "ring-2 ring-rose-500/30" : ""}`}
                    style={{
                      marginLeft: `${s.startPercent}%`,
                      width: `${s.width}%`,
                    }}
                    onClick={() => startEdit(s)}
                  >
                    <span
                      className={`text-[8px] font-black uppercase tracking-tighter truncate ${phase.color}`}
                    >
                      {s.pickupTime} - {s.endTime}
                    </span>
                  </div>
                );
              })}
              {timelineShifts.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Zap size={14} className="text-slate-200" />
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] italic">
                    Awaiting Flight Registry Commit
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 md:gap-10">
        <div className="xl:col-span-1">
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 xl:sticky xl:top-24 max-h-[85vh] overflow-y-auto no-scrollbar">
            <h4 className="text-lg md:text-xl font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900 leading-none">
              {editingId ? (
                <Edit2 size={20} className="text-indigo-600" />
              ) : (
                <Plus size={20} className="text-blue-600" />
              )}
              {editingId ? "Modify Logic" : "New Duty"}
            </h4>

            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
              <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Clock size={12} className="text-blue-500" /> Timing Profile
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-600 uppercase ml-1">
                      On-Duty Date
                    </span>
                    <input
                      type="date"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs text-slate-900 outline-none"
                      value={formData.pickupDate}
                      onChange={(e) =>
                        setFormData({ ...formData, pickupDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-600 uppercase ml-1">
                      On-Duty Time
                    </span>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="06:00"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center text-sm text-slate-900 outline-none"
                      value={formData.pickupTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pickupTime: formatTimeInput(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-600 uppercase ml-1">
                      Release Date
                    </span>
                    <input
                      type="date"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs text-slate-900 outline-none"
                      value={formData.endDate}
                      onChange={(e) =>
                        setFormData({ ...formData, endDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-600 uppercase ml-1">
                      Release Time
                    </span>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="14:00"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center text-sm text-slate-900 outline-none"
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endTime: formatTimeInput(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Plane size={12} className="text-blue-500" /> Linked Traffic
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto no-scrollbar p-1">
                  {availableFlights.length === 0 ? (
                    <p className="col-span-full text-[8px] font-black text-slate-300 uppercase italic py-4 text-center">
                      No matching flights in range
                    </p>
                  ) : (
                    availableFlights.map((f) => {
                      const isSelected = (formData.flightIds || []).includes(
                        f.id,
                      );
                      const isEngaged = engagedFlightIds.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={isEngaged}
                          onClick={() => toggleFlightEngagement(f.id)}
                          className={`p-4 rounded-2xl border text-left transition-all space-y-2 relative ${
                            isSelected
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg z-10"
                              : isEngaged
                                ? "bg-slate-50 border-slate-100 text-slate-300 opacity-40 cursor-not-allowed grayscale pointer-events-none"
                                : "bg-slate-50 border-slate-100 text-slate-500 hover:border-blue-200"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="text-[11px] font-black leading-none flex items-center gap-2">
                              {f.flightNumber}
                              {isEngaged && (
                                <Lock size={10} className="text-slate-400" />
                              )}
                            </div>
                            <div
                              className={`text-[8px] font-black flex items-center gap-1 ${isSelected ? "text-white/80" : "text-slate-400"}`}
                            >
                              <MapPin size={8} /> {f.from}{" "}
                              <ArrowRight size={8} /> {f.to}
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-current border-opacity-10">
                            <div
                              className={`text-[10px] font-black italic ${isSelected ? "text-white" : isEngaged ? "text-slate-300" : "text-slate-900"}`}
                            >
                              {f.sta || f.std || "--:--"}
                            </div>
                            <div
                              className={`text-[7px] font-bold uppercase flex items-center gap-1 ${isSelected ? "text-white/70" : "text-slate-400"}`}
                            >
                              <Calendar size={8} /> {f.date}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">
                    Min Staff
                  </label>
                  <input
                    type="number"
                    className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center text-sm text-slate-900"
                    value={formData.minStaff}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minStaff: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">
                    Max Staff
                  </label>
                  <input
                    type="number"
                    className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center text-sm text-slate-900"
                    value={formData.maxStaff}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxStaff: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <ShieldCheck size={12} className="text-indigo-500" />{" "}
                  Specialist Logic
                </label>
                <div className="space-y-2">
                  {AVAILABLE_SKILLS.map((skill) => (
                    <div
                      key={skill}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl text-slate-400">
                          {getSkillIcon(skill)}
                        </div>
                        <span className="text-[9px] font-black uppercase text-slate-500">
                          {skill}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => updateRoleCount(skill, -1)}
                          className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-black text-slate-900 w-4 text-center">
                          {formData.roleCounts?.[skill] || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateRoleCount(skill, 1)}
                          className="w-8 h-8 flex items-center justify-center bg-slate-950 text-white rounded-xl hover:bg-blue-600 transition-all"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 text-[10px] font-black uppercase text-slate-400 italic"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-xs active:scale-95 leading-none"
                >
                  {editingId ? "Apply Edit" : "Register Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-8 md:space-y-10">
          {/* Duty Log Box */}
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Activity size={120} className="text-blue-500" />
            </div>

            <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter mb-8 px-2 flex items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                  <Activity size={24} />
                </div>
                <div>
                  <span className="block leading-none">Duty Log</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Pre-weekly Program
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!startDate) return;
                  const sourceStartStr = window.prompt(
                    "Enter SOURCE start date (YYYY-MM-DD):",
                    new Date(
                      new Date(startDate).getTime() - 7 * 24 * 60 * 60 * 1000,
                    )
                      .toISOString()
                      .split("T")[0],
                  );
                  if (!sourceStartStr) return;
                  const sourceEndStr = window.prompt(
                    "Enter SOURCE end date (YYYY-MM-DD):",
                    new Date(
                      new Date(sourceStartStr).getTime() +
                        6 * 24 * 60 * 60 * 1000,
                    )
                      .toISOString()
                      .split("T")[0],
                  );
                  if (!sourceEndStr) return;
                  const targetStartStr = window.prompt(
                    "Enter TARGET start date (YYYY-MM-DD):",
                    startDate,
                  );
                  if (!targetStartStr) return;

                  const sourceStart = new Date(sourceStartStr);
                  const sourceEnd = new Date(sourceEndStr);
                  const targetStart = new Date(targetStartStr);
                  const diffDays = Math.round(
                    (targetStart.getTime() - sourceStart.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );

                  const toDuplicate = shifts.filter((s) => {
                    const d = new Date(s.pickupDate);
                    return d >= sourceStart && d <= sourceEnd;
                  });

                  if (toDuplicate.length === 0) {
                    alert("No shifts found in the selected source period.");
                    return;
                  }

                  if (
                    !window.confirm(
                      `Found ${toDuplicate.length} shifts. Duplicate them?`,
                    )
                  )
                    return;

                  toDuplicate.forEach((s) => {
                    const pd = new Date(s.pickupDate);
                    pd.setUTCDate(pd.getUTCDate() + diffDays);
                    const ed = s.endDate
                      ? new Date(s.endDate)
                      : new Date(s.pickupDate);
                    ed.setUTCDate(ed.getUTCDate() + diffDays);

                    onAdd({
                      ...s,
                      id: Math.random().toString(36).substr(2, 9),
                      pickupDate: pd.toISOString().split("T")[0],
                      endDate: ed.toISOString().split("T")[0],
                      day: getDayOffset(pd.toISOString().split("T")[0]),
                    });
                  });
                }}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black uppercase text-xs hover:bg-indigo-100 transition-all flex items-center gap-2"
              >
                <Calendar size={14} /> Duplicate Period
              </button>
            </h4>

            <div className="space-y-12 relative z-10">
              {Object.keys(groupedShifts).length === 0 ? (
                <div className="py-32 text-center flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-100 rounded-[3rem]">
                  <AlertTriangle size={32} className="text-slate-200" />
                  <span className="text-slate-300 font-black uppercase italic text-xl">
                    Registry Empty
                  </span>
                </div>
              ) : (
                Object.keys(groupedShifts)
                  .sort()
                  .map((dateStr) => {
                    const dateShifts = groupedShifts[dateStr];
                    const dateObj = new Date(dateStr);
                    const label = `${DAYS_OF_WEEK_FULL[dateObj.getDay()]} - ${dateObj.toLocaleDateString("en-GB")}`;

                    return (
                      <div
                        key={dateStr}
                        className="bg-white rounded-[2rem] border-2 border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                          <h4 className="font-black uppercase italic text-slate-800 flex items-center gap-3">
                            <Calendar size={18} className="text-blue-500" />{" "}
                            {label}
                          </h4>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {dateShifts.length} Shifts
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                                <th className="px-4 py-3 w-12 text-center">
                                  S/N
                                </th>
                                <th className="px-4 py-3 w-32">Start Date</th>
                                <th className="px-4 py-3 w-24">Pickup</th>
                                <th className="px-4 py-3 w-32">End Date</th>
                                <th className="px-4 py-3 w-24">Release</th>
                                <th className="px-4 py-3 w-24 text-center">
                                  HC / Max
                                </th>
                                <th className="px-4 py-3">Required Roles</th>
                                <th className="px-4 py-3 whitespace-nowrap">
                                  Opt Flights
                                </th>
                                <th className="px-4 py-3 w-16 text-center">
                                  Act
                                </th>
                              </tr>
                            </thead>
                            <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                              {dateShifts.map((s, idx) => (
                                <tr
                                  key={s.id}
                                  className="hover:bg-slate-50 transition-colors"
                                >
                                  <td className="px-4 py-3 text-center font-bold text-slate-400">
                                    {idx + 1}
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="w-full bg-transparent font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1"
                                      value={s.pickupDate}
                                      onChange={(e) => {
                                        const pd = e.target.value;
                                        const updated = {
                                          ...s,
                                          pickupDate: pd,
                                          day: getDayOffset(pd),
                                        };
                                        if (s.pickupTime > s.endTime) {
                                          const ed = new Date(pd);
                                          ed.setUTCDate(ed.getUTCDate() + 1);
                                          updated.endDate = ed
                                            .toISOString()
                                            .split("T")[0];
                                        } else {
                                          updated.endDate = pd;
                                        }
                                        onUpdate(updated);
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="time"
                                      className="w-full font-mono bg-transparent text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1"
                                      value={s.pickupTime}
                                      onChange={(e) => {
                                        const pt = e.target.value;
                                        const updated = {
                                          ...s,
                                          pickupTime: pt,
                                        };
                                        if (pt > s.endTime) {
                                          const ed = new Date(s.pickupDate);
                                          ed.setUTCDate(ed.getUTCDate() + 1);
                                          updated.endDate = ed
                                            .toISOString()
                                            .split("T")[0];
                                        } else {
                                          updated.endDate = s.pickupDate;
                                        }
                                        onUpdate(updated);
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="w-full bg-transparent font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1"
                                      value={s.endDate || s.pickupDate}
                                      onChange={(e) => {
                                        onUpdate({
                                          ...s,
                                          endDate: e.target.value,
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="time"
                                      className="w-full font-mono bg-transparent text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1"
                                      value={s.endTime}
                                      onChange={(e) => {
                                        const et = e.target.value;
                                        const updated = { ...s, endTime: et };
                                        if (s.pickupTime > et) {
                                          const ed = new Date(s.pickupDate);
                                          ed.setUTCDate(ed.getUTCDate() + 1);
                                          updated.endDate = ed
                                            .toISOString()
                                            .split("T")[0];
                                        } else {
                                          updated.endDate = s.pickupDate;
                                        }
                                        onUpdate(updated);
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center whitespace-nowrap">
                                    <input
                                      type="number"
                                      className="w-10 text-center font-bold bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded py-1"
                                      value={s.minStaff}
                                      onChange={(e) =>
                                        onUpdate({
                                          ...s,
                                          minStaff: Number(e.target.value),
                                        })
                                      }
                                    />
                                    <span className="mx-1 text-slate-300">
                                      /
                                    </span>
                                    <input
                                      type="number"
                                      className="w-10 text-center font-bold bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded py-1"
                                      value={s.maxStaff}
                                      onChange={(e) =>
                                        onUpdate({
                                          ...s,
                                          maxStaff: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      {AVAILABLE_SKILLS.map((skill) => (
                                        <div
                                          key={skill}
                                          className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5"
                                        >
                                          <span
                                            className="text-[9px] font-bold text-slate-500"
                                            title={skill}
                                          >
                                            {getSkillCode(skill)}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const newCount = Math.max(
                                                0,
                                                (s.roleCounts?.[skill] || 0) -
                                                  1,
                                              );
                                              onUpdate({
                                                ...s,
                                                roleCounts: {
                                                  ...s.roleCounts,
                                                  [skill]: newCount,
                                                },
                                              });
                                            }}
                                            className="text-slate-300 hover:text-slate-600"
                                          >
                                            <Minus size={10} />
                                          </button>
                                          <span className="text-[10px] font-black w-3 text-center">
                                            {s.roleCounts?.[skill] || 0}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const newCount =
                                                (s.roleCounts?.[skill] || 0) +
                                                1;
                                              onUpdate({
                                                ...s,
                                                roleCounts: {
                                                  ...s.roleCounts,
                                                  [skill]: newCount,
                                                },
                                              });
                                            }}
                                            className="text-slate-300 hover:text-slate-600"
                                          >
                                            <Plus size={10} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex flex-wrap gap-0.5 max-w-[120px]">
                                      {s.flightIds && s.flightIds.length > 0 ? (
                                        s.flightIds.map((fid) => {
                                          const flight = getFlightById(fid);
                                          return flight ? (
                                            <span
                                              key={fid}
                                              className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded"
                                            >
                                              {flight.flightNumber}
                                            </span>
                                          ) : null;
                                        })
                                      ) : (
                                        <span className="text-[10px] text-slate-300">
                                          -
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <button
                                      onClick={() => {
                                        if (confirm("Purge slot?"))
                                          onDelete(s.id);
                                      }}
                                      className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BULK SHIFT CREATOR MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[1600] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center md:p-4 animate-in fade-in">
          <div className="absolute inset-0 md:relative md:inset-auto bg-white md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl md:max-h-[95vh] flex flex-col overflow-hidden">
            <div className="p-4 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                  <Layers size={20} className="md:w-6 md:h-6" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 leading-none">
                    Weekly Master Template
                  </h3>
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                    Mass Schedule Generation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 md:p-8 flex-1 overflow-y-auto min-h-0">
              <div className="space-y-6 md:space-y-8 animate-in slide-in-from-right-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      From Date
                    </label>
                    <input
                      type="date"
                      className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={bulkStartDate}
                      onChange={(e) => setBulkStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      To Date
                    </label>
                    <input
                      type="date"
                      className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={bulkEndDate}
                      min={bulkStartDate}
                      onChange={(e) => setBulkEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-8">
                  {weeklyPlan.map((dayPlan) => (
                    <div
                      key={dayPlan.dateStr}
                      className="border-t border-slate-200 pt-6 first:border-0 first:pt-0"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[14px] font-black uppercase text-indigo-900 tracking-widest flex items-center gap-2">
                          <Calendar size={16} className="text-indigo-500" />
                          {new Date(dayPlan.dateStr).toLocaleDateString(
                            "en-US",
                            {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            },
                          )}
                        </h4>
                        <button
                          onClick={() => {
                            setWeeklyPlan((prev) =>
                              prev.map((p) =>
                                p.dateStr === dayPlan.dateStr
                                  ? {
                                      ...p,
                                      templates: [
                                        ...p.templates,
                                        {
                                          id: Math.random()
                                            .toString(36)
                                            .substr(2, 9),
                                          pickupTime: "06:00",
                                          endTime: "14:00",
                                          minStaff: 2,
                                          maxStaff: 8,
                                          roleCounts: {},
                                        },
                                      ],
                                    }
                                  : p,
                              ),
                            );
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-3 py-2 bg-indigo-50 rounded-xl"
                        >
                          <Plus size={12} /> Add Shift
                        </button>
                      </div>

                      <div className="space-y-4">
                        {dayPlan.templates.length === 0 && (
                          <div className="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-widest">
                            No shifts for this day
                          </div>
                        )}
                        {dayPlan.templates.map((template, index) => (
                          <div
                            key={template.id}
                            className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-200 space-y-4 md:space-y-6 relative"
                          >
                            <button
                              onClick={() => {
                                setWeeklyPlan((prev) =>
                                  prev.map((p) =>
                                    p.dateStr === dayPlan.dateStr
                                      ? {
                                          ...p,
                                          templates: p.templates.filter(
                                            (t) => t.id !== template.id,
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                              }}
                              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 bg-white rounded-xl shadow-sm border border-slate-100"
                            >
                              <Trash2 size={16} />
                            </button>

                            <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                              Shift {index + 1}
                            </h5>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Shift Start (24H)
                                </label>
                                <input
                                  type="time"
                                  className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  value={template.pickupTime}
                                  onChange={(e) => {
                                    setWeeklyPlan((prev) =>
                                      prev.map((p) =>
                                        p.dateStr === dayPlan.dateStr
                                          ? {
                                              ...p,
                                              templates: p.templates.map((t) =>
                                                t.id === template.id
                                                  ? {
                                                      ...t,
                                                      pickupTime:
                                                        e.target.value,
                                                    }
                                                  : t,
                                              ),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Shift Release (24H)
                                </label>
                                <input
                                  type="time"
                                  className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  value={template.endTime}
                                  onChange={(e) => {
                                    setWeeklyPlan((prev) =>
                                      prev.map((p) =>
                                        p.dateStr === dayPlan.dateStr
                                          ? {
                                              ...p,
                                              templates: p.templates.map((t) =>
                                                t.id === template.id
                                                  ? {
                                                      ...t,
                                                      endTime: e.target.value,
                                                    }
                                                  : t,
                                              ),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Min Staff
                                </label>
                                <input
                                  type="number"
                                  className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  value={template.minStaff}
                                  onChange={(e) => {
                                    setWeeklyPlan((prev) =>
                                      prev.map((p) =>
                                        p.dateStr === dayPlan.dateStr
                                          ? {
                                              ...p,
                                              templates: p.templates.map((t) =>
                                                t.id === template.id
                                                  ? {
                                                      ...t,
                                                      minStaff: Number(
                                                        e.target.value,
                                                      ),
                                                    }
                                                  : t,
                                              ),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Max Staff
                                </label>
                                <input
                                  type="number"
                                  className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  value={template.maxStaff}
                                  onChange={(e) => {
                                    setWeeklyPlan((prev) =>
                                      prev.map((p) =>
                                        p.dateStr === dayPlan.dateStr
                                          ? {
                                              ...p,
                                              templates: p.templates.map((t) =>
                                                t.id === template.id
                                                  ? {
                                                      ...t,
                                                      maxStaff: Number(
                                                        e.target.value,
                                                      ),
                                                    }
                                                  : t,
                                              ),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                Specialist Roles Required
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {AVAILABLE_SKILLS.map((skill) => (
                                  <div
                                    key={skill}
                                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200"
                                  >
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">
                                      {skill}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setWeeklyPlan((prev) =>
                                            prev.map((p) =>
                                              p.dateStr === dayPlan.dateStr
                                                ? {
                                                    ...p,
                                                    templates: p.templates.map(
                                                      (t) =>
                                                        t.id === template.id
                                                          ? {
                                                              ...t,
                                                              roleCounts: {
                                                                ...t.roleCounts,
                                                                [skill]:
                                                                  Math.max(
                                                                    0,
                                                                    (t
                                                                      .roleCounts[
                                                                      skill
                                                                    ] || 0) - 1,
                                                                  ),
                                                              },
                                                            }
                                                          : t,
                                                    ),
                                                  }
                                                : p,
                                            ),
                                          );
                                        }}
                                        className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200"
                                      >
                                        <Minus size={10} />
                                      </button>
                                      <span className="text-xs font-black w-4 text-center">
                                        {template.roleCounts[skill] || 0}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setWeeklyPlan((prev) =>
                                            prev.map((p) =>
                                              p.dateStr === dayPlan.dateStr
                                                ? {
                                                    ...p,
                                                    templates: p.templates.map(
                                                      (t) =>
                                                        t.id === template.id
                                                          ? {
                                                              ...t,
                                                              roleCounts: {
                                                                ...t.roleCounts,
                                                                [skill]:
                                                                  (t.roleCounts[
                                                                    skill
                                                                  ] || 0) + 1,
                                                              },
                                                            }
                                                          : t,
                                                    ),
                                                  }
                                                : p,
                                            ),
                                          );
                                        }}
                                        className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200"
                                      >
                                        <Plus size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 pb-8 md:p-8 border-t border-slate-100 bg-white shrink-0 z-10 flex gap-3">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-6 py-4 md:py-5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkCreateWeekly}
                className="flex-1 py-4 md:py-5 bg-amber-500 text-slate-900 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl shadow-amber-500/20 hover:bg-amber-400 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Layers size={18} />{" "}
                <span className="hidden sm:inline">Generate Bulk Shifts</span>
                <span className="sm:hidden">Generate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
