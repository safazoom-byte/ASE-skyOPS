
import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { calculateCredits } from '../services/geminiService';
import { 
  Users, 
  Download, 
  CheckCircle2, 
  TrendingUp, 
  UserX,
  Zap,
  BarChart3,
  Sun,
  ShieldCheck,
  Plane,
  Calculator,
  Palmtree,
  Star
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  startDate: string;
  endDate: string;
  className?: string;
}

export const StationStatistics: React.FC<Props> = ({ staff, shifts, leaveRequests = [], startDate, endDate, className = '' }) => {
  const stats = useMemo(() => {
    if (!startDate || !endDate) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const totalLocal = staff.filter(s => s.type === 'Local').length;
    const activeStaff: Staff[] = [];
    const inactiveStaff: Staff[] = [];
    
    staff.forEach(s => {
      const credits = calculateCredits(s, startDate, duration, leaveRequests);
      if (credits > 0) activeStaff.push(s);
      else inactiveStaff.push(s);
    });

    // Skill logic
    let totalAvailableShifts = 0;
    const skillStats = AVAILABLE_SKILLS.map(skill => {
      let available = 0;
      let supply = 0;
      let need = 0;
      staff.forEach(s => {
        const hasSkill = (skill === 'Shift Leader' && s.isShiftLeader) || 
                         (skill === 'Load Control' && s.isLoadControl) || 
                         (skill === 'Ramp' && s.isRamp) || 
                         (skill === 'Operations' && s.isOps) || 
                         (skill === 'Lost and Found' && s.isLostFound);
        if (hasSkill) {
          const credits = calculateCredits(s, startDate, duration, leaveRequests);
          if (credits > 0) {
            available++;
            supply += credits;
          }
        }
      });
      shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => {
        if (s.roleCounts && s.roleCounts[skill]) need += (s.roleCounts[skill] as number);
      });
      return { skill, available, supply, need, ok: supply >= need };
    });

    staff.forEach(s => totalAvailableShifts += calculateCredits(s, startDate, duration, leaveRequests));

    // Detailed Daily Logic
    const dailyData = Array.from({ length: duration }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      
      let staffNeeded = 0;
      shifts.filter(sh => sh.pickupDate === dStr).forEach(sh => staffNeeded += sh.minStaff);
      
      let rosterAvailable = 0;
      staff.filter(s => s.type === 'Roster').forEach(s => {
        const onLeave = leaveRequests.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        const inContract = s.workFromDate && s.workToDate && dStr >= s.workFromDate && dStr <= s.workToDate;
        if (!onLeave && inContract) rosterAvailable++;
      });

      const localNeeded = Math.max(0, staffNeeded - rosterAvailable);
      const localOff = Math.max(0, totalLocal - localNeeded);
      
      return { 
        date: dStr, 
        needed: staffNeeded, 
        rosterAvailable, 
        localNeeded, 
        localOff,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' })
      };
    });

    let totalNeededShifts = 0;
    shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate).forEach(s => totalNeededShifts += s.minStaff);
    const surplus = totalAvailableShifts - totalNeededShifts;
    const safeVacation = duration > 0 ? Math.floor(surplus / duration) : 0;

    return {
      duration,
      totalStaff: staff.length,
      totalLocal,
      activeCount: activeStaff.length,
      inactiveStaff,
      totalAvailableShifts,
      totalNeededShifts,
      surplus,
      safeVacation: Math.max(0, safeVacation),
      dailyData,
      skillStats
    };
  }, [staff, shifts, leaveRequests, startDate, endDate]);

  const downloadPDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. PREMIUM HEADER (Navy & Gold)
    doc.setFillColor(15, 23, 42); // Navy
    doc.rect(0, 0, pageWidth, 55, 'F');
    doc.setFillColor(212, 175, 55); // Gold Accent
    doc.rect(0, 55, pageWidth, 3, 'F');

    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text("SKY-OPS GOLD STATION AUDIT", 14, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(212, 175, 55); 
    doc.text(`PREMIUM PERFORMANCE REPORT | ${startDate} to ${endDate}`, 14, 38);
    doc.setTextColor(160, 160, 160);
    doc.text(`Daily Manpower & Resource Utilization Analytics`, 14, 45);

    // 2. SUMMARY KPI TABLE
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text("1. STATION CAPACITY SUMMARY", 14, 75);

    autoTable(doc, {
      startY: 82,
      head: [['Dimension', 'Value', 'Operational Context']],
      body: [
        ['Total Registered Personnel', `${stats.totalStaff} Staff`, 'Registry Strength'],
        ['Total Production Pool', `${stats.totalAvailableShifts} Shifts`, 'Total Supply'],
        ['Operational Requirements', `${stats.totalNeededShifts} Shifts`, 'Total Demand'],
        ['Net Resource Balance', `${stats.surplus > 0 ? '+' : ''}${stats.surplus} Shifts`, stats.surplus >= 0 ? 'STABLE' : 'CRITICAL'],
        ['Daily Vacation Allowance', `${stats.safeVacation} People/Day`, 'Safe Threshold']
      ],
      headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 4 },
      theme: 'grid'
    });

    // 3. DAILY STAFF LOGIC (The specific request)
    doc.setFontSize(16);
    doc.text("2. DAILY MANPOWER LOGIC BREAKDOWN", 14, (doc as any).lastAutoTable.finalY + 20);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Calculation: Local Needed = (Total Demand - Roster Active). Remaining local staff are marked Off-Duty.", 14, (doc as any).lastAutoTable.finalY + 28);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 32,
      head: [['Date', 'Demand', 'Roster Active', 'Local Needed', 'Local Off-Duty', 'Vacation Cap']],
      body: stats.dailyData.map(d => [
        `${d.dayName.toUpperCase()} ${d.date}`, 
        d.needed, 
        d.rosterAvailable, 
        d.localNeeded, 
        d.localOff,
        stats.safeVacation
      ]),
      headStyles: { fillColor: [212, 175, 55], textColor: [0, 0, 0] }, 
      styles: { fontSize: 9, halign: 'center', cellPadding: 3 },
      alternateRowStyles: { fillColor: [252, 250, 240] }
    });

    // 4. DISCIPLINE INTEGRITY (Role Check)
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setFillColor(212, 175, 55);
    doc.rect(0, 25, pageWidth, 1, 'F');
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text("3. SPECIALIST DISCIPLINE MATRIX", 14, 40);
    
    autoTable(doc, {
      startY: 48,
      head: [['Specialist Department', 'Headcount', 'Supply (SHT)', 'Demand (SHT)', 'Status']],
      body: stats.skillStats.map(s => [
        s.skill.toUpperCase(), 
        s.available, 
        s.supply, 
        s.need, 
        s.ok ? 'MATCHED' : 'UNDERSTAFFED'
      ]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.column.index === 4 && data.section === 'body') {
          const matched = data.cell.text[0] === 'MATCHED';
          data.cell.styles.textColor = matched ? [16, 185, 129] : [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // 5. INACTIVE REGISTRY
    if (stats.inactiveStaff.length > 0) {
      doc.setFontSize(16);
      doc.text("4. INACTIVE PERSONNEL REGISTRY", 14, (doc as any).lastAutoTable.finalY + 20);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 28,
        head: [['Initials', 'Name', 'Contract / Status']],
        body: stats.inactiveStaff.map(s => [
            s.initials, 
            s.name.toUpperCase(), 
            s.type === 'Roster' ? `Outside Window (${s.workFromDate || '?'}-${s.workToDate || '?'})` : 'System Inactive'
        ]),
        headStyles: { fillColor: [100, 100, 100] },
        styles: { fontSize: 8 }
      });
    }

    doc.save(`SKY-OPS_GOLD_AUDIT_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-6 md:space-y-10 ${className}`}>
      {/* UI Elements replicate the Gold look already established, keeping consistency */}
      <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 blur-3xl rounded-full"></div>
        <div className="flex items-center gap-6 text-center md:text-left flex-col md:flex-row">
          <div className="w-20 h-20 bg-slate-950 rounded-[2.2rem] flex items-center justify-center text-amber-400 shadow-2xl border-2 border-amber-400/20">
              <Star size={40} fill="currentColor" />
          </div>
          <div>
              <h3 className="text-3xl md:text-5xl font-black text-slate-950 uppercase italic tracking-tighter leading-none">Station Pulse</h3>
              <p className="text-[10px] md:text-xs font-black text-amber-600 uppercase tracking-[0.4em] mt-3 flex items-center justify-center md:justify-start gap-2 italic">
                 <Zap size={14} fill="currentColor" /> Gold Standard Audit Engine
              </p>
          </div>
        </div>
        <button onClick={downloadPDF} className="w-full md:w-auto px-12 py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-4 hover:bg-amber-500 hover:text-slate-950 transition-all shadow-2xl shadow-slate-950/20 group">
           <Download size={20} className="group-hover:translate-y-1 transition-transform" /> <span className="italic">Export Gold PDF Report</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8">
        <div className="lg:col-span-3 bg-slate-950 rounded-[3.5rem] p-10 md:p-14 text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <ShieldCheck size={280} />
           </div>
           
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 pb-10 border-b border-white/10 gap-6">
              <div>
                 <p className="text-amber-500 font-black uppercase text-[10px] tracking-[0.5em] mb-3 italic">Live Station Health</p>
                 <h2 className="text-4xl md:text-6xl font-black italic uppercase leading-none tracking-tighter">Manpower Audit</h2>
              </div>
              <div className="bg-white/5 px-10 py-6 rounded-[2rem] border border-white/10 text-center backdrop-blur-xl">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Net Shift Balance</p>
                 <p className="text-5xl font-black text-emerald-400 italic">+{stats.surplus}</p>
              </div>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { label: 'Roster Staff', val: stats.dailyData[0]?.rosterAvailable || 0, icon: Users, color: 'text-amber-400', sub: 'Active Today' },
                { label: 'Active Total', val: stats.activeCount, icon: CheckCircle2, color: 'text-emerald-400', sub: 'Ready Force' },
                { label: 'Total Needed', val: stats.totalNeededShifts, icon: Plane, color: 'text-blue-400', sub: 'Registry Load' },
                { label: 'Safe Leave', val: stats.safeVacation, icon: Palmtree, color: 'text-amber-200', sub: 'Daily Slots' }
              ].map((item, i) => (
                <div key={i} className="space-y-3 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all group">
                   <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}><item.icon size={20} /></div>
                   <p className="text-4xl font-black italic leading-none">{item.val}</p>
                   <div>
                     <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{item.label}</p>
                     <p className="text-[7px] font-bold text-slate-500 uppercase mt-0.5 tracking-tighter">{item.sub}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <div className="bg-amber-500 rounded-[3.5rem] p-10 text-slate-950 shadow-2xl relative overflow-hidden flex flex-col justify-between border-4 border-white/10">
           <Star size={160} className="absolute -bottom-10 -right-10 text-slate-950/10 rotate-12" />
           <div>
              <h4 className="text-3xl font-black italic uppercase leading-none">Vacation<br/>Allowance</h4>
              <p className="text-[10px] font-black text-slate-950/60 uppercase tracking-[0.2em] mt-4 italic">Daily Peak Capacity</p>
           </div>
           <div className="mt-10">
              <p className="text-8xl font-black italic leading-none tracking-tighter">{stats.safeVacation}</p>
              <p className="text-[11px] font-bold leading-relaxed mt-8 text-slate-950/80">
                 Your station can safely authorize up to <strong>{stats.safeVacation} vacation requests</strong> per day.
              </p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-10 md:p-14 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-950 rounded-[1.5rem] flex items-center justify-center text-amber-400 shadow-xl"><Zap size={28} fill="currentColor"/></div>
              <div>
                <h4 className="text-3xl font-black italic uppercase text-slate-950 tracking-tighter leading-none">Discipline Matrix</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 italic">Role Fulfillment & Quality Audit</p>
              </div>
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
              <tr>
                <th className="p-10 pl-14">Specialist Discipline</th>
                <th className="p-10 text-center">Active Headcount</th>
                <th className="p-10 text-center">Total Supply (SHT)</th>
                <th className="p-10 text-center">Station Demand (SHT)</th>
                <th className="p-10 pr-14 text-right">Integrity Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.skillStats.map((row) => (
                <tr key={row.skill} className="hover:bg-amber-50/30 transition-colors group">
                  <td className="p-10 pl-14">
                    <span className="font-black text-slate-950 uppercase text-base italic group-hover:text-amber-600 transition-colors">{row.skill}</span>
                  </td>
                  <td className="p-10 text-center font-bold text-slate-600 text-lg">{row.available}</td>
                  <td className="p-10 text-center">
                    <span className="px-5 py-2 bg-slate-100 text-slate-950 rounded-2xl text-[11px] font-black italic border border-slate-200">{row.supply} SHT</span>
                  </td>
                  <td className="p-10 text-center">
                    <span className="px-5 py-2 bg-blue-50 text-blue-600 rounded-2xl text-[11px] font-black italic border border-blue-100">{row.need} SHT</span>
                  </td>
                  <td className="p-10 pr-14 text-right">
                    {row.ok ? (
                      <span className="text-emerald-600 font-black text-xs uppercase italic bg-emerald-50 px-6 py-2.5 rounded-2xl border border-emerald-100 tracking-widest shadow-sm">MATCHED ✓</span>
                    ) : (
                      <span className="text-rose-500 font-black text-xs uppercase italic bg-rose-50 px-6 py-2.5 rounded-2xl border border-rose-100 tracking-widest shadow-sm">RECRUIT!</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="bg-white rounded-[3.5rem] border border-slate-100 p-10 md:p-14 space-y-12 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px]"></div>
             <div className="flex items-center gap-6 relative z-10">
                <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-600 shadow-sm border border-blue-100"><BarChart3 size={32} /></div>
                <div>
                   <h4 className="text-2xl font-black italic uppercase text-slate-950 leading-none tracking-tighter">Day-to-Day Analytics</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Station Demand vs Workforce Pulse</p>
                </div>
             </div>
             
             <div className="space-y-8 max-h-[600px] overflow-y-auto pr-6 no-scrollbar relative z-10">
                {stats.dailyData.map(d => (
                   <div key={d.date} className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 space-y-6 hover:border-amber-400/30 hover:bg-white transition-all group shadow-sm">
                      <div className="flex justify-between items-center">
                         <span className="text-sm font-black text-slate-950 uppercase italic tracking-widest">{d.dayName} • {d.date}</span>
                         <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-100 px-4 py-2 rounded-xl border border-blue-200">TOTAL NEED: {d.needed}</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                         <div className="p-5 bg-white rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-3xl font-black italic text-slate-950">{d.rosterAvailable}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1 leading-none">Roster<br/>Active</p>
                         </div>
                         <div className="p-5 bg-white rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-3xl font-black italic text-blue-600">{d.localNeeded}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1 leading-none">Local<br/>Needed</p>
                         </div>
                         <div className="p-5 bg-white rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-3xl font-black italic text-emerald-500">{d.localOff}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1 leading-none">Local<br/>Off-Duty</p>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          <div className="bg-slate-950 rounded-[3.5rem] p-10 md:p-14 space-y-12 shadow-2xl flex flex-col border border-white/5">
             <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-rose-500/10 rounded-[1.5rem] flex items-center justify-center text-rose-500 shadow-sm border border-rose-500/20"><UserX size={32} /></div>
                <div>
                   <h4 className="text-2xl font-black italic uppercase text-white leading-none tracking-tighter">Inactive Personnel</h4>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2 italic">Excl. from Operational Window</p>
                </div>
             </div>
             
             <div className="space-y-4 flex-1">
                {stats.inactiveStaff.length === 0 ? (
                   <div className="h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[3rem] gap-6 p-10 text-center">
                      <Sun size={40} className="text-emerald-500" />
                      <p className="text-base font-black text-white uppercase italic tracking-widest leading-none">Full Readiness</p>
                   </div>
                ) : (
                   stats.inactiveStaff.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-6 bg-white/5 rounded-[2rem] border border-white/5">
                         <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center font-black italic text-white text-xl">{s.initials}</div>
                            <div>
                               <span className="text-sm font-black text-white uppercase italic block leading-none">{s.name}</span>
                               <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-2 block">{s.type.toUpperCase()} UNIT</span>
                            </div>
                         </div>
                         <span className="text-[9px] font-black text-rose-400 uppercase italic bg-rose-500/10 px-4 py-2 rounded-xl">OUT OF WINDOW</span>
                      </div>
                   ))
                )}
             </div>
          </div>
      </div>
    </div>
  );
};
