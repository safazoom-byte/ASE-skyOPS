import React, { useState, useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarOff, Users, Activity, FileText, FileDown, Clock, Plane, Shield, Briefcase, Zap, MapPin, Tag, UserCheck, User, AlertCircle } from 'lucide-react';

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
    return Array.isArray(programs) ? [...programs].sort((a, b) => {
      const dayA = Number(a.day);
      const dayB = Number(b.day);
      return (isNaN(dayA) ? 0 : dayA) - (isNaN(dayB) ? 0 : dayB);
    }) : [];
  }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

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
        
        // Group by staff for table rows
        const staffMap = new Map<string, string[]>();
        assigs.forEach(a => {
          const s = getStaffById(a.staffId);
          if (s) {
            const current = staffMap.get(s.initials) || [];
            if (!current.includes(a.role)) current.push(a.role);
            staffMap.set(s.initials, current);
          }
        });

        const staffAndRoles = Array.from(staffMap.entries()).map(([init, roles]) => `${init} (${roles.join(' + ')})`).join(' | ');
        return [idx + 1, sh?.pickupTime || '--:--', sh?.endTime || '--:--', flightList, staffAndRoles];
      });

      autoTable(doc, {
        startY: 25,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'PERSONNEL (ROLE)']],
        body: tableData,
        headStyles: { fillColor: [15, 23, 42] },
        theme: 'striped'
      });
    });
    doc.save(`ASE_SkyOPS_Program_${formattedStartDate}.pdf`);
  };

  if (!sortedPrograms.length) return (
    <div className="py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center space-y-8">
      <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center">
        <Activity size={48} className="animate-pulse" />
      </div>
      <div>
        <h5 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Operational Plan Missing</h5>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2 max-w-sm mx-auto leading-relaxed">
          The program is currently empty. Please ensure you have:
        </p>
        <ul className="text-[10px] text-slate-500 font-black uppercase mt-6 space-y-3 text-left w-fit mx-auto list-disc list-inside">
          <li>Imported Flights for this range</li>
          <li>Defined Duty Slots in "Duty Master"</li>
          <li>Registered Staff in "Manpower"</li>
          <li>Clicked "Initiate Build Sequence"</li>
        </ul>
      </div>
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

          const rawDay = Number(program.day);
          const dayNumber = isNaN(rawDay) ? "?" : rawDay + 1;

          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl group">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white border-b border-white/5">
                <div className="flex items-center gap-10">
                   <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10 shadow-inner">
                     {dayNumber}
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
                          <td colSpan={6} className="px-8 py-24 text-center">
                            <div className="flex flex-col items-center gap-4">
                              <AlertCircle size={32} className="text-slate-200" />
                              <p className="text-[10px] font-black uppercase text-slate-300 italic">No Operational Assignments Created For This Day</p>
                            </div>
                          </td>
                        </tr>
                      ) : Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
                        const sh = getShiftById(sid);
                        const uniqueFlights = (sh?.flightIds || Array.from(new Set(assigs.map(a => a.flightId)))).map(fid => getFlightById(fid)).filter(Boolean);
                        
                        // Map staff to their consolidated roles
                        const staffRolesMap = new Map<string, string[]>();
                        assigs.forEach(a => {
                          const current = staffRolesMap.get(a.staffId) || [];
                          if (!current.includes(a.role)) current.push(a.role);
                          staffRolesMap.set(a.staffId, current);
                        });

                        const uniqueStaffIds = Array.from(staffRolesMap.keys());
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
                                  const roles = staffRolesMap.get(staffId) || ["Operational"];
                                  const isLeader = roles.includes('Shift Leader');
                                  const isMulti = roles.length > 1;

                                  return (
                                    <div key={staffId} className={`px-6 py-5 rounded-[2.5rem] font-black text-[10px] flex flex-col gap-3 border shadow-md min-w-[140px] ${isLeader ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-900 text-white border-slate-950'}`}>
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          {isLeader && <Shield size={14} className="text-blue-200" />}
                                          <span className="text-xl italic uppercase tracking-tighter">{formatStaffDisplay(s)}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {roles.map(r => (
                                            <span key={r} className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${isLeader ? 'bg-white/10 text-blue-100' : 'bg-white/5 text-slate-400'}`}>
                                              {r}
                                            </span>
                                          ))}
                                        </div>
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
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
                      {leaveCategories.map(cat => {
                        const list = (program.offDuty || []).filter(off => off.type === cat).map(off => getStaffById(off.staffId)).filter(Boolean);
                        return (
                          <div key={cat} className="space-y-4 p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm">
                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-slate-50 pb-2">{leaveMapping[cat]}</p>
                            <div className="flex flex-wrap gap-2">
                              {list.length > 0 ? list.map((s, i) => (
                                <div key={i} className="px-3 py-2 bg-slate-950 text-white rounded-xl font-black text-[10px] italic">
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