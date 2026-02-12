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
    const stats: Record<string, { work: number, off: number, rosterPotential: number, rosterLeave: number, annualLeave: number, standby: number, resting: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0, rosterPotential: 0, rosterLeave: 0, annualLeave: 0, standby: 0, resting: 0 });
    
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

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

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

  const calculateRest = (staffId: string, currentProgram: DailyProgram, currentShift: ShiftConfig) => {
    const programIndex = filteredPrograms.findIndex(p => p.dateString === currentProgram.dateString);
    if (programIndex < 0) return null;
    let previousShiftEnd: Date | null = null;
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
    if (previousShiftEnd && currentProgram.dateString) {
      const currentStart = new Date(`${currentProgram.dateString}T${currentShift.pickupTime}:00`);
      const diffMs = currentStart.getTime() - previousShiftEnd.getTime();
      return diffMs / (1000 * 60 * 60);
    }
    return null;
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
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: registryData,
        theme: 'grid',
        headStyles: { fillColor: greyHeader, textColor: 255, fontSize: 9, cellPadding: 3 },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 'auto' } }
      });
    });

    // 2. Local Audit Page
    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(22).text(`Weekly Personnel Utilization Audit (Local)`, 14, 20);
    const localData = staff.filter(s => s.type === 'Local').map((s, i) => {
      const work = utilizationData[s.id].work;
      return [(i + 1).toString(), s.name, s.initials, work.toString(), utilizationData[s.id].off.toString(), work === 5 ? 'MATCH' : 'CHECK'];
    });
    autoTable(doc, { 
      startY: 35, 
      head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']], 
      body: localData, 
      theme: 'grid', 
      headStyles: { fillColor: darkHeader, fontSize: 10, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 }
    });

    // 3. Roster Audit Page
    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(22).text(`Weekly Personnel Utilization Audit (Roster)`, 14, 20);
    const rosterData = staff.filter(s => s.type === 'Roster').map((s, i) => {
      return [(i + 1).toString(), s.name, s.initials, `${s.workFromDate} to ${s.workToDate}`, utilizationData[s.id].rosterPotential.toString(), utilizationData[s.id].work.toString()];
    });
    autoTable(doc, { 
      startY: 35, 
      head: [['S/N', 'NAME', 'INIT', 'CONTRACT WINDOW', 'POTENTIAL', 'ACTUAL']], 
      body: rosterData, 
      theme: 'grid', 
      headStyles: { fillColor: orangeHeader, fontSize: 10, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 }
    });

    // 4. Matrix View Page (Polished with Color Coding)
    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold').setFontSize(22).text(`Weekly Operations Matrix View`, 14, 20);
    doc.setFontSize(10).setTextColor(120, 120, 120).text(`Detailed Assignment Timeline`, 14, 27);
    
    const matrixHeader = [
      'S/N', 
      'AGENT', 
      ...filteredPrograms.map(p => {
        const d = new Date(p.dateString || '');
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      }),
      'AUDIT'
    ];

    const matrixBody = staff.sort((a,b) => a.type.localeCompare(b.type)).map((s, i) => {
      const assignments = filteredPrograms.map(p => {
        const ass = p.assignments.find(a => a.staffId === s.id);
        if (!ass) return '-';
        const sh = getShiftById(ass.shiftId);
        return sh ? sh.pickupTime : '-';
      });
      const workCount = utilizationData[s.id].work;
      const potential = utilizationData[s.id].rosterPotential;
      return [
        (i + 1).toString(),
        `${s.initials} (${s.type[0]})`,
        ...assignments,
        `${workCount}/${potential}`
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [matrixHeader],
      body: matrixBody,
      theme: 'grid',
      headStyles: { fillColor: darkHeader, textColor: 255, fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index >= 2 && data.column.index < matrixHeader.length - 1) {
          if (data.cell.text[0] !== '-') {
            data.cell.styles.fillColor = [240, 249, 255]; // Blue for work
            data.cell.styles.textColor = [2, 6, 23];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [200, 200, 200]; // Grey for off
          }
        }
        if (data.section === 'body' && data.column.index === matrixHeader.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`SkyOPS_Station_Program_${startDate}.pdf`);
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
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl flex items-center gap-2 shadow-lg hover:bg-blue-600 transition-all"><Printer size={18} /><span className="text-[10px] font-black uppercase">Print Master Report</span></button>
        </div>
      </div>

      {viewMode === 'detailed' && (
        <div className="space-y-16">
          {filteredPrograms.map(program => {
            const shiftsMap: Record<string, Assignment[]> = {};
            program.assignments.forEach(a => { if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = []; shiftsMap[a.shiftId || ''].push(a); });
            const registry = getFullRegistryForDay(program);
            return (
              <div key={program.dateString || program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-bottom">
                <div className="p-10 md:p-14">
                  <div className="flex justify-between items-end mb-10">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">{getDayLabel(program)}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Station Handling Active</span>
                  </div>
                  <div className="overflow-x-auto rounded-3xl border border-slate-200 mb-12">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-950 text-white"><tr className="text-[10px] font-black uppercase"><th className="p-5">PICKUP</th><th className="p-5">RELEASE</th><th className="p-5">FLIGHTS</th><th className="p-5 text-center">HC / MAX</th><th className="p-5">PERSONNEL & ROLES</th></tr></thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join('/') || 'NIL';
                          return (
                            <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50`}>
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime}</td><td className="p-6 text-sm font-black italic">{sh?.endTime}</td><td className="p-6 text-xs font-bold uppercase text-blue-600">{fls}</td>
                              <td className="p-6 text-xs font-black text-center">{group.length} / {sh?.maxStaff || sh?.minStaff || '0'}</td>
                              <td className="p-6 flex flex-wrap gap-2 items-center">
                                {group.map((a, ai) => {
                                  const st = getStaffById(a.staffId);
                                  const roleLabel = formatRoleLabel(a.role);
                                  return (
                                    <React.Fragment key={ai}>
                                      <span className="text-[10px] font-black text-slate-700">
                                        {st?.initials} {roleLabel && <span className="text-blue-600 ml-1">{roleLabel}</span>}
                                      </span>
                                      {ai < group.length - 1 && <span className="text-slate-300">|</span>}
                                    </React.Fragment>
                                  );
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xl font-black italic uppercase text-slate-950 tracking-tighter">ABSENCE AND REST REGISTRY</h3>
                    <div className="overflow-x-auto rounded-3xl border border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-700 text-white"><tr className="text-[9px] font-black uppercase"><th className="p-4 w-64">STATUS CATEGORY</th><th className="p-4">PERSONNEL INITIALS</th></tr></thead>
                        <tbody>
                          {Object.entries(registry).map(([cat, agents], idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="p-4 text-[10px] font-black uppercase text-slate-500">{cat}</td>
                              <td className="p-4 text-[10px] font-bold text-slate-900">{agents.length > 0 ? agents.join(', ') : 'NONE'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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