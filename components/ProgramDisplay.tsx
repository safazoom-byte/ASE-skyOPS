
import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment, Skill } from '../types';
import { calculateCredits } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Printer, 
  Activity,
  FileText
} from 'lucide-react';
import { AVAILABLE_SKILLS } from '../constants';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  incomingDuties?: IncomingDuty[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  stationHealth?: number;
  alerts?: { type: 'danger' | 'warning', message: string }[];
  minRestHours?: number;
}

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests = [], 
  incomingDuties = [], 
  startDate, 
  endDate, 
  minRestHours = 12
}) => {
  const [attachAnalytics, setAttachAnalytics] = useState(true);

  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs) || !startDate || !endDate) return [];
    return [...programs]
      .filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate)
      .sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  }, [programs, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const getSkillCodeShort = (role: string) => {
    if (role.includes('Leader')) return 'SL';
    if (role.includes('Load')) return 'LC';
    if (role.includes('Ramp')) return 'RMP';
    if (role.includes('Ops')) return 'OPS';
    if (role.includes('Lost')) return 'LF';
    return role;
  };

  const stats = useMemo(() => {
    if (!startDate || !endDate) return null;
    const duration = filteredPrograms.length;
    let totalSupply = 0;
    let totalDemand = 0;
    
    staff.forEach(s => totalSupply += calculateCredits(s, startDate, duration, leaveRequests));
    shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => totalDemand += s.minStaff);
    
    return { totalSupply, totalDemand, balance: totalSupply - totalDemand, status: (totalSupply - totalDemand) >= 0 ? 'HEALTHY' : 'CRITICAL' };
  }, [startDate, endDate, staff, shifts, leaveRequests, filteredPrograms]);

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Helper for Page Headers (REPLICA STYLE)
    const drawPageHeader = (title: string, showStats: boolean = false) => {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text("SkyOPS Station Handling Program", 14, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 28);

      if (showStats && stats) {
        const boxWidth = 80;
        const boxX = pageWidth - boxWidth - 14;
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.rect(boxX, 10, boxWidth, 25, 'FD'); // Fill and Draw
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text("MANPOWER CAPACITY FORECAST", boxX + 5, 16);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Supply: ${stats.totalSupply} Shifts`, boxX + 5, 22);
        doc.text(`Total Demand: ${stats.totalDemand} Shifts (Min)`, boxX + 5, 27);
        
        doc.setFont('helvetica', 'bold');
        if (stats.balance >= 0) doc.setTextColor(16, 185, 129); // Green
        else doc.setTextColor(225, 29, 72); // Red
        
        doc.text(`Net Balance: ${stats.balance > 0 ? '+' : ''}${stats.balance}`, boxX + 5, 32);
        doc.text(`Status: ${stats.status}`, boxX + 40, 32);
        doc.setTextColor(0, 0, 0);
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), 14, 45);
    };

    // 1. DAILY PAGES (REPLICA)
    filteredPrograms.forEach((p, idx) => {
      if (idx > 0) doc.addPage();
      const dateObj = new Date(p.dateString!);
      const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
      const formattedDate = `${dayName} - ${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
      
      drawPageHeader(formattedDate, idx === 0);

      const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
      const body = dayShifts.map((s, si) => {
        const assigned = p.assignments.filter(a => a.shiftId === s.id);
        const flts = (s.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
        const prs = assigned.map(a => {
            const st = getStaffById(a.staffId);
            const roleCode = getSkillCodeShort(a.role);
            const duration = getShiftDuration(s);
            const rolePart = roleCode ? ` (${roleCode})` : '';
            const durPart = duration !== "8.0" ? ` [${duration}H]` : '';
            return `${st?.initials}${rolePart}${durPart}`;
        }).join(' | ');
        return [si + 1, s.pickupTime, s.endTime, flts, `${assigned.length} / ${s.maxStaff}`, prs];
      });

      autoTable(doc, {
        startY: 52,
        head: [['S/N', 'PICKUP', 'RELEAS\nE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'left' },
        styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40], valign: 'middle' },
        columnStyles: { 
            0: { cellWidth: 10 }, 
            1: { cellWidth: 18 }, 
            2: { cellWidth: 18 }, 
            3: { cellWidth: 30 }, 
            4: { cellWidth: 18 } 
        }
      });

      // ABSENCE REGISTRY (REPLICA)
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text("ABSENCE AND REST REGISTRY", 14, (doc as any).lastAutoTable.finalY + 12);
      
      const dayLeaves = leaveRequests.filter(l => l.startDate <= p.dateString! && l.endDate >= p.dateString!);
      
      const getInitialsWithCount = (list: string[]) => {
          const counts: Record<string, number> = {};
          list.forEach(i => counts[i] = (counts[i] || 0) + 1);
          return Object.entries(counts).map(([init, count]) => `${init} (${count})`).join(', ') || 'NONE';
      };

      const regBody = [
        ['RESTING (POST-DUTY)', getInitialsWithCount([])], // Placeholder
        ['DAYS OFF', getInitialsWithCount(dayLeaves.filter(l => l.type === 'Day off').map(l => getStaffById(l.staffId)?.initials || ''))],
        ['ROSTER LEAVE', getInitialsWithCount(dayLeaves.filter(l => l.type === 'Roster leave').map(l => getStaffById(l.staffId)?.initials || ''))],
        ['ANNUAL LEAVE', getInitialsWithCount(dayLeaves.filter(l => l.type === 'Annual leave').map(l => getStaffById(l.staffId)?.initials || ''))],
        ['STANDBY (RESERVE)', 'NONE']
      ];

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 16,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: regBody,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], fontSize: 9, fontStyle: 'bold', halign: 'left' },
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', fillColor: [240, 240, 240] } }
      });
    });

    if (attachAnalytics) {
      // 2. UTILIZATION AUDIT (LOCAL)
      doc.addPage();
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text("Weekly Personnel Utilization Audit (Local)", 14, 20);
      
      const localStaff = staff.filter(s => s.type === 'Local');
      const localRows = localStaff.map((s, i) => {
        const workShifts = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        const offDays = filteredPrograms.length - workShifts;
        // Logic from screenshot: 5 shifts = MATCH, else CHECK (Red for CHECK, Green for MATCH)
        const status = workShifts === 5 ? 'MATCH' : 'CHECK';
        const rowColor = status === 'MATCH' ? [16, 185, 129] : [220, 38, 38]; // Green : Red
        
        return [
            { content: i + 1, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.name.toUpperCase(), styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.initials, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: workShifts, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: offDays, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: status, styles: { fillColor: rowColor, textColor: [255, 255, 255], fontStyle: 'bold' } }
        ];
      });

      autoTable(doc, {
        startY: 30,
        head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']],
        body: localRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
        styles: { fontSize: 9, fontStyle: 'bold' },
      });

      // 3. UTILIZATION AUDIT (ROSTER)
      doc.addPage();
      doc.setFontSize(22);
      doc.text("Weekly Personnel Utilization Audit (Roster)", 14, 20);
      
      const rosterStaff = staff.filter(s => s.type === 'Roster');
      const rosterRows = rosterStaff.map((s, i) => {
        const potential = calculateCredits(s, startDate!, filteredPrograms.length, []);
        const actual = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        // Logic from screenshot: actual == potential -> MATCH, else CHECK
        const status = actual === potential ? 'MATCH' : 'CHECK';
        const rowColor = status === 'MATCH' ? [16, 185, 129] : [220, 38, 38];

        return [
            { content: i + 1, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.name.toUpperCase(), styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.initials, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.workFromDate || '?', styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: s.workToDate || '?', styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: potential, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: actual, styles: { fillColor: rowColor, textColor: [255, 255, 255] } },
            { content: status, styles: { fillColor: rowColor, textColor: [255, 255, 255], fontStyle: 'bold' } }
        ];
      });

      autoTable(doc, {
        startY: 30,
        head: [['S/N', 'NAME', 'INIT', 'WORK FROM', 'WORK TO', 'POTENTIAL', 'ACTUAL', 'STATUS']],
        body: rosterRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
        styles: { fontSize: 8, fontStyle: 'bold' },
      });

      // 4. OPERATIONS MATRIX VIEW (ORANGE)
      doc.addPage();
      doc.setFontSize(22);
      doc.text("Weekly Operations Matrix View", 14, 20);
      
      const matrixDates = filteredPrograms.map(p => {
          const d = new Date(p.dateString!);
          return `${d.getDate()}/${d.getMonth() + 1}`;
      });
      
      const matrixRows = staff.map((s, i) => {
        const rowData: any[] = [i + 1, `${s.initials} (${s.type[0]})`];
        let count = 0;
        
        filteredPrograms.forEach(p => {
            const ass = p.assignments.find(a => a.staffId === s.id);
            if (ass) {
                const sh = shifts.find(sh => sh.id === ass.shiftId);
                const dur = getShiftDuration(sh);
                const cellText = `${sh?.pickupTime} [${dur}H]`;
                
                // Highlight [0.0H] in RED (as per screenshot 12 for AB-HMB 00:00 [0.0H])
                if (dur === "0.0") {
                    rowData.push({ content: cellText, styles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' } });
                } else {
                    rowData.push(cellText);
                }
                count++;
            } else {
                rowData.push("-");
            }
        });
        rowData.push(`${count}/${filteredPrograms.length}`);
        return rowData;
      });

      autoTable(doc, {
        startY: 30,
        head: [['S/N', 'AGENT', ...matrixDates, 'AUDIT']],
        body: matrixRows,
        theme: 'grid',
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' }, // Orange Header
        styles: { fontSize: 7, halign: 'center' },
        columnStyles: { 1: { halign: 'left', fontStyle: 'bold' } }
      });

      // 5. ROLE FULFILLMENT MATRIX (GREEN)
      doc.addPage();
      doc.setFontSize(22);
      doc.text("Specialist Role Fulfillment Matrix", 14, 20);
      
      const roleMatrixRows: any[] = [];
      filteredPrograms.forEach(p => {
          const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
          dayShifts.forEach(s => {
              const assigned = p.assignments.filter(a => a.shiftId === s.id);
              const getP = (skill: string) => assigned.filter(a => a.role.includes(getSkillCodeShort(skill))).map(a => getStaffById(a.staffId)?.initials).join(', ') || '-';
              const d = new Date(p.dateString!);
              
              // Per screenshot 15/16: Green background for ALL body rows
              const rowStyle = { fillColor: [16, 185, 129], textColor: [255, 255, 255] };
              
              roleMatrixRows.push([
                  { content: `${d.getDate()}/${d.getMonth()+1}`, styles: rowStyle },
                  { content: `${s.pickupTime}-${s.endTime}`, styles: rowStyle },
                  { content: getP('Shift Leader'), styles: rowStyle },
                  { content: getP('Load Control'), styles: rowStyle },
                  { content: getP('Ramp'), styles: rowStyle },
                  { content: getP('Operations'), styles: rowStyle },
                  { content: getP('Lost and Found'), styles: rowStyle }
              ]);
          });
      });

      autoTable(doc, {
        startY: 30,
        head: [['DATE', 'SHIFT', 'SL', 'LC', 'RMP', 'OPS', 'LF']],
        body: roleMatrixRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
        styles: { fontSize: 8, fontStyle: 'bold', halign: 'center' }
      });
    }

    doc.save(`SkyOPS_Station_Handling_Program_${startDate}.pdf`);
  };

  const getShiftDuration = (shift?: ShiftConfig) => {
    if (!shift) return "0.0";
    const [h1, m1] = shift.pickupTime.split(':').map(Number);
    const [h2, m2] = shift.endTime.split(':').map(Number);
    let start = h1 * 60 + (m1 || 0);
    let end = h2 * 60 + (m2 || 0);
    if (end < start) end += 1440;
    return ((end - start) / 60).toFixed(1);
  };

  const getFormatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).toUpperCase().replace(',', ' -');
  };

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
           <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Operational Program</h2>
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
             <Activity size={14} className="text-blue-500" /> Professional Handling Roster
           </p>
           <label className="flex items-center gap-3 mt-4 cursor-pointer group">
              <input type="checkbox" className="w-5 h-5 rounded border-slate-200" checked={attachAnalytics} onChange={e => setAttachAnalytics(e.target.checked)} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-900">Include Audit Pages & Matrix View in PDF</span>
           </label>
        </div>
        <button onClick={generatePDF} className="px-10 py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
           <Printer size={18} /> Download Program PDF
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 md:p-12 space-y-12">
            {stats && (
              <div className="flex justify-end">
                <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
                   <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Production Audit</h4>
                   <div className="space-y-2 text-[11px] font-medium text-slate-600">
                      <p>Active Supply: <span className="font-black text-slate-950">{stats.totalSupply} Shifts</span></p>
                      <p>Station Demand: <span className="font-black text-slate-950">{stats.totalDemand} Shifts</span></p>
                      <div className="pt-4 flex justify-between items-center">
                         <span className="text-emerald-500 font-black italic">NET BALANCE: {stats.balance > 0 ? '+' : ''}{stats.balance}</span>
                         <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${stats.balance >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600 animate-pulse'}`}>{stats.status}</span>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {filteredPrograms.map((p) => {
              const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
              return (
                <div key={p.dateString} className="space-y-6">
                  <h3 className="text-2xl font-black italic text-slate-900 uppercase tracking-tight flex items-center gap-3">
                     <FileText className="text-blue-600" /> {getFormatDate(p.dateString)}
                  </h3>
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                       <thead className="bg-black text-white text-[10px] font-black uppercase tracking-widest">
                         <tr>
                           <th className="p-4">S/N</th>
                           <th className="p-4">PICKUP</th>
                           <th className="p-4">RELEASE</th>
                           <th className="p-4">FLIGHTS</th>
                           <th className="p-4">HC / MAX</th>
                           <th className="p-4">PERSONNEL & ROLES</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 text-[11px]">
                          {dayShifts.map((s, si) => {
                            const assigned = p.assignments.filter(a => a.shiftId === s.id);
                            return (
                              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-bold text-slate-400">{si + 1}</td>
                                <td className="p-4 font-black text-slate-900">{s.pickupTime}</td>
                                <td className="p-4 font-black text-slate-900">{s.endTime}</td>
                                <td className="p-4">
                                  <div className="flex flex-wrap gap-1">
                                    {(s.flightIds || []).map(fid => (
                                      <span key={fid} className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black uppercase">{getFlightById(fid)?.flightNumber}</span>
                                    )) || 'NIL'}
                                  </div>
                                </td>
                                <td className="p-4 font-black text-slate-600">{assigned.length} / {s.maxStaff}</td>
                                <td className="p-4">
                                   <div className="flex flex-wrap gap-2 text-[10px]">
                                      {assigned.map(a => (
                                        <span key={a.id} className="text-slate-900 font-medium">
                                           {getStaffById(a.staffId)?.initials} ({getSkillCodeShort(a.role)})
                                           {si < dayShifts.length - 1 && <span className="mx-2 text-slate-200">|</span>}
                                        </span>
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
              );
            })}
        </div>
      </div>
    </div>
  );
};
