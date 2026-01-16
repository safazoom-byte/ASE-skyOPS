import React, { useState, useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, OffDutyRecord } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { Sparkles, TrendingUp, FileDown, ShieldCheck, CalendarOff, Shield, Users, Activity } from 'lucide-react';

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

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, startDate, endDate, aiRecommendations }) => {
  const sortedPrograms = useMemo(() => {
    return [...programs].sort((a, b) => a.day - b.day);
  }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const getDayName = (dayIndex: number) => {
    if (!startDate) return `Day ${dayIndex}`;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    return DAYS_OF_WEEK[d.getDay()];
  };

  const getDayDate = (dayIndex: number) => {
    if (!startDate) return `Day ${dayIndex}`;
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";
  const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not Set";

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const rows: any[] = [];
    
    rows.push([`ASE SDU Weekly Program From ${formattedStartDate} Till ${formattedEndDate}`]);
    rows.push([]);

    sortedPrograms.forEach(program => {
      rows.push([`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`]);
      rows.push(["S/N", "Flight No/Day", "From", "STA", "STD", "To", "SHIFT SLOT", "SDU Staff Assignment", "OFF & LEAVES"]);

      const dayAssignments = [...program.assignments];
      const flightGroups = Array.from(new Set(dayAssignments.map(a => a.flightId)));
      
      flightGroups.forEach((fId, idx) => {
        const f = getFlightById(fId);
        const flightAssigs = dayAssignments.filter(a => a.flightId === fId).sort((a, b) => a.role === 'Shift Leader' ? -1 : 1);
        const staffInitials = flightAssigs.map(a => getStaffById(a.staffId)?.initials).join(' - ');
        const sh = getShiftById(flightAssigs[0]?.shiftId);

        rows.push([
          idx + 1,
          f?.flightNumber || "-",
          f?.from || "-",
          f?.sta || "-",
          f?.std || "-",
          f?.to || "-",
          sh?.pickupTime || "-",
          staffInitials,
          ""
        ]);
      });

      const leaveCategories = ['DAY OFF', 'ROSTER LEAVE', 'LIEU LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE'];
      leaveCategories.forEach(cat => {
        const inCat = (program.offDuty || [])
          .filter(off => off.type === cat)
          .map(off => getStaffById(off.staffId)?.initials)
          .join(' - ');
        rows.push(["", "", "", "", "", "", "", "", `${cat}: ${inCat || 'NIL'}`]);
      });
      rows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Station_Program");
    XLSX.writeFile(workbook, `ASE_SDU_Program_${formattedStartDate.replace(/\//g, '-')}.xlsx`);
  };

  if (!programs || programs.length === 0) {
    return (
      <div className="py-32 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
        <Activity size={64} className="text-slate-100 mb-8 animate-pulse" />
        <h5 className="text-2xl font-black text-slate-300 uppercase italic tracking-tighter">Operational Plan Pending</h5>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">Execute a build from the Command Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-16 animate-in fade-in duration-700 pb-32">
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-10">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Weekly Station Program</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{formattedStartDate} — {formattedEndDate}</p>
        </div>
        <button onClick={exportExcel} className="px-10 py-5 bg-emerald-600 text-white rounded-[2rem] text-[11px] font-black uppercase italic flex items-center gap-4 shadow-2xl shadow-emerald-600/20 active:scale-95 transition-all">
          <FileDown size={22} /> DOWNLOAD MASTER DOCUMENT
        </button>
      </div>

      <div className="space-y-24">
        {sortedPrograms.map((program) => {
          const dayAssignments = [...(program.assignments || [])];
          const flightsOfDay = Array.from(new Set(dayAssignments.map(a => a.flightId)));

          return (
            <div key={program.day} className="bg-white rounded-[4rem] overflow-hidden border border-slate-200 shadow-2xl group">
              <div className="bg-slate-950 px-12 py-10 flex items-center justify-between text-white border-b border-white/5">
                <div className="flex items-center gap-10">
                   <div className="w-20 h-20 bg-white/5 rounded-[2.5rem] flex items-center justify-center font-black italic text-3xl border border-white/10 shadow-inner">
                     {program.day + 1}
                   </div>
                   <div>
                     <h3 className="text-3xl font-black uppercase italic tracking-tight mb-1">{getDayName(program.day)}</h3>
                     <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{getDayDate(program.day)}</p>
                   </div>
                </div>
                <div className="hidden md:flex items-center gap-6">
                   <div className="text-right">
                     <span className="text-[9px] font-black text-slate-600 uppercase block mb-1">Status</span>
                     <span className="text-emerald-400 font-black italic text-sm">OPERATIONAL</span>
                   </div>
                   <div className="h-10 w-px bg-white/10" />
                   <div className="text-right">
                     <span className="text-[9px] font-black text-slate-600 uppercase block mb-1">Assignments</span>
                     <span className="text-white font-black italic text-sm">{dayAssignments.length} Mapped</span>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-4 min-h-[500px]">
                {/* Station Assignment Table */}
                <div className="xl:col-span-3 overflow-x-auto no-scrollbar border-r border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="px-8 py-6 border-r border-slate-100 text-center w-20">S/N</th>
                        <th className="px-8 py-6 border-r border-slate-100">FLT NO</th>
                        <th className="px-8 py-6 border-r border-slate-100">SECTOR</th>
                        <th className="px-8 py-6 border-r border-slate-100 text-center">STA/STD</th>
                        <th className="px-8 py-6 border-r border-slate-100 text-center">SHIFT</th>
                        <th className="px-8 py-6">ASSIGNED PERSONNEL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {flightsOfDay.map((fId, idx) => {
                        const f = getFlightById(fId);
                        const flightAssigs = dayAssignments.filter(a => a.flightId === fId).sort((a, b) => a.role === 'Shift Leader' ? -1 : 1);
                        const sh = getShiftById(flightAssigs[0]?.shiftId);

                        return (
                          <tr key={fId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-8 border-r border-slate-100 text-center font-black text-slate-300 italic text-xl">{idx + 1}</td>
                            <td className="px-8 py-8 border-r border-slate-100 font-black italic text-slate-900 text-lg uppercase tracking-tighter">{f?.flightNumber || "---"}</td>
                            <td className="px-8 py-8 border-r border-slate-100 font-black text-slate-500 text-xs uppercase italic">{f ? `${f.from} → ${f.to}` : "BASE"}</td>
                            <td className="px-8 py-8 border-r border-slate-100 text-center font-black text-slate-900 text-sm italic">
                              {f?.sta || "--"} / {f?.std || "--"}
                            </td>
                            <td className="px-8 py-8 border-r border-slate-100 text-center font-black text-indigo-600 text-sm italic">
                              {sh ? sh.pickupTime : "---"}
                            </td>
                            <td className="px-8 py-8">
                              <div className="flex flex-wrap gap-3">
                                {flightAssigs.map(a => {
                                  const s = getStaffById(a.staffId);
                                  const isLeader = a.role === 'Shift Leader';
                                  return (
                                    <div key={a.id} className={`px-4 py-2 rounded-2xl font-black text-[10px] flex items-center gap-3 border transition-all hover:scale-105 shadow-sm ${
                                      isLeader ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-800 text-white'
                                    }`}>
                                      {isLeader && <Shield size={14} className="text-blue-200" />}
                                      {s?.initials || "??"}
                                      <span className="opacity-40 font-bold uppercase text-[7px] tracking-widest">{a.role.substring(0, 3)}</span>
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

                {/* SDU OFF & LEAVES Operational Sidebar */}
                <div className="xl:col-span-1 bg-slate-50/30 p-10 space-y-10 border-t xl:border-t-0 border-slate-100">
                  <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-200">
                      <CalendarOff size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic">OFF & LEAVES</h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Planned Absence Registry</p>
                    </div>
                  </div>
                  
                  <div className="space-y-10">
                    {['DAY OFF', 'ROSTER LEAVE', 'LIEU LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE'].map(cat => {
                      const list = (program.offDuty || [])
                        .filter(off => off.type === cat)
                        .map(off => getStaffById(off.staffId)?.initials)
                        .filter(Boolean);

                      return (
                        <div key={cat} className="space-y-4">
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-l-4 border-blue-600 pl-4 italic">{cat}</p>
                          <div className="flex flex-wrap gap-3 pl-4">
                            {list.length > 0 ? list.map((init, i) => (
                              <div key={i} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-[11px] text-slate-950 italic shadow-sm">
                                {init}
                              </div>
                            )) : <span className="text-[10px] font-bold text-slate-300 italic tracking-widest">NIL</span>}
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