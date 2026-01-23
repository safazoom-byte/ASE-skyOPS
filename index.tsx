import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import { 
  Plane, 
  Users, 
  Clock, 
  LayoutDashboard,
  Menu,
  X,
  AlertCircle,
  Activity,
  CalendarDays,
  Sparkles,
  Zap,
  Target,
  Loader2,
  RefreshCw,
  Cloud,
  CloudOff,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  FileText,
  UserX
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { Auth } from './components/Auth';
import { generateAIProgram, refineAIProgram, ResourceRecommendation } from './services/geminiService';
import { db, supabase, auth } from './services/supabaseService';

const STORAGE_KEYS = {
  FLIGHTS: 'skyops_flights_v3',
  STAFF: 'skyops_staff_v3',
  SHIFTS: 'skyops_shifts_v3',
  PROGRAMS: 'skyops_programs_v3',
  START_DATE: 'skyops_start_date_v3',
  END_DATE: 'skyops_end_date_v3',
  REST_HOURS: 'skyops_min_rest_v3',
  PREV_DUTY_LOG: 'skyops_prev_duty_log_v3',
  PERSONNEL_REQUESTS: 'skyops_personnel_requests_v3'
};

const getSafeLocalStorageArray = <T,>(key: string): T[] => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Error parsing localStorage key ${key}:`, e);
    return [];
  }
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [startDate, setStartDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.START_DATE) || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.END_DATE) || new Date(Date.now() + 518400000).toISOString().split('T')[0]);
  
  const [flights, setFlights] = useState<Flight[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.FLIGHTS));
  const [staff, setStaff] = useState<Staff[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.STAFF));
  const [shifts, setShifts] = useState<ShiftConfig[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.SHIFTS));
  const [programs, setPrograms] = useState<DailyProgram[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.PROGRAMS));
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>(supabase ? 'connected' : 'error');
  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '');
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '');
  const [minRestHours, setMinRestHours] = useState<number>(() => parseInt(localStorage.getItem(STORAGE_KEYS.REST_HOURS) || '12'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');

  useEffect(() => {
    auth.getSession().then(s => {
      setSession(s);
      setIsAuthChecking(false);
    });

    const unsubscribe = auth.onAuthStateChange((s) => {
      setSession(s);
      if (!s) {
        setFlights([]);
        setStaff([]);
        setShifts([]);
        setPrograms([]);
        localStorage.clear();
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (supabase && session) {
      setSyncStatus('syncing');
      db.fetchAll().then(data => {
        if (data) {
          if (data.flights?.length > 0) setFlights(data.flights);
          if (data.staff?.length > 0) setStaff(data.staff);
          if (data.shifts?.length > 0) setShifts(data.shifts);
          if (data.programs?.length > 0) setPrograms(data.programs);
          setSyncStatus('connected');
        }
      }).catch(err => {
        console.error("Cloud Sync Error:", err);
        setSyncStatus('error');
        setError("Could not retrieve cloud data. Using local cache.");
      });
    } else if (!supabase) {
      setSyncStatus('error');
    }
  }, [session]);

  const numDays = useMemo(() => {
    if (!startDate || !endDate) return 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [startDate, endDate]);

  const activeFlightsInRange = useMemo(() => (flights || []).filter(f => f.date >= startDate && f.date <= endDate), [flights, startDate, endDate]);
  const activeShiftsInRange = useMemo(() => (shifts || []).filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate), [shifts, startDate, endDate]);

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights || []));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff || []));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts || []));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs || []));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    localStorage.setItem(STORAGE_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(STORAGE_KEYS.PREV_DUTY_LOG, previousDutyLog);
    localStorage.setItem(STORAGE_KEYS.PERSONNEL_REQUESTS, personnelRequests);
  }, [flights, staff, shifts, programs, startDate, endDate, minRestHours, previousDutyLog, personnelRequests, session]);

  const confirmGenerateProgram = async () => {
    if (activeShiftsInRange.length === 0 || activeFlightsInRange.length === 0) {
      setError("Critical Missing Data: Registry requires both Flight schedules and Duty slots to proceed.");
      setShowConfirmDialog(false);
      return;
    }

    setShowConfirmDialog(false); 
    setIsGenerating(true); 
    
    try {
      const inputData: ProgramData = { flights: activeFlightsInRange, staff: staff || [], shifts: activeShiftsInRange, programs: [] };
      let result = await generateAIProgram(inputData, `Log: ${previousDutyLog}\nRequests: ${personnelRequests}`, { numDays, minRestHours, startDate });
      result = await refineAIProgram(result, inputData, 1, { minRestHours, startDate, numDays });
      
      setPrograms(result.programs || []); 
      if (supabase) await db.savePrograms(result.programs || []);
      setActiveTab('program'); 
    } catch (err: any) { 
      setError(err.message || "Logic engine timeout. Operational complexity may be too high for a single pass."); 
    } 
    finally { setIsGenerating(false); }
  };

  const handleFlightAdd = async (f: Flight) => {
    setFlights(prev => [...prev, f]);
    if (supabase) await db.upsertFlight(f);
  };

  const handleFlightUpdate = async (f: Flight) => {
    setFlights(prev => prev.map(old => old.id === f.id ? f : old));
    if (supabase) await db.upsertFlight(f);
  };

  const handleFlightDelete = async (id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id));
    if (supabase) await db.deleteFlight(id);
  };

  const handleStaffUpdate = async (s: Staff) => {
    setStaff(prev => {
      const exists = prev.find(old => old.id === s.id);
      return exists ? prev.map(old => old.id === s.id ? s : old) : [...prev, s];
    });
    if (supabase) await db.upsertStaff(s);
  };

  const handleStaffDelete = async (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
    if (supabase) await db.deleteStaff(id);
  };

  const handleShiftAdd = async (s: ShiftConfig) => {
    setShifts(prev => [...prev, s]);
    if (supabase) await db.upsertShift(s);
  };

  const handleShiftUpdate = async (s: ShiftConfig) => {
    setShifts(prev => prev.map(old => old.id === s.id ? s : old));
    if (supabase) await db.upsertShift(s);
  };

  const handleShiftDelete = async (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id));
    if (supabase) await db.deleteShift(id);
  };

  const handleDataExtracted = async (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => {
    if (data.flights && data.flights.length > 0) {
      setFlights(prev => [...prev, ...data.flights]);
      if (supabase) { for (const f of data.flights) await db.upsertFlight(f); }
    }
    if (data.staff && data.staff.length > 0) {
      setStaff(prev => [...prev, ...data.staff]);
      if (supabase) { for (const s of data.staff) await db.upsertStaff(s); }
    }
    if (data.shifts && data.shifts.length > 0) {
      setShifts(prev => [...prev, ...data.shifts]);
      if (supabase) { for (const s of data.shifts) await db.upsertShift(s); }
    }
    if (data.programs && data.programs.length > 0) {
      setPrograms(data.programs);
      if (supabase) await db.savePrograms(data.programs);
    }
    setIsScannerOpen(false);
  };

  if (isAuthChecking) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="text-blue-600 animate-spin" size={48} /></div>;
  if (!session) return <Auth />;

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Shifts' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24 md:pb-0">
      <header className="sticky top-0 z-[100] bg-slate-950/95 backdrop-blur-2xl border-b border-white/5 py-4 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-6">
           <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Plane className="text-white" size={20} /></div>
           <div>
             <h1 className="text-base md:text-lg font-black italic text-white uppercase tracking-tighter leading-none">SkyOPS</h1>
             <div className="flex items-center gap-2 md:gap-4 mt-1">
               <div className="flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                 <span className="text-[7px] md:text-[8px] font-black text-slate-500 uppercase tracking-widest block truncate max-w-[80px] md:max-w-none">{session.user.email}</span>
               </div>
               <div className="flex items-center gap-2 border-l border-white/10 pl-2 md:pl-4">
                  {syncStatus === 'syncing' ? <RefreshCw size={10} className="text-blue-400 animate-spin" /> : 
                   syncStatus === 'connected' ? <Cloud size={10} className="text-emerald-400" /> : 
                   <CloudOff size={10} className="text-rose-400" />}
                  <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${syncStatus === 'syncing' ? 'text-blue-400' : syncStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'connected' ? 'Cloud' : 'Offline'}
                  </span>
               </div>
             </div>
           </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <nav className="hidden md:flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/5">
            {navigationTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </nav>
          <button onClick={() => auth.signOut()} className="p-2.5 md:p-3 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-xl transition-all"><LogOut size={16} /></button>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-[200] bg-slate-950 border-t border-white/5 md:hidden px-4 py-2 flex items-center justify-around pb-safe">
        {navigationTabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${activeTab === tab.id ? 'text-blue-500 bg-blue-500/10' : 'text-slate-500'}`}
          >
            <tab.icon size={18} />
            <span className="text-[7px] font-black uppercase tracking-widest">{tab.id === 'dashboard' ? 'Home' : tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 md:p-12 overflow-x-hidden">
        {error && (
          <div className="mb-8 p-5 md:p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl md:rounded-[3rem] flex justify-between items-center animate-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} />
              <span className="font-black uppercase italic text-[9px] md:text-xs tracking-widest">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-rose-500/10 rounded-full">&times;</button>
          </div>
        )}
        
        {activeTab === 'dashboard' && (
          <div className="space-y-8 md:space-y-12 animate-in fade-in duration-500">
             {/* THE INDEX BOXES (DASHBOARD CARDS) */}
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
                <button 
                  onClick={() => setActiveTab('flights')}
                  className="group bg-white p-8 md:p-14 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 hover:border-blue-500 transition-all text-left relative overflow-hidden active:scale-[0.98]"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 -translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0"><ArrowUpRight size={24} className="text-blue-500" /></div>
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all"><Activity size={28} /></div>
                  <h4 className="text-4xl md:text-6xl font-black italic text-slate-900 leading-none tracking-tighter">{activeFlightsInRange.length}</h4>
                  <div className="flex items-center gap-2 mt-3">
                    <p className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-widest">Active Air Traffic</p>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab('staff')}
                  className="group bg-white p-8 md:p-14 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 hover:border-indigo-500 transition-all text-left relative overflow-hidden active:scale-[0.98]"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 -translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0"><ArrowUpRight size={24} className="text-indigo-500" /></div>
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all"><Users size={28} /></div>
                  <h4 className="text-4xl md:text-6xl font-black italic text-slate-900 leading-none tracking-tighter">{staff.length}</h4>
                  <div className="flex items-center gap-2 mt-3">
                    <p className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-widest">Available Manpower</p>
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab('shifts')}
                  className="group bg-white p-8 md:p-14 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 hover:border-amber-500 transition-all text-left relative overflow-hidden sm:col-span-2 lg:col-span-1 active:scale-[0.98]"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 -translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0"><ArrowUpRight size={24} className="text-amber-500" /></div>
                  <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-6 group-hover:bg-amber-600 group-hover:text-white transition-all"><Clock size={28} /></div>
                  <h4 className="text-4xl md:text-6xl font-black italic text-slate-900 leading-none tracking-tighter">{activeShiftsInRange.length}</h4>
                  <div className="flex items-center gap-2 mt-3">
                    <p className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-widest">Duty Assignments</p>
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                  </div>
                </button>
             </div>

             <div className="bg-white p-6 md:p-14 rounded-3xl md:rounded-[4.5rem] border border-slate-100 space-y-10 md:space-y-14 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full pointer-events-none"></div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <h3 className="text-2xl md:text-4xl font-black uppercase italic flex items-center gap-4 text-slate-950 tracking-tighter"><Zap className="text-blue-600" /> Operational Matrix</h3>
                  <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">AI Core: ONLINE</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                   <div className="space-y-4 md:space-y-6">
                      <label className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2"><CalendarDays size={14} className="text-blue-500"/> Schedule Window</label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 p-5 md:p-6 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[2.5rem] font-black text-slate-950 text-sm md:text-base outline-none focus:ring-4 focus:ring-blue-600/10 transition-all" />
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 p-5 md:p-6 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[2.5rem] font-black text-slate-950 text-sm md:text-base outline-none focus:ring-4 focus:ring-blue-600/10 transition-all" />
                      </div>
                   </div>
                   <div className="space-y-4 md:space-y-6">
                      <label className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2"><Target size={14} className="text-indigo-500"/> Fatigue Management (Rest)</label>
                      <div className="px-8 py-5 md:py-6 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[2.5rem] flex items-center gap-6">
                        <input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                        <div className="flex flex-col items-center">
                          <span className="font-black text-blue-600 text-xl md:text-2xl italic leading-none">{minRestHours}h</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">MIN</span>
                        </div>
                      </div>
                   </div>

                   {/* RESTORED INPUT BOXES */}
                   <div className="space-y-4 md:space-y-6">
                      <label className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2"><UserX size={14} className="text-rose-500"/> Personnel Requests & Leave</label>
                      <textarea 
                        value={personnelRequests} 
                        onChange={e => setPersonnelRequests(e.target.value)} 
                        placeholder="e.g. 'MZ on Leave Monday', 'Shift Leader needed for EK on Day 2'..."
                        className="w-full h-32 md:h-40 p-6 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[2.5rem] font-bold text-slate-900 text-xs outline-none focus:ring-4 focus:ring-blue-600/10 transition-all resize-none"
                      />
                   </div>
                   <div className="space-y-4 md:space-y-6">
                      <label className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2"><FileText size={14} className="text-emerald-500"/> Legacy Duty Log (Pre-Roster)</label>
                      <textarea 
                        value={previousDutyLog} 
                        onChange={e => setPreviousDutyLog(e.target.value)} 
                        placeholder="Paste previous shift endings here to ensure AI calculates 12h rest for the first day..."
                        className="w-full h-32 md:h-40 p-6 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[2.5rem] font-bold text-slate-900 text-xs outline-none focus:ring-4 focus:ring-blue-600/10 transition-all resize-none"
                      />
                   </div>
                </div>

                <div className="pt-6">
                  <button onClick={() => setShowConfirmDialog(true)} disabled={isGenerating} className="group w-full py-8 md:py-10 bg-slate-950 text-white rounded-3xl md:rounded-[4rem] font-black uppercase italic tracking-[0.2em] md:tracking-[0.5em] hover:bg-blue-600 transition-all flex items-center justify-center gap-6 shadow-2xl active:scale-95 text-xs md:text-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                    <Sparkles size={24} className={isGenerating ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'} /> 
                    {isGenerating ? 'PROCESSING SCHEMATICS...' : 'EXECUTE ROSTER PROTOCOL'}
                  </button>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={handleFlightAdd} onUpdate={handleFlightUpdate} onDelete={handleFlightDelete} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={handleStaffDelete} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={handleShiftAdd} onUpdate={handleShiftUpdate} onDelete={handleShiftDelete} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/95 animate-in fade-in">
           <div className="bg-white rounded-2xl md:rounded-[4.5rem] w-full max-w-5xl h-[90vh] overflow-hidden relative shadow-2xl">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-6 right-6 p-4 bg-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all z-20"><X size={24} /></button>
              <div className="h-full overflow-auto no-scrollbar"><ProgramScanner onDataExtracted={handleDataExtracted} startDate={startDate} initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-4 animate-in fade-in">
           <div className="bg-white rounded-[3.5rem] p-10 md:p-16 text-center max-w-lg w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-blue-600 rounded-full"></div>
              <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-inner"><Target size={48} /></div>
              <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Authorize AI Logic?</h3>
              <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.2em] mt-6 leading-relaxed">System will optimize {numDays} days of handling operations, prioritizing coverage and labor law adherence.</p>
              <div className="flex gap-4 mt-12">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-5 text-slate-400 font-black uppercase text-[10px] tracking-widest italic hover:text-slate-900 transition-all">Cancel</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-5 bg-slate-950 text-white rounded-3xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-xs active:scale-95">ENGAGE ENGINE</button>
              </div>
           </div>
        </div>
      )}

      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);