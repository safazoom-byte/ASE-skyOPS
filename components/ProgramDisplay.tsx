
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest, IncomingDuty, Skill } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  Timer
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

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, leaveRequests = [], incomingDuties = [], startDate, endDate, stationHealth = 100, alerts = [], minRestHours = 12 }) => {
  const [viewMode, setViewMode] = useState<'detailed' | 'matrix'>('detailed');
  
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

  const utilizationData = useMemo(() => {
    const stats: Record<string, { work: number, off: number, rosterPotential: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0, rosterPotential: 0 });
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      staff.forEach(s => {
        if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          const sFrom = new Date(s.workFromDate);
          const sTo = new Date(s.workToDate);
          let potential = 0;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const current = new Date(d);
            if (current >= sFrom && current <= sTo) potential++;
          }
          stats[s.id].rosterPotential = potential;
        } else {
          stats[s.id].rosterPotential = filteredPrograms.length;
        }
      });
    }

    filteredPrograms.forEach(program => {
      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      staff.forEach(s => {
        if (assignedIds.has(s.id)) stats[s.id].work++;
        else stats[s.id].off++;
      });
    });
    return stats;
  }, [filteredPrograms, staff, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const formatRoleLabel = (role: any, shiftRoleCounts?: Partial<Record<Skill, number>>) => {
    const rStr = String(role || '').trim().toUpperCase();
    if (!rStr || rStr === 'GENERAL' || rStr === 'ROSTER' || rStr === 'NIL') return '';
    const parts = rStr.split('+').map(p => p.trim());
    const validParts = parts.filter(p => {
      const isSL = p === 'SL' || p === 'SHIFT LEADER';
      const isLC = p === 'LC' || p === 'LOAD CONTROL';
      const isOPS = p === 'OPS' || p === 'OPERATIONS';
      const isLF = p === 'LF' || p === 'LOST AND FOUND';
      const isRMP = p === 'RMP' || p === 'RAMP';
      if (isSL && (shiftRoleCounts?.['Shift Leader'] || 0) > 0) return true;
      if (isLC && (shiftRoleCounts?.['Load Control'] || 0) > 0) return true;
      if (isOPS && (shiftRoleCounts?.['Operations'] || 0) > 0) return true;
      if (isLF && (shiftRoleCounts?.['Lost and Found'] || 0) > 0) return true;
      if (isRMP && (shiftRoleCounts?.['Ramp'] || 0) > 0) return true;
      return false;
    });
    return validParts.join('+');
  };

  const calculateRest = (staffId: string, currentProgram: DailyProgram, currentShift: ShiftConfig) => {
    const programIndex = filteredPrograms.findIndex(p => p.dateString === currentProgram.dateString);
    if (programIndex < 0) return null;

    let previousShiftEnd: Date | null = null;

    // 1. Search backwards in the current 7-day program
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

    // 2. If not found, check "Staff Rest Log" (Incoming Duties) for prior context
    if (!previousShiftEnd && currentProgram.dateString) {
      const locks = incomingDuties
        .filter(d => d.staffId === staffId && d.date <= currentProgram.dateString!)
        .sort((a, b) => b.date.localeCompare(a.date) || b.shiftEndTime.localeCompare(a.shiftEndTime));
      
      if (locks.length > 0) {
        previousShiftEnd = new Date(`${locks[0].date}T${locks[0].shiftEndTime}:00`);
      }
    }

    if (previousShiftEnd && currentProgram.dateString) {
      const currentStart = new Date(`${currentProgram.dateString}T${currentShift.pickupTime}:00`);
      const diffMs = currentStart.getTime() - previousShiftEnd.getTime();
      return diffMs / (1000 * 60 * 60); // convert to hours
    }

    return null;
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
    const headerColor = [2, 6, 23];
    filteredPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFont('helvetica', 'bold').setFontSize(18).text(`SkyOPS Station Handling Program`, 14, 15);
      doc.setFontSize(9).setTextColor(120, 120, 120).text(`Target Period: ${startDate} to ${endDate}`, 14, 21);
      doc.setFontSize(14).setTextColor(0, 0, 0).text(getDayLabel(program), 14, 32);
      
      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });

      const tableData = Object.entries(shiftsMap).map(([shiftId, group], i) => {
        const sh = getShiftById(shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
        const personnelStr = group.map(a => {
          const st = getStaffById(a.staffId);
          const roleLabel = formatRoleLabel(a.role, sh?.roleCounts);
          return `${st?.initials || '??'}${roleLabel ? ` (${roleLabel})` : ''}`;
        }).join(' | ');
        return [(i+1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, `${group.length} / ${sh?.maxStaff || sh?.minStaff || '0'}`, personnelStr];
      });

      autoTable(doc, {
        startY: 38, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']], body: tableData,
        theme: 'grid', headStyles: { fillColor: headerColor, textColor: 255, fontSize: 9 }, bodyStyles: { fontSize: 6.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 35 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }
      });
    });
    doc.save(`SkyOPS_Program_${startDate}.pdf`);
  };

  const exportMatrixPDF = () => {
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold').setFontSize(18).text(`Station Personnel Matrix Report`, 14, 15);
    doc.setFontSize(9).setTextColor(120).text(`Operational Rest & Distribution Audit (${startDate} - ${endDate})`, 14, 21);
    
    const dates = filteredPrograms.map(p => p.dateString?.split('-')[2] + '/' + p.dateString?.split('-')[1]);
    const head = [['AGENT', ...dates, 'TOTAL']];
    const body = staff.sort((a,b) => a.type.localeCompare(b.type)).map(s => {
      const row = [s.initials];
      filteredPrograms.forEach(p => {
        const ass = p.assignments.find(a => a.staffId === s.id);
        const sh = ass ? getShiftById(ass.shiftId) : null;
        if (sh) {
          const rest = calculateRest(s.id, p, sh);
          row.push(`${sh.pickupTime}${rest !== null ? `\n(R: ${rest.toFixed(1)}h)` : ''}`);
        } else {
          row.push('---');
        }
      });
      row.push(utilizationData[s.id].work.toString());
      return row;
    });

    autoTable(doc, {
      startY: 30, head: head, body: body, theme: 'grid',
      headStyles: { fillColor: [2, 6, 23], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 6, cellPadding: 1 },
      styles: { halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });
    doc.save(`SkyOPS_Matrix_${startDate}.pdf`);
  };

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="bg-white p-6 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-slate-950 rounded-[1.8rem] flex items-center justify-center text-white shadow-lg"><CalendarDays size={24} /></div>
           <div><h2 className="text-2xl font-black text-slate-900 uppercase italic leading-none">Handling Registry</h2><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{startDate} - {endDate}</p></div>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
             <button onClick={() => setViewMode('detailed')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase italic ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Program</button>
             <button onClick={() => setViewMode('matrix')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase italic ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Matrix</button>
          </div>
          <button onClick={viewMode === 'detailed' ? exportPDF : exportMatrixPDF} className="p-4 bg-slate-950 text-white rounded-2xl flex items-center gap-2 shadow-lg hover:bg-blue-600 transition-all"><Printer size={18} /><span className="text-[10px] font-black uppercase">Print {viewMode === 'detailed' ? 'Program' : 'Matrix'}</span></button>
        </div>
      </div>

      {viewMode === 'detailed' && (
        <div className="space-y-16">
          {filteredPrograms.map(program => {
            const shiftsMap: Record<string, Assignment[]> = {};
            program.assignments.forEach(a => { if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = []; shiftsMap[a.shiftId || ''].push(a); });
            return (
              <div key={program.dateString || program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-bottom">
                <div className="p-10 md:p-14">
                  <div className="flex justify-between items-end mb-10">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">{getDayLabel(program)}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Station Handling Active</span>
                  </div>
                  <div className="overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-950 text-white"><tr className="text-[10px] font-black uppercase"><th className="p-5">PICKUP</th><th className="p-5">RELEASE</th><th className="p-5">FLIGHTS</th><th className="p-5 text-center">HC / MAX</th><th className="p-5">PERSONNEL</th></tr></thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
                          return (
                            <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50`}>
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime}</td><td className="p-6 text-sm font-black italic">{sh?.endTime}</td><td className="p-6 text-xs font-bold uppercase text-blue-600">{fls}</td>
                              <td className="p-6 text-xs font-black text-center">{group.length} / {sh?.maxStaff || sh?.minStaff || '0'}</td>
                              <td className="p-6 flex flex-wrap gap-2">
                                {group.map((a, ai) => {
                                  const st = getStaffById(a.staffId);
                                  const roleLabel = formatRoleLabel(a.role, sh?.roleCounts);
                                  return (
                                    <span key={ai} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black border border-slate-200">
                                      {st?.initials} {roleLabel && <span className="text-blue-600 ml-1">({roleLabel})</span>}
                                    </span>
                                  );
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
             <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-xl">
                <h4 className="text-xl font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900 border-b pb-4">
                  <ShieldAlert className="text-rose-600" /> Local Audit (Goal: 5 Shifts)
                </h4>
                <div className="space-y-3">
                   {staff.filter(s => s.type === 'Local').map(s => {
                     const count = utilizationData[s.id].work;
                     const isCompliant = count === 5;
                     return (
                       <div key={s.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black italic text-slate-900 shadow-sm border">{s.initials}</div><div><span className="text-xs font-black uppercase text-slate-900 block leading-none">{s.name}</span><span className="text-[8px] font-black text-slate-400 uppercase mt-1">Local Handle</span></div></div>
                          <div className="flex items-center gap-6">
                             <div className="text-right"><span className={`text-[12px] font-black italic ${!isCompliant ? 'text-rose-600' : 'text-slate-900'}`}>{count} / 5</span></div>
                             {isCompliant ? <CheckCircle2 size={20} className="text-emerald-500" /> : <TriangleAlert size={20} className="text-rose-600" />}
                          </div>
                       </div>
                     );
                   })}
                </div>
             </div>
             <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-xl">
                <h4 className="text-xl font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900 border-b pb-4">
                  <Briefcase className="text-indigo-600" /> Roster Contract Audit
                </h4>
                <div className="space-y-3">
                   {staff.filter(s => s.type === 'Roster').map(s => {
                     const count = utilizationData[s.id].work;
                     const pot = utilizationData[s.id].rosterPotential;
                     const isOver = count > pot;
                     return (
                       <div key={s.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div><span className="text-xs font-black uppercase text-slate-900">{s.name}</span><div className="text-[8px] font-black text-slate-400 mt-1 uppercase italic tracking-widest">{s.workFromDate} to {s.workToDate}</div></div>
                          <div className="text-right"><span className={`text-[12px] font-black italic ${isOver ? 'text-rose-600' : 'text-slate-900'}`}>{count} / {pot}</span><div className="text-[8px] font-black text-slate-400 uppercase">Utilized</div></div>
                       </div>
                     );
                   })}
                </div>
             </div>
          </div>
        </div>
      )}

      {viewMode === 'matrix' && (
        <div className="bg-white rounded-[4rem] border border-slate-200 shadow-2xl p-10 md:p-14 animate-in zoom-in-95 overflow-x-auto no-scrollbar">
          <div className="flex justify-between items-end mb-10"><h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">Personnel Matrix</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Roster Timeline</p></div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                <th className="p-4 text-left sticky left-0 bg-white z-10 border-r">Agent</th>
                {filteredPrograms.map(p => (
                  <th key={p.dateString} className="p-4 text-center min-w-[130px]">{p.dateString?.split('-')[2]}/{p.dateString?.split('-')[1]}</th>
                ))}
                <th className="p-4 text-center border-l">Audit</th>
              </tr>
            </thead>
            <tbody>
              {staff.sort((a,b) => a.type.localeCompare(b.type)).map(s => {
                const count = utilizationData[s.id].work;
                return (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 group">
                    <td className="p-4 sticky left-0 bg-white z-10 group-hover:bg-slate-50 border-r">
                      <p className="text-xs font-black italic text-slate-900">{s.initials}</p>
                      <p className="text-[7px] font-black text-slate-400 uppercase">{s.type}</p>
                    </td>
                    {filteredPrograms.map(p => {
                      const ass = p.assignments.find(a => a.staffId === s.id);
                      const sh = ass ? getShiftById(ass.shiftId) : null;
                      const rest = (ass && sh) ? calculateRest(s.id, p, sh) : null;
                      const isRestFault = rest !== null && rest < (minRestHours || 12);

                      return (
                        <td key={p.dateString} className="p-4 text-center">
                          {sh ? (
                            <div className="space-y-1.5 animate-in fade-in">
                              <div className="px-3 py-1 bg-slate-950 text-white rounded-lg text-[9px] font-black italic shadow-sm">{sh.pickupTime}</div>
                              {rest !== null && (
                                <div className={`flex items-center justify-center gap-1 text-[8px] font-black uppercase italic ${isRestFault ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>
                                  <Timer size={10} /> {rest.toFixed(1)}H REST
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[8px] font-black text-slate-100">---</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 text-center border-l">
                       <span className={`text-[10px] font-black ${s.type === 'Local' && count !== 5 ? 'text-rose-600' : 'text-slate-900'}`}>
                         {count}/{utilizationData[s.id].rosterPotential}
                       </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
