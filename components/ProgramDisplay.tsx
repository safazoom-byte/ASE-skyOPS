import React, { useMemo, useState } from 'react';
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
  ShieldAlert as AlertIcon
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
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, leaveRequests = [], incomingDuties = [], startDate, endDate, stationHealth = 100, alerts = [] }) => {
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
          stats[s.id].rosterPotential = 7;
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
    
    // Only display roles that were explicitly requested for this shift
    const filtered = parts.map(r => {
      const isSL = (r === 'SHIFT LEADER' || r === 'SL');
      const isLC = (r === 'LOAD CONTROL' || r === 'LC');
      const isOPS = (r === 'OPERATIONS' || r === 'OPS');
      const isLF = (r === 'LOST AND FOUND' || r === 'LF');
      const isRMP = (r === 'RAMP' || r === 'RMP');

      if (isSL && (shiftRoleCounts?.['Shift Leader'] || 0) > 0) return 'SL';
      if (isLC && (shiftRoleCounts?.['Load Control'] || 0) > 0) return 'LC';
      if (isOPS && (shiftRoleCounts?.['Operations'] || 0) > 0) return 'OPS';
      if (isLF && (shiftRoleCounts?.['Lost and Found'] || 0) > 0) return 'LF';
      if (isRMP && (shiftRoleCounts?.['Ramp'] || 0) > 0) return 'RMP';
      
      return null;
    }).filter(Boolean);

    return filtered.length > 0 ? filtered.join('+') : '';
  };

  const getDayLabel = (program: DailyProgram) => {
    if (program.dateString) {
      const d = new Date(program.dateString);
      return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' - ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return `DAY ${program.day + 1}`;
  };

  const getFullRegistryForDay = (program: DailyProgram) => {
    const dateStr = program.dateString || '';
    const assignedStaffIds = new Set((program.assignments || []).map(a => a.staffId));
    const registry: Record<string, string[]> = {
      'RESTING (POST-DUTY)': [], 'DAYS OFF': [], 'ROSTER LEAVE': [], 'ANNUAL LEAVE': [], 'STANDBY (RESERVE)': []
    };
    
    staff.forEach(s => {
      if (assignedStaffIds.has(s.id)) return;
      
      const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
      if (restLock) {
        registry['RESTING (POST-DUTY)'].push(`${s.initials}`);
        return;
      }
      
      const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
      if (leave) {
        const cat = leave.type.toUpperCase();
        if (registry[cat]) registry[cat].push(s.initials);
        else registry['ANNUAL LEAVE'].push(s.initials);
        return;
      }

      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
        if (dateStr < s.workFromDate || dateStr > s.workToDate) {
          registry['ROSTER LEAVE'].push(s.initials);
          return;
        }
      }

      if (s.type === 'Local') {
        registry['DAYS OFF'].push(s.initials);
      } else {
        registry['STANDBY (RESERVE)'].push(s.initials);
      }
    });
    return registry;
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
          const totalShifts = utilizationData[st?.id || '']?.work || 0;
          return `[${totalShifts}] ${st?.initials || '??'}${roleLabel ? ` (${roleLabel})` : ''}`;
        }).join(' | ');

        const uniqueHeadcount = group.length;
        const hcLabel = `${uniqueHeadcount} / ${sh?.maxStaff || sh?.minStaff || '0'}`;
        return [(i+1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, hcLabel, personnelStr];
      });

      autoTable(doc, {
        startY: 38, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']], body: tableData,
        theme: 'grid', headStyles: { fillColor: headerColor, textColor: 255, fontSize: 9 }, bodyStyles: { fontSize: 6.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 35 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }, margin: { bottom: 10 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11).setFont('helvetica', 'bold').text('ABSENCE AND REST REGISTRY', 14, currentY);
      const registry = getFullRegistryForDay(program);
      const absenceData = Object.entries(registry).map(([cat, list]) => [cat, list.join(', ') || 'NONE']);
      autoTable(doc, {
        startY: currentY + 3, head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']], body: absenceData,
        theme: 'grid', headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 }, bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } }, margin: { bottom: 10 }
      });
    });

    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(18).text(`Weekly Personnel Utilization Audit (Local Staff Only)`, 14, 20);
    doc.setFontSize(9).setTextColor(100).text(`Validation of EXACTLY 5 Shifts / 2 Days Off Policy`, 14, 26);
    const localAuditBody = staff.filter(s => s.type === 'Local').map(s => {
      const stats = utilizationData[s.id];
      const isCompliant = stats.work === 5;
      const statusLabel = isCompliant ? 'MATCH' : (stats.work < 5 ? `FAULT (UNDER: ${stats.work}/5)` : `FAULT (OVER: ${stats.work}/5)`);
      return [s.name, s.initials, stats.work.toString(), stats.off.toString(), statusLabel ];
    });
    autoTable(doc, {
      startY: 35, head: [['PERSONNEL NAME', 'INITIALS', 'TOTAL SHIFTS', 'TOTAL DAYS OFF', 'STATUS']], body: localAuditBody, theme: 'grid',
      headStyles: { fillColor: headerColor, textColor: 255 }, didParseCell: (d) => { if (d.column.index === 4 && String(d.cell.raw).startsWith('FAULT')) d.cell.styles.textColor = [190, 18, 60]; }
    });
    doc.save(`SkyOPS_Station_Report_${startDate}.pdf`);
  };

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="bg-white p-6 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-slate-950 rounded-[1.8rem] flex items-center justify-center text-white"><CalendarDays size={24} /></div>
           <div><h2 className="text-2xl font-black text-slate-900 uppercase italic leading-none">Handling Registry</h2><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{startDate} - {endDate}</p></div>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
             <button onClick={() => setViewMode('detailed')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase italic ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Program</button>
             <button onClick={() => setViewMode('matrix')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase italic ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Matrix</button>
          </div>
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl flex items-center gap-2 shadow-lg hover:bg-blue-600 transition-all"><Printer size={18} /><span className="text-[10px] font-black uppercase">Print Full Report</span></button>
        </div>
      </div>
      {viewMode === 'detailed' && (
        <div className="space-y-16">
          {filteredPrograms.map(program => {
            const registry = getFullRegistryForDay(program);
            const shiftsMap: Record<string, Assignment[]> = {};
            program.assignments.forEach(a => { if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = []; shiftsMap[a.shiftId || ''].push(a); });
            return (
              <div key={program.dateString || program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 md:p-14">
                  <div className="flex justify-between items-end mb-10"><h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">{getDayLabel(program)}</h2><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Station Handling Active</span></div>
                  <div className="overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-950 text-white"><tr className="text-[10px] font-black uppercase"><th className="p-5">PICKUP</th><th className="p-5">RELEASE</th><th className="p-5">FLIGHTS</th><th className="p-5 text-center">HC / MAX</th><th className="p-5">PERSONNEL & WEEKLY SHIFTS</th></tr></thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
                          return (
                            <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50 ${group.length < (sh?.minStaff || 0) ? 'bg-rose-50/30' : ''}`}>
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime}</td><td className="p-6 text-sm font-black italic">{sh?.endTime}</td><td className="p-6 text-xs font-bold uppercase text-blue-600">{fls}</td>
                              <td className={`p-6 text-xs font-black text-center ${group.length < (sh?.minStaff || 0) ? 'text-rose-600 animate-pulse' : ''}`}>{group.length} / {sh?.maxStaff || sh?.minStaff || '0'}</td>
                              <td className="p-6 flex flex-wrap gap-2">
                                {group.map((a, ai) => {
                                  const st = getStaffById(a.staffId);
                                  const count = utilizationData[a.staffId]?.work || 0;
                                  const isFault = st?.type === 'Local' && count !== 5;
                                  const roleLabel = formatRoleLabel(a.role, sh?.roleCounts);
                                  return (
                                    <span key={ai} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isFault ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm' : 'bg-slate-100 text-slate-700'}`}>
                                      <span className="font-black">[{count}]</span> {st?.initials} {roleLabel && <span className="text-slate-950 font-black ml-1">({roleLabel})</span>}
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

          <div className="bg-white rounded-[3rem] p-10 border-4 border-slate-950 shadow-2xl flex flex-col md:flex-row gap-10">
             <div className="flex-1">
                <h4 className="text-xl font-black italic uppercase mb-4 flex items-center gap-3"><ShieldAlert className="text-rose-600" /> Local Audit (Goal: EXACTLY 5)</h4>
                <div className="space-y-2">
                   {staff.filter(s => s.type === 'Local').map(s => {
                     const count = utilizationData[s.id].work;
                     const isCompliant = count === 5;
                     return (
                       <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-black uppercase">{s.initials}</span>
                          <div className="flex items-center gap-4">
                             <span className={`text-[9px] font-bold uppercase ${!isCompliant ? 'text-rose-600' : 'text-slate-400'}`}>Shifts: {count}/5</span>
                             {isCompliant ? <CheckCircle2 size={14} className="text-emerald-500" /> : <TriangleAlert size={14} className="text-rose-600" />}
                          </div>
                       </div>
                     );
                   })}
                </div>
             </div>
             <div className="flex-1">
                <h4 className="text-xl font-black italic uppercase mb-4 flex items-center gap-3"><TrendingUp className="text-blue-600" /> Station Health</h4>
                <div className="h-40 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                   <div className="text-center">
                      <p className="text-5xl font-black italic text-slate-900 leading-none">{stationHealth}%</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Operational Score</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {viewMode === 'matrix' && (
        <div className="bg-white rounded-[4rem] border border-slate-200 shadow-2xl p-10 md:p-14 animate-in zoom-in-95 overflow-x-auto">
          <div className="flex justify-between items-end mb-10"><h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">Personnel Matrix</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Roster Timeline</p></div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                <th className="p-4 text-left sticky left-0 bg-white z-10">Agent</th>
                {filteredPrograms.map(p => (
                  <th key={p.dateString} className="p-4 text-center min-w-[80px]">{p.dateString?.split('-')[2]}/{p.dateString?.split('-')[1]}</th>
                ))}
                <th className="p-4 text-center">Audit</th>
              </tr>
            </thead>
            <tbody>
              {staff.sort((a,b) => a.type.localeCompare(b.type)).map(s => {
                const count = utilizationData[s.id].work;
                return (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 group">
                    <td className="p-4 sticky left-0 bg-white z-10 group-hover:bg-slate-50">
                      <p className="text-xs font-black italic text-slate-900">{s.initials}</p>
                      <p className="text-[7px] font-black text-slate-400 uppercase">{s.type}</p>
                    </td>
                    {filteredPrograms.map(p => {
                      const ass = p.assignments.find(a => a.staffId === s.id);
                      const sh = ass ? getShiftById(ass.shiftId) : null;
                      const registry = getFullRegistryForDay(p);
                      const isOff = registry['DAYS OFF'].includes(s.initials) || 
                                    registry['ANNUAL LEAVE'].includes(s.initials) ||
                                    registry['ROSTER LEAVE'].includes(s.initials);
                      const isRosterLeave = registry['ROSTER LEAVE'].includes(s.initials);
                      return (
                        <td key={p.dateString} className="p-2 text-center">
                          {sh ? (
                            <div className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[9px] font-black italic">
                              {sh.pickupTime}
                            </div>
                          ) : isRosterLeave ? (
                            <div className="text-[8px] font-black text-rose-300 uppercase italic">RL</div>
                          ) : isOff ? (
                            <div className="text-[8px] font-black text-slate-200 uppercase">OFF</div>
                          ) : (
                            <div className="text-[8px] font-black text-slate-100">---</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 text-center">
                       <span className={`text-[10px] font-black ${s.type === 'Local' && count !== 5 ? 'text-rose-600' : 'text-slate-400'}`}>
                         {count}/{s.type === 'Local' ? '5' : '7'}
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