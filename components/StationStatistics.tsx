import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { calculateCredits } from '../services/geminiService';
import { Users, Activity, Scale, CalendarX, Download, Layers, CheckCircle2, AlertTriangle, Info, TrendingUp, ShieldCheck } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  startDate: string;
  endDate: string;
  className?: string;
  compact?: boolean;
}

export const StationStatistics: React.FC<Props> = ({ staff, shifts, leaveRequests = [], startDate, endDate, className = '', compact = false }) => {
  const stats = useMemo(() => {
    if (!startDate || !endDate) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // 1. Manpower Supply (Strict Logic)
    let totalShiftsSupply = 0;
    const roleStatsMap: Record<string, { total: number, active: number, supply: number, demand: number }> = {};
    
    AVAILABLE_SKILLS.forEach(skill => {
      roleStatsMap[skill] = { total: 0, active: 0, supply: 0, demand: 0 };
    });

    staff.forEach(s => {
      const credits = calculateCredits(s, startDate, duration, leaveRequests);
      totalShiftsSupply += credits;

      AVAILABLE_SKILLS.forEach(skill => {
        let hasSkill = false;
        if (skill === 'Shift Leader' && s.isShiftLeader) hasSkill = true;
        if (skill === 'Load Control' && s.isLoadControl) hasSkill = true;
        if (skill === 'Ramp' && s.isRamp) hasSkill = true;
        if (skill === 'Operations' && s.isOps) hasSkill = true;
        if (skill === 'Lost and Found' && s.isLostFound) hasSkill = true;

        if (hasSkill) {
          roleStatsMap[skill].total++;
          if (credits > 0) {
            roleStatsMap[skill].active++;
            roleStatsMap[skill].supply += credits;
          }
        }
      });
    });

    // 2. Operational Demand
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
    doc.text("Station Analytics Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Target Period: ${startDate} to ${endDate} (${stats.duration} Days)`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['MANPOWER CAPACITY FORECAST', 'VALUE']],
      body: [
        ['Total Supply (Local 5/2 + Roster Contracts)', `${stats.totalSupply} Shifts`],
        ['Total Minimum Demand', `${stats.totalDemand} Shifts`],
        ['Net Station Balance', `${stats.balance > 0 ? '+' : ''}${stats.balance} Shifts`],
        ['Daily Leave Allowance (Safe to Release)', `${stats.leaveAllowance} Staff / Day`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Operational Role', 'Active', 'Supply', 'Demand', 'Balance Status']],
      body: stats.roleStats.map(r => [
        r.skill, 
        r.active, 
        `${r.supply} Shifts`, 
        `${r.demand} Shifts`, 
        r.balance >= 0 ? 'MATCH' : 'CHECK'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = data.cell.text[0] === 'MATCH' ? [16, 185, 129] : [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`SkyOPS_Station_Report_${startDate}.pdf`);
  };

  if (!stats) return null;

  return (
    <div className={`space-y-8 ${className}`}>
      {!compact && (
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-blue-400 shadow-2xl">
                <TrendingUp size={32} />
            </div>
            <div>
                <h3 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Station Intelligence</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                   <ShieldCheck size={12} className="text-emerald-500" /> Authorized Station Operations Data
                </p>
            </div>
          </div>
          <button onClick={downloadPDF} className="w-full md:w-auto px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-blue-600 transition-all shadow-xl shadow-blue-600/10">
             <Download size={18} /> Export Full Analysis
          </button>
        </div>
      )}

      {/* Main Forecast Card (Screenshot Style Replicated) */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5">
            <Activity size={180} className="text-slate-900" />
        </div>
        
        <div className="bg-slate-50 p-6 md:p-10 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
           <div className="space-y-1">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Resource Assessment</h4>
              <h2 className="text-3xl font-black italic text-slate-900 uppercase tracking-tight">Manpower Capacity Forecast</h2>
           </div>
           
           <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm min-w-[320px]">
              <div className="space-y-3">
                 <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <span>Total Supply</span>
                    <span className="text-slate-900">{stats.totalSupply} Shifts</span>
                 </div>
                 <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <span>Total Demand (Min)</span>
                    <span className="text-slate-900">{stats.totalDemand} Shifts</span>
                 </div>
                 <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none">Net Balance</span>
                       <span className="text-2xl font-black italic text-emerald-500">+{stats.balance}</span>
                    </div>
                    <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${stats.balance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                       Status: {stats.balance >= 0 ? 'HEALTHY' : 'CRITICAL'}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 relative z-10">
           <div className="p-6 bg-slate-50 rounded-[2rem] flex flex-col justify-between h-36 border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Force</span>
              <div>
                 <p className="text-4xl font-black italic text-slate-900 leading-none">{stats.totalStaff}</p>
                 <p className="text-[9px] font-bold text-slate-500 mt-2 flex gap-2">
                    <span className="text-blue-600 font-black">{stats.localStaff} Local</span> • <span className="text-amber-600 font-black">{stats.rosterStaff} Roster</span>
                 </p>
              </div>
           </div>
           
           <div className="p-6 bg-blue-600 rounded-[2rem] flex flex-col justify-between h-36 text-white relative overflow-hidden group shadow-lg shadow-blue-600/20">
              <CalendarX size={100} className="absolute -bottom-6 -right-6 text-white/10 rotate-12 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-black text-blue-100 uppercase tracking-widest relative z-10">Daily Leave Allowance</span>
              <div className="relative z-10">
                 <p className="text-4xl font-black italic text-white leading-none">{stats.leaveAllowance}</p>
                 <p className="text-[9px] font-black text-blue-100 mt-2 uppercase tracking-widest">Safe Leave Requests / Day</p>
              </div>
           </div>
           
           <div className="p-6 bg-slate-950 rounded-[2rem] flex flex-col justify-between h-36 text-white shadow-xl">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Utilization Index</span>
              <div>
                 <p className="text-4xl font-black italic text-white leading-none">
                    {stats.totalSupply > 0 ? Math.round((stats.totalDemand / stats.totalSupply) * 100) : 0}%
                 </p>
                 <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-widest italic">After Roster Staff Deductions</p>
              </div>
           </div>
           
           <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem] flex flex-col justify-between h-36">
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Integrity Rank</span>
              <div>
                 <p className="text-4xl font-black italic text-emerald-700 leading-none">ALPHA</p>
                 <p className="text-[9px] font-black text-emerald-600 mt-2 uppercase tracking-widest italic">All roles fully optimized</p>
              </div>
           </div>
        </div>
      </div>

      {/* Elegant Role Matrix Table */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 md:p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
              <Layers size={22} />
            </div>
            <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tight">Role Capacity Matrix</h4>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Station role-based demand vs supply</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                <th className="p-6 pl-10">Operational Discipline</th>
                <th className="p-6 text-center">Active Agents</th>
                <th className="p-6 text-center">Shift Supply</th>
                <th className="p-6 text-center">Handling Demand</th>
                <th className="p-6 pr-10 text-right">Integrity Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.roleStats.map((row) => (
                <tr key={row.skill} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-6 pl-10">
                    <div className="flex flex-col">
                      <span className="font-black italic text-slate-900 uppercase text-xs group-hover:text-blue-600 transition-colors">{row.skill}</span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase mt-1.5">{row.total} Registered Specialists</span>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <span className="text-sm font-black italic text-slate-700">{row.active}</span>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex items-center px-4 py-2 bg-blue-50 rounded-xl text-blue-600 text-[10px] font-black shadow-sm">
                      {row.supply} SHIFTS
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex items-center px-4 py-2 bg-slate-100 rounded-xl text-slate-500 text-[10px] font-black">
                      {row.demand} SHIFTS
                    </div>
                  </td>
                  <td className="p-6 pr-10 text-right">
                    {row.balance >= 0 ? (
                      <span className="flex items-center justify-end gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                        MATCH <CheckCircle2 size={16} />
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-2 text-rose-500 font-black text-[10px] uppercase tracking-widest">
                        CHECK ({row.balance}) <AlertTriangle size={16} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-8 md:p-12 bg-slate-950 rounded-[3.5rem] text-white flex flex-col lg:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-8 relative z-10">
           <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/40">
             <Activity size={36} />
           </div>
           <div>
              <h4 className="text-2xl font-black italic uppercase leading-none tracking-tight">AI Decision Support</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                 <Info size={14} className="text-blue-400" /> Annual Leave Allocation Advisory
              </p>
           </div>
        </div>
        <div className="text-center lg:text-right relative z-10 max-w-xl">
           <p className="text-sm font-medium text-blue-100 leading-relaxed italic">
             "The station currently maintains a net surplus of <span className="text-emerald-400 font-black underline decoration-emerald-400/30 underline-offset-4">{stats.balance} shifts</span> over the next {stats.duration} days. 
             Based on operational supply vs. minimum handling demand, the program maker can safely authorize up to <span className="text-white font-black px-2 py-0.5 bg-white/10 rounded-md">{stats.leaveAllowance} leave requests per day</span> without compromising station service levels or safety protocols."
           </p>
        </div>
      </div>
    </div>
  );
};