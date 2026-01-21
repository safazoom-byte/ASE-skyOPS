
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

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const staffWorkStats = useMemo(() => {
    const data = new Map<string, { workCount: number, offCount: number, offLabels: Map<number, string> }>();
    staff.forEach(s => data.set(s.id, { workCount: 0, offCount: 0, offLabels: new Map() }));
    programs.forEach(prog => {
      const workingStaffIds = new Set(prog.assignments.map(a => a.staffId));
      staff.forEach(s => {
        const stats = data.get(s.id)!;
        if (workingStaffIds.has(s.id)) {
          stats.workCount++;
        } else {
          const offRecord = (prog.offDuty || []).find(off => off.staffId === s.id);
          if (offRecord?.type === 'DAY OFF') {
            stats.offCount++;
            stats.offLabels.set(prog.day, stats.offCount.toString().padStart(2, '0'));
          }
        }
      });
    });
    return data;
  }, [programs, staff]);

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
        if (!hasSL || !hasLC) violations.push({ type: 'CRITICAL', day: p.day, message: `Day ${p.day+1}: Shift ${sh.pickupTime} MISSING ${!hasSL ? 'SL' : ''} ${!hasLC ? 'LC' : ''}` });
        if (assigs.length < sh.minStaff) violations.push({ type: 'CRITICAL', day: p.day, message: `Day ${p.day+1}: Shift ${sh.pickupTime} FAILED MINIMUM (${assigs.length}/${sh.minStaff})` });
      });
      const idleQualified = (p.offDuty || []).filter(off => off.type === 'NIL');
      const shiftsWithGaps = dayHeads.some(h => h.count < h.max);
      if (idleQualified.length > 0 && shiftsWithGaps) violations.push({ type: 'ASSET', day: p.day, message: `Day ${p.day+1}: Resource Leakage. ${idleQualified.length} staff idle during shortage.` });
    });
    staff.filter(s => s.type === 'Local').forEach(s => {
      const stats = staffWorkStats.get(s.id);
      if (stats && stats.workCount > 5) violations.push({ type: 'LEGAL', message: `${s.initials}: 5/2 LAW VIOLATION (${stats.workCount} days worked).` });
    });
    return violations;
  }, [programs, staff, shifts, staffWorkStats]);

  const formatStaffDisplay = (s?: Staff, dayIndex?: number) => {
    if (!s) return "??";
    if (dayIndex !== undefined) {
      const offLabel = staffWorkStats.get(s.id)?.offLabels.get(dayIndex);
      if (offLabel) return `${s.initials} ${offLabel}`;
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
    doc.setFontSize(22).text(`SkyOPS Station Handling Plan`, 14, 20);
    doc.setFontSize(10).text(`Window: ${startDate} to ${endDate}`, 14, 28);
    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(16).text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, 40);
      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'unassigned';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });
      const tableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightList = (sh?.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        const personnel = assigs.map(a => `${getStaffById(a.staffId)?.initials} (${getRoleLabel([a.role])})`).join(' | ');
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
        const staffList = (program.offDuty || []).filter(off => off.type === cat.type).map(off => formatStaffDisplay(getStaffById(off.staffId), cat.type === 'DAY OFF' ? program.day : undefined)).filter(Boolean).join(', ');
        return [cat.label, staffList || 'NONE'];
      });
      const nextY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12).text(`STATION EXCLUSION & LEAVE REGISTRY`, 14, nextY);
      autoTable(doc, { startY: nextY + 5, head: [['EXCLUSION', 'PERSONNEL']], body: leaveData, theme: 'grid', styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold', width: 60 } } });
    });
    doc.save(`SkyOPS_Official_Station_Program.pdf`);
  };

  return (
    <div className="space-y-16 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter mb-3">Verified Handling Program</h2>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{startDate} — {endDate}</p>
        </div>
        <button onClick={exportPDF} className="px-10 py-6 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase flex items-center gap-4 hover:bg-blue-600 transition-all">
          <FileText size={20} /> AUTHORIZE PDF EXPORT
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
           <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><Cpu size={16} className="text-blue-500" /> Operational Shadow Auditor</h4>
           {shadowAudit.length === 0 ? (
             <div className="flex items-center gap-6 p-10 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
               <CheckCircle2 className="text-emerald-500" size={40} />
               <p className="text-lg font-black text-emerald-900 uppercase italic">Station Health 100%</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {shadowAudit.map((v, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 rounded-2xl border ${v.type === 'CRITICAL' || v.type === 'LEGAL' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                   {v.type === 'CRITICAL' || v.type === 'LEGAL' ? <Shield size={18} className="text-rose-500 animate-pulse" /> : <AlertTriangle size={18} className="text-amber-500" />}
                   <span className="text-[10px] font-black uppercase italic leading-tight">{v.message}</span>
                 </div>
               ))}
             </div>
           )}
        </div>
        <div className="bg-slate-950 p-10 rounded-[3.5rem] text-white shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px]"></div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex items-center gap-3"><TrendingUp size={16} className="text-blue-500" /> Efficiency Meter</h4>
          <div className="space-y-6 relative z-10">
            <div className="flex justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">Resource Saturation</span><span className="text-[10px] font-black uppercase text-blue-400">Locked</span></div>
            <div className="flex justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">5/2 Compliance</span><span className="text-[10px] font-black uppercase text-emerald-400">Verified</span></div>
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
                <div className="flex items-center gap-10">
                  <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl">{program.day + 1}</div>
                  <div>
                    <h3 className="text-3xl font-black uppercase italic tracking-tight">{getDayName(program.day)}</h3>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="px-6 py-7">PICKUP</th>
                      <th className="px-6 py-7">RELEASE</th>
                      <th className="px-6 py-7 text-center">HC/MAX</th>
                      <th className="px-10 py-7">FLIGHTS</th>
                      <th className="px-10 py-7">PERSONNEL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(assignmentsByShift).map(([sid, assigs]) => {
                      const sh = getShiftById(sid);
                      const isBelowMin = sh && assigs.length < sh.minStaff;
                      const coveragePerc = sh ? (assigs.length / sh.maxStaff) * 100 : 0;
                      return (
                        <tr key={sid} className={`align-top ${isBelowMin ? 'bg-rose-50/40' : ''}`}>
                          <td className="px-6 py-10 font-black text-slate-900 text-2xl italic">{sh?.pickupTime || '--:--'}</td>
                          <td className="px-6 py-10 font-black text-slate-900 text-2xl italic">{sh?.endTime || '--:--'}</td>
                          <td className="px-6 py-10 text-center">
                            <span className={`font-black text-xl italic ${isBelowMin ? 'text-rose-600' : 'text-slate-900'}`}>{assigs.length}/{sh?.maxStaff}</span>
                          </td>
                          <td className="px-10 py-10">
                            {(sh?.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean).map(f => (
                              <div key={f!.id} className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 px-3 py-2 rounded-xl mb-2 flex items-center gap-2">
                                <Plane size={14} className="text-blue-500" />{f!.flightNumber}
                              </div>
                            ))}
                          </td>
                          <td className="px-10 py-10">
                            <div className="flex flex-wrap gap-4">
                              {assigs.map(a => {
                                const s = getStaffById(a.staffId);
                                const label = getRoleLabel([a.role]);
                                return (
                                  <div key={a.id} className={`px-4 py-3 rounded-2xl border shadow-sm ${label !== 'Duty' ? 'bg-slate-900 text-white' : 'bg-white border-slate-100'}`}>
                                    <span className="text-lg font-black italic">{formatStaffDisplay(s)}</span>
                                    <span className="text-[7px] font-black uppercase block opacity-60">{label}</span>
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

              <div className="bg-slate-50/50 p-12 border-t border-slate-200">
                <h4 className="text-xl font-black uppercase italic mb-8 flex items-center gap-4 text-slate-950"><CalendarOff className="text-slate-400" /> REGISTRY EXCLUSIONS</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6">
                  {['DAY OFF', 'ROSTER LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE', 'LIEU LEAVE', 'NIL'].map(cat => (
                    <div key={cat} className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                      <h5 className="text-[9px] font-black text-slate-400 uppercase mb-4 border-b border-slate-50 pb-2">{cat}</h5>
                      <div className="flex flex-wrap gap-1">
                        {(program.offDuty || []).filter(off => off.type === cat).map(off => (
                          <span key={off.staffId} className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-black italic">{getStaffById(off.staffId)?.initials}</span>
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
