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
    
    const filtered = parts.map(r => {
      if ((r === 'SHIFT LEADER' || r === 'SL') && (shiftRoleCounts && (shiftRoleCounts['Shift Leader'] || 0) > 0)) return 'SL';
      if ((r === 'LOAD CONTROL' || r === 'LC') && (shiftRoleCounts && (shiftRoleCounts['Load Control'] || 0) > 0)) return 'LC';
      if ((r === 'OPERATIONS' || r === 'OPS') && (shiftRoleCounts && (shiftRoleCounts['Operations'] || 0) > 0)) return 'OPS';
      if ((r === 'LOST AND FOUND' || r === 'LF') && (shiftRoleCounts && (shiftRoleCounts['Lost and Found'] || 0) > 0)) return 'LF';
      if ((r === 'RAMP' || r === 'RMP') && (shiftRoleCounts && (shiftRoleCounts['Ramp'] || 0) > 0)) return 'RMP';
      return null;
    }).filter(Boolean);

    return filtered.join('+');
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
        registry[leave.type.toUpperCase()] ? registry[leave.type.toUpperCase()].push(s.initials) : registry['ANNUAL LEAVE'].push(s.initials);
        return;
      }
      if (s.type === 'Roster' && s.workFromDate && (dateStr < s.workFromDate || dateStr > (s.workToDate || ''))) {
        registry['ROSTER LEAVE'].push(s.initials);
        return;
      }
      if (s.type === 'Local') registry['DAYS OFF'].push(s.initials);
      else registry['STANDBY (RESERVE)'].push(s.initials);
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
        const staffAssignments: Record<string, string[]> = {};
        group.forEach(a => {
          if (!staffAssignments[a.staffId]) staffAssignments[a.staffId] = [];
          const label = formatRoleLabel(a.role, sh?.roleCounts);
          if (label) staffAssignments[a.staffId].push(label);
        });
        const personnelStr = Object.entries(staffAssignments).map(([sid, roles]) => {
          const st = getStaffById(sid);
          const rolesStr = roles.length > 0 ? ` (${roles.join('+')})` : '';
          const totalShifts = utilizationData[st?.id || '']?.work || 0;
          return `[${totalShifts}] ${st?.initials || '??'}${rolesStr}`;
        }).join(' | ');
        const uniqueHeadcount = Object.keys(staffAssignments).length;
        const minHc = sh?.minStaff || 0;
        const hcLabel = `${uniqueHeadcount} / ${sh?.maxStaff || minHc || '0'}`;
        return [(i+1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, hcLabel, personnelStr];
      });

      autoTable(doc, {
        startY: 38, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']], body: tableData,
        theme: 'grid', headStyles: { fillColor: headerColor, textColor: 255, fontSize: 9 }, bodyStyles: { fontSize: 6.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 35 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }, margin: { bottom: 10 },
        didParseCell: (d) => {
          if (d.column.index === 4 && d.section === 'body') {
            const val = String(d.cell.raw);
            const [hc, rest] = val.split(' / ');
            const shId = Object.keys(shiftsMap)[d.row.index];
            const sh = getShiftById(shId);
            if (parseInt(hc) < (sh?.minStaff || 0)) d.cell.styles.textColor = [190, 18, 60];
          }
        }
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
    doc.setFontSize(9).setTextColor(100).text(`Validation of 5 Shifts / 2 Days Off Policy`, 14, 26);
    const localAuditBody = staff.filter(s => s.type === 'Local').map(s => {
      const stats = utilizationData[s.id];
      const isCompliant = stats.work <= 5;
      return [s.name, s.initials, stats.work.toString(), stats.off.toString(), isCompliant ? 'MATCH' : `FAULT (${stats.work}/5)` ];
    });
    autoTable(doc, {
      startY: 35, head: [['PERSONNEL NAME', 'INITIALS', 'TOTAL SHIFTS', 'TOTAL DAYS OFF', 'STATUS']], body: localAuditBody, theme: 'grid',
      headStyles: { fillColor: headerColor, textColor: 255 }, didParseCell: (d) => { if (d.column.index === 4 && String(d.cell.raw).startsWith('FAULT')) d.cell.styles.textColor = [190, 18, 60]; }
    });

    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(217, 119, 6).text(`Weekly Personnel Utilization Audit (Roster Staff)`, 14, 20);
    doc.setFontSize(9).setTextColor(100).text(`Validation of Contract Window Alignment`, 14, 26);
    const rosterAuditBody = staff.filter(s => s.type === 'Roster').map(s => {
      const stats = utilizationData[s.id];
      const winStr = (s.workFromDate && s.workToDate) ? `${s.workFromDate} - ${s.workToDate}` : 'No Window Defined';
      return [s.name, s.initials, winStr, stats.rosterPotential.toString(), stats.work.toString(), (stats.work > stats.rosterPotential) ? 'OVERWORKED' : 'COMPLIANT' ];
    });
    autoTable(doc, {
      startY: 35, head: [['PERSONNEL NAME', 'INITIALS', 'WINDOW', 'MUST WORK (POTENTIAL)', 'ACTUALLY WORKED', 'STATUS']], body: rosterAuditBody, theme: 'grid',
      headStyles: { fillColor: [217, 119, 6], textColor: 255 }, didParseCell: (d) => { if (d.column.index === 5 && d.cell.raw === 'OVERWORKED') d.cell.styles.textColor = [190, 18, 60]; }
    });

    doc.save(`SkyOPS_Full_Station_Report_${startDate}.pdf`);
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
                          const staffAssignments: Record<string, string[]> = {};
                          group.forEach(a => {
                            if (!staffAssignments[a.staffId]) staffAssignments[a.staffId] = [];
                            const label = formatRoleLabel(a.role, sh?.roleCounts);
                            if (label) staffAssignments[a.staffId].push(label);
                          });
                          const currentHc = Object.keys(staffAssignments).length;
                          const isUnderstaffed = currentHc < (sh?.minStaff || 0);
                          
                          return (
                            <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50 ${isUnderstaffed ? 'bg-rose-50/30' : ''}`}>
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime}</td><td className="p-6 text-sm font-black italic">{sh?.endTime}</td><td className="p-6 text-xs font-bold uppercase text-blue-600">{fls}</td>
                              <td className={`p-6 text-xs font-black text-center ${isUnderstaffed ? 'text-rose-600 animate-pulse' : ''}`}>
                                {isUnderstaffed && <AlertIcon size={12} className="inline mr-2" />}
                                {currentHc} / {sh?.maxStaff || sh?.minStaff || '0'}
                              </td>
                              <td className="p-6 flex flex-wrap gap-2">
                                {Object.entries(staffAssignments).map(([sid, roles], ai) => {
                                  const st = getStaffById(sid);
                                  const count = utilizationData[sid]?.work || 0;
                                  const isWorkloadHigh = (st?.type === 'Local' && count > 5);
                                  return (
                                    <span key={ai} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isWorkloadHigh ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm' : 'bg-slate-100 text-slate-700'}`}>
                                      <span className={isWorkloadHigh ? 'animate-pulse font-black' : 'font-black'}>[{count}]</span> {st?.initials} {roles.length > 0 && <span className="text-slate-950 font-black ml-1">({roles.join('+')})</span>}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-20">
            <div className="bg-white rounded-[4rem] border-4 border-slate-950 shadow-2xl overflow-hidden">
               <div className="p-10 bg-slate-950 text-white flex justify-between items-center"><h2 className="text-2xl font-black uppercase italic">Local Personnel Audit</h2><BarChart3 size={24} className="text-blue-500" /></div>
               <div className="p-8 overflow-hidden"><table className="w-full text-left">
                  <thead className="text-[10px] font-black uppercase text-slate-400 border-b"><tr className="bg-slate-50"><th className="p-4">Personnel</th><th className="p-4 text-center">Worked</th><th className="p-4 text-center">Off</th><th className="p-4 text-right">Status</th></tr></thead>
                  <tbody>{staff.filter(s => s.type === 'Local').map(s => (
                    <tr key={s.id} className="border-b text-xs font-bold"><td className="p-4">{s.name} ({s.initials})</td><td className="p-4 text-center">{utilizationData[s.id].work}</td><td className="p-4 text-center">{utilizationData[s.id].off}</td><td className={`p-4 text-right italic ${utilizationData[s.id].work > 5 ? 'text-rose-600' : 'text-emerald-600'}`}>{utilizationData[s.id].work <= 5 ? 'MATCH' : 'FAULT'}</td></tr>
                  ))}</tbody>
               </table></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};