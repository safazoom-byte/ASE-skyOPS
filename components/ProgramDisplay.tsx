import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileText, 
  Plane, 
  ShieldCheck, 
  AlertTriangle, 
  CalendarDays, 
  LayoutGrid, 
  List,
  Activity,
  Users,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Coffee,
  Printer,
  ChevronRight
} from 'lucide-react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  stationHealth?: number;
  alerts?: { type: 'danger' | 'warning', message: string }[];
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, leaveRequests = [], startDate, endDate, stationHealth = 100, alerts = [] }) => {
  const [viewMode, setViewMode] = useState<'detailed' | 'matrix'>('detailed');
  
  const sortedPrograms = useMemo(() => {
    return Array.isArray(programs) ? [...programs].sort((a, b) => Number(a.day || 0) - Number(b.day || 0)) : [];
  }, [programs]);

  const totalAssignments = useMemo(() => {
    return sortedPrograms.reduce((sum, p) => sum + (p.assignments?.length || 0), 0);
  }, [sortedPrograms]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const getDayLabel = (dayIndex: any) => {
    const d = new Date(startDate || '');
    if (isNaN(d.getTime())) return `Day ${dayIndex + 1}`;
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' - ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getDayISODate = (dayIndex: any) => {
    const d = new Date(startDate || '');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toISOString().split('T')[0];
  }

  const getLeaveForDay = (dateStr: string, type: LeaveType) => {
    const matched = leaveRequests.filter(req => 
      req.type === type && dateStr >= req.startDate && dateStr <= req.endDate
    ).map(req => getStaffById(req.staffId)?.initials).filter(Boolean);
    
    return matched.length > 0 ? matched.join(', ') : 'NONE';
  };

  const matrixData = useMemo(() => {
    const matrix: Record<string, Record<number, { shift: string; role: string; flight?: string; isGap?: boolean; leaveType?: string }>> = {};
    staff.forEach(s => { matrix[s.id] = {}; });
    matrix['GAP'] = {};

    sortedPrograms.forEach(prog => {
      const dayIdx = prog.day;
      const dateStr = getDayISODate(dayIdx);

      staff.forEach(s => {
        const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
        if (leave) {
          matrix[s.id][dayIdx] = { shift: 'LEAVE', role: leave.type, leaveType: leave.type };
        }
      });

      (prog.assignments || []).forEach(a => {
        const staffId = a.staffId || 'GAP';
        if (!matrix[staffId]) matrix[staffId] = {};
        if (staffId !== 'GAP' && matrix[staffId][dayIdx]?.shift === 'LEAVE') return;

        const sh = getShiftById(a.shiftId);
        const fl = getFlightById(a.flightId);
        matrix[staffId][dayIdx] = {
          shift: sh ? `${sh.pickupTime}-${sh.endTime}` : 'Duty',
          role: a.role,
          flight: fl?.flightNumber,
          isGap: staffId === 'GAP'
        };
      });
    });
    return matrix;
  }, [sortedPrograms, staff, shifts, flights, leaveRequests, startDate]);

  const exportPDF = () => {
    if (totalAssignments === 0) return;
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const headerColor = [2, 6, 23]; // Slate-950 equivalent for headers

    sortedPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22).text(`SkyOPS Station Handling Program`, 14, 20);
      doc.setFontSize(11).setTextColor(100, 100, 100).text(`${startDate} — ${endDate}`, 14, 28);
      
      doc.setFontSize(16).setTextColor(0, 0, 0).text(getDayLabel(program.day), 14, 42);

      const tableData = program.assignments.map((a, i) => {
        const sh = getShiftById(a.shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION';
        const st = getStaffById(a.staffId);
        return [
          (i + 1).toString(),
          sh?.pickupTime || '--:--',
          sh?.endTime || '--:--',
          fls,
          `${sh?.minStaff || '0'} / ${sh?.maxStaff || '0'}`,
          `${st?.initials || 'GAP'} ${a.role}`
        ];
      });

      autoTable(doc, {
        startY: 48,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC/MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 50 },
          4: { cellWidth: 25 },
        }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14).text('ABSENCE AND LEAVES REGISTRY', 14, currentY);

      const dateStr = getDayISODate(program.day);
      const absenceData = [
        ['DAYS OFF', getLeaveForDay(dateStr, 'DAY OFF')],
        ['ROSTER LEAVE', getLeaveForDay(dateStr, 'ROSTER LEAVE')],
        ['ANNUAL LEAVE', getLeaveForDay(dateStr, 'ANNUAL LEAVE')],
        ['SICK LEAVE', getLeaveForDay(dateStr, 'SICK LEAVE')],
        ['LIEU LEAVE', getLeaveForDay(dateStr, 'LIEU LEAVE')],
        ['AVAILABLE (NIL)', getLeaveForDay(dateStr, 'NIL')]
      ];

      autoTable(doc, {
        startY: currentY + 5,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: absenceData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 10 },
        bodyStyles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: 'bold' }
        }
      });
    });

    doc.save(`SkyOPS_Handling_Program_${startDate}.pdf`);
  };

  if (totalAssignments === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 max-w-4xl mx-auto py-20">
        <div className="bg-white p-12 md:p-16 rounded-[4rem] border border-slate-100 shadow-sm text-center space-y-8 flex flex-col items-center">
           <div className="w-20 h-20 bg-slate-950 rounded-[2.5rem] flex items-center justify-center shadow-2xl text-white"><Calendar size={32} /></div>
           <div>
             <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Handling Program</h2>
             <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em] mt-3">{startDate} — {endDate}</p>
           </div>
           <p className="text-slate-400 text-xs">Awaiting operational commitment. Run the engine to generate the handling plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      {/* KPI Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-slate-950 p-8 rounded-[2.5rem] text-white flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-600/5 group-hover:bg-blue-600/10 transition-all"></div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 relative z-10">Readiness Score</p>
            <h4 className="text-6xl font-black italic tracking-tighter text-blue-500 relative z-10">{stationHealth}%</h4>
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-6 overflow-hidden relative z-10">
               <div className="h-full bg-blue-500 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${stationHealth}%` }}></div>
            </div>
        </div>
        
        <div className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6 flex items-center gap-3">
             <Activity size={16} className="text-blue-600" /> Operational Insights
           </h4>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto max-h-32 no-scrollbar">
              {alerts.length > 0 ? (
                alerts.map((alert, i) => (
                  <div key={i} className={`p-4 rounded-2xl flex items-center gap-4 border ${alert.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                    <AlertCircle size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest leading-tight">{alert.message}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full p-6 rounded-3xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center gap-4 shadow-sm">
                  <CheckCircle2 size={24} />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest">Registry Compliant</p>
                    <p className="text-[9px] font-bold opacity-70">Station logic checks passed successfully.</p>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-slate-950 rounded-[1.8rem] flex items-center justify-center text-white shadow-xl"><CalendarDays size={24} /></div>
           <div>
             <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Handling Registry</h2>
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{startDate} - {endDate}</p>
           </div>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200">
             <button onClick={() => setViewMode('detailed')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <List size={14}/> Program
             </button>
             <button onClick={() => setViewMode('matrix')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <LayoutGrid size={14}/> Matrix
             </button>
          </div>
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-2">
            <Printer size={18} />
            <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Generate PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="sticky left-0 z-40 bg-slate-950 p-6 border-r border-white/10 text-[10px] font-black uppercase tracking-widest min-w-[200px]">Agent</th>
                  {sortedPrograms.map(p => (
                    <th key={p.day} className="p-6 text-center border-r border-white/5 min-w-[140px]">
                      <span className="block text-sm font-black italic tracking-tighter">{getDayLabel(p.day).split(' - ')[0].substring(0,3)}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{getDayLabel(p.day).split(' - ')[1].substring(0,5)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="sticky left-0 z-30 bg-white border-r border-slate-100 p-6">
                       <div className="flex items-center gap-4">
                          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black italic text-xs">{s.initials}</div>
                          <p className="text-[11px] font-black text-slate-900 leading-none truncate">{s.name}</p>
                       </div>
                    </td>
                    {sortedPrograms.map(p => {
                      const entry = matrixData[s.id]?.[p.day];
                      return (
                        <td key={p.day} className="p-2 border-r border-slate-50">
                          {entry ? (
                            entry.leaveType ? (
                              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 text-center">
                                <span className="text-[7px] font-black uppercase tracking-tighter">{entry.leaveType.split(' ')[0]}</span>
                              </div>
                            ) : (
                              <div className="p-3 rounded-2xl bg-slate-950 text-white shadow-lg text-center">
                                <span className="block text-[9px] font-black tracking-tighter">{entry.shift}</span>
                                <span className="block text-[6px] font-black uppercase text-white/50">{entry.role}</span>
                              </div>
                            )
                          ) : (
                            <div className="h-full flex items-center justify-center opacity-10"><span className="w-1 h-1 bg-slate-400 rounded-full"></span></div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-16">
          {sortedPrograms.map(program => {
            const dateStr = getDayISODate(program.day);
            return (
              <div key={program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                <div className="p-10 md:p-14 bg-white">
                  <div className="mb-10">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950">{getDayLabel(program.day)}</h2>
                  </div>

                  {/* Main Handling Table */}
                  <div className="overflow-x-auto no-scrollbar rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-950 text-white">
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-16">S/N</th>
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-28">PICKUP</th>
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-28">RELEASE</th>
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-64">FLIGHTS</th>
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-28">HC/MAX</th>
                          <th className="p-5 text-[10px] font-black uppercase tracking-widest">PERSONNEL & ASSIGNED ROLES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {/* Group assignments by shift */}
                        {Object.values(program.assignments.reduce((acc: any, curr) => {
                          if (!acc[curr.shiftId]) acc[curr.shiftId] = [];
                          acc[curr.shiftId].push(curr);
                          return acc;
                        }, {})).map((group: any, idx) => {
                          const sh = getShiftById(group[0].shiftId);
                          const flightsStr = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION OPS';
                          const personnelStr = group.map((a: any) => {
                             const st = getStaffById(a.staffId);
                             return `${st?.initials || 'GAP'} ${a.role}`;
                          }).join(' | ');

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-all">
                              <td className="p-6 text-xs font-black text-slate-400 border-r border-slate-100">{idx + 1}</td>
                              <td className="p-6 text-sm font-black italic text-slate-900 border-r border-slate-100">{sh?.pickupTime || '--:--'}</td>
                              <td className="p-6 text-sm font-black italic text-slate-900 border-r border-slate-100">{sh?.endTime || '--:--'}</td>
                              <td className="p-6 text-xs font-bold text-slate-900 border-r border-slate-100 leading-relaxed uppercase">{flightsStr}</td>
                              <td className="p-6 text-xs font-black text-slate-600 border-r border-slate-100 text-center">{group.length} / {sh?.maxStaff || '0'}</td>
                              <td className="p-6 text-[10px] font-bold text-slate-900 leading-relaxed">{personnelStr}</td>
                            </tr>
                          );
                        })}
                        {program.assignments.length === 0 && (
                          <tr><td colSpan={6} className="p-20 text-center text-[10px] font-black uppercase text-slate-300 italic tracking-widest">No operations recorded for this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Absence Registry Section */}
                  <div className="mt-16 space-y-6">
                    <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Absence and Leaves Registry</h4>
                    <div className="overflow-hidden rounded-3xl border border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-600 text-white">
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-[240px]">Status Category</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest">Personnel Initials</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[
                            { label: 'DAYS OFF', type: 'DAY OFF' as LeaveType },
                            { label: 'ROSTER LEAVE', type: 'ROSTER LEAVE' as LeaveType },
                            { label: 'ANNUAL LEAVE', type: 'ANNUAL LEAVE' as LeaveType },
                            { label: 'SICK LEAVE', type: 'SICK LEAVE' as LeaveType },
                            { label: 'LIEU LEAVE', type: 'LIEU LEAVE' as LeaveType },
                            { label: 'AVAILABLE (NIL)', type: 'NIL' as LeaveType },
                          ].map((cat, i) => (
                            <tr key={i}>
                              <td className="p-5 text-[10px] font-black text-slate-900 uppercase tracking-widest border-r border-slate-100 bg-slate-50/30">{cat.label}</td>
                              <td className="p-5 text-[11px] font-bold text-slate-700 tracking-widest">{getLeaveForDay(dateStr, cat.type)}</td>
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
    </div>
  );
};
