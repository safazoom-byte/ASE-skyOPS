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
  Layers
} from 'lucide-react';
import './style.css'; // Import global styles for bundler

import { Flight, Staff, DailyProgram, ShiftConfig, LeaveRequest, LeaveType, IncomingDuty } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { GithubSync } from './components/GithubSync';
import { Auth } from './components/Auth';
import { generateAIProgram } from './services/geminiService';
import { db, supabase, auth } from './services/supabaseService';

const UI_PREF_KEYS = {
  START_DATE: 'skyops_pref_start_date',
  END_DATE: 'skyops_pref_end_date',
  REST_HOURS: 'skyops_pref_min_rest',
  DURATION: 'skyops_pref_duration',
};

// High-fidelity SVG Logo mirroring the user-provided eagle/shield design
export const SkyOpsLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    className={className} 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="shieldGrad" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#0a192f" />
        <stop offset="100%" stopColor="#020617" />
      </linearGradient>
      <linearGradient id="eagleGrad" x1="20" y1="20" x2="80" y2="80">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    {/* Shield Base */}
    <path 
      d="M50 5C30 5 15 15 15 40C15 65 35 85 50 95C65 85 85 65 85 40C85 15 70 5 50 5Z" 
      fill="url(#shieldGrad)" 
      stroke="#3b82f6" 
      strokeWidth="2"
    />
    {/* Stylized Eagle Profile */}
    <path 
      d="M30 45C30 45 40 30 65 25C75 23 85 28 80 40C70 55 50 70 25 80C20 82 15 78 18 73L30 45Z" 
      fill="url(#eagleGrad)" 
    />
    {/* Tech/Circuit Wing Detail */}
    <path d="M40 38H55M42 45H60M44 52H52" stroke="#020617" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="55" cy="38" r="1.5" fill="#3b82f6" />
    <circle cx="60" cy="45" r="1.5" fill="#3b82f6" />
    <circle cx="52" cy="52" r="1.5" fill="#3b82f6" />
  </svg>
);

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'offline' | 'unconfigured' | 'error'>('unconfigured');
  
  const [startDate, setStartDate] = useState<string>(() => 
    localStorage.getItem(UI_PREF_KEYS.START_DATE) || new Date().toISOString().split('T')[0]
  );
  const [programDuration, setProgramDuration] = useState<number>(() => 
    parseInt(localStorage.getItem(UI_PREF_KEYS.DURATION) || '7')
  );
  const [endDate, setEndDate] = useState<string>(() => {
    const saved = localStorage.getItem(UI_PREF_KEYS.END_DATE);
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  const [flights, setFlights] = useState<Flight[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [programs, setPrograms] = useState<DailyProgram[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [incomingDuties, setIncomingDuties] = useState<IncomingDuty[]>([]);
  
  const [stationHealth, setStationHealth] = useState<number>(100);
  const [alerts, setAlerts] = useState<{ type: 'danger' | 'warning', message: string }[]>([]);
  const [minRestHours, setMinRestHours] = useState<number>(() => 
    parseInt(localStorage.getItem(UI_PREF_KEYS.REST_HOURS) || '12')
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');

  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<string[]>([]);
  const [incomingHour, setIncomingHour] = useState('06');
  const [incomingMin, setIncomingMin] = useState('00');
  const [incomingDate, setIncomingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incomingSearchTerm, setIncomingSearchTerm] = useState('');
  const [incomingSearchFocus, setIncomingSearchFocus] = useState(false);

  const [quickLeaveStaffIds, setQuickLeaveStaffIds] = useState<string[]>([]);
  const [quickLeaveDate, setQuickLeaveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quickLeaveType, setQuickLeaveType] = useState<LeaveType>('Day off');
  const [quickLeaveSearchTerm, setQuickLeaveSearchTerm] = useState('');
  const [quickLeaveSearchFocus, setQuickLeaveSearchFocus] = useState(false);

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Register Service Worker for PWA Support
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        // Correct path for production deployment
        navigator.serviceWorker.register('/sw.js').catch(error => {
          console.error('Service Worker registration failed:', error);
        });
      });
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 100) setIsVisible(true);
      else if (currentScrollY > lastScrollY.current) setIsVisible(false);
      else setIsVisible(true);
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    let mounted = true;
    const syncCloudData = async () => {
      if (!supabase) {
        if (mounted) setCloudStatus('unconfigured');
        return;
      }
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
      } catch (e) {
        if (mounted) setCloudStatus('error');
      }
    };
    const checkAuth = async () => {
      if (!supabase) {
        if (mounted) { setCloudStatus('unconfigured'); setIsInitializing(false); }
        return;
      }
      try {
        const s = await auth.getSession();
        if (mounted) {
          setSession(s);
          if (s) await syncCloudData();
          else setCloudStatus('offline');
          setIsInitializing(false);
        }
      } catch (e) {
        if (mounted) { setCloudStatus('error'); setIsInitializing(false); }
      }
    };
    checkAuth();
    const unsubscribe = auth.onAuthStateChange((s) => {
      if (mounted) {
        setSession(s);
        if (s) syncCloudData();
        else {
          setFlights([]); setStaff([]); setShifts([]); setPrograms([]); setLeaveRequests([]); setIncomingDuties([]);
          setCloudStatus('offline');
        }
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const confirmGenerateProgram = async () => {
    const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
    const activeFlights = flights.filter(f => f.date >= startDate && f.date <= endDate);

    if (activeShifts.length === 0) { 
      setError(`No valid duty shifts registered between ${startDate} and ${endDate}.`); 
      setShowConfirmDialog(false); 
      return; 
    }

    setShowConfirmDialog(false); 
    setIsGenerating(true); 
    setError(null);

    try {
      const result = await generateAIProgram(
        { flights: activeFlights, staff, shifts: activeShifts, programs: [], leaveRequests, incomingDuties }, 
        "", 
        { numDays: programDuration, minRestHours, startDate }
      );

      setPrograms(result.programs); 
      setStationHealth(result.stationHealth);
      setAlerts(result.alerts || []);
      
      if (supabase) {
        await db.savePrograms(result.programs); 
      }
      
      setActiveTab('program'); 
    } catch (err: unknown) { 
      if (err instanceof Error) {
        setError(err.message); 
      } else {
        setError("An unexpected error occurred during program generation.");
      }
    } finally { 
      setIsGenerating(false); 
    }
  };

  const handleQuickLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickLeaveStaffIds.length === 0 || !quickLeaveDate) return;
    
    const newRequests: LeaveRequest[] = quickLeaveStaffIds.map(sid => ({
      id: Math.random().toString(36).substr(2, 9),
      staffId: sid,
      startDate: quickLeaveDate,
      endDate: quickLeaveDate,
      type: quickLeaveType
    }));
    
    setLeaveRequests(prev => [...prev, ...newRequests]);
    
    if (supabase) {
      await db.upsertLeaves(newRequests);
    }
    
    setQuickLeaveStaffIds([]);
    setQuickLeaveSearchTerm('');
  };

  const handleLeaveDelete = async (id: string) => {
    setLeaveRequests(p => p.filter(r => r.id !== id));
    if (supabase) await db.deleteLeave(id);
  };

  const handleIncomingDutyDelete = async (id: string) => {
    setIncomingDuties(p => p.filter(d => d.id !== id));
    if (supabase) await db.deleteIncomingDuty(id);
  };

  const handleIncomingSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // Auto-map logic for pasted lists like "MS-Atz ML-atz FT-atz"
    // Triggers if dash, space, or comma is detected
    if (val.includes('-') || val.includes(' ') || val.includes(',')) {
      const tokens = val.split(/[\s,]+/);
      const staffMap = new Map(staff.map(s => [s.initials.toUpperCase(), s.id]));
      const idsToAdd: string[] = [];
      
      let matchedCount = 0;

      tokens.forEach(token => {
        if (!token) return;
        // Handle format: INT-Suffix or just INT
        // We split by '-' and take the first part
        const cleanInitials = token.split('-')[0].toUpperCase();
        
        // Check if this is a valid staff
        if (staffMap.has(cleanInitials)) {
          idsToAdd.push(staffMap.get(cleanInitials)!);
          matchedCount++;
        }
      });

      // Only auto-add and clear if we actually found matches
      if (matchedCount > 0) {
        setIncomingSelectedStaffIds(prev => {
          const next = new Set(prev);
          idsToAdd.forEach(id => next.add(id));
          return Array.from(next);
        });
        setIncomingSearchTerm('');
        return;
      }
    }
    
    setIncomingSearchTerm(val);
  };

  const addIncomingDuties = async () => {
    const finalTime = `${incomingHour}:${incomingMin}`;
    if (incomingSelectedStaffIds.length === 0 || !finalTime || !incomingDate) return;
    const newDuties: IncomingDuty[] = incomingSelectedStaffIds.map(sid => ({
      id: Math.random().toString(36).substr(2, 9),
      staffId: sid,
      date: incomingDate,
      shiftEndTime: finalTime
    }));
    
    const currentDuties = [...incomingDuties];
    newDuties.forEach(nd => {
      const idx = currentDuties.findIndex(cd => cd.staffId === nd.staffId && cd.date === nd.date);
      if (idx !== -1) currentDuties[idx] = nd;
      else currentDuties.push(nd);
    });

    setIncomingDuties(currentDuties);
    if (supabase) {
      await db.upsertIncomingDuties(newDuties);
    }
    setIncomingSelectedStaffIds([]); setIncomingSearchTerm('');
  };

  const activeLeaveRequests = useMemo(() => {
    return leaveRequests.filter(l => l.startDate >= startDate).sort((a,b) => a.startDate.localeCompare(b.startDate));
  }, [leaveRequests, startDate]);

  const activeFatigueLocks = useMemo(() => {
    return incomingDuties.filter(d => d.date >= startDate).sort((a, b) => a.date.localeCompare(b.date) || a.shiftEndTime.localeCompare(b.shiftEndTime));
  }, [incomingDuties, startDate]);

  const filteredStaff = useMemo(() => {
    if (!incomingSearchTerm) return staff;
    const lower = incomingSearchTerm.toLowerCase();
    return staff.filter(s => s.initials.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower));
  }, [staff, incomingSearchTerm]);

  const filteredQuickLeaveStaff = useMemo(() => {
    if (!quickLeaveSearchTerm) return staff;
    const lower = quickLeaveSearchTerm.toLowerCase();
    return staff.filter(s => s.initials.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower));
  }, [staff, quickLeaveSearchTerm]);

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Personnel' },
    { id: 'shifts', icon: Clock, label: 'Shifts' },
    { id: 'program', icon: CalendarDays, label: 'Program' },
  ];

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="text-blue-500 animate-spin" size={64} />
      </div>
    );
  }

  if (!session && supabase) return <Auth />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className={`sticky top-0 z-[100] bg-white border-b border-slate-200 py-4 px-4 md:px-8 flex items-center justify-between transition-transform duration-500 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-4">
           <div className="relative">
             <div className="absolute inset-0 bg-blue-500/20 blur-lg rounded-xl"></div>
             <SkyOpsLogo size={42} className="relative z-10" />
           </div>
           <div>
             <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase leading-none">SkyOPS <span className="text-blue-600 font-light">AI</span></h1>
             <div className="flex items-center gap-2 mt-1.5">
               <div className={`w-2 h-2 rounded-full ${
                  cloudStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 
                  cloudStatus === 'error' ? 'bg-rose-500' : 
                  cloudStatus === 'unconfigured' ? 'bg-slate-300' :
                  'bg-amber-500'
                }`}></div>
               <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">
                 {cloudStatus === 'connected' ? 'AI Sync Active' : 
                  cloudStatus === 'error' ? 'Connection Fault' : 
                  cloudStatus === 'unconfigured' ? 'Cloud Disabled' :
                  'Offline Engine'}
               </span>
             </div>
           </div>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden xl:flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            {navigationTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic ${activeTab === tab.id ? 'bg-slate-950 text-white shadow-md' : 'text-slate-500'}`}>
                {tab.label}
              </button>
            ))}
          </nav>
          <GithubSync data={{ flights, staff, shifts, programs, leaveRequests }} />
          {supabase && session && <button onClick={() => auth.signOut()} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"><LogOut size={16} /></button>}
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-12 pb-32">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 md:space-y-8">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                 {[
                   { label: 'Air Traffic', val: flights.length, icon: Plane, color: 'text-blue-600', bg: 'bg-blue-50' },
                   { label: 'Personnel', val: staff.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                   { label: 'Duty Slots', val: shifts.length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
                   { label: 'AI Efficiency', val: `${stationHealth}%`, icon: Zap, color: 'text-blue-400', bg: 'bg-slate-900' }
                 ].map((stat, i) => (
                   <div key={i} className={`bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 md:h-40 ${stat.bg === 'bg-slate-900' ? 'bg-slate-900 text-white' : ''}`}>
                      <div className={`w-8 h-8 md:w-10 md:h-10 ${stat.bg} rounded-lg md:rounded-xl flex items-center justify-center ${stat.color}`}><stat.icon size={16} /></div>
                      <div>
                         <h2 className="text-xl md:text-3xl font-black italic leading-none">{stat.val}</h2>
                         <p className="text-[7px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">{stat.label}</p>
                      </div>
                   </div>
                 ))}
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-2 space-y-6 md:space-y-8">
                  <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-visible">
                      <div className="flex items-center gap-4 mb-6 md:mb-8">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-500"><Moon size={20} /></div>
                          <div>
                               <h4 className="text-lg md:text-xl font-black italic uppercase text-slate-900 leading-none">Staff Rest Log</h4>
                               <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Fatigue Prevention Engine</p>
                          </div>
                      </div>
                      <div className="flex flex-col gap-6">
                          <div className="relative group">
                              <label className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 block ml-1 flex justify-between items-center">
                                <span>Personnel Selection</span>
                                {incomingSelectedStaffIds.length > 0 && (
                                  <button onClick={() => setIncomingSelectedStaffIds([])} className="text-[7px] text-slate-400 hover:text-rose-500 flex items-center gap-1"><Eraser size={8}/> Clear Selection</button>
                                )}
                              </label>
                              <div className={`w-full min-h-[56px] px-4 py-3 bg-white rounded-xl md:rounded-2xl border-2 flex flex-wrap items-center gap-2 transition-colors ${incomingSearchFocus ? 'border-blue-600' : 'border-slate-100'}`}>
                                  <Search size={18} className="text-slate-300" />
                                  {incomingSelectedStaffIds.map(id => (
                                      <span key={id} className="px-2 py-1 bg-slate-950 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2 border border-white/10 animate-in zoom-in-95">
                                          {staff.find(st => st.id === id)?.initials}
                                          <button onClick={() => setIncomingSelectedStaffIds(p => p.filter(x => x !== id))} className="hover:text-rose-500"><X size={12}/></button>
                                      </span>
                                  ))}
                                  <input 
                                      type="text" 
                                      className="flex-1 bg-transparent text-sm font-bold outline-none py-1 min-w-[120px]"
                                      placeholder="Search initials or paste 'MS-Atz'..."
                                      value={incomingSearchTerm}
                                      onChange={handleIncomingSearchChange}
                                      onFocus={() => setIncomingSearchFocus(true)}
                                      onBlur={() => setTimeout(() => setIncomingSearchFocus(false), 200)}
                                  />
                              </div>
                              {incomingSearchFocus && (
                                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[180px] overflow-y-auto p-2 z-[200] animate-in slide-in-from-top-2">
                                      {filteredStaff.map(s => (
                                          <button key={s.id} onMouseDown={(e) => { e.preventDefault(); setIncomingSelectedStaffIds(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]); setIncomingSearchTerm(''); }} className={`w-full text-left p-2.5 rounded-lg text-[10px] font-black uppercase transition-colors ${incomingSelectedStaffIds.includes(s.id) ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}>
                                              {s.initials} — {s.name}
                                          </button>
                                      ))}
                                      {filteredStaff.length === 0 && <p className="text-[10px] text-slate-400 p-3 italic">No matching personnel</p>}
                                  </div>
                              )}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-4">
                               <div className="flex-1 space-y-2">
                                  <label className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Release Date</label>
                                  <input type="date" className="h-[56px] w-full px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-colors" value={incomingDate} onChange={e => setIncomingDate(e.target.value)}/>
                               </div>
                               <div className="flex-[0.5] space-y-2">
                                  <label className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Release Time</label>
                                  <div className="flex gap-2">
                                      <select className="h-[56px] w-full bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-sm px-2 outline-none appearance-none text-center" value={incomingHour} onChange={e => setIncomingHour(e.target.value)}>
                                          {Array.from({length: 24}).map((_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}
                                      </select>
                                      <select className="h-[56px] w-full bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-sm px-2 outline-none appearance-none text-center" value={incomingMin} onChange={e => setIncomingMin(e.target.value)}>
                                          {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                  </div>
                               </div>
                               <div className="flex items-end">
                                 <button onClick={() => addIncomingDuties()} disabled={incomingSelectedStaffIds.length === 0} className="h-[56px] w-full sm:px-10 bg-slate-950 text-white rounded-xl font-black uppercase italic tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg active:scale-95">
                                   <Lock size={16}/> Lock Log
                                 </button>
                               </div>
                          </div>
                      </div>

                      <div className="mt-10 space-y-4">
                         <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12} className="text-amber-500" /> Active Fatigue Locks</h5>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activeFatigueLocks.map(lock => (
                              <div key={lock.id} className="p-3 border border-amber-100 rounded-xl flex items-center justify-between bg-amber-50/30 group shadow-sm transition-all hover:border-amber-200">
                                 <div>
                                    <p className="text-[9px] font-black uppercase text-amber-900">{staff.find(st => st.id === lock.staffId)?.initials || '??'}</p>
                                    <p className="text-[7px] font-bold text-amber-600 uppercase tracking-tighter">{lock.date} @ {lock.shiftEndTime}</p>
                                 </div>
                                 <button onClick={() => handleIncomingDutyDelete(lock.id)} className="text-amber-300 hover:text-rose-500 p-2 transition-colors"><Trash2 size={14}/></button>
                              </div>
                            ))}
                            {activeFatigueLocks.length === 0 && (
                              <div className="col-span-full py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                                 <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Fatigue Registry Clear</p>
                              </div>
                            )}
                         </div>
                      </div>
                  </div>

                  <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-visible">
                     <div className="flex items-center gap-4 mb-6 md:mb-8">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 rounded-xl md:rounded-2xl flex items-center justify-center text-indigo-500"><Briefcase size={20} /></div>
                        <div>
                           <h4 className="text-lg md:text-xl font-black italic uppercase text-slate-900 leading-none">Off-Duty Registry</h4>
                           <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Manual Absence Registry</p>
                        </div>
                     </div>
                     <form onSubmit={handleQuickLeaveSubmit} className="flex flex-col gap-5 mb-8 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex flex-col gap-4">
                          <div className="relative group">
                              <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2 block ml-1 flex justify-between items-center">
                                <span>Personnel Multi-Selection</span>
                                {quickLeaveStaffIds.length > 0 && (
                                  <button onClick={() => setQuickLeaveStaffIds([])} type="button" className="text-[7px] text-slate-400 hover:text-rose-500 flex items-center gap-1"><Eraser size={8}/> Clear Selection</button>
                                )}
                              </label>
                              <div className={`w-full min-h-[56px] px-4 py-3 bg-white rounded-xl md:rounded-2xl border-2 flex flex-wrap items-center gap-2 transition-colors ${quickLeaveSearchFocus ? 'border-indigo-600' : 'border-slate-200'}`}>
                                  <Search size={18} className="text-slate-300" />
                                  {quickLeaveStaffIds.map(id => (
                                      <span key={id} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 border border-indigo-100 animate-in zoom-in-95">
                                          {staff.find(st => st.id === id)?.initials}
                                          <button type="button" onClick={() => setQuickLeaveStaffIds(p => p.filter(x => x !== id))} className="hover:text-rose-500"><X size={12}/></button>
                                      </span>
                                  ))}
                                  <input 
                                      type="text" 
                                      className="flex-1 bg-transparent text-sm font-bold outline-none py-1 min-w-[120px]"
                                      placeholder="Search and tag personnel..."
                                      value={quickLeaveSearchTerm}
                                      onChange={e => setQuickLeaveSearchTerm(e.target.value)}
                                      onFocus={() => setQuickLeaveSearchFocus(true)}
                                      onBlur={() => setTimeout(() => setQuickLeaveSearchFocus(false), 200)}
                                  />
                              </div>
                              {quickLeaveSearchFocus && (
                                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[180px] overflow-y-auto p-2 z-[200] animate-in slide-in-from-top-2">
                                      {filteredQuickLeaveStaff.map(s => (
                                          <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); setQuickLeaveStaffIds(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]); }} className={`w-full text-left p-2.5 rounded-lg text-[10px] font-black uppercase transition-colors ${quickLeaveStaffIds.includes(s.id) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}>
                                              {s.initials} — {s.name}
                                          </button>
                                      ))}
                                      {filteredQuickLeaveStaff.length === 0 && <p className="text-[10px] text-slate-400 p-3 italic">No matching personnel</p>}
                                  </div>
                              )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 space-y-1.5">
                             <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">Off-Duty Date</label>
                             <input type="date" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-600/10 transition-all" value={quickLeaveDate} onChange={e => setQuickLeaveDate(e.target.value)} required />
                          </div>
                          <div className="flex-1 space-y-1.5">
                             <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">Absence Reason</label>
                             <select className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-black text-xs uppercase outline-none focus:ring-4 focus:ring-indigo-600/10 transition-all" value={quickLeaveType} onChange={e => setQuickLeaveType(e.target.value as LeaveType)}>
                                <option value="Day off">Day off</option>
                                <option value="Annual leave">Annual leave</option>
                                <option value="Lieu leave">Lieu leave</option>
                                <option value="Sick leave">Sick leave</option>
                             </select>
                          </div>
                          <div className="flex items-end">
                            <button type="submit" disabled={quickLeaveStaffIds.length === 0} className="w-full sm:w-48 py-4 bg-slate-950 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                              <Plus size={16} /> ADD LOG
                            </button>
                          </div>
                        </div>
                     </form>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeLeaveRequests.map(req => (
                          <div key={req.id} className="p-3 border border-slate-100 rounded-xl flex items-center justify-between bg-white group shadow-sm transition-all hover:border-indigo-100">
                             <div>
                                <p className="text-[9px] font-black uppercase text-slate-900">{staff.find(st => st.id === req.staffId)?.initials}</p>
                                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">{req.startDate} — {req.type}</p>
                             </div>
                                 <button onClick={() => handleLeaveDelete(req.id)} className="text-slate-300 hover:text-rose-500 p-2 transition-colors"><Trash2 size={14}/></button>
                              </div>
                            ))}
                            {activeLeaveRequests.length === 0 && (
                              <div className="col-span-full py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                                 <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Absence Registry Clear</p>
                              </div>
                            )}
                         </div>
                      </div>
                    </div>

                <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-8 md:gap-10">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-950 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-500 shadow-xl"><Terminal size={20} /></div>
                      <h4 className="text-lg md:text-xl font-black italic uppercase text-slate-900 leading-none">AI Command Control</h4>
                   </div>
                   <div className="space-y-6 md:space-y-8">
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                        <label className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] block">Program Commencement</label>
                        <div className="relative group">
                          <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600 group-focus-within:text-blue-700 transition-colors" size={20} />
                          <input 
                            type="date" 
                            className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-xl font-black text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all shadow-sm" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                          />
                        </div>
                        <div className="flex items-center justify-between px-2 pt-1">
                           <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Target Period:</span>
                           <span className="text-[8px] font-black text-blue-600 uppercase italic flex items-center gap-2">
                             {startDate} <ChevronRight size={10} /> {endDate}
                           </span>
                        </div>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <label className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 block">Period Duration</label>
                        <input type="range" min="1" max="31" value={programDuration} onChange={(e) => setProgramDuration(parseInt(e.target.value))} className="w-full accent-blue-600 cursor-pointer h-1.5" />
                        <p className="text-center font-black mt-3 text-blue-600 text-sm italic tracking-widest">{programDuration} DAYS</p>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <label className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 block">Rest Threshold</label>
                        <input type="range" min="8" max="24" value={minRestHours} onChange={(e) => setMinRestHours(parseInt(e.target.value))} className="w-full accent-blue-600 cursor-pointer h-1.5" />
                        <p className="text-center font-black mt-3 text-blue-600 text-sm italic tracking-widest">{minRestHours}H</p>
                     </div>
                   </div>
                   <button onClick={() => setShowConfirmDialog(true)} className="w-full py-7 md:py-10 bg-slate-950 text-white rounded-2xl md:rounded-[2.5rem] font-black uppercase italic tracking-[0.2em] md:tracking-[0.4em] shadow-2xl hover:bg-blue-600 active:scale-95 transition-all flex items-center justify-center gap-3">
                     <Sparkles size={22} className="text-blue-400" /> Build AI Program
                   </button>
                   {isGenerating && <div className="flex flex-col items-center gap-2 mt-4"><Loader2 className="animate-spin text-blue-600"/><span className="text-[8px] font-black uppercase tracking-widest text-blue-600">AI Thinking Budget: 32768...</span></div>}
                   {error && <p className="text-[10px] text-rose-500 font-bold uppercase italic text-center animate-pulse mt-4">{error}</p>}
                </div>
             </div>
          </div>
        )}
        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={f => {setFlights(p => [...p, f]); db.upsertFlight(f);}} onUpdate={f => {setFlights(p => p.map(o => o.id === f.id ? f : o)); db.upsertFlight(f);}} onDelete={id => {setFlights(p => p.filter(f => f.id !== id)); db.deleteFlight(id);}} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={s => {setStaff(p => p.find(o => o.id === s.id) ? p.map(o => o.id === s.id ? s : o) : [...p, s]); db.upsertStaff(s);}} onDelete={id => {setStaff(p => p.filter(s => s.id !== id)); db.deleteStaff(id);}} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} staff={staff} leaveRequests={leaveRequests} startDate={startDate} onAdd={s => {setShifts(p => [...p, s]); db.upsertShift(s);}} onUpdate={s => {setShifts(p => p.map(o => o.id === s.id ? s : o)); db.upsertShift(s);}} onDelete={id => {setShifts(p => p.filter(s => s.id !== id)); db.deleteShift(id);}} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay 
          programs={programs} 
          flights={flights} 
          staff={staff} 
          shifts={shifts} 
          leaveRequests={leaveRequests} 
          incomingDuties={incomingDuties} 
          startDate={startDate} 
          endDate={endDate} 
          stationHealth={stationHealth} 
          alerts={alerts} 
          minRestHours={minRestHours}
          onUpdatePrograms={async (updated) => {
            setPrograms(updated);
            if (supabase) await db.savePrograms(updated);
          }}
        />}
      </main>

      <nav className={`xl:hidden fixed bottom-0 left-0 right-0 z-[150] bg-white border-t border-slate-200 px-4 py-3 flex justify-around items-center transition-transform duration-500 pb-safe ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
        {navigationTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center gap-1.5 transition-colors ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}`}>
            <tab.icon size={20} />
            <span className="text-[7px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
           <div className="bg-white rounded-2xl md:rounded-[3rem] w-full max-w-5xl h-[90vh] relative shadow-2xl overflow-hidden flex flex-col">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-4 right-4 p-3 bg-slate-100 rounded-xl z-10 hover:bg-rose-50 hover:text-rose-500 transition-colors"><X size={20} /></button>
              <div className="flex-1 overflow-auto">
                <ProgramScanner 
                  onDataExtracted={async (data) => { 
                    if(data.flights) {
                      setFlights(p => [...p, ...data.flights]);
                      data.flights.forEach(f => db.upsertFlight(f));
                    }
                    if(data.staff) {
                      setStaff(p => [...p, ...data.staff]);
                      data.staff.forEach(s => db.upsertStaff(s));
                    }
                    if(data.shifts) {
                      setShifts(p => [...p, ...data.shifts]);
                      data.shifts.forEach(s => db.upsertShift(s));
                    }
                    if(data.leaveRequests) {
                      setLeaveRequests(p => [...p, ...data.leaveRequests!]);
                      await db.upsertLeaves(data.leaveRequests!);
                    }
                    if(data.incomingDuties) {
                      setIncomingDuties(p => [...p, ...data.incomingDuties!]);
                      await db.upsertIncomingDuties(data.incomingDuties!);
                    }
                    setIsScannerOpen(false); 
                  }} 
                  startDate={startDate} 
                  initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} 
                />
              </div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-6 animate-in fade-in">
           <div className="bg-white rounded-2xl md:rounded-[3.5rem] p-8 md:p-12 text-center max-w-lg w-full shadow-2xl border border-white/10">
              <h3 className="text-2xl md:text-3xl font-black italic uppercase text-slate-900 mb-4">Engage AI Builder?</h3>
              <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-8 tracking-widest">New program will completely replace any existing data for this period.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 font-black uppercase text-[10px] text-slate-400 hover:text-rose-500 transition-colors">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-4 md:py-5 bg-slate-950 text-white rounded-xl md:rounded-2xl font-black uppercase italic tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95">Authorize AI Build</button>
              </div>
           </div>
        </div>
      )}
      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}