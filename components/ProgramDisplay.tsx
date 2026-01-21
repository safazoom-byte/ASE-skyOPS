
import React, { useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarOff, Activity, FileText, Plane, Shield, AlertTriangle, CheckCircle2, UserCheck, UserX, Cpu, Briefcase } from 'lucide-react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  aiRecommendations?: any;
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, startDate, endDate }) => {
  const sortedPrograms = useMemo(() => {
    return Array.isArray(programs) ? [...programs].sort((a, b) => Number(a.day) - Number(b.day)) : [];
  }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const staffDayOffData = useMemo(() => {
    const data = new Map<string, { count: number, labels: Map<number, string> }>();
    const chronologicalPrograms = [...programs].sort((a, b) => a.day - b.day);
    chronologicalPrograms.forEach(prog => {
      (prog.offDuty || []).forEach(off => {
        if (off.type === 'DAY OFF') {
          const stats = data.get(off.staffId) || { count: 0, labels: new Map() };
          stats.count++;
          stats.labels.set(prog.day, stats.count.toString().padStart(2, '0'));
          data.set(off.staffId, stats);
        }
      });
    });
    return data;
  }, [programs]);

  // LOCAL AUDIT ENGINE (THE GUARD)
  const programAudit = useMemo(() => {
    const violations: { type: 'CRITICAL' | 'WARNING' | 'LEGAL', message: string }[] = [];
    
    // 1. Specialist Role Audit (SL & LC)
    programs.forEach(p => {
      const shiftAssignments: Record<string, Assignment[]> = {};
      p.assignments.forEach(a => { 
        if (a.shiftId) { 
          if (!shiftAssignments[a.shiftId]) shiftAssignments[a.shiftId] = [];
          shiftAssignments[a.shiftId].push(a); 
        } 
      });
      
      Object.keys(shiftAssignments).forEach(sid => {
        const assigs = shiftAssignments[sid];
        const sh = getShiftById(sid);
        const hasSL = assigs.some(a => a.role === 'Shift Leader');
        const hasLC = assigs.some(a => a.role === 'Load Control');
        if (!hasSL || !hasLC) {
          violations.push({ 
            type: 'CRITICAL', 
            message: `Day ${p.day+1} Shift ${sh?.pickupTime}: Missing ${!hasSL ? 'Shift Leader' : ''}${!hasSL && !hasLC ? ' & ' : ''}${!hasLC ? 'Load Control' : ''}` 
          });
        }
      });
    });

    // 2. Asset Leakage Audit (Idle Roster Staff vs Under-filled Shifts)
    programs.forEach(p => {
      const idleRoster = (p.offDuty || []).filter(off => {
        const s = getStaffById(off.staffId);
        return s?.type === 'Roster' && off.type === 'NIL';
      });
      const underFilledShifts = Object.keys(shifts).filter(sid => {
        const sh = getShiftById(sid);
        const count = p.assignments.filter(a => a.shiftId === sid).length;
        return sh && count < sh.maxStaff;
      });
      if (idleRoster.length > 0 && underFilledShifts.length > 0) {
        violations.push({ 
          type: 'WARNING', 
          message: `Day ${p.day+1}: ${idleRoster.length} Roster staff idle while shifts are under capacity.` 
        });
      }
    });

    // 3. 5/2 Compliance Audit (Local Staff)
    staff.filter(s => s.type === 'Local').forEach(s => {
      const count = staffDayOffData.get(s.id)?.count || 0;
      if (count < 2) {
        violations.push({ 
          type: 'LEGAL', 
          message: `${s.initials} Compliance Failure: Only ${count}/2 days off assigned.` 
        });
      }
    });

    return violations;
  }, [programs, staff, shifts, staffDayOffData]);

  const formatStaffDisplay = (s?: Staff, dayIndex?: number) => {
    if (!s) return "??";
    if (dayIndex !== undefined) {
      const dayOffLabel = staffDayOffData.get(s.id)?.labels.get(dayIndex);
      if (dayOffLabel) return `${s.initials} ${dayOffLabel}`;
    }
    return s.initials;
  };

  const getRoleLabel = (roles: string[]) => {
    const specialistMap: Record<string, string> = { 'Shift Leader': 'SL', 'Load Control': 'LC', 'Ramp': 'RMP', 'Lost and Found': 'LF', 'Operations': 'OPS' };
    const mapped = roles.map(r => specialistMap[r.trim()] || 'Duty');
    const unique = Array.from(new Set(mapped));
    const specialists = unique.filter(u => u !== 'Duty');
    return specialists.length > 0 ? specialists.join(' + ') : 'Duty';
  };

  const getDayName = (dayIndex: any) => {
    if (!startDate) return `Day ${dayIndex}`;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + Number(dayIndex));
    return DAYS_OF_WEEK[d.getDay()];
  };

  const getDayDate = (dayIndex: any) => {
    if (!startDate) return `Day ${dayIndex}`;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + Number(dayIndex));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text(`SkyOPS Station Handling Program`, 14, 15);
    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, 30);
      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'unassigned';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });
      const tableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightList = (sh?.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        const staffMap = new Map<string, string[]>();
        assigs.forEach(a => {
          const s = getStaffById(a.staffId);
          if (s) {
            const cur = staffMap.get(s.initials) || [];
            if (!cur.includes(a.role)) cur.push(a.role);
            staffMap.set(s.initials, cur);
          }
        });
        const details = Array.from(staffMap.entries()).map(([init, roles]) => `${init} (${getRoleLabel(roles)})`).join(' | ');
        return [idx + 1, sh?.pickupTime || '--:--', sh?.endTime || '--:--', flightList, `${staffMap.size} / ${sh?.maxStaff || '?'}`, details];
      });
      autoTable(doc, { startY: 35, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC/MAX', 'PERSONNEL & ROLES']], body: tableData, theme: 'striped', styles: { fontSize: 8 } });
    });
    doc.save(`SkyOPS_Station_Program.pdf`);
  };

  if (!sortedPrograms.length) return (
    <div className="py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center space-y-8">
      <Activity size={48} className="text-slate-200 animate-pulse" />
      <h5 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Operational Plan Missing</h5>
    </div>
  );

  return (
    <div className="space-y-16 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div><h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Station Handling Program</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{startDate} — {endDate}</p></div>
        <button onClick={exportPDF} className="px-8 py-5 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase flex items-center gap-4 shadow-xl transition-all active:scale-95"><FileText size={20} /> PDF EXPORT</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
           <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><Cpu size={16} className="text-blue-500" /> Operational Audit Core</h4>
           {programAudit.length === 0 ? (
             <div className="flex items-center gap-4 p-8 bg-emerald-50 rounded-3xl border border-emerald-100"><CheckCircle2 className="text-emerald-500" size={32} /><p className="text-sm font-black text-emerald-800 uppercase italic">Operational Health 100%. All Specialist Roles and Compliance Rules are Satisfied.</p></div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {programAudit.map((v, i) => (
                 <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl border ${v.type === 'CRITICAL' ? 'bg-rose-50 border-rose-100 text-rose-900' : v.type === 'LEGAL' ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                   {v.type === 'CRITICAL' ? <Shield size={16} className="text-rose-500" /> : v.type === 'LEGAL' ? <AlertTriangle size={16} className="text-amber-500" /> : <Briefcase size={16} className="text-slate-400" />}
                   <span className="text-[10px] font-black uppercase italic leading-tight">{v.message}</span>
                 </div>
               ))}
             </div>
           )}
        </div>
        <div className="bg-slate-950 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px]"></div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex items-center gap-3"><Shield size={16} className="text-blue-500" /> Specialist Integrity</h4>
          <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">Resource Utilization</span><span className="text-[10px] font-black uppercase text-blue-400">Maximized</span></div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">Role Security (SL/LC)</span><span className="text-[10px] font-black uppercase text-emerald-400">Hard-Enforced</span></div>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 leading-relaxed mt-4 italic">The AI is instructed to prioritize specialists and fill total capacity before assigning nil statuses.</p>
          </div>
        </div>
      </div>

      <div className="space-y-24">
        {sortedPrograms.map((program) => {
          const assignmentsByShift: Record<string, Assignment[]> = {};
          (program.assignments || []).forEach(a => {
            const sid = a.shiftId || 'unassigned';
            if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
            assignmentsByShift[sid].push(a);
          });
          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white">
                <div className="flex items-center gap-10"><div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10">{program.day + 1}</div><div><h3 className="text-3xl font-black uppercase italic tracking-tight mb-1">{getDayName(program.day)}</h3><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p></div></div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 text-[10px]">
                    <tr><th className="px-6 py-6 border-r border-slate-100 text-center w-16">S/N</th><th className="px-6 py-6 border-r border-slate-100 w-32">PICKUP</th><th className="px-6 py-6 border-r border-slate-100 w-32">RELEASE</th><th className="px-6 py-6 border-r border-slate-100 w-32 text-center">HC / MAX</th><th className="px-8 py-6 border-r border-slate-100">FLIGHTS</th><th className="px-8 py-6">PERSONNEL & ROLES</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
                      const sh = getShiftById(sid);
                      const staffMap = new Map<string, string[]>();
                      assigs.forEach(a => {
                        const cur = staffMap.get(a.staffId) || [];
                        if (!cur.includes(a.role)) cur.push(a.role);
                        staffMap.set(a.staffId, cur);
                      });
                      const hasSL = assigs.some(a => a.role === 'Shift Leader');
                      const hasLC = assigs.some(a => a.role === 'Load Control');
                      return (
                        <tr key={sid} className="hover:bg-slate-50/50 transition-colors align-top">
                          <td className="px-6 py-8 border-r border-slate-100 text-center font-black text-slate-300 italic text-xl">{idx + 1}</td>
                          <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-xl italic">{sh?.pickupTime || '--:--'}</td>
                          <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-xl italic">{sh?.endTime || '--:--'}</td>
                          <td className="px-6 py-8 border-r border-slate-100 text-center">
                            <span className={`font-black text-lg italic ${sh && staffMap.size >= sh.maxStaff ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {staffMap.size} / {sh?.maxStaff || '?'}
                            </span>
                          </td>
                          <td className="px-8 py-8 border-r border-slate-100"><div className="space-y-3">{(sh?.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean).map(f => (<div key={f!.id} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 bg-slate-100/50 px-3 py-2 rounded-xl border border-slate-100"><Plane size={12} className="text-indigo-400" />{f!.flightNumber}</div>))}</div></td>
                          <td className="px-8 py-8">
                            <div className="flex flex-wrap gap-3">
                              {Array.from(staffMap.keys()).map(staffId => {
                                const s = getStaffById(staffId);
                                const label = getRoleLabel(staffMap.get(staffId) || []);
                                const isSpec = label !== 'Duty';
                                return (<div key={staffId} className={`px-6 py-4 rounded-[2rem] border shadow-lg flex flex-col min-w-[140px] transition-transform hover:scale-105 ${isSpec ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}><span className="text-lg font-black italic uppercase tracking-tighter">{formatStaffDisplay(s)}</span><span className="text-[8px] font-black uppercase tracking-widest opacity-60">{label}</span></div>);
                              })}
                              {(!hasSL || !hasLC) && <div className="px-6 py-4 rounded-[2rem] border-2 border-dashed border-rose-500 text-rose-500 flex flex-col justify-center items-center"><AlertTriangle size={16} /><span className="text-[8px] font-black uppercase">Role Gap</span></div>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50/50 p-12 space-y-12 border-t border-slate-200">
                <h4 className="text-lg font-black uppercase italic tracking-tighter flex items-center gap-4 text-slate-950"><CalendarOff size={24} className="text-slate-400" /> ABSENCE AND LEAVES REGISTRY</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
                  {[
                    { type: 'DAY OFF', label: 'DAYS OFF' },
                    { type: 'ROSTER LEAVE', label: 'ROSTER LEAVE' },
                    { type: 'ANNUAL LEAVE', label: 'ANNUAL LEAVE' },
                    { type: 'SICK LEAVE', label: 'SICK LEAVE' },
                    { type: 'LIEU LEAVE', label: 'LIEU LEAVE' },
                    { type: 'NIL', label: 'AVAILABLE (NIL)' }
                  ].map(cat => (
                    <div key={cat.type} className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-xl flex flex-col gap-6 group hover:border-slate-400 transition-colors">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-4 group-hover:text-slate-900">{cat.label}</h5>
                      <div className="flex flex-wrap gap-2 min-h-[50px]">
                        {(program.offDuty || []).filter(off => off.type === cat.type).map(off => getStaffById(off.staffId)).filter(Boolean).map((s, i) => (
                          <div key={i} className="px-5 py-3 bg-slate-950 text-white rounded-2xl font-black text-xs italic shadow-lg">{formatStaffDisplay(s as Staff, cat.type === 'DAY OFF' ? program.day : undefined)}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
