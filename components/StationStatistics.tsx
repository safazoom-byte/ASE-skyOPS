
import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { calculateCredits } from '../services/geminiService';
import { Users, Activity, Download, Layers, CheckCircle2, AlertTriangle, Info, TrendingUp, ShieldCheck, CalendarRange, Briefcase } from 'lucide-react';
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

    let totalShiftsSupply = 0;
    const roleStatsMap: Record<string, { total: number, active: number, supply: number, demand: number }> = {};
    
    AVAILABLE_SKILLS.forEach(skill => {
      roleStatsMap[skill] = { total: 0, active: 0, supply: 0, demand: 0 };
    });

    staff.forEach(s => {
      const credits = calculateCredits(s, startDate, duration, leaveRequests);
      totalShiftsSupply += credits;

      AVAILABLE_SKILLS.forEach(skill => {
        const hasSkill = (skill === 'Shift Leader' && s.isShiftLeader) || (skill === 'Load Control' && s.isLoadControl) || (skill === 'Ramp' && s.isRamp) || (skill === 'Operations' && s.isOps) || (skill === 'Lost and Found' && s.isLostFound);
        if (hasSkill) {
          roleStatsMap[skill].total++;
          if (credits > 0) {
            roleStatsMap[skill].active++;
            roleStatsMap[skill].supply += credits;
          }
        }
      });
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
      localStaff: staff.filter(s => s.type === 'Local').length,
      totalSupply: totalShiftsSupply,
      totalDemand: totalShiftsDemand,
      balance,
      leaveAllowance: Math.max(0, leaveAllowance),
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
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text("Station Intelligence Report", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${startDate} to ${endDate} (${stats.duration} Days)`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['MANPOWER KPI', 'METRIC']],
      body: [
        ['Total Shift Supply', `${stats.totalSupply}`],
        ['Station Demand (Min)', `${stats.totalDemand}`],
        ['Operational Balance', `${stats.balance > 0 ? '+' : ''}${stats.balance}`],
        ['Daily Safe Leave Allowance', `${stats.leaveAllowance} / Day`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Operational Role', 'Active', 'Supply', 'Demand', 'Status']],
      body: stats.roleStats.map(r => [r.skill, r.active, `${r.supply} SHT`, `${r.demand} SHT`, r.balance >= 0 ? 'MATCH' : 'CHECK']),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = data.cell.text[0] === 'MATCH' ? [16, 185, 129] : [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`SkyOPS_Station_Analytics_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-10 animate-in fade-in duration-700 ${className}`}>
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 gap-8">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 bg-slate-950 rounded-[2.5rem] flex items-center justify-center text-blue-400 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-600/20 blur-xl group-hover:scale-150 transition-transform duration-1000"></div>
              <TrendingUp size={40} className="relative z-10" />
          </div>
          <div>
              <h3 className="text-4xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Station Intelligence</h3>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
                 <ShieldCheck size={14} className="text-emerald-500" /> Professional Manpower Validation
              </p>
          </div>
        </div>
        <button onClick={downloadPDF} className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95">
           <Download size={20} /> Export Station Metrics
        </button>
      </div>

      <div className="bg-slate-950 rounded-[3.5rem] border border-white/5 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
            <Activity size={240} className="text-white" />
        </div>
        
        <div className="bg-white/5 p-8 md:p-12 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
           <div className="space-y-2">
              <h4 className="text-[12px] font-black text-blue-400 uppercase tracking-[0.5em] italic">Operational Audit</h4>
              <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter leading-none">Capacity Forecast</h2>
           </div>
           
           <div className="bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/10 shadow-inner min-w-[360px]">
              <div className="space-y-4">
                 <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Gross Supply</span>
                    <span className="text-white">{stats.totalSupply} Shifts</span>
                 </div>
                 <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Critical Demand</span>
                    <span className="text-white">{stats.totalDemand} Shifts</span>
                 </div>
                 <div className="pt-5 mt-5 border-t border-white/10 flex justify-between items-center">
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Net Balance</span>
                       <span className="text-3xl font-black italic text-emerald-400">+{stats.balance}</span>
                    </div>
                    <div className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg ${stats.balance >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white animate-pulse'}`}>
                       Status: {stats.balance >= 0 ? 'STABLE' : 'CRITICAL'}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="p-10 md:p-16 grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
           <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 flex flex-col justify-between h-44 hover:bg-white/10 transition-all">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users size={14} className="text-blue-500"/> Total Force</span>
              <div>
                 <p className="text-5xl font-black italic text-white leading-none">{stats.totalStaff}</p>
                 <div className="flex gap-3 mt-4 text-[9px] font-black uppercase tracking-tighter">
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg">{stats.localStaff} Local</span>
                    <span className="px-2 py-1 bg-amber-600/20 text-amber-400 rounded-lg">{stats.rosterStaff} Roster</span>
                 </div>
              </div>
           </div>
           
           <div className="p-8 bg-blue-600 rounded-[2.5rem] flex flex-col justify-between h-44 text-white shadow-2xl shadow-blue-600/20 relative overflow-hidden group">
              <CalendarRange size={120} className="absolute -bottom-10 -right-10 text-white/10 rotate-12 group-hover:scale-125 transition-transform duration-700" />
              <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest relative z-10 italic">Leave Safety Buffer</span>
              <div className="relative z-10">
                 <p className="text-6xl font-black italic text-white leading-none">{stats.leaveAllowance}</p>
                 <p className="text-[10px] font-black text-blue-100 mt-4 uppercase tracking-[0.2em]">Safe Slots / Day</p>
              </div>
           </div>
           
           <div className="p-8 bg-slate-900 rounded-[2.5rem] flex flex-col justify-between h-44 border border-white/5 shadow-inner">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Briefcase size={14} className="text-indigo-400" /> Efficiency Rating</span>
              <div>
                 <p className="text-5xl font-black italic text-white leading-none">
                    {stats.totalSupply > 0 ? Math.round((stats.totalDemand / stats.totalSupply) * 100) : 0}%
                 </p>
                 <p className="text-[9px] font-black text-slate-600 mt-4 uppercase italic">Optimized Utilization Index</p>
              </div>
           </div>
           
           <div className="p-8 bg-emerald-500/5 rounded-[2.5rem] border border-emerald-500/20 flex flex-col justify-between h-44">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest italic">Station Rank</span>
              <div>
                 <p className="text-5xl font-black italic text-emerald-400 leading-none">ELITE</p>
                 <p className="text-[9px] font-black text-emerald-600/60 mt-4 uppercase tracking-widest">Operational Core Robust</p>
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/20">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-600/20">
              <Layers size={28} />
            </div>
            <h4 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Role Integrity Matrix</h4>
          </div>
          <div className="px-6 py-2 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
            Coverage Period: {stats.duration} Operations Days
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100">
                <th className="p-8 pl-12">Discipline Dimension</th>
                <th className="p-8 text-center">Active Specialists</th>
                <th className="p-8 text-center">Duty Supply</th>
                <th className="p-8 text-center">Service Demand</th>
                <th className="p-8 pr-12 text-right">Integrity Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {stats.roleStats.map((row) => (
                <tr key={row.skill} className="hover:bg-slate-50/50 transition-all group">
                  <td className="p-8 pl-12">
                    <div className="flex flex-col">
                      <span className="font-black italic text-slate-900 uppercase text-sm group-hover:text-blue-600 transition-colors">{row.skill}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase mt-2">{row.total} Total Registered Profiles</span>
                    </div>
                  </td>
                  <td className="p-8 text-center">
                    <span className="text-lg font-black italic text-slate-700">{row.active}</span>
                  </td>
                  <td className="p-8 text-center">
                    <div className="inline-flex items-center px-6 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600 text-[11px] font-black shadow-sm group-hover:scale-105 transition-transform">
                      {row.supply} SHIFTS
                    </div>
                  </td>
                  <td className="p-8 text-center">
                    <div className="inline-flex items-center px-6 py-2.5 bg-slate-100 rounded-2xl text-slate-500 text-[11px] font-black">
                      {row.demand} SHIFTS
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

      <div className="p-12 bg-slate-950 rounded-[4rem] text-white flex flex-col lg:flex-row items-center justify-between gap-12 shadow-2xl relative overflow-hidden border-4 border-white/5">
        <div className="absolute inset-0 bg-blue-600/5 blur-[120px] pointer-events-none group-hover:scale-125 transition-transform duration-1000"></div>
        <div className="flex items-center gap-10 relative z-10">
           <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-600/40 animate-pulse">
             <Activity size={48} />
           </div>
           <div>
              <h4 className="text-3xl font-black italic uppercase leading-none tracking-tight">AI Decision Hub</h4>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-3 flex items-center gap-2">
                 <Info size={16} className="text-blue-400" /> Station Manager Allocation Advisory
              </p>
           </div>
        </div>
        <div className="text-center lg:text-right relative z-10 max-w-2xl bg-white/5 p-8 rounded-[3rem] border border-white/5 backdrop-blur-md">
           <p className="text-base font-medium text-blue-100 leading-relaxed italic">
             "Roster analysis reveals a robust net surplus of <span className="text-emerald-400 font-black underline decoration-emerald-400/30 underline-offset-8">{stats.balance} man-shifts</span> for the period. 
             Factoring in strict 5/2 compliance and current handling volume, you can safely authorize up to <span className="text-white font-black px-4 py-1.5 bg-blue-600 rounded-xl shadow-lg">{stats.leaveAllowance} leave requests per day</span>. This threshold ensures 100% service level agreement (SLA) fulfillment and maintains critical operational integrity."
           </p>
        </div>
      </div>
    </div>
  );
};
