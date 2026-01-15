
import React, { useState, useEffect } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Zap, Users, UserMinus, UserCheck, Sparkles, TrendingUp, AlertCircle, CheckCircle2, Database, FileDown } from 'lucide-react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate: string;
  endDate: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  templateBinary: string | null;
  aiRecommendations?: ResourceRecommendation | null;
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, startDate, endDate, aiRecommendations }) => {
  const [viewMode, setViewMode] = useState<'detailed' | 'matrix'>('detailed');
  const [localPrograms, setLocalPrograms] = useState<DailyProgram[]>(programs);

  useEffect(() => { setLocalPrograms(programs); }, [programs]);

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const getDayDate = (dayIndex: number) => {
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formattedStartDate = new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedEndDate = new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const exportSystemJSON = () => {
    const data = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      flights,
      staff,
      shifts,
      programs
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SkyOPS_System_State_${startDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const rows: any[] = [];
    rows.push(["HMB SkyOPS - STATION OPERATIONS PROGRAM"]);
    rows.push([`PERIOD: ${formattedStartDate} TO ${formattedEndDate}`]);
    rows.push([]);
    (localPrograms || []).sort((a,b) => a.day - b.day).forEach(program => {
      if (!program.assignments || program.assignments.length === 0) return;
      rows.push([`${DAYS_OF_WEEK[program.day].toUpperCase()} (${getDayDate(program.day)})`]);
      rows.push(["S/N", "Flight No", "Route", "STA", "STD", "Shift Time", "Personnel", "Initials", "Assigned Role", "Pwr Grade"]);
      const fIds = Array.from(new Set(program.assignments.map(a => a.flightId)));
      fIds.forEach((fId, idx) => {
        const f = getFlightById(fId as string);
        if (!f) return;
        const flightAssignments = program.assignments.filter(a => a.flightId === fId);
        flightAssignments.forEach((assign, aIdx) => {
          const s = getStaffById(assign.staffId);
          const sh = getShiftById(assign.shiftId);
          rows.push([
            aIdx === 0 ? idx + 1 : "",
            aIdx === 0 ? f.flightNumber : "",
            aIdx === 0 ? `${f.from}-${f.to}` : "",
            aIdx === 0 ? (f.sta || "--") : "",
            aIdx === 0 ? (f.std || "--") : "",
            sh?.pickupTime || "--:--",
            s?.name || "--",
            s?.initials || "--",
            assign.role,
            s?.powerRate ? `${s.powerRate}%` : "N/A"
          ]);
        });
      });
      rows.push([]);
    });
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Program");
    XLSX.writeFile(workbook, `SkyOPS_Program_${startDate}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.text(`STATION WEEKLY PROGRAM: ${formattedStartDate} - ${formattedEndDate}`, 105, 15, { align: 'center' });
    const tableData: any[] = [];
    (localPrograms || []).sort((a,b) => a.day - b.day).forEach(program => {
      if (!program.assignments || program.assignments.length === 0) return;
      tableData.push([{ content: `${DAYS_OF_WEEK[program.day].toUpperCase()}`, colSpan: 7, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
      const fIds = Array.from(new Set(program.assignments.map(a => a.flightId)));
      fIds.forEach((fId, idx) => {
        const f = getFlightById(fId as string);
        if (!f) return;
        const flightAssigns = program.assignments.filter(a => a.flightId === fId);
        const staffDetails = flightAssigns.map(a => `${getStaffById(a.staffId)?.initials || '??'}`).join(' ');
        tableData.push([idx + 1, f.flightNumber, `${f.from}-${f.to}`, f.sta || '--', f.std || '--', getShiftById(flightAssigns[0]?.shiftId)?.pickupTime || '--:--', staffDetails]);
      });
    });
    autoTable(doc, { startY: 25, body: tableData, theme: 'grid', styles: { fontSize: 7 } });
    doc.save(`SkyOPS_Program_${startDate}.pdf`);
  };

  const isEmpty = !localPrograms || localPrograms.length === 0 || localPrograms.every(p => !p.assignments || p.assignments.length === 0);

  if (isEmpty) {
    return (
      <div className="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
        <h5 className="text-xs font-black text-slate-900 uppercase italic">Program Pending</h5>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
      {/* AI Resource Advisor Panel */}
      {aiRecommendations && (
        <div className="bg-slate-950 text-white p-6 lg:p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[80px] pointer-events-none group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                  <Sparkles className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-xl lg:text-2xl font-black uppercase italic tracking-tighter leading-none">AI Resource Advisor</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Station Health Score:</span>
                    <span className={`text-[10px] font-black italic ${aiRecommendations.healthScore >= 80 ? 'text-emerald-400' : aiRecommendations.healthScore >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {aiRecommendations.healthScore}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-center">
                  <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Current Fleet</span>
                  <span className="text-xl font-black italic">{aiRecommendations.currentStaffCount}</span>
                </div>
                <div className="w-px h-10 bg-slate-800"></div>
                <div className="text-center">
                  <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Ideal Target</span>
                  <span className="text-xl font-black italic text-indigo-400">{aiRecommendations.idealStaffCount}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-indigo-400" />
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Strategic Hire Advice</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed italic font-medium">
                  "{aiRecommendations.hireAdvice}"
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-400" />
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Identified Skill Deficits</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiRecommendations.skillGaps && aiRecommendations.skillGaps.length > 0 ? aiRecommendations.skillGaps.map((gap, i) => (
                    <span key={i} className="px-3 py-1 bg-slate-800/50 border border-slate-700 rounded-lg text-[9px] font-black text-slate-300 uppercase italic">
                      {gap}
                    </span>
                  )) : (
                    <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-[9px] font-black text-emerald-400 uppercase italic flex items-center gap-2">
                      <CheckCircle2 size={10} /> Skill Matrix Optimized
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-5 lg:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Station Program</h2>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational Range: {formattedStartDate} — {formattedEndDate}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl self-start">
            <button onClick={() => setViewMode('detailed')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Table</button>
            <button onClick={() => setViewMode('matrix')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Matrix</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:gap-3">
          <button onClick={exportExcel} className="flex-1 lg:flex-none px-4 py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
             <FileDown size={14} /> Excel
          </button>
          <button onClick={exportPDF} className="flex-1 lg:flex-none px-4 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
             <FileDown size={14} /> PDF
          </button>
          <button onClick={exportSystemJSON} className="flex-1 lg:flex-none px-4 py-3 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
             <Database size={14} /> System State (JSON)
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {(localPrograms || []).sort((a,b) => a.day - b.day).map((program) => {
          if (!program.assignments || program.assignments.length === 0) return null;

          const assignedStaffIds = new Set(program.assignments.map(a => a.staffId));
          const assignedCount = assignedStaffIds.size;
          const offDutyStaff = staff.filter(s => !assignedStaffIds.has(s.id));
          const offDutyCount = offDutyStaff.length;

          return (
            <div key={program.day} className="bg-white rounded-[2rem] overflow-hidden border border-slate-100 shadow-sm">
              <div className="bg-slate-900 px-6 py-5 flex flex-col sm:flex-row justify-between sm:items-center text-white gap-4">
                <div>
                  <h3 className="text-sm lg:text-base font-black uppercase italic tracking-tight">{DAYS_OF_WEEK[program.day]}</h3>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{getDayDate(program.day)}</p>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <UserCheck size={8} className="text-emerald-500" /> Active Personnel
                    </span>
                    <span className="text-[10px] lg:text-xs font-black text-emerald-400 italic leading-none">{assignedCount} Staff</span>
                  </div>
                  <div className="w-px h-6 bg-slate-800 hidden sm:block"></div>
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <UserMinus size={8} className="text-rose-500" /> Off Duty
                    </span>
                    <span className="text-[10px] lg:text-xs font-black text-rose-400 italic leading-none">{offDutyCount} Staff</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[8px] font-black text-slate-400 uppercase">
                    <tr>
                      <th className="px-6 py-4">Flt</th>
                      <th className="px-6 py-4">Sectors</th>
                      <th className="px-6 py-4">STA/STD</th>
                      <th className="px-6 py-4">Start</th>
                      <th className="px-6 py-4">Avg Pwr</th>
                      <th className="px-6 py-4">Assigned Personnel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Array.from(new Set(program.assignments.map(a => a.flightId))).map((fId) => {
                      const f = getFlightById(fId as string);
                      if (!f) return null;
                      const flightAssigns = program.assignments.filter(a => a.flightId === fId);
                      
                      const totalPower = flightAssigns.reduce((sum, a) => sum + (getStaffById(a.staffId)?.powerRate || 0), 0);
                      const avgPower = flightAssigns.length > 0 ? Math.round(totalPower / flightAssigns.length) : 0;

                      return (
                        <tr key={fId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-900 italic text-sm">{f.flightNumber}</td>
                          <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">{f.from} → {f.to}</td>
                          <td className="px-6 py-4 text-[9px] font-black">
                            <span className="text-slate-400 mr-1">A:</span>{f.sta || '--'} <span className="text-slate-400 mx-1">/</span> <span className="text-slate-400 mr-1">D:</span>{f.std || '--'}
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-blue-600">{getShiftById(flightAssigns[0]?.shiftId)?.pickupTime || '--:--'}</td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-1.5">
                                <Zap size={10} className={avgPower >= 85 ? 'text-emerald-500' : 'text-amber-500'} />
                                <span className={`text-[10px] font-black italic tracking-tighter ${avgPower >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                   {avgPower}%
                                </span>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {flightAssigns.map(assign => (
                                <div key={assign.id} className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-[9px] font-black uppercase italic text-slate-900">
                                  {getStaffById(assign.staffId)?.initials || '??'}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Off-Duty Personnel List */}
              <div className="bg-slate-50/50 p-6 border-t border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <UserMinus size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] italic">Personnel - Status: OFF DUTY</span>
                </div>
                
                {offDutyCount > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {offDutyStaff.map(s => (
                      <div key={s.id} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black text-slate-400 uppercase italic shadow-sm flex items-center gap-2 group hover:border-rose-200 hover:text-rose-500 transition-all">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-rose-500 transition-colors"></div>
                        {s.name} ({s.initials || '--'})
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest italic">100% Station Deployment — No Personnel Off Duty</p>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 px-6 py-2 text-[8px] font-bold text-slate-500 uppercase italic lg:hidden">
                Swipe left to view full flight roster
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
