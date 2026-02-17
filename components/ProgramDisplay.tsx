import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileText, 
  Plane, 
  ShieldCheck, 
  CalendarDays, 
  List,
  Activity,
  Users,
  CheckCircle2,
  Calendar,
  Coffee,
  Printer,
  ChevronRight,
  UserX,
  Moon,
  BarChart3,
  Check,
  Zap,
  Loader2,
  Clock,
  X,
  AlertTriangle,
  Hammer
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
  minRestHours?: number;
}

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests = [], 
  incomingDuties = [], 
  startDate, 
  endDate, 
  onUpdatePrograms, 
  stationHealth = 100, 
  alerts = [], 
  minRestHours = 12 
}) => {
  const [isRepairing, setIsRepairing] = useState(false);

  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs)) return [];
    if (!startDate || !endDate) return programs;
    const results = programs.filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate);
    results.sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
    // Deduplicate by date
    const seen = new Set<string>();
    return results.filter(p => {
      const d = p.dateString!;
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }, [programs, startDate, endDate]);

  const prevDate = useMemo(() => {
     if (!startDate) return '';
     const d = new Date(startDate);
     d.setDate(d.getDate() - 1);
     return d.toISOString().split('T')[0];
  }, [startDate]);

  const incomingGroups = useMemo(() => {
    if (!prevDate || !incomingDuties) return [];
    const duties = incomingDuties.filter(d => d.date === prevDate);
    if (duties.length === 0) return [];
    
    const grouped: Record<string, IncomingDuty[]> = {};
    duties.forEach(d => {
      const t = d.shiftEndTime || '00:00';
      if(!grouped[t]) grouped[t] = [];
      grouped[t].push(d);
    });

    return Object.entries(grouped).sort(([t1], [t2]) => t1.localeCompare(t2));
  }, [incomingDuties, prevDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const calculateAvailableTime = (endTime: string) => {
    const [h, m] = endTime.split(':').map(Number);
    let availH = h + minRestHours;
    const availM = m;
    let suffix = '';
    if (availH >= 24) {
        availH -= 24;
        suffix = ' (+1)';
    }
    return `${String(availH).padStart(2, '0')}:${String(availM).padStart(2, '0')}${suffix}`;
  };

  const getAbsenceStatus = (s: Staff, dateStr: string) => {
     const leave = leaveRequests.find(l => l.staffId === s.id && dateStr >= l.startDate && dateStr <= l.endDate);
     if (leave) return leave.type.toUpperCase();

     if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
         if (dateStr < s.workFromDate || dateStr > s.workToDate) return 'ROSTER LEAVE';
     }
     
     if (s.type === 'Local') return 'DAYS OFF';
     
     return 'STANDBY';
  };

  const getFormatDate = (dateStr?: string) => {
    if (!dateStr) return 'Invalid Date';
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).toUpperCase().replace(',', ' -');
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text(`SkyOPS Station Handling Program`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 22);

    let yPos = 30;

    // Incoming Operations
    if (incomingGroups.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(217, 119, 6); // Amber
      doc.text(`INCOMING OPERATIONS - ${prevDate}`, 14, yPos);
      yPos += 5;
      
      const body = incomingGroups.map(([time, duties], idx) => [
         idx + 1,
         time,
         calculateAvailableTime(time),
         duties.length,
         duties.map(d => getStaffById(d.staffId)?.initials).join(' | ')
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['S/N', 'DUTY END', 'AVAILABLE', 'HC', 'PERSONNEL']],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [217, 119, 6] },
        styles: { fontSize: 8 }
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    filteredPrograms.forEach((p) => {
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(getFormatDate(p.dateString), 14, yPos);
      yPos += 5;

      // Group assignments by shift
      const dayShifts = shifts.filter(s => s.pickupDate === p.dateString);
      const rows = dayShifts.map((s, idx) => {
        const assigned = p.assignments.filter(a => a.shiftId === s.id);
        const flightCodes = (s.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
        const personnelStr = assigned.map(a => {
           const st = getStaffById(a.staffId);
           return `${st?.initials} (${a.role})`;
        }).join(' | ');

        return [
          idx + 1,
          s.pickupTime,
          s.endTime,
          flightCodes,
          `${assigned.length} / ${s.maxStaff}`,
          personnelStr
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [2, 6, 23] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
      if (yPos > 180) { doc.addPage(); yPos = 20; }
    });

    doc.save(`SkyOPS_Program_${startDate}.pdf`);
  };

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl md:text-3xl font-black italic uppercase text-slate-900 tracking-tighter">SkyOPS Station Handling Program</h2>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
            <CalendarDays size={14} /> Target Period: {startDate} <ChevronRight size={10} /> {endDate}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={generatePDF} className="px-6 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase italic text-xs tracking-widest hover:bg-blue-600 transition-all flex items-center gap-3 shadow-xl">
             <Printer size={16} /> Export PDF
          </button>
        </div>
      </div>

      {stationHealth < 100 && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] flex items-center gap-4">
           <AlertTriangle size={24} className="text-rose-500" />
           <div>
              <h4 className="text-sm font-black text-rose-600 uppercase italic">Station Integrity Alert</h4>
              <p className="text-xs text-rose-500">Coverage gaps detected. Station health at {stationHealth}%.</p>
           </div>
        </div>
      )}

      {/* Daily Programs */}
      {filteredPrograms.length === 0 ? (
         <div className="py-24 text-center bg-slate-100 rounded-[3rem] border-2 border-dashed border-slate-200">
            <CalendarDays size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-xl font-black text-slate-400 uppercase italic">No Program Data</h3>
         </div>
      ) : (
        filteredPrograms.map((program, index) => {
          const dateTitle = getFormatDate(program.dateString);
          const dayShifts = shifts.filter(s => s.pickupDate === program.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
          
          // Calculate stats for footer
          const workingStaffIds = new Set(program.assignments.map(a => a.staffId));
          const absentStaff = staff.filter(s => !workingStaffIds.has(s.id));
          
          const groupedAbsence: Record<string, Staff[]> = {};
          absentStaff.forEach(s => {
             const status = getAbsenceStatus(s, program.dateString || '');
             // FILTER: Do not show "RESTING" as requested
             if (!status.includes('RESTING')) {
                 if (!groupedAbsence[status]) groupedAbsence[status] = [];
                 groupedAbsence[status].push(s);
             }
          });

          return (
            <div key={program.day} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden break-inside-avoid">
               <div className="bg-slate-50 p-6 md:p-8 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">{dateTitle}</h3>
                  <span className="px-4 py-2 bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600">{dayShifts.length} Active Shifts</span>
               </div>

               <div className="p-6 md:p-8">
                  {/* Incoming Operations nested inside Day 1 (index === 0) */}
                  {index === 0 && incomingGroups.length > 0 && (
                    <div className="mb-8 bg-yellow-50 rounded-2xl border border-yellow-200 overflow-hidden">
                        <div className="bg-yellow-100/50 p-4 border-b border-yellow-200 flex items-center gap-3">
                           <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center text-yellow-900 shadow-sm">
                              <Moon size={16} />
                           </div>
                           <div>
                              <h4 className="text-sm font-black uppercase italic text-yellow-900 leading-none">Incoming Operations (Day -1)</h4>
                              <p className="text-[9px] font-bold text-yellow-700 uppercase tracking-widest mt-0.5">{prevDate}</p>
                           </div>
                        </div>
                        <div className="p-4 overflow-x-auto">
                           <table className="w-full text-left">
                              <thead>
                                 <tr className="border-b border-yellow-200 text-[9px] font-black text-yellow-800 uppercase tracking-widest">
                                    <th className="p-2 w-16">S/N</th>
                                    <th className="p-2 w-32">Duty End</th>
                                    <th className="p-2 w-32">Available</th>
                                    <th className="p-2 w-24">HC</th>
                                    <th className="p-2">Personnel</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-yellow-100">
                                 {incomingGroups.map(([endTime, group], idx) => (
                                    <tr key={endTime} className="hover:bg-yellow-100/50 transition-colors">
                                       <td className="p-2 text-xs font-bold text-yellow-700">{idx + 1}</td>
                                       <td className="p-2 text-sm font-black text-slate-900">{endTime}</td>
                                       <td className="p-2 text-sm font-black text-emerald-600 flex items-center gap-2">
                                          <Zap size={12} /> {calculateAvailableTime(endTime)}
                                       </td>
                                       <td className="p-2 text-sm font-bold text-slate-600">{group.length} / {group.length}</td>
                                       <td className="p-2">
                                          <div className="flex flex-wrap gap-1">
                                             {group.map(d => {
                                                const st = getStaffById(d.staffId);
                                                return (
                                                   <span key={d.id} className="px-1.5 py-0.5 bg-white border border-yellow-200 text-yellow-900 rounded-md text-[9px] font-black uppercase">
                                                      {st?.initials || '???'}
                                                   </span>
                                                )
                                             })}
                                          </div>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-950">
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest w-16">S/N</th>
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest w-24">Pickup</th>
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest w-24">Release</th>
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest w-32">Flights</th>
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest w-24">HC / Max</th>
                           <th className="p-4 text-[9px] font-black text-slate-950 uppercase tracking-widest">Personnel & Assigned Roles</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {dayShifts.map((s, idx) => {
                           const assigned = program.assignments.filter(a => a.shiftId === s.id);
                           const flightCodes = (s.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
                           const isFull = assigned.length >= s.maxStaff;
                           const isUnder = assigned.length < s.minStaff;
                           
                           return (
                             <tr key={s.id} className="group hover:bg-slate-50/80 transition-colors">
                                <td className="p-4 text-xs font-bold text-slate-400">{idx + 1}</td>
                                <td className="p-4 text-sm font-black text-slate-900">{s.pickupTime}</td>
                                <td className="p-4 text-sm font-black text-slate-900">{s.endTime}</td>
                                <td className="p-4 text-xs font-bold text-slate-600 uppercase">{flightCodes}</td>
                                <td className="p-4">
                                   <div className={`text-xs font-black ${isUnder ? 'text-rose-500' : isFull ? 'text-emerald-500' : 'text-slate-900'}`}>
                                      {assigned.length} / {s.maxStaff}
                                   </div>
                                </td>
                                <td className="p-4">
                                   <div className="flex flex-wrap gap-2">
                                      {assigned.length === 0 && <span className="text-[10px] italic text-rose-400 font-bold uppercase">Unassigned</span>}
                                      {assigned.map(a => {
                                        const st = getStaffById(a.staffId);
                                        // Standardize Role Display
                                        let roleClass = 'bg-slate-100 text-slate-700';
                                        if (a.role.includes('SL') || a.role.includes('Leader')) roleClass = 'bg-slate-900 text-white';
                                        if (a.role.includes('LC') || a.role.includes('Load')) roleClass = 'bg-indigo-100 text-indigo-700';
                                        
                                        return (
                                          <div key={a.id} className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 ${roleClass}`}>
                                             <span>{st?.initials}</span>
                                             <span className="opacity-50">|</span>
                                             <span>{a.role}</span>
                                          </div>
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
               </div>

               {/* Absence Registry Footer - Cleaned Up */}
               <div className="bg-slate-50/50 p-6 md:p-8 border-t border-slate-100">
                  <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <UserX size={14} className="text-slate-300"/> Absence & Rest Registry
                  </h5>
                  <div className="flex flex-wrap gap-4">
                      {Object.entries(groupedAbsence).map(([status, members]) => (
                          <div key={status} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-[150px]">
                              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1 flex justify-between">
                                  {status} <span className="text-slate-900">{members.length}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                  {members.map(m => (
                                      <span key={m.id} className="text-[10px] font-bold text-slate-600 uppercase bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                          {m.initials}
                                      </span>
                                  ))}
                              </div>
                          </div>
                      ))}
                      {Object.keys(groupedAbsence).length === 0 && (
                          <span className="text-[10px] italic text-slate-400">All personnel active or accounted for.</span>
                      )}
                  </div>
               </div>
            </div>
          );
        })
      )}
    </div>
  );
};