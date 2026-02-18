
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

    // 4. DAILY MANPOWER LOGIC BREAKDOWN
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
      headStyles: { fillColor: [212, 175, 55], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', minCellHeight: 10 }, 
      styles: { fontSize: 9, halign: 'center', cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [250, 250, 245] },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 45 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 },
        5: { cellWidth: 25 }
      },
      margin: { left: 14, right: 14 }
    });

    // 5. DAILY SPECIALIST SUPPLY FORECAST (Requested: Active staff from role daily)
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
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', minCellHeight: 10 },
        styles: { fontSize: 9, halign: 'center', cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.1 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: { 
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 },
            1: { cellWidth: 32 },
            2: { cellWidth: 32 },
            3: { cellWidth: 25 },
            4: { cellWidth: 25 },
            5: { cellWidth: 32 }
        },
        margin: { left: 14, right: 14 }
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
        s.ok ? 'SUFFICIENT' : 'SHORTFALL'
      ]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9, halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      didParseCell: (data) => {
         if (data.section === 'body' && data.column.index === 4) {
            const isOk = data.cell.raw === 'SUFFICIENT';
            data.cell.styles.textColor = isOk ? [22, 163, 74] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
         }
      }
    });

    doc.save(`SkyOPS_Gold_Audit_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-6 md:space-y-12 pb-24 ${className}`}>
      <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
           <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-900">Performance Audit</h3>
           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
             <BarChart3 size={14} className="text-amber-500" /> Manpower Intelligence Engine
           </p>
        </div>
        <button onClick={downloadPDF} className="w-full md:w-auto px-8 py-5 bg-slate-950 text-white rounded-2xl font-black uppercase flex items-center justify-center gap-3 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
          <Download size={18} className="text-amber-400" />
          <span>Export Gold Report</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 bg-slate-900 text-white p-6 md:p-10 rounded-3xl md:rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-between">
           <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>
           <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                 <div>
                    <h4 className="text-xl font-black italic uppercase tracking-tighter">Station Health</h4>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Net Resource Availability</p>
                 </div>
                 <div className={`px-4 py-2 rounded-xl border ${stats.surplus >= 0 ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/20 border-rose-500/30 text-rose-400'} backdrop-blur-md`}>
                    <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                       {stats.surplus >= 0 ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                       {stats.surplus >= 0 ? 'Stable' : 'Critical'}
                    </span>
                 </div>
              </div>
              
              <div className="grid grid-cols-2 gap-8 md:gap-12">
                 <div>
                    <span className="text-4xl md:text-6xl font-black italic tracking-tighter block">{stats.totalAvailableShifts}</span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Supply Capacity</span>
                 </div>
                 <div className="text-right">
                    <span className="text-4xl md:text-6xl font-black italic tracking-tighter block text-slate-400">{stats.totalNeededShifts}</span>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Demand Load</span>
                 </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10 flex justify-between items-end">
                 <div>
                    <span className={`text-2xl md:text-3xl font-black italic ${stats.surplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                       {stats.surplus > 0 ? '+' : ''}{stats.surplus} <span className="text-sm not-italic font-bold text-slate-500">SHIFTS</span>
                    </span>
                 </div>
                 <div className="text-right">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Safe Vacation Limit</div>
                    <div className="text-xl font-black italic text-blue-400 flex items-center justify-end gap-2">
                       <Palmtree size={18} /> {stats.safeVacation} <span className="text-[10px] text-slate-600 not-italic">PER DAY</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="space-y-6 md:space-y-8">
           <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex-1">
              <h5 className="text-sm font-black uppercase italic text-slate-900 mb-6 flex items-center gap-2">
                 <Users size={16} className="text-indigo-500" /> Registry Split
              </h5>
              <div className="space-y-4">
                 <div className="flex justify-between items-center p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Local Staff</span>
                       <span className="text-2xl font-black italic text-slate-900">{stats.totalLocal}</span>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-50">
                       <UserX size={18} />
                    </div>
                 </div>
                 <div className="flex justify-between items-center p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Roster Staff</span>
                       <span className="text-2xl font-black italic text-slate-900">{stats.totalRoster}</span>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center text-amber-500 shadow-sm border border-amber-50">
                       <Users size={18} />
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
         {stats.skillStats.map(s => (
            <div key={s.skill} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-blue-200 transition-all">
               <div className="flex justify-between items-start mb-4">
                  <div>
                     <h5 className="text-sm font-black uppercase italic text-slate-900">{s.skill}</h5>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{s.available} Active Agents</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                     {s.ok ? <CheckCircle2 size={14} /> : <TrendingUp size={14} />}
                  </div>
               </div>
               
               <div className="space-y-3">
                  <div className="flex justify-between items-end">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Coverage</span>
                     <span className={`text-sm font-black ${s.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {Math.round((s.supply / (s.need || 1)) * 100)}%
                     </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                     <div 
                        className={`h-full rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                        style={{ width: `${Math.min(100, (s.supply / (s.need || 1)) * 100)}%` }}
                     ></div>
                  </div>
                  <div className="flex justify-between text-[9px] font-bold text-slate-500 pt-1">
                     <span>Supply: {s.supply}</span>
                     <span>Need: {s.need}</span>
                  </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  );
};
