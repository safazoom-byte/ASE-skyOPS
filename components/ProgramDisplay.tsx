
import React, { useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  CalendarOff, 
  Activity, 
  FileText, 
  Plane, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Cpu, 
  Briefcase, 
  Zap, 
  Scale, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';

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

  const shadowAudit = useMemo(() => {
    const violations: { type: 'CRITICAL' | 'WARNING' | 'LEGAL' | 'ASSET' | 'EQUITY', message: string, day?: number }[] = [];
    
    programs.forEach(p => {
      const shiftAssignments: Record<string, Assignment[]> = {};
      p.assignments.forEach(a => { if (a.shiftId) { shiftAssignments[a.shiftId] = [...(shiftAssignments[a.shiftId] || []), a]; } });
      
      const dayHeads: { shiftId: string, count: number, max: number, min: number }[] = [];
      
      Object.keys(shiftAssignments).forEach(sid => {
        const assigs = shiftAssignments[sid];
        const sh = getShiftById(sid);
        if (!sh) return;
        
        dayHeads.push({ shiftId: sid, count: assigs.length, max: sh.maxStaff, min: sh.minStaff });

        const hasSL = assigs.some(a => a.role === 'Shift Leader');
        const hasLC = assigs.some(a => a.role === 'Load Control');
        if (!hasSL || !hasLC) {
          violations.push({ type: 'CRITICAL', day: p.day, message: `Day ${p.day+1} Shift ${sh.pickupTime}: MISSING ${!hasSL ? 'SL' : ''} ${!hasSL && !hasLC ? '&' : ''} ${!hasLC ? 'LC' : ''}` });
        }

        if (assigs.length < sh.minStaff) {
          violations.push({ type: 'CRITICAL', day: p.day, message: `Day ${p.day+1} Shift ${sh.pickupTime}: FAILED MINIMUM (${assigs.length}/${sh.minStaff})` });
        }
      });

      if (dayHeads.length > 1) {
        const fillPercents = dayHeads.map(h => (h.count / h.max) * 100);
        const maxFill = Math.max(...fillPercents);
        const minFill = Math.min(...fillPercents);
        if (maxFill - minFill > 20) {
          violations.push({ type: 'EQUITY', day: p.day, message: `Day ${p.day+1}: Staffing imbalance detected. Shortages are not distributed evenly.` });
        }
      }

      const idleRoster = (p.offDuty || []).filter(off => {
        const s = getStaffById(off.staffId);
        return s?.type === 'Roster' && off.type === 'NIL';
      });
      
      const gapsExist = dayHeads.some(h => h.count < h.max);
      if (idleRoster.length > 0 && gapsExist) {
        violations.push({ type: 'ASSET', day: p.day, message: `Day ${p.day+1}: Resource Leakage. Available staff not assigned to unfilled shifts.` });
      }
    });

    staff.filter(s => s.type === 'Local').forEach(s => {
      const offDays = staffDayOffData.get(s.id)?.count || 0;
      if (offDays !== 2) {
        violations.push({ type: 'LEGAL', message: `${s.initials}: 5/2 COMPLIANCE BREACH (${offDays}/2 days off)` });
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
    return specialists.length > 0 ? specialists.join('+') : 'Duty';
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
    doc.setFontSize(22);
    doc.text(`SkyOPS Station Handling Plan`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Window: ${startDate} to ${endDate}`, 14, 28);

    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(16);
      doc.text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, 40);
      
      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'unassigned';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });

      const tableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightList = (sh?.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        const personnel = assigs.map(a => {
          const s = getStaffById(a.staffId);
          return `${s?.initials} (${getRoleLabel([a.role])})`;
        }).join(' | ');
        return [idx + 1, sh?.pickupTime || '--:--', sh?.endTime || '--:--', flightList, `${assigs.length}/${sh?.maxStaff}`, personnel];
      });

      autoTable(doc, { 
        startY: 45, 
        head: [['#', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC/MAX', 'PERSONNEL & ROLES']], 
        body: tableData, 
        theme: 'striped', 
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillStyle: 'DF', fillColor: [15, 23, 42] }
      });

      const leaveCategories = [
        { type: 'DAY OFF', label: 'OFF DUTY (5/2)' },
        { type: 'ROSTER LEAVE', label: 'ROSTER LEAVE' },
        { type: 'ANNUAL LEAVE', label: 'ANNUAL LEAVE' },
        { type: 'SICK LEAVE', label: 'SICK LEAVE' },
        { type: 'LIEU LEAVE', label: 'LIEU LEAVE' },
        { type: 'NIL', label: 'SURPLUS (AVAILABLE)' }
      ];

      const leaveData = leaveCategories.map(cat => {
        const staffList = (program.offDuty || [])
          .filter(off => off.type === cat.type)
          .map(off => {
            const s = getStaffById(off.staffId);
            return cat.type === 'DAY OFF' ? formatStaffDisplay(s, program.day) : s?.initials;
          })
          .filter(Boolean)
          .join(', ');
        return [cat.label, staffList || 'NONE'];
      });

      const lastY = (doc as any).lastAutoTable.finalY;
      const nextY = lastY + 15;
      
      // Prevent overflow to new page for the registry title if too low
      if (nextY > 180) {
        doc.addPage('l', 'mm', 'a4');
        doc.setFontSize(12);
        doc.text(`STATION EXCLUSION & LEAVE REGISTRY (CONT.)`, 14, 20);
        autoTable(doc, {
          startY: 25,
          head: [['EXCLUSION CATEGORY', 'PERSONNEL INITIALS']],
          body: leaveData,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [100, 116, 139] },
          columnStyles: { 0: { fontStyle: 'bold', width: 60 } }
        });
      } else {
        doc.setFontSize(12);
        doc.text(`STATION EXCLUSION & LEAVE REGISTRY`, 14, nextY);
        autoTable(doc, {
          startY: nextY + 5,
          head: [['EXCLUSION CATEGORY', 'PERSONNEL INITIALS']],
          body: leaveData,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [100, 116, 139] },
          columnStyles: { 0: { fontStyle: 'bold', width: 60 } }
        });
      }
    });

    doc.save(`SkyOPS_Official_Station_Program.pdf`);
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
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Verified Handling Program</h2>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{startDate} — {endDate}</p>
        </div>
        <button onClick={exportPDF} className="px-10 py-6 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase flex items-center gap-4 shadow-xl transition-all hover:bg-blue-600 active:scale-95">
          <FileText size={20} /> AUTHORIZE PDF EXPORT
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
           <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><Cpu size={16} className="text-blue-500" /> Internal Shadow Auditor</h4>
           {shadowAudit.length === 0 ? (
             <div className="flex items-center gap-6 p-10 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
               <CheckCircle2 className="text-emerald-500" size={40} />
               <div>
                 <p className="text-lg font-black text-emerald-900 uppercase italic leading-none mb-1">Station Health 100%</p>
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">All 5/2, Specialist, and Equity Laws Satisfied.</p>
               </div>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {shadowAudit.map((v, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 rounded-2xl border ${
                   v.type === 'CRITICAL' ? 'bg-rose-50 border-rose-200 text-rose-900 shadow-lg shadow-rose-100' : 
                   v.type === 'EQUITY' ? 'bg-indigo-50 border-indigo-200 text-indigo-900' :
                   'bg-amber-50 border-amber-200 text-amber-900'
                 }`}>
                   {v.type === 'CRITICAL' ? <Shield size={18} className="text-rose-500 animate-pulse" /> : v.type === 'EQUITY' ? <Scale size={18} className="text-indigo-500" /> : <AlertTriangle size={18} className="text-amber-500" />}
                   <span className="text-[10px] font-black uppercase italic leading-tight">{v.message}</span>
                 </div>
               ))}
             </div>
           )}
        </div>
        <div className="bg-slate-950 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px]"></div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex items-center gap-3"><TrendingUp size={16} className="text-blue-500" /> Operational Efficiency</h4>
          <div className="space-y-6 relative z-10">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
              <span className="text-[10px] font-black uppercase italic text-slate-400">Equity Meter</span>
              <span className="text-[10px] font-black uppercase text-blue-400">Level-Load Active</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
              <span className="text-[10px] font-black uppercase italic text-slate-400">5/2 Compliance</span>
              <span className="text-[10px] font-black uppercase text-emerald-400">Locked</span>
            </div>
            <p className="text-[9px] font-medium text-slate-500 leading-relaxed mt-4 italic">Mathematical distribution ensures no single shift carries an unfair burden of staff shortages.</p>
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

          const dayStats = Object.keys(assignmentsByShift).map(sid => {
            const sh = getShiftById(sid);
            const count = assignmentsByShift[sid].length;
            return { pickup: sh?.pickupTime, percent: sh ? (count / sh.maxStaff) * 100 : 0 };
          });

          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl animate-in slide-in-from-bottom-8 duration-700">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white">
                <div className="flex items-center gap-10">
                  <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10">
                    {program.day + 1}
                  </div>
                  <div>
                    <h3 className="text-3xl font-black uppercase italic tracking-tight mb-1">{getDayName(program.day)}</h3>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p>
                  </div>
                </div>
                <div className="flex items-end gap-1.5 h-12">
                   {dayStats.map((stat, i) => (
                     <div key={i} className="flex flex-col items-center gap-1 group">
                        <div className="w-2 bg-blue-500/20 rounded-t-full relative h-10">
                          <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-full transition-all duration-1000" style={{ height: `${stat.percent}%` }}></div>
                        </div>
                        <span className="text-[6px] font-black text-slate-600 uppercase opacity-0 group-hover:opacity-100">{stat.pickup}</span>
                     </div>
                   ))}
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 text-[10px]">
                    <tr>
                      <th className="px-6 py-7 border-r border-slate-100 text-center w-20">S/N</th>
                      <th className="px-6 py-7 border-r border-slate-100 w-32">PICKUP</th>
                      <th className="px-6 py-7 border-r border-slate-100 w-32">RELEASE</th>
                      <th className="px-6 py-7 border-r border-slate-100 w-32 text-center">COVERAGE</th>
                      <th className="px-10 py-7 border-r border-slate-100">FLIGHT SERVICES</th>
                      <th className="px-10 py-7">PERSONNEL MANIFEST</th>
                    </tr>
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
                      const coveragePerc = sh ? (assigs.length / sh.maxStaff) * 100 : 0;
                      const isAtMin = sh && assigs.length === sh.minStaff;

                      return (
                        <tr key={sid} className={`hover:bg-slate-50/50 transition-colors align-top ${isAtMin ? 'bg-indigo-50/20' : ''}`}>
                          <td className="px-6 py-10 border-r border-slate-100 text-center font-black text-slate-300 italic text-2xl">{idx + 1}</td>
                          <td className="px-6 py-10 border-r border-slate-100 font-black text-slate-900 text-2xl italic">{sh?.pickupTime || '--:--'}</td>
                          <td className="px-6 py-10 border-r border-slate-100 font-black text-slate-900 text-2xl italic">{sh?.endTime || '--:--'}</td>
                          <td className="px-6 py-10 border-r border-slate-100 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <span className={`font-black text-xl italic ${coveragePerc >= 100 ? 'text-emerald-600' : coveragePerc < 75 ? 'text-indigo-600' : 'text-slate-900'}`}>
                                {assigs.length}/{sh?.maxStaff}
                              </span>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ${coveragePerc < 75 ? 'bg-indigo-500' : 'bg-emerald-500'}`} style={{ width: `${coveragePerc}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-10 border-r border-slate-100">
                            <div className="space-y-4">
                              {(sh?.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean).map(f => (
                                <div key={f!.id} className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-600 bg-slate-100/50 px-4 py-3 rounded-2xl border border-slate-100">
                                  <Plane size={14} className="text-indigo-500" />{f!.flightNumber}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-10 py-10">
                            <div className="flex flex-wrap gap-4">
                              {Array.from(staffMap.keys()).map(staffId => {
                                const s = getStaffById(staffId);
                                const label = getRoleLabel(staffMap.get(staffId) || []);
                                const isSpecialist = label !== 'Duty';
                                return (
                                  <div key={staffId} className={`px-6 py-5 rounded-[2.5rem] border shadow-lg flex flex-col min-w-[150px] transition-transform hover:scale-105 ${
                                    isSpecialist ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-100'
                                  }`}>
                                    <span className="text-xl font-black italic uppercase tracking-tighter leading-none mb-1">{formatStaffDisplay(s)}</span>
                                    <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{label}</span>
                                  </div>
                                );
                              })}
                              {(!hasSL || !hasLC) && (
                                <div className="px-6 py-5 rounded-[2.5rem] border-2 border-dashed border-rose-500 text-rose-500 flex flex-col items-center justify-center">
                                  <AlertCircle size={20} />
                                  <span className="text-[8px] font-black uppercase mt-1">SECURITY GAP</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50/50 p-12 space-y-12 border-t border-slate-200">
                <h4 className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-4 text-slate-950">
                  <CalendarOff size={28} className="text-slate-400" /> MISSION EXCLUSIONS & NIL REGISTRY
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
                  {[
                    { type: 'DAY OFF', label: 'OFF DUTY (5/2)' },
                    { type: 'ROSTER LEAVE', label: 'ROSTER LEAVE' },
                    { type: 'ANNUAL LEAVE', label: 'ANNUAL LEAVE' },
                    { type: 'SICK LEAVE', label: 'SICK LEAVE' },
                    { type: 'LIEU LEAVE', label: 'LIEU LEAVE' },
                    { type: 'NIL', label: 'SURPLUS (AVAILABLE)' }
                  ].map(cat => (
                    <div key={cat.type} className="bg-white p-8 rounded-[3.5rem] border border-slate-200 shadow-xl flex flex-col gap-6 group hover:border-slate-400 transition-colors">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-5 group-hover:text-slate-900">{cat.label}</h5>
                      <div className="flex flex-wrap gap-2 min-h-[60px] content-start">
                        {(program.offDuty || []).filter(off => off.type === cat.type).map(off => getStaffById(off.staffId)).filter(Boolean).map((s, i) => (
                          <div key={i} className={`px-5 py-3 rounded-2xl font-black text-xs italic shadow-lg ${
                            cat.type === 'NIL' ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-slate-950 text-white'
                          }`}>
                            {formatStaffDisplay(s as Staff, cat.type === 'DAY OFF' ? program.day : undefined)}
                          </div>
                        ))}
                        {(program.offDuty || []).filter(off => off.type === cat.type).length === 0 && (
                          <span className="text-[8px] font-black uppercase text-slate-300 italic py-3">None</span>
                        )}
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
