import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment } from '../types';
import { repairProgramWithAI, calculateCredits } from '../services/geminiService';
import { StationStatistics } from './StationStatistics';
import { AVAILABLE_SKILLS } from '../constants';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Printer, 
  CalendarDays, 
  ChevronRight,
  AlertTriangle,
  Moon,
  Zap,
  UserX,
  Sparkles,
  Wrench,
  Loader2,
  CheckCircle2,
  X,
  ShieldAlert,
  Activity,
  ArrowRight,
  Move,
  Ban,
  UserCheck,
  Scale
} from 'lucide-react';

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

interface AuditIssue {
  id: string;
  category: 'coverage' | 'fatigue' | 'roster' | 'local';
  severity: 'critical' | 'warning';
  title: string;
  description: string;
}

interface MoveSource {
  staffId: string;
  assignmentId: string;
  shiftId: string;
  dateString: string;
  role: string;
}

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests = [], 
  incomingDuties = [], 
  startDate, 
  endDate, 
  stationHealth = 100, 
  minRestHours = 12,
  onUpdatePrograms
}) => {
  const [isRepairing, setIsRepairing] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [includeStats, setIncludeStats] = useState(true);
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({
    coverage: true,
    fatigue: true,
    roster: true,
    local: true
  });
  
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);

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

  const prevDate = useMemo(() => {
     if (!startDate) return '';
     const d = new Date(startDate);
     d.setDate(d.getDate() - 1);
     return d.toISOString().split('T')[0];
  }, [startDate]);

  const incomingGroups = useMemo(() => {
    if (!prevDate || !incomingDuties) return [];
    const duties = incomingDuties.filter(d => d.date === prevDate);
    if (duties.length === 0) return [];
    
    const grouped: Record<string, IncomingDuty[]> = {};
    duties.forEach(d => {
      const t = d.shiftEndTime || '00:00';
      if(!grouped[t]) grouped[t] = [];
      grouped[t].push(d);
    });

    return Object.entries(grouped).sort(([t1], [t2]) => t1.localeCompare(t2));
  }, [incomingDuties, prevDate]);

  const stats = useMemo(() => {
    if (!startDate || !endDate || !includeStats) return null;
    const duration = filteredPrograms.length;
    let totalSupply = 0;
    let totalDemand = 0;

    staff.forEach(s => {
      totalSupply += calculateCredits(s, startDate, duration, leaveRequests);
    });

    const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
    activeShifts.forEach(s => {
      totalDemand += s.minStaff;
    });

    const balance = totalSupply - totalDemand;
    return { totalSupply, totalDemand, balance, status: balance >= 0 ? 'HEALTHY' : 'CRITICAL' };
  }, [startDate, endDate, includeStats, staff, shifts, leaveRequests, filteredPrograms]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const calculateAvailableTime = (endTime: string) => {
    const [h, m] = endTime.split(':').map(Number);
    let availH = h + minRestHours;
    const availM = m;
    let suffix = '';
    if (availH >= 24) {
        availH -= 24;
        suffix = ' (+1)';
    }
    return `${String(availH).padStart(2, '0')}:${String(availM).padStart(2, '0')}${suffix}`;
  };

  const getFormatDate = (dateStr?: string) => {
    if (!dateStr) return 'Invalid Date';
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).toUpperCase().replace(',', ' -');
  };

  const handleAssignmentClick = (e: React.MouseEvent, assignment: Assignment, dateString: string) => {
    e.stopPropagation();
    if (moveSource?.assignmentId === assignment.id) {
      setMoveSource(null);
    } else {
      setMoveSource({
        staffId: assignment.staffId,
        assignmentId: assignment.id,
        shiftId: assignment.shiftId || '',
        dateString,
        role: assignment.role
      });
    }
  };

  const executeMove = (targetShiftId: string, dateString: string) => {
    if (!onUpdatePrograms || !moveSource) return;
    if (moveSource.dateString !== dateString) {
      alert("Cross-day moves restricted in this view.");
      setMoveSource(null);
      return;
    }
    if (moveSource.shiftId === targetShiftId) {
      setMoveSource(null);
      return;
    }
    const updatedPrograms = programs.map(p => {
      if (p.dateString === dateString) {
        return {
          ...p,
          assignments: p.assignments.map(a => {
            if (a.id === moveSource.assignmentId) return { ...a, shiftId: targetShiftId };
            return a;
          })
        };
      }
      return p;
    });
    onUpdatePrograms(updatedPrograms);
    setMoveSource(null);
  };

  const checkAssignmentViolation = (staffId: string, role: string) => {
    const st = getStaffById(staffId);
    if (!st) return null;
    let isQualified = true;
    if (role.includes('SL') || role.includes('Leader')) isQualified = st.isShiftLeader;
    else if (role.includes('LC') || role.includes('Load')) isQualified = st.isLoadControl;
    else if (role.includes('RMP') || role.includes('Ramp')) isQualified = st.isRamp;
    else if (role.includes('OPS') || role.includes('Operations')) isQualified = st.isOps;
    if (!isQualified) return 'Skill Mismatch';
    return null;
  };

  const runDiagnostics = () => {
    const issues: AuditIssue[] = [];
    const duration = filteredPrograms.length;

    filteredPrograms.forEach(p => {
        const dayShifts = shifts.filter(s => s.pickupDate === p.dateString);
        const staffOnDay = new Set<string>();
        dayShifts.forEach(s => {
            const assignments = p.assignments.filter(a => a.shiftId === s.id);
            if (assignments.length < s.minStaff) {
                issues.push({
                    id: `cov-${s.id}`,
                    category: 'coverage',
                    severity: 'critical',
                    title: `Understaffed Shift: ${s.pickupDate}`,
                    description: `Shift ${s.pickupTime} has only ${assignments.length}/${s.minStaff} required agents.`
                });
            }
            assignments.forEach(a => {
               const violation = checkAssignmentViolation(a.staffId, a.role);
               if (violation) issues.push({ id: `sk-${a.id}`, category: 'roster', severity: 'warning', title: `Skill Violation: ${getStaffById(a.staffId)?.initials}`, description: `${a.role} assignment without qualification.` });
            });
        });
        p.assignments.forEach(a => {
             if (staffOnDay.has(a.staffId)) {
                if (!issues.some(i => i.id === `db-${a.staffId}-${p.dateString}`)) {
                  issues.push({ id: `db-${a.staffId}-${p.dateString}`, category: 'fatigue', severity: 'critical', title: `Double Booked: ${getStaffById(a.staffId)?.initials}`, description: `Multiple assignments on ${p.dateString}.` });
                }
             }
             staffOnDay.add(a.staffId);
        });
    });

    staff.forEach(s => {
        const worked = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        const limit = calculateCredits(s, startDate || '', duration, leaveRequests);
        if (worked > limit) {
            issues.push({ id: `lim-${s.id}`, category: s.type === 'Local' ? 'local' : 'roster', severity: 'critical', title: `Overworked: ${s.initials}`, description: `Assigned ${worked} shifts. Limit is ${limit}.` });
        }
    });

    setAuditIssues(issues);
    setShowAuditModal(true);
  };

  const executeRepair = async () => {
    if (!onUpdatePrograms) return;
    setIsRepairing(true);
    const activeIssues = auditIssues.filter(i => selectedCategories[i.category]);
    const report = activeIssues.map(i => `- ${i.title}: ${i.description}`).join('\n');
    try {
        const result = await repairProgramWithAI(programs, report, { flights, staff, shifts, programs, leaveRequests, incomingDuties }, { minRestHours });
        onUpdatePrograms(result.programs);
        setShowAuditModal(false);
    } catch (error: any) { alert(error.message); } finally { setIsRepairing(false); }
  };

  // --- PDF GENERATION (Replicating Screenshot Layout) ---
  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });

    const addStandardHeader = (pDate: string, isFirstPage: boolean) => {
        // App Title
        doc.setFontSize(24);
        doc.setTextColor(15, 23, 42); // Navy
        doc.setFont('helvetica', 'bold');
        doc.text("SkyOPS Station Handling Program", 14, 18);
        
        // Target Period
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFont('helvetica', 'normal');
        doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 26);

        // MANPOWER CAPACITY FORECAST (Top Right)
        if (isFirstPage && includeStats && stats) {
            const boxW = 85;
            const boxH = 35;
            const boxX = 195;
            const boxY = 10;
            
            // Box Shadow / Border
            doc.setFillColor(248, 250, 252); // slate-50
            doc.rect(boxX, boxY, boxW, boxH, 'F');
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.rect(boxX, boxY, boxW, boxH, 'S');

            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text("MANPOWER CAPACITY FORECAST", boxX + 6, boxY + 10);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
            doc.text(`Total Supply: ${stats.totalSupply} Shifts`, boxX + 6, boxY + 18);
            doc.text(`Total Demand: ${stats.totalDemand} Shifts (Min)`, boxX + 6, boxY + 24);
            
            // Status Line
            doc.setTextColor(16, 185, 129); // emerald-500
            doc.setFont('helvetica', 'bold');
            doc.text(`Net Balance: +${stats.balance}`, boxX + 6, boxY + 31);
            doc.text(`Status: ${stats.status}`, boxX + boxW - 35, boxY + 31);
        }

        // Current Date Header
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(getFormatDate(pDate), 14, 42);
    };

    filteredPrograms.forEach((p, idx) => {
        if (idx > 0) doc.addPage();
        const isFirstPage = idx === 0;
        addStandardHeader(p.dateString!, isFirstPage);

        let tableStartY = 48;

        // Page 1 Special: Add Incoming Handover Box
        if (isFirstPage && incomingGroups.length > 0) {
            // Replicating the yellow/amber box if needed, or keeping it clean
            // We'll proceed to the main table first as per user screenshot which usually has it integrated or below.
        }

        const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
        const tableData = dayShifts.map((s, sidx) => {
            const assigned = p.assignments.filter(a => a.shiftId === s.id);
            const flightCodes = (s.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
            const personnel = assigned.map(a => {
                const st = getStaffById(a.staffId);
                return `${st?.initials} (${getSkillCodeShort(a.role)})`;
            }).join(' | ');
            return [sidx + 1, s.pickupTime, s.endTime, flightCodes, `${assigned.length} / ${s.maxStaff}`, personnel];
        });

        autoTable(doc, {
            startY: tableStartY,
            head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'left' },
            styles: { fontSize: 8, cellPadding: 4, textColor: [15, 23, 42], font: 'helvetica' },
            columnStyles: { 0: { cellWidth: 12 }, 5: { cellWidth: 'auto' } },
            alternateRowStyles: { fillColor: [250, 250, 250] }
        });

        // ABSENCE AND REST REGISTRY (Styled exactly like screenshot)
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text("ABSENCE AND REST REGISTRY", 14, finalY);

        const dayLeaves = leaveRequests.filter(l => l.startDate <= p.dateString! && l.endDate >= p.dateString!);
        const registryData = [
            ['RESTING (POST-DUTY)', 'NONE'],
            ['DAYS OFF', dayLeaves.filter(l => l.type === 'Day off').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
            ['ROSTER LEAVE', dayLeaves.filter(l => l.type === 'Roster leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
            ['ANNUAL LEAVE', dayLeaves.filter(l => l.type === 'Annual leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
            ['STANDBY (RESERVE)', 'NONE']
        ];

        autoTable(doc, {
            startY: finalY + 5,
            head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
            body: registryData,
            theme: 'grid',
            headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 10 },
            styles: { fontSize: 8, cellPadding: 4 },
            columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
        });
    });

    doc.save(`SkyOPS_Station_Handling_${startDate}.pdf`);
  };

  const getSkillCodeShort = (role: string) => {
    if (role.includes('Leader')) return 'SL';
    if (role.includes('Load')) return 'LC';
    if (role.includes('Ramp')) return 'RMP';
    if (role.includes('Ops')) return 'OPS';
    if (role.includes('Lost')) return 'LF';
    return role;
  };

  return (
    <>
      {moveSource && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-slate-950 text-white px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-6 animate-in slide-in-from-top-6 border border-white/10 backdrop-blur-xl">
           <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping"></div>
           <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Reassigning Asset</span>
              <span className="text-sm font-black italic text-white">{getStaffById(moveSource.staffId)?.initials} ({moveSource.role})</span>
           </div>
           <button onClick={() => setMoveSource(null)} className="ml-4 p-2 bg-white/10 rounded-full hover:bg-rose-500 transition-all"><X size={16} /></button>
        </div>
      )}

      <div className="space-y-10 pb-24 animate-in fade-in duration-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <div>
            <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Station Program</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <CalendarDays size={14} className="text-blue-500" /> Operational Window: {startDate} → {endDate}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
             <label className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-[1.5rem] cursor-pointer hover:bg-slate-100 border border-slate-200 transition-all w-full sm:w-auto">
                <input type="checkbox" checked={includeStats} onChange={e => setIncludeStats(e.target.checked)} className="accent-blue-600 w-5 h-5 rounded-md" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">Attach Statistics Report</span>
             </label>
             <div className="flex gap-4 w-full sm:w-auto">
                <button onClick={runDiagnostics} className="flex-1 px-8 py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black uppercase italic text-xs tracking-widest hover:bg-emerald-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/10">
                    <Wrench size={18} /> AI Repair
                </button>
                <button onClick={generatePDF} className="flex-1 px-8 py-5 bg-slate-950 text-white rounded-[1.5rem] font-black uppercase italic text-xs tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-2xl">
                    <Printer size={18} /> Export PDF
                </button>
             </div>
          </div>
        </div>

        {/* Forecast Visual (Matching user request style) */}
        {includeStats && stats && (
           <div className="bg-slate-950 p-10 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-10 animate-in slide-in-from-top-6 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/10 blur-[120px] pointer-events-none"></div>
              <div className="flex items-center gap-8 relative z-10">
                 <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/40"><Scale size={40} /></div>
                 <div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tight">Manpower Capacity Forecast</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1.5">Station Readiness Assessment</p>
                 </div>
              </div>
              <div className="flex flex-wrap justify-center gap-6 relative z-10">
                 <div className="text-center bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] min-w-[140px] border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Supply</span>
                    <span className="text-3xl font-black italic">{stats.totalSupply}</span>
                 </div>
                 <div className="text-center bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] min-w-[140px] border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Demand</span>
                    <span className="text-3xl font-black italic text-rose-400">{stats.totalDemand}</span>
                 </div>
                 <div className={`text-center p-6 rounded-[2rem] min-w-[140px] shadow-2xl transition-all ${stats.balance >= 0 ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-rose-600 shadow-rose-600/20'}`}>
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest block mb-1">Net Balance</span>
                    <span className="text-3xl font-black italic text-white">+{stats.balance}</span>
                 </div>
              </div>
           </div>
        )}

        {filteredPrograms.length === 0 ? (
           <div className="py-32 text-center bg-slate-50 rounded-[4rem] border-2 border-dashed border-slate-200">
              <p className="text-2xl font-black text-slate-300 uppercase italic tracking-widest">Awaiting Station Roster Generation...</p>
           </div>
        ) : (
          filteredPrograms.map((program, index) => {
            const dayShifts = shifts.filter(s => s.pickupDate === program.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
            return (
              <div key={program.day} className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden break-inside-avoid transition-all hover:shadow-xl">
                 <div className="bg-slate-50 p-8 md:p-10 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">{getFormatDate(program.dateString)}</h3>
                    <div className="flex gap-4">
                        <span className="px-5 py-2 bg-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600">{dayShifts.length} Shifts Registered</span>
                        {index === 0 && <span className="px-5 py-2 bg-blue-600 rounded-xl text-[10px] font-black uppercase text-white shadow-lg shadow-blue-600/20">Operational Start</span>}
                    </div>
                 </div>

                 <div className="p-8 md:p-10">
                    {/* Incoming Handover - Page 1 */}
                    {index === 0 && incomingGroups.length > 0 && (
                      <div className="mb-12 bg-amber-50 rounded-[2.5rem] border border-amber-200 overflow-hidden shadow-sm">
                          <div className="bg-amber-100/50 p-6 border-b border-amber-200 flex items-center gap-4">
                             <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg"><Moon size={20} /></div>
                             <div>
                                <h4 className="text-lg font-black uppercase italic text-slate-900 leading-none">Incoming Handover (Day -1)</h4>
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mt-1.5">Last Operations for {prevDate}</p>
                             </div>
                          </div>
                          <div className="p-6 overflow-x-auto no-scrollbar">
                             <table className="w-full text-left text-sm font-bold">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase text-amber-800 tracking-widest border-b border-amber-200">
                                        <th className="p-4">Duty Release</th>
                                        <th className="p-4 text-center">Eligibility Window</th>
                                        <th className="p-4">Personnel Log</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100">
                                   {incomingGroups.map(([time, group]) => (
                                      <tr key={time} className="hover:bg-amber-100/30">
                                         <td className="p-4 font-black text-slate-900">{time} RELEASE</td>
                                         <td className="p-4 text-center">
                                            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white rounded-xl text-emerald-600 text-[10px] font-black border border-amber-200 shadow-sm">
                                                <Zap size={14} /> ELIGIBLE {calculateAvailableTime(time)}
                                            </span>
                                         </td>
                                         <td className="p-4 flex gap-2 flex-wrap">
                                            {group.map(d => <span key={d.id} className="bg-white px-3 py-1 rounded-lg border border-amber-200 text-[10px] font-black uppercase shadow-sm">{getStaffById(d.staffId)?.initials}</span>)}
                                         </td>
                                      </tr>
                                   ))}
                                </tbody>
                             </table>
                          </div>
                      </div>
                    )}

                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-950 text-[11px] font-black uppercase text-slate-400 tracking-[0.2em]">
                             <th className="p-5 w-16">S/N</th>
                             <th className="p-5 w-28">PICKUP</th>
                             <th className="p-5 w-36">LINKED TRAFFIC</th>
                             <th className="p-5 w-24 text-center">HC</th>
                             <th className="p-5">PERSONNEL & ROLES</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {dayShifts.map((s, idx) => {
                             const assigned = program.assignments.filter(a => a.shiftId === s.id);
                             const isMoveTarget = moveSource && moveSource.dateString === program.dateString && moveSource.shiftId !== s.id;
                             return (
                               <tr key={s.id} onClick={() => isMoveTarget && executeMove(s.id, program.dateString!)} className={`transition-all group ${isMoveTarget ? 'bg-blue-50 border-2 border-dashed border-blue-300 cursor-pointer scale-[0.99]' : 'hover:bg-slate-50/50'}`}>
                                  <td className="p-5 text-xs font-bold text-slate-400">{idx + 1}</td>
                                  <td className="p-5">
                                    <div className="flex flex-col">
                                        <span className="text-base font-black text-slate-900 leading-none">{s.pickupTime}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase mt-1">→ {s.endTime}</span>
                                    </div>
                                  </td>
                                  <td className="p-5">
                                    <div className="flex flex-wrap gap-1.5">
                                        {(s.flightIds || []).length > 0 ? (s.flightIds || []).map(fid => {
                                            const f = getFlightById(fid);
                                            return <span key={fid} className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-600 uppercase border border-slate-200">{(f?.flightNumber)}</span>
                                        }) : <span className="text-[9px] font-black text-slate-300 italic uppercase">NIL TRAFFIC</span>}
                                    </div>
                                  </td>
                                  <td className="p-5 text-center">
                                    <div className={`inline-flex px-3 py-1 rounded-lg text-xs font-black ${assigned.length < s.minStaff ? 'bg-rose-50 text-rose-600' : 'bg-slate-900 text-white'}`}>
                                        {assigned.length} / {s.maxStaff}
                                    </div>
                                  </td>
                                  <td className="p-5">
                                     <div className="flex flex-wrap gap-2.5">
                                        {assigned.map(a => {
                                          const violation = checkAssignmentViolation(a.staffId, a.role);
                                          const isSelected = moveSource?.assignmentId === a.id;
                                          return (
                                            <div key={a.id} onClick={(e) => handleAssignmentClick(e, a, program.dateString!)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer flex items-center gap-2 border transition-all active:scale-95 ${violation ? 'bg-rose-50 border-rose-200 text-rose-700' : isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'}`}>
                                               {getStaffById(a.staffId)?.initials} <span className="opacity-30">|</span> <span className="text-blue-500 group-hover:text-blue-600">{getSkillCodeShort(a.role)}</span>
                                            </div>
                                          );
                                        })}
                                        {assigned.length === 0 && <span className="text-[10px] italic text-rose-300 font-bold uppercase tracking-widest">Awaiting Manual Refinement</span>}
                                     </div>
                                  </td>
                               </tr>
                             );
                           })}
                        </tbody>
                      </table>
                    </div>
                 </div>

                 {/* Rest / Absence Footnote matching Screenshot */}
                 <div className="bg-slate-50/50 p-8 md:p-10 border-t border-slate-100">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em] mb-6 flex items-center gap-4">
                        <UserX size={18} className="text-slate-400" /> Absence & Rest Registry
                    </h5>
                    <div className="flex flex-wrap gap-6 text-[10px] font-black text-slate-500 uppercase tracking-tight">
                        {leaveRequests.filter(l => l.startDate <= program.dateString! && l.endDate >= program.dateString!).length > 0 ? (
                            leaveRequests.filter(l => l.startDate <= program.dateString! && l.endDate >= program.dateString!).map(l => (
                                <div key={l.id} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <span className="text-slate-900">{getStaffById(l.staffId)?.initials}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className="text-blue-500">{l.type}</span>
                                </div>
                            ))
                        ) : (
                            <span className="italic text-slate-300 py-2">All personnel active and eligible for deployment</span>
                        )}
                    </div>
                 </div>
              </div>
            );
          })
        )}
      </div>

      {showAuditModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] w-full max-w-3xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300">
              <div className="bg-slate-900 p-10 flex justify-between items-center text-white shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/30">
                        <Activity size={32} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-black italic uppercase tracking-tighter">Program Audit</h3>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                           {auditIssues.length} Potential Conflicts Identified
                        </p>
                    </div>
                 </div>
                 <button onClick={() => setShowAuditModal(false)} className="p-3 bg-white/10 rounded-full hover:bg-rose-500 transition-all"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50 no-scrollbar">
                 {auditIssues.length === 0 ? (
                    <div className="text-center py-24 space-y-4">
                        <CheckCircle2 size={64} className="mx-auto text-emerald-500" />
                        <p className="text-xl font-black text-emerald-600 uppercase italic tracking-widest">Station Optimized: All Deployment Safe</p>
                    </div>
                 ) : auditIssues.map(issue => (
                   <div key={issue.id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-start gap-6 transition-all hover:border-blue-200">
                      <div className={`p-4 rounded-2xl ${issue.severity === 'critical' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                        <ShieldAlert size={24} />
                      </div>
                      <div>
                        <h5 className="text-sm font-black uppercase text-slate-900 mb-2">{issue.title}</h5>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">{issue.description}</p>
                      </div>
                   </div>
                 ))}
              </div>
              <div className="p-8 bg-white border-t border-slate-100 flex gap-6">
                 <button onClick={() => setShowAuditModal(false)} className="flex-1 py-5 text-xs font-black uppercase text-slate-400 hover:text-slate-900 transition-all tracking-widest">Dismiss Report</button>
                 <button onClick={executeRepair} disabled={isRepairing || auditIssues.length === 0} className="flex-[2] bg-slate-950 text-white rounded-[1.5rem] font-black uppercase italic text-xs tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-4 shadow-2xl disabled:opacity-30">
                    {isRepairing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="text-blue-400" />}
                    {isRepairing ? 'AI Refinement Process Active...' : 'Authorize AI Remediation'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
};