
import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { calculateCredits } from '../services/geminiService';
import { 
  Users, 
  Activity, 
  Download, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  TrendingUp, 
  ShieldCheck, 
  CalendarRange, 
  Briefcase,
  UserX,
  CalendarDays,
  Scale,
  Zap,
  BarChart3
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

    // 1. Personnel Status Tracking
    const activeStaff: Staff[] = [];
    const inactiveRoster: Staff[] = [];
    const localStaff = staff.filter(s => s.type === 'Local');
    
    staff.forEach(s => {
      const credits = calculateCredits(s, startDate, duration, leaveRequests);
      if (credits > 0) {
        activeStaff.push(s);
      } else if (s.type === 'Roster') {
        inactiveRoster.push(s);
      }
    });

    // 2. Role Integrity & Capacity
    let totalShiftsSupply = 0;
    const roleStatsMap: Record<string, { total: number, active: number, supply: number, demand: number }> = {};
    AVAILABLE_SKILLS.forEach(skill => {
      roleStatsMap[skill] = { total: 0, active: 0, supply: 0, demand: 0 };
    });

    staff.forEach(s => {
      const credits = calculateCredits(s, startDate, duration, leaveRequests);
      totalShiftsSupply += credits;

      AVAILABLE_SKILLS.forEach(skill => {
        const hasSkill = (skill === 'Shift Leader' && s.isShiftLeader) || 
                         (skill === 'Load Control' && s.isLoadControl) || 
                         (skill === 'Ramp' && s.isRamp) || 
                         (skill === 'Operations' && s.isOps) || 
                         (skill === 'Lost and Found' && s.isLostFound);
        if (hasSkill) {
          roleStatsMap[skill].total++;
          if (credits > 0) {
            roleStatsMap[skill].active++;
            roleStatsMap[skill].supply += credits;
          }
        }
      });
    });

    // 3. Daily Manpower Breakdown (Supply vs Demand)
    const dailyMetrics = Array.from({ length: duration }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      
      let dDemand = 0;
      shifts.filter(sh => sh.pickupDate === dStr).forEach(sh => dDemand += sh.minStaff);
      
      // Daily supply is harder because credits are weekly, 
      // but we estimate for the stats view: (Total Supply / Duration)
      const dSupplyAvg = totalShiftsSupply / duration;
      
      return { date: dStr, demand: dDemand, supplyAvg: dSupplyAvg };
    });

    let totalShiftsDemand = 0;
    const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
    activeShifts.forEach(s => {
      totalShiftsDemand += s.minStaff;
      if (s.roleCounts) {
        Object.entries(s.roleCounts).forEach(([skill, count]) => {
          if (count && roleStatsMap[skill]) {
            roleStatsMap[skill].demand += (count as number);
          }
        });
      }
    });

    const balance = totalShiftsSupply - totalShiftsDemand;
    const leaveAllowance = duration > 0 ? Math.floor(balance / duration) : 0;

    return {
      duration,
      totalStaff: staff.length,
      rosterStaff: staff.filter(s => s.type === 'Roster').length,
      localStaff: localStaff.length,
      activeStaffCount: activeStaff.length,
      inactiveRoster,
      totalSupply: totalShiftsSupply,
      totalDemand: totalShiftsDemand,
      balance,
      leaveAllowance: Math.max(0, leaveAllowance),
      dailyMetrics,
      roleStats: AVAILABLE_SKILLS.map(skill => ({
        skill,
        ...roleStatsMap[skill],
        balance: roleStatsMap[skill].supply - roleStatsMap[skill].demand
      }))
    };
  }, [staff, shifts, leaveRequests, startDate, endDate]);

  const downloadPDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // -- Header Section --
    doc.setFillColor(2, 6, 23); // slate-950
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text("SkyOPS EXECUTIVE REPORT", 14, 25);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Station Operations Intel | Period: ${startDate} to ${endDate} (${stats.duration} Days)`, 14, 35);
    doc.setTextColor(59, 130, 246); // blue-500
    doc.text("CONFIDENTIAL - FOR MANAGEMENT USE ONLY", 14, 42);

    // -- Section 1: Core KPIs --
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text("1. OPERATIONAL CAPACITY SUMMARY", 14, 65);
    
    autoTable(doc, {
      startY: 70,
      head: [['KPI Dimension', 'Metric Value', 'Assessment']],
      body: [
        ['Total Workforce Registered', `${stats.totalStaff} Personnel`, 'Station Strength'],
        ['Active Combatant Force', `${stats.activeStaffCount} Agents`, 'Period Ready'],
        ['Gross Duty Supply', `${stats.totalSupply} Shifts`, 'Production Pool'],
        ['Registry Minimum Demand', `${stats.totalDemand} Shifts`, 'Critical Requirement'],
        ['Operational Net Balance', `${stats.balance > 0 ? '+' : ''}${stats.balance} Shifts`, stats.balance >= 0 ? 'STABLE' : 'DEFICIT'],
        ['Daily Safe Leave Allowance', `${stats.leaveAllowance} Slots/Day`, 'Risk Mitigation']
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9, cellPadding: 4 }
    });

    // -- Section 2: Role Integrity Matrix --
    const finalY1 = (doc as any).lastAutoTable.finalY;
    doc.text("2. DISCIPLINE INTEGRITY MATRIX", 14, finalY1 + 15);
    autoTable(doc, {
      startY: finalY1 + 20,
      head: [['Specialist Discipline', 'Active Headcount', 'Supply Capacity', 'Station Demand', 'Integrity Status']],
      body: stats.roleStats.map(r => [
        r.skill, 
        r.active, 
        `${r.supply} SHT`, 
        `${r.demand} SHT`, 
        r.balance >= 0 ? 'MATCH' : `CHECK (${r.balance})`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = data.cell.text[0].startsWith('MATCH') ? [16, 185, 129] : [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // -- Section 3: Inactive Personnel (Roster Out of Period) --
    doc.addPage();
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text("3. INACTIVE PERSONNEL REGISTRY (OUT OF PERIOD)", 14, 25);
    
    if (stats.inactiveRoster.length > 0) {
      autoTable(doc, {
        startY: 30,
        head: [['Name', 'Initials', 'Contract From', 'Contract To', 'Status']],
        body: stats.inactiveRoster.map(s => [
          s.name, 
          s.initials, 
          s.workFromDate || 'N/A', 
          s.workToDate || 'N/A', 
          'Outside Range'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105] }
      });
    } else {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("No inactive roster staff detected for this period.", 14, 35);
    }

    // -- Section 4: Daily Demand Analysis --
    const finalY2 = (doc as any).lastAutoTable?.finalY || 35;
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("4. DAILY STATION LOAD ANALYSIS", 14, finalY2 + 15);
    
    autoTable(doc, {
      startY: finalY2 + 20,
      head: [['Date', 'Min Requirement (Staff)', 'Supply Forecast', 'Variance']],
      body: stats.dailyMetrics.map(m => [
        m.date, 
        m.demand, 
        m.supplyAvg.toFixed(1), 
        (m.supplyAvg - m.demand).toFixed(1)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`SkyOPS_Station_Analytics_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-10 animate-in fade-in duration-700 ${className}`}>
      {/* Header & Export Card */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 gap-8">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 bg-slate-950 rounded-[2.5rem] flex items-center justify-center text-blue-400 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-600/20 blur-xl group-hover:scale-150 transition-transform duration-1000"></div>
              <TrendingUp size={40} className="relative z-10" />
          </div>
          <div>
              <h3 className="text-4xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Station Intelligence</h3>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
                 <ShieldCheck size={14} className="text-emerald-500" /> Operational Efficiency Analytics
              </p>
          </div>
        </div>
        <button onClick={downloadPDF} className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95">
           <Download size={20} /> Executive PDF Export
        </button>
      </div>

      {/* Main KPI Matrix */}
      <div className="bg-slate-950 rounded-[3.5rem] border border-white/5 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
            <Activity size={240} className="text-white" />
        </div>
        
        <div className="bg-white/5 p-8 md:p-12 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
           <div className="space-y-2">
              <h4 className="text-[12px] font-black text-blue-400 uppercase tracking-[0.5em] italic">Operational Audit</h4>
              <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter leading-none">Production Forecast</h2>
           </div>
           
           <div className="bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/10 shadow-inner min-w-[360px]">
              <div className="space-y-4">
                 <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Registry Supply Pool</span>
                    <span className="text-white">{stats.totalSupply} Man-Shifts</span>
                 </div>
                 <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Total Service Demand</span>
                    <span className="text-white">{stats.totalDemand} Man-Shifts</span>
                 </div>
                 <div className="pt-5 mt-5 border-t border-white/10 flex justify-between items-center">
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Net Balance</span>
                       <span className="text-3xl font-black italic text-emerald-400">{stats.balance > 0 ? '+' : ''}{stats.balance}</span>
                    </div>
                    <div className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg ${stats.balance >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white animate-pulse'}`}>
                       Status: {stats.balance >= 0 ? 'HEALTHY' : 'CRITICAL'}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="p-10 md:p-16 grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
           <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 flex flex-col justify-between h-44 hover:bg-white/10 transition-all group/card">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users size={14} className="text-blue-500"/> Personnel Force</span>
              <div>
                 <p className="text-5xl font-black italic text-white leading-none">{stats.totalStaff}</p>
                 <div className="flex gap-2 mt-4">
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-[8px] font-black uppercase">{stats.activeStaffCount} Active</span>
                    <span className="px-2 py-1 bg-slate-800 text-slate-500 rounded-lg text-[8px] font-black uppercase">{stats.totalStaff - stats.activeStaffCount} Dormant</span>
                 </div>
              </div>
           </div>
           
           <div className="p-8 bg-blue-600 rounded-[2.5rem] flex flex-col justify-between h-44 text-white shadow-2xl shadow-blue-600/20 relative overflow-hidden group/card">
              <CalendarRange size={120} className="absolute -bottom-10 -right-10 text-white/10 rotate-12 group-hover/card:scale-125 transition-transform duration-700" />
              <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest relative z-10 italic">Daily Leave Allowance</span>
              <div className="relative z-10">
                 <p className="text-6xl font-black italic text-white leading-none">{stats.leaveAllowance}</p>
                 <p className="text-[10px] font-black text-blue-100 mt-4 uppercase tracking-[0.2em]">Safe Slots / Oper. Day</p>
              </div>
           </div>
           
           <div className="p-8 bg-slate-900 rounded-[2.5rem] flex flex-col justify-between h-44 border border-white/5 shadow-inner group/card">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Briefcase size={14} className="text-indigo-400" /> Shift Capacity</span>
              <div>
                 <p className="text-5xl font-black italic text-white leading-none">
                    {stats.totalSupply > 0 ? Math.round((stats.totalDemand / stats.totalSupply) * 100) : 0}%
                 </p>
                 <p className="text-[9px] font-black text-slate-600 mt-4 uppercase italic">Manpower Utilization index</p>
              </div>
           </div>
           
           <div className="p-8 bg-emerald-500/5 rounded-[2.5rem] border border-emerald-500/20 flex flex-col justify-between h-44 group/card">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest italic">Station Status</span>
              <div>
                 <p className="text-5xl font-black italic text-emerald-400 leading-none">{stats.balance >= 0 ? 'ELITE' : 'ALERT'}</p>
                 <p className="text-[9px] font-black text-emerald-600/60 mt-4 uppercase tracking-widest">System Reliability Core</p>
              </div>
           </div>
        </div>
      </div>

      {/* Role Integrity Matrix */}
      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/20">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-600/20">
              <Layers size={28} />
            </div>
            <h4 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Discipline Capacity Analysis</h4>
          </div>
          <div className="flex gap-4">
             <div className="px-5 py-2 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Users size={12}/> {stats.totalStaff} Profiles
             </div>
             <div className="px-5 py-2 bg-emerald-100 rounded-full text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 size={12}/> {stats.activeStaffCount} Available
             </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">
                <th className="p-8 pl-12">Operational Dimension</th>
                <th className="p-8 text-center">Active Specialists</th>
                <th className="p-8 text-center">Supply (Shifts)</th>
                <th className="p-8 text-center">Demand (Min)</th>
                <th className="p-8 pr-12 text-right">Integrity Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {stats.roleStats.map((row) => (
                <tr key={row.skill} className="hover:bg-slate-50/50 transition-all group">
                  <td className="p-8 pl-12">
                    <div className="flex flex-col">
                      <span className="font-black italic text-slate-900 uppercase text-sm group-hover:text-blue-600 transition-colors">{row.skill}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase mt-2">{row.total} Registry Profiles</span>
                    </div>
                  </td>
                  <td className="p-8 text-center">
                    <span className="text-lg font-black italic text-slate-700">{row.active}</span>
                  </td>
                  <td className="p-8 text-center">
                    <div className="inline-flex items-center px-6 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600 text-[11px] font-black shadow-sm group-hover:scale-105 transition-transform">
                      {row.supply} SHT
                    </div>
                  </td>
                  <td className="p-8 text-center">
                    <div className="inline-flex items-center px-6 py-2.5 bg-slate-100 rounded-2xl text-slate-500 text-[11px] font-black">
                      {row.demand} SHT
                    </div>
                  </td>
                  <td className="p-8 pr-12 text-right">
                    {row.balance >= 0 ? (
                      <div className="flex items-center justify-end gap-3 text-emerald-500 font-black text-[11px] uppercase tracking-widest italic bg-emerald-50 px-4 py-2 rounded-xl inline-flex">
                        MATCH <CheckCircle2 size={18} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 text-rose-500 font-black text-[11px] uppercase tracking-widest italic bg-rose-50 px-4 py-2 rounded-xl inline-flex">
                        CHECK ({row.balance}) <AlertTriangle size={18} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inactive Roster & Daily Timeline Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Inactive Personnel */}
          <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm p-10 space-y-8">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
                   <UserX size={24} />
                </div>
                <div>
                   <h4 className="text-xl font-black italic uppercase text-slate-950">Dormant Registry</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roster Personnel Outside Period Window</p>
                </div>
             </div>
             <div className="space-y-4">
                {stats.inactiveRoster.length === 0 ? (
                   <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                      <span className="text-slate-300 font-black uppercase text-xs italic tracking-widest">All Roster Personnel Are Within Window</span>
                   </div>
                ) : (
                   stats.inactiveRoster.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black italic text-slate-950 shadow-sm border border-slate-100">{s.initials}</div>
                            <span className="text-xs font-bold text-slate-700">{s.name}</span>
                         </div>
                         <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Contract Window</p>
                            <p className="text-[10px] font-black text-rose-500 italic">{s.workFromDate} - {s.workToDate}</p>
                         </div>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Daily Station Load Timeline */}
          <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm p-10 space-y-8">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                   <BarChart3 size={24} />
                </div>
                <div>
                   <h4 className="text-xl font-black italic uppercase text-slate-950">Station Load Timeline</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Manpower demand VS supply avg</p>
                </div>
             </div>
             <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 no-scrollbar">
                {stats.dailyMetrics.map(m => (
                   <div key={m.date} className="space-y-2">
                      <div className="flex justify-between items-end">
                         <span className="text-[10px] font-black text-slate-400 uppercase">{m.date}</span>
                         <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter">Demand: {m.demand} / Supply: {m.supplyAvg.toFixed(1)}</span>
                      </div>
                      <div className="h-4 bg-slate-50 rounded-full flex overflow-hidden border border-slate-100">
                         <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${Math.min(100, (m.demand / (m.supplyAvg || 1)) * 100)}%` }} />
                         {m.demand > m.supplyAvg && <div className="h-full bg-rose-500 flex-1" />}
                      </div>
                   </div>
                ))}
             </div>
          </div>
      </div>

      {/* AI Decision Hub */}
      <div className="p-12 bg-slate-950 rounded-[4rem] text-white flex flex-col lg:flex-row items-center justify-between gap-12 shadow-2xl relative overflow-hidden border-4 border-white/5">
        <div className="absolute inset-0 bg-blue-600/5 blur-[120px] pointer-events-none group-hover:scale-125 transition-transform duration-1000"></div>
        <div className="flex items-center gap-10 relative z-10">
           <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-600/40 animate-pulse">
             <Zap size={48} />
           </div>
           <div>
              <h4 className="text-3xl font-black italic uppercase leading-none tracking-tight">AI Allocation Advisory</h4>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-3 flex items-center gap-2">
                 <Info size={16} className="text-blue-400" /> Executive Decision Support
              </p>
           </div>
        </div>
        <div className="text-center lg:text-right relative z-10 max-w-2xl bg-white/5 p-8 rounded-[3rem] border border-white/5 backdrop-blur-md">
           <p className="text-base font-medium text-blue-100 leading-relaxed italic">
             "Station integrity audit reveals a net surplus of <span className="text-emerald-400 font-black underline decoration-emerald-400/30 underline-offset-8">{stats.balance} man-shifts</span> for the target window. 
             Based on mandatory 5/2 rest compliance and specialist depth, the system can authorize up to <span className="text-white font-black px-4 py-1.5 bg-blue-600 rounded-xl shadow-lg">{stats.leaveAllowance} leave requests per day</span> without compromising the standard ground handling SLA."
           </p>
        </div>
      </div>
    </div>
  );
};
