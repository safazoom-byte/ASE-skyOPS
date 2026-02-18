
import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment, Skill } from '../types';
import { calculateCredits } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Printer, 
  Activity,
  CheckCircle2
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
    
    const roleStats = AVAILABLE_SKILLS.map(skill => {
        let sCount = 0;
        let dCount = 0;
        staff.forEach(s => {
            const hasSkill = (skill === 'Shift Leader' && s.isShiftLeader) || (skill === 'Load Control' && s.isLoadControl) || (skill === 'Ramp' && s.isRamp) || (skill === 'Operations' && s.isOps) || (skill === 'Lost and Found' && s.isLostFound);
            if (hasSkill) sCount += calculateCredits(s, startDate, duration, leaveRequests);
        });
        shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => {
            dCount += (s.roleCounts?.[skill] || 0);
        });
        return { skill, supply: sCount, demand: dCount };
    });

    staff.forEach(s => totalSupply += calculateCredits(s, startDate, duration, leaveRequests));
    shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => totalDemand += s.minStaff);
    
    return { totalSupply, totalDemand, balance: totalSupply - totalDemand, status: (totalSupply - totalDemand) >= 0 ? 'HEALTHY' : 'CRITICAL', roleStats };
  }, [startDate, endDate, staff, shifts, leaveRequests, filteredPrograms]);

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const drawHeader = (title: string, isCover: boolean = false) => {
      doc.setFontSize(24);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text("SkyOPS Station Handling Program", 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 28);
      
      if (isCover && stats) {
        const bx = pageWidth - 94;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.rect(bx, 10, 80, 30, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text("MANPOWER CAPACITY FORECAST", bx + 5, 18);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Supply: ${stats.totalSupply} Shifts`, bx + 5, 24);
        doc.text(`Total Demand: ${stats.totalDemand} Shifts (Min)`, bx + 5, 29);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text(`Net Balance: +${stats.balance}`, bx + 5, 36);
        doc.text(`Status: ${stats.status}`, bx + 50, 36);
      }

      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, 45);
    };

    // 1. Handling Pages
    filteredPrograms.forEach((p, idx) => {
      if (idx > 0) doc.addPage();
      drawHeader(getFormatDate(p.dateString), idx === 0);

      let currentY = 55;

      // Role Matrix on Page 1 if requested
      if (idx === 0 && attachAnalytics && stats) {
          autoTable(doc, {
            startY: currentY,
            head: [['Operational Discipline', 'Gross Supply', 'Station Demand', 'Status']],
            body: stats.roleStats.map(r => [r.skill, `${r.supply} SHT`, `${r.demand} SHT`, r.supply >= r.demand ? 'MATCH' : 'CHECK']),
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    data.cell.styles.textColor = data.cell.text[0] === 'MATCH' ? [16, 185, 129] : [225, 29, 72];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
          });
          currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
      const body = dayShifts.map((s, si) => {
        const assigned = p.assignments.filter(a => a.shiftId === s.id);
        const flts = (s.flightIds || []).map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(', ') || 'NIL';
        const prs = assigned.map(a => `${getStaffById(a.staffId)?.initials} (${getSkillCodeShort(a.role)}) [${getShiftDuration(s)}H]`).join(' | ');
        return [si + 1, s.pickupTime, s.endTime, flts, `${assigned.length} / ${s.maxStaff}`, prs];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }
      });

      // Move Registry to Bottom
      const regFooterY = pageHeight - 55;
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("ABSENCE AND REST REGISTRY", 14, regFooterY);
      
      const dayLeaves = leaveRequests.filter(l => l.startDate <= p.dateString! && l.endDate >= p.dateString!);
      const dayAssignments = p.assignments.map(a => a.staffId);
      const dayOffRosters = staff.filter(s => s.type === 'Roster' && !dayAssignments.includes(s.id));
      
      const regBody = [
        ['RESTING (POST-DUTY)', 'NONE'],
        ['DAYS OFF', dayLeaves.filter(l => l.type === 'Day off').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
        ['ROSTER LEAVE', [...dayLeaves.filter(l => l.type === 'Roster leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`), ...dayOffRosters.map(r => `${r.initials} (1)`)].join(', ') || 'NONE'],
        ['ANNUAL LEAVE', dayLeaves.filter(l => l.type === 'Annual leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
        ['STANDBY (RESERVE)', 'NONE']
      ];

      autoTable(doc, {
        startY: regFooterY + 5,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: regBody,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } }
      });
    });

    if (attachAnalytics) {
      // 2. Weekly Personnel Utilization Audit (Local)
      doc.addPage();
      drawHeader("Weekly Personnel Utilization Audit (Local)");
      const localStaff = staff.filter(s => s.type === 'Local');
      const localRows = localStaff.map((s, i) => {
        const shiftsWorked = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        const offDays = filteredPrograms.length - shiftsWorked;
        const status = offDays >= 2 ? 'MATCH' : 'CHECK';
        return [i + 1, s.name.toUpperCase(), s.initials, shiftsWorked, offDays, status];
      });
      autoTable(doc, {
        startY: 55,
        head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']],
        body: localRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const val = data.cell.text[0];
            data.cell.styles.fillColor = val === 'MATCH' ? [16, 185, 129] : [225, 29, 72];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      });

      // 3. Weekly Personnel Utilization Audit (Roster)
      doc.addPage();
      drawHeader("Weekly Personnel Utilization Audit (Roster)");
      const rosterStaff = staff.filter(s => s.type === 'Roster');
      const rosterRows = rosterStaff.map((s, i) => {
        const potential = calculateCredits(s, startDate!, filteredPrograms.length, []);
        const actual = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        const status = actual >= potential ? 'MATCH' : 'CHECK';
        return [i + 1, s.name.toUpperCase(), s.initials, s.workFromDate || 'N/A', s.workToDate || 'N/A', potential, actual, status];
      });
      autoTable(doc, {
        startY: 55,
        head: [['S/N', 'NAME', 'INIT', 'WORK FROM', 'WORK TO', 'POTENTIAL', 'ACTUAL', 'STATUS']],
        body: rosterRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 7) {
            const val = data.cell.text[0];
            data.cell.styles.fillColor = val === 'MATCH' ? [16, 185, 129] : [225, 29, 72];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      });

      // 4. Weekly Operations Matrix View
      doc.addPage();
      drawHeader("Weekly Operations Matrix View");
      const matrixHead = [['S/N', 'AGENT', ...filteredPrograms.map(p => p.dateString!.split('-').slice(1).reverse().join('/')), 'AUDIT']];
      const matrixBody = staff.map((s, i) => {
        const row: any[] = [i + 1, `${s.initials} (${s.type[0]})`];
        let lastEndTime: Date | null = null;
        
        filteredPrograms.forEach(p => {
          const as = p.assignments.find(a => a.staffId === s.id);
          const shift = shifts.find(sh => sh.id === as?.shiftId);
          if (shift) {
            const currentStartTime = new Date(`${shift.pickupDate}T${shift.pickupTime}`);
            let isViolation = false;
            if (lastEndTime) {
               const restHours = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60 * 60);
               if (restHours < minRestHours) isViolation = true;
            }
            row.push({ content: `${shift.pickupTime} [${getShiftDuration(shift)}H]`, styles: { fillColor: isViolation ? [225, 29, 72] : [255, 255, 255], textColor: isViolation ? [255,255,255] : [0,0,0] } });
            const endTime = new Date(`${shift.endDate}T${shift.endTime}`);
            lastEndTime = endTime;
          } else {
            row.push('-');
          }
        });
        const count = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
        row.push(`${count}/${filteredPrograms.length}`);
        return row;
      });
      autoTable(doc, {
        startY: 55,
        head: matrixHead,
        body: matrixBody,
        theme: 'grid',
        headStyles: { fillColor: [234, 88, 12] },
        styles: { fontSize: 7, fontStyle: 'bold' }
      });

      // 5. Specialist Role Fulfillment Matrix
      doc.addPage();
      drawHeader("Specialist Role Fulfillment Matrix");
      const specRows: any[] = [];
      filteredPrograms.forEach(p => {
        shifts.filter(s => s.pickupDate === p.dateString).forEach(s => {
          const assigned = p.assignments.filter(a => a.shiftId === s.id);
          const getP = (skill: string) => {
             const prs = assigned.filter(a => a.role.includes(getSkillCodeShort(skill)));
             const initials = prs.map(a => getStaffById(a.staffId)?.initials).join(', ');
             const required = s.roleCounts?.[skill as Skill] || 0;
             const met = prs.length >= required;
             return { content: initials || '-', styles: { fillColor: initials ? (met ? [16, 185, 129] : [225, 29, 72]) : [255, 255, 255], textColor: initials ? [255, 255, 255] : [0,0,0] } };
          };
          specRows.push([
            p.dateString!.split('-').slice(1).reverse().join('/'),
            `${s.pickupTime}-${s.endTime}`,
            getP('Shift Leader'), getP('Load Control'), getP('Ramp'), getP('Operations'), getP('Lost and Found')
          ]);
        });
      });
      autoTable(doc, {
        startY: 55,
        head: [['DATE', 'SHIFT', 'SL', 'LC', 'RMP', 'OPS', 'LF']],
        body: specRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 8, fontStyle: 'bold' }
      });
    }

    doc.save(`SkyOPS_Handling_Program_${startDate}.pdf`);
  };

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
           <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Operational Analytics</h2>
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
             <Activity size={14} className="text-blue-500" /> Registry Mode: 100% PDF Consistency
           </p>
           <label className="flex items-center gap-3 mt-4 cursor-pointer group">
              <input type="checkbox" className="w-5 h-5 rounded border-slate-200" checked={attachAnalytics} onChange={e => setAttachAnalytics(e.target.checked)} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-900">Include Operational Analytics on Cover (PDF)</span>
           </label>
        </div>
        <button onClick={generatePDF} className="px-10 py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 shadow-xl hover:bg-blue-500 transition-all active:scale-95">
           <Printer size={18} /> Export Document
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 md:p-12 space-y-12">
            {stats && (
              <div className="flex justify-end">
                <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
                   <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Manpower Capacity Forecast</h4>
                   <div className="space-y-2 text-[11px] font-medium text-slate-600">
                      <p>Total Supply: <span className="font-black text-slate-950">{stats.totalSupply} Shifts</span></p>
                      <p>Total Demand: <span className="font-black text-slate-950">{stats.totalDemand} Shifts (Min)</span></p>
                      <div className="pt-4 flex justify-between items-center">
                         <span className="text-emerald-500 font-black">Net Balance: +{stats.balance}</span>
                         <span className={`px-3 py-1 rounded-lg text-[9px] font-black ${stats.balance >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600 animate-pulse'}`}>Status: {stats.status}</span>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {filteredPrograms.map((p) => {
              const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
              return (
                <div key={p.dateString} className="space-y-6">
                  <h3 className="text-2xl font-black italic text-slate-900 uppercase tracking-tight">{getFormatDate(p.dateString)}</h3>
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                       <thead className="bg-black text-white text-[10px] font-black uppercase tracking-widest">
                         <tr>
                           <th className="p-4">S/N</th>
                           <th className="p-4">PICKUP</th>
                           <th className="p-4">RELEASE</th>
                           <th className="p-4">FLIGHTS</th>
                           <th className="p-4">HC / MAX</th>
                           <th className="p-4">PERSONNEL & ASSIGNED ROLES</th>
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
                                      <span key={fid} className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black">{getFlightById(fid)?.flightNumber}</span>
                                    )) || 'NIL'}
                                  </div>
                                </td>
                                <td className="p-4 font-black text-slate-600">{assigned.length} / {s.maxStaff}</td>
                                <td className="p-4">
                                   <div className="flex flex-wrap gap-2 text-[10px]">
                                      {assigned.map(a => (
                                        <span key={a.id} className="text-slate-900 font-medium">
                                           {getStaffById(a.staffId)?.initials} ({getSkillCodeShort(a.role)}) <span className="text-slate-400 font-black">[{getShiftDuration(s)}H]</span>
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
