
import React, { useMemo, useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Assignment, Skill } from '../types';
import { calculateCredits, repairProgramWithAI } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Printer, 
  Activity,
  FileText,
  Sparkles,
  Loader2,
  GripHorizontal,
  Plus,
  X,
  AlertTriangle,
  Check,
  ShieldAlert,
  Wrench
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

interface RepairIssue {
  id: string;
  type: 'coverage' | 'rest' | 'role';
  description: string;
  severity: 'high' | 'medium';
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
  onUpdatePrograms,
  minRestHours = 12
}) => {
  const [attachAnalytics, setAttachAnalytics] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [draggedAssignment, setDraggedAssignment] = useState<{ id: string, day: number, shiftId: string } | null>(null);
  
  // Repair Dialog State
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [detectedIssues, setDetectedIssues] = useState<RepairIssue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());

  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs) || !startDate || !endDate) return [];
    return [...programs]
      .filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate)
      .sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
  }, [programs, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const stats = useMemo(() => {
    if (!startDate || !endDate) return null;
    const duration = filteredPrograms.length;
    let totalSupply = 0;
    let totalDemand = 0;
    
    staff.forEach(s => totalSupply += calculateCredits(s, startDate, duration, leaveRequests));
    shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => totalDemand += s.minStaff);
    
    return { totalSupply, totalDemand, balance: totalSupply - totalDemand, status: (totalSupply - totalDemand) >= 0 ? 'HEALTHY' : 'CRITICAL' };
  }, [startDate, endDate, staff, shifts, leaveRequests, filteredPrograms]);

  const runDiagnosis = () => {
    const issues: RepairIssue[] = [];
    filteredPrograms.forEach(p => {
       const dayShifts = shifts.filter(s => s.pickupDate === p.dateString);
       dayShifts.forEach(s => {
          const assignedCount = p.assignments.filter(a => a.shiftId === s.id).length;
          if (assignedCount < s.minStaff) {
             issues.push({ id: `cov-${s.id}`, type: 'coverage', description: `${p.dateString} - Shift ${s.pickupTime}: Understaffed (${assignedCount}/${s.minStaff})`, severity: 'high' });
          }
       });
    });

    staff.forEach(s => {
       const staffAssignments = filteredPrograms.flatMap(p => 
          p.assignments.filter(a => a.staffId === s.id).map(a => ({ ...a, date: p.dateString }))
       );
       staffAssignments.sort((a, b) => {
          const shiftA = shifts.find(sh => sh.id === a.shiftId);
          const shiftB = shifts.find(sh => sh.id === b.shiftId);
          if (!shiftA || !shiftB) return 0;
          return (shiftA.pickupDate + shiftA.pickupTime).localeCompare(shiftB.pickupDate + shiftB.pickupTime);
       });
       for (let i = 1; i < staffAssignments.length; i++) {
          const prev = shifts.find(sh => sh.id === staffAssignments[i-1].shiftId);
          const curr = shifts.find(sh => sh.id === staffAssignments[i].shiftId);
          if (prev && curr) {
             const prevEnd = new Date(`${prev.pickupDate}T${prev.endTime}`); 
             if (prev.endTime < prev.pickupTime) prevEnd.setDate(prevEnd.getDate() + 1);
             const currStart = new Date(`${curr.pickupDate}T${curr.pickupTime}`);
             const diffHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
             if (diffHours < minRestHours) {
                issues.push({ id: `rest-${s.id}-${curr.id}`, type: 'rest', description: `${s.initials} - Rest Violation on ${curr.pickupDate} (Only ${diffHours.toFixed(1)}h)`, severity: 'high' });
             }
          }
       }
    });
    setDetectedIssues(issues);
    setSelectedIssueIds(new Set(issues.map(i => i.id)));
    setShowRepairModal(true);
  };

  const confirmRepair = async () => {
    if (!onUpdatePrograms) return;
    setIsRepairing(true);
    setShowRepairModal(false);
    try {
      const activeIssues = detectedIssues.filter(i => selectedIssueIds.has(i.id));
      const issueReport = activeIssues.map(i => i.description).join('; ');
      const dataObj = { flights, staff, shifts, programs, leaveRequests, incomingDuties };
      const result = await repairProgramWithAI(programs, `Fix these specific issues: ${issueReport}`, dataObj, { minRestHours });
      if (result && result.programs) onUpdatePrograms(result.programs);
    } catch (e: any) { alert("AI Repair Failed: " + e.message); } finally { setIsRepairing(false); }
  };

  const toggleIssue = (id: string) => {
    const next = new Set(selectedIssueIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIssueIds(next);
  };

  const handleDrop = (targetShiftId: string, targetDay: number) => {
    if (!draggedAssignment || !onUpdatePrograms) return;
    if (draggedAssignment.day !== targetDay) return; 
    const newPrograms = [...programs];
    const dayProg = newPrograms.find(p => p.day === targetDay);
    if (dayProg) {
      const assignment = dayProg.assignments.find(a => a.id === draggedAssignment.id);
      if (assignment) {
        assignment.shiftId = targetShiftId;
        onUpdatePrograms(newPrograms);
      }
    }
    setDraggedAssignment(null);
  };

  const handleManualAdd = (day: number, shiftId: string) => {
    if (!onUpdatePrograms) return;
    const initials = prompt("Enter Staff Initials to Assign:");
    if (!initials) return;
    const matchedStaff = staff.find(s => s.initials.toUpperCase() === initials.toUpperCase());
    if (!matchedStaff) { alert("Staff not found!"); return; }
    const newPrograms = [...programs];
    const dayProg = newPrograms.find(p => p.day === day);
    if (dayProg) {
      dayProg.assignments.push({ id: Math.random().toString(36).substr(2, 9), staffId: matchedStaff.id, shiftId: shiftId, role: 'AGT', flightId: '' });
      onUpdatePrograms(newPrograms);
    }
  };

  const handleManualRemove = (day: number, assignmentId: string) => {
    if (!onUpdatePrograms) return;
    if (!confirm("Remove this assignment?")) return;
    const newPrograms = [...programs];
    const dayProg = newPrograms.find(p => p.day === day);
    if (dayProg) {
      dayProg.assignments = dayProg.assignments.filter(a => a.id !== assignmentId);
      onUpdatePrograms(newPrograms);
    }
  };

  const isRoleMatch = (roleStr: string, targetSkill: string) => {
    const r = (roleStr || '').toLowerCase();
    const t = targetSkill.toLowerCase();
    if (t === 'operations' || t === 'ops') return r.includes('op') || r.includes('ops');
    if (t === 'shift leader' || t === 'sl') return r.includes('leader') || r.includes('sl');
    if (t === 'load control' || t === 'lc') return r.includes('load') || r.includes('lc');
    if (t === 'ramp' || t === 'rmp') return r.includes('ramp') || r.includes('rmp');
    if (t === 'lost and found' || t === 'lf') return r.includes('lost') || r.includes('lf');
    return r.includes(t);
  };

  const getSkillCodeShort = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r.includes('leader') || r.includes('sl')) return 'SL';
    if (r.includes('load') || r.includes('lc')) return 'LC';
    if (r.includes('ramp') || r.includes('rmp')) return 'RMP';
    if (r.includes('op')) return 'OPS'; 
    if (r.includes('lost') || r.includes('lf')) return 'LF';
    return '';
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

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
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
        doc.rect(boxX, 10, boxWidth, 25, 'FD'); 
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text("MANPOWER CAPACITY FORECAST", boxX + 5, 16);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Supply: ${stats.totalSupply} Shifts`, boxX + 5, 22);
        doc.text(`Total Demand: ${stats.totalDemand} Shifts (Min)`, boxX + 5, 27);
        doc.setFont('helvetica', 'bold');
        if (stats.balance >= 0) doc.setTextColor(16, 185, 129); else doc.setTextColor(225, 29, 72); 
        doc.text(`Net Balance: ${stats.balance > 0 ? '+' : ''}${stats.balance}`, boxX + 5, 32);
        doc.text(`Status: ${stats.status}`, boxX + 40, 32);
        doc.setTextColor(0, 0, 0);
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), 14, 45);
    };

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
            return `${st?.initials}${rolePart}`;
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
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 30 }, 4: { cellWidth: 18 } }
      });
    });
    doc.save(`SkyOPS_Station_Handling_Program_${startDate}.pdf`);
  };

  const getFormatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).toUpperCase().replace(',', ' -');
  };

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500 relative">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
           <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Operational Program</h2>
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
             <Activity size={14} className="text-blue-500" /> Professional Handling Roster
           </p>
           <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded border-slate-200" checked={attachAnalytics} onChange={e => setAttachAnalytics(e.target.checked)} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-900">With Audit</span>
              </label>
           </div>
        </div>
        <div className="flex gap-3">
           <button onClick={runDiagnosis} disabled={isRepairing} className="px-8 py-5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 shadow-xl hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50">
              {isRepairing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isRepairing ? 'Fixing...' : 'AI Repair'}
           </button>
           <button onClick={generatePDF} className="px-10 py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
              <Printer size={18} /> Download PDF
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 md:p-12 space-y-12">
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
                                <td className={`p-4 transition-all ${draggedAssignment?.day === p.day && draggedAssignment.shiftId !== s.id ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(s.id, p.day)}>
                                   <div className="flex flex-wrap gap-2 text-[10px] items-center">
                                      {assigned.map(a => {
                                        const roleCode = getSkillCodeShort(a.role);
                                        return (
                                          <div key={a.id} draggable onDragStart={() => setDraggedAssignment({ id: a.id, day: p.day, shiftId: s.id })} onDragEnd={() => setDraggedAssignment(null)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing group">
                                             <GripHorizontal size={12} className="text-slate-300" />
                                             <span className="text-slate-900 font-bold">
                                                {getStaffById(a.staffId)?.initials}
                                                {roleCode && <span className="text-blue-600 ml-1 font-black">({roleCode})</span>}
                                             </span>
                                             <button onClick={(e) => { e.stopPropagation(); handleManualRemove(p.day, a.id); }} className="p-1 rounded-full hover:bg-rose-100 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><X size={10} /></button>
                                          </div>
                                        );
                                      })}
                                      <button onClick={() => handleManualAdd(p.day, s.id)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300 hover:text-blue-500 hover:border-blue-500 transition-all"><Plus size={14} /></button>
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

      {showRepairModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
             <div className="bg-indigo-600 p-8 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg"><Wrench size={24} className="text-indigo-600" /></div>
                   <div>
                     <h3 className="text-xl font-black italic text-white uppercase tracking-tighter leading-none">Diagnostic Repair</h3>
                     <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest mt-1">Review & Fix Violations</p>
                   </div>
                </div>
                <button onClick={() => setShowRepairModal(false)} className="text-indigo-100 hover:text-white transition-colors bg-white/10 p-2 rounded-full"><X size={20}/></button>
             </div>
             <div className="flex-1 overflow-y-auto p-8 space-y-4">
                {detectedIssues.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                     <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500"><Check size={32} /></div>
                     <h4 className="text-lg font-black text-slate-900">No Critical Issues Detected</h4>
                  </div>
                ) : (
                  detectedIssues.map(issue => (
                     <div key={issue.id} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-4 ${selectedIssueIds.has(issue.id) ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-300'}`} onClick={() => toggleIssue(issue.id)}>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${selectedIssueIds.has(issue.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}><Check size={14} strokeWidth={4} /></div>
                        <div className="flex-1"><p className="text-sm font-bold text-slate-900">{issue.description}</p></div>
                     </div>
                  ))
                )}
             </div>
             <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                <button onClick={confirmRepair} disabled={selectedIssueIds.size === 0} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3"><Sparkles size={18} /> Auto-Fix Selected ({selectedIssueIds.size})</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
