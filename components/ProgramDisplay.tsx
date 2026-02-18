
import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment, Skill } from '../types';
import { calculateCredits } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Printer, 
  Activity,
  FileText,
  Table,
  LayoutGrid,
  ShieldAlert,
  CheckCircle2,
  FileBarChart,
  Layout
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

type ViewMode = 'program' | 'audit_local' | 'audit_roster' | 'matrix' | 'specialist';

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests = [], 
  incomingDuties = [], 
  startDate, 
  endDate, 
  onUpdatePrograms,
  minRestHours = 12
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('program');
  const [attachAnalytics, setAttachAnalytics] = useState(false);

  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs) || !startDate || !endDate) return [];
    return [...programs]
      .filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate)
      .sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  }, [programs, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const getHoursForStaff = (staffId: string) => {
    let totalMins = 0;
    filteredPrograms.forEach(p => {
      p.assignments.forEach(a => {
        if (a.staffId === staffId) {
          const shift = shifts.find(s => s.id === a.shiftId);
          if (shift) {
            const [h1, m1] = shift.pickupTime.split(':').map(Number);
            const [h2, m2] = shift.endTime.split(':').map(Number);
            let start = h1 * 60 + m1;
            let end = h2 * 60 + m2;
            if (end < start) end += 1440;
            totalMins += (end - start);
          }
        }
      });
    });
    return (totalMins / 60).toFixed(1);
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
    
    staff.forEach(s => totalSupply += calculateCredits(s, startDate, duration, leaveRequests));
    shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => totalDemand += s.minStaff);
    
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

    return { totalSupply, totalDemand, balance: totalSupply - totalDemand, status: (totalSupply - totalDemand) >= 0 ? 'HEALTHY' : 'CRITICAL', roleStats };
  }, [startDate, endDate, staff, shifts, leaveRequests, filteredPrograms]);

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const drawHeader = (dateStr: string, isFirst: boolean) => {
      doc.setFontSize(24);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text("SkyOPS Station Handling Program", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 28);

      if (isFirst && stats) {
        const bw = 80;
        const bh = 30;
        const bx = pageWidth - bw - 14;
        const by = 10;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.rect(bx, by, bw, bh, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text("MANPOWER CAPACITY FORECAST", bx + 5, by + 8);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Supply: ${stats.totalSupply} Shifts`, bx + 5, by + 15);
        doc.text(`Total Demand: ${stats.totalDemand} Shifts (Min)`, bx + 5, by + 21);
        doc.setTextColor(stats.balance >= 0 ? 16 : 225, stats.balance >= 0 ? 185 : 29, stats.balance >= 0 ? 129 : 72);
        doc.setFont('helvetica', 'bold');
        doc.text(`Net Balance: +${stats.balance}`, bx + 5, by + 28);
        doc.text(`Status: ${stats.status}`, bx + bw - 30, by + 28);
      }

      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(getFormatDate(dateStr), 14, 45);
    };

    filteredPrograms.forEach((p, idx) => {
      if (idx > 0) doc.addPage();
      drawHeader(p.dateString!, idx === 0);
      
      let currentY = 50;

      // Attachment Logic: If first page and toggle is ON
      if (idx === 0 && attachAnalytics && stats) {
          autoTable(doc, {
            startY: currentY,
            head: [['Operational Discipline', 'Supply', 'Demand', 'Status']],
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
        const prs = assigned.map(a => `${getStaffById(a.staffId)?.initials} (${getSkillCodeShort(a.role)})`).join(' | ');
        return [si + 1, s.pickupTime, s.endTime, flts, `${assigned.length} / ${s.maxStaff}`, prs];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3, textColor: [0, 0, 0] },
        columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } }
      });

      // Registry Placement Logic
      const registryY = (doc as any).lastAutoTable.finalY + 10;
      const spaceRemaining = pageHeight - registryY;
      
      // If toggle is ON, move registry to absolute footer
      const finalRegistryY = (idx === 0 && attachAnalytics) ? pageHeight - 50 : registryY;

      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("ABSENCE AND REST REGISTRY", 14, finalRegistryY);
      
      const dayLeaves = leaveRequests.filter(l => l.startDate <= p.dateString! && l.endDate >= p.dateString!);
      const regBody = [
        ['RESTING (POST-DUTY)', 'NONE'],
        ['DAYS OFF', dayLeaves.filter(l => l.type === 'Day off').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
        ['ROSTER LEAVE', dayLeaves.filter(l => l.type === 'Roster leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
        ['ANNUAL LEAVE', dayLeaves.filter(l => l.type === 'Annual leave').map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') || 'NONE'],
        ['STANDBY (RESERVE)', 'NONE']
      ];

      autoTable(doc, {
        startY: finalRegistryY + 5,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: regBody,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
      });
    });

    doc.save(`SkyOPS_Handling_Program_${startDate}.pdf`);
  };

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="space-y-4">
          <div>
            <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Operational Analytics</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <Activity size={14} className="text-blue-500" /> Registry Mode: 100% PDF Consistency
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${attachAnalytics ? 'bg-blue-600 border-blue-600' : 'border-slate-200 group-hover:border-blue-400'}`}>
               <input type="checkbox" className="hidden" checked={attachAnalytics} onChange={e => setAttachAnalytics(e.target.checked)} />
               {attachAnalytics && <CheckCircle2 size={14} className="text-white" />}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-900">Include Operational Analytics on Cover</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'program', label: 'Program', icon: LayoutGrid },
            { id: 'audit_local', label: 'Audit (L)', icon: FileText },
            { id: 'matrix', label: 'Matrix', icon: Table },
            { id: 'specialist', label: 'Spec Matrix', icon: ShieldAlert }
          ].map(view => (
            <button 
              key={view.id}
              onClick={() => setViewMode(view.id as ViewMode)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === view.id ? 'bg-slate-950 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
            >
              <view.icon size={14} /> {view.label}
            </button>
          ))}
          <div className="w-px h-8 bg-slate-200 mx-2 hidden lg:block"></div>
          <button onClick={generatePDF} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:bg-blue-500">
            <Printer size={14} /> Export Document
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        {viewMode === 'program' && (
          <div className="p-0 space-y-12">
            {stats && (
              <div className="p-8 md:p-12 bg-slate-50 flex justify-end">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
                   <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Manpower Capacity Forecast</h4>
                   <div className="space-y-2 text-[11px] font-medium text-slate-600">
                      <p>Total Supply: <span className="font-black text-slate-950">{stats.totalSupply} Shifts</span></p>
                      <p>Total Demand: <span className="font-black text-slate-950">{stats.totalDemand} Shifts (Min)</span></p>
                      <div className="pt-4 flex justify-between items-center">
                         <span className="text-emerald-500 font-black">Net Balance: +{stats.balance}</span>
                         <span className="text-emerald-500 font-black">Status: HEALTHY</span>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {filteredPrograms.map((p, idx) => {
              const dayShifts = shifts.filter(s => s.pickupDate === p.dateString).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
              return (
                <div key={p.dateString} className="px-8 md:px-12 pb-12 space-y-8">
                  <h3 className="text-2xl font-black italic text-slate-900 uppercase tracking-tight">{getFormatDate(p.dateString)}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-200">
                       <thead className="bg-black text-white text-[10px] font-black uppercase tracking-[0.2em]">
                         <tr>
                           <th className="p-4 border border-slate-800">S/N</th>
                           <th className="p-4 border border-slate-800">PICKUP</th>
                           <th className="p-4 border border-slate-800">RELEASE</th>
                           <th className="p-4 border border-slate-800">FLIGHTS</th>
                           <th className="p-4 border border-slate-800">HC / MAX</th>
                           <th className="p-4 border border-slate-800">PERSONNEL & ASSIGNED ROLES</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-200 text-[11px]">
                          {dayShifts.map((s, si) => {
                            const assigned = p.assignments.filter(a => a.shiftId === s.id);
                            return (
                              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 border border-slate-200 font-bold text-slate-400">{si + 1}</td>
                                <td className="p-4 border border-slate-200 font-black text-slate-900">{s.pickupTime}</td>
                                <td className="p-4 border border-slate-200 font-black text-slate-900">{s.endTime}</td>
                                <td className="p-4 border border-slate-200">
                                  <div className="flex flex-wrap gap-1">
                                    {(s.flightIds || []).map(fid => (
                                      <span key={fid} className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black">{getFlightById(fid)?.flightNumber}</span>
                                    )) || 'NIL'}
                                  </div>
                                </td>
                                <td className="p-4 border border-slate-200 font-black text-slate-600">{assigned.length} / {s.maxStaff}</td>
                                <td className="p-4 border border-slate-200">
                                   <div className="flex flex-wrap gap-2">
                                      {assigned.map(a => (
                                        <span key={a.id} className="text-slate-900 font-medium">
                                           {getStaffById(a.staffId)?.initials} ({getSkillCodeShort(a.role)}) <span className="text-slate-400 font-black">[{getHoursForStaff(a.staffId)}H]</span>
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

                  <div className="space-y-4">
                     <h4 className="text-lg font-black uppercase italic text-slate-900">Absence and Rest Registry</h4>
                     <table className="w-full border border-slate-200">
                        <thead className="bg-[#475569] text-white text-[10px] font-black uppercase tracking-widest">
                           <tr>
                             <th className="p-4 text-left border border-slate-600 w-1/3">Status Category</th>
                             <th className="p-4 text-left border border-slate-600">Personnel Initials</th>
                           </tr>
                        </thead>
                        <tbody className="text-[11px] font-medium text-slate-600">
                           {[
                             { label: 'RESTING (POST-DUTY)', type: 'NIL' },
                             { label: 'DAYS OFF', type: 'Day off' },
                             { label: 'ROSTER LEAVE', type: 'Roster leave' },
                             { label: 'ANNUAL LEAVE', type: 'Annual leave' },
                             { label: 'STANDBY (RESERVE)', type: 'NIL' }
                           ].map(row => {
                             const lvs = leaveRequests.filter(l => l.startDate <= p.dateString! && l.endDate >= p.dateString! && l.type === row.type);
                             return (
                               <tr key={row.label} className="border-b border-slate-200">
                                 <td className="p-4 border border-slate-200 font-black text-slate-700 bg-slate-50/50">{row.label}</td>
                                 <td className="p-4 border border-slate-200">
                                   {lvs.length > 0 ? lvs.map(l => `${getStaffById(l.staffId)?.initials} (1)`).join(', ') : 'NONE'}
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
        )}

        {viewMode === 'audit_local' && (
          <div className="p-12 space-y-8">
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">Weekly Personnel Utilization Audit (Local)</h2>
            <table className="w-full text-left border-collapse border border-slate-200">
               <thead className="bg-black text-white text-[10px] font-black uppercase">
                 <tr>
                   <th className="p-4">S/N</th>
                   <th className="p-4">NAME</th>
                   <th className="p-4">INIT</th>
                   <th className="p-4">WORK SHIFTS</th>
                   <th className="p-4">OFF DAYS</th>
                   <th className="p-4">STATUS</th>
                 </tr>
               </thead>
               <tbody>
                  {staff.filter(s => s.type === 'Local').map((s, i) => {
                    const ws = programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0);
                    const od = filteredPrograms.length - ws;
                    const status = ws <= 5 ? 'MATCH' : 'CHECK';
                    return (
                      <tr key={s.id} className={status === 'MATCH' ? 'bg-[#10b981] text-white' : 'bg-[#e11d48] text-white'}>
                         <td className="p-4 border border-white/20 font-bold">{i+1}</td>
                         <td className="p-4 border border-white/20 font-black">{s.name.toUpperCase()}</td>
                         <td className="p-4 border border-white/20 font-black">{s.initials}</td>
                         <td className="p-4 border border-white/20 font-black text-center">{ws}</td>
                         <td className="p-4 border border-white/20 font-black text-center">{od}</td>
                         <td className="p-4 border border-white/20 font-black text-center">{status}</td>
                      </tr>
                    );
                  })}
               </tbody>
            </table>
          </div>
        )}

        {viewMode === 'matrix' && (
          <div className="p-12 space-y-8 overflow-x-auto">
             <h2 className="text-3xl font-black uppercase italic tracking-tighter">Weekly Operations Matrix View</h2>
             <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-[#ea580c] text-white text-[10px] font-black uppercase">
                   <tr>
                     <th className="p-4 border border-orange-700">S/N</th>
                     <th className="p-4 border border-orange-700">AGENT</th>
                     {filteredPrograms.map(p => <th key={p.dateString} className="p-4 border border-orange-700 text-center">{p.dateString?.split('-').slice(1).reverse().join('/')}</th>)}
                     <th className="p-4 border border-orange-700 text-center">AUDIT</th>
                   </tr>
                </thead>
                <tbody className="text-[10px] font-black">
                   {staff.map((s, i) => (
                     <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 border border-slate-200 text-slate-400">{i+1}</td>
                        <td className="p-4 border border-slate-200 text-slate-900">{s.initials} ({s.type[0]})</td>
                        {filteredPrograms.map(p => {
                          const as = p.assignments.find(a => a.staffId === s.id);
                          const shift = shifts.find(sh => sh.id === as?.shiftId);
                          return (
                            <td key={p.dateString} className="p-4 border border-slate-200 text-center">
                               {shift ? `${shift.pickupTime} [${getHoursForStaff(s.id)}H]` : '-'}
                            </td>
                          );
                        })}
                        <td className="p-4 border border-slate-200 text-center text-slate-500">
                          {programs.reduce((acc, p) => acc + p.assignments.filter(a => a.staffId === s.id).length, 0)}/{filteredPrograms.length}
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        )}

        {viewMode === 'specialist' && (
           <div className="p-12 space-y-8">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">Specialist Role Fulfillment Matrix</h2>
              <table className="w-full text-left border-collapse">
                 <thead className="bg-black text-white text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="p-4 border border-slate-800">DATE</th>
                      <th className="p-4 border border-slate-800">SHIFT</th>
                      <th className="p-4 border border-slate-800">SL</th>
                      <th className="p-4 border border-slate-800">LC</th>
                      <th className="p-4 border border-slate-800">RMP</th>
                      <th className="p-4 border border-slate-800">OPS</th>
                    </tr>
                 </thead>
                 <tbody className="text-[10px] font-black">
                    {filteredPrograms.map(p => (
                      shifts.filter(s => s.pickupDate === p.dateString).map(s => {
                        const assigned = p.assignments.filter(a => a.shiftId === s.id);
                        const getRolePrs = (role: string) => assigned.filter(a => a.role.includes(role)).map(a => getStaffById(a.staffId)?.initials).join(', ') || '-';
                        return (
                          <tr key={s.id} className="bg-[#10b981] text-white border-b border-white/20">
                            <td className="p-4">{p.dateString?.split('-').slice(1).reverse().join('/')}</td>
                            <td className="p-4">{s.pickupTime}-{s.endTime}</td>
                            <td className="p-4">{getRolePrs('Leader')}</td>
                            <td className="p-4">{getRolePrs('Load')}</td>
                            <td className="p-4">{getRolePrs('Ramp')}</td>
                            <td className="p-4">{getRolePrs('Ops')}</td>
                          </tr>
                        );
                      })
                    ))}
                 </tbody>
              </table>
           </div>
        )}
      </div>
    </div>
  );
};
