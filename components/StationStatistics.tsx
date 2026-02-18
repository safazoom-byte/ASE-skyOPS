
import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest, Skill } from '../types';
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
  const hasSkill = (s: Staff, skill: Skill) => {
    if (skill === 'Shift Leader') return s.isShiftLeader;
    if (skill === 'Load Control') return s.isLoadControl;
    if (skill === 'Ramp') return s.isRamp;
    if (skill === 'Operations') return s.isOps;
    if (skill === 'Lost and Found') return s.isLostFound;
    return false;
  };

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

    // 1. Skill Supply vs Demand (Total Period)
    let totalAvailableShifts = 0;
    const skillStats = AVAILABLE_SKILLS.map(skill => {
      let available = 0;
      let supply = 0;
      let need = 0;
      staff.forEach(s => {
        if (hasSkill(s, skill)) {
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

    // 2. Role Composition (Local vs Roster Breakdown)
    const roleComposition = AVAILABLE_SKILLS.map(skill => {
        const localCount = staff.filter(s => s.type === 'Local' && hasSkill(s, skill)).length;
        const rosterCount = staff.filter(s => s.type === 'Roster' && hasSkill(s, skill)).length;
        const total = localCount + rosterCount;
        return { skill, localCount, rosterCount, total };
    });

    // 3. Daily Data & Daily Specialist Supply
    const dailyData = Array.from({ length: duration }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      
      let staffNeeded = 0;
      shifts.filter(sh => sh.pickupDate === dStr).forEach(sh => staffNeeded += sh.minStaff);
      
      let rosterAvailable = 0;
      // Calculate generic roster availability for the day
      staff.filter(s => s.type === 'Roster').forEach(s => {
        const onLeave = leaveRequests.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
        const inContract = s.workFromDate && s.workToDate && dStr >= s.workFromDate && dStr <= s.workToDate;
        if (!onLeave && inContract) rosterAvailable++;
      });

      const localNeeded = Math.max(0, staffNeeded - rosterAvailable);
      const localOff = Math.max(0, totalLocal - localNeeded);

      // Calculate Daily Active Staff PER ROLE
      const dailyRoles: Record<Skill, number> = {
          'Shift Leader': 0, 'Load Control': 0, 'Ramp': 0, 'Operations': 0, 'Lost and Found': 0
      };

      AVAILABLE_SKILLS.forEach(skill => {
          const count = staff.filter(s => {
              if (!hasSkill(s, skill)) return false;
              
              // Check leave
              const onLeave = leaveRequests.some(l => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr);
              if (onLeave) return false;

              // Check contract if roster
              if (s.type === 'Roster') {
                  if (!s.workFromDate || !s.workToDate) return false;
                  if (dStr < s.workFromDate || dStr > s.workToDate) return false;
              }
              return true;
          }).length;
          dailyRoles[skill] = count;
      });
      
      return { 
        date: dStr, 
        needed: staffNeeded, 
        rosterAvailable, 
        localNeeded, 
        localOff,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dailyRoles
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
      totalRoster: staff.length - totalLocal,
      activeCount: activeStaff.length,
      inactiveStaff,
      totalAvailableShifts,
      totalNeededShifts,
      surplus,
      safeVacation: Math.max(0, safeVacation),
      dailyData,
      skillStats,
      roleComposition
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

    // 3. WORKFORCE COMPOSITION (Requested: Local vs Roster count per role)
    doc.setFontSize(16);
    doc.text("2. WORKFORCE COMPOSITION & ROLE BREAKDOWN", 14, (doc as any).lastAutoTable.finalY + 20);
    
    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 28,
        head: [['Role / Discipline', 'Local Staff', 'Roster Staff', 'Total Agents', 'Local %']],
        body: stats.roleComposition.map(rc => [
            rc.skill.toUpperCase(),
            rc.localCount,
            rc.rosterCount,
            rc.total,
            rc.total > 0 ? `${Math.round((rc.localCount / rc.total) * 100)}%` : '0%'
        ]),
        headStyles: { fillColor: [55, 65, 81] },
        styles: { fontSize: 9, halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });

    // 4. DAILY STAFF LOGIC
    doc.addPage(); // Start new page for dense data
    doc.setFontSize(16);
    doc.text("3. DAILY MANPOWER LOGIC BREAKDOWN", 14, 25);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Calculation: Local Needed = (Total Demand - Roster Active). Remaining local staff are marked Off-Duty.", 14, 33);

    autoTable(doc, {
      startY: 38,
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

    // 5. DAILY SPECIALIST SUPPLY (Requested: Active staff from role daily)
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("4. DAILY SPECIALIST SUPPLY FORECAST", 14, (doc as any).lastAutoTable.finalY + 20);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Count of personnel Available (In Contract & Not on Leave) for each discipline per day.", 14, (doc as any).lastAutoTable.finalY + 28);

    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 32,
        head: [['Date', 'Shift Leader', 'Load Control', 'Ramp', 'Ops', 'Lost & Found']],
        body: stats.dailyData.map(d => [
            `${d.dayName.toUpperCase()} ${d.date.slice(5)}`, // Show MM-DD
            d.dailyRoles['Shift Leader'],
            d.dailyRoles['Load Control'],
            d.dailyRoles['Ramp'],
            d.dailyRoles['Operations'],
            d.dailyRoles['Lost and Found']
        ]),
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 9, halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });

    // 6. SPECIALIST DISCIPLINE MATRIX (Totals)
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("5. DISCIPLINE SUPPLY vs DEMAND (TOTALS)", 14, (doc as any).lastAutoTable.finalY + 20);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 28,
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

    doc.save(`SKY-OPS_GOLD_AUDIT_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-6 md:space-y-10 ${className}`}>
      {/* UI Elements replicate the Gold look already established */}
      <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 blur-3xl rounded-full"></div>
        <div className="flex items-center gap-6 text-center md:text-left flex-col md:flex-row">
          <div className="w-20 h-20 bg-slate-950 rounded-[2.2rem] flex items-center justify-center text-amber-400 shadow-2xl border-2 border-amber-400/20">
              <Star size={40} fill="currentColor" />
          </div>
          <div>
              <h3 className="text-3xl md:text-5xl font-black text-slate-950 uppercase italic tracking-tighter leading-none">
                Station Audit
              </h3>
              <p className="text-xs md:text-sm font-black text-amber-500 uppercase tracking-widest mt-3 flex items-center justify-center md:justify-start gap-2">
                <CheckCircle2 size={16} /> Gold Standard Analytics
              </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto relative z-10">
           <button onClick={downloadPDF} className="px-10 py-6 bg-slate-950 text-white rounded-3xl font-black uppercase italic tracking-[0.2em] shadow-2xl hover:bg-amber-500 transition-all flex items-center justify-center gap-4 group">
              <Download size={20} className="group-hover:animate-bounce" />
              Download Gold Report
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-10">
         <div className="bg-slate-950 text-white p-8 md:p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[300px]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none"></div>
            <div>
               <div className="flex justify-between items-start mb-8">
                  <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
                     <TrendingUp size={24} className="text-amber-400" />
                  </div>
                  <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${stats.surplus >= 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/20 border-rose-500/40 text-rose-400'}`}>
                     {stats.surplus >= 0 ? 'Healthy Balance' : 'Action Required'}
                  </div>
               </div>
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Net Manpower Balance</h4>
               <p className="text-5xl md:text-6xl font-black italic tracking-tighter text-white">
                  {stats.surplus > 0 ? '+' : ''}{stats.surplus} <span className="text-lg md:text-2xl not-italic text-slate-500 font-bold tracking-normal">Shifts</span>
               </p>
            </div>
            <div className="mt-8 pt-8 border-t border-white/10">
               <div className="flex justify-between items-end">
                  <div>
                     <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Vacation Cap</p>
                     <p className="text-xl font-bold text-white">{stats.safeVacation} Staff / Day</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Supply</p>
                     <p className="text-xl font-bold text-white">{stats.totalAvailableShifts} Shifts</p>
                  </div>
               </div>
            </div>
         </div>

         <div className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-8 flex items-center gap-3">
               <ShieldCheck size={24} className="text-indigo-600" /> Skill Coverage
            </h4>
            <div className="space-y-4">
               {stats.skillStats.map(s => (
                  <div key={s.skill} className="flex items-center justify-between group">
                     <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">{s.skill}</span>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="text-right">
                           <span className={`text-sm font-black ${s.ok ? 'text-slate-900' : 'text-rose-500'}`}>{Math.round((s.supply / (s.need || 1)) * 100)}%</span>
                        </div>
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className={`h-full rounded-full ${s.ok ? 'bg-slate-900' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, (s.supply / (s.need || 1)) * 100)}%` }}></div>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>

      {/* Daily Breakdown Grid */}
      <div className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100">
         <div className="flex justify-between items-center mb-8">
            <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
               <Sun size={24} className="text-amber-500" /> Daily Pulse
            </h4>
            <div className="flex gap-2">
               <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase">Roster</span>
               <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-[9px] font-black uppercase">Local</span>
            </div>
         </div>
         <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
               {stats.dailyData.map((d, i) => (
                  <div key={i} className="w-32 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 group hover:border-amber-400 transition-all hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1">
                     <div className="text-center pb-2 border-b border-slate-200">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{d.dayName}</span>
                        <span className="text-lg font-black text-slate-900">{d.date.split('-')[2]}</span>
                     </div>
                     <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px]">
                           <span className="font-bold text-slate-500">Need</span>
                           <span className="font-black text-slate-900">{d.needed}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                           <div className="h-full bg-slate-900" style={{ width: '100%' }}></div>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-1 mt-1">
                        <div className="bg-indigo-100 rounded-lg p-1.5 text-center">
                           <span className="block text-[8px] font-bold text-indigo-400 uppercase">Rst</span>
                           <span className="block text-xs font-black text-indigo-700">{d.rosterAvailable}</span>
                        </div>
                        <div className="bg-white rounded-lg p-1.5 text-center border border-slate-100">
                           <span className="block text-[8px] font-bold text-slate-400 uppercase">Loc</span>
                           <span className="block text-xs font-black text-slate-700">{d.localNeeded}</span>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};
