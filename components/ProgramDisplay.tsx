import React, { useState, useEffect } from "react";
import {
  DailyProgram,
  Flight,
  Staff,
  ShiftConfig,
  LeaveRequest,
  IncomingDuty,
  Skill,
  ProgramVersion,
  ManualAssignment,
} from "../types";
import {
  FileDown,
  CalendarDays,
  Users,
  Plane,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Printer,
  Clock,
  RotateCcw,
  Save,
  History,
  Trash2,
  Eye,
  Lock,
  Unlock,
  ShieldCheck,
  MessageSquare,
  X,
} from "lucide-react";
import { DAYS_OF_WEEK_FULL, AVAILABLE_SKILLS } from "../constants";
import { db, supabase } from "../services/supabaseService";

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests: LeaveRequest[];
  incomingDuties: IncomingDuty[];
  manualAssignments?: ManualAssignment[];
  startDate: string;
  endDate: string;
  stationHealth: number;
  alerts: { type: "danger" | "warning"; message: string }[];
  minRestHours: number;
  onUpdatePrograms: (p: DailyProgram[]) => void;
  onRestoreVersion: (v: ProgramVersion) => void;
  onUpdateLeaves?: (l: LeaveRequest[]) => void;
}

export const ProgramDisplay: React.FC<Props> = ({
  programs,
  flights,
  staff,
  shifts,
  leaveRequests,
  incomingDuties,
  manualAssignments = [],
  startDate,
  endDate,
  stationHealth,
  minRestHours,
  onUpdatePrograms,
  onRestoreVersion,
  onUpdateLeaves,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingStaffPdf, setIsGeneratingStaffPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [versions, setVersions] = useState<ProgramVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "Daily" | "Matrix" | "Roles" | "Staff Checks"
  >("Daily");
  const [unlockAbsences, setUnlockAbsences] = useState(false);
  const [noteModal, setNoteModal] = useState<{dateString: string, shiftId: string, currentNote: string} | null>(null);

  const [referencePrograms, setReferencePrograms] = useState<DailyProgram[]>(
    () => {
      try {
        const stored = localStorage.getItem("skyops_reference_programs");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
      return programs;
    },
  );

  useEffect(() => {
    if (referencePrograms.length === 0 && programs.length > 0) {
      setReferencePrograms(programs);
      localStorage.setItem(
        "skyops_reference_programs",
        JSON.stringify(programs),
      );
    }
  }, [programs, referencePrograms]);

  const handleMarkAllCopied = () => {
    setReferencePrograms(programs);
    localStorage.setItem("skyops_reference_programs", JSON.stringify(programs));
  };

  useEffect(() => {
    const loadVersions = async () => {
      if (supabase) {
        const dbVersions = await db.getProgramVersions();
        if (dbVersions.length > 0) {
          setVersions(dbVersions);
          return;
        }
      }
      const saved = localStorage.getItem("skyops_program_versions");
      if (saved) {
        try {
          setVersions(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to load versions", e);
        }
      }
    };
    loadVersions();
  }, []);

  const saveVersion = async () => {
    const name = prompt(
      "Enter a name for this version (e.g., 'Draft 1', 'Final Approval'):",
      `Version ${versions.length + 1}`,
    );
    if (!name) return;

    const newVersion: ProgramVersion = {
      id: Math.random().toString(36).substr(2, 9),
      versionNumber: versions.length + 1,
      name,
      createdAt: new Date().toISOString(),
      periodStart: startDate,
      periodEnd: endDate,
      programs: JSON.parse(JSON.stringify(programs)),
      stationHealth,
      isAutoSave: false,
    };

    const updatedVersions = [newVersion, ...versions];
    setVersions(updatedVersions);
    localStorage.setItem(
      "skyops_program_versions",
      JSON.stringify(updatedVersions),
    );
    if (supabase) {
      await db.saveProgramVersion(newVersion);
    }
  };

  const deleteVersion = async (id: string) => {
    if (!confirm("Are you sure you want to delete this version?")) return;
    const updated = versions.filter((v) => v.id !== id);
    setVersions(updated);
    localStorage.setItem("skyops_program_versions", JSON.stringify(updated));
    if (supabase) {
      await db.deleteProgramVersion(id);
    }
  };

  const restoreVersion = (v: ProgramVersion) => {
    if (
      !confirm(
        `Restore version "${v.name}"? Current unsaved changes will be lost.`,
      )
    )
      return;
    onRestoreVersion(v);
    setShowHistory(false);
  };

  const activeStaff = React.useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);

  const getStaff = (id: string) => activeStaff.find((s) => s.id === id);
  const getFlight = (id: string) => flights.find((f) => f.id === id);
  const getShift = (id: string) => shifts.find((s) => s.id === id);

  const sortAssignments = (assignments: any[]) => {
    return [...assignments].sort((a, b) => {
      const stA = getStaff(a.staffId);
      const stB = getStaff(b.staffId);
      if (!stA && !stB) return 0;
      if (!stA) return 1;
      if (!stB) return -1;

      // Group ranks: 1 = Traffic, 2 = Security, 3 = Labour
      const getGroupRank = (st: any) => {
        if (st.isLabour) return 3;
        if (st.isSecurity) return 2;
        return 1; // Traffic staff (includes other non-labour/non-security roles)
      };

      const rankA = getGroupRank(stA);
      const rankB = getGroupRank(stB);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // Within Traffic group, keep Shift Leaders and Load Control first
      if (rankA === 1) {
        const getTrafficSubRank = (assig: any, st: any) => {
          if (
            assig.role === "SL" ||
            assig.role === "Shift Leader" ||
            st.isShiftLeader ||
            st.initials.toUpperCase() === "SK-ATZ"
          )
            return 1;
          if (
            assig.role === "LC" ||
            assig.role === "Load Control" ||
            st.isLoadControl
          )
            return 2;
          return 3;
        };
        const subRankA = getTrafficSubRank(a, stA);
        const subRankB = getTrafficSubRank(b, stB);
        if (subRankA !== subRankB) {
          return subRankA - subRankB;
        }
      }

      // Respect manual sort index if they differ
      const aSort = a.manualSortIndex || 0;
      const bSort = b.manualSortIndex || 0;
      if (aSort !== bSort) {
        return aSort - bSort;
      }

      // Fallback: alphabetical by initials
      return (stA.initials || "").localeCompare(stB.initials || "");
    });
  };

  const sortAssignmentsForPDF = (assignments: any[]) => {
    return [...assignments].sort((a, b) => {
      const aSort = a.manualSortIndex || 0;
      const bSort = b.manualSortIndex || 0;
      if (aSort !== bSort) {
        return aSort - bSort;
      }

      const stA = getStaff(a.staffId);
      const stB = getStaff(b.staffId);
      const score = (assig: any, st: any) => {
        if (!st) return 100;
        if (
          assig.role === "SL" ||
          assig.role === "Shift Leader" ||
          st.isShiftLeader ||
          st.initials.toUpperCase() === "SK-ATZ"
        )
          return 1;
        if (
          assig.role === "LC" ||
          assig.role === "Load Control" ||
          st.isLoadControl
        )
          return 2;
        if (st.isLabour) return 10;
        return 5;
      };
      return score(a, stA) - score(b, stB);
    });
  };

  const getShiftHours = (shiftId: string) => {
    const shift = getShift(shiftId);
    if (!shift) return 0;
    const [ph, pm] = shift.pickupTime.split(":").map(Number);
    const [sh, sm] = shift.endTime.split(":").map(Number);
    let hours = sh - ph + (sm - pm) / 60;
    if (sh < ph) hours += 24;
    return hours;
  };

  const getStaffTotalHours = (staffId: string) => {
    return activePrograms.reduce((acc, p) => {
      const assign = p.assignments.find((a) => a.staffId === staffId);
      if (assign) {
        return acc + getShiftHours(assign.shiftId || "");
      }
      return acc;
    }, 0);
  };

  const activePrograms = React.useMemo(() => {
    const map = new Map<string, DailyProgram>();
    programs.forEach((p) => {
      if (p.dateString && p.dateString >= startDate && p.dateString <= endDate) {
        map.set(p.dateString, p);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.dateString || "").localeCompare(b.dateString || "")
    );
  }, [programs, startDate, endDate]);

  const leaveMapByStaff = React.useMemo(() => {
    const map: Record<string, LeaveRequest[]> = {};
    leaveRequests.forEach((l) => {
      if (!map[l.staffId]) map[l.staffId] = [];
      map[l.staffId].push(l);
    });
    return map;
  }, [leaveRequests]);

  const hasLeaveOnDate = React.useCallback(
    (staffId: string, dateString: string, excludeDayOff = false) => {
      const leaves = leaveMapByStaff[staffId];
      if (!leaves) return null;
      return leaves.find((l) => {
        if (excludeDayOff && l.type === "Day off") return false;
        return l.startDate <= dateString && l.endDate >= dateString;
      });
    },
    [leaveMapByStaff],
  );

  const totalAssignments = activePrograms.reduce(
    (acc, p) => acc + p.assignments.length,
    0,
  );
  const isFailedGeneration =
    activePrograms.length > 0 && totalAssignments === 0;

  const incomingDutiesByStaff = React.useMemo(() => {
    const map: Record<string, IncomingDuty[]> = {};
    incomingDuties.forEach(d => {
      if (!map[d.staffId]) map[d.staffId] = [];
      map[d.staffId].push(d);
    });
    return map;
  }, [incomingDuties]);

  const assignmentsByStaff = React.useMemo(() => {
    const map: Record<string, { shiftId: string; dateString: string }[]> = {};
    programs.forEach(p => {
      const pDate = p.dateString || startDate;
      p.assignments.forEach(a => {
        if (!map[a.staffId]) map[a.staffId] = [];
        map[a.staffId].push({ shiftId: a.shiftId || "", dateString: pDate });
      });
    });
    return map;
  }, [programs, startDate]);

  const calculateRestHours = (
    staffId: string,
    currentShiftStart: Date,
  ): number | null => {
    let lastEndTime: Date | null = null;
    const staffIncoming = incomingDutiesByStaff[staffId] || [];
    
    staffIncoming.forEach((d) => {
      const dateStr = d.date || startDate;
      const dt = new Date(`${dateStr}T${d.shiftEndTime}`);
      if (dt <= currentShiftStart && (!lastEndTime || dt > lastEndTime)) {
        lastEndTime = dt;
      }
    });

    const assigns = assignmentsByStaff[staffId] || [];
    assigns.forEach((a) => {
      const s = getShift(a.shiftId);
      if (s) {
        const [sh, sm] = s.endTime.split(":").map(Number);
        const [ph, pm] = s.pickupTime.split(":").map(Number);
        const startDt = new Date(a.dateString);
        startDt.setHours(ph, pm, 0, 0);
        const endDt = new Date(a.dateString);
        endDt.setHours(sh, sm, 0, 0);
        if (sh < ph) endDt.setDate(endDt.getDate() + 1);
        
        // We only consider previous shifts (ones that started before this current one).
        // If they end after currentShiftStart, diffMs will be negative and throw a warning.
        if (
          startDt < currentShiftStart &&
          (!lastEndTime || endDt > lastEndTime)
        ) {
          lastEndTime = endDt;
        }
      }
    });
    
    if (!lastEndTime) return null;
    const diffMs = currentShiftStart.getTime() - (lastEndTime as Date).getTime();
    return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
  };

  const generateFullReport = async () => {
    setIsGeneratingPdf(true);
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF("l", "mm", "a4");

    // --- 1. DAILY PROGRAM PAGES ---
    activePrograms.forEach((prog, index) => {
      if (index > 0) doc.addPage();

      const currentDate = new Date(prog.dateString || startDate);
      const dateStr = `${DAYS_OF_WEEK_FULL[currentDate.getUTCDay()].toUpperCase()} - ${currentDate.getUTCDate()}/${currentDate.getUTCMonth() + 1}/${currentDate.getUTCFullYear()}`;

      // Header
      doc.setFillColor(255, 255, 255);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("SkyOPS Station Handling Program", 14, 15);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 22);

      let contentStartY = 35;

      // --- REST LOG TABLE ---
      if (index === 0) {
        const groupedMap = new Map<string, string[]>();

        incomingDuties.forEach((d) => {
          const dateStr = d.date || startDate;
          const dDate = new Date(dateStr);
          const sDate = new Date(startDate);
          const diffTime = sDate.getTime() - dDate.getTime();
          const diffDays = diffTime / (1000 * 3600 * 24);

          if (diffDays >= 0 && diffDays <= 2) {
            const key = `${dateStr}|${d.shiftEndTime}`;
            const st = getStaff(d.staffId);
            if (st) {
              const existing = groupedMap.get(key) || [];
              existing.push(st.initials);
              groupedMap.set(key, existing);
            }
          }
        });

        const sortedKeys = Array.from(groupedMap.keys()).sort();

        if (sortedKeys.length > 0) {
          const restRows = sortedKeys.map((key, i) => {
            const [dDate, dTime] = key.split("|");
            const endDt = new Date(`${dDate}T${dTime}`);
            const releaseDt = new Date(
              endDt.getTime() + minRestHours * 60 * 60 * 1000,
            );

            const isPrevDay = new Date(dDate) < new Date(startDate);
            const dateLabel = isPrevDay
              ? "Prev Day"
              : `${endDt.getDate()}/${endDt.getMonth() + 1}`;
            const releaseDateLabel =
              releaseDt.getDate() !== endDt.getDate()
                ? releaseDt.getDate() === new Date(startDate).getDate()
                  ? ""
                  : `${releaseDt.getDate()}/${releaseDt.getMonth() + 1}`
                : "";

            const initials = groupedMap.get(key)?.join("-") || "";
            const hc = groupedMap.get(key)?.length || 0;

            return [
              (i + 1).toString(),
              `${dTime} (${dateLabel})`,
              `${releaseDt.getHours().toString().padStart(2, "0")}:${releaseDt.getMinutes().toString().padStart(2, "0")} ${releaseDateLabel}`,
              hc.toString(),
              initials,
            ];
          });

          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text(
            "PREVIOUS DAY SHIFTS (INCOMING HANDOVER)",
            14,
            contentStartY - 2,
          );

          autoTable(doc, {
            startY: contentStartY,
            head: [
              ["S/N", "SHIFT END", "RELEASE", "HC", "PERSONNEL (REST LOG)"],
            ],
            body: restRows,
            theme: "grid",
            headStyles: {
              fillColor: [255, 204, 0],
              textColor: [0, 0, 0],
              fontStyle: "bold",
              fontSize: 8,
              lineWidth: 0.1,
              lineColor: [0, 0, 0],
            },
            styles: {
              fontSize: 8,
              cellPadding: 1.5,
              textColor: [0, 0, 0],
              lineColor: [0, 0, 0],
              lineWidth: 0.1,
              fillColor: [255, 255, 235],
              valign: "middle",
            },
            columnStyles: {
              0: { cellWidth: 10, halign: "center" },
              1: { cellWidth: 35 },
              2: { cellWidth: 35 },
              3: { cellWidth: 15, halign: "center", fontStyle: "bold" },
              4: { cellWidth: "auto" },
            },
            margin: { left: 14, right: 14 },
          });
          contentStartY = (doc as any).lastAutoTable.finalY + 10;
        }
      }

      const workingIds = new Set(prog.assignments.map((a) => a.staffId));
      const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
      const pdfCategories: Record<string, string[]> = {
        "DAYS OFF": [],
        "ROSTER LEAVE": [],
        "ANNUAL LEAVE": [],
        "SICK LEAVE": [],
        "STANDBY (RESERVE)": [],
      };

      offStaff.forEach((s) => {
        const leave = hasLeaveOnDate(s.id, prog.dateString!);
        let count = 1;
        if (leave) {
          const start = new Date(leave.startDate);
          const current = new Date(prog.dateString!);
          count =
            Math.floor(
              (current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
            ) + 1;
        } else {
          for (let i = index - 1; i >= 0; i--) {
            const prevProg = activePrograms[i];
            const worked = prevProg.assignments.some((a) => a.staffId === s.id);
            const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString!);
            if (!worked && !prevLeave) count++;
            else break;
          }
        }
        const label = s.initials;
        let isRosterOutOfContract = false;
        if (s.type === "Roster") {
          if (s.rosterPeriods && s.rosterPeriods.length > 0) {
            isRosterOutOfContract = !s.rosterPeriods.some(
              (p) => prog.dateString! >= p.start && prog.dateString! <= p.end,
            );
          } else if (s.workFromDate && s.workToDate) {
            isRosterOutOfContract =
              prog.dateString! < s.workFromDate ||
              prog.dateString! > s.workToDate;
          }
        }

        if (leave) {
          if (leave.type === "Annual leave")
            pdfCategories["ANNUAL LEAVE"].push(label);
          else if (leave.type === "Roster leave")
            pdfCategories["ROSTER LEAVE"].push(label);
          else if (leave.type === "Sick leave")
            pdfCategories["SICK LEAVE"].push(label);
          else pdfCategories["DAYS OFF"].push(label);
        } else if (isRosterOutOfContract) {
          pdfCategories["ROSTER LEAVE"].push(label);
        } else {
          if (s.type === "Local") pdfCategories["DAYS OFF"].push(label);
          else pdfCategories["STANDBY (RESERVE)"].push(label);
        }
      });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(dateStr, 14, contentStartY);

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(70, 70, 70);
      const statsText = `HEADCOUNT RECONCILIATION: Total Registered: ${staff.length} | Working: ${workingIds.size} | Days Off: ${pdfCategories["DAYS OFF"].length} | Annual Leave: ${pdfCategories["ANNUAL LEAVE"].length} | Sick Leave: ${pdfCategories["SICK LEAVE"].length} | Standby: ${pdfCategories["STANDBY (RESERVE)"].length} | Roster Leave: ${pdfCategories["ROSTER LEAVE"].length}`;
      doc.text(statsText, 14, contentStartY + 5);

      contentStartY += 10;

      const shiftsToday = shifts
        .filter((s) => s.pickupDate === prog.dateString)
        .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
      const tableData = shiftsToday.map((shift, idx) => {
        const assignments = sortAssignmentsForPDF(prog.assignments.filter(
          (a) => a.shiftId === shift.id,
        ));
        const nonLabourCount = assignments.filter((a) => {
          const st = getStaff(a.staffId);
          return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        const flightStrs =
          (shift.flightIds || [])
            .map((fid) => getFlight(fid))
            .filter(Boolean)
            .sort((a, b) => (a!.sta || "23:59").localeCompare(b!.sta || "23:59"))
            .map((f) => f!.flightNumber)
            .join(" / ") || "NIL";

        const personnelStrs = assignments
          .map((a) => {
            const st = getStaff(a.staffId);
            if (!st) return "";
            return st.initials;
          })
          .join("-");

        const roleChecks = Object.entries(shift.roleCounts || {})
          .filter(([_, count]) => count > 0)
          .map(([role, count]) => {
            let roleKey = role;
            if (role === "Load Control") roleKey = "LC";
            if (role === "Shift Leader") roleKey = "SL";
            if (role === "Ramp") roleKey = "RMP";
            if (role === "Operations") roleKey = "OPS";
            if (role === "Lost and Found") roleKey = "LF";
            if (role === "Labour") roleKey = "LBR";
            if (role === "Security") roleKey = "SEC";
            if (role === "Driver") roleKey = "DRV";
            if (role === "Accountant") roleKey = "ACC";
 
            const fulfilledCount = assignments.filter((a) => {
              const st = getStaff(a.staffId);
              if (!st) return false;
              if (a.role === roleKey || a.role === role) return true;
              if (
                roleKey === "LC" &&
                (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")
              )
                return true;
              if (
                roleKey === "SL" &&
                (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")
              )
                return true;
              if (roleKey === "RMP" && st.isRamp) return true;
              if (roleKey === "OPS" && st.isOps) return true;
              if (roleKey === "LF" && st.isLostFound) return true;
              if ((roleKey === "LBR" || roleKey === "Labour") && st.isLabour)
                return true;
              if ((roleKey === "DRV" || roleKey === "Driver") && st.isDriver)
                return true;
              if ((roleKey === "SEC" || roleKey === "Security") && st.isSecurity)
                return true;
              if ((roleKey === "ACC" || roleKey === "Accountant") && st.isAccountant)
                return true;
              return false;
            }).length;
            const isFulfilled = fulfilledCount >= count;
            return `${roleKey} ${isFulfilled ? "(OK)" : "(X)"}`;
          });

        const reqStr =
          roleChecks.length > 0 ? `\nReq: ${roleChecks.join(" | ")}` : "";

        return [
          (idx + 1).toString(),
          shift.pickupTime,
          shift.endTime,
          flightStrs,
          `${nonLabourCount} / ${shift.maxStaff}`,
          personnelStrs + reqStr,
        ];
      });

      autoTable(doc, {
        startY: contentStartY,
        head: [
          [
            "S/N",
            "PICKUP",
            "RELEASE",
            "FLIGHTS",
            "HC / MAX",
            "PERSONNEL & ASSIGNED ROLES",
          ],
        ],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [0, 0, 0],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: "auto" },
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      if (finalY > 180) doc.addPage();

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("ABSENCE AND REST REGISTRY", 14, finalY);

      const registryData = [
        ["DAYS OFF", pdfCategories["DAYS OFF"].join("-") || "NIL"],
        ["ROSTER LEAVE", pdfCategories["ROSTER LEAVE"].join("-") || "NIL"],
        ["ANNUAL LEAVE", pdfCategories["ANNUAL LEAVE"].join("-") || "NIL"],
        ["SICK LEAVE", pdfCategories["SICK LEAVE"].join("-") || "NIL"],
        [
          "STANDBY (RESERVE)",
          pdfCategories["STANDBY (RESERVE)"].join("-") || "NIL",
        ],
      ];

      autoTable(doc, {
        startY: finalY + 2,
        head: [["STATUS CATEGORY", "PERSONNEL INITIALS"]],
        body: registryData,
        theme: "grid",
        headStyles: { fillColor: [50, 50, 60], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
        columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
      });
    });

    // --- 2. WEEKLY AUDITS ---
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Weekly Personnel Utilization Audit (Local)", 14, 15);
    const localStaff = activeStaff.filter((s) => s.type === "Local");
    const localAuditData = localStaff.map((s, idx) => {
      const shiftsWorked = activePrograms.reduce(
        (acc, p) =>
          acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
        0,
      );
      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
        if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
          excusedLeaves++;
      });
      const daysOff = activePrograms.length - shiftsWorked - excusedLeaves;
      const targetShifts = 5 - excusedLeaves;
      const targetOff = 2;
      const isMatch = shiftsWorked === targetShifts && daysOff === targetOff;
      const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
      return [
        (idx + 1).toString(),
        s.name,
        s.initials,
        shiftsWorked.toString(),
        daysOff.toString(),
        leavesText,
        isMatch ? "MATCH" : "CHECK",
      ];
    });
    autoTable(doc, {
      startY: 20,
      head: [
        ["S/N", "NAME", "INIT", "WORK SHIFTS", "OFF DAYS", "LEAVES", "STATUS"],
      ],
      body: localAuditData,
      theme: "striped",
      headStyles: { fillColor: [0, 0, 0] },
      styles: { fontSize: 9, halign: "center" },
      columnStyles: { 1: { halign: "left" } },
      didParseCell: (data) => {
        if (data.section === "body") {
          const status = (data.row.raw as string[])[6];
          if (status === "MATCH") {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (status === "CHECK") {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      },
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Weekly Personnel Utilization Audit (Roster)", 14, 15);
    const rosterStaff = activeStaff.filter((s) => s.type === "Roster");
    const rosterAuditData = rosterStaff.map((s, idx) => {
      const shiftsWorked = activePrograms.reduce(
        (acc, p) =>
          acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
        0,
      );
      const progStart = new Date(startDate);
      const progEnd = new Date(endDate);
      const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
      const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
      const overlapStart = workFrom > progStart ? workFrom : progStart;
      const overlapEnd = workTo < progEnd ? workTo : progEnd;
      let potential = 0;
      if (overlapStart <= overlapEnd) {
        potential =
          Math.floor(
            (overlapEnd.getTime() - overlapStart.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
      }

      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const d = new Date(p.dateString!);
        if (d >= overlapStart && d <= overlapEnd) {
          const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
          if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
            excusedLeaves++;
        }
      });

      const isMatch = shiftsWorked === potential - excusedLeaves;
      const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
      return [
        (idx + 1).toString(),
        s.name,
        s.initials,
        s.workFromDate || "N/A",
        s.workToDate || "N/A",
        potential.toString(),
        shiftsWorked.toString(),
        leavesText,
        isMatch ? "MATCH" : "CHECK",
      ];
    });
    autoTable(doc, {
      startY: 20,
      head: [
        [
          "S/N",
          "NAME",
          "INIT",
          "WORK FROM",
          "WORK TO",
          "POTENTIAL",
          "ACTUAL",
          "LEAVES",
          "STATUS",
        ],
      ],
      body: rosterAuditData,
      theme: "striped",
      headStyles: { fillColor: [0, 0, 0] },
      styles: { fontSize: 9, halign: "center" },
      columnStyles: { 1: { halign: "left" } },
      didParseCell: (data) => {
        if (data.section === "body") {
          const status = (data.row.raw as string[])[8];
          if (status === "MATCH") {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (status === "CHECK") {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      },
    });

    // --- 3. MATRIX & ROLE FULFILLMENT ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Weekly Operations Matrix View", 14, 15);
    const dateHeaders = activePrograms.map((p) => {
      const d = new Date(p.dateString || startDate);
      return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    });
    const matrixHead = [["S/N", "AGENT", ...dateHeaders, "AUDIT"]];

    const sortedMatrixStaffPdf = [...staff]
      .map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id),
      }))
      .sort((a, b) => a.totalHours - b.totalHours);

    const matrixBody = sortedMatrixStaffPdf.map((s, idx) => {
      const row = [
        (idx + 1).toString(),
        `${s.initials} (${s.type === "Local" ? "L" : "R"})`,
      ];
      let workedCount = 0;
      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
        if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
          excusedLeaves++;
        const assign = p.assignments.find((a) => a.staffId === s.id);
        if (assign) {
          workedCount++;
          const shift = getShift(assign.shiftId || "");
          if (shift) {
            const pDate = new Date(p.dateString!);
            const [ph, pm] = shift.pickupTime.split(":").map(Number);
            const shiftStart = new Date(pDate);
            shiftStart.setHours(ph, pm, 0, 0);
            const rest = calculateRestHours(s.id, shiftStart);
            const restLabel = rest !== null ? `[${rest.toFixed(1)}H]` : "";
            row.push(`${shift.pickupTime} ${restLabel}`);
          } else {
            row.push("ERR");
          }
        } else {
          row.push("-");
        }
      });
      row.push(
        `${workedCount}/${activePrograms.length} [${s.totalHours.toFixed(1)}H]${excusedLeaves > 0 ? ` (+${excusedLeaves} AL)` : ""}`,
      );
      return row;
    });
    autoTable(doc, {
      startY: 20,
      head: matrixHead,
      body: matrixBody,
      theme: "grid",
      headStyles: { fillColor: [220, 100, 0] },
      styles: { fontSize: 7, halign: "center", cellPadding: 1.5 },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (
          data.section === "head" &&
          data.column.index === dateHeaders.length + 2
        ) {
          data.cell.styles.fillColor = [79, 70, 229]; // indigo-600
        }
        if (data.section === "body") {
          if (data.column.index === dateHeaders.length + 2) {
            data.cell.styles.fillColor = [238, 242, 255]; // indigo-50
            data.cell.styles.textColor = [49, 46, 129]; // indigo-900
            data.cell.styles.fontStyle = "bold";
          } else if (
            data.column.index > 1 &&
            data.column.index < dateHeaders.length + 2
          ) {
            const text = data.cell.raw as string;
            if (text && text.includes("[")) {
              const match = text.match(/\[([\d.]+)H\]/);
              if (match) {
                const rest = parseFloat(match[1]);
                if (rest < minRestHours) {
                  data.cell.styles.fillColor = [220, 38, 38];
                  data.cell.styles.textColor = [255, 255, 255];
                  data.cell.styles.fontStyle = "bold";
                }
              }
            }
          }
        }
      },
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Specialist Role Fulfillment Matrix", 14, 15);
    const roleMatrixData: any[] = [];
    const roleMatrixMeta: any[] = [];

    activePrograms.forEach((p) => {
      const d = new Date(p.dateString || startDate);
      const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      const shiftsToday = shifts
        .filter((s) => s.pickupDate === p.dateString)
        .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
      shiftsToday.forEach((s) => {
        const assignments = p.assignments.filter((a) => a.shiftId === s.id);
        const coversRole = (a: any, targetRole: string) => {
          const st = getStaff(a.staffId);
          if (!st) return false;
          const roleCode =
            targetRole === "Shift Leader"
              ? "SL"
              : targetRole === "Load Control"
                ? "LC"
                : targetRole === "Ramp"
                  ? "RMP"
                  : targetRole === "Operations"
                    ? "OPS"
                    : targetRole === "Lost and Found"
                      ? "LF"
                      : targetRole === "Accountant"
                        ? "ACC"
                        : targetRole;

          // If looking for a specialist role, strictly enforce the profile flag
          if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
          if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
          if (roleCode === "RMP" && !st.isRamp) return false;
          if (roleCode === "OPS" && !st.isOps) return false;
          if (roleCode === "LF" && !st.isLostFound) return false;
          if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;
          if ((roleCode === "Driver" || roleCode === "DRV") && !st.isDriver) return false;
          if ((roleCode === "Security" || roleCode === "SEC") && !st.isSecurity) return false;
          if ((roleCode === "Accountant" || roleCode === "ACC") && !st.isAccountant) return false;

          if (a.role === roleCode || a.role === targetRole) return true;

          // Fallback if they are just on shift but not explicitly assigned to role, check if they can cover
          if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
          if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
          if (roleCode === "RMP" && st.isRamp) return true;
          if (roleCode === "OPS" && st.isOps) return true;
          if (roleCode === "LF" && st.isLostFound) return true;
          if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
          if ((roleCode === "Driver" || roleCode === "DRV") && st.isDriver) return true;
          if ((roleCode === "Security" || roleCode === "SEC") && st.isSecurity) return true;
          if ((roleCode === "Accountant" || roleCode === "ACC") && st.isAccountant) return true;

          return false;
        };
        const getStaffForRole = (role: string) => {
          return assignments
            .filter((a) => coversRole(a, role))
            .map((a) => getStaff(a.staffId)?.initials)
            .filter(Boolean)
            .join(", ");
        };
        const sl = getStaffForRole("Shift Leader");
        const lc = getStaffForRole("Load Control");
        const rmp = getStaffForRole("Ramp");
        const ops = getStaffForRole("Operations");
        const lf = getStaffForRole("Lost and Found");
        const drv = getStaffForRole("Driver");
        const sec = getStaffForRole("Security");
        
        roleMatrixData.push([
          dateLabel,
          `${s.pickupTime}-${s.endTime}`,
          sl,
          lc,
          rmp,
          ops,
          lf,
          drv,
          sec,
        ]);
        roleMatrixMeta.push({
          slReq:
            (s.roleCounts?.["Shift Leader"] ||
              (s.roleCounts as any)?.["SL"] ||
              0) > 0,
          lcReq:
            (s.roleCounts?.["Load Control"] ||
              (s.roleCounts as any)?.["LC"] ||
              0) > 0,
          rmpReq:
            (s.roleCounts?.["Ramp"] || (s.roleCounts as any)?.["RMP"] || 0) > 0,
          opsReq:
            (s.roleCounts?.["Operations"] ||
              (s.roleCounts as any)?.["OPS"] ||
              0) > 0,
          lfReq:
            (s.roleCounts?.["Lost and Found"] ||
              (s.roleCounts as any)?.["LF"] ||
              0) > 0,
          drvReq:
            (s.roleCounts?.["Driver"] ||
              (s.roleCounts as any)?.["DRV"] ||
              0) > 0,
          secReq:
            (s.roleCounts?.["Security"] ||
              (s.roleCounts as any)?.["SEC"] ||
              0) > 0,
        });
      });
    });
    autoTable(doc, {
      startY: 20,
      head: [["DATE", "SHIFT", "SL", "LC", "RMP", "OPS", "LF", "DRV", "SEC"]],
      body: roleMatrixData,
      theme: "grid",
      headStyles: { fillColor: [0, 0, 0] },
      styles: {
        fontSize: 7,
        halign: "center",
        valign: "middle",
        cellPadding: 1.5,
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index > 1) {
          const rowIndex = data.row.index;
          const meta = roleMatrixMeta[rowIndex];
          if (!meta) return;
          const colIdx = data.column.index;
          let isRequired = false;
          if (colIdx === 2) isRequired = meta.slReq;
          if (colIdx === 3) isRequired = meta.lcReq;
          if (colIdx === 4) isRequired = meta.rmpReq;
          if (colIdx === 5) isRequired = meta.opsReq;
          if (colIdx === 6) isRequired = meta.lfReq;
          const content = data.cell.raw as string;
          const hasContent = content && content.length > 0;
          if (hasContent) {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (isRequired) {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.text = ["MISSING"];
          }
        }
      },
    });

    // --- 4. REQUESTED SHIFTS (MANUAL ASSIGNMENTS) ---
    if (manualAssignments && manualAssignments.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Requested Shifts (Pre-Assigned)", 14, 15);

      const requestedShiftsData = manualAssignments.map((ma) => {
        const st = activeStaff.find((s) => s.id === ma.staffId);
        const sh = shifts.find((s) => s.id === ma.shiftId);
        const staffName = st ? `${st.initials} - ${st.name}` : ma.staffId;
        const shiftDetails = sh
          ? `${sh.pickupDate} ${sh.pickupTime}-${sh.endTime}`
          : ma.shiftId;
        return [staffName, shiftDetails, "Done"];
      });

      autoTable(doc, {
        startY: 20,
        head: [["STAFF MEMBER", "REQUESTED SHIFT", "STATUS"]],
        body: requestedShiftsData,
        theme: "grid",
        headStyles: { fillColor: [0, 0, 0] },
        styles: {
          fontSize: 9,
          halign: "center",
          valign: "middle",
          cellPadding: 2,
        },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 2) {
            data.cell.styles.fillColor = [22, 163, 74]; // Emerald green
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
    }

    doc.save(`SkyOPS_Full_Report_${startDate}.pdf`);
    setIsGeneratingPdf(false);
  };

  const generateStaffExcelReport = async () => {
    setIsGeneratingExcel(true);
    try {
      const ExcelJS = await import("exceljs");
      const { saveAs } = await import("file-saver");
      
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Staff Program", {
        pageSetup: {
          paperSize: 9, 
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0, footer: 0 }
        }
      });
      
      const profile = await db.getUserProfile();
      
      sheet.columns = [
        { width: 10 }, { width: 18 }, { width: 10 }, { width: 10 },
        { width: 10 }, { width: 10 }, { width: 15 }, { width: 60 }
      ];

      const row1 = sheet.addRow([]);
      row1.height = 45;
      
      sheet.mergeCells('B1:G1');
      const titleCell = sheet.getCell('B1');
      titleCell.value = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
      titleCell.font = { name: 'Arial', size: 15, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (profile?.companyLogo) {
        const base64Data = profile.companyLogo.split(';base64,')[1];
        const extMatch = profile.companyLogo.match(/image\/(jpeg|png)/);
        const extension = extMatch ? extMatch[1] : 'png';
        const imgId = workbook.addImage({ base64: base64Data, extension: extension as any });
        sheet.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 60, height: 45 } });
      }
      
      if (profile?.skyopsLogo) {
        const base64Data = profile.skyopsLogo.split(';base64,')[1];
        const extMatch = profile.skyopsLogo.match(/image\/(jpeg|png)/);
        const extension = extMatch ? extMatch[1] : 'png';
        const imgId = workbook.addImage({ base64: base64Data, extension: extension as any });
        sheet.addImage(imgId, { tl: { col: 7.1, row: 0.1 }, ext: { width: 60, height: 45 } });
      }

      const headers = ["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment (staff initials)"];
      const headerRow = sheet.addRow(headers);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      activePrograms.forEach(prog => {
        const d = new Date(prog.dateString || startDate);
        const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
        const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString('default', { month: 'short' }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
        
        const dayRow = sheet.addRow([`${dayName} ${dateFormatted}`, "", "", "", "", "", "", ""]);
        sheet.mergeCells(`A${dayRow.number}:H${dayRow.number}`);
        const dayHeaderCell = sheet.getCell(`A${dayRow.number}`);
        dayHeaderCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        dayHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        dayHeaderCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        dayHeaderCell.alignment = { vertical: 'middle', horizontal: 'center' };
        dayRow.height = 24;
        
        const categories = {
          "Day off": [] as string[],
          "Annual": [] as string[],
          "Lieu": [] as string[],
          "Sick Leave": [] as string[]
        };

        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));

        offStaff.forEach(s => {
          const leave = hasLeaveOnDate(s.id, prog.dateString!);
          let isRosterOutOfContract = false;
          if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
          if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;
          
          let mappedCat = "";
          if (leave) {
            if (leave.type === "Annual leave") mappedCat = "Annual";
            else if (leave.type === "Roster leave") mappedCat = "Lieu";
            else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
            else mappedCat = "Day off";
          } else if (isRosterOutOfContract) {
            mappedCat = "Lieu";
          } else {
            if (s.type === "Local") mappedCat = "Day off";
          }

          if (mappedCat && (categories as any)[mappedCat]) {
            (categories as any)[mappedCat].push(s.initials);
          }
        });

        const absenceRowsData: { category: string, label: string, initials: string[] }[] = [];
        if (categories["Day off"].length > 0) {
          absenceRowsData.push({ category: "Day off", label: "DAY OFF", initials: categories["Day off"] });
        }
        if (categories["Annual"].length > 0) {
          absenceRowsData.push({ category: "Annual", label: "ANNUAL LEAVE", initials: categories["Annual"] });
        }
        if (categories["Lieu"].length > 0) {
          absenceRowsData.push({ category: "Lieu", label: "ROSTER LEAVE", initials: categories["Lieu"] });
        }
        if (categories["Sick Leave"].length > 0) {
          absenceRowsData.push({ category: "Sick Leave", label: "SICK LEAVE", initials: categories["Sick Leave"] });
        }

        const shiftsToday = shifts
          .filter((s) => s.pickupDate === prog.dateString)
          .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
          
        shiftsToday.forEach((shift, idx) => {
          const assignments = sortAssignments(prog.assignments.filter(a => a.shiftId === shift.id));
          
          let staffTokens: {text: string, type: string}[] = [];
          assignments.forEach(a => {
             const s = getStaff(a.staffId);
             if (s) {
                 const type = s.isDriver ? 'driver' : s.isLabour ? 'labour' : s.isSecurity ? 'sec' : s.isAccountant ? 'acc' : 'reg';
                 staffTokens.push({ text: s.initials, type });
             }
          });
          
          const flightIds = shift.flightIds || [];
          let fObjs = flightIds.map(fid => getFlight(fid)).filter(Boolean) as Flight[];
          fObjs.sort((a, b) => {
            const getFlightTime = (f: any) => {
              if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                return f.sta;
              }
              if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                return f.std;
              }
              return "23:59";
            };
            return getFlightTime(a).localeCompare(getFlightTime(b));
          });
          if (fObjs.length === 0) fObjs = [{} as Flight];
          
          const startRowNo = sheet.rowCount + 1;
          const addedRows: any[] = [];
          
          fObjs.forEach((f, fIndex) => {
             const rt = sheet.addRow([
                fIndex === 0 ? (idx + 1).toString() : "",
                f.flightNumber ? f.flightNumber.replace("/", " / ") : "",
                f.from || "",
                f.sta || "NS",
                f.std || "---",
                f.to || "",
                fIndex === 0 ? (shift.pickupTime || "N.S") : "",
                "" // staff will be added later
             ]);
             addedRows.push(rt);
             
             rt.eachCell((cell) => {
                 cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                 cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
             });
             
             if (fIndex === 0) {
                 const pickupCell = sheet.getCell(`G${rt.number}`);
                 pickupCell.font = { bold: true, size: 10 };
                 pickupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
             }
          });
          
          const endRowNo = sheet.rowCount;
          
          if (fObjs.length > 1) {
              sheet.mergeCells(`A${startRowNo}:A${endRowNo}`);
              sheet.mergeCells(`G${startRowNo}:G${endRowNo}`);
              sheet.mergeCells(`H${startRowNo}:H${endRowNo}`);
          }
          
          const staffCell = sheet.getCell(`H${startRowNo}`);
          const richText: any[] = [];
          
          const normalTokens = staffTokens.filter(t => t.type === 'reg');
          const accountantTokens = staffTokens.filter(t => t.type === 'acc');
          const labourTokens = staffTokens.filter(t => t.type === 'labour');
          const line1Tokens = [...normalTokens, ...accountantTokens, ...labourTokens];

          const securityTokens = staffTokens.filter(t => t.type === 'sec');
          const driverTokens = staffTokens.filter(t => t.type === 'driver');
          const line2Tokens = [...securityTokens, ...driverTokens];

          const addTokensToRichText = (tokens: typeof staffTokens) => {
              tokens.forEach((t, i) => {
                  let color = 'FF000000';
                  if (t.type === 'driver') color = 'FF15803D';
                  if (t.type === 'labour') color = 'FFB91C1C';
                  if (t.type === 'sec') color = 'FF7E22CE';
                  if (t.type === 'acc') color = 'FF1D4ED8';
                  
                  if (i > 0) richText.push({ text: " - ", font: { color: { argb: 'FF000000' }, bold: true } });
                  richText.push({ text: t.text, font: { color: { argb: color }, bold: true } });
              });
          };

          if (line1Tokens.length > 0) {
              addTokensToRichText(line1Tokens);
          }
          if (line2Tokens.length > 0) {
              if (line1Tokens.length > 0) {
                  richText.push({ text: "\n", font: { bold: true } });
              }
              addTokensToRichText(line2Tokens);
          }
          
          const shiftNote = prog.notes?.[shift.id] || shift.description || "";
          if (shiftNote) {
              if (richText.length > 0) richText.push({ text: "\n" });
              richText.push({ text: shiftNote, font: { color: { argb: 'FFFF0000' }, bold: true } });
          }
          
          if (richText.length > 0) {
              staffCell.value = { richText };
          }
          staffCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          staffCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

          let line1Text = line1Tokens.map(t => t.text).join(" - ");
          let line2Text = line2Tokens.map(t => t.text).join(" - ");
          
          let estimatedLines = 0;
          if (line1Text) estimatedLines += Math.ceil(line1Text.length / 40);
          if (line2Text) estimatedLines += Math.ceil(line2Text.length / 40);
          if (shiftNote) estimatedLines += Math.ceil(shiftNote.length / 40);
          
          let minLines = 1;
          if (line1Text && line2Text) minLines += 1;
          if (shiftNote) minLines += 1;
          estimatedLines = Math.max(minLines, estimatedLines);

          const totalHeightNeeded = Math.max(25, estimatedLines * 18 + 10);
          const perRowHeight = totalHeightNeeded / Math.max(1, fObjs.length);
          
          addedRows.forEach(row => {
              row.height = Math.max(25, perRowHeight);
          });
        });

        // Add absence/leave rows right below the day's physical shifts (Option B - Beside Day Shift)
        absenceRowsData.forEach((absItem) => {
          const initialsText = absItem.initials.join(" - ");
          const note = prog.notes?.[`ABSENCE_${absItem.category}`];
          const fullStaffText = `${initialsText}${note ? ` (${note})` : ""}`;

          const mergedLabel = absItem.label === "DAY OFF" ? "" : absItem.label;
          const absRow = sheet.addRow([
            mergedLabel,       // Merged A-F
            "",                // Flight No/Day
            "",                // From
            "",                // STA
            "",                // STD
            "",                // To
            "OFF-DUTY",        // Pickup Time
            fullStaffText      // SDU Staff Assignment
          ]);

          absRow.eachCell((cell, colNumber) => {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            
            // Pale Amber / Warning background
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // amber-100
            
            if (colNumber === 1) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 }; // amber-900
            } else if (colNumber === 2) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 10 };
            } else if (colNumber === 4 || colNumber === 5) {
              cell.font = { color: { argb: 'FFB45309' }, size: 9 }; // amber-700
            } else if (colNumber === 7) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
              // Highlight the OFF-DUTY cell slightly darker amber
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // amber-200
            } else if (colNumber === 8) {
              cell.font = { bold: true, color: { argb: 'FF78350F' }, size: 10 }; // amber-950
            } else {
              cell.font = { color: { argb: 'FF92400E' }, size: 9 };
            }
          });
          
          sheet.mergeCells(absRow.number, 1, absRow.number, 6);

          // Dynamic row height for the absence row
          const estimatedLines = Math.max(1, Math.ceil(fullStaffText.length / 55));
          absRow.height = Math.max(22, estimatedLines * 16 + 6);
        });
      });
      
      sheet.addRow([]);
      const fRow1 = sheet.addRow(["Prepared By: " + (profile?.preparedBy || "")]);
      const fRow2 = sheet.addRow(["Revised By: " + (profile?.revisedBy || "")]);
      
      fRow1.getCell(1).font = { bold: true, size: 10 };
      fRow2.getCell(1).font = { bold: true, size: 10 };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `SkyOPS_Staff_Program_${startDate}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Failed to export Excel report.");
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const generateStaffPdfReport = async () => {
    setIsGeneratingStaffPdf(true);
    try {
      const profile = await db.getUserProfile();
      const preparedBy = profile?.preparedBy || "";
      const revisedBy = profile?.revisedBy || "";
      
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF("l", "mm", "a3"); // Changed from a4 to a3
      
      doc.setFontSize(14); // Increased font size
      doc.setFont("helvetica", "bold");
      const title = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
      doc.text(title, 210, 10, { align: "center" }); // Centered for A3 (420 width / 2)

      try {
        if (profile?.companyLogo) doc.addImage(profile.companyLogo, "PNG", 5, 2, 15, 15);
        if (profile?.skyopsLogo) doc.addImage(profile.skyopsLogo, "PNG", 400, 2, 15, 15);
      } catch (e) { }
      
      const tableRows: any[] = [];
      
      activePrograms.forEach(prog => {
        const d = new Date(prog.dateString || startDate);
        const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
        const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString('default', { month: 'short' }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
        
        const shiftsToday = shifts
          .filter((s) => s.pickupDate === prog.dateString)
          .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

        // Group absence data
        const categories = {
          "Day off": [] as string[],
          "Annual": [] as string[],
          "Lieu": [] as string[],
          "Sick Leave": [] as string[],
          "SSH Support": [] as string[]
        };

        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));

        offStaff.forEach((s) => {
          const leave = leaveMapByStaff[s.id]?.find(
            (l) => l.startDate <= prog.dateString! && l.endDate >= prog.dateString!
          );
          
          let isRosterOutOfContract = false;
          if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
          if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;

          let mappedCat = "";
          if (leave) {
            if (leave.type === "Annual leave") mappedCat = "Annual";
            else if (leave.type === "Roster leave") mappedCat = "Lieu";
            else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
            else mappedCat = "Day off";
          } else if (isRosterOutOfContract) {
            mappedCat = "Lieu";
          } else {
            if (s.type === "Local") mappedCat = "Day off";
          }

          if (mappedCat === "Day off") {
             // Treat all as "Day off" without mentioning labour or worker
             mappedCat = "Day off";
          }

          if (mappedCat && (categories as any)[mappedCat]) {
            (categories as any)[mappedCat].push(s.initials);
          }
        });

        const absenceTextLines: string[] = [];
        Object.entries(categories).forEach(([k, v]) => {
           if (v.length > 0) {
              const note = prog.notes?.[`ABSENCE_${k}`];
              absenceTextLines.push(`${k}: ${v.join(" - ")}${note ? ` (${note})` : ''}`);
           }
        });
        
        const combinedAbsenceText = absenceTextLines.join(" | ");
        
        let headerText = `${dayName} ${dateFormatted}`;

        tableRows.push([
          { content: headerText, colSpan: 3, styles: { fillColor: [79, 129, 189], textColor: [255,255,255], fontStyle: "bold", halign: "left" } },
          { content: combinedAbsenceText || "", colSpan: 5, styles: { fillColor: [79, 129, 189], textColor: [255,255,255], fontStyle: "bold", halign: "right" } }
        ]);
          
        if (shiftsToday.length === 0) {
           tableRows.push([
             { content: "No shifts", colSpan: 8, styles: { halign: "center" } }
           ]);
        } else {
             shiftsToday.forEach((shift, idx) => {
             const assignments = sortAssignmentsForPDF(prog.assignments.filter(a => a.shiftId === shift.id));
             const staffTokens = assignments.map(a => {
                 const s = getStaff(a.staffId);
                 if (!s) return null;
                 let type = "traffic";
                 if (s.isSecurity) type = "sec";
                 else if (s.isLabour) type = "labour";
                 else if (s.isDriver) type = "driver";
                 return { text: s.initials, type };
             }).filter(Boolean) as {text: string, type: string}[];
             
             const normalTokens = staffTokens.filter(t => t.type === 'traffic');
             const labourTokens = staffTokens.filter(t => t.type === 'labour');
             const line1Tokens = [...normalTokens, ...labourTokens];

             const securityTokens = staffTokens.filter(t => t.type === 'sec');
             const driverTokens = staffTokens.filter(t => t.type === 'driver');
             const line2Tokens = [...securityTokens, ...driverTokens];

             const orderedStaffTokens = [...line1Tokens, ...line2Tokens];

             let pureInitialsLines: string[] = [];
             if (line1Tokens.length > 0) {
                 pureInitialsLines.push(line1Tokens.map(t => t.text).join("-"));
             }
             if (line2Tokens.length > 0) {
                 pureInitialsLines.push(line2Tokens.map(t => t.text).join("-"));
             }
             let pureInitials = pureInitialsLines.join("\n");
             
             const shiftNote = prog.notes?.[shift.id] || shift.description || "";
             if (shiftNote) {
                 if (pureInitials) pureInitials += `\n`;
                 pureInitials += `${shiftNote}`;
             }
             
             const flightIds = shift.flightIds || [];
             let fObjs = flightIds.map(fid => getFlight(fid)).filter(Boolean) as Flight[];
             fObjs.sort((a, b) => (a.sta || "23:59").localeCompare(b.sta || "23:59"));
             if (fObjs.length === 0) {
                 fObjs = [{ flightNumber: "", from: "", to: "", sta: "NS", std: "---" } as Flight];
             }
             
             const shiftColor = idx % 2 === 0 ? [255, 255, 255] : [245, 248, 255];
             const shiftBorder = 0.6;
             const flightBorder = 0.1;
             
             fObjs.forEach((f, fIdx) => {
                 const isFirstFlight = fIdx === 0;
                 const isLastFlight = fIdx === fObjs.length - 1;
                 
                 const rowStyles = { 
                    fillColor: shiftColor, 
                    lineWidth: { top: flightBorder, bottom: isLastFlight ? shiftBorder : flightBorder, left: flightBorder, right: flightBorder },
                    valign: "middle" as const
                 };
                 
                 if (isFirstFlight) {
                     tableRows.push([
                         { content: (idx + 1).toString(), rowSpan: fObjs.length, styles: { ...rowStyles, lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                         { content: f.flightNumber || "", styles: rowStyles },
                         { content: f.from || "", styles: rowStyles },
                         { content: f.sta || "NS", styles: rowStyles },
                         { content: f.std || "---", styles: rowStyles },
                         { content: f.to || "", styles: rowStyles },
                         { content: shift.pickupTime || "N.S", rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", fontSize: 9, fillColor: [248, 250, 252], lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                         { content: pureInitials, rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } }, customInitials: orderedStaffTokens, customNote: shiftNote } as any
                     ]);
                 } else {
                     tableRows.push([
                         { content: f.flightNumber || "", styles: rowStyles },
                         { content: f.from || "", styles: rowStyles },
                         { content: f.sta || "NS", styles: rowStyles },
                         { content: f.std || "---", styles: rowStyles },
                         { content: f.to || "", styles: rowStyles }
                     ]);
                 }
             });
           });
        }
      });
      
      autoTable(doc, {
        startY: 18,
        head: [["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment\n(staff initials)"]],
        body: tableRows,
        theme: "grid",
        margin: { top: 2, right: 3, bottom: 2, left: 3 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", lineColor: [0,0,0], lineWidth: 0.1, fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 1, valign: "middle", halign: "center", lineColor: [150,150,150], lineWidth: 0.1, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 45 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 20 },
            6: { cellWidth: 35 },
            7: { cellWidth: 'auto' }
        },
        willDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === 'body') {
                if (!data.cell.raw || typeof data.cell.raw !== 'object' || !(data.cell.raw as any).customInitials) return;
                // Save lines generated by autoTable's height calculation
                (data.cell.raw as any)._lines = [...data.cell.text];
                // Clear text so we draw it manually in didDrawCell
                data.cell.text = [];
            }
        },
        didDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === 'body') {
                const raw = data.cell.raw as any;
                if (!raw || !raw._lines) return;
                
                const lines = raw._lines as string[];
                const customInitials = raw.customInitials as { text: string, type: string }[] || [];
                const customNote = raw.customNote as string;
                
                doc.setFontSize(data.cell.styles.fontSize);
                const lineHeight = doc.getLineHeight() * ((data.cell.styles as any).lineHeightFactor || 1.15);
                const contentHeight = lines.length * lineHeight;
                
                // padding properties are part of the cell object in jspdf-autotable
                const topPadding = typeof data.cell.padding === 'function' ? data.cell.padding('top') : (data.cell.padding as any).top || 0;
                const leftPadding = typeof data.cell.padding === 'function' ? data.cell.padding('left') : (data.cell.padding as any).left || 0;
                
                let cursorY = data.cell.y + topPadding;
                if (data.cell.styles.valign === 'middle') {
                    cursorY = data.cell.y + (data.cell.height / 2) - (contentHeight / 2) + (lineHeight / 2);
                } else {
                    cursorY += (lineHeight / 2);
                }
                
                let reachedNoteRegion = false;
                
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    
                    const normalizedLine = line.replace(/[\s\(\)]/g, '');
                    const normalizedNote = customNote ? customNote.replace(/[\s\(\)]/g, '') : '';
                    if (normalizedLine.length > 0 && normalizedNote && normalizedNote.includes(normalizedLine)) {
                        reachedNoteRegion = true;
                    }

                    const textWidth = doc.getTextWidth(line);
                    let startX = data.cell.x + leftPadding;
                    if (data.cell.styles.halign === 'center') {
                        startX = data.cell.x + (data.cell.width / 2) - (textWidth / 2);
                    }
                    
                    let cursorX = startX;
                    const words = line.split(/(\s+|-|\(|\))/g);
                    
                    for (const word of words) {
                        if (!word) continue;
                        
                        let color = [0, 0, 0];
                        let isBold = true;
                        
                        if (reachedNoteRegion) {
                            color = [255, 0, 0];
                            isBold = true;
                        } else {
                            const token = customInitials.find(t => t.text === word);
                            if (token) {
                                switch(token.type) {
                                    case 'driver': color = [21, 128, 61]; break; // Dark Green
                                    case 'labour': color = [185, 28, 28]; break; // Dark Red
                                    case 'sec': color = [126, 34, 206]; break; // Dark Purple
                                    default: color = [0, 0, 0]; break;
                                }
                            }
                        }
                        
                        doc.setFont("helvetica", isBold ? "bold" : "normal");
                        doc.setTextColor(color[0], color[1], color[2]);
                        doc.text(word, cursorX, cursorY, { baseline: 'middle' });
                        cursorX += doc.getTextWidth(word);
                    }
                    cursorY += lineHeight;
                }
            }
        }
      });
      
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      if (finalY > doc.internal.pageSize.getHeight() - 12) {
          doc.addPage();
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, 15);
          doc.text(`Revised By : ${revisedBy}`, 14, 22);
      } else {
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, finalY + 6);
          doc.text(`Revised By : ${revisedBy}`, 14, finalY + 12);
      }
      
      doc.save(`SkyOPS_Staff_Program_${startDate}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF report.");
    } finally {
      setIsGeneratingStaffPdf(false);
    }
  };

  const [shiftEditModal, setShiftEditModal] = React.useState<{dateString: string, shiftId: string} | null>(null);

  const handleDragStart = (
    e: React.DragEvent,
    staffId: string,
    currentShiftId: string,
    date: string,
    role: string,
  ) => {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ staffId, currentShiftId, date, role }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleUpdateNote = (
    dateString: string,
    targetId: string,
    note: string
  ) => {
    if (!onUpdatePrograms) return;
    const newPrograms = programs.map((p) => {
      if (p.dateString === dateString) {
        return {
          ...p,
          notes: {
            ...(p.notes || {}),
            [targetId]: note,
          },
        };
      }
      return p;
    });

    onUpdatePrograms(newPrograms);
  };

  const executeMove = (
    staffId: string,
    currentShiftId: string,
    date: string,
    role: string,
    targetShiftId: string,
    targetDate: string,
  ) => {
    if (date !== targetDate) return;
    const newPrograms = [...programs];
    const progIndex = newPrograms.findIndex((p) => p.dateString === targetDate);
    if (progIndex === -1) return;
    
    const prog = { ...newPrograms[progIndex], assignments: [...newPrograms[progIndex].assignments] };
    newPrograms[progIndex] = prog;

    const isTargetAbsence = targetShiftId.startsWith("ABSENCE");

    if (!currentShiftId.startsWith("ABSENCE")) {
      const staffObj = activeStaff.find((s) => s.id === staffId);
      const isDriver = staffObj?.isDriver;

      // If dropped onto the same shift it was already in, move it to the front
      if (currentShiftId === targetShiftId) {
        const existingIdx = prog.assignments.findIndex(
          (a) => a.staffId === staffId && a.shiftId === targetShiftId,
        );
        if (existingIdx !== -1) {
          const minSort = Math.min(0, ...prog.assignments.map(a => a.manualSortIndex || 0));
          prog.assignments[existingIdx].manualSortIndex = minSort - 1;
          onUpdatePrograms(newPrograms);
        }
        return;
      }

      const oldIdx = prog.assignments.findIndex(
        (a) => a.staffId === staffId && a.shiftId === currentShiftId,
      );
      if (oldIdx !== -1) {
        prog.assignments.splice(oldIdx, 1);
      }
    } else if (currentShiftId.startsWith("ABSENCE_") && targetShiftId !== currentShiftId) {
      // Dragging out of a leave category into either a working shift OR another leave category
      const leavesToDelete = leaveRequests.filter(l => 
        l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate
      );
      if (leavesToDelete.length > 0) {
        Promise.all(leavesToDelete.map(l => db.deleteLeave(l.id))).then(() => {
           if (onUpdateLeaves) {
               const remaining = leaveRequests.filter(l => !leavesToDelete.includes(l));
               onUpdateLeaves(remaining);
           }
        });
      }
    }
    
    if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
      const exists = prog.assignments.some(
        (a) => a.staffId === staffId && a.shiftId === targetShiftId,
      );
      if (!exists) {
        const maxSort = Math.max(0, ...prog.assignments.map(a => a.manualSortIndex || 0));
        prog.assignments.push({
          id: Math.random().toString(36).substr(2, 9),
          staffId,
          shiftId: targetShiftId,
          flightId: "",
          role: role || "OPS",
          manualSortIndex: maxSort + 1
        });
      }
    } else if (isTargetAbsence && targetShiftId !== "ABSENCE") {
      // Handle dropping into a specific absence category
      const cat = targetShiftId.replace("ABSENCE_", "");
      let type: any = null;
      if (cat === "ANNUAL LEAVE") type = "Annual leave";
      if (cat === "SICK LEAVE") type = "Sick leave";
      if (cat === "ROSTER LEAVE") type = "Roster leave";
      if (cat === "DAYS OFF") type = null; // Do not lock/create leave when dragging to Days Off
      
      const st = activeStaff.find(s => s.id === staffId);
      if (type === "Roster leave" && st?.type === "Local") {
        return;
      }
      
      if (type) {
        const newLeaveId = Math.random().toString(36).substr(2, 9);
        const req = {
          id: newLeaveId,
          staffId,
          type,
          startDate: targetDate,
          endDate: targetDate,
          notes: "Assigned visually",
          createdAt: new Date().toISOString()
        };
        db.upsertLeave(req as any).then(() => {
          if (onUpdateLeaves) {
              // Remove previous overlapping leaves from same day to prevent duplicates
              const prevLeaves = leaveRequests.filter(l => !(l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate));
              onUpdateLeaves([...prevLeaves, req as any]);
          }
        });
      }
    }
    onUpdatePrograms(newPrograms);
  };

  const handleDrop = (
    e: React.DragEvent,
    targetShiftId: string,
    targetDate: string,
  ) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;

    try {
      const { staffId, currentShiftId, date, role } = JSON.parse(data);
      executeMove(staffId, currentShiftId, date, role, targetShiftId, targetDate);
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleTargetContainerTap = (targetShiftId: string, targetDate: string) => {
    if (!targetShiftId.startsWith("ABSENCE") && targetShiftId !== "OFFDUTY") {
      setShiftEditModal({ dateString: targetDate, shiftId: targetShiftId });
    }
  };

  const [staffActionModal, setStaffActionModal] = React.useState<{
    staffId: string;
    currentShiftId: string;
    date: string;
    role: string;
  } | null>(null);

  const handleStaffItemTap = (e: React.MouseEvent, staffId: string, currentShiftId: string, date: string, role: string) => {
    e.stopPropagation();
    setStaffActionModal({ staffId, currentShiftId, date, role });
  };

  const staffStats = React.useMemo(() => {
    const stats: Record<string, { daysWorked: number; excusedLeaves: number; target: number }> = {};
    
    // Process leave requests into a faster lookup
    const leaveMap: Record<string, any[]> = {};
    leaveRequests.forEach(l => {
      if (!leaveMap[l.staffId]) leaveMap[l.staffId] = [];
      leaveMap[l.staffId].push(l);
    });

    const progAssignments: Record<string, string[]> = {};
    activePrograms.forEach(p => {
      progAssignments[p.dateString || ""] = p.assignments.map(a => a.staffId);
    });

    staff.forEach(s => {
      let daysWorked = 0;
      let excusedLeaves = 0;
      
      activePrograms.forEach(p => {
        const pDate = p.dateString || "";
        const worked = progAssignments[pDate].includes(s.id);
        if (worked) daysWorked++;
        
        const leaves = leaveMap[s.id] || [];
        const hasLeave = leaves.some(
          (l) => l.type !== "Day off" && l.startDate <= pDate && l.endDate >= pDate
        );
        if (hasLeave && !worked) {
            excusedLeaves++;
        }
      });
      
      let target = 5;
      if (s.type === "Roster") {
        const progStart = new Date(startDate);
        const progEnd = new Date(endDate);
        const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
        const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
        const overlapStart = workFrom > progStart ? workFrom : progStart;
        const overlapEnd = workTo < progEnd ? workTo : progEnd;
        if (overlapStart <= overlapEnd) {
          target = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        } else {
          target = 0;
        }
      }
      target -= excusedLeaves;
      
      stats[s.id] = { daysWorked, excusedLeaves, target };
    });
    return stats;
  }, [activePrograms, staff, leaveRequests, startDate, endDate]);

  const getStaffWorkload = (staffId: string) => {
    return staffStats[staffId]?.daysWorked || 0;
  };

  const getStaffColor = (
    s: Staff,
    daysWorked: number,
    restHours: number | null,
  ) => {
    if (restHours !== null && restHours < minRestHours) {
      return "bg-orange-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]";
    }

    const target = staffStats[s.id]?.target ?? 5;

    const diff = daysWorked - target;
    if (diff >= 2)
      return "bg-gradient-to-br from-red-500 to-rose-700 text-white shadow-red-500/20";
    if (diff === 1)
      return "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/20";
    if (diff === 0) return "bg-white border-slate-200 text-slate-900 shadow-sm";
    if (diff === -1)
      return "bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-blue-500/20";
    return "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-indigo-500/20";
  };

  const renderMatrixTab = () => {
    const dateHeaders = activePrograms.map((p) => {
      const d = new Date(p.dateString || startDate);
      return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    });
    const sortedMatrixStaff = [...activeStaff]
      .map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id),
      }))
      .sort((a, b) => a.totalHours - b.totalHours);

    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6">
          Weekly Operations Matrix View
        </h3>
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 text-center border-r border-slate-800 rounded-tl-xl">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">Agent</th>
              {dateHeaders.map((dh, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-center border-r border-slate-800"
                >
                  {dh}
                </th>
              ))}
              <th className="px-4 py-3 text-center bg-indigo-600 border-l border-indigo-700 rounded-tr-xl">
                Audit
              </th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
            {sortedMatrixStaff.map((s, idx) => {
              let workedCount = 0;
              let excusedLeaves = 0;
              return (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2 text-center border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap">
                    {s.initials} ({s.type === "Local" ? "L" : "R"})
                  </td>
                  {activePrograms.map((p, i) => {
                    const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                    if (
                      hasLeave &&
                      !p.assignments.some((a) => a.staffId === s.id)
                    )
                      excusedLeaves++;
                    const assign = p.assignments.find(
                      (a) => a.staffId === s.id,
                    );

                    const refProg = referencePrograms.find(
                      (rp) => rp.dateString === p.dateString,
                    );
                    const refAssign = refProg?.assignments.find(
                      (a) => a.staffId === s.id,
                    );

                    const isCellModified =
                      assign?.shiftId !== refAssign?.shiftId ||
                      assign?.role !== refAssign?.role ||
                      !!assign !== !!refAssign;

                    let content: React.ReactNode = (
                      <span className="text-slate-300">-</span>
                    );
                    let cellClass = `px-4 py-2 text-center border-r border-slate-100 ${isCellModified ? "bg-indigo-100/50 shadow-inner" : ""}`;
                    if (assign) {
                      workedCount++;
                      const shift = getShift(assign.shiftId || "");
                      if (shift) {
                        const pDate = new Date(p.dateString!);
                        const [ph, pm] = shift.pickupTime
                          .split(":")
                          .map(Number);
                        const shiftStart = new Date(pDate);
                        shiftStart.setHours(ph, pm, 0, 0);
                        const rest = calculateRestHours(s.id, shiftStart);
                        const restWarning =
                          rest !== null && rest < minRestHours;
                        if (restWarning) {
                          cellClass += " bg-rose-50";
                        }
                        content = (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`font-bold ${restWarning ? "text-rose-600" : "text-slate-900"}`}
                            >
                              {shift.pickupTime}
                            </span>
                            {rest !== null && (
                              <span
                                className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${restWarning ? "bg-rose-500 text-white" : "text-slate-500 bg-slate-100"}`}
                              >
                                {rest.toFixed(1)}H
                              </span>
                            )}
                          </div>
                        );
                      } else {
                        content = (
                          <span className="text-rose-500 font-bold">ERR</span>
                        );
                      }
                    }
                    return (
                      <td key={i} className={cellClass}>
                        {content}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-center border-l-2 border-indigo-100 bg-indigo-50/50">
                    <div className={`font-bold ${s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) ? "text-rose-600" : "text-indigo-900"}`}>
                      {workedCount}/{activePrograms.length}
                    </div>
                    <div className="text-[10px] text-indigo-600 font-bold mt-0.5 flex items-center justify-center gap-1">
                      <span>[{s.totalHours.toFixed(1)}H]</span>
                    </div>
                    {excusedLeaves > 0 && (
                      <div className="text-[9px] text-rose-500 font-bold mt-0.5">
                        (+{excusedLeaves} AL)
                      </div>
                    )}
                    {s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) && (
                      <div className="text-[9px] text-rose-600 font-bold mt-1 bg-rose-100 px-1 py-0.5 rounded inline-block">
                        ⚠️ MAX {Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRolesTab = () => {
    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6">
          Specialist Role Fulfillment Matrix
        </h3>
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-24">
                Date
              </th>
              <th className="px-4 py-3 border-r border-slate-800 w-32">
                Shift
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                SL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LC
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                RMP
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                OPS
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">LF</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
            {activePrograms.map((p, pIdx) => {
              const d = new Date(p.dateString || startDate);
              const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
              const shiftsToday = shifts
                .filter((s) => s.pickupDate === p.dateString)
                .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
              return shiftsToday.map((s, sIdx) => {
                const assignments = p.assignments.filter(
                  (a) => a.shiftId === s.id,
                );
                const coversRole = (a: any, targetRole: string) => {
                  const st = getStaff(a.staffId);
                  if (!st) return false;
                  const roleCode =
                    targetRole === "Shift Leader"
                      ? "SL"
                      : targetRole === "Load Control"
                        ? "LC"
                        : targetRole === "Ramp"
                          ? "RMP"
                          : targetRole === "Operations"
                            ? "OPS"
                            : targetRole === "Lost and Found"
                              ? "LF"
                              : targetRole;

                  // If looking for a specialist role, strictly enforce the profile flag
                  if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
                  if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
                  if (roleCode === "RMP" && !st.isRamp) return false;
                  if (roleCode === "OPS" && !st.isOps) return false;
                  if (roleCode === "LF" && !st.isLostFound) return false;
                  if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;

                  if (a.role === roleCode || a.role === targetRole) return true;
                  
                  // Fallback if they are just on shift but not explicitly assigned to role, check if they can cover
                  if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
                  if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
                  if (roleCode === "RMP" && st.isRamp) return true;
                  if (roleCode === "OPS" && st.isOps) return true;
                  if (roleCode === "LF" && st.isLostFound) return true;
                  if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
                  return false;
                };
                const getRoleCell = (role: string, reqFlag: boolean) => {
                  const agents = assignments
                    .filter((a) => coversRole(a, role))
                    .map((a) => getStaff(a.staffId)?.initials)
                    .filter(Boolean);
                  if (agents.length > 0) {
                    return (
                      <td className="px-4 py-2 border-r border-slate-100 text-center">
                        <span className="bg-emerald-500 text-white font-black px-2 py-1 rounded-lg text-[10px] break-words inline-block">
                          {agents.join(", ")}
                        </span>
                      </td>
                    );
                  } else if (reqFlag) {
                    return (
                      <td className="px-4 py-2 border-r border-slate-100 text-center">
                        <span className="bg-rose-500 text-white font-black px-2 py-1 rounded-lg text-[10px]">
                          MISSING
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td className="px-4 py-2 border-r border-slate-100 text-center text-slate-300">
                      -
                    </td>
                  );
                };

                const meta = {
                  slReq:
                    ((s.roleCounts?.["Shift Leader"] ||
                      (s.roleCounts as any)?.["SL"] ||
                      0) as number) > 0,
                  lcReq:
                    ((s.roleCounts?.["Load Control"] ||
                      (s.roleCounts as any)?.["LC"] ||
                      0) as number) > 0,
                  rmpReq:
                    ((s.roleCounts?.["Ramp"] ||
                      (s.roleCounts as any)?.["RMP"] ||
                      0) as number) > 0,
                  opsReq:
                    ((s.roleCounts?.["Operations"] ||
                      (s.roleCounts as any)?.["OPS"] ||
                      0) as number) > 0,
                  lfReq:
                    ((s.roleCounts?.["Lost and Found"] ||
                      (s.roleCounts as any)?.["LF"] ||
                      0) as number) > 0,
                };

                return (
                  <tr
                    key={`${pIdx}-${sIdx}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2 font-bold border-r border-slate-100">
                      {dateLabel}
                    </td>
                    <td className="px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap">
                      {s.pickupTime}-{s.endTime}
                    </td>
                    {getRoleCell("Shift Leader", meta.slReq)}
                    {getRoleCell("Load Control", meta.lcReq)}
                    {getRoleCell("Ramp", meta.rmpReq)}
                    {getRoleCell("Operations", meta.opsReq)}
                    {getRoleCell("Lost and Found", meta.lfReq)}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderStaffCheckTab = () => {
    const localStaff = activeStaff.filter((s) => s.type === "Local");
    const rosterStaff = activeStaff.filter((s) => s.type === "Roster");

    const renderLocalTable = () => (
      <div className="mb-10 min-w-[800px]">
        <h4 className="text-lg font-black uppercase italic text-slate-800 mb-4">
          Weekly Personnel Utilization Audit (Local)
        </h4>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">NAME</th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                INIT
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK SHIFTS
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                OFF DAYS
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LEAVES
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">STATUS</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium divide-y divide-slate-100">
            {localStaff.map((s, idx) => {
              const shiftsWorked = activePrograms.reduce(
                (acc, p) =>
                  acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
                0,
              );

              let excusedLeaves = 0;
              activePrograms.forEach((p) => {
                const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
                  excusedLeaves++;
              });

              const daysOff =
                activePrograms.length - shiftsWorked - excusedLeaves;
              const targetShifts = 5 - excusedLeaves;
              const targetOff = 2;
              const isMatch =
                shiftsWorked === targetShifts && daysOff === targetOff;

              return (
                <tr
                  key={s.id}
                  className={
                    isMatch
                      ? "bg-emerald-50 text-emerald-900 border-b border-white"
                      : "bg-rose-50 text-rose-900 border-b border-white"
                  }
                >
                  <td className="px-4 py-2 text-center">{idx + 1}</td>
                  <td className="px-4 py-2 font-bold">{s.name}</td>
                  <td className="px-4 py-2 text-center">{s.initials}</td>
                  <td className="px-4 py-2 text-center">{shiftsWorked}</td>
                  <td className="px-4 py-2 text-center">{daysOff}</td>
                  <td className="px-4 py-2 text-center font-bold text-slate-700">
                    {excusedLeaves > 0 ? excusedLeaves : "-"}
                  </td>
                  <td className="px-4 py-2 text-center font-bold">
                    {isMatch ? "MATCH" : "CHECK"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    const renderRosterTable = () => (
      <div className="mb-10 min-w-[800px]">
        <h4 className="text-lg font-black uppercase italic text-slate-800 mb-4">
          Weekly Personnel Utilization Audit (Roster)
        </h4>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">NAME</th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                INIT
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK FROM
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK TO
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                POTENTIAL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                ACTUAL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LEAVES
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">STATUS</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium divide-y divide-slate-100">
            {rosterStaff.map((s, idx) => {
              const shiftsWorked = activePrograms.reduce(
                (acc, p) =>
                  acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
                0,
              );
              const progStart = new Date(startDate);
              const progEnd = new Date(endDate);
              const workFrom = s.workFromDate
                ? new Date(s.workFromDate)
                : progStart;
              const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
              const overlapStart = workFrom > progStart ? workFrom : progStart;
              const overlapEnd = workTo < progEnd ? workTo : progEnd;
              let potential = 0;
              if (overlapStart <= overlapEnd) {
                potential =
                  Math.floor(
                    (overlapEnd.getTime() - overlapStart.getTime()) /
                      (1000 * 60 * 60 * 24),
                  ) + 1;
              }

              let excusedLeaves = 0;
              activePrograms.forEach((p) => {
                const d = new Date(p.dateString!);
                if (d >= overlapStart && d <= overlapEnd) {
                  const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                  if (
                    hasLeave &&
                    !p.assignments.some((a) => a.staffId === s.id)
                  )
                    excusedLeaves++;
                }
              });

              const isMatch = shiftsWorked === potential - excusedLeaves;

              return (
                <tr
                  key={s.id}
                  className={
                    isMatch
                      ? "bg-emerald-50 text-emerald-900 border-b border-white"
                      : "bg-rose-50 text-rose-900 border-b border-white"
                  }
                >
                  <td className="px-4 py-2 text-center">{idx + 1}</td>
                  <td className="px-4 py-2 font-bold">{s.name}</td>
                  <td className="px-4 py-2 text-center">{s.initials}</td>
                  <td className="px-4 py-2 text-center">
                    {s.workFromDate || "N/A"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {s.workToDate || "N/A"}
                  </td>
                  <td className="px-4 py-2 text-center">{potential}</td>
                  <td className="px-4 py-2 text-center">{shiftsWorked}</td>
                  <td className="px-4 py-2 text-center font-bold text-slate-700">
                    {excusedLeaves > 0 ? excusedLeaves : "-"}
                  </td>
                  <td className="px-4 py-2 text-center font-bold">
                    {isMatch ? "MATCH" : "CHECK"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6 flex items-center gap-3">
          <ShieldCheck className="text-emerald-500 w-6 h-6 md:w-8 md:h-8" />
          Staff Matrix Checks
        </h3>
        {renderLocalTable()}
        {renderRosterTable()}
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-10 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 md:gap-6 relative z-10 flex-col md:flex-row text-center md:text-left">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarDays size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none">
              Master Roster
            </h3>
            <p className="text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-2">
              Program View & Export
            </p>
          </div>
        </div>
        <div className="flex gap-4 relative z-10 flex-wrap justify-end mt-4 md:mt-0">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-4 md:px-6 py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl flex items-center gap-3 active:scale-95 ${showHistory ? "bg-emerald-500 text-white" : "bg-white text-slate-950 hover:bg-slate-100"}`}
          >
            <History size={18} />
            <span className="hidden md:inline">Time Machine</span>
          </button>
          <button
            onClick={saveVersion}
            className="px-4 md:px-6 py-4 md:py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-xl flex items-center gap-3 active:scale-95"
          >
            <Save size={18} />
            <span className="hidden md:inline">Save Ver</span>
          </button>
          <button
            onClick={generateFullReport}
            disabled={isGeneratingPdf || activePrograms.length === 0}
            className="px-4 md:px-8 py-4 md:py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 hover:text-white transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50"
            title="Export Internal Full Report PDF"
          >
            {isGeneratingPdf ? (
              <Printer size={18} className="animate-spin" />
            ) : (
              <FileDown size={18} />
            )}
            <span className="hidden md:inline">Internal PDF</span>
          </button>
          <button
            onClick={generateStaffPdfReport}
            disabled={isGeneratingStaffPdf || activePrograms.length === 0}
            className="px-4 md:px-8 py-4 md:py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50"
          >
            {isGeneratingStaffPdf ? (
              <Printer size={18} className="animate-spin" />
            ) : (
              <FileDown size={18} />
            )}
            <span>Staff PDF</span>
          </button>
          <button
            onClick={generateStaffExcelReport}
            disabled={isGeneratingExcel || activePrograms.length === 0}
            className="px-4 md:px-8 py-4 md:py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50"
          >
            {isGeneratingExcel ? (
              <Printer size={18} className="animate-spin" />
            ) : (
              <FileDown size={18} />
            )}
            <span>Staff EXCEL</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-4 md:justify-center px-2">
        {["Daily", "Matrix", "Roles", "Staff Checks"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex-1 md:flex-none ${activeTab === tab ? "bg-slate-950 text-white shadow-xl scale-105" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"}`}
          >
            {tab} View
          </button>
        ))}
      </div>

      {(activeTab === "Daily" || activeTab === "Matrix") && (
        <div className="flex justify-center px-2 mt-4">
          <button
            onClick={handleMarkAllCopied}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
          >
            <CheckCircle2 size={16} />
            All Modifications Copied
          </button>
        </div>
      )}

      {showHistory && (
        <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-8 shadow-xl animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black uppercase italic text-slate-900 flex items-center gap-3">
              <History className="text-emerald-500" />
              Roster Time Machine
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase"
            >
              Close
            </button>
          </div>

          {versions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic">
              No saved versions found. Save your first snapshot!
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400 font-black text-xs border border-slate-100">
                      v{v.versionNumber}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        {v.name}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                          <Clock size={10} />{" "}
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                          {v.periodStart} → {v.periodEnd}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => restoreVersion(v)}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-400 shadow-sm flex items-center gap-2"
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                    <button
                      onClick={() => deleteVersion(v.id)}
                      className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(isFailedGeneration || stationHealth === 0) && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-[2.5rem] p-8 md:p-12 text-center animate-in zoom-in-95 shadow-xl">
          <AlertTriangle size={64} className="mx-auto text-rose-500 mb-6" />
          <h3 className="text-2xl font-black uppercase italic text-rose-900 tracking-tighter mb-2">
            AI Generation Failed
          </h3>
          <p className="text-rose-700 font-bold max-w-lg mx-auto">
            The Artificial Intelligence engine encountered a strategic conflict
            or returned invalid data structure.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <div className="px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600">
              Code: JSON_PARSE_ERROR
            </div>
            <div className="px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600">
              Health: {stationHealth}%
            </div>
          </div>
          <p className="text-[10px] uppercase font-black tracking-widest text-rose-400 mt-8">
            Recommendation: Check Shift/Staff Inputs and Retry
          </p>
        </div>
      )}

      {!isFailedGeneration && stationHealth > 0 && (
        <div className="space-y-12">
          {activePrograms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-300 gap-4 bg-white rounded-[2.5rem] border border-slate-100">
              <AlertTriangle size={48} />
              <span className="text-xl font-black uppercase italic">
                No Program Data for Selected Period
              </span>
            </div>
          ) : (
            <>
              {activeTab === "Matrix" && renderMatrixTab()}
              {activeTab === "Roles" && renderRolesTab()}
              {activeTab === "Staff Checks" && renderStaffCheckTab()}
              {activeTab === "Daily" &&
                activePrograms.map((prog, i) => {
                  const d = new Date(prog.dateString || startDate);
                  const dateLabel = `${DAYS_OF_WEEK_FULL[d.getUTCDay()].toUpperCase()} - ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;

                  const workingIds = new Set(
                    prog.assignments.map((a) => a.staffId),
                  );
                  const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
                  const categories: Record<
                    string,
                    {
                      staff: Staff;
                      count: number;
                      isLeave?: boolean;
                      isRequestedDayOff?: boolean;
                    }[]
                  > = {
                    "DAYS OFF": [],
                    "ROSTER LEAVE": [],
                    "ANNUAL LEAVE": [],
                    "SICK LEAVE": [],
                    "STANDBY (RESERVE)": [],
                  };

                  offStaff.forEach((s) => {
                    const leave = hasLeaveOnDate(s.id, prog.dateString!);
                    let count = 1;
                    if (leave) {
                      const start = new Date(leave.startDate);
                      const current = new Date(prog.dateString!);
                      count =
                        Math.floor(
                          (current.getTime() - start.getTime()) /
                            (1000 * 60 * 60 * 24),
                        ) + 1;
                    } else {
                      for (let idx = i - 1; idx >= 0; idx--) {
                        const prevProg = activePrograms[idx];
                        const worked = prevProg.assignments.some(
                          (a) => a.staffId === s.id,
                        );
                        const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString!);
                        if (!worked && !prevLeave) count++;
                        else break;
                      }
                    }

                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            prog.dateString! >= p.start &&
                            prog.dateString! <= p.end,
                        );
                      } else if (s.workFromDate && s.workToDate) {
                        isRosterOutOfContract =
                          prog.dateString! < s.workFromDate ||
                          prog.dateString! > s.workToDate;
                      }
                    }
                    const item = {
                      staff: s,
                      count,
                      isLeave: !!leave,
                      isRequestedDayOff: leave?.type === "Day off",
                    };

                    if (leave) {
                      if (leave.type === "Annual leave")
                        categories["ANNUAL LEAVE"].push(item);
                      else if (leave.type === "Roster leave")
                        categories["ROSTER LEAVE"].push(item);
                      else if (leave.type === "Sick leave")
                        categories["SICK LEAVE"].push(item);
                      else categories["DAYS OFF"].push(item);
                    } else if (isRosterOutOfContract) {
                      categories["ROSTER LEAVE"].push(item);
                    } else {
                      if (s.type === "Local") {
                        categories["DAYS OFF"].push(item);
                      } else {
                        categories["STANDBY (RESERVE)"].push(item);
                      }
                    }
                  });

                  const refProg = referencePrograms.find(
                    (p) => p.dateString === prog.dateString,
                  ) || {
                    assignments: [] as typeof prog.assignments,
                    dateString: prog.dateString,
                  };
                  const refWorkingIds = new Set(
                    refProg.assignments.map((a) => a.staffId),
                  );
                  const refOffStaff = activeStaff.filter(
                    (s) => !refWorkingIds.has(s.id),
                  );
                  const refCategories: Record<string, string[]> = {
                    "DAYS OFF": [],
                    "ROSTER LEAVE": [],
                    "ANNUAL LEAVE": [],
                    "SICK LEAVE": [],
                    "STANDBY (RESERVE)": [],
                  };
                  refOffStaff.forEach((s) => {
                    const leave = hasLeaveOnDate(s.id, refProg.dateString!);
                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            refProg.dateString! >= p.start &&
                            refProg.dateString! <= p.end,
                        );
                      } else if (s.workFromDate && s.workToDate) {
                        isRosterOutOfContract =
                          refProg.dateString! < s.workFromDate ||
                          refProg.dateString! > s.workToDate;
                      }
                    }
                    if (leave) {
                      if (leave.type === "Annual leave")
                        refCategories["ANNUAL LEAVE"].push(s.id);
                      else if (leave.type === "Roster leave")
                        refCategories["ROSTER LEAVE"].push(s.id);
                      else if (leave.type === "Sick leave")
                        refCategories["SICK LEAVE"].push(s.id);
                      else refCategories["DAYS OFF"].push(s.id);
                    } else if (isRosterOutOfContract) {
                      refCategories["ROSTER LEAVE"].push(s.id);
                    } else {
                      if (s.type === "Local")
                        refCategories["DAYS OFF"].push(s.id);
                      else refCategories["STANDBY (RESERVE)"].push(s.id);
                    }
                  });

                  const shiftsTodaySorted = shifts
                    .filter((s) => s.pickupDate === prog.dateString)
                    .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

                  return (
                    <div
                      key={i}
                      className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h3 className="text-lg font-black uppercase italic text-slate-900">
                          {dateLabel}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                          <span className="px-2 py-1 bg-slate-900 text-white rounded-md">
                            Total: {staff.length}
                          </span>
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md">
                            Work: {workingIds.size}
                          </span>
                          <span className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md">
                            Off: {categories["DAYS OFF"].length}
                          </span>
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md">
                            Leave:{" "}
                            {categories["ANNUAL LEAVE"].length +
                              categories["SICK LEAVE"].length}
                          </span>
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md">
                            SBY: {categories["STANDBY (RESERVE)"].length}
                          </span>
                          <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-md">
                            Roster Off: {categories["ROSTER LEAVE"].length}
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                              <th className="px-4 py-3 w-12 text-center">
                                S/N
                              </th>
                              <th className="px-4 py-3 w-24">Pickup</th>
                              <th className="px-4 py-3 w-24">Release</th>
                              <th className="px-4 py-3 w-32">Flights</th>
                              <th className="px-4 py-3 w-24 text-center">
                                HC / Max
                              </th>
                              <th className="px-4 py-3">
                                Personnel & Assigned Roles
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                            {shiftsTodaySorted.map(
                              (shift, idx, shiftsToday) => {
                                const assignments = sortAssignments(prog.assignments.filter(
                                  (a) => a.shiftId === shift.id,
                                ));
                                const flightStrs =
                                  (shift.flightIds || [])
                                    .map((fid) => getFlight(fid))
                                    .filter(Boolean)
                                    .sort((a, b) => {
                                      const getFlightTime = (f: any) => {
                                        if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                                          return f.sta;
                                        }
                                        if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                                          return f.std;
                                        }
                                        return "23:59";
                                      };
                                      return getFlightTime(a).localeCompare(getFlightTime(b));
                                    })
                                    .map((f) => f!.flightNumber)
                                    .join(" / ") || "NIL";
                                const nonLabourCount = assignments.filter((a) => {
                                  const st = getStaff(a.staffId);
                                  return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
                                }).length;
                                const isFull = nonLabourCount >= shift.maxStaff;
                                const isOver = nonLabourCount > shift.maxStaff;

                                const hasSL = assignments.some(
                                  (a) =>
                                    a.role === "SL" ||
                                    a.role === "Shift Leader" ||
                                    getStaff(a.staffId)?.isShiftLeader ||
                                    getStaff(
                                      a.staffId,
                                    )?.initials.toUpperCase() === "SK-ATZ",
                                );
                                const hasLC = assignments.some(
                                  (a) =>
                                    a.role === "LC" ||
                                    a.role === "Load Control" ||
                                    getStaff(a.staffId)?.isLoadControl ||
                                    getStaff(
                                      a.staffId,
                                    )?.initials.toUpperCase() === "SK-ATZ",
                                );
                                const isCriticalMissing =
                                  (!hasSL &&
                                    (shift.roleCounts?.["Shift Leader"] || 0) >
                                      0) ||
                                  (!hasLC &&
                                    (shift.roleCounts?.["Load Control"] || 0) >
                                      0);

                                const curShiftAssig = assignments
                                  .map((a) => a.staffId)
                                  .sort()
                                  .join(",");
                                const refShiftAssig = refProg.assignments
                                  .filter((a) => a.shiftId === shift.id)
                                  .map((a) => a.staffId)
                                  .sort()
                                  .join(",");
                                const isShiftModified =
                                  curShiftAssig !== refShiftAssig;

                                return (
                                  <tr
                                    key={shift.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) =>
                                      handleDrop(e, shift.id, prog.dateString!)
                                    }
                                    onClick={() => handleTargetContainerTap(shift.id, prog.dateString!)}
                                    className={`hover:bg-slate-50 transition-colors ${isShiftModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : isCriticalMissing ? "bg-rose-50/50" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                                  >
                                    <td
                                      className={`px-4 py-3 text-center font-bold ${isCriticalMissing ? "text-rose-500" : "text-slate-400"}`}
                                    >
                                      {idx + 1}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                      {shift.pickupTime}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                      {shift.endTime}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-blue-600">
                                      {flightStrs}
                                    </td>
                                    <td
                                      className={`px-4 py-3 text-center font-bold ${isOver ? "text-rose-500" : isFull ? "text-emerald-500" : "text-amber-500"}`}
                                    >
                                      {nonLabourCount} / {shift.maxStaff}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap gap-2">
                                          {assignments.map((a) => {
                                            const st = getStaff(a.staffId);
                                            if (!st) return null;

                                            const pDate = new Date(
                                              prog.dateString!,
                                            );
                                            const [ph, pm] = shift.pickupTime
                                              .split(":")
                                              .map(Number);
                                            const shiftStart = new Date(pDate);
                                            shiftStart.setHours(ph, pm, 0, 0);

                                            const rest = calculateRestHours(
                                              st.id,
                                              shiftStart,
                                            );
                                            const daysWorked = getStaffWorkload(
                                              st.id,
                                            );
                                            const colorClass = getStaffColor(
                                              st,
                                              daysWorked,
                                              rest,
                                            );

                                            let target = 5;
                                            if (st.type === "Roster") {
                                              const progStart = new Date(
                                                startDate,
                                              );
                                              const progEnd = new Date(endDate);
                                              const workFrom = st.workFromDate
                                                ? new Date(st.workFromDate)
                                                : progStart;
                                              const workTo = st.workToDate
                                                ? new Date(st.workToDate)
                                                : progEnd;
                                              const overlapStart =
                                                workFrom > progStart
                                                  ? workFrom
                                                  : progStart;
                                              const overlapEnd =
                                                workTo < progEnd
                                                  ? workTo
                                                  : progEnd;
                                              if (overlapStart <= overlapEnd) {
                                                target =
                                                  Math.floor(
                                                    (overlapEnd.getTime() -
                                                      overlapStart.getTime()) /
                                                      (1000 * 60 * 60 * 24),
                                                  ) + 1;
                                              } else {
                                                target = 0;
                                              }
                                            }
                                            const showDays =
                                              daysWorked !== target;

                                            const isLastShiftOfDay =
                                              !shiftsToday
                                                .slice(idx + 1)
                                                .some((futureShift) =>
                                                  prog.assignments.some(
                                                    (ass) =>
                                                      ass.shiftId ===
                                                        futureShift.id &&
                                                      ass.staffId === st.id,
                                                  ),
                                                );
                                            let nextDayShiftTime:
                                              | string
                                              | null = null;
                                            const nextProg =
                                              activePrograms[i + 1];
                                            if (isLastShiftOfDay && nextProg) {
                                              const shiftsTomorrow = shifts
                                                .filter(
                                                  (s) =>
                                                    s.pickupDate ===
                                                    nextProg.dateString,
                                                )
                                                .sort((a, b) =>
                                                  a.pickupTime.localeCompare(
                                                    b.pickupTime,
                                                  ),
                                                );
                                              for (const tomorrowShift of shiftsTomorrow) {
                                                const nextAssignment =
                                                  nextProg.assignments.find(
                                                    (ass) =>
                                                      ass.shiftId ===
                                                        tomorrowShift.id &&
                                                      ass.staffId === st.id,
                                                  );
                                                if (nextAssignment) {
                                                  try {
                                                    const currentEnd = new Date(
                                                      `${shift.endDate || prog.dateString}T${shift.endTime}:00`,
                                                    );
                                                    const nextStart = new Date(
                                                      `${tomorrowShift.pickupDate || nextProg.dateString}T${tomorrowShift.pickupTime}:00`,
                                                    );
                                                    const diffHours =
                                                      (nextStart.getTime() - currentEnd.getTime()) /
                                                      (1000 * 60 * 60);

                                                    if (diffHours < 12) {
                                                      nextDayShiftTime = tomorrowShift.pickupTime;
                                                    }
                                                  } catch (e) {
                                                    nextDayShiftTime = tomorrowShift.pickupTime;
                                                  }
                                                  break;
                                                }
                                              }
                                            }

                                            return (
                                              <div
                                                key={a.id}
                                                draggable={
                                                  !(
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  )
                                                }
                                                onDragStart={(e) => {
                                                  if (
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  ) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  handleDragStart(
                                                    e,
                                                    st.id,
                                                    shift.id,
                                                    prog.dateString!,
                                                    a.role,
                                                  );
                                                }}
                                                onClick={(e) => {
                                                  if (
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  ) return;
                                                  handleStaffItemTap(e, st.id, shift.id, prog.dateString!, a.role);
                                                }}
                                                className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${staffActionModal?.staffId === st.id && staffActionModal?.currentShiftId === shift.id && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${manualAssignments && manualAssignments.some((ma) => ma.staffId === st.id && ma.shiftId === shift.id) ? "opacity-80 cursor-not-allowed border-indigo-200" : "cursor-move hover:scale-105"}`}
                                              >
                                                <span>{st.initials}</span>
                                                {manualAssignments &&
                                                manualAssignments.some(
                                                  (ma) =>
                                                    ma.staffId === st.id &&
                                                    ma.shiftId === shift.id,
                                                ) ? (
                                                  <Lock
                                                    size={8}
                                                    className="text-slate-500 opacity-70 -ml-0.5"
                                                  />
                                                ) : null}
                                                {rest !== null &&
                                                  rest < minRestHours && (
                                                    <span className="ml-1 px-1 bg-white text-orange-600 rounded text-[8px]">
                                                      {rest}H
                                                    </span>
                                                  )}
                                                {showDays && (
                                                  <span className="ml-1 px-1 bg-black/20 rounded text-[8px]">
                                                    {daysWorked}
                                                  </span>
                                                )}
                                                {nextDayShiftTime && (
                                                  <span className="ml-1 px-1 bg-slate-400 text-white rounded text-[8px] font-mono">
                                                    → {nextDayShiftTime}
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {assignments.length === 0 && (
                                            <span className="text-[10px] italic text-slate-300">
                                              Drag staff here...
                                            </span>
                                          )}
                                        </div>

                                        {Object.entries(
                                          shift.roleCounts || {},
                                        ).filter(([_, count]) => count > 0)
                                          .length > 0 && (
                                          <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2 mt-1">
                                            {Object.entries(
                                              shift.roleCounts || {},
                                            )
                                              .filter(([_, count]) => count > 0)
                                              .map(([role, count]) => {
                                                let roleKey = role;
                                                if (role === "Load Control")
                                                  roleKey = "LC";
                                                if (role === "Shift Leader")
                                                  roleKey = "SL";
                                                if (role === "Ramp")
                                                  roleKey = "RMP";
                                                if (role === "Operations")
                                                  roleKey = "OPS";
                                                if (role === "Lost and Found")
                                                  roleKey = "LF";
                                                if (role === "Labour")
                                                  roleKey = "LBR";
                                                if (role === "Security")
                                                  roleKey = "SEC";
                                                if (role === "Driver")
                                                  roleKey = "DRV";

                                                const fulfilledCount =
                                                  assignments.filter((a) => {
                                                    const st = getStaff(
                                                      a.staffId,
                                                    );
                                                    if (!st) return false;
                                                    if (
                                                      a.role === roleKey ||
                                                      a.role === role
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "LC" &&
                                                      (st.isLoadControl ||
                                                        st.initials.toUpperCase() ===
                                                          "SK-ATZ")
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "SL" &&
                                                      (st.isShiftLeader ||
                                                        st.initials.toUpperCase() ===
                                                          "SK-ATZ")
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "RMP" &&
                                                      st.isRamp
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "OPS" &&
                                                      st.isOps
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "LF" &&
                                                      st.isLostFound
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "LBR" ||
                                                        roleKey === "Labour") &&
                                                      st.isLabour
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "SEC" ||
                                                        roleKey === "Security") &&
                                                      st.isSecurity
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "DRV" ||
                                                        roleKey === "Driver") &&
                                                      st.isDriver
                                                    )
                                                      return true;
                                                    return false;
                                                  }).length;
                                                const isFulfilled =
                                                  fulfilledCount >= count;

                                                return (
                                                  <span
                                                    key={roleKey}
                                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isFulfilled ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}
                                                  >
                                                    {roleKey}{" "}
                                                    {isFulfilled ? "✅" : "❌"}
                                                  </span>
                                                );
                                              })}
                                          </div>
                                        )}
                                        
                                        <div className="mt-1 flex flex-col gap-1">
                                          <button 
                                              onClick={() => setNoteModal({ dateString: prog.dateString!, shiftId: shift.id, currentNote: prog.notes?.[shift.id] || '' })}
                                              className="w-full flex items-center justify-center gap-1.5 text-[10px] p-1.5 bg-slate-50 border border-slate-200 border-dashed rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors font-semibold"
                                          >
                                              <MessageSquare size={12} />
                                              {prog.notes?.[shift.id] ? "Edit Note" : "Add Note"}
                                          </button>
                                          {prog.notes?.[shift.id] && (
                                              <div className="text-[10px] text-red-600 font-bold p-1.5 bg-red-50 border border-red-100 rounded break-words whitespace-pre-wrap">
                                                  <strong>Note: </strong> {prog.notes[shift.id]}
                                              </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              },
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div
                        className={`border-t-4 border-slate-100 transition-colors ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-slate-50" : ""}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) =>
                          handleDrop(e, "ABSENCE", prog.dateString!)
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTargetContainerTap("ABSENCE", prog.dateString!);
                        }}
                      >
                        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest">
                              Absence and Rest Registry
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnlockAbsences(!unlockAbsences);
                              }}
                              className={`p-1 rounded ${unlockAbsences ? "bg-rose-100 text-rose-600" : "bg-slate-200 text-slate-500"} hover:opacity-80 transition-all`}
                              title={unlockAbsences ? "Lock absences" : "Unlock absences to reassign"}
                            >
                              {unlockAbsences ? <Unlock size={12} /> : <Lock size={12} />}
                            </button>
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 italic">
                            Drag or tap here to unassign
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2 w-48">
                                Status Category
                              </th>
                              <th className="px-4 py-2">Personnel Initials</th>
                            </tr>
                          </thead>
                          <tbody className="text-[10px] font-medium text-slate-600 divide-y divide-slate-100">
                            {Object.entries(categories).map(([cat, items]) => {
                              const curCatIds = items
                                .map((i: any) => i.staff.id)
                                .sort()
                                .join(",");
                              const refCatIds = (refCategories[cat] || [])
                                .sort()
                                .join(",");
                              const isCatModified = curCatIds !== refCatIds;

                              const sortedItems = [...items].sort((a: any, b: any) => {
                                const stA = a.staff;
                                const stB = b.staff;
                                if (!stA && !stB) return 0;
                                if (!stA) return 1;
                                if (!stB) return -1;

                                const getGroupRank = (st: any) => {
                                  if (st.isLabour) return 3;
                                  if (st.isSecurity) return 2;
                                  return 1; // Traffic staff (includes other non-labour/non-security roles)
                                };

                                const rankA = getGroupRank(stA);
                                const rankB = getGroupRank(stB);
                                if (rankA !== rankB) {
                                  return rankA - rankB;
                                }

                                return (stA.initials || "").localeCompare(stB.initials || "");
                              });

                              return (
                                <tr
                                  key={cat}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    e.stopPropagation();
                                    handleDrop(e, `ABSENCE_${cat}`, prog.dateString!);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTargetContainerTap(`ABSENCE_${cat}`, prog.dateString!);
                                  }}
                                  className={`transition-colors ${isCatModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                                >
                                  <td className="px-4 py-3 font-bold align-top">
                                    {cat}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {sortedItems.map((item, idx) => {
                                          const {
                                            staff: s,
                                            count,
                                            isRequestedDayOff,
                                          } = item as any;
                                          const daysWorked = getStaffWorkload(
                                            s.id,
                                          );
                                          const colorClass = getStaffColor(
                                            s,
                                            daysWorked,
                                            null,
                                          );
                                          const isLocked = !unlockAbsences && (item as any).isLeave;
                                          const _dummy =
                                            !unlockAbsences && (
                                              cat === "ROSTER LEAVE" ||
                                              cat === "ANNUAL LEAVE" ||
                                              isRequestedDayOff
                                            );
                                          return (
                                            <React.Fragment key={s.id}>
                                              <div
                                                draggable={!isLocked}
                                                onDragStart={(e) => {
                                                  if (isLocked) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  handleDragStart(
                                                    e,
                                                    s.id,
                                                    `ABSENCE_${cat}`,
                                                    prog.dateString!,
                                                    s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" :
                                                    s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" :
                                                    s.isRamp ? "RMP" :
                                                    s.isLostFound ? "LF" :
                                                    s.isLabour ? "LBR" :
                                                    s.isSecurity ? "SEC" :
                                                    s.isDriver ? "DRV" :
                                                    "OPS"
                                                  );
                                                }}
                                                onClick={(e) => {
                                                  if (isLocked) return;
                                                  handleStaffItemTap(e, s.id, `ABSENCE_${cat}`, prog.dateString!, s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" :
                                                    s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" :
                                                    s.isRamp ? "RMP" :
                                                    s.isLostFound ? "LF" :
                                                    s.isLabour ? "LBR" :
                                                    s.isSecurity ? "SEC" :
                                                    s.isDriver ? "DRV" :
                                                    "OPS"
                                                  );
                                                }}
                                                className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${staffActionModal?.staffId === s.id && staffActionModal?.currentShiftId === ("ABSENCE_" + cat) && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${isLocked ? "opacity-80 cursor-not-allowed border-slate-200 text-slate-500" : "cursor-move hover:scale-105"}`}
                                              >
                                                <span>{s.initials}</span>
                                                {isLocked ? (
                                                  <Lock
                                                    size={8}
                                                    className="opacity-70 ml-0.5"
                                                  />
                                                ) : null}
                                              </div>
                                            </React.Fragment>
                                          );
                                        })}
                                        {items.length === 0 && (
                                          <span className="text-[10px] text-slate-300 italic">
                                            None
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </>
          )}
        </div>
      )}

      {shiftEditModal && (() => {
        const progIdx = programs.findIndex(p => p.dateString === shiftEditModal.dateString);
        if (progIdx === -1) return null;
        const prog = programs[progIdx];
        const shift = shifts.find(s => s.id === shiftEditModal.shiftId);
        if (!shift) return null;

        const currentAssignments = prog.assignments.filter(a => a.shiftId === shift.id);
        const nonLabourWorkerCount = currentAssignments.filter(a => {
           const st = activeStaff.find(s => s.id === a.staffId);
           return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        const workingIds = new Set(prog.assignments.map(a => a.staffId));
        const offStaff = activeStaff.filter(s => !workingIds.has(s.id));

        const addStaff = (staffId: string) => {
          const newPrograms = [...programs];
          const maxSort = Math.max(0, ...prog.assignments.map(a => a.manualSortIndex || 0));
          const newProg = { ...newPrograms[progIdx], assignments: [...newPrograms[progIdx].assignments] };
          newProg.assignments.push({
            id: Math.random().toString(36).substr(2, 9),
            staffId,
            shiftId: shift.id,
            flightId: "",
            role: "OPS",
            manualSortIndex: maxSort + 1
          });
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms);
        };

        const removeStaff = (staffId: string) => {
          const newPrograms = [...programs];
          const newProg = { ...newPrograms[progIdx] };
          newProg.assignments = newProg.assignments.filter(
            a => !(a.staffId === staffId && a.shiftId === shift.id)
          );
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms);
        };

        return (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
              <div className="bg-indigo-600 p-4 flex items-center justify-between">
                <h3 className="font-black italic uppercase tracking-widest text-white leading-none">
                  Shift at {shift.pickupTime} <span className="text-indigo-200">({nonLabourWorkerCount}/{shift.maxStaff})</span>
                </h3>
                <button
                  onClick={() => setShiftEditModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Currently Assigned</h4>
                {currentAssignments.length === 0 ? (
                  <p className="text-sm text-slate-400 italic mb-4">No staff assigned.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {currentAssignments.map(a => {
                      const st = activeStaff.find(s => s.id === a.staffId);
                      if (!st) return null;
                      return (
                        <div key={a.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl">
                          <span className="font-bold text-sm text-slate-700">{st.name}</span>
                          <button
                            onClick={() => removeStaff(st.id)}
                            className="bg-rose-50 text-rose-500 p-2 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pt-4 border-t border-slate-100">Add Staff</h4>
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20"
                  onChange={(e) => {
                    if (e.target.value) {
                      addStaff(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select available staff...</option>
                  {offStaff.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.initials})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })()}

      {staffActionModal && (() => {
        const progIdx = programs.findIndex(p => p.dateString === staffActionModal.date);
        const st = activeStaff.find(s => s.id === staffActionModal.staffId);
        if (progIdx === -1 || !st) return null;
        
        return (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
              <div className="bg-indigo-600 p-4 flex items-center justify-between">
                <h3 className="font-black italic uppercase tracking-widest text-white leading-none">
                  Move Staff
                </h3>
                <button
                  onClick={() => setStaffActionModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">
                    {st.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{st.name}</h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Current: {staffActionModal.currentShiftId.startsWith("ABSENCE_") 
                        ? staffActionModal.currentShiftId.replace("ABSENCE_", "") 
                        : (shifts.find(s => s.id === staffActionModal.currentShiftId)?.pickupTime ? `Shift at ${shifts.find(s => s.id === staffActionModal.currentShiftId)?.pickupTime}` : staffActionModal.currentShiftId)}
                    </p>
                  </div>
                </div>

                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Move To</label>
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 mb-4"
                  onChange={(e) => {
                    executeMove(
                      staffActionModal.staffId,
                      staffActionModal.currentShiftId,
                      staffActionModal.date,
                      staffActionModal.role,
                      e.target.value,
                      staffActionModal.date
                    );
                    setStaffActionModal(null);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select destination...</option>
                  <optgroup label="Shifts">
                    {shifts.filter(s => s.pickupDate === staffActionModal.date)
                      .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime))
                      .map(s => (
                      <option key={s.id} value={s.id} disabled={s.id === staffActionModal.currentShiftId}>Shift at {s.pickupTime}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Absences">
                    <option value="ABSENCE_ANNUAL LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_ANNUAL LEAVE"}>Annual Leave</option>
                    <option value="ABSENCE_SICK LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_SICK LEAVE"}>Sick Leave</option>
                    <option value="ABSENCE_ROSTER LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_ROSTER LEAVE" || st.type === "Local"}>Roster Leave</option>
                    <option value="ABSENCE_STANDBY (RESERVE)" disabled={staffActionModal.currentShiftId === "ABSENCE_STANDBY (RESERVE)"}>Standby (Reserve)</option>
                  </optgroup>
                  <optgroup label="Action">
                    <option value="OFFDUTY" disabled={staffActionModal.currentShiftId === "OFFDUTY"}>Remove from Shift / Send Off-Duty</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
        );
      })()}

      {noteModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-4 flex items-center justify-between">
              <h3 className="font-black italic uppercase tracking-widest text-white leading-none flex items-center gap-2">
                <MessageSquare size={16} />
                Shift Note
              </h3>
            </div>
            <div className="p-5">
              <textarea
                autoFocus
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 placeholder:text-slate-300 transition-all resize-none h-32"
                placeholder="Enter shift note here..."
                value={noteModal.currentNote}
                onChange={(e) => setNoteModal({ ...noteModal, currentNote: e.target.value })}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => setNoteModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleUpdateNote(noteModal.dateString, noteModal.shiftId, noteModal.currentNote);
                  setNoteModal(null);
                }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest italic transition-colors text-sm"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
