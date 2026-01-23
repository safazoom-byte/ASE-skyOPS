
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
  ShieldCheck,
  TrendingUp,
  Activity,
  ChevronRight,
  History,
  Palmtree,
  CheckCircle2,
  CalendarDays,
  Check,
  Calendar,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  ClipboardCheck,
  Send,
  MousePointer2,
  Fingerprint,
  Shield,
  Briefcase,
  FileText,
  AlertTriangle,
  Cpu,
  Loader2,
  Scale,
  RefreshCw,
  Waves,
  Cloud,
  CloudOff,
  Database,
  LogOut
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { Auth } from './components/Auth';
import { generateAIProgram, refineAIProgram, extractDataFromContent, ShortageWarning, ResourceRecommendation, BuildResult } from './services/geminiService';
import { db, supabase, auth } from './services/supabaseService';

const STORAGE_KEYS = {
  FLIGHTS: 'skyops_flights_v3',
  STAFF: 'skyops_staff_v3',
  SHIFTS: 'skyops_shifts_v3',
  PROGRAMS: 'skyops_programs_v3',
  START_DATE: 'skyops_start_date_v3',
  END_DATE: 'skyops_end_date_v3',
  REST_HOURS: 'skyops_min_rest_v3',
  RECOMMENDATIONS: 'skyops_recommendations_v3',
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
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>(supabase ? 'connected' : 'idle');
  
  const [recommendations, setRecommendations] = useState<ResourceRecommendation | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '');
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '');
  const [minRestHours, setMinRestHours] = useState<number>(() => parseInt(localStorage.getItem(STORAGE_KEYS.REST_HOURS) || '12'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<number>(0); 
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessChecklist, setShowSuccessChecklist] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [complianceLog, setComplianceLog] = useState<string[]>([]);
  const [pendingVerification, setPendingVerification] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[] } | null>(null);
  const [proposedPrograms, setProposedPrograms] = useState<DailyProgram[] | null>(null);
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
          setFlights(data.flights || []);
          setStaff(data.staff || []);
          setShifts(data.shifts || []);
          setPrograms(data.programs || []);
          setSyncStatus('connected');
        }
      }).catch(err => {
        setSyncStatus('error');
        setError("Cloud Refusal: Database schema mismatch or RLS policy failure.");
      });
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
    localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recommendations));
    localStorage.setItem(STORAGE_KEYS.PREV_DUTY_LOG, previousDutyLog);
    localStorage.setItem(STORAGE_KEYS.PERSONNEL_REQUESTS, personnelRequests);
  }, [flights, staff, shifts, programs, startDate, endDate, minRestHours, recommendations, previousDutyLog, personnelRequests, session]);

  const commitVerifiedData = async () => {
    if (!pendingVerification) return;
    setSyncStatus('syncing');
    
    try {
      await Promise.all([
        ...pendingVerification.staff.map(s => db.upsertStaff(s)),
        ...pendingVerification.flights.map(f => db.upsertFlight(f)),
        ...pendingVerification.shifts.map(sh => db.upsertShift(sh))
      ]);

      setStaff(prev => [...prev, ...pendingVerification.staff.filter(s => !prev.some(p => p.id === s.id))]);
      setFlights(prev => [...prev, ...pendingVerification.flights.filter(f => !prev.some(p => p.id === f.id))]);
      setShifts(prev => [...prev, ...pendingVerification.shifts.filter(sh => !prev.some(p => p.id === sh.id))]);
      
      setSyncStatus('connected');
      setPendingVerification(null);
      setShowSuccessChecklist(true);
    } catch (err: any) {
      setSyncStatus('error');
      setError("Database Write Error. Check if your user has permission.");
    }
  };

  const confirmGenerateProgram = async () => {
    if (activeShiftsInRange.length === 0 || activeFlightsInRange.length === 0) {
      setError("Require both Flights and Duty Slots to generate program.");
      setShowConfirmDialog(false);
      return;
    }

    setShowConfirmDialog(false); 
    setIsGenerating(true); 
    setComplianceLog([]); 
    
    try {
      const inputData: ProgramData = { flights: activeFlightsInRange, staff: staff || [], shifts: activeShiftsInRange, programs: [] };
      setGenerationStep(1); 
      let result = await generateAIProgram(inputData, `Log: ${previousDutyLog}\nRequests: ${personnelRequests}`, { numDays, minRestHours, startDate });
      
      setGenerationStep(2); 
      result = await refineAIProgram(result, inputData, 1, { minRestHours, startDate, numDays });
      
      setProposedPrograms(result.programs);
      if (!result.isCompliant || result.validationLog?.length) {
        setComplianceLog(result.validationLog || ["Manual review suggested."]);
        setShowWarningModal(true);
      } else {
        setPrograms(result.programs || []); 
        if (supabase) await db.savePrograms(result.programs || []);
        setActiveTab('program'); 
        setShowSuccessChecklist(true);
      }
    } catch (err: any) { 
      setError(err.message || "Logic engine failure."); 
    } 
    finally { setIsGenerating(false); setGenerationStep(0); }
  };

  const authorizeWithWaiver = async () => {
    if (proposedPrograms) {
      setPrograms(proposedPrograms);
      if (supabase) await db.savePrograms(proposedPrograms);
      setShowWarningModal(false);
      setActiveTab('program');
      setShowSuccessChecklist(true);
    }
  };

  const handleFlightAdd = async (f: Flight) => {
    setFlights(prev => [...prev, f]);
    if (supabase) {
      setSyncStatus('syncing');
      try {
        await db.upsertFlight(f);
        setSyncStatus('connected');
      } catch (e) { setSyncStatus('error'); }
    }
  };

  const handleFlightUpdate = async (f: Flight) => {
    setFlights(prev => prev.map(old => old.id === f.id ? f : old));
    if (supabase) { 
      setSyncStatus('syncing'); 
      try {
        await db.upsertFlight(f); 
        setSyncStatus('connected'); 
      } catch (e) { setSyncStatus('error'); }
    }
  };

  const handleFlightDelete = async (id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id));
    if (supabase) { 
      setSyncStatus('syncing'); 
      try {
        await db.deleteFlight(id); 
        setSyncStatus('connected'); 
      } catch(e) { setSyncStatus('error'); }
    }
  };

  const handleStaffUpdate = async (s: Staff) => {
    setStaff(prev => {
      const exists = prev.find(old => old.id === s.id);
      return exists ? prev.map(old => old.id === s.id ? s : old) : [...prev, s];
    });
    if (supabase) { 
      setSyncStatus('syncing'); 
      try {
        await db.upsertStaff(s); 
        setSyncStatus('connected'); 
      } catch (e) { setSyncStatus('error'); }
    }
  };

  const handleStaffDelete = async (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
    if (supabase) { 
      setSyncStatus('syncing'); 
      try {
        await db.deleteStaff(id); 
        setSyncStatus('connected'); 
      } catch(e) { setSyncStatus('error'); }
    }
  };

  const handleShiftAdd = async (s: ShiftConfig) => {
    setShifts(prev => [...prev, s]);
    if (supabase) {
      setSyncStatus('syncing');
      try {
        await db.upsertShift(s);
        setSyncStatus('connected');
      } catch (e) { setSyncStatus('error'); }
    }
  };

  const handleShiftUpdate = async (s: ShiftConfig) => {
    setShifts(prev => {
      const exists = prev.find(old => old.id === s.id);
      return exists ? prev.map(old => old.id === s.id ? s : old) : [...prev, s];
    });
    if (supabase) {
      setSyncStatus('syncing');
      try {
        await db.upsertShift(s);
        setSyncStatus('connected');
      } catch (e) { setSyncStatus('error'); }
    }
  };

  const handleShiftDelete = async (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id));
    if (supabase) { 
      setSyncStatus('syncing'); 
      try {
        await db.deleteShift(id); 
        setSyncStatus('connected'); 
      } catch(e) { setSyncStatus('error'); }
    }
  };

  if (isAuthChecking) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="text-blue-600 animate-spin" size={48} /></div>;
  if (!session) return <Auth />;

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-20 md:pb-0">
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
                    {syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'connected' ? 'Cloud' : 'Error'}
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
      <nav className="fixed bottom-0 left-0 right-0 z-[200] bg-slate-950 border-t border-white/5 md:hidden px-4 py-2 flex items-center justify-around">
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

      {isGenerating && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/98 flex items-center justify-center p-8 animate-in fade-in">
           <div className="max-w-xl w-full text-center space-y-12">
              <div className="relative mx-auto w-32 h-32">
                <div className="absolute inset-0 bg-blue-600/20 rounded-[2.5rem] animate-ping"></div>
                <div className="relative w-full h-full bg-blue-600/20 rounded-[2.5rem] flex items-center justify-center"><Cpu size={48} className="text-blue-500" /></div>
              </div>
              <h3 className="text-3xl md:text-4xl font-black text-white italic uppercase tracking-tighter">AI Roster Generation</h3>
              <p className="text-blue-400 font-black uppercase text-[10px] tracking-[0.4em] animate-pulse">Building station plan — Handover prioritized</p>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 md:p-8 lg:p-12 overflow-x-hidden">
        {error && (
          <div className="mb-8 p-6 md:p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-3xl md:rounded-[3rem] flex justify-between items-center animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <AlertCircle size={20} />
              <span className="font-black uppercase italic text-[9px] md:text-xs tracking-widest">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-rose-500/10 rounded-full transition-all">&times;</button>
          </div>
        )}
        
        {activeTab === 'dashboard' && (
          <div className="space-y-6 md:space-y-12 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 group hover:border-blue-500 transition-all">
                  <Activity className="text-blue-600 mb-4 md:mb-6" />
                  <h4 className="text-2xl md:text-4xl font-black italic text-slate-900 leading-none">{activeFlightsInRange.length}</h4>
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Flights in window</p>
                </div>
                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 group hover:border-indigo-500 transition-all">
                  <Users className="text-indigo-600 mb-4 md:mb-6" />
                  <h4 className="text-2xl md:text-4xl font-black italic text-slate-900 leading-none">{staff.length}</h4>
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Personnel Registry</p>
                </div>
                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 group hover:border-amber-500 transition-all sm:col-span-2 lg:col-span-1">
                  <Clock className="text-amber-600 mb-4 md:mb-6" />
                  <h4 className="text-2xl md:text-4xl font-black italic text-slate-900 leading-none">{activeShiftsInRange.length}</h4>
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Active Duty Slots</p>
                </div>
             </div>

             <div className="bg-white p-6 md:p-12 rounded-2xl md:rounded-[3.5rem] border border-slate-100 space-y-6 md:space-y-10">
                <h3 className="text-lg md:text-2xl font-black uppercase italic flex items-center gap-3 md:gap-4 text-slate-950"><Zap className="text-blue-600" /> Operational Context</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                   <div className="space-y-2 md:space-y-4">
                      <label className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Operational Window</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 p-3 md:p-6 bg-slate-50 border border-slate-200 rounded-xl md:rounded-[2rem] font-black text-slate-950 text-xs md:text-sm" />
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 p-3 md:p-6 bg-slate-50 border border-slate-200 rounded-xl md:rounded-[2rem] font-black text-slate-950 text-xs md:text-sm" />
                      </div>
                   </div>
                   <div className="space-y-2 md:space-y-4">
                      <label className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Rest Hours</label>
                      <div className="px-4 py-3 md:px-6 md:py-6 bg-slate-50 border border-slate-200 rounded-xl md:rounded-[2rem] flex items-center gap-4">
                        <input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                        <span className="font-black text-blue-600 w-8 text-center text-xs md:text-sm">{minRestHours}h</span>
                      </div>
                   </div>
                </div>
                <button onClick={() => setShowConfirmDialog(true)} disabled={isGenerating} className="w-full py-5 md:py-8 bg-slate-950 text-white rounded-xl md:rounded-[3rem] font-black uppercase italic tracking-[0.1em] md:tracking-[0.4em] hover:bg-blue-600 transition-all flex items-center justify-center gap-4 md:gap-6 shadow-2xl active:scale-95 text-[10px] md:text-base">
                  <Sparkles size={16} className="md:w-5 md:h-5" /> INITIATE COMMAND SEQUENCE
                </button>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={handleFlightAdd} onUpdate={handleFlightUpdate} onDelete={handleFlightDelete} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={handleStaffDelete} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={handleShiftAdd} onUpdate={handleShiftUpdate} onDelete={handleShiftDelete} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-2 md:p-4 bg-slate-950/95 animate-in fade-in">
           <div className="bg-white rounded-2xl md:rounded-[4.5rem] w-full max-w-5xl h-[95vh] md:h-[85vh] overflow-hidden relative shadow-2xl">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-3 right-3 md:top-10 md:right-10 p-2 md:p-4 bg-slate-100 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-all z-20"><X size={18} className="md:w-5 md:h-5" /></button>
              <div className="h-full overflow-auto no-scrollbar"><ProgramScanner onDataExtracted={d => { setPendingVerification(d); setIsScannerOpen(false); }} startDate={startDate} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-4 md:p-6 animate-in fade-in">
           <div className="bg-white rounded-2xl md:rounded-[4rem] p-6 md:p-12 text-center max-w-lg w-full shadow-2xl">
              <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-50 rounded-xl md:rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 md:mb-8"><Target size={30} className="text-blue-600 md:w-10 md:h-10" /></div>
              <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-tight">Engage Logic Engine?</h3>
              <div className="flex gap-3 md:gap-4 mt-8 md:mt-10">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-4 md:py-5 text-slate-400 font-black uppercase text-[8px] md:text-[10px] tracking-widest italic">Cancel</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-4 md:py-5 bg-slate-950 text-white rounded-xl md:rounded-[2rem] font-black uppercase italic tracking-[0.1em] md:tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-[9px] md:text-xs">ENGAGE ENGINE</button>
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
