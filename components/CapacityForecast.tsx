import React, { useMemo } from 'react';
import { Staff, ShiftConfig, LeaveRequest } from '../types';
import { Users, TrendingUp, AlertTriangle, CheckCircle2, Calculator, CalendarClock, Briefcase, Activity, Scale, CalendarX } from 'lucide-react';

interface Props {
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  startDate: string;
  duration: number;
}

// Helper to calculate days overlap between two ranges
const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date) => {
  const overlapStart = start1 > start2 ? start1 : start2;
  const overlapEnd = end1 < end2 ? end1 : end2;
  if (overlapStart > overlapEnd) return 0;
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

export const CapacityForecast: React.FC<Props> = ({ staff, shifts, leaveRequests = [], startDate, duration }) => {
  const stats = useMemo(() => {
    if (!startDate || duration <= 0) return null;

    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + duration - 1);
    const endDateStr = end.toISOString().split('T')[0];

    // 1. Calculate Supply (Available Shifts)
    const localStaff = staff.filter(s => s.type === 'Local');
    const rosterStaff = staff.filter(s => s.type === 'Roster');

    // --- LOCAL CAPACITY CALCULATION (WITH LEAVE DISRUPTION) ---
    // Rule: Standard is 5 days work per 7 days (5/7 ratio).
    // Logic aligned with GeminiService: Math.floor(duration * (5/7))
    // Example: 7 days = 5 shifts. 30 days = 21 shifts.
    let localCapacity = 0;
    let totalLeaveLost = 0;

    localStaff.forEach(s => {
       // Base capacity calculation aligned with AI Engine
       let baseCap = Math.floor(duration * (5/7));
       // Permissive scale for short durations (< 1 week)
       if (duration < 7 && duration > 0) baseCap = Math.ceil(duration * 0.75);
       
       // Calculate leave overlap
       let leaveDays = 0;
       const sLeaves = leaveRequests.filter(l => l.staffId === s.id);
       
       sLeaves.forEach(l => {
          const lStart = new Date(l.startDate);
          const lEnd = new Date(l.endDate);
          leaveDays += getOverlapDays(start, end, lStart, lEnd);
       });

       totalLeaveLost += leaveDays;
       // Net capacity cannot be negative
       localCapacity += Math.max(0, baseCap - leaveDays);
    });

    // --- ROSTER CAPACITY CALCULATION ---
    let rosterCapacity = 0;
    rosterStaff.forEach(s => {
      if (!s.workFromDate || !s.workToDate) return;
      
      const contractStart = new Date(s.workFromDate);
      const contractEnd = new Date(s.workToDate);
      
      const days = getOverlapDays(start, end, contractStart, contractEnd);
      
      // Also deduct leaves for Roster staff if they exist
      let leaveDays = 0;
      const sLeaves = leaveRequests.filter(l => l.staffId === s.id);
      sLeaves.forEach(l => {
          const lStart = new Date(l.startDate);
          const lEnd = new Date(l.endDate);
          leaveDays += getOverlapDays(start, end, lStart, lEnd);
      });

      rosterCapacity += Math.max(0, days - leaveDays);
      totalLeaveLost += leaveDays;
    });

    const totalSupply = localCapacity + rosterCapacity;

    // 2. Calculate Demand (Shift Requirements)
    let minDemand = 0;
    let maxDemand = 0;
    let shiftCount = 0;

    shifts.forEach(s => {
      if (s.pickupDate >= startDate && s.pickupDate <= endDateStr) {
        minDemand += (s.minStaff || 0);
        maxDemand += (s.maxStaff || 0);
        shiftCount++;
      }
    });

    // 3. Analysis
    const balance = totalSupply - minDemand;
    const health = balance >= 0 ? 'healthy' : 'critical';
    const coveragePercent = minDemand > 0 ? Math.round((totalSupply / minDemand) * 100) : 100;

    return {
      localCount: localStaff.length,
      rosterCount: rosterStaff.length,
      localCapacity,
      rosterCapacity,
      totalLeaveLost,
      totalSupply,
      minDemand,
      maxDemand,
      balance,
      health,
      shiftCount,
      coveragePercent
    };
  }, [staff, shifts, leaveRequests, startDate, duration]);

  if (!stats) return null;

  return (
    <div className="bg-slate-900 text-white p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-800 relative overflow-hidden">
       {/* Background Decoration */}
       <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none"></div>
       <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none"></div>

       <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-blue-400 shadow-lg">
                   <Scale size={28} />
                </div>
                <div>
                   <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Manpower Capacity</h3>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                      <CalendarClock size={12} /> Forecast: {duration} Days
                   </p>
                </div>
             </div>

             <div className={`px-6 py-3 rounded-2xl border flex items-center gap-3 backdrop-blur-md ${
                stats.health === 'healthy' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
             }`}>
                {stats.health === 'healthy' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <div className="flex flex-col">
                   <span className="text-[9px] font-black uppercase tracking-widest leading-none opacity-70">Operational Balance</span>
                   <span className="text-lg font-black italic">
                      {stats.balance > 0 ? '+' : ''}{stats.balance} Shifts
                   </span>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
             
             {/* Supply Side */}
             <div className="bg-white/5 border border-white/5 rounded-[2rem] p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <Users size={14} className="text-indigo-400" /> Available Supply
                  </h4>
                  {stats.totalLeaveLost > 0 && (
                     <div className="px-2 py-1 bg-rose-500/20 border border-rose-500/20 rounded-lg flex items-center gap-1.5 text-[8px] font-black text-rose-400 uppercase tracking-widest">
                        <CalendarX size={10} /> -{stats.totalLeaveLost} Days Absence
                     </div>
                  )}
                </div>
                <div className="flex items-end gap-2">
                   <span className="text-4xl font-black italic tracking-tighter">{stats.totalSupply}</span>
                   <span className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Total Man-Shifts</span>
                </div>
                
                <div className="space-y-3 pt-2">
                   <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-slate-400 uppercase">Local Staff</span>
                         <span className="text-[8px] text-slate-500">{stats.localCount} Agents (Leave Adjusted)</span>
                      </div>
                      <span className="text-xl font-black italic text-indigo-400">{stats.localCapacity}</span>
                   </div>
                   <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-slate-400 uppercase">Roster Staff</span>
                         <span className="text-[8px] text-slate-500">{stats.rosterCount} Agents (Active Days)</span>
                      </div>
                      <span className="text-xl font-black italic text-amber-400">{stats.rosterCapacity}</span>
                   </div>
                </div>
             </div>

             {/* Demand Side */}
             <div className="bg-white/5 border border-white/5 rounded-[2rem] p-6 space-y-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Activity size={14} className="text-rose-400" /> Requirement Load
                </h4>
                <div className="flex items-end gap-2">
                   <span className="text-4xl font-black italic tracking-tighter">{stats.minDemand}</span>
                   <span className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Min Required Shifts</span>
                </div>

                <div className="space-y-4 pt-2">
                   <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                         <span>Coverage (Min)</span>
                         <span className={stats.coveragePercent >= 100 ? 'text-emerald-400' : 'text-rose-400'}>{stats.coveragePercent}%</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                         <div 
                           className={`h-full rounded-full transition-all duration-1000 ${stats.coveragePercent >= 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                           style={{ width: `${Math.min(stats.coveragePercent, 100)}%` }}
                         />
                      </div>
                   </div>

                   <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Optimal (Max) Demand</span>
                      <span className="text-sm font-black text-slate-300">{stats.maxDemand} Shifts</span>
                   </div>
                </div>
             </div>

             {/* Insight Side */}
             <div className="flex flex-col justify-between gap-4">
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden flex-1 flex flex-col justify-center">
                   <Briefcase size={64} className="absolute -bottom-4 -right-4 text-white/10 rotate-12" />
                   <h5 className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Shift Velocity</h5>
                   <p className="text-2xl font-black italic leading-tight">
                      {Math.round(stats.minDemand / duration)} Staff / Day
                   </p>
                   <p className="text-[9px] opacity-60 mt-1">Average Minimum Requirement</p>
                </div>

                <div className="bg-slate-800 rounded-[2rem] p-6 border border-slate-700 flex-1 flex flex-col justify-center">
                   <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Utilization Rate</h5>
                   <p className={`text-2xl font-black italic leading-tight ${stats.totalSupply < stats.minDemand ? 'text-rose-400' : 'text-blue-400'}`}>
                      {stats.minDemand > 0 ? ((stats.minDemand / stats.totalSupply) * 100).toFixed(1) : 0}%
                   </p>
                   <p className="text-[9px] text-slate-500 mt-1">Of available capacity used</p>
                </div>
             </div>

          </div>
       </div>
    </div>
  );
};