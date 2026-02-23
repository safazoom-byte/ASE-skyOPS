import React, { useState, useEffect } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Skill, ProgramVersion } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileDown, 
  CalendarDays, 
  Users, 
  Plane, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  MapPin,
  Printer,
  Clock,
  RotateCcw,
  Save,
  History,
  Trash2,
  Eye
} from 'lucide-react';
import { DAYS_OF_WEEK_FULL, AVAILABLE_SKILLS } from '../constants';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests: LeaveRequest[];
  incomingDuties: IncomingDuty[];
  startDate: string;
  endDate: string;
  stationHealth: number;
  alerts: { type: 'danger' | 'warning', message: string }[];
  minRestHours: number;
  onUpdatePrograms: (p: DailyProgram[]) => void;
  onRestoreVersion: (v: ProgramVersion) => void;
}

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests, 
  incomingDuties,
  startDate, 
  endDate,
  stationHealth,
  minRestHours,
  onUpdatePrograms,
  onRestoreVersion
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [versions, setVersions] = useState<ProgramVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('skyops_program_versions');
    if (saved) {
      try {
        setVersions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load versions", e);
      }
    }
  }, []);

  const saveVersion = () => {
    const name = prompt("Enter a name for this version (e.g., 'Draft 1', 'Final Approval'):", `Version ${versions.length + 1}`);
    if (!name) return;

    const newVersion: ProgramVersion = {
      id: Math.random().toString(36).substr(2, 9),
      versionNumber: versions.length + 1,
      name,
      createdAt: new Date().toISOString(),
      periodStart: startDate,
      periodEnd: endDate,
      programs: JSON.parse(JSON.stringify(programs)),
      stationHealth,
      isAutoSave: false
    };

    const updatedVersions = [newVersion, ...versions];
    setVersions(updatedVersions);
    localStorage.setItem('skyops_program_versions', JSON.stringify(updatedVersions));
  };

  const deleteVersion = (id: string) => {
    if (!confirm("Are you sure you want to delete this version?")) return;
    const updated = versions.filter(v => v.id !== id);
    setVersions(updated);
    localStorage.setItem('skyops_program_versions', JSON.stringify(updated));
  };

  const restoreVersion = (v: ProgramVersion) => {
    if (!confirm(`Restore version "${v.name}"? Current unsaved changes will be lost.`)) return;
    onRestoreVersion(v);
    setShowHistory(false);
  };

  const getStaff = (id: string) => staff.find(s => s.id === id);
  const getFlight = (id: string) => flights.find(f => f.id === id);
  const getShift = (id: string) => shifts.find(s => s.id === id);

  const activePrograms = programs.filter(p => {
        if (!p.dateString) return false;
        return p.dateString >= startDate && p.dateString <= endDate;
  }).sort((a,b) => (a.dateString || '').localeCompare(b.dateString || ''));

  const totalAssignments = activePrograms.reduce((acc, p) => acc + p.assignments.length, 0);
  const isFailedGeneration = activePrograms.length > 0 && totalAssignments === 0;

  const calculateRestHours = (staffId: string, currentShiftStart: Date): number | null => {
    let lastEndTime: Date | null = null;
    const staffIncoming = incomingDuties.filter(d => d.staffId === staffId);
    staffIncoming.forEach(d => {
        const dt = new Date(`${d.date}T${d.shiftEndTime}`);
        if (dt < currentShiftStart && (!lastEndTime || dt > lastEndTime)) {
            lastEndTime = dt;
        }
    });
    programs.forEach(p => {
        p.assignments.filter(a => a.staffId === staffId).forEach(a => {
            const s = getShift(a.shiftId || '');
            if (s) {
               const pDate = new Date(p.dateString || startDate);
               const [sh, sm] = s.endTime.split(':').map(Number);
               const [ph, pm] = s.pickupTime.split(':').map(Number);
               const endDt = new Date(pDate);
               endDt.setHours(sh, sm, 0, 0);
               if (sh < ph) endDt.setDate(endDt.getDate() + 1);
               if (endDt < currentShiftStart && (!lastEndTime || endDt > lastEndTime)) {
                   lastEndTime = endDt;
               }
            }
        });
    });
    if (!lastEndTime) return null;
    const diffMs = currentShiftStart.getTime() - (lastEndTime as Date).getTime();
    return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
  };

  const generateFullReport = () => {
    // Function body removed to reduce size. Will be added back.
  };

  const handleDragStart = (e: React.DragEvent, staffId: string, currentShiftId: string, date: string, role: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ staffId, currentShiftId, date, role }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetShiftId: string, targetDate: string) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    try {
      const { staffId, currentShiftId, date, role } = JSON.parse(data);
      if (date !== targetDate) return;
      const newPrograms = [...programs];
      const prog = newPrograms.find(p => p.dateString === targetDate);
      if (!prog) return;
      if (currentShiftId !== 'ABSENCE') {
         const oldIdx = prog.assignments.findIndex(a => a.staffId === staffId && a.shiftId === currentShiftId);
         if (oldIdx !== -1) {
           prog.assignments.splice(oldIdx, 1);
         }
      }
      if (targetShiftId !== 'ABSENCE') {
          const exists = prog.assignments.some(a => a.staffId === staffId && a.shiftId === targetShiftId);
          if (!exists) {
             prog.assignments.push({
               id: Math.random().toString(36).substr(2, 9),
               staffId,
               shiftId: targetShiftId,
               flightId: '', 
               role: role || 'OPS'
             });
          }
      }
      onUpdatePrograms(newPrograms);
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const getStaffWorkload = (staffId: string) => {
      return activePrograms.reduce((acc, p) => acc + (p.assignments.some(a => a.staffId === staffId) ? 1 : 0), 0);
  };

  const getStaffColor = (s: Staff, daysWorked: number, restHours: number | null) => {
      if (restHours !== null && restHours < minRestHours) {
        return "bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(147,51,234,0.5)]";
      }
      let target = 5;
      if (s.type === 'Roster') {
          const progStart = new Date(startDate);
          const progEnd = new Date(endDate);
          const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
          const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
          const overlapStart = workFrom > progStart ? workFrom : progStart;
          const overlapEnd = workTo < progEnd ? workTo : progEnd;
          if (overlapStart <= overlapEnd) {
             target = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          } else {
             target = 0;
          }
      }
      const diff = daysWorked - target;
      if (diff >= 2) return "bg-gradient-to-br from-red-500 to-rose-700 text-white shadow-red-500/20";
      if (diff === 1) return "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/20";
      if (diff === 0) return "bg-white border-slate-200 text-slate-900 shadow-sm";
      if (diff === -1) return "bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-blue-500/20";
      return "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-indigo-500/20";
  };

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-10 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 md:gap-6 relative z-10 flex-col md:flex-row text-center md:text-left">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarDays size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none">Master Roster</h3>
            <p className="text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-2">
              Program View & Export
            </p>
          </div>
        </div>
        <div className="flex gap-4 relative z-10">
          <button 
             onClick={() => setShowHistory(!showHistory)}
             className={`px-6 py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl flex items-center gap-3 active:scale-95 ${showHistory ? 'bg-emerald-500 text-white' : 'bg-white text-slate-950 hover:bg-slate-100'}`}>
             <History size={18} />
             <span className="hidden md:inline">Time Machine</span>
          </button>
          <button 
             onClick={saveVersion}
             className="px-6 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-xl flex items-center gap-3 active:scale-95">
             <Save size={18} />
             <span className="hidden md:inline">Save Ver</span>
          </button>
          <button 
             onClick={generateFullReport} 
             disabled={isGeneratingPdf || activePrograms.length === 0}
             className="px-8 py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 hover:text-white transition-all shadow-xl flex items-center gap-3 active:scale-95 disabled:opacity-50">
             {isGeneratingPdf ? <Printer size={18} className="animate-spin"/> : <FileDown size={18} />}
             <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-8 shadow-xl animate-in slide-in-from-top-4">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase italic text-slate-900 flex items-center gap-3">
                <History className="text-emerald-500" />
                Roster Time Machine
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">Close</button>
           </div>
           
           {versions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic">No saved versions found. Save your first snapshot!</div>
           ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                 {versions.map(v => (
                    <div key={v.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400 font-black text-xs border border-slate-100">
                             v{v.versionNumber}
                          </div>
                          <div>
                             <h4 className="font-bold text-slate-800 text-sm">{v.name}</h4>
                             <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                                   <Clock size={10} /> {new Date(v.createdAt).toLocaleString()}
                                </span>
                                <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                                   {v.periodStart} → {v.periodEnd}
                                </span>
                             </div>
                          </div>
                       </div>
                       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                             onClick={() => restoreVersion(v)}
                             className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-400 shadow-sm flex items-center gap-2">
                             <RotateCcw size={12} /> Restore
                          </button>
                          <button 
                             onClick={() => deleteVersion(v.id)}
                             className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                             <Trash2 size={16} />
                          </button>
                       </div>
                    </div>
                 ))}
              </div>
           )}
        </div>
      )}

      {(isFailedGeneration || stationHealth === 0) && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-[2.5rem] p-8 md:p-12 text-center animate-in zoom-in-95 shadow-xl">
           <AlertTriangle size={64} className="mx-auto text-rose-500 mb-6" />
           <h3 className="text-2xl font-black uppercase italic text-rose-900 tracking-tighter mb-2">AI Generation Failed</h3>
           <p className="text-rose-700 font-bold max-w-lg mx-auto">
             The Artificial Intelligence engine encountered a strategic conflict or returned invalid data structure.
           </p>
           <div className="mt-6 flex justify-center gap-4">
              <div className="px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600">
                 Code: JSON_PARSE_ERROR
              </div>
              <div className="px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600">
                 Health: {stationHealth}%
              </div>
           </div>
           <p className="text-[10px] uppercase font-black tracking-widest text-rose-400 mt-8">Recommendation: Check Shift/Staff Inputs and Retry</p>
        </div>
      )}

      {!isFailedGeneration && stationHealth > 0 && (
        <div className="space-y-12">
           {activePrograms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-300 gap-4 bg-white rounded-[2.5rem] border border-slate-100">
                 <AlertTriangle size={48} />
                 <span className="text-xl font-black uppercase italic">No Program Data for Selected Period</span>
              </div>
           ) : (
              activePrograms.map((prog, i) => {
                 const d = new Date(prog.dateString || startDate);
                 const dateLabel = `${DAYS_OF_WEEK_FULL[d.getDay()].toUpperCase()} - ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
                 
                 const workingIds = new Set(prog.assignments.map(a => a.staffId));
                 const offStaff = staff.filter(s => !workingIds.has(s.id));
                 const categories: Record<string, { staff: Staff, count: number }[]> = { 'DAYS OFF': [], 'ROSTER LEAVE': [], 'ANNUAL LEAVE': [], 'STANDBY (RESERVE)': [] };

                 offStaff.forEach(s => {
                     const leave = leaveRequests.find(l => l.staffId === s.id && l.startDate <= prog.dateString! && l.endDate >= prog.dateString!);
                     let count = 1;
                     for (let idx = i - 1; idx >= 0; idx--) {
                         const prevProg = activePrograms[idx];
                         const worked = prevProg.assignments.some(a => a.staffId === s.id);
                         const prevLeave = leaveRequests.find(l => l.staffId === s.id && l.startDate <= prevProg.dateString! && l.endDate >= prevProg.dateString!);
                         if (!worked) { if (leave && prevLeave && prevLeave.type === leave.type) count++; else if (!leave && !prevLeave) count++; else break; } else break;
                     }
                     
                     const isRosterOutOfContract = s.type === 'Roster' && s.workFromDate && s.workToDate && (prog.dateString! < s.workFromDate || prog.dateString! > s.workToDate);
                     const item = { staff: s, count };

                     if (isRosterOutOfContract) {
                        categories['ROSTER LEAVE'].push(item);
                     } else if (leave) {
                        if (leave.type === 'Annual leave') categories['ANNUAL LEAVE'].push(item);
                        else if (leave.type === 'Roster leave') categories['ROSTER LEAVE'].push(item);
                        else categories['DAYS OFF'].push(item);
                     } else {
                        if (s.type === 'Local') {
                           categories['DAYS OFF'].push(item);
                        } else {
                           categories['STANDBY (RESERVE)'].push(item);
                        }
                     }
                 });

                 const shiftsTodaySorted = shifts
                    .filter(s => s.pickupDate === prog.dateString)
                    .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

                 return (
                    <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                          <h3 className="text-lg font-black uppercase italic text-slate-900">{dateLabel}</h3>
                       </div>
                       
                       <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                             <thead>
                                <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                                   <th className="px-4 py-3 w-12 text-center">S/N</th>
                                   <th className="px-4 py-3 w-24">Pickup</th>
                                   <th className="px-4 py-3 w-24">Release</th>
                                   <th className="px-4 py-3 w-32">Flights</th>
                                   <th className="px-4 py-3 w-24 text-center">HC / Max</th>
                                   <th className="px-4 py-3">Personnel & Assigned Roles</th>
                                </tr>
                             </thead>
                             <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                                {shiftsTodaySorted.map((shift, idx, shiftsToday) => {
                                   const assignments = prog.assignments.filter(a => a.shiftId === shift.id);
                                   const flightStrs = (shift.flightIds || []).map(fid => getFlight(fid)?.flightNumber).filter(Boolean).join(' / ') || 'NIL';
                                   const isFull = assignments.length >= shift.maxStaff;
                                   const isOver = assignments.length > shift.maxStaff;
                                   
                                   const hasSL = assignments.some(a => a.role === 'SL' || a.role === 'Shift Leader' || getStaff(a.staffId)?.isShiftLeader);
                                   const hasLC = assignments.some(a => a.role === 'LC' || a.role === 'Load Control' || getStaff(a.staffId)?.isLoadControl);
                                   const isCriticalMissing = (!hasSL && (shift.roleCounts?.['Shift Leader'] || 0) > 0) || (!hasLC && (shift.roleCounts?.['Load Control'] || 0) > 0);

                                   return (
                                      <tr key={shift.id} 
                                          onDragOver={handleDragOver}
                                          onDrop={(e) => handleDrop(e, shift.id, prog.dateString!)}
                                          className={`hover:bg-slate-50 transition-colors ${isCriticalMissing ? 'bg-rose-50/50' : ''}`}>
                                         <td className={`px-4 py-3 text-center font-bold ${isCriticalMissing ? 'text-rose-500' : 'text-slate-400'}`}>{idx + 1}</td>
                                         <td className="px-4 py-3 font-mono">{shift.pickupTime}</td>
                                         <td className="px-4 py-3 font-mono">{shift.endTime}</td>
                                         <td className="px-4 py-3 font-bold text-blue-600">{flightStrs}</td>
                                         <td className={`px-4 py-3 text-center font-bold ${isOver ? 'text-rose-500' : isFull ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {assignments.length} / {shift.maxStaff}
                                         </td>
                                         <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-2">
                                               {assignments.map(a => {
                                                   const st = getStaff(a.staffId);
                                                   if (!st) return null;
                                                   
                                                   const pDate = new Date(prog.dateString!);
                                                   const [ph, pm] = shift.pickupTime.split(':').map(Number);
                                                   const shiftStart = new Date(pDate);
                                                   shiftStart.setHours(ph, pm, 0, 0);
                                                   
                                                   const rest = calculateRestHours(st.id, shiftStart);
                                                   const daysWorked = getStaffWorkload(st.id);
                                                   const colorClass = getStaffColor(st, daysWorked, rest);
                                                   
                                                   let target = 5;
                                                   if (st.type === 'Roster') {
                                                       const progStart = new Date(startDate);
                                                       const progEnd = new Date(endDate);
                                                       const workFrom = st.workFromDate ? new Date(st.workFromDate) : progStart;
                                                       const workTo = st.workToDate ? new Date(st.workToDate) : progEnd;
                                                       const overlapStart = workFrom > progStart ? workFrom : progStart;
                                                       const overlapEnd = workTo < progEnd ? workTo : progEnd;
                                                       if (overlapStart <= overlapEnd) {
                                                          target = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                                       } else { target = 0; }
                                                   }
                                                   const showDays = daysWorked !== target;

                                                   const isLastShiftOfDay = !shiftsToday.slice(idx + 1).some(futureShift => 
                                                       prog.assignments.some(ass => ass.shiftId === futureShift.id && ass.staffId === st.id)
                                                   );
                                                   let nextDayShiftTime: string | null = null;
                                                   const nextProg = activePrograms[i + 1];
                                                   if (isLastShiftOfDay && nextProg) {
                                                       const shiftsTomorrow = shifts
                                                           .filter(s => s.pickupDate === nextProg.dateString)
                                                           .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
                                                       for (const tomorrowShift of shiftsTomorrow) {
                                                           const nextAssignment = nextProg.assignments.find(ass => ass.shiftId === tomorrowShift.id && ass.staffId === st.id);
                                                           if (nextAssignment) {
                                                               nextDayShiftTime = tomorrowShift.pickupTime;
                                                               break;
                                                           }
                                                       }
                                                   }

                                                   return (
                                                      <div 
                                                         key={a.id}
                                                         draggable
                                                         onDragStart={(e) => handleDragStart(e, st.id, shift.id, prog.dateString!, a.role)}
                                                         className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase cursor-move hover:scale-105 transition-all flex items-center gap-1 group ${colorClass}`}>
                                                         <span>{st.initials}</span>
                                                         {['SL', 'LC', 'LF', 'RMP', 'OPS', 'Shift Leader', 'Load Control', 'Lost and Found', 'Ramp', 'Operations'].includes(a.role) && (
                                                             <span className="opacity-70 text-[8px]">({a.role})</span>
                                                         )}
                                                         {rest !== null && rest < minRestHours && <span className="ml-1 px-1 bg-white text-purple-600 rounded text-[8px]">{rest}H</span>}
                                                         {showDays && <span className="ml-1 px-1 bg-black/20 rounded text-[8px]">{daysWorked}</span>}
                                                         {nextDayShiftTime && <span className="ml-1 px-1 bg-slate-400 text-white rounded text-[8px] font-mono">→ {nextDayShiftTime}</span>}
                                                      </div>
                                                   );
                                               })}
                                               {assignments.length === 0 && <span className="text-[10px] italic text-slate-300">Drag staff here...</span>}
                                            </div>
                                         </td>
                                      </tr>
                                   );
                                })}
                             </tbody>
                          </table>
                       </div>

                       <div 
                          className="border-t-4 border-slate-100"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'ABSENCE', prog.dateString!)}>
                          <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                             <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest">Absence and Rest Registry</h4>
                             <span className="text-[9px] font-bold text-slate-400 italic">Drag here to unassign</span>
                          </div>
                          <table className="w-full text-left border-collapse">
                             <thead className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider">
                                <tr>
                                   <th className="px-4 py-2 w-48">Status Category</th>
                                   <th className="px-4 py-2">Personnel Initials</th>
                                </tr>
                             </thead>
                             <tbody className="text-[10px] font-medium text-slate-600 divide-y divide-slate-100">
                                {Object.entries(categories).map(([cat, items]) => (
                                   <tr key={cat}>
                                      <td className="px-4 py-3 font-bold align-top">{cat}</td>
                                      <td className="px-4 py-3">
                                         <div className="flex flex-wrap gap-2">
                                            {items.map(({ staff: s, count }) => {
                                                const daysWorked = getStaffWorkload(s.id);
                                                const colorClass = getStaffColor(s, daysWorked, null);
                                                return (
                                                   <div 
                                                      key={s.id}
                                                      draggable
                                                      onDragStart={(e) => handleDragStart(e, s.id, 'ABSENCE', prog.dateString!, s.primaryRole)}
                                                      className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase cursor-move hover:scale-105 transition-all flex items-center gap-1 group ${colorClass}`}>
                                                      <span>{s.initials}</span>
                                                      <span className="ml-1 px-1 bg-black/20 rounded text-[8px]">{count}</span>
                                                   </div>
                                                );
                                            })}
                                            {items.length === 0 && <span className="text-slate-300 italic">None</span>}
                                         </div>
                                      </td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                 );
              })
           )}
        </div>
      )}
    </div>
  );
};
