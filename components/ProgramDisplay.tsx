import React, { useState, useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarOff, Users, Activity, FileText, FileDown, Clock, Plane, Shield, Briefcase, Zap, MapPin, Tag, UserCheck, User } from 'lucide-react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  aiRecommendations?: ResourceRecommendation | null;
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, startDate, endDate }) => {
  const sortedPrograms = useMemo(() => {
    return Array.isArray(programs) ? [...programs].sort((a, b) => a.day - b.day) : [];
  }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const formatStaffDisplay = (s?: Staff) => s?.initials || "??";

  const getDayName = (dayIndex: number) => {
    if (!startDate) return `Day ${dayIndex}`;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + dayIndex);
    return DAYS_OF_WEEK[d.getDay()];
  };

  const getDayDate = (dayIndex: number) => {
    if (!startDate) return `Day ${dayIndex}`;
    const start = new Date(startDate + 'T00:00:00');
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formattedStartDate = startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";
  const formattedEndDate = endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";

  const leaveMapping: Record<string, string> = {
    'DAY OFF': 'Days off',
    'ROSTER LEAVE': 'Roster leaves',
    'ANNUAL LEAVE': 'Annual Leave',
    'SICK LEAVE': 'Sick Leave',
    'LIEU LEAVE': 'Lieu Leave'
  };

  const leaveCategories = Object.keys(leaveMapping);

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text(`ASE SDU Weekly Program: ${formattedStartDate} - ${formattedEndDate}`, 14, 15);

    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, 20);

      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'no-shift';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });

      const tableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightIds = sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)));
        const flightList = flightIds.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        
        // Include full role name in PDF export
        const staffAndRoles = Array.from(new Set(assigs.map(a => {
          const s = getStaffById(a.staffId);
          return `${s?.initials || '??'} (${a.role})`;
        }))).join(' | ');

        return [idx + 1, sh?.pickupTime || '--:--', sh?.endTime || '--:--', flightList, staffAndRoles];
      });

      autoTable(doc, {
        startY: 25,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'PERSONNEL (ROLE)']],
        body: tableData,
        headStyles: { fillColor: [15, 23, 42] },
        theme: 'striped'
      });

      const leavesData = (program.offDuty || []).map((off, idx) => {
        const s = getStaffById(off.staffId);
        return [idx + 1, s?.name || 'Unknown', s?.initials || '??', leaveMapping[off.type] || off.type];
      });

      if (leavesData.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY || 30;
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("ABSENCE AND LEAVES REGISTRY", 14, finalY + 12);
        autoTable(doc, {
          startY: finalY + 15,
          head: [['S/N', 'STAFF NAME', 'ID', 'LEAVE CATEGORY']],
          body: leavesData,
          headStyles: { fillColor: [71, 85, 105] },
          theme: 'grid'
        });
      }
    });
    doc.save(`ASE_SkyOPS_Program_${formattedStartDate}.pdf`);
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const rows: any[][] = [[`ASE SDU Weekly Program: ${formattedStartDate} - ${formattedEndDate}`]];
    sortedPrograms.forEach(program => {
      rows.push([]);
      rows.push([`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`]);
      rows.push(["S/N", "PICKUP", "RELEASE", "FLIGHTS", "PERSONNEL (ROLE)"]);
      const assignmentsByShift: Record<string, Assignment[]> = {};
      (program.assignments || []).forEach(a => {
        const sid = a.shiftId || 'no-shift';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });
      Object.entries(assignmentsByShift).forEach(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightIds = sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)));
        const flightList = flightIds.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ');
        const staffList = Array.from(new Set(assigs.map(a => {
          const s = getStaffById(a.staffId);
          return `${s?.initials || '??'} (${a.role})`;
        }))).join(' | ');
        rows.push([idx + 1, sh?.pickupTime || '--', sh?.endTime || '--', flightList, staffList]);
      });
    });
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Operational Program");
    XLSX.writeFile(workbook, `ASE_SkyOPS_Program_${formattedStartDate.replace(/\//g, '-')}.xlsx`);
  };

  if (!sortedPrograms.length) return (
    <div className="py-32 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
      <Activity size={64} className="text-slate-100 mb-8 animate-pulse" />
      <h5 className="text-2xl font-black text-slate-300 uppercase italic tracking-tighter">Operational Plan Pending</h5>
    </div>
  );

  return (
    <div className="space-y-16 animate-in fade-in duration-700 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Weekly Shift Program</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-0.3em">{formattedStartDate} — {formattedEndDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={exportPDF} className="px-8 py-5 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase italic flex items-center gap-4 shadow-2xl active:scale-95 transition-all">
            <FileText size={20} /> DOWNLOAD PDF
          </button>
          <button onClick={exportExcel} className="px-8 py-5 bg-emerald-600 text-white rounded-[2rem] text-[11px] font-black uppercase italic flex items-center gap-4 shadow-2xl active:scale-95 transition-all">
            <FileDown size={22} /> DOWNLOAD EXCEL
          </button>
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
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl group">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white border-b border-white/5">
                <div className="flex items-center gap-10">
                   <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10 shadow-inner">
                     {/* Fix: Explicitly cast day to number/any to avoid '+' operator errors on 'unknown' types on line 278 */}
                     {(program.day as any) + 1}
                   </div>
                   <div>
                     <h3 className="text-3xl font-black uppercase italic tracking-tight mb-1">{getDayName(program.day)}</h3>
                     <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p>
                   </div>
                </div>
              </div>

              <div className="flex flex-col min-h-[500px]">
                <div className="overflow-x-auto no-scrollbar border-b border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-0.2em border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="px-6 py-6 border-r border-slate-100 text-center w-16">S/N</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-24">PICKUP</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-24">RELEASE</th>
                        <th className="px-6 py-6 border-r border-slate-100 w-32">STRENGTH</th>
                        <th className="px-8 py-6 border-r border-slate-100">FLIGHTS COVERED</th>
                        <th className="px-8 py-6">ASSIGNED PERSONNEL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(assignmentsByShift).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-8 py-12 text-center text-[10px] font-black uppercase text-slate-300 italic">No Assignments Registered</td>
                        </tr>
                      ) : Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
                        const sh = getShiftById(sid);
                        const uniqueFlights = (sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)))).map(fid => getFlightById(fid)).filter(Boolean);
                        const uniqueStaffIds = Array.from(new Set(assigs.map(a => a.staffId)));
                        const isUnderMin = sh && uniqueStaffIds.length < sh.minStaff;
                        const isFull = sh && uniqueStaffIds.length >= sh.maxStaff;

                        return (
                          <tr key={sid} className="hover:bg-slate-50/50 transition-colors align-top">
                            <td className="px-6 py-8 border-r border-slate-100 text-center font-black text-slate-300 italic text-xl">{idx + 1}</td>
                            <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-lg italic tracking-tighter">
                               {sh?.pickupTime || '--:--'}
                            </td>
                            <td className="px-6 py-8 border-r border-slate-100 font-black text-slate-900 text-lg italic tracking-tighter">
                               {sh?.endTime || '--:--'}
                            </td>
                            <td className="px-6 py-8 border-r border-slate-100">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <UserCheck size={14} className={isUnderMin ? 'text-amber-500' : 'text-emerald-500'} />
                                  <span className="font-black text-sm italic">{uniqueStaffIds.length} <span className="text-slate-300">/</span> {sh?.maxStaff || '8'}</span>
                                </div>
                                {isUnderMin && <div className="text-[7px] font-black uppercase tracking-widest text-amber-500">SHORT STAFFED</div>}
                                {isFull && <div className="text-[7px] font-black uppercase tracking-widest text-emerald-500">FULL STRENGTH</div>}
                              </div>
                            </td>
                            <td className="px-8 py-8 border-r border-slate-100">
                              <div className="grid grid-cols-1 gap-4">
                                {uniqueFlights.map(f => (
                                  <div key={f!.id} className="p-4 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col gap-2 group/flight hover:border-indigo-200 hover:bg-white transition-all">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <Plane size={14} className="text-indigo-400" />
                                        <span className="text-sm font-black italic uppercase text-slate-900">{f!.flightNumber}</span>
                                      </div>
                                      <div className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-lg text-[7px] font-black uppercase tracking-widest">{f!.type}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100/50 pt-2">
                                      <div>
                                        <span className="block opacity-50 text-[7px] mb-0.5">STA</span>
                                        <span className="text-slate-900 font-black italic">{f!.sta || '--:--'}</span>
                                      </div>
                                      <div>
                                        <span className="block opacity-50 text-[7px] mb-0.5">STD</span>
                                        <span className="text-slate-900 font-black italic">{f!.std || '--:--'}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[8px] font-black text-indigo-500 bg-indigo-50/50 p-2 rounded-xl mt-1">
                                      <MapPin size={10} />
                                      {f!.from} <span className="text-slate-300">→</span> {f!.to}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-8 py-8">
                              <div className="flex flex-wrap gap-4">
                                {uniqueStaffIds.map(staffId => {
                                  const s = getStaffById(staffId);
                                  // Find the specific assignment for this staff in this shift
                                  const staffAssignments = assigs.filter(as => as.staffId === staffId);
                                  const primaryRole = staffAssignments[0]?.role || "Operational";
                                  const isLeader = primaryRole === 'Shift Leader';
                                  
                                  const staffFlights = Array.from(new Set(
                                    staffAssignments.map(as => getFlightById(as.flightId)?.flightNumber).filter(Boolean)
                                  ));

                                  return (
                                    <div key={staffId} className={`px-6 py-5 rounded-[2.5rem] font-black text-[10px] flex flex-col gap-3 border shadow-md min-w-[140px] ${isLeader ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-900 text-white border-slate-950'}`}>
                                      <div className="flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            {isLeader && <Shield size={14} className="text-blue-200" />}
                                            <span className="text-xl italic uppercase tracking-tighter">{formatStaffDisplay(s)}</span>
                                          </div>
                                          {/* Explicit Full Role Name Display */}
                                          <span className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${isLeader ? 'text-blue-100' : 'text-slate-400'}`}>
                                            {primaryRole}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-40 text-[7px] font-bold uppercase tracking-widest bg-white/10 px-2 py-1 rounded-lg">
                                          <Clock size={8} /> 12h+
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-1 border-t border-white/10 pt-3">
                                        {staffFlights.map(fNum => (
                                          <div key={fNum} className="px-2 py-0.5 bg-white/10 rounded-lg flex items-center gap-1">
                                            <Tag size={8} className="opacity-50" />
                                            <span className="text-[7px] tracking-widest">{fNum}</span>
                                          </div>
                                        ))}
                                        {staffFlights.length === 0 && <span className="text-[7px] text-white/40 italic uppercase">Operational Support</span>}
                                      </div>
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

                <div className="bg-slate-50/50 p-12 space-y-10">
                   <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic flex items-center gap-4">
                        <CalendarOff size={24} className="text-slate-400" /> ABSENCE AND LEAVES REGISTRY
                      </h4>
                      <div className="px-4 py-1 bg-slate-200 text-slate-600 rounded-lg text-[8px] font-black uppercase tracking-widest">STRICT RESTRICTION</div>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
                      {leaveCategories.map(cat => {
                        const list = (program.offDuty || []).filter(off => off.type === cat).map(off => getStaffById(off.staffId)).filter(Boolean);
                        return (
                          <div key={cat} className="space-y-4 p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm">
                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-slate-50 pb-2">{leaveMapping[cat]}</p>
                            <div className="flex flex-wrap gap-2">
                              {list.length > 0 ? list.map((s, i) => (
                                <div key={i} className="px-3 py-2 bg-slate-950 text-white rounded-xl font-black text-[10px] italic flex items-center gap-2">
                                  {formatStaffDisplay(s)}
                                </div>
                              )) : <span className="text-[9px] font-bold text-slate-200 italic uppercase">Operational</span>}
                            </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};