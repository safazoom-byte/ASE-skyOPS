import React, { useState, useEffect } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  templateBinary: string | null;
}

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, startDate }) => {
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

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const rows: any[] = [];
    
    rows.push(["HMB SkyOPS - STATION OPERATIONS PROGRAM"]);
    rows.push([`PERIOD: ${getDayDate(0)} TO ${getDayDate(6)}`]);
    rows.push([]);

    localPrograms.sort((a,b) => a.day - b.day).forEach(program => {
      if (program.assignments.length === 0) return;
      
      rows.push([`${DAYS_OF_WEEK[program.day].toUpperCase()} (${getDayDate(program.day)})`]);
      rows.push(["S/N", "Flight No", "Route", "STA", "STD", "Shift Time", "Personnel", "Initials", "Assigned Role"]);
      
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
            assign.role
          ]);
        });
      });
      rows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      {wch: 5}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 12}, {wch: 25}, {wch: 10}, {wch: 15}
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Program");
    XLSX.writeFile(workbook, `SkyOPS_Station_Program_${startDate}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`STATION WEEKLY PROGRAM: ${getDayDate(0)} - ${getDayDate(6)}`, 105, 15, { align: 'center' });
    
    const tableData: any[] = [];
    localPrograms.sort((a,b) => a.day - b.day).forEach(program => {
      if (program.assignments.length === 0) return;
      tableData.push([{ content: `${DAYS_OF_WEEK[program.day].toUpperCase()} - ${getDayDate(program.day)}`, colSpan: 7, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
      
      const fIds = Array.from(new Set(program.assignments.map(a => a.flightId)));
      fIds.forEach((fId, idx) => {
        const f = getFlightById(fId as string);
        if (!f) return;
        
        const flightAssigns = program.assignments.filter(a => a.flightId === fId);
        const staffDetails = flightAssigns.map(a => `${getStaffById(a.staffId)?.initials || '??'} (${a.role})`).join(' | ');
        const puTime = flightAssigns[0] ? (getShiftById(flightAssigns[0].shiftId)?.pickupTime || '--:--') : '--:--';
        
        tableData.push([idx + 1, f.flightNumber, `${f.from}-${f.to}`, f.sta || '--', f.std || '--', puTime, staffDetails]);
      });
    });

    autoTable(doc, {
      startY: 25,
      head: [['S/N', 'Flight', 'Sector', 'STA', 'STD', 'Shift', 'Staff Assignment']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2 },
    });
    doc.save(`SkyOPS_Program_${startDate}.pdf`);
  };

  const isEmpty = localPrograms.length === 0 || localPrograms.every(p => p.assignments.length === 0);

  if (isEmpty) {
    return (
      <div className="py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
        <div className="max-w-xs mx-auto space-y-4">
          <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-3xl flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <h5 className="text-sm font-black text-slate-900 uppercase italic">Program Pending</h5>
          <p className="text-[11px] text-slate-400 font-medium">No operational assignments generated yet. Use the Dashboard to build the AI Program.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Station Weekly Program</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational Range: {getDayDate(0)} — {getDayDate(6)}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mr-2">
            <button onClick={() => setViewMode('detailed')} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Detailed Table</button>
            <button onClick={() => setViewMode('matrix')} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Staff Matrix</button>
          </div>
          <button onClick={exportExcel} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 shadow-xl transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Excel Output
          </button>
          <button onClick={exportPDF} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl transition-all">Export PDF</button>
        </div>
      </div>

      {viewMode === 'detailed' ? (
        <div className="space-y-12">
          {localPrograms.sort((a,b) => a.day - b.day).map((program) => (
            program.assignments.length > 0 && (
              <div key={program.day} className="bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm">
                <div className="bg-slate-900 px-10 py-6 flex justify-between items-center text-white">
                  <div>
                    <h3 className="text-xl font-black uppercase italic tracking-tight">{DAYS_OF_WEEK[program.day]}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{getDayDate(program.day)}</p>
                  </div>
                  <div className="bg-blue-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    {Array.from(new Set(program.assignments.map(a => a.flightId))).length} Flights
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase">
                      <tr>
                        <th className="px-10 py-5">S/N</th>
                        <th className="px-10 py-5">Flight Service</th>
                        <th className="px-10 py-5">STA / STD</th>
                        <th className="px-10 py-5">Duty Start</th>
                        <th className="px-10 py-5">Staff Assigned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {Array.from(new Set(program.assignments.map(a => a.flightId))).map((fId, idx) => {
                        const f = getFlightById(fId as string);
                        if (!f) return null;
                        const flightAssigns = program.assignments.filter(a => a.flightId === fId);
                        return (
                          <tr key={fId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-10 py-6 font-bold text-slate-300 italic">{idx + 1}</td>
                            <td className="px-10 py-6">
                              <span className="font-black text-slate-900 italic text-base block uppercase">{f.flightNumber}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{f.from} <span className="text-slate-200">→</span> {f.to}</span>
                            </td>
                            <td className="px-10 py-6">
                              <div className="flex flex-col gap-1">
                                <div className="text-[10px] font-black text-slate-900">
                                  <span className="text-slate-400 mr-2 uppercase">STA:</span>{f.sta || '--:--'}
                                </div>
                                <div className="text-[10px] font-black text-slate-900">
                                  <span className="text-slate-400 mr-2 uppercase">STD:</span>{f.std || '--:--'}
                                </div>
                              </div>
                            </td>
                            <td className="px-10 py-6">
                              <div className="flex flex-col">
                                {Array.from(new Set(flightAssigns.map(a => getShiftById(a.shiftId)?.pickupTime))).map((time, tIdx) => (
                                  <span key={tIdx} className="text-sm font-black text-blue-600 italic tracking-tighter">{time || '--:--'}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-10 py-6">
                              <div className="flex flex-wrap gap-2">
                                {flightAssigns.map(assign => (
                                  <div key={assign.id} className="bg-white px-3 py-2 rounded-xl flex flex-col items-start border border-slate-100 shadow-sm min-w-[110px] group/item hover:border-blue-200 transition-all">
                                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{assign.role}</span>
                                    <span className="text-[10px] font-black text-slate-900 uppercase italic leading-none">{getStaffById(assign.staffId)?.initials || '??'}</span>
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
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Personnel</th>
                {localPrograms.sort((a,b) => a.day - b.day).map(p => (
                  <th key={p.day} className="p-4 text-center">
                    <span className="text-[10px] font-black text-slate-900 block uppercase italic">{DAYS_OF_WEEK[p.day].substring(0,3)}</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{getDayDate(p.day).substring(0,5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map(person => (
                <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-[10px] uppercase">{person.initials || person.name.charAt(0)}</div>
                      <span className="text-xs font-black text-slate-900 uppercase italic tracking-tight">{person.name}</span>
                    </div>
                  </td>
                  {localPrograms.map(p => {
                    const personAssigns = p.assignments.filter(a => a.staffId === person.id);
                    return (
                      <td key={p.day} className="p-2">
                        {personAssigns.length > 0 ? (
                          <div className="space-y-1">
                            {personAssigns.map(a => {
                              const f = getFlightById(a.flightId);
                              const sh = getShiftById(a.shiftId);
                              return (
                                <div key={a.id} className="bg-blue-600 text-white p-2 rounded-lg text-center shadow-md">
                                  <div className="text-[8px] font-black uppercase tracking-tighter">{f?.flightNumber}</div>
                                  <div className="text-[7px] font-bold opacity-80">{sh?.pickupTime || '--:--'}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-10 border border-dashed border-slate-100 rounded-lg flex items-center justify-center">
                            <span className="text-[7px] font-black text-slate-200 uppercase">OFF</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};