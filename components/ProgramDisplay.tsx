import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest, IncomingDuty } from '../types';
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
  ChevronRight,
  UserX,
  Moon
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

  const getFullRegistryForDay = (program: DailyProgram) => {
    const dateStr = getDayISODate(program.day);
    const assignedStaffIds = new Set((program.assignments || []).map(a => a.staffId));
    
    const registry: Record<string, string[]> = {
      'Day off': [],
      'Annual leave': [],
      'Lieu leave': [],
      'Sick leave': [],
      'Roster leave': [],
      'MANDATORY REST': [],
      'NIL': []
    };

    staff.forEach(s => {
      if (assignedStaffIds.has(s.id)) return;

      // 1. Check Rest Locks (Fatigue)
      const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
      if (restLock) {
        registry['MANDATORY REST'].push(`${s.initials} (until ${restLock.shiftEndTime})`);
        return;
      }

      // 2. Check leave requests
      const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
      if (leave) {
        registry[leave.type].push(s.initials);
        return;
      }

      // 3. Check roster contract dates
      if (s.type === 'Roster' && s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate)) {
        registry['Roster leave'].push(s.initials);
        return;
      }

      const aiOff = (program.offDuty || []).find(od => od.staffId === s.id);
      if (aiOff) {
        registry[aiOff.type].push(s.initials);
        return;
      }

      if (s.type === 'Local') {
        registry['Day off'].push(s.initials);
        return;
      }

      registry['NIL'].push(s.initials);
    });

    return registry;
  };

  const matrixData = useMemo(() => {
    const matrix: Record<string, Record<number, any>> = {};
    
    sortedPrograms.forEach(program => {
      const dateStr = getDayISODate(program.day);
      
      program.assignments.forEach(a => {
        if (!matrix[a.staffId]) matrix[a.staffId] = {};
        const sh = getShiftById(a.shiftId);
        matrix[a.staffId][program.day] = {
          shift: sh ? `${sh.pickupTime}-${sh.endTime}` : 'DUTY',
          role: a.role
        };
      });

      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      staff.forEach(s => {
        if (assignedIds.has(s.id)) return;
        if (!matrix[s.id]) matrix[s.id] = {};
        
        const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
        if (restLock) {
          matrix[s.id][program.day] = { leaveType: `Rest (until ${restLock.shiftEndTime})` };
          return;
        }

        const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
        if (leave) {
          matrix[s.id][program.day] = { leaveType: leave.type };
          return;
        }

        if (s.type === 'Roster' && s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate)) {
          matrix[s.id][program.day] = { leaveType: 'Roster leave' };
          return;
        }

        const aiOff = (program.offDuty || []).find(od => od.staffId === s.id);
        if (aiOff) {
          matrix[s.id][program.day] = { leaveType: aiOff.type };
          return;
        }

        if (s.type === 'Local') {
          matrix[s.id][program.day] = { leaveType: 'Day off' };
        }
      });
    });
    return matrix;
  }, [sortedPrograms, staff, leaveRequests, incomingDuties, shifts, startDate]);

  const exportPDF = () => {
    if (totalAssignments === 0) return;
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const headerColor = [2, 6, 23];

    sortedPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22).text(`SkyOPS Station Handling Program`, 14, 20);
      doc.setFontSize(11).setTextColor(100, 100, 100).text(`${startDate} — ${endDate}`, 14, 28);
      doc.setFontSize(16).setTextColor(0, 0, 0).text(getDayLabel(program.day), 14, 42);

      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });

      const tableData = Object.entries(shiftsMap).map(([shiftId, group], i) => {
        const sh = getShiftById(shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION';
        const personnelStr = group.map(a => {
          const st = getStaffById(a.staffId);
          return `${st?.initials || 'GAP'} (${a.role})`;
        }).join(' | ');

        return [(i + 1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, `${group.length} / ${sh?.maxStaff || '0'}`, personnelStr];
      });

      autoTable(doc, {
        startY: 48,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC/MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 8, cellPadding: 4 },
        columnStyles: { 5: { cellWidth: 100 } }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14).text('ABSENCE AND LEAVES REGISTRY', 14, currentY);

      const registry = getFullRegistryForDay(program);
      const absenceData = [
        ['MANDATORY REST', registry['MANDATORY REST'].join(', ') || 'NONE'],
        ['DAYS OFF', registry['Day off'].join(', ') || 'NONE'],
        ['ROSTER LEAVE', registry['Roster leave'].join(', ') || 'NONE'],
        ['ANNUAL LEAVE', registry['Annual leave'].join(', ') || 'NONE'],
        ['SICK LEAVE', registry['Sick leave'].join(', ') || 'NONE'],
        ['LIEU LEAVE', registry['Lieu leave'].join(', ') || 'NONE'],
        ['AVAILABLE (NIL)', registry['NIL'].join(', ') || 'NONE']
      ];

      autoTable(doc, {
        startY: currentY + 5,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: absenceData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 10 },
        bodyStyles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } }
      });
    });

    doc.save(`SkyOPS_Station_Program_${startDate}.pdf`);
  };

  if (totalAssignments === 0) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto py-20 text-center">
        <h2 className="text-4xl font-black italic uppercase text-slate-900 leading-none">Handling Program</h2>
        <p className="text-slate-400 mt-4">Registry idle. Generate program to view operational assignments.</p>
      </div>
    );
  }

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
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl flex items-center gap-2">
            <Printer size={18} />
            <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Generate PDF</span>
          </button>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="sticky left-0 z-40 bg-slate-950 p-6 border-r border-white/10 text-[10px] font-black uppercase tracking-widest min-w-[200px]">Agent</th>
                  {sortedPrograms.map(p => (
                    <th key={p.day} className="p-6 text-center border-r border-white/5 min-w-[140px]">
                      <span className="block text-sm font-black italic tracking-tighter">{getDayLabel(p.day).split(' - ')[0].substring(0,3)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map(s => (
                  <tr key={s.id}>
                    <td className="sticky left-0 z-30 bg-white border-r border-slate-100 p-6 font-black uppercase text-[11px]">{s.initials}</td>
                    {sortedPrograms.map(p => {
                      const entry = matrixData[s.id]?.[p.day];
                      return (
                        <td key={p.day} className="p-2 border-r border-slate-50 text-center">
                          {entry ? (
                            entry.leaveType ? (
                              <div className={`p-3 rounded-2xl text-[7px] font-black uppercase italic ${entry.leaveType.includes('Rest') ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                                {entry.leaveType}
                              </div>
                            ) : (
                              <div className="p-3 rounded-2xl bg-slate-950 text-white text-[9px] font-black uppercase shadow-sm">
                                {entry.shift} | {entry.role}
                              </div>
                            )
                          ) : '-'}
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
            const registry = getFullRegistryForDay(program);
            const shiftsMap: Record<string, Assignment[]> = {};
            program.assignments.forEach(a => {
              if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
              shiftsMap[a.shiftId || ''].push(a);
            });

            return (
              <div key={program.day} className="bg-white rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 md:p-14">
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950 mb-10">{getDayLabel(program.day)}</h2>
                  <div className="overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-white">
                          <th className="p-5 text-[10px] font-black uppercase">PICKUP</th>
                          <th className="p-5 text-[10px] font-black uppercase">RELEASE</th>
                          <th className="p-5 text-[10px] font-black uppercase">FLIGHTS</th>
                          <th className="p-5 text-[10px] font-black uppercase">HC/MAX</th>
                          <th className="p-5 text-[10px] font-black uppercase">PERSONNEL & ASSIGNED ROLES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          return (
                            <tr key={idx} className="border-b border-slate-100 group">
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime || '--:--'}</td>
                              <td className="p-6 text-sm font-black italic">{sh?.endTime || '--:--'}</td>
                              <td className="p-6 text-xs font-bold uppercase">{sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION'}</td>
                              <td className="p-6 text-xs font-black">{group.length} / {sh?.maxStaff || '0'}</td>
                              <td className="p-6 text-[10px] font-bold uppercase">
                                <div className="flex flex-wrap gap-2">
                                  {group.map((a: any, ai: number) => {
                                      const st = getStaffById(a.staffId);
                                      return (
                                        <span key={ai} className={`px-2 py-1 rounded-lg ${!st ? 'bg-rose-100 text-rose-600 border border-rose-200 font-black' : 'bg-slate-50 text-slate-700'}`}>
                                          {st?.initials || 'GAP'} ({a.role})
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
                          {[
                            { label: 'MANDATORY REST', type: 'MANDATORY REST', color: 'text-amber-600 bg-amber-50/30' },
                            { label: 'DAYS OFF', type: 'Day off' },
                            { label: 'ROSTER LEAVE', type: 'Roster leave' },
                            { label: 'ANNUAL LEAVE', type: 'Annual leave' },
                            { label: 'SICK LEAVE', type: 'Sick leave' },
                            { label: 'AVAILABLE (NIL)', type: 'NIL' },
                          ].map((cat, i) => (
                            <tr key={i}>
                              <td className={`p-5 text-[10px] font-black uppercase ${cat.color || 'text-slate-900 bg-slate-50/30'}`}>{cat.label}</td>
                              <td className={`p-5 text-[11px] font-bold ${cat.color ? 'text-amber-700' : 'text-slate-700'}`}>{registry[cat.type]?.join(', ') || 'NONE'}</td>
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