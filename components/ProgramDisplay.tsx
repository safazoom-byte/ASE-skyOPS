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

  // Automatic calculation for "Roster leave" (staff outside their contract dates)
  // vs Manual Leave (Day off, Annual, etc.)
  const getLeaveForDay = (dateStr: string, type: LeaveType) => {
    // 1. Calculate Roster leave automatically
    if (type === 'Roster leave') {
      return staff.filter(s => {
        if (!s.workFromDate || !s.workToDate) return false;
        const isOutOfDate = dateStr < s.workFromDate || dateStr > s.workToDate;
        return isOutOfDate;
      }).map(s => s.initials).filter(Boolean).join(', ') || 'NONE';
    }

    // 2. Handle manual leaves from Registry
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
        // Check manual leave
        const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
        if (leave) {
          matrix[s.id][dayIdx] = { shift: 'LEAVE', role: leave.type, leaveType: leave.type };
          return;
        }

        // Check automatic Roster leave
        if (s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate)) {
           matrix[s.id][dayIdx] = { shift: 'OUT', role: 'Roster leave', leaveType: 'Roster leave' };
           return;
        }
      });

      (prog.assignments || []).forEach(a => {
        const staffId = a.staffId || 'GAP';
        if (!matrix[staffId]) matrix[staffId] = {};
        if (staffId !== 'GAP' && matrix[staffId][dayIdx]?.shift === 'LEAVE') return;
        if (staffId !== 'GAP' && matrix[staffId][dayIdx]?.shift === 'OUT') return;

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
    const headerColor = [2, 6, 23];

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
      });

      const currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14).text('ABSENCE AND LEAVES REGISTRY', 14, currentY);

      const dateStr = getDayISODate(program.day);
      const absenceData = [
        ['Day off', getLeaveForDay(dateStr, 'Day off')],
        ['Annual leave', getLeaveForDay(dateStr, 'Annual leave')],
        ['Lieu leave', getLeaveForDay(dateStr, 'Lieu leave')],
        ['Sick leave', getLeaveForDay(dateStr, 'Sick leave')],
        ['Roster leave (Out of Date)', getLeaveForDay(dateStr, 'Roster leave')],
        ['AVAILABLE (NIL)', getLeaveForDay(dateStr, 'NIL')]
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
                              <div className="p-3 rounded-2xl bg-slate-50 text-[7px] font-black uppercase">{entry.leaveType}</div>
                            ) : (
                              <div className="p-3 rounded-2xl bg-slate-950 text-white text-[9px] font-black uppercase">
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
            const dateStr = getDayISODate(program.day);
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
                          <th className="p-5 text-[10px] font-black uppercase">PERSONNEL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(program.assignments.reduce((acc: any, curr) => {
                          if (!acc[curr.shiftId]) acc[curr.shiftId] = [];
                          acc[curr.shiftId].push(curr);
                          return acc;
                        }, {})).map((group: any, idx) => {
                          const sh = getShiftById(group[0].shiftId);
                          return (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime || '--:--'}</td>
                              <td className="p-6 text-sm font-black italic">{sh?.endTime || '--:--'}</td>
                              <td className="p-6 text-xs font-bold uppercase">{sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION'}</td>
                              <td className="p-6 text-xs font-black">{group.length} / {sh?.maxStaff || '0'}</td>
                              <td className="p-6 text-[10px] font-bold uppercase">{group.map((a: any) => `${getStaffById(a.staffId)?.initials || 'GAP'} ${a.role}`).join(' | ')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-16 space-y-6">
                    <h4 className="text-xl font-black italic uppercase text-slate-900">Absence and Leaves Registry</h4>
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
                            { label: 'Day off', type: 'Day off' as LeaveType },
                            { label: 'Annual leave', type: 'Annual leave' as LeaveType },
                            { label: 'Lieu leave', type: 'Lieu leave' as LeaveType },
                            { label: 'Sick leave', type: 'Sick leave' as LeaveType },
                            { label: 'Roster leave (Out of Date)', type: 'Roster leave' as LeaveType },
                            { label: 'AVAILABLE (NIL)', type: 'NIL' as LeaveType },
                          ].map((cat, i) => (
                            <tr key={i}>
                              <td className="p-5 text-[10px] font-black text-slate-900 uppercase bg-slate-50/30">{cat.label}</td>
                              <td className="p-5 text-[11px] font-bold text-slate-700">{getLeaveForDay(dateStr, cat.type)}</td>
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