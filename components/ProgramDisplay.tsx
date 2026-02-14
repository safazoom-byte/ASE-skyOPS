
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest, IncomingDuty, Skill } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { repairProgramWithAI } from '../services/geminiService';
import { 
  FileText, 
  Plane, 
  ShieldCheck, 
  TriangleAlert, 
  CalendarDays, 
  LayoutGrid, 
  List,
  Activity,
  Users,
  CheckCircle2,
  Calendar,
  CircleAlert,
  Coffee,
  Printer,
  ChevronRight,
  UserX,
  Moon,
  ShieldAlert,
  BarChart3,
  Check,
  CalendarRange,
  TrendingUp,
  ShieldAlert as AlertIcon,
  Briefcase,
  Timer,
  Zap,
  Loader2,
  Clock
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  incomingDuties?: IncomingDuty[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  stationHealth?: number;
  alerts?: { type: 'danger' | 'warning', message: string }[];
  minRestHours?: number;
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, leaveRequests = [], incomingDuties = [], startDate, endDate, onUpdatePrograms, stationHealth = 100, alerts = [], minRestHours = 12 }) => {
  const [isRepairing, setIsRepairing] = useState(false);
  
  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs)) return [];
    if (!startDate || !endDate) return programs;
    const results = programs.filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate);
    results.sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
    const seen = new Set<string>();
    return results.filter(p => {
      const d = p.dateString!;
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }, [programs, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  // Helper to calculate previous shift end time for rest calculation
  const getPreviousShiftEnd = (staffId: string, currentProgramDate: string): Date | null => {
    const currentIdx = filteredPrograms.findIndex(p => p.dateString === currentProgramDate);
    
    for (let i = currentIdx - 1; i >= 0; i--) {
        const p = filteredPrograms[i];
        const assign = p.assignments.find(a => a.staffId === staffId);
        if (assign) {
            const sh = getShiftById(assign.shiftId);
            if (sh) {
                let baseDate = new Date(p.dateString!);
                const [ph, pm] = sh.pickupTime.split(':').map(Number);
                const [eh, em] = sh.endTime.split(':').map(Number);
                if (eh < ph) {
                    baseDate.setDate(baseDate.getDate() + 1);
                }
                const endStr = baseDate.toISOString().split('T')[0];
                return new Date(`${endStr}T${sh.endTime}:00`);
            }
        }
    }

    const history = incomingDuties
      .filter(d => d.staffId === staffId && d.date < currentProgramDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.shiftEndTime.localeCompare(a.shiftEndTime));
    
    if (history.length > 0) {
      return new Date(`${history[0].date}T${history[0].shiftEndTime}:00`);
    }

    return null;
  };

  const calculateRestHours = (staffId: string, dateStr: string, pickupTime: string): number | null => {
    const prevEnd = getPreviousShiftEnd(staffId, dateStr);
    if (!prevEnd) return null;
    
    const currentStart = new Date(`${dateStr}T${pickupTime}:00`);
    const diffMs = currentStart.getTime() - prevEnd.getTime();
    return diffMs / (1000 * 60 * 60);
  };

  const staffStats = useMemo(() => {
    const stats: Record<string, { work: number, off: number, rosterPotential: number, rosterLeave: number, annualLeave: number, standby: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0, rosterPotential: 0, rosterLeave: 0, annualLeave: 0, standby: 0 });
    
    if (startDate && endDate) {
      staff.forEach(s => {
        if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
           let potential = 0;
           let curr = new Date(startDate);
           const end = new Date(endDate);
           const sFrom = new Date(s.workFromDate);
           const sTo = new Date(s.workToDate);
           
           while (curr <= end) {
             if (curr >= sFrom && curr <= sTo) potential++;
             curr.setDate(curr.getDate() + 1);
           }
           stats[s.id].rosterPotential = potential;
        } else {
           stats[s.id].rosterPotential = filteredPrograms.length;
        }
      });
    }

    filteredPrograms.forEach(program => {
       const dStr = program.dateString!;
       const workingIds = new Set(program.assignments.map(a => a.staffId));

       staff.forEach(s => {
          if (workingIds.has(s.id)) {
            stats[s.id].work++;
          } else {
             const leave = leaveRequests.find(r => r.staffId === s.id && dStr >= r.startDate && dStr <= r.endDate);
             if (leave) {
                stats[s.id].annualLeave++;
             } else if (s.type === 'Roster' && s.workFromDate && s.workToDate && (dStr < s.workFromDate || dStr > s.workToDate)) {
                stats[s.id].rosterLeave++;
             } else if (s.type === 'Local') {
                stats[s.id].off++;
             } else {
                stats[s.id].standby++;
             }
          }
       });
    });

    return stats;
  }, [filteredPrograms, staff, leaveRequests, startDate, endDate]);

  const getFullRegistryForDay = (program: DailyProgram): Record<string, string[]> => {
      const dateStr = program.dateString;
      if (!dateStr) return {};

      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      
      const registryGroups: Record<string, string[]> = {
         'RESTING (POST-DUTY)': [],
         'DAYS OFF': [],
         'ROSTER LEAVE': [],
         'ANNUAL LEAVE': [],
         'STANDBY (RESERVE)': []
      };

      staff.forEach(s => {
         if (assignedIds.has(s.id)) return;
         
         const stat = staffStats[s.id];
         const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
         const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);

         let category = '';
         // CRITICAL: Prioritize LEAVE over REST LOCK for display purposes.
         // If a staff is on Annual Leave, they should be listed as such, even if they have a rest lock from previous duty.
         if (leave) {
            if (leave.type === 'Day off') category = 'DAYS OFF';
            else if (leave.type === 'Roster leave') category = 'ROSTER LEAVE';
            else category = 'ANNUAL LEAVE'; // Catch-all for Annual, Sick, Lieu
         } else if (restLock) {
            category = 'RESTING (POST-DUTY)';
         } else if (s.type === 'Roster' && s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate)) {
             category = 'ROSTER LEAVE';
         } else if (s.type === 'Local') {
             category = 'DAYS OFF';
         } else {
             category = 'STANDBY (RESERVE)';
         }

         let count = 0;
         if (category === 'DAYS OFF') count = stat.off;
         else if (category === 'ROSTER LEAVE') count = 7; 
         else if (category === 'ANNUAL LEAVE') count = stat.annualLeave;
         else if (category === 'STANDBY (RESERVE)') count = stat.standby;
         
         if (registryGroups[category]) {
             let displayStr = `${s.initials}`;
             // Only show count for categories where it's relevant context
             if (category !== 'RESTING (POST-DUTY)') {
                 displayStr += ` (${count})`;
             }
             registryGroups[category].push(displayStr);
         }
      });
      return registryGroups;
  };

  const handleAutoRepair = async () => {
    if (isRepairing) return;
    
    // Perform Deep Audit
    const violations: string[] = [];
    
    // 1. Check Shift Headcounts & Roles
    filteredPrograms.forEach(p => {
       const shiftsMap: Record<string, Assignment[]> = {};
       p.assignments.forEach(a => {
         if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
         shiftsMap[a.shiftId || ''].push(a);
       });

       shifts.forEach(s => {
          if (p.day !== s.day) return; 
          
          const assigned = shiftsMap[s.id] || [];
          
          const requiredStaff: number = Number(s.minStaff) || 0;
          // Headcount check
          if (assigned.length < requiredStaff) {
             violations.push(`SHIFT ERROR: ${p.dateString} @ ${s.pickupTime} - Missing ${requiredStaff - assigned.length} staff (Has ${assigned.length}, Need ${requiredStaff})`);
          }

          // Role check
          if (s.roleCounts) {
             Object.entries(s.roleCounts).forEach(([reqRole, value]) => {
                const count = Number(value);
                if (!count) return;

                // Map requirement name (long) to role code (short)
                let targetCode = '';
                if (reqRole === 'Shift Leader') targetCode = 'SL';
                else if (reqRole === 'Load Control') targetCode = 'LC';
                else if (reqRole === 'Ramp') targetCode = 'RMP';
                else if (reqRole === 'Operations') targetCode = 'OPS';
                else if (reqRole === 'Lost and Found') targetCode = 'LF';

                // Count how many assigned staff satisfy this role
                const hasRole = assigned.filter(a => {
                    const r = (a.role || '').toUpperCase();
                    // Direct match or Hybrid match
                    if (r === targetCode) return true;
                    if (r === 'SL+LC' && (targetCode === 'SL' || targetCode === 'LC')) return true;
                    // Fallback for full strings if AI outputted them
                    if (targetCode && r.includes(targetCode)) return true;
                    return false;
                }).length;

                if (hasRole < count) {
                   violations.push(`ROLE ERROR: ${p.dateString} @ ${s.pickupTime} - Missing ${count - hasRole} ${reqRole} (Has ${hasRole}, Need ${count})`);
                }
             });
          }
       });
    });

    // 2. Check Contract & Utilization
    staff.forEach(s => {
       const st = staffStats[s.id];
       if (s.type === 'Local') {
          // Strict 5/2 check for Local
          if (st.work !== 5) {
             violations.push(`CONTRACT ERROR: ${s.initials} (Local) is working ${st.work} days. MUST work exactly 5 days.`);
          }
       } else if (s.type === 'Roster') {
          // Strict Contract Window check
          if (st.work !== st.rosterPotential) {
             violations.push(`CONTRACT ERROR: ${s.initials} (Roster) is working ${st.work} days. MUST work ${st.rosterPotential} days based on contract dates.`);
          }
       }
    });

    // 3. Rest Checks
    filteredPrograms.forEach(p => {
       p.assignments.forEach(a => {
          const sh = getShiftById(a.shiftId);
          if (sh) {
             const rest = calculateRestHours(a.staffId, p.dateString!, sh.pickupTime);
             if (rest !== null && rest < minRestHours) {
                violations.push(`REST ERROR: ${p.dateString} - Staff ${a.staffId} has only ${rest.toFixed(1)}h rest (Min ${minRestHours}h).`);
             }
          }
       });
    });

    if (violations.length === 0) {
       alert("Logic Audit Passed: No violations detected.");
       return;
    }

    if (!confirm(`Found ${violations.length} violations:\n\n${violations.slice(0, 5).join('\n')}\n...\n\nProceed with AI Surgical Repair?`)) return;

    setIsRepairing(true);
    try {
        const result = await repairProgramWithAI(
          filteredPrograms, 
          violations.join('\n'), 
          { flights, staff, shifts, programs: filteredPrograms, leaveRequests, incomingDuties },
          { minRestHours }
        );
        if (onUpdatePrograms) onUpdatePrograms(result.programs);
    } catch (e: any) {
        alert("Repair Failed: " + e.message);
    } finally {
        setIsRepairing(false);
    }
  };

  const formatRoleLabel = (role: string | undefined) => {
    const r = String(role || '').trim().toUpperCase();
    if (!r || r === 'NIL' || r === 'GENERAL' || r === 'AGENT') return '';
    return `(${r})`;
  };

  const getDayLabel = (program: DailyProgram) => {
    if (program.dateString) {
      const d = new Date(program.dateString);
      return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' - ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return `DAY ${program.day + 1}`;
  };

  // --- PDF GENERATION LOGIC ---
  const exportPDF = () => {
    if (filteredPrograms.length === 0) return;
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    
    // --- COLOR PALETTE AS REQUESTED ---
    const headerBlack = [0, 0, 0] as [number, number, number];
    const auditBlue = [2, 6, 23] as [number, number, number]; // Deep Slate Blue for Util Audits
    const matrixOrange = [217, 119, 6] as [number, number, number]; // Amber/Orange for Matrix

    // 1. Daily Program Pages (Header: Black)
    filteredPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      
      doc.setFont('helvetica', 'bold').setFontSize(20).text(`SkyOPS Station Handling Program`, 14, 15);
      doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100).text(`Target Period: ${startDate} to ${endDate}`, 14, 22);
      doc.setFontSize(14).setFont('helvetica', 'bold').setTextColor(0).text(getDayLabel(program), 14, 32);

      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });

      const sortedShiftIds = Object.keys(shiftsMap).sort((a,b) => {
         const sA = getShiftById(a);
         const sB = getShiftById(b);
         return (sA?.pickupTime || '').localeCompare(sB?.pickupTime || '');
      });

      const tableData = sortedShiftIds.map((shiftId, i) => {
        const sh = getShiftById(shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join('/') || 'NIL';
        const personnelStr = shiftsMap[shiftId].map(a => {
          const st = getStaffById(a.staffId);
          const roleLabel = formatRoleLabel(a.role);
          return `${st?.initials || '??'} ${roleLabel}`;
        }).join(' | ');
        return [
          (i+1).toString(), 
          sh?.pickupTime || '--:--', 
          sh?.endTime || '--:--', 
          fls, 
          `${shiftsMap[shiftId].length} / ${sh?.maxStaff || sh?.minStaff || '0'}`, 
          personnelStr
        ];
      });

      autoTable(doc, {
        startY: 36,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: headerBlack, textColor: 255, fontSize: 9, fontStyle: 'bold', cellPadding: 3 },
        bodyStyles: { fontSize: 8, cellPadding: 3, textColor: 50 },
        columnStyles: { 
          0: { cellWidth: 10 }, 
          1: { cellWidth: 20 }, 
          2: { cellWidth: 20 }, 
          3: { cellWidth: 30 }, 
          4: { cellWidth: 20 },
          5: { cellWidth: 'auto' }
        },
        styles: { lineColor: [220, 220, 220], lineWidth: 0.1 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(12).setFont('helvetica', 'bold').text("ABSENCE AND REST REGISTRY", 14, currentY);
      const registryGroups = getFullRegistryForDay(program);
      const registryBody = [
         ['RESTING (POST-DUTY)', registryGroups['RESTING (POST-DUTY)'].join(', ') || 'NONE'],
         ['DAYS OFF', registryGroups['DAYS OFF'].join(', ') || 'NONE'],
         ['ROSTER LEAVE', registryGroups['ROSTER LEAVE'].join(', ') || 'NONE'],
         ['ANNUAL LEAVE', registryGroups['ANNUAL LEAVE'].join(', ') || 'NONE'],
         ['STANDBY (RESERVE)', registryGroups['STANDBY (RESERVE)'].join(', ') || 'NONE'],
      ];
      autoTable(doc, {
        startY: currentY + 3,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: registryBody,
        theme: 'grid',
        headStyles: { fillColor: [60, 70, 80], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
      });
    });

    // 2. Weekly Personnel Utilization Audit - Local (Header: Blue)
    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Personnel Utilization Audit (Local)", 14, 20);
    const localStaff = staff.filter(s => s.type === 'Local');
    const localAuditRows = localStaff.map((s, i) => {
       const st = staffStats[s.id];
       const isMatch = st.work === 5 && st.off === 2;
       return [
         (i+1).toString(),
         s.name,
         s.initials,
         st.work.toString(),
         st.off.toString(),
         isMatch ? 'MATCH' : 'CHECK'
       ];
    });
    autoTable(doc, {
      startY: 25,
      head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']],
      body: localAuditRows,
      theme: 'grid',
      headStyles: { fillColor: auditBlue, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 15 }, 2: { cellWidth: 20 }, 5: { fontStyle: 'bold' } }
    });

    // 3. Weekly Personnel Utilization Audit - Roster (Header: Blue)
    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Personnel Utilization Audit (Roster)", 14, 20);
    const rosterStaff = staff.filter(s => s.type === 'Roster');
    const rosterAuditRows = rosterStaff.map((s, i) => {
       const st = staffStats[s.id];
       const isMatch = st.work === st.rosterPotential;
       return [
         (i+1).toString(),
         s.name,
         s.initials,
         s.workFromDate || '?',
         s.workToDate || '?',
         st.rosterPotential.toString(),
         st.work.toString(),
         isMatch ? 'MATCH' : 'CHECK'
       ];
    });
    autoTable(doc, {
      startY: 25,
      head: [['S/N', 'NAME', 'INIT', 'WORK FROM', 'WORK TO', 'POTENTIAL', 'ACTUAL', 'STATUS']],
      body: rosterAuditRows,
      theme: 'grid',
      headStyles: { fillColor: auditBlue, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 
         0: { cellWidth: 15 }, 
         2: { cellWidth: 15 },
         7: { fontStyle: 'bold' }
      }
    });

    // 4. Weekly Operations Matrix View (Header: Orange)
    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Operations Matrix View", 14, 20);
    doc.setFontSize(10).setTextColor(100).text("Comprehensive Assignment Timeline with Rest Tracking", 14, 26);

    const dates = filteredPrograms.map(p => {
       const d = new Date(p.dateString!);
       return `${d.getDate()}/${d.getMonth()+1}`;
    });
    const matrixHead = [['S/N', 'AGENT', ...dates, 'AUDIT']];

    const matrixRows = staff.map((s, i) => {
       const row = [(i+1).toString(), `${s.initials} (${s.type === 'Local' ? 'L' : 'R'})`];
       filteredPrograms.forEach(p => {
          const assign = p.assignments.find(a => a.staffId === s.id);
          if (assign) {
             const sh = getShiftById(assign.shiftId);
             if (sh) {
                const rest = calculateRestHours(s.id, p.dateString!, sh.pickupTime);
                const restStr = rest !== null ? `(${rest.toFixed(1)}H REST)` : '';
                row.push(`${sh.pickupTime}\n${restStr}`);
             } else {
                row.push('ERROR');
             }
          } else {
             row.push('-');
          }
       });
       const st = staffStats[s.id];
       const target = s.type === 'Local' ? 5 : st.rosterPotential;
       row.push(`${st.work}/${target}`);
       return row;
    });

    autoTable(doc, {
      startY: 30,
      head: matrixHead,
      body: matrixRows,
      theme: 'grid',
      headStyles: { fillColor: matrixOrange, textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 7, cellPadding: 2, halign: 'center', valign: 'middle' },
      columnStyles: { 
         0: { cellWidth: 10 }, 
         1: { cellWidth: 25, halign: 'left', fontStyle: 'bold' },
         [dates.length + 2]: { cellWidth: 15, fontStyle: 'bold' } 
      },
      didParseCell: (data) => {
         if (data.section === 'body' && data.column.index > 1 && data.column.index < dates.length + 2) {
            const text = data.cell.raw as string;
            if (text.includes('-')) {
               // Off day styling
            } else {
               data.cell.styles.fontStyle = 'bold';
            }
         }
      }
    });

    doc.save(`SkyOPS_Master_Report_${startDate}.pdf`);
  };

  return (
    <div className="space-y-8 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3.5rem] shadow-2xl flex flex-col xl:flex-row items-center justify-between gap-8 relative overflow-hidden">
        <div className="flex items-center gap-6 md:gap-8 relative z-10 flex-col md:flex-row text-center xl:text-left">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/40 border-4 border-white/10">
            <CalendarDays size={32} className="md:w-10 md:h-10 text-white" />
          </div>
          <div>
            <h3 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-white leading-none">Weekly Program</h3>
            <p className="text-blue-300 text-[9px] md:text-xs font-black uppercase tracking-[0.3em] mt-2 flex items-center justify-center xl:justify-start gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" /> {filteredPrograms.length} Days Generated
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto relative z-10">
           <button onClick={handleAutoRepair} disabled={isRepairing} className="flex-1 px-8 py-5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-amber-500/20 group disabled:opacity-50 disabled:cursor-not-allowed">
             {isRepairing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} className="group-hover:animate-pulse" />}
             <span className="text-[10px] font-black uppercase tracking-widest italic">{isRepairing ? 'Running AI Audit...' : 'Full Repair (100%)'}</span>
           </button>
           <button onClick={exportPDF} className="flex-1 px-8 py-5 bg-white text-slate-900 hover:bg-slate-200 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg">
             <Printer size={18} />
             <span className="text-[10px] font-black uppercase tracking-widest italic">Print Master PDF</span>
           </button>
        </div>
      </div>

      <div className="space-y-8">
        {filteredPrograms.length === 0 ? (
          <div className="py-20 md:py-32 text-center bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200">
             <LayoutGrid size={48} className="mx-auto text-slate-200 mb-6" />
             <h4 className="text-xl font-black uppercase italic text-slate-300">No Program Generated</h4>
             <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">Use the dashboard to build a schedule</p>
          </div>
        ) : (
          filteredPrograms.map((program) => (
             <div key={program.day} className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col gap-6">
                 <div className="flex justify-between items-center pb-6 border-b border-slate-50">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-slate-950 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-lg">
                          {new Date(program.dateString || '').getDate()}
                       </div>
                       <div>
                          <h4 className="text-xl font-black italic uppercase text-slate-900">{getDayLabel(program)}</h4>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Daily Operations Log</p>
                       </div>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                       <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase">{program.assignments.length} Duties</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                    {(() => {
                        const shiftsMap: Record<string, Assignment[]> = {};
                        program.assignments.forEach(a => {
                          if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
                          shiftsMap[a.shiftId || ''].push(a);
                        });
                        return Object.entries(shiftsMap).map(([shiftId, group]) => {
                           const sh = getShiftById(shiftId);
                           const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(' / ');
                           return (
                             <div key={shiftId} className="flex flex-col md:flex-row gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                <div className="w-full md:w-48 shrink-0 space-y-2">
                                   <div className="flex items-center gap-2">
                                      <Clock size={14} className="text-blue-500" />
                                      <span className="text-sm font-black italic text-slate-900">{sh?.pickupTime} - {sh?.endTime}</span>
                                   </div>
                                   {fls && (
                                     <div className="flex items-center gap-2">
                                        <Plane size={12} className="text-slate-400" />
                                        <span className="text-[9px] font-bold text-slate-500">{fls}</span>
                                     </div>
                                   )}
                                </div>
                                <div className="flex-1 flex flex-wrap gap-2">
                                   {group.map(a => {
                                      const st = getStaffById(a.staffId);
                                      const isSpecialist = a.role && a.role !== 'General' && a.role !== 'NIL';
                                      return (
                                        <div key={a.id} className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${isSpecialist ? 'bg-white border-blue-100 shadow-sm' : 'bg-slate-100 border-transparent text-slate-500'}`}>
                                           <span className="text-[10px] font-black uppercase text-slate-900">{st?.initials}</span>
                                           {isSpecialist && <span className="text-[8px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-md">{a.role}</span>}
                                        </div>
                                      )
                                   })}
                                   {group.length < (sh?.minStaff || 0) && (
                                     <div className="px-3 py-2 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-500 animate-pulse">
                                        <AlertIcon size={12} />
                                        <span className="text-[9px] font-black uppercase">Understaffed</span>
                                     </div>
                                   )}
                                </div>
                             </div>
                           );
                        });
                    })()}
                 </div>

                 <div className="mt-4 pt-6 border-t border-slate-100">
                    <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Absence & Rest Registry</h5>
                    <div className="flex flex-wrap gap-4">
                       {Object.entries(getFullRegistryForDay(program)).map(([cat, agents]) => (
                          agents.length > 0 && (
                            <div key={cat} className="space-y-1">
                               <span className="text-[8px] font-bold text-slate-300 uppercase block">{cat}</span>
                               <div className="text-[10px] font-black text-slate-600 uppercase leading-relaxed max-w-xs">
                                 {agents.join(', ')}
                               </div>
                            </div>
                          )
                       ))}
                    </div>
                 </div>
             </div>
          ))
        )}
      </div>
    </div>
  );
};
