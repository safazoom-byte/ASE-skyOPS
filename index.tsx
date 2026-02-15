import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plane, 
  Users, 
  Clock, 
  LayoutDashboard,
  X,
  Activity,
  CalendarDays,
  Zap,
  Loader2,
  LogOut,
  Compass,
  Terminal,
  Trash2,
  Plus,
  Briefcase,
  Moon,
  Lock,
  Search,
  Calendar as CalendarIcon,
  ChevronRight,
  ShieldAlert,
  Eraser,
  Sparkles,
  Shield,
  Settings,
  Cloud,
  Layers,
  Timer,
  CheckCircle2
} from 'lucide-react';
import './style.css'; 

import { Flight, Staff, DailyProgram, ShiftConfig, LeaveRequest, LeaveType, IncomingDuty } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramChat } from './components/ProgramChat';
import { GithubSync } from './components/GithubSync';
import { Auth } from './components/Auth';
import { SkyOpsLogo } from './components/Logo';
import { generateAIProgram } from './services/geminiService';
import { db, supabase, auth } from './services/supabaseService';
import { Session } from '@supabase/supabase-js';

const UI_PREF_KEYS = {
  START_DATE: 'skyops_pref_start_date',
  END_DATE: 'skyops_pref_end_date',
  REST_HOURS: 'skyops_pref_min_rest',
  DURATION: 'skyops_pref_duration',
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'offline' | 'unconfigured' | 'error'>('unconfigured');
  
  const [startDate, setStartDate] = useState<string>(() => localStorage.getItem(UI_PREF_KEYS.START_DATE) || new Date().toISOString().split('T')[0]);
  const [programDuration, setProgramDuration] = useState<number>(() => parseInt(localStorage.getItem(UI_PREF_KEYS.DURATION) || '7'));
  const [endDate, setEndDate] = useState<string>(() => localStorage.getItem(UI_PREF_KEYS.END_DATE) || new Date().toISOString().split('T')[0]);
  const [minRestHours, setMinRestHours] = useState<number>(() => parseInt(localStorage.getItem(UI_PREF_KEYS.REST_HOURS) || '12'));

  const [flights, setFlights] = useState<Flight[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [programs, setPrograms] = useState<DailyProgram[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [incomingDuties, setIncomingDuties] = useState<IncomingDuty[]>([]);
  
  const [stationHealth, setStationHealth] = useState<number>(100);
  const [alerts, setAlerts] = useState<{ type: 'danger' | 'warning', message: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Incoming Duties Logic (Rest Log)
  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<string[]>([]);
  const [incomingHour, setIncomingHour] = useState('06');
  const [incomingMin, setIncomingMin] = useState('00');
  const [incomingDate, setIncomingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incomingSearchTerm, setIncomingSearchTerm] = useState('');

  // Leave Registry Logic (Off-Duty)
  const [quickLeaveStaffIds, setQuickLeaveStaffIds] = useState<string[]>([]);
  const [quickLeaveDate, setQuickLeaveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quickLeaveType, setQuickLeaveType] = useState<LeaveType>('Day off');
  const [quickLeaveSearchTerm, setQuickLeaveSearchTerm] = useState('');

  useEffect(() => {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(start.getDate() + (programDuration - 1));
      setEndDate(end.toISOString().split('T')[0]);
    }
  }, [startDate, programDuration]);

  useEffect(() => {
    localStorage.setItem(UI_PREF_KEYS.START_DATE, startDate);
    localStorage.setItem(UI_PREF_KEYS.END_DATE, endDate);
    localStorage.setItem(UI_PREF_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(UI_PREF_KEYS.DURATION, programDuration.toString());
  }, [startDate, endDate, minRestHours, programDuration]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    let mounted = true;
    const syncCloudData = async () => {
      if (!supabase) { setCloudStatus('unconfigured'); return; }
      try {
        const cloudData = await db.fetchAll();
        if (mounted && cloudData) {
          setFlights(cloudData.flights || []); 
          setStaff(cloudData.staff || []); 
          setShifts(cloudData.shifts || []);
          setPrograms(cloudData.programs || []); 
          setLeaveRequests(cloudData.leaveRequests || []);
          setIncomingDuties(cloudData.incomingDuties || []); 
          setCloudStatus('connected');
        }
      } catch (e: any) { if (mounted) setCloudStatus('error'); }
    };
    const checkAuth = async () => {
      if (!supabase) { setIsInitializing(false); setCloudStatus('unconfigured'); return; }
      try {
        const s = await auth.getSession();
        if (mounted) {
          setSession(s);
          if (s) await syncCloudData();
          else setCloudStatus('offline');
          setIsInitializing(false);
        }
      } catch (e: any) { if (mounted) { setCloudStatus('error'); setIsInitializing(false); } }
    };
    checkAuth();
    return () => { mounted = false; };
  }, []);

  const confirmGenerateProgram = async () => {
    const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
    const eligibleStaff = staff.filter(s => {
      if (s.type === 'Local') return true;
      return (!s.workFromDate || !s.workToDate) || (s.workFromDate <= endDate && s.workToDate >= startDate);
    });
    if (activeShifts.length === 0) { alert(`No shifts found for period.`); return; }
    setIsGenerating(true);
    try {
      const result = await generateAIProgram({ flights, staff: eligibleStaff, shifts: activeShifts, programs: [], leaveRequests, incomingDuties }, "", { numDays: programDuration, minRestHours, startDate });
      setPrograms(result.programs); setStationHealth(result.stationHealth); setAlerts(result.alerts || []);
      if (supabase) await db.savePrograms(result.programs); 
      setActiveTab('program'); 
    } catch (err: any) { alert(err.message || "Engine failure."); } finally { setIsGenerating(false); }
  };

  const handleIncomingSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(' ') || val.includes(',') || val.includes('\n')) {
      const tokens = val.split(/[\s,\n]+/);
      const staffMap = new Map<string, string>(staff.map(s => [s.initials.toUpperCase(), s.id]));
      const idsToAdd: string[] = [];
      const remaining: string[] = [];
      
      tokens.forEach(token => {
        if (!token) return;
        const initials = token.split('-')[0].trim().toUpperCase();
        const mid = staffMap.get(initials);
        if (mid) {
          idsToAdd.push(mid);
        } else {
          remaining.push(token);
        }
      });
      
      if (idsToAdd.length > 0) {
        setIncomingSelectedStaffIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
        setIncomingSearchTerm(remaining.join(' '));
        return;
      }
    }
    setIncomingSearchTerm(val);
  };

  const handleQuickLeaveSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(' ') || val.includes(',') || val.includes('\n')) {
      const tokens = val.split(/[\s,\n]+/);
      const staffMap = new Map<string, string>(staff.map(s => [s.initials.toUpperCase(), s.id]));
      const idsToAdd: string[] = [];
      const remaining: string[] = [];
      
      tokens.forEach(token => {
        if (!token) return;
        const initials = token.split('-')[0].trim().toUpperCase();
        const mid = staffMap.get(initials);
        if (mid) {
          idsToAdd.push(mid);
        } else {
          remaining.push(token);
        }
      });
      
      if (idsToAdd.length > 0) {
        setQuickLeaveStaffIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
        setQuickLeaveSearchTerm(remaining.join(' '));
        return;
      }
    }
    setQuickLeaveSearchTerm(val);
  };

  const addIncomingDuties = async () => {
    const finalTime = `${incomingHour}:${incomingMin}`;
    if (incomingSelectedStaffIds.length === 0) return;
    
    const newDuties: IncomingDuty[] = incomingSelectedStaffIds.map(sid => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      staffId: sid, 
      date: incomingDate, 
      shiftEndTime: finalTime 
    }));
    
    setIncomingDuties(prev => [...prev, ...newDuties]);
    if (supabase) await db.upsertIncomingDuties(newDuties);
    
    setIncomingSelectedStaffIds([]);
    setIncomingSearchTerm('');
    setNotification(`${newDuties.length} Rest Log Entries Added`);
  };

  const addQuickLeave = async () => {
    if (quickLeaveStaffIds.length === 0) return;
    
    const newLeaves: LeaveRequest[] = quickLeaveStaffIds.map(sid => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      staffId: sid, 
      startDate: quickLeaveDate, 
      endDate: quickLeaveDate, 
      type: quickLeaveType 
    }));
    
    setLeaveRequests(prev => [...prev, ...newLeaves]);
    if (supabase) await db.upsertLeaves(newLeaves);
    
    setQuickLeaveStaffIds([]);
    setQuickLeaveSearchTerm('');
    setNotification(`${newLeaves.length} Absence Entries Added`);
  };

  const deleteIncomingDuty = async (id: string) => {
    setIncomingDuties(prev => prev.filter(d => d.id !== id));
    if (supabase) await db.deleteIncomingDuty(id);
  };

  const deleteLeaveRequest = async (id: string) => {
    setLeaveRequests(prev => prev.filter(l => l.id !== id));
    if (supabase) await db.deleteLeave(id);
  };

  if (isInitializing) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center"><Loader2 className="text-blue-500 animate-spin" size={64} /></div>;
  if (!session && supabase) return <Auth />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-xs font-black uppercase tracking-widest">{notification}</span>
        </div>
      )}

      <header className="sticky top-0 z-[100] bg-white border-b border-slate-200 py-4 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <SkyOpsLogo size={42} />
           <div>
             <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase leading-none">SkyOPS <span className="text-blue-600 font-light">AI</span></h1>
             <div className="flex items-center gap-2 mt-1.5"><div className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div><span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">{cloudStatus === 'connected' ? 'AI Sync Active' : 'Offline Mode'}</span></div>
           </div>
        </div>
        <div className="flex items-center gap-4">
           {/* Desktop Nav */}
           <nav className="hidden xl:flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
              {['dashboard', 'flights', 'staff', 'shifts', 'program'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic ${activeTab === tab ? 'bg-slate-950 text-white shadow-md' : 'text-slate-500'}`}>{tab}</button>
              ))}
           </nav>
           <GithubSync data={{ flights, staff, shifts, programs, leaveRequests }} />
           {supabase && <button onClick={() => auth.signOut()} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"><LogOut size={16} /></button>}
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-12 pb-32">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                 {[
                   { label: 'Air Traffic', val: flights.length, icon: Plane, color: 'text-blue-600', bg: 'bg-blue-50' },
                   { label: 'Personnel', val: staff.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                   { label: 'Duty Slots', val: shifts.length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
                   { label: 'AI Health', val: `${stationHealth}%`, icon: Zap, color: 'text-blue-400', bg: 'bg-slate-900' }
                 ].map((stat, i) => (
                   <div key={i} className={`bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 md:h-40 ${stat.bg === 'bg-slate-900' ? 'bg-slate-900 text-white' : ''}`}>
                      <div className={`w-8 h-8 md:w-10 md:h-10 ${stat.bg} rounded-lg md:rounded-xl flex items-center justify-center ${stat.color}`}><stat.icon size={16} /></div>
                      <div><h2 className="text-xl md:text-3xl font-black italic leading-none">{stat.val}</h2><p className="text-[7px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">{stat.label}</p></div>
                   </div>
                 ))}
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-2 space-y-6 md:space-y-8">
                  <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-4 mb-8">
                          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500"><Moon size={24} /></div>
                          <div><h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">Staff Rest Log</h4><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Fatigue Prevention Engine</p></div>
                      </div>
                      <div className="space-y-6">
                          <div className="relative">
                              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                                <Zap size={10} className="text-blue-500"/> Group Personnel Feed (Paste List)
                              </label>
                              <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                  {incomingSelectedStaffIds.map(id => (
                                      <span key={id} className="px-2 py-1 bg-slate-950 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2">
                                          {staff.find(st => st.id === id)?.initials}
                                          <button onClick={() => setIncomingSelectedStaffIds(prev => prev.filter(x => x !== id))}><X size={12}/></button>
                                      </span>
                                  ))}
                                  <input 
                                    type="text" 
                                    className="flex-1 bg-transparent text-sm font-bold outline-none" 
                                    placeholder={staff.length === 0 ? "No staff registered yet..." : "Paste initials like: MS-Atz ML-atz..."}
                                    value={incomingSearchTerm} 
                                    onChange={handleIncomingSearchChange} 
                                    disabled={staff.length === 0}
                                  />
                              </div>
                              {staff.length === 0 && <p className="text-[9px] font-bold text-rose-500 mt-2 ml-1">Warning: Register personnel in 'Staff' tab first.</p>}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                               <input type="date" className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none" value={incomingDate} onChange={e => setIncomingDate(e.target.value)}/>
                               <div className="flex gap-2">
                                  <select className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2" value={incomingHour} onChange={e => setIncomingHour(e.target.value)}>
                                      {Array.from({length: 24}).map((_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}
                                  </select>
                                  <select className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2" value={incomingMin} onChange={e => setIncomingMin(e.target.value)}>
                                      {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                               </div>
                               <button onClick={addIncomingDuties} disabled={incomingSelectedStaffIds.length === 0} className="h-[56px] bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"><Lock size={16}/> Bulk Lock Registry</button>
                          </div>
                          
                          {/* Feedback List */}
                          <div className="pt-4 border-t border-slate-50">
                             <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Registered for {incomingDate}</h5>
                             <div className="flex flex-wrap gap-2">
                               {incomingDuties.filter(d => d.date === incomingDate).length === 0 && <span className="text-[9px] italic text-slate-300">No entries yet.</span>}
                               {incomingDuties.filter(d => d.date === incomingDate).map(d => (
                                 <div key={d.id} className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 animate-in fade-in zoom-in">
                                    <span className="text-[10px] font-black text-amber-700 uppercase">{staff.find(s => s.id === d.staffId)?.initials}</span>
                                    <span className="text-[10px] font-bold text-amber-600">{d.shiftEndTime}</span>
                                    <button onClick={() => deleteIncomingDuty(d.id)} className="text-amber-400 hover:text-amber-600"><X size={10}/></button>
                                 </div>
                               ))}
                             </div>
                          </div>
                      </div>
                  </div>

                  <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                     <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500"><Briefcase size={24} /></div>
                        <div><h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">Off-Duty Registry</h4><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Manual Absence Registry</p></div>
                     </div>
                     <div className="space-y-6">
                        <div className="relative">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                               <Zap size={10} className="text-indigo-500"/> Group Personnel Feed
                            </label>
                            <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                                {quickLeaveStaffIds.map(id => (
                                    <span key={id} className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2">
                                        {staff.find(st => st.id === id)?.initials}
                                        <button onClick={() => setQuickLeaveStaffIds(prev => prev.filter(x => x !== id))}><X size={12}/></button>
                                    </span>
                                ))}
                                <input 
                                  type="text" 
                                  className="flex-1 bg-transparent text-sm font-bold outline-none" 
                                  placeholder={staff.length === 0 ? "No staff registered yet..." : "Search or paste group initials..."}
                                  value={quickLeaveSearchTerm} 
                                  onChange={handleQuickLeaveSearchChange} 
                                  disabled={staff.length === 0}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                           <input type="date" className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none" value={quickLeaveDate} onChange={e => setQuickLeaveDate(e.target.value)}/>
                           <select className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-4 outline-none" value={quickLeaveType} onChange={e => setQuickLeaveType(e.target.value as LeaveType)}>
                              <option value="Day off">Day off</option>
                              <option value="Annual leave">Annual leave</option>
                              <option value="Sick leave">Sick leave</option>
                              <option value="Roster leave">Roster leave</option>
                           </select>
                           <button onClick={addQuickLeave} disabled={quickLeaveStaffIds.length === 0} className="h-[56px] bg-indigo-600 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"><Plus size={16}/> Add Group Log</button>
                        </div>

                        {/* Feedback List */}
                        <div className="pt-4 border-t border-slate-50">
                           <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Absences for {quickLeaveDate}</h5>
                           <div className="flex flex-wrap gap-2">
                             {leaveRequests.filter(l => l.startDate === quickLeaveDate).length === 0 && <span className="text-[9px] italic text-slate-300">No entries yet.</span>}
                             {leaveRequests.filter(l => l.startDate === quickLeaveDate).map(l => (
                               <div key={l.id} className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2 animate-in fade-in zoom-in">
                                  <span className="text-[10px] font-black text-indigo-700 uppercase">{staff.find(s => s.id === l.staffId)?.initials}</span>
                                  <span className="text-[10px] font-bold text-indigo-500">{l.type}</span>
                                  <button onClick={() => deleteLeaveRequest(l.id)} className="text-indigo-400 hover:text-indigo-600"><X size={10}/></button>
                               </div>
                             ))}
                           </div>
                        </div>
                     </div>
                  </div>
                </div>

                <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-10">
                   <div className="flex items-center gap-4"><div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-blue-500 shadow-xl"><Terminal size={24} /></div><h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">AI Command Control</h4></div>
                   <div className="space-y-8">
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Program Commencement</label>
                        <input type="date" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-all" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-center italic mt-2">Target Period: {startDate} > {endDate}</div>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block">Period Duration</label>
                        <input type="range" min="1" max="31" value={programDuration} onChange={(e) => setProgramDuration(parseInt(e.target.value))} className="w-full accent-blue-600 h-1.5" /><p className="text-center font-black mt-3 text-blue-600 text-sm italic tracking-widest">{programDuration} DAYS</p>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block flex items-center gap-2"><Timer size={14} className="text-indigo-500"/> Rest Threshold</label>
                        <input type="range" min="8" max="24" value={minRestHours} onChange={(e) => setMinRestHours(parseInt(e.target.value))} className="w-full accent-indigo-600 h-1.5" /><p className="text-center font-black mt-3 text-indigo-600 text-sm italic tracking-widest">{minRestHours}H</p>
                     </div>
                   </div>
                   <button onClick={confirmGenerateProgram} disabled={isGenerating} className="w-full py-8 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                     {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} className="text-blue-400" />}
                     {isGenerating ? 'AI Analysis...' : 'Build AI Program'}
                   </button>
                </div>
             </div>
          </div>
        )}
        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={f => {setFlights(p => [...p, f]); db.upsertFlight(f);}} onUpdate={f => {setFlights(p => p.map(o => o.id === f.id ? f : o)); db.upsertFlight(f);}} onDelete={id => {setFlights(p => p.filter(f => f.id !== id)); db.deleteFlight(id);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={s => {setStaff(p => p.find(o => o.id === s.id) ? p.map(o => o.id === s.id ? s : o) : [...p, s]); db.upsertStaff(s);}} onDelete={id => {setStaff(p => p.filter(s => s.id !== id)); db.deleteStaff(id);}} defaultMaxShifts={5} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} staff={staff} leaveRequests={leaveRequests} startDate={startDate} onAdd={s => {setShifts(p => [...p, s]); db.upsertShift(s);}} onUpdate={s => {setShifts(p => p.map(o => o.id === s.id ? s : o)); db.upsertShift(s);}} onDelete={id => {setShifts(p => p.filter(s => s.id !== id)); db.deleteShift(id);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} leaveRequests={leaveRequests} incomingDuties={incomingDuties} startDate={startDate} endDate={endDate} stationHealth={stationHealth} alerts={alerts} minRestHours={minRestHours} onUpdatePrograms={async (updated) => { setPrograms(updated); if (supabase) await db.savePrograms(updated); }} />}
      </main>
      
      {/* Mobile Footer Navigation */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 px-4 pb-6 z-[200] flex justify-between items-center shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
         {[
           { id: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
           { id: 'flights', icon: Plane, label: 'Flights' },
           { id: 'staff', icon: Users, label: 'Staff' },
           { id: 'shifts', icon: Clock, label: 'Shifts' },
           { id: 'program', icon: CalendarDays, label: 'Roster' },
         ].map(item => (
           <button 
             key={item.id}
             onClick={() => setActiveTab(item.id as any)}
             className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all w-16 ${
               activeTab === item.id 
                 ? 'text-blue-600 bg-blue-50 scale-110' 
                 : 'text-slate-400 hover:bg-slate-50'
             }`}
           >
             <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
             <span className="text-[9px] font-black uppercase tracking-tight">{item.label}</span>
           </button>
         ))}
      </nav>

      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}