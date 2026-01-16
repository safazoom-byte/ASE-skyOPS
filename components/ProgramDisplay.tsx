import React, { useState, useEffect } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { ResourceRecommendation } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Zap, UserMinus, UserCheck, Sparkles, TrendingUp, AlertCircle, FileDown, Database } from 'lucide-react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate?: string;
  endDate?: string;
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
    rows.push(["HMB SkyOPS - STATION OPERATIONS PROGRAM"]);
    rows.push([`PERIOD: ${formattedStartDate} TO ${formattedEndDate}`]);
    rows.push([]);
    (localPrograms || []).sort((a,b) => a.day - b.day).forEach(program => {
      if (!program.assignments || program.assignments.length === 0) return;
      rows.push([`${DAYS_OF_WEEK[program.day].toUpperCase()} (${getDayDate(program.day)})`]);
      rows.push(["Flt No", "Route", "STA", "STD", "Personnel", "Role", "Power"]);
      const fIds = Array.from(new Set(program.assignments.map(a => a.flightId)));
      fIds.forEach((fId) => {
        const f = getFlightById(fId as string);
        if (!f) return;
        const flightAssigns = program.assignments.filter(a => a.flightId === fId);
        flightAssigns.forEach((assign) => {
          const s = getStaffById(assign.staffId);
          rows.push([f.flightNumber, `${f.from}-${f.to}`, f.sta || "--", f.std || "--", s?.name || "--", assign.role, `${s?.powerRate || 0}%`]);
        });
      });
      rows.push([]);
    });
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Program");
    XLSX.writeFile(workbook, `SkyOPS_Program_${startDate || 'export'}.xlsx`);
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
      {aiRecommendations && (
        <div className="bg-slate-950 text-white p-6 lg:p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center">
                  <Sparkles className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-xl lg:text-2xl font-black uppercase italic tracking-tighter">AI Advisor</h3>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Health: {aiRecommendations.healthScore}%</span>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-indigo-400" />
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Strategy</span>
                </div>
                <p className="text-xs text-slate-400 italic font-medium leading-relaxed">"{aiRecommendations.hireAdvice}"</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-5 lg:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Station Program</h2>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Range: {formattedStartDate} — {formattedEndDate}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl self-start">
            <button onClick={() => setViewMode('detailed')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Detailed</button>
            <button onClick={() => setViewMode('matrix')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Matrix</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="px-4 py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2"><FileDown size={14} /> Excel</button>
        </div>
      </div>

      <div className="space-y-8">
        {(localPrograms || []).sort((a,b) => a.day - b.day).map((program) => {
          if (!program.assignments || program.assignments.length === 0) return null;
          const assignedStaffIds = new Set(program.assignments.map(a => a.staffId));
          return (
            <div key={program.day} className="bg-white rounded-[2rem] overflow-hidden border border-slate-100 shadow-sm">
              <div className="bg-slate-900 px-6 py-5 flex justify-between items-center text-white">
                <div>
                  <h3 className="text-sm lg:text-base font-black uppercase italic tracking-tight">{DAYS_OF_WEEK[program.day]}</h3>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{getDayDate(program.day)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[7px] font-black text-slate-500 uppercase block mb-1">Active</span>
                    <span className="text-[10px] font-black text-emerald-400 italic">{assignedStaffIds.size} Staff</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="bg-slate-50 text-[8px] font-black text-slate-400 uppercase">
                    <tr>
                      <th className="px-6 py-4">Flight</th>
                      <th className="px-6 py-4">STA/STD</th>
                      <th className="px-6 py-4">Personnel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Array.from(new Set(program.assignments.map(a => a.flightId))).map((fId) => {
                      const f = getFlightById(fId as string);
                      if (!f) return null;
                      const flightAssigns = program.assignments.filter(a => a.flightId === fId);
                      return (
                        <tr key={fId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-900 italic text-sm">{f.flightNumber}</td>
                          <td className="px-6 py-4 text-[9px] font-black">{f.sta || '--'} / {f.std || '--'}</td>
                          <td className="px-6 py-4 flex flex-wrap gap-1.5">
                            {flightAssigns.map(assign => (
                              <div key={assign.id} className="bg-slate-50 px-2 py-1 rounded-lg border text-[9px] font-black italic">
                                {getStaffById(assign.staffId)?.initials || '??'}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
