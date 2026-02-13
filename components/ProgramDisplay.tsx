
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
  const [viewMode, setViewMode] = useState<'detailed' | 'matrix'>('detailed');
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

  const calculateRest = (staffId: string, currentProgram: DailyProgram, currentShift: ShiftConfig) => {
    const programIndex = filteredPrograms.findIndex(p => p.dateString === currentProgram.dateString);
    if (programIndex < 0) return null;
    
    let previousShiftEnd: Date | null = null;
    
    // 1. Check current program's previous days for duty
    for (let i = programIndex - 1; i >= 0; i--) {
      const prevProg = filteredPrograms[i];
      const prevAss = prevProg.assignments.find(a => a.staffId === staffId);
      if (prevAss) {
        const prevShift = getShiftById(prevAss.shiftId);
        if (prevShift && prevProg.dateString) {
          const endDateStr = prevShift.endDate || prevProg.dateString;
          const endTimeStr = prevShift.endTime || '00:00';
          previousShiftEnd = new Date(`${endDateStr}T${endTimeStr}:00`);
          break;
        }
      }
    }
    
    // 2. Fallback: check incomingDuties (historical log from dashboard) for pre-program duties
    if (!previousShiftEnd && currentProgram.dateString) {
      const historicalDuty = incomingDuties
        .filter(d => d.staffId === staffId && d.date < currentProgram.dateString!)
        .sort((a, b) => b.date.localeCompare(a.date) || b.shiftEndTime.localeCompare(a.shiftEndTime))[0];
        
      if (historicalDuty) {
        previousShiftEnd = new Date(`${historicalDuty.date}T${historicalDuty.shiftEndTime}:00`);
      }
    }

    if (previousShiftEnd && currentProgram.dateString) {
      const currentStart = new Date(`${currentProgram.dateString}T${currentShift.pickupTime}:00`);
      const diffMs = currentStart.getTime() - previousShiftEnd.getTime();
      return diffMs / (1000 * 60 * 60);
    }
    return null;
  };

  const runAudit = () => {
    const errors: string[] = [];
    const staffWorkCounts: Record<string, number> = {};
    staff.forEach(s => staffWorkCounts[s.id] = 0);

    // 1. Scan Shifts for Requirements
    filteredPrograms.forEach(p => {
        // Group assignments by shift
        const shiftsMap: Record<string, Assignment[]> = {};
        p.assignments.forEach(a => {
            if (!shiftsMap[a.shiftId]) shiftsMap[a.shiftId] = [];
            shiftsMap[a.shiftId].push(a);
        });

        shifts.forEach(s => {
             const assigned = shiftsMap[s.id] || [];
             
             // Check Min Staff
             if (assigned.length < s.minStaff) {
                 errors.push(`SHIFT ERROR: ${p.dateString} @ ${s.pickupTime} - Missing ${s.minStaff - assigned.length} staff (Has ${assigned.length}, Need ${s.minStaff})`);
             }

             // Check Roles
             if (s.roleCounts) {
                 Object.entries(s.roleCounts).forEach(([role, requiredCount]) => {
                     const count = assigned.filter(a => {
                         const staffMember = getStaffById(a.staffId);
                         if (role === 'Shift Leader' && staffMember?.isShiftLeader) return true;
                         if (role === 'Load Control' && staffMember?.isLoadControl) return true;
                         if (role === 'Ramp' && staffMember?.isRamp) return true;
                         if (role === 'Operations' && staffMember?.isOps) return true;
                         if (role === 'Lost and Found' && staffMember?.isLostFound) return true;
                         return false;
                     }).length;
                     
                     if (count < (requiredCount as number)) {
                         errors.push(`ROLE ERROR: ${p.dateString} @ ${s.pickupTime} - Missing ${(requiredCount as number) - count} ${role} (Has ${count}, Need ${requiredCount})`);
                     }
                 });
             }
        });

        // 2. Track Work Counts & Rest per Assignment
        p.assignments.forEach(a => {
            if (staffWorkCounts[a.staffId] !== undefined) staffWorkCounts[a.staffId]++;
            
            // Check Rest
            const s = getStaffById(a.staffId);
            const sh = getShiftById(a.shiftId);
            if (s && sh) {
                const rest = calculateRest(a.staffId, p, sh);
                if (rest !== null && rest < (minRestHours || 12)) {
                    errors.push(`REST VIOLATION: ${s.initials} on ${p.dateString} has only ${rest.toFixed(1)}h rest.`);
                }
            }

            // Check Contract Dates for Roster
            if (s?.type === 'Roster' && s.workFromDate && s.workToDate) {
                 if (p.dateString! < s.workFromDate || p.dateString! > s.workToDate) {
                     errors.push(`CONTRACT VIOLATION: ${s.initials} assigned on ${p.dateString} outside contract.`);
                 }
            }
        });
    });

    // 3. Check Staff Utilization Caps
    staff.forEach(s => {
        if (s.type === 'Local') {
            // Strict 5 days for Local
            if (staffWorkCounts[s.id] !== 5) {
                errors.push(`UTILIZATION ERROR: Local staff ${s.initials} has ${staffWorkCounts[s.id]} shifts (Required: 5).`);
            }
        } else if (s.type === 'Roster') {
             // Check if they are available in this period and under-utilized
             if (s.workFromDate && s.workToDate && startDate && endDate) {
                 const availableDays = filteredPrograms.filter(p => p.dateString! >= s.workFromDate! && p.dateString! <= s.workToDate!).length;
                 // Strict utilization check for Roster staff "no more no less"
                 if (availableDays > 0 && staffWorkCounts[s.id] !== availableDays) {
                    errors.push(`UTILIZATION ERROR: Roster staff ${s.initials} has ${staffWorkCounts[s.id]} shifts (Required: ${availableDays} per contract window).`);
                 }
             }
        }
    });

    return errors;
  };

  const handleAutoRepair = async () => {
    setIsRepairing(true);
    try {
      const report = runAudit();
      if (report.length === 0) {
        alert("System Audit Passed: No critical violations found.");
        setIsRepairing(false);
        return;
      }
      
      const confirmMsg = `Found ${report.length} violations:\n\n${report.slice(0, 5).join('\n')}${report.length > 5 ? '\n...' : ''}\n\nProceed with AI Surgical Repair?`;
      if (!window.confirm(confirmMsg)) {
        setIsRepairing(false);
        return;
      }

      const result = await repairProgramWithAI(
          filteredPrograms, 
          report.join('\n'), 
          { flights, staff, shifts, programs: filteredPrograms }, 
          { minRestHours: minRestHours || 12 }
      );
      
      if (result.programs && onUpdatePrograms) {
        onUpdatePrograms(result.programs);
      }
    } catch (e: any) {
      console.error(e);
      alert("Repair failed: " + e.message);
    } finally {
      setIsRepairing(false);
    }
  };

  const utilizationData = useMemo(() => {
    const stats: Record<string, { work: number, off: number, rosterPotential: number, rosterLeave: number, annualLeave: number, standby: number, resting: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0, rosterPotential: 0, rosterLeave: 0, annualLeave: 0, standby: 0, resting: 0 });
    
    if (startDate && endDate) {
      staff.forEach(s => {
        if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          const sFrom = new Date(s.workFromDate);
          const sTo = new Date(s.workToDate);
          let potential = 0;
          filteredPrograms.forEach(p => {
            if (!p.dateString) return;
            const pDate = new Date(p.dateString);
            if (pDate >= sFrom && pDate <= sTo) potential++;
          });
          stats[s.id].rosterPotential = potential;
        } else {
          stats[s.id].rosterPotential = filteredPrograms.length;
        }
      });
    }

    filteredPrograms.forEach(program => {
      const dateStr = program.dateString || '';
      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      staff.forEach(s => {
        if (assignedIds.has(s.id)) {
          stats[s.id].work++;
        } else {
          const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
          if (restLock) {
            stats[s.id].resting++;
            return;
          }
          const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
          if (leave) {
            stats[s.id].annualLeave++;
            return;
          }
          if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
            if (dateStr < s.workFromDate || dateStr > s.workToDate) {
              stats[s.id].rosterLeave++;
              return;
            }
          }
          if (s.type === 'Local') stats[s.id].off++;
          else stats[s.id].standby++;
        }
      });
    });
    return stats;
  }, [filteredPrograms, staff, startDate, endDate, leaveRequests, incomingDuties]);

  const formatRoleLabel = (role: string | undefined) => {
    const r = String(role || '').trim().toUpperCase();
    if (!r || r === 'NIL' || r === 'GENERAL') return '';
    return `(${r})`;
  };

  const getFullRegistryForDay = (program: DailyProgram) => {
    const dateStr = program.dateString || '';
    const assignedStaffIds = new Set((program.assignments || []).map(a => a.staffId));
    const registry: Record<string, string[]> = {
      'RESTING (POST-DUTY)': [], 'DAYS OFF': [], 'ROSTER LEAVE': [], 'ANNUAL LEAVE': [], 'STANDBY (RESERVE)': []
    };
    staff.forEach(s => {
      if (assignedStaffIds.has(s.id)) return;
      const stats = utilizationData[s.id];
      const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
      if (restLock) {
        registry['RESTING (POST-DUTY)'].push(`${s.initials} (${stats.resting})`);
        return;
      }
      const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
      if (leave) {
        registry['ANNUAL LEAVE'].push(`${s.initials} (${stats.annualLeave})`);
        return;
      }
      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
        if (dateStr < s.workFromDate || dateStr > s.workToDate) {
          registry['ROSTER LEAVE'].push(`${s.initials} (${stats.rosterLeave})`);
          return;
        }
      }
      if (s.type === 'Local') registry['DAYS OFF'].push(`${s.initials} (${stats.off})`);
      else registry['STANDBY (RESERVE)'].push(`${s.initials} (${stats.standby})`);
    });
    return registry;
  };

  const getDayLabel = (program: DailyProgram) => {
    if (program.dateString) {
      const d = new Date(program.dateString);
      return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' - ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return `DAY ${program.day + 1}`;
  };

  const exportPDF = () => {
    if (filteredPrograms.length === 0) return;
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const darkHeader = [2, 6, 23];
    const greyHeader = [71, 85, 105];
    const orangeHeader = [217, 119, 6];
    
    // 1. Daily Program Pages
    filteredPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFont('helvetica', 'bold').setFontSize(22).text(`SkyOPS Station Handling Program`, 14, 20);
      doc.setFontSize(10).setTextColor(120, 120, 120).text(`Target Period: ${startDate} to ${endDate}`, 14, 27);
      doc.setFontSize(16).setTextColor(0, 0, 0).text(getDayLabel(program), 14, 40);
      
      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });

      const tableData = Object.entries(shiftsMap).map(([shiftId, group], i) => {
        const sh = getShiftById(shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join('/') || 'NIL';
        const personnelStr = group.map(a => {
          const st = getStaffById(a.staffId);
          const roleLabel = formatRoleLabel(a.role);
          return `${st?.initials || '??'}${roleLabel ? ` ${roleLabel}` : ''}`;
        }).join(' | ');
        return [(i+1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, `${group.length} / ${sh?.maxStaff || sh?.minStaff || '0'}`, personnelStr];
      });

      autoTable(doc, {
        startY: 48, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']], body: tableData,
        theme: 'grid', headStyles: { fillColor: darkHeader, textColor: 255, fontSize: 10, cellPadding: 3 }, bodyStyles: { fontSize: 7, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }
      });

      const registry = getFullRegistryForDay(program);
      const registryData = Object.entries(registry).map(([cat, agents]) => [cat, agents.length > 0 ? agents.join(', ') : 'NONE']);
      doc.setFontSize(14).setFont('helvetica', 'bold').text("ABSENCE AND REST REGISTRY", 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20, head: [['CATEGORY', 'PERSONNEL LIST']], body: registryData,
        theme: 'grid', headStyles: { fillColor: greyHeader, textColor: 255, fontSize: 10 }, bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } }
      });
    });

    // 2. Staff Utilization Matrix
    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(22).text(`Staff Utilization Matrix`, 14, 20);
    const utilizationRows = staff.map(s => {
      const u = utilizationData[s.id];
      return [s.initials, s.name, s.type, u.work.toString(), u.off.toString(), u.annualLeave.toString(), u.rosterLeave.toString(), `${Math.round((u.work / (u.rosterPotential || 1)) * 100)}%`];
    });
    autoTable(doc, {
      startY: 30, head: [['INITIALS', 'NAME', 'TYPE', 'WORK DAYS', 'OFF DAYS', 'ANNUAL LEAVE', 'ROSTER LEAVE', 'UTILIZATION %']], body: utilizationRows,
      theme: 'striped', headStyles: { fillColor: orangeHeader, textColor: 255, fontSize: 9 }, bodyStyles: { fontSize: 8 }
    });

    doc.save(`SkyOPS_Program_${startDate}_${endDate}.pdf`);
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
             <span className="text-[10px] font-black uppercase tracking-widest italic">Print PDF</span>
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
