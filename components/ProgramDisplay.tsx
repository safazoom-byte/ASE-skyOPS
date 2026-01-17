
import React, { useState, useMemo } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, Assignment } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarOff, Users, Activity, FileText, FileDown, Clock, Plane, Shield, Link2 } from 'lucide-react';

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
    return [...programs].sort((a, b) => a.day - b.day);
  }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

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

  const leaveCategories = ['DAY OFF', 'ROSTER LEAVE', 'LIEU LEAVE', 'ANNUAL LEAVE', 'SICK LEAVE'];

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const title = `ASE SDU Shift-Centric Program: ${formattedStartDate} - ${formattedEndDate}`;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 15);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);

    let startY = 25;

    sortedPrograms.forEach((program, pIdx) => {
      if (pIdx > 0) doc.addPage('l', 'mm', 'a4');
      if (pIdx > 0) startY = 15;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`, 14, startY);
      startY += 5;

      const assignmentsByShift: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        const sid = a.shiftId || 'no-shift';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });

      const tableData = Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const uniqueFlightIds = Array.from(new Set(assigs.map(a => a.flightId)));
        const flightList = uniqueFlightIds.map(fid => {
          const f = getFlightById(fid);
          return f ? `${f.flightNumber} (${f.sta || ''}/${f.std || ''})` : '';
        }).filter(Boolean).join(', ');

        const uniqueStaff = Array.from(new Set(assigs.map(a => a.staffId)));
        const staffList = uniqueStaff.map(sid => {
          const s = getStaffById(sid);
          const a = assigs.find(assig => assig.staffId === sid);
          return (s?.initials || '??') + (a?.coveringStaffId ? " (C)" : "");
        }).join(' | ');

        return [
          idx + 1,
          sh ? `${sh.pickupTime} - ${sh.endTime}` : "Unassigned",
          flightList,
          staffList
        ];
      });

      autoTable(doc, {
        startY: startY,
        head: [['S/N', 'SHIFT PERIOD', 'COVERED FLIGHTS', 'ASSIGNED PERSONNEL']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 35, fontStyle: 'bold' },
          2: { cellWidth: 60 },
          3: { cellWidth: 'auto' }
        }
      });

      // @ts-ignore
      startY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text("STATION OFF-DUTY LOG", 14, startY);
      startY += 5;

      const leaveData = leaveCategories.map(cat => {
        const inCat = (program.offDuty || [])
          .filter(off => off.type === cat)
          .map(off => getStaffById(off.staffId)?.initials)
          .join(', ');
        return [cat, inCat || 'NIL'];
      });

      autoTable(doc, {
        startY: startY,
        body: leaveData,
        theme: 'plain',
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } }
      });
    });

    doc.save(`ASE_ShiftProgram_${formattedStartDate.replace(/\//g, '-')}.pdf`);
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const rows: any[] = [[`ASE SDU Weekly Program: ${formattedStartDate} - ${formattedEndDate}`], []];

    sortedPrograms.forEach(program => {
      rows.push([`${getDayName(program.day).toUpperCase()} - ${getDayDate(program.day)}`]);
      rows.push(["S/N", "SHIFT SLOT", "FLIGHTS COVERED", "PERSONNEL", "OFF/LEAVE TYPE", "OFF/LEAVE STAFF"]);

      const assignmentsByShift: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        const sid = a.shiftId || 'no-shift';
        if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
        assignmentsByShift[sid].push(a);
      });

      Object.entries(assignmentsByShift).forEach(([sid, assigs], idx) => {
        const sh = getShiftById(sid);
        const flightNames = Array.from(new Set(assigs.map(a => getFlightById(a.flightId)?.flightNumber))).join(', ');
        const staffNames = Array.from(new Set(assigs.map(a => {
          const s = getStaffById(a.staffId);
          return (s?.initials || '??') + (a.coveringStaffId ? " (C)" : "");
        }))).join(' - ');
        rows.push([idx + 1, sh ? `${sh.pickupTime}-${sh.endTime}` : "N/A", flightNames, staffNames, "", ""]);
      });

      const leaves = program.offDuty || [];
      leaves.forEach(l => {
        rows.push(["", "", "", "", l.type, getStaffById(l.staffId)?.initials || ""]);
      });
      rows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Shift_Program");
    XLSX.writeFile(workbook, `ASE_ShiftProgram_${formattedStartDate.replace(/\//g, '-')}.xlsx`);
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
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-10">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Weekly Shift Program</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{formattedStartDate} — {formattedEndDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={exportPDF} className="px-8 py-5 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase italic flex items-center gap-4 shadow-2xl active:scale-95 transition-all">
            <FileText size={20} /> DOWNLOAD PDF
          </button>
          <button onClick={exportExcel} className="px-8 py-5 bg-emerald-600 text-white rounded-[2rem] text-[11px] font-black uppercase italic flex items-center gap-4 shadow-2xl shadow-emerald-600/20 active:scale-95 transition-all">
            <FileDown size={22} /> DOWNLOAD EXCEL
          </button>
        </div>
      </div>

      <div className="space-y-24">
        {sortedPrograms.map((program) => {
          const assignmentsByShift: Record<string, Assignment[]> = {};
          program.assignments.forEach(a => {
            const sid = a.shiftId || 'unassigned';
            if (!assignmentsByShift[sid]) assignmentsByShift[sid] = [];
            assignmentsByShift[sid].push(a);
          });

          const coverageAssignments = program.assignments.filter(a => a.coveringStaffId);

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
                   <div className="px-4 py-2 bg-rose-500/10 text-rose-400 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                     <Link2 size={12} /> Coverage Alerts Active
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-4 min-h-[500px]">
                <div className="xl:col-span-3 overflow-x-auto no-scrollbar border-r border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-200 text-[10px]">
                      <tr>
                        <th className="px-8 py-6 border-r border-slate-100 text-center w-20">S/N</th>
                        <th className="px-8 py-6 border-r border-slate-100">DUTY SHIFT</th>
                        <th className="px-8 py-6 border-r border-slate-100">FLIGHTS COVERED</th>
                        <th className="px-8 py-6">ASSIGNED PERSONNEL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(assignmentsByShift).map(([sid, assigs], idx) => {
                        const sh = getShiftById(sid);
                        const uniqueFlights = Array.from(new Set(assigs.map(a => a.flightId)))
                          .map(fid => getFlightById(fid))
                          .filter(Boolean);
                        
                        const uniqueStaff = Array.from(new Set(assigs.map(a => a.staffId)));

                        return (
                          <tr key={sid} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-8 border-r border-slate-100 text-center font-black text-slate-300 italic text-xl">{idx + 1}</td>
                            <td className="px-8 py-8 border-r border-slate-100">
                              <div className="flex items-center gap-3">
                                <Clock className="text-blue-500" size={18} />
                                <div>
                                  <p className="font-black italic text-slate-900 text-lg uppercase tracking-tighter leading-none">
                                    {sh ? `${sh.pickupTime} — ${sh.endTime}` : "Unscheduled Slot"}
                                  </p>
                                  {sh && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Release: {sh.endDate}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-8 border-r border-slate-100">
                              <div className="flex flex-col gap-2">
                                {uniqueFlights.map(f => (
                                  <div key={f!.id} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <Plane size={12} className="text-indigo-400" />
                                    <span className="text-[10px] font-black uppercase text-indigo-700">{f!.flightNumber}</span>
                                    <span className="text-[9px] font-bold text-indigo-300 ml-auto">{f!.sta || '--'}/{f!.std || '--'}</span>
                                  </div>
                                ))}
                                {uniqueFlights.length === 0 && <span className="text-[10px] text-slate-300 italic">No direct flights</span>}
                              </div>
                            </td>
                            <td className="px-8 py-8">
                              <div className="flex flex-wrap gap-2">
                                {uniqueStaff.map(staffId => {
                                  const s = getStaffById(staffId);
                                  const a = assigs.find(as => as.staffId === staffId);
                                  const isLeader = a?.role === 'Shift Leader';
                                  const isLoadControl = a?.role === 'Load Control';
                                  const isCoverage = !!a?.coveringStaffId;

                                  return (
                                    <div key={staffId} className={`px-4 py-2 rounded-2xl font-black text-[10px] flex items-center gap-3 border transition-all ${
                                      isCoverage ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-600/20 animate-pulse scale-105 z-10' :
                                      isLoadControl ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20' :
                                      isLeader ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' : 
                                      'bg-slate-900 border-slate-800 text-white'
                                    }`}>
                                      {isCoverage ? <Link2 size={14} /> : isLoadControl ? <Activity size={14} className="text-purple-200" /> : isLeader ? <Shield size={14} className="text-blue-200" /> : null}
                                      {s?.initials || "??"}
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

                <div className="xl:col-span-1 bg-slate-50/30 p-10 space-y-10 border-t xl:border-t-0 border-slate-100">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
                      <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center shadow-sm border border-rose-100">
                        <Link2 size={20} className="text-rose-600" />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-rose-600 italic">SHIFT COVERAGE PERSONNEL</h4>
                    </div>
                    <div className="space-y-3">
                      {coverageAssignments.length > 0 ? (
                        Array.from<string>(new Set(coverageAssignments.map(a => `${a.staffId}-${a.coveringStaffId}`))).map((key, i) => {
                          const [workerId, absenteeId] = key.split('-');
                          const worker = getStaffById(workerId);
                          const absentee = getStaffById(absenteeId);
                          return (
                            <div key={i} className="p-4 bg-white border border-rose-100 rounded-2xl flex items-center justify-between shadow-sm border-l-4 border-l-rose-600">
                               <span className="text-[11px] font-black text-rose-600 italic uppercase">{worker?.initials || "??"}</span>
                               <div className="flex-1 mx-4 h-[1px] bg-rose-100 relative">
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[8px] font-bold text-rose-300">COVERING</div>
                               </div>
                               <span className="text-[11px] font-black text-slate-400 italic uppercase">{absentee?.initials || "??"}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2rem] text-center">
                          <p className="text-[10px] font-black text-slate-300 uppercase italic tracking-widest">Station Secure: No Coverage Required</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-200">
                        <CalendarOff size={20} className="text-slate-400" />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic">STATION OFF-DUTY LOG</h4>
                    </div>
                    <div className="space-y-8">
                      {leaveCategories.map(cat => {
                        const list = (program.offDuty || [])
                          .filter(off => off.type === cat)
                          .map(off => getStaffById(off.staffId)?.initials)
                          .filter(Boolean);

                        return (
                          <div key={cat} className="space-y-4">
                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-l-4 border-blue-600 pl-4 italic">{cat}</p>
                            <div className="flex flex-wrap gap-2 pl-4">
                              {list.length > 0 ? list.map((init, i) => (
                                <div key={i} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-[11px] text-slate-950 italic">
                                  {init}
                                </div>
                              )) : <span className="text-[10px] font-bold text-slate-200 italic">NIL</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
