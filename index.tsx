
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
          if (data.flights.length) setFlights(data.flights);
          if (data.staff.length) setStaff(data.staff);
          if (data.shifts.length) setShifts(data.shifts);
          if (data.programs.length) {
            const sortedPrograms = [...data.programs].sort((a,b) => a.day - b.day);
            setPrograms(sortedPrograms);
          }
          setSyncStatus('connected');
        } else {
          setSyncStatus('error');
        }
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
    
    const newStaffList = pendingVerification.staff || [];
    const newFlightsList = pendingVerification.flights || [];
    const newShiftsList = pendingVerification.shifts || [];

    await Promise.all([
      ...newStaffList.map(s => db.upsertStaff(s)),
      ...newFlightsList.map(f => db.upsertFlight(f)),
      ...newShiftsList.map(s => db.upsertShift(s))
    ]);

    setStaff(prev => {
      const p = prev || [];
      const existingIds = new Set(p.map(s => s.id));
      const filtered = newStaffList.filter(s => !existingIds.has(s.id));
      return [...p, ...filtered];
    });
    setFlights(prev => {
      const p = prev || [];
      const existingKeys = new Set(p.map(f => `${f.flightNumber}-${f.date}`));
      const filtered = newFlightsList.filter(f => !existingKeys.has(`${f.flightNumber}-${f.date}`));
      return [...p, ...filtered];
    });
    setShifts(prev => {
      const p = prev || [];
      const existingKeys = new Set(p.map(s => `${s.pickupDate}-${s.pickupTime}`));
      const filtered = newShiftsList.filter(s => !existingKeys.has(`${s.pickupDate}-${s.pickupTime}`));
      return [...p, ...filtered];
    });
    
    setSyncStatus('connected');
    setPendingVerification(null);
    setShowSuccessChecklist(true);
  };

  const confirmGenerateProgram = async () => {
    if (activeShiftsInRange.length === 0) {
      setError("No Duty Master slots (shifts) found for this window. Define shifts first.");
      setShowConfirmDialog(false);
      return;
    }

    if (activeFlightsInRange.length === 0) { 
      setError("No flights found in window. Roster requires flight data."); 
      setShowConfirmDialog(false); 
      return; 
    }

    setShowConfirmDialog(false); 
    setIsGenerating(true); 
    setComplianceLog([]); 
    setShowWarningModal(false);
    
    try {
      const inputData: ProgramData = { flights: activeFlightsInRange, staff: staff || [], shifts: activeShiftsInRange, programs: [] };
      
      setGenerationStep(1); 
      let result = await generateAIProgram(inputData, `Log: ${previousDutyLog}\nRequests: ${personnelRequests}`, { numDays, minRestHours, startDate });
      
      if (result.hasBlockers) { 
        setComplianceLog(result.validationLog || ["Structural Failure"]); 
        setError("Structural logic failure. Check Registry and availability."); 
        return; 
      }

      setGenerationStep(2); 
      result = await refineAIProgram(result, inputData, 1, { minRestHours, startDate, numDays });
      
      setProposedPrograms(result.programs);
      if (!result.isCompliant || result.validationLog?.length) {
        setComplianceLog(result.validationLog || ["Reviewing policy exceptions..."]);
        setShowWarningModal(true);
      } else {
        setPrograms(result.programs || []); 
        if (result.recommendations) setRecommendations(result.recommendations);
        if (supabase) {
          setSyncStatus('syncing');
          await db.savePrograms(result.programs || []);
          setSyncStatus('connected');
        }
        setActiveTab('program'); 
        setShowSuccessChecklist(true);
      }
    } catch (err: any) { 
      console.error(err);
      setError(err.message || "Engine timeout. Try a shorter date range."); 
    } 
    finally { setIsGenerating(false); setGenerationStep(0); }
  };

  const authorizeWithWaiver = async () => {
    if (proposedPrograms) {
      setPrograms(proposedPrograms);
      if (supabase) {
        setSyncStatus('syncing');
        await db.savePrograms(proposedPrograms);
        setSyncStatus('connected');
      }
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
      } catch (e) {
        setSyncStatus('error');
      }
    }
  };

  const handleFlightUpdate = async (f: Flight) => {
    setFlights(prev => prev.map(old => old.id === f.id ? f : old));
    if (supabase) { setSyncStatus('syncing'); await db.upsertFlight(f); setSyncStatus('connected'); }
  };
  const handleFlightDelete = async (id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id));
    if (supabase) { setSyncStatus('syncing'); await db.deleteFlight(id); setSyncStatus('connected'); }
  };

  const handleStaffUpdate = async (s: Staff) => {
    setStaff(prev => {
      const exists = prev.find(old => old.id === s.id);
      return exists ? prev.map(old => old.id === s.id ? s : old) : [...prev, s];
    });
    if (supabase) { setSyncStatus('syncing'); await db.upsertStaff(s); setSyncStatus('connected'); }
  };
  const handleStaffDelete = async (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
    if (supabase) { setSyncStatus('syncing'); await db.deleteStaff(id); setSyncStatus('connected'); }
  };

  const handleShiftAdd = async (s: ShiftConfig) => {
    setShifts(prev => [...prev, s]);
    if (supabase) {
      setSyncStatus('syncing');
      try {
        await db.upsertShift(s);
        setSyncStatus('connected');
      } catch (e) {
        setSyncStatus('error');
      }
    }
  };

  const handleShiftUpdate = async (s: ShiftConfig) => {
    setShifts(prev => {
      const exists = prev.find(old => old.id === s.id);
      return exists ? prev.map(old => old.id === s.id ? s : old) : [...prev, s];
    });
    if (supabase) { setSyncStatus('syncing'); await db.upsertShift(s); setSyncStatus('connected'); }
  };
  const handleShiftDelete = async (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id));
    if (supabase) { setSyncStatus('syncing'); await db.deleteShift(id); setSyncStatus('connected'); }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="text-blue-600 animate-spin" size={48} />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="sticky top-0 z-[100] bg-slate-950/95 backdrop-blur-2xl border-b border-white/5 py-4 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
           <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Plane className="text-white" size={20} /></div>
           <div>
             <h1 className="text-lg font-black italic text-white uppercase tracking-tighter leading-none">SkyOPS</h1>
             <div className="flex items-center gap-4 mt-1">
               <div className="flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest block">Logged in as {session.user.email}</span>
               </div>
               {syncStatus !== 'idle' && (
                 <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                    {syncStatus === 'syncing' ? <RefreshCw size={10} className="text-blue-400 animate-spin" /> : 
                     syncStatus === 'connected' ? <Cloud size={10} className="text-emerald-400" /> : 
                     <CloudOff size={10} className="text-rose-400" />}
                    <span className={`text-[7px] font-black uppercase tracking-widest ${syncStatus === 'syncing' ? 'text-blue-400' : syncStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {syncStatus === 'syncing' ? 'Cloud Syncing' : syncStatus === 'connected' ? 'Cloud Live' : 'Cloud Error'}
                    </span>
                 </div>
               )}
             </div>
           </div>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/5">
            {navigationTabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </nav>
          <button 
            onClick={() => auth.signOut()}
            className="p-3 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-xl transition-all"
            title="Terminate Session"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {isGenerating && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/98 flex items-center justify-center p-8 animate-in fade-in">
           <div className="max-w-xl w-full text-center space-y-12">
              <div className="relative mx-auto w-32 h-32">
                <div className="absolute inset-0 bg-blue-600/20 rounded-[2.5rem] animate-ping"></div>
                <div className="relative w-full h-full bg-blue-600/20 rounded-[2.5rem] flex items-center justify-center"><Cpu size={48} className="text-blue-500" /></div>
              </div>
              <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter">AI Roster Generation</h3>
              <div className="grid grid-cols-2 gap-4 relative max-w-sm mx-auto">
                 {[1, 2].map(s => (
                   <div key={s} className="relative">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border mx-auto transition-all duration-500 ${generationStep >= s ? 'bg-blue-600 text-white shadow-xl scale-110' : 'bg-slate-900 text-slate-700'}`}>{generationStep > s ? <Check /> : s}</div>
                      <span className={`block mt-3 text-[7px] font-black uppercase tracking-widest ${generationStep >= s ? 'text-blue-400' : 'text-slate-600'}`}>
                        {s === 1 ? 'Mapping Logic' : 'Policy Audit'}
                      </span>
                   </div>
                 ))}
              </div>
              <p className="text-blue-400 font-black uppercase text-[10px] tracking-[0.4em] animate-pulse">Building station plan — Handover prioritized</p>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-12">
        {error && (
          <div className="mb-10 p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[3rem] flex justify-between items-center animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <AlertCircle size={24} />
              <span className="font-black uppercase italic text-xs tracking-widest">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-rose-500/10 rounded-full transition-all">&times;</button>
          </div>
        )}
        
        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-2xl transition-all">
                  <Activity className="text-blue-600 mb-6 group-hover:scale-110 transition-transform" />
                  <h4 className="text-4xl font-black italic text-slate-900">{activeFlightsInRange.length}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Flights in window</p>
                </div>
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-2xl transition-all">
                  <Users className="text-indigo-600 mb-6 group-hover:scale-110 transition-transform" />
                  <h4 className="text-4xl font-black italic text-slate-900">{(staff || []).length}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Personnel Registry</p>
                </div>
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-2xl transition-all">
                  <Clock className="text-amber-600 mb-6 group-hover:scale-110 transition-transform" />
                  <h4 className="text-4xl font-black italic text-slate-900">{activeShiftsInRange.length}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Duty Master Slots</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 space-y-6">
                  <h4 className="text-xl font-black italic uppercase flex items-center gap-4 text-slate-900">
                    <Briefcase className="text-blue-600" /> Requested Day Off / Matrix
                  </h4>
                  <textarea 
                    className="w-full h-48 p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-sm outline-none focus:ring-4 focus:ring-blue-500/5 transition-all resize-none shadow-inner"
                    placeholder="E.g. J.D. requested Friday OFF, S.K. on sick leave tomorrow..."
                    value={personnelRequests}
                    onChange={e => setPersonnelRequests(e.target.value)}
                  />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Overrides standard rules for specific agents.</p>
                </div>
                
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 space-y-6">
                  <h4 className="text-xl font-black italic uppercase flex items-center gap-4 text-slate-900">
                    <History className="text-indigo-600" /> Previous Duty Log / Handover
                  </h4>
                  <textarea 
                    className="w-full h-48 p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all resize-none shadow-inner"
                    placeholder="Paste handover logs or notes from previous shift here..."
                    value={previousDutyLog}
                    onChange={e => setPreviousDutyLog(e.target.value)}
                  />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">AI uses this to maintain continuity and equity.</p>
                </div>
             </div>

             <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 space-y-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[100px] pointer-events-none"></div>
                <h3 className="text-2xl font-black uppercase italic flex items-center gap-4 text-slate-950 relative z-10"><Zap className="text-blue-600" /> Operational Context</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operational Window</label>
                      <div className="flex gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-slate-950 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none" />
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-slate-950 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none" />
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Rest Hours</label>
                        <span className="text-xl font-black italic text-blue-600">{minRestHours}h</span>
                      </div>
                      <div className="px-6 py-6 bg-slate-50 border border-slate-200 rounded-[2rem]">
                        <input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="w-full accent-blue-600 h-1" />
                      </div>
                   </div>
                </div>
                <button 
                  onClick={() => activeFlightsInRange.length ? setShowConfirmDialog(true) : setError("No flights in window.")} 
                  disabled={isGenerating} 
                  className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.4em] hover:bg-blue-600 transition-all flex items-center justify-center gap-6 shadow-2xl relative z-10"
                >
                  <Sparkles size={20} /> INITIATE COMMAND SEQUENCE <ChevronRight />
                </button>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights || []} startDate={startDate} endDate={endDate} onAdd={handleFlightAdd} onUpdate={handleFlightUpdate} onDelete={handleFlightDelete} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff || []} onUpdate={handleStaffUpdate} onDelete={handleStaffDelete} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts || []} flights={flights || []} startDate={startDate} onAdd={handleShiftAdd} onUpdate={handleShiftUpdate} onDelete={handleShiftDelete} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs || []} flights={flights || []} staff={staff || []} shifts={shifts || []} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      {showWarningModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] max-w-2xl w-full p-12 text-center shadow-2xl">
              <div className="w-24 h-24 bg-amber-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8"><AlertTriangle size={48} className="text-amber-600" /></div>
              <h3 className="text-3xl font-black uppercase italic text-amber-600 tracking-tighter">Policy Warnings Detected</h3>
              <p className="text-slate-500 text-[10px] font-black uppercase mt-2 mb-8 tracking-widest italic">The logic engine detected staff shortages requiring potential waivers.</p>
              <div className="p-8 bg-amber-50 border border-amber-100 rounded-[2.5rem] mb-10 max-h-[300px] overflow-auto text-left space-y-4 no-scrollbar">
                 {complianceLog.map((log, i) => (
                   <div key={i} className="flex gap-4 border-b border-amber-200/50 pb-4">
                      <div className="w-4 h-4 rounded-full bg-amber-200 shrink-0 mt-1 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-amber-600 rounded-full"></div></div>
                      <p className="text-[10px] font-black text-amber-900 leading-tight uppercase italic">{log}</p>
                   </div>
                 ))}
              </div>
              <div className="flex flex-col gap-4">
                <button onClick={authorizeWithWaiver} className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic flex items-center justify-center gap-4 hover:bg-blue-600 transition-all shadow-xl">AUTHORIZE PROGRAM WITH WAIVERS <ArrowRight size={18}/></button>
                <button onClick={() => setShowWarningModal(false)} className="py-2 font-black uppercase text-slate-400 text-[9px] tracking-[0.3em] hover:text-slate-600 transition-colors">Discard and Review Registry</button>
              </div>
           </div>
        </div>
      )}

      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] p-12 max-w-lg w-full text-center shadow-2xl">
              <div className="w-24 h-24 bg-emerald-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8"><CheckCircle2 size={48} className="text-emerald-500" /></div>
              <h3 className="text-3xl font-black italic uppercase tracking-tighter">Roster Synchronized</h3>
              <p className="text-slate-400 text-[10px] font-black uppercase mt-2 tracking-widest">Operational Command Successfully Authorized</p>
              <button onClick={() => setShowSuccessChecklist(false)} className="w-full mt-10 py-7 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] flex items-center justify-center gap-4 hover:bg-blue-600 shadow-xl transition-all">DEPLOY TO STATION <ArrowRight size={18}/></button>
           </div>
        </div>
      )}

      {pendingVerification && (
        <div className="fixed inset-0 z-[1500] bg-slate-950/95 flex items-center justify-center p-12 animate-in zoom-in-95 duration-300">
           <div className="bg-white rounded-[4rem] w-full max-w-5xl h-[85vh] flex flex-col p-12 shadow-2xl">
              <div className="flex justify-between items-center mb-10">
                <div>
                   <h3 className="text-3xl font-black italic uppercase tracking-tighter">Registry Verification</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Reviewing locally parsed operational dimensions</p>
                </div>
                <div className="flex gap-4">
                   <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase">F: {pendingVerification.flights.length}</div>
                   <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase">S: {pendingVerification.staff.length}</div>
                </div>
              </div>
              <div className="flex-1 overflow-auto mb-10 bg-slate-50 p-10 rounded-[3rem] font-mono text-[10px] border border-slate-100 shadow-inner no-scrollbar">
                <pre>{JSON.stringify(pendingVerification, null, 2)}</pre>
              </div>
              <div className="flex gap-6">
                <button onClick={() => setPendingVerification(null)} className="flex-1 py-8 text-slate-400 font-black uppercase italic text-xs">Discard Buffer</button>
                <button onClick={commitVerifiedData} className="flex-[2] py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4">AUTHORIZE MASTER SYNC <Sparkles size={20} /></button>
              </div>
           </div>
        </div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/95 animate-in fade-in">
           <div className="bg-white rounded-[4.5rem] w-full max-w-5xl h-[85vh] overflow-hidden relative shadow-2xl">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-10 p-4 bg-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all z-20"><X size={20} /></button>
              <div className="h-full overflow-auto no-scrollbar"><ProgramScanner onDataExtracted={d => { setPendingVerification(d); setIsScannerOpen(false); }} startDate={startDate} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-6 animate-in fade-in">
           <div className="bg-white rounded-[4rem] p-12 text-center max-w-lg w-full shadow-2xl">
              <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8"><Target size={48} className="text-blue-600" /></div>
              <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Engage Logic Engine?</h3>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-4">Initiating roster build for {activeFlightsInRange.length} operational cycles.</p>
              <div className="flex gap-4 mt-10">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-7 text-slate-400 font-black uppercase text-[10px] tracking-widest italic">Cancel</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-7 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] shadow-xl hover:bg-blue-600 transition-all">ENGAGE ENGINE</button>
              </div>
           </div>
        </div>
      )}

      <ProgramChat data={{ flights: flights || [], staff: staff || [], shifts: shifts || [], programs: programs || [] }} onUpdate={setPrograms} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
