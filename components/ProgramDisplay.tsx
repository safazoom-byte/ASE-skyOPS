
import React, { useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarOff, Activity, FileText, Plane, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

  const getRoleLabel = (roles: string[]) => {
    const specialistMap: Record<string, string> = {
      'Shift Leader': 'SL',
      'Load Control': 'LC',
      'Ramp': 'RMP',
      'Lost and Found': 'LF',
      'Operations': 'OPS'
    };
    
    const matrixRoles = roles.map(r => {
      const trimmed = r.trim();
      if (specialistMap[trimmed]) return specialistMap[trimmed];
      return 'Duty';
    });
    
    const unique = Array.from(new Set(matrixRoles));
    if (unique.length > 1) {
       const specialistsOnly = unique.filter(u => u !== 'Duty');
       return specialistsOnly.length > 0 ? specialistsOnly.join(' + ') : 'Duty';
    }
    
    return unique[0] || 'Duty';
  };

  const formatStaffDisplay = (s?: Staff) => s?.initials || "??";

  const getDayName = (dayIndex: any) => {
    const idx = Number(dayIndex);
    if (isNaN(idx) || !startDate) return `Day ${dayIndex}`;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + idx);
    return DAYS_OF_WEEK[d.getDay()];
  };

  const getDayDate = (dayIndex: any) => {
    const idx = Number(dayIndex);
    if (isNaN(idx) || !startDate) return `Day ${dayIndex}`;
    const start = new Date(startDate + 'T00:00:00');
    const result = new Date(start);
    result.setDate(start.getDate() + idx);
    return result.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formattedStartDate = startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";
  const formattedEndDate = endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";

  const leaveCategories: { type: LeaveType; label: string }[] = [
    { type: 'DAY OFF', label: 'DAYS OFF' },
    { type: 'ROSTER LEAVE', label: 'ROSTER LEAVE' },
    { type: 'ANNUAL LEAVE', label: 'ANNUAL LEAVE' },
    { type: 'SICK LEAVE', label: 'SICK LEAVE' },
    { type: 'LIEU LEAVE', label: 'LIEU LEAVE' },
    { type: 'NIL', label: 'AVAILABLE (NIL)' }
  ];

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`SkyOPS Station Handling Program`, 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formattedStartDate} — ${formattedEndDate}`, 14, 20);

    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      const dayHeader = `${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`;
      doc.text(dayHeader, 14, 30);

      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'unassigned';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });

      const assignmentTableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightIds = sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)));
        const flightList = flightIds.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        
        const staffMap = new Map<string, string[]>();
        assigs.forEach(a => {
          const s = getStaffById(a.staffId);
          if (s) {
            const current = staffMap.get(s.initials) || [];
            if (!current.includes(a.role)) current.push(a.role);
            staffMap.set(s.initials, current);
          }
        });

        const staffAndRoles = Array.from(staffMap.entries())
          .map(([init, roles]) => `${init} (${getRoleLabel(roles)})`)
          .join(' | ');
        
        const headcount = `${Array.from(staffMap.keys()).length} / ${sh?.maxStaff || sh?.minStaff || '?'}`;
        return [idx + 1, sh?.pickupTime || '--:--', sh?.endTime || '--:--', flightList, headcount, staffAndRoles];
      });

      autoTable(doc, {
        startY: 35,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC/MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: assignmentTableData,
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { bottom: 10 }
      });

      const finalY = (doc as any).lastAutoTable.finalY || 35;
      const leaveHeaderY = finalY + 15;
      
      if (leaveHeaderY > 185) {
        doc.addPage('l', 'mm', 'a4');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`ABSENCE AND LEAVES REGISTRY - ${dayHeader}`, 14, 20);
      } else {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('ABSENCE AND LEAVES REGISTRY', 14, leaveHeaderY);
      }

      const leaveTableData = leaveCategories.map(cat => {
        const list = (program.offDuty || [])
          .filter(off => off.type === cat.type)
          .map(off => getStaffById(off.staffId))
          .filter(Boolean)
          .map(s => formatStaffDisplay(s as Staff))
          .join(', ');
        
        return [cat.label, list || 'NONE'];
      });

      autoTable(doc, {
        startY: (leaveHeaderY > 185 ? 25 : leaveHeaderY + 5),
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: leaveTableData,
        headStyles: { fillColor: [71, 85, 105] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold' },
          1: { cellWidth: 'auto' }
        },
        theme: 'grid'
      });
    });

    doc.save(`SkyOPS_Station_Program_${formattedStartDate}.pdf`);
  };

  if (!sortedPrograms.length) return (
    <div className="py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center space-y-8">
      <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center">
        <Activity size={48} className="animate-pulse" />
      </div>
      <div><h5 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Operational Plan Missing</h5><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 max-w-sm mx-auto leading-relaxed">Initialize the build sequence to view the station program.</p></div>
    </div>
  );

  return (
    <div className="space-y-16 animate-in fade-in duration-700 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div><h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Station Handling Program</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formattedStartDate} — {formattedEndDate}</p></div>
        <button onClick={exportPDF} className="px-8 py-5 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase flex items-center gap-4 shadow-xl active:scale-95 transition-all"><FileText size={20} /> PDF EXPORT</button>
      </div>

      <div className="space-y-24">
        {sortedPrograms.map((program) => {
          const assignmentsByShift: Record<string, Assignment[]> = {};
          (program.assignments || []).forEach(a => {
            const sid = a.shiftId || 'unassigned';
            if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
            assignmentsByShift[sid].push(a);
          });

          const dateString = getDayDate(program.day);
          const flightsOnThisDay = flights.filter(f => {
            const fDate = new Date(f.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return fDate === dateString;
          });
          const assignedFlightIds = new Set(program.assignments.map(a => a.flightId));
          const unassignedFlights = flightsOnThisDay.filter(f => !assignedFlightIds.has(f.id));

          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white border-b border-white/5">
                <div className="flex items-center gap-10"><div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10">{Number(program.day) + 1}</div><div><h3 className="text-3xl font-black uppercase italic tracking-tight mb-1">{getDayName(program.day)}</h3><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p></div></div>
              </div>

              <div className="flex flex-col">
                {unassignedFlights.length > 0 && (
                  <div className="bg-rose-500/10 p-8 border-b border-rose-500/20 animate-pulse flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 text-rose-600">
                      <AlertTriangle size={24} />
                      <div>
                        <p className="text-xs font-black uppercase italic tracking-tighter">ALERT: UNCOVERED FLIGHTS</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Missing from Handling Sequence</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {unassignedFlights.map(f => (
                        <div key={f.id} className="bg-rose-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase italic shadow-lg shadow-rose-600/20">
                          {f.flightNumber}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto no-scrollbar border-b border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="px-6 py-6 border-r border-slate-100 text-center w-16">S/N</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-32">PICKUP</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-32">RELEASE</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-32 text-center">HC / MAX</th>
                        <th className="px-8 py-6 border-r border-slate-100">FLIGHTS</th>
                        <th className="px-8 py-6">PERSONNEL & ROLES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
                        const sh = getShiftById(sid);
                        const uniqueFlights = (sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)))).map(fid => getFlightById(fid)).filter(Boolean);
                        const staffRolesMap = new Map<string, string[]>();
                        assigs.forEach(a => {
                          const current = staffRolesMap.get(a.staffId) || [];
                          if (!current.includes(a.role)) current.push(a.role);
                          staffRolesMap.set(a.staffId, current);
                        });
                        const assignedIds = Array.from(staffRolesMap.keys());
                        const isAtMax = sh && assignedIds.length >= sh.maxStaff;

                        return (
                          <tr key={sid} className="hover:bg-slate-50/50 transition-colors align-top">
                            <td className="px-6 py-8 border-r border-slate-100 text-center font-black text-slate-300 italic text-xl">{idx + 1}</td>
                            <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-xl italic">{sh?.pickupTime || '--:--'}</td>
                            <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-xl italic">{sh?.endTime || '--:--'}</td>
                            <td className="px-6 py-8 border-r border-slate-100 text-center">
                              <div className={`flex flex-col items-center ${isAtMax ? 'text-emerald-600' : 'text-slate-900'}`}>
                                <span className="font-black text-lg italic leading-none">{assignedIds.length} / {sh?.maxStaff || '?'}</span>
                                {isAtMax && <CheckCircle2 size={12} className="mt-1" />}
                                <span className="text-[7px] font-black uppercase tracking-widest mt-1 opacity-40">Target Reached</span>
                              </div>
                            </td>
                            <td className="px-8 py-8 border-r border-slate-100"><div className="space-y-3">{uniqueFlights.map(f => (<div key={f!.id} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 bg-slate-100/50 px-3 py-2 rounded-xl border border-slate-100"><Plane size={12} className="text-indigo-400" />{f!.flightNumber}</div>))}</div></td>
                            <td className="px-8 py-8"><div className="flex flex-wrap gap-3">{assignedIds.map(staffId => {
                                  const s = getStaffById(staffId);
                                  const roles = staffRolesMap.get(staffId) || ["Duty"];
                                  const roleLabel = getRoleLabel(roles);
                                  const isSpecialist = roleLabel !== 'Duty';
                                  return (
                                    <div key={staffId} className={`px-6 py-4 rounded-[2rem] border shadow-lg flex flex-col min-w-[140px] transition-transform hover:scale-105 ${isSpecialist ? 'bg-slate-950 text-white border-white/5' : 'bg-white border-slate-200 text-slate-900'}`}>
                                      <div className="flex items-center gap-3"><Shield size={14} className={isSpecialist ? 'text-blue-400' : 'text-slate-300'} /><span className="text-lg font-black italic uppercase tracking-tighter">{formatStaffDisplay(s)}</span></div>
                                      <div className="flex flex-wrap gap-1 mt-1"><span className={`text-[8px] font-black uppercase tracking-widest ${isSpecialist ? 'opacity-60' : 'text-slate-400'}`}>{roleLabel}</span></div>
                                    </div>
                                  );
                                })}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50/50 p-12 space-y-12 border-t border-slate-200">
                   <h4 className="text-lg font-black uppercase italic tracking-tighter flex items-center gap-4 text-slate-950"><CalendarOff size={24} className="text-slate-400" /> ABSENCE AND LEAVES REGISTRY</h4>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">{leaveCategories.map(cat => {
                        const list = (program.offDuty || []).filter(off => off.type === cat.type).map(off => getStaffById(off.staffId)).filter(Boolean);
                        return (
                          <div key={cat.type} className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-xl flex flex-col gap-6 group hover:border-slate-400 transition-colors"><h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-4 group-hover:text-slate-900">{cat.label}</h5><div className="flex flex-wrap gap-2 min-h-[50px]">{list.length > 0 ? list.map((s, i) => (<div key={i} className="px-5 py-3 bg-slate-950 text-white rounded-2xl font-black text-xs italic shadow-lg">{formatStaffDisplay(s as Staff)}</div>)) : (<span className="text-[9px] font-black text-slate-200 uppercase italic self-center">None</span>)}</div></div>
                        );
                      })}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
