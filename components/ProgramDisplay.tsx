import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest, IncomingDuty } from '../types';
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
  Check
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
    
    const results = programs.filter(p => {
      if (!p.dateString) return false;
      return p.dateString >= startDate && p.dateString <= endDate;
    });

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
    const stats: Record<string, { work: number, off: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0 });
    
    filteredPrograms.forEach(program => {
      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      staff.forEach(s => {
        if (assignedIds.has(s.id)) {
          stats[s.id].work++;
        } else {
          stats[s.id].off++;
        }
      });
    });
    return stats;
  }, [filteredPrograms, staff]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const formatRoleLabel = (role: any) => {
    const rStr = String(role || '').trim();
    if (!rStr) return '';
    const lower = rStr.toLowerCase();
    if (lower === 'general' || lower === 'rmp' || lower === 'ramp' || lower === 'nil') return '';
    
    return rStr.split('+').map(part => {
      const r = part.trim().toUpperCase();
      if (r === 'SHIFT LEADER' || r === 'SL') return 'SL';
      if (r === 'OPERATIONS' || r === 'OPS') return 'OPS';
      if (r === 'RAMP' || r === 'RMP') return ''; 
      if (r === 'LOAD CONTROL' || r === 'LC') return 'LC';
      if (r === 'LOST AND FOUND' || r === 'LF') return 'LF';
      return r;
    }).filter(Boolean).join('+');
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
      'RESTING (POST-DUTY)': [],
      'DAYS OFF': [],
      'ROSTER LEAVE': [],
      'ANNUAL LEAVE': [],
      'STANDBY (RESERVE)': []
    };

    staff.forEach(s => {
      const offCount = utilizationData[s.id]?.off || 0;
      const countLabel = ` (${offCount})`;
      if (assignedStaffIds.has(s.id)) return;

      const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
      if (restLock) {
        registry['RESTING (POST-DUTY)'].push(`${s.initials} (until ${restLock.shiftEndTime})`);
        return;
      }

      const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
      if (leave) {
        const typeKey = String(leave.type || '').toUpperCase();
        if (registry[typeKey]) registry[typeKey].push(`${s.initials}${countLabel}`);
        else registry['ANNUAL LEAVE'].push(`${s.initials}${countLabel}`);
        return;
      }

      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
        if (dateStr < s.workFromDate || dateStr > s.workToDate) {
          registry['ROSTER LEAVE'].push(`${s.initials}${countLabel}`);
          return;
        }
      }

      const aiOff = (program.offDuty || []).find(od => od.staffId === s.id);
      if (aiOff) {
        const typeKey = String(aiOff.type || '').toUpperCase();
        if (registry[typeKey]) {
          registry[typeKey].push(`${s.initials}${countLabel}`);
          return;
        }
      }

      if (s.type === 'Local') {
        registry['DAYS OFF'].push(`${s.initials}${countLabel}`);
      } else {
        registry['STANDBY (RESERVE)'].push(`${s.initials}${countLabel}`);
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
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18).text(`SkyOPS Station Handling Program`, 14, 15);
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
          const label = formatRoleLabel(a.role);
          if (label) staffAssignments[a.staffId].push(label);
        });

        const personnelStr = Object.entries(staffAssignments).map(([sid, roles]) => {
          if (sid === 'GAP' || sid === 'VACANT') return 'VACANT';
          const st = getStaffById(sid);
          const rolesStr = roles.length > 0 ? ` (${roles.join('+')})` : '';
          return `${st?.initials || '??'}${rolesStr}`;
        }).join(' | ');

        const uniqueHeadcount = Object.keys(staffAssignments).filter(k => k !== 'GAP' && k !== 'VACANT').length;
        return [(i + 1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, `${uniqueHeadcount} / ${sh?.maxStaff || sh?.minStaff || '0'}`, personnelStr];
      });

      autoTable(doc, {
        startY: 38,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 6.5, cellPadding: 2, textColor: 50 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 35 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } },
        margin: { top: 38, bottom: 10 }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11).setFont('helvetica', 'bold').text('ABSENCE AND REST REGISTRY', 14, currentY);
      const registry = getFullRegistryForDay(program);
      const absenceData = [
        ['RESTING (POST-DUTY)', registry['RESTING (POST-DUTY)'].join(', ') || 'NONE'],
        ['DAYS OFF', registry['DAYS OFF'].join(', ') || 'NONE'],
        ['ROSTER LEAVE', registry['ROSTER LEAVE'].join(', ') || 'NONE'],
        ['ANNUAL LEAVE', registry['ANNUAL LEAVE'].join(', ') || 'NONE'],
        ['STANDBY (RESERVE)', registry['STANDBY (RESERVE)'].join(', ') || 'NONE']
      ];
      autoTable(doc, {
        startY: currentY + 3,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: absenceData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
        margin: { bottom: 10 }
      });
    });

    // Add Final Audit Page
    doc.addPage('l', 'mm', 'a4');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18).setTextColor(headerColor[0], headerColor[1], headerColor[2]).text(`Weekly Personnel Utilization Audit`, 14, 20);
    doc.setFontSize(9).setTextColor(100).text(`Validation of 5 Shifts / 2 Days Off Policy (Local Staff Only)`, 14, 26);

    const auditBody = staff.filter(s => s.type === 'Local').map(s => {
      const stats = utilizationData[s.id];
      const isCompliant = stats.work === 5 && stats.off === 2;
      return [
        s.name,
        s.initials,
        stats.work.toString(),
        stats.off.toString(),
        isCompliant ? 'MATCH (5/2)' : `ERROR (${stats.work}/${stats.off})`
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['PERSONNEL NAME', 'INITIALS', 'TOTAL SHIFTS', 'TOTAL DAYS OFF', 'COMPLIANCE STATUS']],
      body: auditBody,
      theme: 'grid',
      headStyles: { fillColor: headerColor, textColor: 255, fontSize: 10 },
      bodyStyles: { fontSize: 9, cellPadding: 4 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const text = String(data.cell.raw);
          if (text.startsWith('ERROR')) {
            data.cell.styles.textColor = [190, 18, 60]; // rose-700
            data.cell.styles.fontStyle = 'bold';
          } else if (text.startsWith('MATCH')) {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    doc.save(`SkyOPS_Station_Full_Program_${startDate}.pdf`);
  };

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="bg-white p-6 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-slate-950 rounded-[1.8rem] flex items-center justify-center text-white"><CalendarDays size={24} /></div>
           <div>
             <h2 className="text-2xl font-black text-slate-900 uppercase italic leading-none">Handling Registry</h2>
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{startDate} - {endDate}</p>
           </div>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
             <button onClick={() => setViewMode('detailed')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <List size={14}/> Program
             </button>
             <button onClick={() => setViewMode('matrix')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <LayoutGrid size={14}/> Matrix
             </button>
          </div>
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl flex items-center gap-2 shadow-lg active:scale-95 transition-all">
            <Printer size={18} />
            <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Generate PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'detailed' && (
        <div className="space-y-16">
          {filteredPrograms.map(program => {
            const registry = getFullRegistryForDay(program);
            const shiftsMap: Record<string, Assignment[]> = {};
            program.assignments.forEach(a => {
              if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
              shiftsMap[a.shiftId || ''].push(a);
            });

            return (
              <div key={program.dateString || program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 md:p-14">
                  <div className="flex justify-between items-end mb-10">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">{getDayLabel(program)}</h2>
                    <div className="flex items-center gap-2">
                      <Plane className="text-blue-500" size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Station Handling Active</span>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-white">
                          <th className="p-5 text-[10px] font-black uppercase">PICKUP</th>
                          <th className="p-5 text-[10px] font-black uppercase">RELEASE</th>
                          <th className="p-5 text-[10px] font-black uppercase">FLIGHTS</th>
                          <th className="p-5 text-[10px] font-black uppercase">HC / MAX</th>
                          <th className="p-5 text-[10px] font-black uppercase">PERSONNEL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
                          const staffAssignments: Record<string, string[]> = {};
                          group.forEach(a => {
                            if (!staffAssignments[a.staffId]) staffAssignments[a.staffId] = [];
                            const label = formatRoleLabel(a.role);
                            if (label) staffAssignments[a.staffId].push(label);
                          });
                          const uniqueHeadcount = Object.keys(staffAssignments).filter(k => k !== 'GAP' && k !== 'VACANT').length;

                          return (
                            <tr key={idx} className="border-b border-slate-100 group hover:bg-slate-50 transition-colors">
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime || '--:--'}</td>
                              <td className="p-6 text-sm font-black italic">{sh?.endTime || '--:--'}</td>
                              <td className="p-6 text-xs font-bold uppercase text-blue-600">{fls}</td>
                              <td className="p-6 text-xs font-black">
                                <span className={uniqueHeadcount < (sh?.minStaff || 0) ? 'text-rose-600' : 'text-emerald-600'}>
                                  {uniqueHeadcount} / {sh?.maxStaff || sh?.minStaff || '0'}
                                </span>
                              </td>
                              <td className="p-6 text-[10px] font-bold uppercase">
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(staffAssignments).map(([sid, roles], ai) => {
                                      const isGap = sid === 'GAP' || sid === 'VACANT';
                                      const st = isGap ? null : getStaffById(sid);
                                      const rolesStr = roles.length > 0 ? ` (${roles.join('+')})` : '';
                                      return (
                                        <span key={ai} className={`px-2 py-1 rounded-lg flex items-center gap-1 ${isGap ? 'bg-rose-50 text-rose-600 border border-rose-100 ring-2 ring-rose-500/20' : 'bg-slate-100 text-slate-700 font-bold'}`}>
                                          {isGap && <ShieldAlert size={10} className="text-rose-400" />}
                                          {isGap ? 'VACANT' : (st?.initials || '??')} 
                                          {rolesStr && <span className="font-black text-slate-900">{rolesStr}</span>}
                                        </span>
                                      );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-16 space-y-6">
                    <h4 className="text-xl font-black italic uppercase text-slate-900">Absence and Rest Registry</h4>
                    <div className="overflow-hidden rounded-3xl border border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-600 text-white">
                            <th className="p-5 text-[10px] font-black uppercase w-[240px]">Status Category</th>
                            <th className="p-5 text-[10px] font-black uppercase">Personnel Initials</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(registry).filter(([_, list]) => list.length > 0).map(([type, list], i) => (
                            <tr key={i}>
                              <td className="p-5 text-[10px] font-black uppercase text-slate-900 bg-slate-50/30">{type}</td>
                              <td className="p-5 text-[11px] font-bold text-slate-700">{list.join(', ')}</td>
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

          {/* Weekly Utilization Audit Table Ledger */}
          <div className="bg-white rounded-[4rem] border-4 border-slate-900 shadow-2xl overflow-hidden mt-20">
            <div className="p-10 md:p-14 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-center gap-6">
               <div className="flex items-center gap-6">
                 <div className="w-16 h-16 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/30">
                   <BarChart3 size={32} />
                 </div>
                 <div>
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">Utilization Audit Ledger</h2>
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">Personnel Efficiency & 5/2 Compliance (Local Staff)</p>
                 </div>
               </div>
               <div className="flex gap-4">
                  <div className="px-5 py-3 bg-white/10 rounded-2xl flex items-center gap-3">
                     <CheckCircle2 className="text-emerald-500" size={18} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Logic Policy Active</span>
                  </div>
               </div>
            </div>
            
            <div className="p-10 md:p-14">
              <div className="overflow-x-auto rounded-[2rem] border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 border-b border-slate-200">
                      <th className="p-6 text-[10px] font-black uppercase">Personnel Name</th>
                      <th className="p-6 text-[10px] font-black uppercase">Initials</th>
                      <th className="p-6 text-[10px] font-black uppercase text-center">Total Shifts</th>
                      <th className="p-6 text-[10px] font-black uppercase text-center">Total Days Off</th>
                      <th className="p-6 text-[10px] font-black uppercase text-right">Compliance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.filter(s => s.type === 'Local').map(s => {
                      const stats = utilizationData[s.id];
                      const isCompliant = stats.work === 5 && stats.off === 2;
                      return (
                        <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="p-6 font-bold text-slate-900 text-sm">{s.name}</td>
                          <td className="p-6 font-black italic text-slate-900 text-sm">{s.initials}</td>
                          <td className="p-6 text-center">
                            <span className={`px-4 py-2 rounded-xl text-xs font-black ${stats.work === 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {stats.work} / 5
                            </span>
                          </td>
                          <td className="p-6 text-center">
                             <span className={`px-4 py-2 rounded-xl text-xs font-black ${stats.off === 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                               {stats.off} / 2
                             </span>
                          </td>
                          <td className="p-6 text-right">
                             {isCompliant ? (
                               <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase italic">
                                 <Check size={14} /> Match 5/2
                               </div>
                             ) : (
                               <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase italic animate-pulse">
                                 <TriangleAlert size={14} /> Policy Fault
                               </div>
                             )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-10 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 flex items-start gap-6">
                 <CircleAlert className="text-blue-600 shrink-0" size={24} />
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Operational Audit Note</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      The "Utilization Audit Ledger" ensures high-fidelity adherence to local handling laws. Personnel flagged with "Policy Fault" indicates a deviation from the mandatory 5/2 cycle. Use the Refiner AI Chat to redistribute workload if faults persist.
                    </p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};