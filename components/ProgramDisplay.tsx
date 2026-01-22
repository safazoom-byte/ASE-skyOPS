
import React, { useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { jsPDF } from 'jspdf';
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
  AlertCircle,
  BarChart3,
  Users,
  CalendarDays,
  UserX
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
    return Array.isArray(programs) ? [...programs].sort((a, b) => Number(a.day || 0) - Number(b.day || 0)) : [];
  }, [programs]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const parseSafeDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };

  const getCumulativeAbsenceCount = (staffId: string, dayIndex: number) => {
    let count = 0;
    for (let i = 0; i <= dayIndex; i++) {
      const prog = sortedPrograms.find(p => p.day === i);
      if (prog) {
        const isAbsent = (prog.offDuty || []).some(off => off.staffId === staffId);
        if (isAbsent) count++;
      }
    }
    return count;
  };

  const dayStats = useMemo(() => {
    const startObj = parseSafeDate(startDate);
    
    return sortedPrograms.map(p => {
      const dayFlights = flights.filter(f => f.date === p.dateString);
      const assignments = p.assignments || [];
      const activeStaffIds = new Set(assignments.filter(a => a.staffId && a.staffId !== 'GAP').map(a => a.staffId));
      
      const dayShifts = shifts.filter(s => s.pickupDate === p.dateString);
      let hasShortage = dayShifts.some(sh => {
        const filled = assignments.filter(a => a.shiftId === sh.id && a.staffId && a.staffId !== 'GAP');
        return filled.length < sh.minStaff;
      });

      return { 
        day: p.day, 
        flightCount: dayFlights.length, 
        staffCount: activeStaffIds.size, 
        hasShortage 
      };
    });
  }, [sortedPrograms, flights, staff, startDate, shifts]);

  const shadowAudit = useMemo(() => {
    const violations: { type: 'CRITICAL' | 'WARNING' | 'LEGAL' | 'ASSET' | 'EQUITY', message: string, day?: number }[] = [];
    
    sortedPrograms.forEach(p => {
      const assignments = p.assignments || [];
      const dayShifts = shifts.filter(sh => sh.pickupDate === p.dateString);

      dayShifts.forEach(sh => {
        const filled = assignments.filter(a => a.shiftId === sh.id && a.staffId && a.staffId !== 'GAP');
        const hasSL = filled.some(a => a.role === 'Shift Leader');
        const hasLC = filled.some(a => a.role === 'Load Control');
        
        if (!hasSL || !hasLC) {
          violations.push({ 
            type: 'CRITICAL', 
            day: p.day, 
            message: `Day ${p.day+1}: Shift ${sh.pickupTime} lacks specialist (${!hasSL ? 'SL' : ''} ${!hasLC ? 'LC' : ''})` 
          });
        }
        
        if (filled.length < sh.minStaff) {
          violations.push({ 
            type: 'CRITICAL', 
            day: p.day, 
            message: `Day ${p.day+1}: Shift ${sh.pickupTime} below minimum (${filled.length}/${sh.minStaff})` 
          });
        }
      });
    });

    const staffWorkCounts = new Map<string, number>();
    sortedPrograms.forEach(p => {
      (p.assignments || []).forEach(a => {
        if (a.staffId && a.staffId !== 'GAP') {
          staffWorkCounts.set(a.staffId, (staffWorkCounts.get(a.staffId) || 0) + 1);
        }
      });
    });

    staff.forEach(s => {
      const count = staffWorkCounts.get(s.id) || 0;
      if (count > (s.maxShiftsPerWeek || 5)) {
        violations.push({ type: 'LEGAL', message: `${s.initials}: Duty limit exceeded (${count} days). Waiver Active.` });
      }
    });
    
    return violations;
  }, [sortedPrograms, staff, shifts]);

  const getRoleLabel = (roles: string[]) => {
    const specialistMap: Record<string, string> = { 
      'Shift Leader': 'SL', 
      'Load Control': 'LC', 
      'Ramp': 'RMP', 
      'Lost and Found': 'LF', 
      'Operations': 'OPS' 
    };
    const mapped = roles.map(r => specialistMap[r.trim()] || 'Duty');
    const unique = Array.from(new Set(mapped));
    const specialists = unique.filter(u => u !== 'Duty');
    return specialists.length > 0 ? specialists.join('+') : 'Duty';
  };

  const getDayName = (dayIndex: any) => {
    const startObj = parseSafeDate(startDate);
    if (!startObj) return `Day ${dayIndex}`;
    const d = new Date(startObj.getTime());
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getDayDate = (dayIndex: any) => {
    const startObj = parseSafeDate(startDate);
    if (!startObj) return `Day ${dayIndex}`;
    const d = new Date(startObj.getTime());
    d.setDate(d.getDate() + Number(dayIndex || 0));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const exportPDF = () => {
    if (sortedPrograms.length === 0) {
      alert("No roster detected. Please generate a program first.");
      return;
    }

    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    
    sortedPrograms.forEach((program, pIdx) => {
      // Fix: doc.addPage expects 0-2 arguments. Correcting call to addPage(format, orientation).
      if (pIdx > 0) doc.addPage('a4', 'l');
      
      doc.setFontSize(22).text(`SkyOPS Station Handling Plan`, 14, 20);
      doc.setFontSize(10).text(`Reporting Period: ${startDate || 'N/A'} to ${endDate || 'N/A'}`, 14, 28);
      doc.setFontSize(16).text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, 40);
      
      const assignments = program.assignments || [];
      const dayShifts = shifts.filter(sh => sh.pickupDate === program.dateString);

      const tableData = dayShifts.sort((a,b) => a.pickupTime.localeCompare(b.pickupTime)).map((sh, idx) => {
        const assigs = assignments.filter(a => a.shiftId === sh.id);
        const flightList = (sh.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        
        const personnel = assigs.length > 0 
          ? assigs.map(a => {
              if (!a.staffId || a.staffId === 'GAP') return `[VACANT] (${getRoleLabel([a.role])})`;
              const s = getStaffById(a.staffId);
              return `${s?.initials || '??'} (${getRoleLabel([a.role])})`;
            }).join(' | ')
          : "[VACANT / NO ASSIGNMENT]";
        
        return [
          idx + 1, 
          sh.pickupTime, 
          sh.endTime, 
          flightList || 'Base Operations', 
          `${assigs.filter(x => x.staffId && x.staffId !== 'GAP').length}/${sh.minStaff}`, 
          personnel
        ];
      });

      autoTable(doc, { 
        startY: 45, 
        head: [['#', 'PICKUP', 'RELEASE', 'FLIGHT HANDLING', 'HC/MIN', 'PERSONNEL & ROLES']], 
        body: tableData, 
        theme: 'striped', 
        styles: { fontSize: 8, cellPadding: 4, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        columnStyles: {
           5: { cellWidth: 100 }
        }
      });
    });
    
    doc.save(`SkyOPS_Roster_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-16 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div className="flex items-center gap-8">
           <div className="w-20 h-20 bg-slate-950 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl"><CalendarDays size={32} /></div>
           <div>
             <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">Handling Program</h2>
             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{startDate} — {endDate}</p>
           </div>
        </div>
        <button 
          onClick={exportPDF} 
          disabled={sortedPrograms.length === 0}
          className="px-10 py-6 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase flex items-center gap-4 hover:bg-blue-600 transition-all shadow-xl shadow-slate-950/20 disabled:opacity-30"
        >
          <FileText size={20} /> AUTHORIZE PDF EXPORT
        </button>
      </div>

      <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3">
          <BarChart3 size={16} className="text-blue-500" /> Station Load Heatmap
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {dayStats.map((stat) => (
            <div key={stat.day} className={`p-5 rounded-[2rem] border transition-all ${stat.hasShortage ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
              <span className="block text-[8px] font-black text-slate-400 uppercase mb-2">Day {stat.day + 1}</span>
              <div className="flex items-end gap-1 mb-3">
                <div className="flex-1 bg-slate-200 rounded-full h-12 relative overflow-hidden">
                  <div 
                    className={`absolute bottom-0 left-0 w-full transition-all duration-1000 ${stat.hasShortage ? 'bg-rose-500' : 'bg-blue-600'}`} 
                    style={{ height: `${Math.min(100, (stat.staffCount / (stat.flightCount || 1)) * 50)}%` }}
                  />
                </div>
                <div className="text-right">
                  <span className="block text-lg font-black italic text-slate-900 leading-none">{stat.staffCount}</span>
                  <span className="block text-[7px] font-black text-slate-400 uppercase">HC</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[7px] font-black uppercase text-slate-500">{stat.flightCount} Flights</span>
                {stat.hasShortage && <AlertCircle size={12} className="text-rose-500 animate-pulse" />}
              </div>
            </div>
          ))}
          {dayStats.length === 0 && (
            <div className="col-span-full py-10 text-center text-[10px] font-black text-slate-300 uppercase italic">Awaiting Registry Draft...</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
           <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><Cpu size={16} className="text-blue-500" /> Operational Shadow Auditor</h4>
           {shadowAudit.length === 0 && sortedPrograms.length > 0 ? (
             <div className="flex items-center gap-6 p-10 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
               <CheckCircle2 className="text-emerald-500" size={40} />
               <p className="text-lg font-black text-emerald-900 uppercase italic">Station Health 100%</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
               {shadowAudit.map((v, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 rounded-2xl border ${v.type === 'CRITICAL' || v.type === 'LEGAL' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                   {v.type === 'CRITICAL' || v.type === 'LEGAL' ? <Shield size={18} className="text-rose-500 animate-pulse" /> : <AlertTriangle size={18} className="text-amber-500" />}
                   <span className="text-[10px] font-black uppercase italic leading-tight">{v.message}</span>
                 </div>
               ))}
               {sortedPrograms.length === 0 && (
                 <p className="text-[10px] font-black text-slate-400 uppercase italic">No program generated yet.</p>
               )}
             </div>
           )}
        </div>
        <div className="bg-slate-950 p-10 rounded-[3.5rem] text-white shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px]"></div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex items-center gap-3"><TrendingUp size={16} className="text-blue-500" /> Efficiency Meter</h4>
          <div className="space-y-6 relative z-10">
            <div className="flex justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">Resource Saturation</span><span className="text-[10px] font-black uppercase text-blue-400">Optimized</span></div>
            <div className="flex justify-between p-4 bg-white/5 rounded-2xl border border-white/10"><span className="text-[10px] font-black uppercase italic text-slate-400">5/2 Compliance</span><span className={`text-[10px] font-black uppercase ${shadowAudit.some(v => v.type === 'LEGAL') ? 'text-amber-400' : 'text-emerald-400'}`}>
              {shadowAudit.some(v => v.type === 'LEGAL') ? 'Waiver Active' : 'Verified'}
            </span></div>
          </div>
        </div>
      </div>

      <div className="space-y-24">
        {sortedPrograms.map((program) => {
          const assignments = program.assignments || [];
          const dayShifts = shifts.filter(sh => sh.pickupDate === program.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));

          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl animate-in slide-in-from-bottom-10 duration-700">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white">
                <div className="flex items-center gap-10">
                  <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl text-blue-500 border border-white/10 shadow-inner">{Number(program.day || 0) + 1}</div>
                  <div>
                    <h3 className="text-3xl font-black uppercase italic tracking-tight">{getDayName(program.day)}</h3>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-center">
                    <span className="block text-[8px] font-black text-slate-500 uppercase mb-1">Total HC</span>
                    <span className="text-xl font-black italic text-white">{new Set(assignments.filter(a => a.staffId && a.staffId !== 'GAP').map(a => a.staffId)).size}</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="px-6 py-7">PICKUP</th>
                      <th className="px-6 py-7">RELEASE</th>
                      <th className="px-6 py-7 text-center">HC/MIN</th>
                      <th className="px-10 py-7">FLIGHTS</th>
                      <th className="px-10 py-7">PERSONNEL & DISCIPLINE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dayShifts.map((sh) => {
                      const assigs = assignments.filter(a => a.shiftId === sh.id);
                      return (
                        <tr key={sh.id} className="align-top hover:bg-slate-50/30 transition-colors">
                          <td className="px-6 py-10 font-black text-slate-950 text-2xl italic tracking-tighter">{sh.pickupTime}</td>
                          <td className="px-6 py-10 font-black text-slate-950 text-2xl italic tracking-tighter">{sh.endTime}</td>
                          <td className="px-6 py-10 text-center">
                            <span className={`font-black text-xl italic px-4 py-2 rounded-2xl ${assigs.filter(x => x.staffId && x.staffId !== 'GAP').length < sh.minStaff ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {assigs.filter(x => x.staffId && x.staffId !== 'GAP').length}/{sh.minStaff}
                            </span>
                          </td>
                          <td className="px-10 py-10">
                            {(sh.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean).map(f => (
                              <div key={f!.id} className="text-[10px] font-black uppercase text-slate-600 bg-slate-100/50 border border-slate-200/50 px-4 py-2 rounded-xl mb-2 flex items-center gap-3">
                                <Plane size={14} className="text-blue-500" />{f!.flightNumber}
                              </div>
                            ))}
                            {(sh.flightIds || []).length === 0 && (
                               <div className="text-[9px] font-black uppercase text-slate-300 italic">Base Operations</div>
                            )}
                          </td>
                          <td className="px-10 py-10">
                            <div className="flex flex-wrap gap-4">
                              {assigs.length > 0 ? assigs.map(a => {
                                const isGap = !a.staffId || a.staffId === 'GAP';
                                const s = isGap ? null : getStaffById(a.staffId);
                                const label = getRoleLabel([a.role]);
                                return (
                                  <div key={a.id} className={`px-5 py-4 rounded-2xl border shadow-sm transition-all hover:scale-105 ${isGap ? 'bg-white border-dashed border-rose-300 text-rose-500' : label !== 'Duty' ? 'bg-slate-950 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-900'}`}>
                                    <div className="flex items-center gap-2">
                                       {isGap && <UserX size={14} />}
                                       <span className="text-xl font-black italic tracking-tighter">{isGap ? 'GAP' : (s?.initials || '??')}</span>
                                    </div>
                                    <span className={`text-[7px] font-black uppercase block opacity-60 tracking-widest mt-1`}>{label}</span>
                                  </div>
                                );
                              }) : (
                                <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center gap-3">
                                  <UserX size={18} className="text-slate-300" />
                                  <span className="text-[9px] font-black uppercase text-slate-300 italic">No Allocation Found</span>
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

              <div className="bg-slate-50/50 p-12 border-t border-slate-200">
                <h4 className="text-xl font-black uppercase italic mb-8 flex items-center gap-4 text-slate-950">
                  <CalendarOff className="text-slate-400" /> REGISTRY EXCLUSIONS & LEAVE COUNTERS
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
                  {['DAY OFF', 'ROSTER LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE', 'LIEU LEAVE', 'NIL'].map(cat => (
                    <div key={cat} className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
                      <h5 className="text-[9px] font-black text-slate-400 uppercase mb-5 border-b border-slate-50 pb-3 tracking-[0.15em]">{cat}</h5>
                      <div className="flex flex-wrap gap-2">
                        {(program.offDuty || []).filter(off => off.type === cat).map(off => {
                          const s = getStaffById(off.staffId);
                          const count = getCumulativeAbsenceCount(off.staffId, program.day || 0);
                          return (
                            <div key={off.staffId} className="flex flex-col items-center">
                              <span className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-black italic text-slate-950 flex flex-col items-center gap-1">
                                {s?.initials || '??'}
                                <span className="text-[8px] text-blue-600 not-italic border-t border-slate-200 w-full text-center pt-1 mt-1">
                                  {count.toString().padStart(2, '0')}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                        {(program.offDuty || []).filter(off => off.type === cat).length === 0 && (
                          <span className="text-[9px] font-black text-slate-200 uppercase italic">Clean</span>
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
