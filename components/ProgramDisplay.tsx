
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
  SearchX,
  Target,
  BarChart3,
  Cpu,
  Lock,
  Calendar,
  AlertCircle,
  Zap,
  Coffee
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
  const [viewMode, setViewMode] = useState<'detailed' | 'matrix'>('matrix');
  
  const sortedPrograms = useMemo(() => {
    return Array.isArray(programs) ? [...programs].sort((a, b) => Number(a.day || 0) - Number(b.day || 0)) : [];
  }, [programs]);

  const totalAssignments = useMemo(() => {
    return sortedPrograms.reduce((sum, p) => sum + (p.assignments?.length || 0), 0);
  }, [sortedPrograms]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const getDayName = (dayIndex: any) => {
    const d = new Date(startDate || '');
    if (isNaN(d.getTime())) return `Day ${dayIndex + 1}`;
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const getDayDate = (dayIndex: any) => {
    const d = new Date(startDate || '');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  };

  const getDayISODate = (dayIndex: any) => {
    const d = new Date(startDate || '');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toISOString().split('T')[0];
  }

  const checkLeave = (staffId: string, dateStr: string) => {
    return leaveRequests.find(req => 
      req.staffId === staffId && dateStr >= req.startDate && dateStr <= req.endDate
    );
  };

  const matrixData = useMemo(() => {
    const matrix: Record<string, Record<number, { shift: string; role: string; flight?: string; isGap?: boolean; leaveType?: string }>> = {};
    staff.forEach(s => { matrix[s.id] = {}; });
    
    // Add GAP handling
    matrix['GAP'] = {};

    sortedPrograms.forEach(prog => {
      const dayIdx = prog.day;
      const dateStr = getDayISODate(dayIdx);

      // Fill in leave for all staff first
      staff.forEach(s => {
        const leave = checkLeave(s.id, dateStr);
        if (leave) {
          matrix[s.id][dayIdx] = {
            shift: 'LEAVE',
            role: leave.type,
            leaveType: leave.type
          };
        }
      });

      // Overwrite with assignments if any (though AI should prevent this conflict)
      (prog.assignments || []).forEach(a => {
        const staffId = a.staffId || 'GAP';
        if (!matrix[staffId]) matrix[staffId] = {};
        
        // Don't overwrite explicit leave unless it's GAP
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
    doc.setFontSize(22).text(`SkyOPS Station Handling Plan`, 14, 20);
    doc.setFontSize(10).text(`Reporting Period: ${startDate} to ${endDate}`, 14, 28);
    
    sortedPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(16).text(`${getDayName(program.day)} - ${getDayDate(program.day)}`, 14, 40);
      const data = program.assignments.map(a => [
        getShiftById(a.shiftId)?.pickupTime || '--:--',
        getStaffById(a.staffId)?.initials || 'GAP',
        a.role,
        getFlightById(a.flightId)?.flightNumber || 'STATION'
      ]);
      autoTable(doc, { startY: 45, head: [['TIME', 'AGENT', 'ROLE', 'FLIGHT']], body: data, theme: 'grid' });
    });
    doc.save(`SkyOPS_Program_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (totalAssignments === 0) {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 max-w-6xl mx-auto">
        <div className="bg-white p-12 md:p-16 rounded-[4rem] border border-slate-100 shadow-sm text-center space-y-8 flex flex-col items-center">
           <div className="w-20 h-20 bg-slate-950 rounded-[2rem] flex items-center justify-center shadow-2xl text-white">
             <Calendar size={32} />
           </div>
           <div>
             <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Handling Program</h2>
             <p className="text-slate-400 text-xs md:text-sm font-black uppercase tracking-[0.3em] mt-3">{startDate} — {endDate}</p>
           </div>
           <p className="text-slate-400 max-w-sm">No roster detected. Engage the Ops Engine from the Dashboard to generate optimized assignments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-12 pb-32 animate-in fade-in duration-700">
      {/* Station Solutions Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-slate-950 p-8 rounded-[3rem] text-white flex flex-col justify-center items-center text-center">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2">Station Readiness</p>
            <h4 className="text-5xl font-black italic tracking-tighter text-blue-500">{stationHealth}%</h4>
            <div className="w-full h-1 bg-white/5 rounded-full mt-6 overflow-hidden">
               <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${stationHealth}%` }}></div>
            </div>
        </div>
        
        <div className="lg:col-span-3 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6 flex items-center gap-3">
             <Activity size={16} className="text-blue-600" /> Operational Integrity Log
           </h4>
           <div className="space-y-3">
              {alerts.length > 0 ? (
                alerts.map((alert, i) => (
                  <div key={i} className={`p-4 rounded-2xl flex items-center gap-4 border ${alert.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                    <AlertCircle size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{alert.message}</span>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center gap-4">
                  <CheckCircle2 size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest italic">All constraints satisfied. Station is safe for operations.</span>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-slate-950 rounded-[2rem] flex items-center justify-center text-white shadow-2xl"><CalendarDays size={28} /></div>
           <div>
             <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Handling Program</h2>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Active Registry Matrix</p>
           </div>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200">
             <button onClick={() => setViewMode('matrix')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <LayoutGrid size={14}/> Matrix
             </button>
             <button onClick={() => setViewMode('detailed')} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
               <List size={14}/> List
             </button>
          </div>
          <button onClick={exportPDF} className="p-4 bg-slate-950 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-lg active:scale-95"><FileText size={18} /></button>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-xl overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="sticky left-0 z-40 bg-slate-950 p-6 border-r border-white/10 text-[10px] font-black uppercase tracking-widest min-w-[200px]">Agent</th>
                  {sortedPrograms.map(p => (
                    <th key={p.day} className="p-6 text-center border-r border-white/5 min-w-[160px]">
                      <span className="block text-sm font-black italic tracking-tighter">{getDayName(p.day)}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{getDayDate(p.day)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Highlight Gaps first */}
                {Object.keys(matrixData).includes('GAP') && Object.keys(matrixData['GAP']).length > 0 && (
                  <tr className="bg-rose-50/30">
                    <td className="sticky left-0 z-30 bg-rose-50 border-r border-rose-100 p-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center text-white font-black italic text-sm animate-pulse"><AlertTriangle size={16} /></div>
                          <div>
                            <p className="text-[11px] font-black text-rose-900 leading-none uppercase">Critical Gaps</p>
                            <p className="text-[7px] font-black text-rose-400 uppercase tracking-widest mt-1">Action Required</p>
                          </div>
                       </div>
                    </td>
                    {sortedPrograms.map(p => {
                      const entry = matrixData['GAP']?.[p.day];
                      return (
                        <td key={p.day} className="p-3 border-r border-rose-50">
                          {entry && (
                            <div className="p-4 rounded-2xl bg-rose-600 text-white shadow-xl shadow-rose-600/20 flex flex-col items-center justify-center space-y-1 h-full animate-in zoom-in-95">
                               <span className="text-[10px] font-black tracking-tighter">{entry.shift}</span>
                               <span className="text-[7px] font-black uppercase text-white/70 tracking-widest text-center">{entry.role}</span>
                               <span className="mt-2 text-[7px] font-black uppercase bg-white/20 px-2 py-0.5 rounded">MISSING AGENT</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                
                {staff.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="sticky left-0 z-30 bg-white border-r border-slate-100 p-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black italic text-sm">{s.initials}</div>
                          <div className="truncate">
                            <p className="text-[11px] font-black text-slate-900 leading-none truncate">{s.name}</p>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">P:{s.powerRate}%</p>
                          </div>
                       </div>
                    </td>
                    {sortedPrograms.map(p => {
                      const entry = matrixData[s.id]?.[p.day];
                      return (
                        <td key={p.day} className="p-3 border-r border-slate-50">
                          {entry ? (
                            entry.leaveType ? (
                              <div className={`p-4 rounded-2xl border border-dashed flex flex-col items-center justify-center space-y-1 h-full opacity-60 bg-slate-50 border-slate-300 text-slate-500`}>
                                <Coffee size={14} className="mb-1" />
                                <span className="text-[8px] font-black tracking-tighter uppercase">{entry.leaveType.split(' ')[0]}</span>
                              </div>
                            ) : (
                              <div className={`p-4 rounded-2xl shadow-lg border border-white/10 flex flex-col items-center justify-center space-y-1 bg-slate-950 text-white`}>
                                <span className="text-[10px] font-black tracking-tighter">{entry.shift}</span>
                                <span className="text-[7px] font-black uppercase text-white/50 tracking-widest">{entry.role}</span>
                                {entry.flight && <span className="mt-1 px-2 py-0.5 bg-blue-600 rounded text-[7px] font-black uppercase">{entry.flight}</span>}
                              </div>
                            )
                          ) : (
                            <div className="h-full flex items-center justify-center opacity-10">
                              <span className="w-1.5 h-1.5 bg-slate-900 rounded-full"></span>
                            </div>
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {sortedPrograms.map(program => (
             <div key={program.day} className="bg-white p-8 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                   <h2 className="text-9xl font-black italic text-slate-900 tracking-tighter">{program.day + 1}</h2>
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-3xl font-black italic uppercase text-slate-900 mb-2">{getDayName(program.day)}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">{getDayDate(program.day)}</p>
                  
                  <div className="space-y-4">
                     {program.assignments.map(a => {
                        const shift = getShiftById(a.shiftId);
                        const staffMember = getStaffById(a.staffId);
                        const flight = getFlightById(a.flightId);
                        
                        return (
                           <div key={a.id} className="p-6 bg-slate-50 rounded-3xl flex items-center justify-between border border-slate-100 group hover:border-blue-200 transition-colors">
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-lg shadow-sm ${a.staffId === 'GAP' ? 'bg-rose-500 text-white' : 'bg-white text-slate-900'}`}>
                                    {staffMember?.initials || '!'}
                                 </div>
                                 <div>
                                    <p className="text-xs font-black text-slate-900 uppercase">{staffMember?.name || 'UNASSIGNED SLOT'}</p>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                       <span className="text-blue-500">{shift?.pickupTime} - {shift?.endTime}</span> 
                                       <span>•</span> 
                                       {a.role}
                                    </p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-xl font-black italic text-slate-900">{flight?.flightNumber || 'STN'}</p>
                                 <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Service</p>
                              </div>
                           </div>
                        );
                     })}
                     {program.assignments.length === 0 && (
                        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                           <span className="text-[10px] font-black text-slate-300 uppercase italic">No Operations Scheduled</span>
                        </div>
                     )}
                  </div>
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
};
