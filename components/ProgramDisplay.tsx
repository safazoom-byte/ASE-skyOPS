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

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const formatRoleLabel = (role: string) => {
    const r = role.toLowerCase();
    if (r === 'shift leader' || r === 'sl') return 'sl';
    if (r === 'operations' || r === 'ops') return 'ops';
    if (r === 'ramp' || r === 'rmp') return 'rmp';
    if (r === 'load control' || r === 'lc') return 'lc';
    if (r === 'lost and found' || r === 'lf') return 'lf';
    if (r === 'general') return ''; 
    return role;
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
      if (assignedStaffIds.has(s.id)) return;

      const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
      if (restLock) {
        registry['RESTING (POST-DUTY)'].push(`${s.initials} (until ${restLock.shiftEndTime})`);
        return;
      }

      const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
      if (leave) {
        const typeKey = leave.type.toUpperCase();
        if (registry[typeKey]) registry[typeKey].push(s.initials);
        else registry['ANNUAL LEAVE'].push(s.initials);
        return;
      }

      if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
        if (dateStr < s.workFromDate || dateStr > s.workToDate) {
          registry['ROSTER LEAVE'].push(s.initials);
          return;
        }
      }

      const aiOff = (program.offDuty || []).find(od => od.staffId === s.id);
      if (aiOff) {
        const typeKey = aiOff.type.toUpperCase();
        if (registry[typeKey]) {
          registry[typeKey].push(s.initials);
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
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22).text(`SkyOPS Station Handling Program`, 14, 20);
      doc.setFontSize(11).setTextColor(100, 100, 100).text(`Target Period: ${startDate} to ${endDate}`, 14, 28);
      doc.setFontSize(16).setTextColor(0, 0, 0).text(getDayLabel(program), 14, 42);

      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });

      const tableData = Object.entries(shiftsMap).map(([shiftId, group], i) => {
        const sh = getShiftById(shiftId);
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION';
        
        // Combine roles for the same staff member if they are assigned multiple roles
        const staffAssignments: Record<string, string[]> = {};
        group.forEach(a => {
          if (!staffAssignments[a.staffId]) staffAssignments[a.staffId] = [];
          const label = formatRoleLabel(a.role);
          if (label) staffAssignments[a.staffId].push(label);
        });

        const personnelStr = Object.entries(staffAssignments).map(([sid, roles]) => {
          const st = getStaffById(sid);
          const rolesStr = roles.length > 0 ? ` (${roles.join('+')})` : '';
          return `${st?.initials || 'GAP'}${rolesStr}`;
        }).join(' | ');

        // Unique headcount for the HC label
        const uniqueHeadcount = Object.keys(staffAssignments).length;

        return [(i + 1).toString(), sh?.pickupTime || '--:--', sh?.endTime || '--:--', fls, `${uniqueHeadcount} / ${sh?.minStaff || '0'}`, personnelStr];
      });

      autoTable(doc, {
        startY: 48,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MIN', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 8, cellPadding: 4 },
        columnStyles: { 5: { cellWidth: 100 } }
      });

      const currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14).text('ABSENCE AND REST REGISTRY', 14, currentY);

      const registry = getFullRegistryForDay(program);
      const absenceData = [
        ['RESTING (POST-DUTY)', registry['RESTING (POST-DUTY)'].join(', ') || 'NONE'],
        ['DAYS OFF', registry['DAYS OFF'].join(', ') || 'NONE'],
        ['ROSTER LEAVE', registry['ROSTER LEAVE'].join(', ') || 'NONE'],
        ['ANNUAL LEAVE', registry['ANNUAL LEAVE'].join(', ') || 'NONE'],
        ['STANDBY (RESERVE)', registry['STANDBY (RESERVE)'].join(', ') || 'NONE']
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

  if (filteredPrograms.length === 0) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto py-20 text-center">
        <h2 className="text-4xl font-black italic uppercase text-slate-900 leading-none">Handling Program</h2>
        <p className="text-slate-400 mt-4">Registry idle or out of filter range. Generate program for {startDate} to see results.</p>
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
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-950 mb-10">{getDayLabel(program)}</h2>
                  <div className="overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-white">
                          <th className="p-5 text-[10px] font-black uppercase">PICKUP</th>
                          <th className="p-5 text-[10px] font-black uppercase">RELEASE</th>
                          <th className="p-5 text-[10px] font-black uppercase">FLIGHTS</th>
                          <th className="p-5 text-[10px] font-black uppercase">HC / MIN</th>
                          <th className="p-5 text-[10px] font-black uppercase">PERSONNEL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(shiftsMap).map(([shiftId, group], idx) => {
                          const sh = getShiftById(shiftId);
                          
                          // Group roles per staff member
                          const staffAssignments: Record<string, string[]> = {};
                          group.forEach(a => {
                            if (!staffAssignments[a.staffId]) staffAssignments[a.staffId] = [];
                            const label = formatRoleLabel(a.role);
                            if (label) staffAssignments[a.staffId].push(label);
                          });

                          const uniqueHeadcount = Object.keys(staffAssignments).length;

                          return (
                            <tr key={idx} className="border-b border-slate-100 group">
                              <td className="p-6 text-sm font-black italic">{sh?.pickupTime || '--:--'}</td>
                              <td className="p-6 text-sm font-black italic">{sh?.endTime || '--:--'}</td>
                              <td className="p-6 text-xs font-bold uppercase">{sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'STATION'}</td>
                              <td className="p-6 text-xs font-black">
                                <span className={uniqueHeadcount < (sh?.minStaff || 0) ? 'text-rose-600' : 'text-emerald-600'}>
                                  {uniqueHeadcount} / {sh?.minStaff || '0'}
                                </span>
                              </td>
                              <td className="p-6 text-[10px] font-bold uppercase">
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(staffAssignments).map(([sid, roles], ai) => {
                                      const st = getStaffById(sid);
                                      const rolesStr = roles.length > 0 ? ` (${roles.join('+')})` : '';
                                      return (
                                        <span key={ai} className={`px-2 py-1 rounded-lg ${sid === 'GAP' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-50 text-slate-700'}`}>
                                          {st?.initials || 'GAP'}{rolesStr}
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
        </div>
      )}
    </div>
  );
};