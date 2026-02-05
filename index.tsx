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
  Sparkles, 
  Zap,
  Target,
  Loader2,
  RefreshCw,
  LogOut,
  ShieldAlert,
  // Added ShieldCheck to imports to resolve rendering errors on lines 473 and 598
  ShieldCheck,
  Compass,
  Wind,
  Database,
  Terminal,
  CalendarRange,
  Hourglass,
  Coffee,
  Trash2,
  Plus,
  Ban,
  CalendarX,
  Briefcase,
  AlertTriangle,
  TimerReset,
  Moon,
  Lock,
  Calendar,
  Search,
  Check,
  CheckCircle2,
  DownloadCloud,
  Cloud,
  CloudOff,
  ChevronDown,
  Sun,
  Sunrise,
  Sunset
} from 'lucide-react';

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

const STORAGE_KEYS = {
  FLIGHTS: 'skyops_flights_v4',
  STAFF: 'skyops_staff_v4',
  SHIFTS: 'skyops_shifts_v4',
  PROGRAMS: 'skyops_programs_v4',
  LEAVE: 'skyops_leave_v4',
  INCOMING: 'skyops_incoming_v4',
  START_DATE: 'skyops_start_date_v4',
  END_DATE: 'skyops_end_date_v4',
  REST_HOURS: 'skyops_min_rest_v4',
};

const getSafeLocalStorageArray = <T,>(key: string): T[] => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'offline' | 'local'>('local');
  
  const [startDate, setStartDate] = useState<string>(() => 
    localStorage.getItem(STORAGE_KEYS.START_DATE) || new Date().toISOString().split('T')[0]
  );
  
  const [programDuration, setProgramDuration] = useState<number>(7);

  const [endDate, setEndDate] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.END_DATE);
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + programDuration);
    setEndDate(end.toISOString().split('T')[0]);
  }, [startDate, programDuration]);
  
  const [flights, setFlights] = useState<Flight[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.FLIGHTS));
  const [staff, setStaff] = useState<Staff[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.STAFF));
  const [shifts, setShifts] = useState<ShiftConfig[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.SHIFTS));
  const [programs, setPrograms] = useState<DailyProgram[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.PROGRAMS));
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.LEAVE));
  const [incomingDuties, setIncomingDuties] = useState<IncomingDuty[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.INCOMING));
  
  const [stationHealth, setStationHealth] = useState<number>(100);
  const [alerts, setAlerts] = useState<{ type: 'danger' | 'warning', message: string }[]>([]);
  
  const [minRestHours, setMinRestHours] = useState<number>(() => 
    parseInt(localStorage.getItem(STORAGE_KEYS.REST_HOURS) || '12')
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');

  // Quick Leave Inputs
  const [quickLeaveStaffId, setQuickLeaveStaffId] = useState('');
  const [quickLeaveDate, setQuickLeaveDate] = useState('');
  const [quickLeaveType, setQuickLeaveType] = useState<LeaveType>('DAY OFF');

  // Incoming Duty Inputs (Refined for Tactical Clock)
  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<string[]>([]);
  const [incomingHour, setIncomingHour] = useState('06');
  const [incomingMin, setIncomingMin] = useState('00');
  const [isClockOpen, setIsClockOpen] = useState(false);
  const [incomingDate, setIncomingDate] = useState('');
  const [incomingSearchTerm, setIncomingSearchTerm] = useState('');
  const [incomingSearchFocus, setIncomingSearchFocus] = useState(false);

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

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
    if (startDate) {
      const d = new Date(startDate);
      d.setDate(d.getDate() - 1);
      setIncomingDate(d.toISOString().split('T')[0]);
    }
  }, [startDate]);

  useEffect(() => {
    let mounted = true;

    const syncCloudData = async () => {
      if (!supabase) {
        setCloudStatus('local');
        return;
      }
      try {
        const cloudData = await db.fetchAll();
        if (mounted && cloudData) {
          if (cloudData.flights.length > 0) setFlights(cloudData.flights);
          if (cloudData.staff.length > 0) setStaff(cloudData.staff);
          if (cloudData.shifts.length > 0) setShifts(cloudData.shifts);
          if (cloudData.programs.length > 0) setPrograms(cloudData.programs);
          setCloudStatus('connected');
        }
      } catch (e) {
        console.error("Cloud Sync Error:", e);
        setCloudStatus('offline');
      }
    };

    const checkAuth = async () => {
      if (!supabase) {
        if (mounted) {
          setCloudStatus('local');
          setIsInitializing(false);
        }
        return;
      }
      try {
        const s = await auth.getSession();
        if (mounted) {
          setSession(s);
          if (s) {
            await syncCloudData();
          }
          setIsInitializing(false);
        }
      } catch (e) {
        console.error("Auth check failure:", e);
        if (mounted) setIsInitializing(false);
      }
    };
    checkAuth();

    const unsubscribe = auth.onAuthStateChange((s) => {
      if (mounted) {
        setSession(s);
        if (s) syncCloudData();
      }
    });

    return () => { 
      mounted = false; 
      unsubscribe(); 
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights || []));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff || []));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts || []));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs || []));
    localStorage.setItem(STORAGE_KEYS.LEAVE, JSON.stringify(leaveRequests || []));
    localStorage.setItem(STORAGE_KEYS.INCOMING, JSON.stringify(incomingDuties || []));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    localStorage.setItem(STORAGE_KEYS.REST_HOURS, minRestHours.toString());
  }, [flights, staff, shifts, programs, leaveRequests, incomingDuties, startDate, endDate, minRestHours]);

  const seedMockData = () => {
    if (!confirm("Inject sample aviation handling data?")) return;
    const mockStaff: Staff[] = [
      { id: 's1', name: 'Alex Lead', initials: 'AL', type: 'Local', workPattern: '5 Days On / 2 Off', isRamp: true, isShiftLeader: true, isOps: true, isLoadControl: true, isLostFound: false, powerRate: 100, maxShiftsPerWeek: 5 },
      { id: 's2', name: 'Jordan Ramp', initials: 'JR', type: 'Local', workPattern: '5 Days On / 2 Off', isRamp: true, isShiftLeader: false, isOps: false, isLoadControl: false, isLostFound: false, powerRate: 85, maxShiftsPerWeek: 5 },
      { id: 's3', name: 'Casey Load', initials: 'CL', type: 'Roster', workPattern: 'Continuous (Roster)', isRamp: false, isShiftLeader: false, isOps: false, isLoadControl: true, isLostFound: false, powerRate: 90, maxShiftsPerWeek: 5 },
      { id: 's4', name: 'Morgan Ops', initials: 'MO', type: 'Local', workPattern: '5 Days On / 2 Off', isRamp: false, isShiftLeader: false, isOps: true, isLoadControl: false, isLostFound: true, powerRate: 95, maxShiftsPerWeek: 5 },
    ];
    const mockFlights: Flight[] = [];
    const mockShifts: ShiftConfig[] = [];
    const baseDate = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      const f1Id = `f${i}a`;
      mockFlights.push({ id: f1Id, flightNumber: `BA${100 + i}`, from: 'LHR', to: 'STN', sta: '08:00', std: '09:00', date: ds, type: 'Turnaround', day: i, priority: 'Standard' });
      mockShifts.push({ id: `sh${i}m`, day: i, pickupDate: ds, pickupTime: '06:00', endDate: ds, endTime: '14:00', minStaff: 2, maxStaff: 4, flightIds: [f1Id], roleCounts: { 'Shift Leader': 1, 'Ramp': 1 } });
    }
    setStaff(mockStaff); setFlights(mockFlights); setShifts(mockShifts); setActiveTab('dashboard');
  };

  const confirmGenerateProgram = async () => {
    const activeShifts = shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
    const activeFlights = flights.filter(f => f.date >= startDate && f.date <= endDate);
    if (activeShifts.length === 0) { setError(`DATA ERROR: No Shifts found.`); setShowConfirmDialog(false); return; }
    setShowConfirmDialog(false); setIsGenerating(true); setError(null);
    try {
      const result = await generateAIProgram({ flights: activeFlights, staff, shifts: activeShifts, programs: [], leaveRequests, incomingDuties }, "", { numDays: programDuration, minRestHours, startDate });
      setPrograms(result.programs); 
      setStationHealth(result.stationHealth);
      setAlerts(result.alerts || []);
      if (supabase) await db.savePrograms(result.programs);
      setActiveTab('program'); 
    } catch (err: any) { setError(err.message); } 
    finally { setIsGenerating(false); }
  };

  const handleQuickLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLeaveStaffId || !quickLeaveDate) return;

    const targetStaff = staff.find(s => s.id === quickLeaveStaffId);
    if (!targetStaff) return;

    const newReq: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      staffId: targetStaff.id,
      startDate: quickLeaveDate,
      endDate: quickLeaveDate,
      type: quickLeaveType
    };

    setLeaveRequests(prev => [...prev, newReq]);
    setQuickLeaveStaffId('');
  };

  const handleForceUpdate = async () => {
    if (!confirm("This will delete old files and force a fresh update. Your data (Flights, Staff, Shifts) will persist. Continue?")) return;
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) await registration.unregister();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    window.location.reload();
  };

  // Incoming Duty Handlers
  const toggleIncomingStaff = (id: string) => {
    setIncomingSelectedStaffIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addIncomingDuties = () => {
    const finalTime = `${incomingHour}:${incomingMin}`;
    if (incomingSelectedStaffIds.length === 0 || !finalTime || !incomingDate) return;
    
    const newDuties: IncomingDuty[] = incomingSelectedStaffIds.map(sid => ({
      id: Math.random().toString(36).substr(2, 9),
      staffId: sid,
      date: incomingDate,
      shiftEndTime: finalTime
    }));

    const filteredCurrent = incomingDuties.filter(d => !incomingSelectedStaffIds.includes(d.staffId));
    setIncomingDuties([...filteredCurrent, ...newDuties]);
    setIncomingSelectedStaffIds([]);
    setIncomingSearchTerm('');
  };

  const removeIncomingDuty = (id: string) => {
    setIncomingDuties(prev => prev.filter(d => d.id !== id));
  };

  const calculateRestUntil = (dutyDate: string, endTime: string) => {
    if (!endTime || !dutyDate) return '???';
    const [h, m] = endTime.split(':').map(Number);
    const d = new Date(dutyDate);
    d.setHours(h + minRestHours, m);
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const diffMs = d.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (diffDays < 0) return `Ready (Pre-Roster)`;
    return `Day ${diffDays + 1} @ ${timeStr}`;
  };

  const filteredStaff = useMemo(() => {
    if (!incomingSearchTerm) return staff;
    const lower = incomingSearchTerm.toLowerCase();
    return staff.filter(s => 
      s.initials.toLowerCase().includes(lower) || 
      s.name.toLowerCase().includes(lower)
    );
  }, [staff, incomingSearchTerm]);

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Personnel' },
    { id: 'shifts', icon: Clock, label: 'Shifts' },
    { id: 'program', icon: CalendarDays, label: 'Roster' },
  ];

  const handleFlightAdd = async (f: Flight) => { setFlights(p => [...p, f]); if (supabase) await db.upsertFlight(f); };
  const handleFlightUpdate = async (f: Flight) => { setFlights(p => p.map(o => o.id === f.id ? f : o)); if (supabase) await db.upsertFlight(f); };
  const handleFlightDelete = async (id: string) => { setFlights(p => p.filter(f => f.id !== id)); if (supabase) await db.deleteFlight(id); };
  const handleStaffUpdate = async (s: Staff) => { setStaff(p => p.find(o => o.id === s.id) ? p.map(o => o.id === s.id ? s : o) : [...p, s]); if (supabase) await db.upsertStaff(s); };
  const handleStaffDelete = async (id: string) => { setStaff(p => p.filter(s => s.id !== id)); if (supabase) await db.deleteStaff(id); };
  const handleShiftAdd = async (s: ShiftConfig) => { setShifts(p => [...p, s]); if (supabase) await db.upsertShift(s); };
  const handleShiftUpdate = async (s: ShiftConfig) => { setShifts(p => p.map(o => o.id === s.id ? s : o)); if (supabase) await db.upsertShift(s); };
  const handleShiftDelete = async (id: string) => { setShifts(p => p.filter(s => s.id !== id)); if (supabase) await db.deleteShift(id); };
  const handleLeaveDelete = async (id: string) => { setLeaveRequests(p => p.filter(r => r.id !== id)); };

  const handleDataExtracted = async (data: any) => {
    if (data.flights?.length) { setFlights(p => [...p, ...data.flights]); if (supabase) for (const f of data.flights) await db.upsertFlight(f); }
    if (data.staff?.length) { setStaff(p => [...p, ...data.staff]); if (supabase) for (const s of data.staff) await db.upsertStaff(s); }
    if (data.shifts?.length) { setShifts(p => [...p, ...data.shifts]); if (supabase) for (const s of data.shifts) await db.upsertShift(s); }
    setIsScannerOpen(false);
  };

  const activeLeaveRequests = useMemo(() => {
    return leaveRequests
      .filter(l => l.startDate >= startDate)
      .sort((a,b) => a.startDate.localeCompare(b.startDate));
  }, [leaveRequests, startDate]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
        <Loader2 className="text-blue-500 animate-spin" size={48} />
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.6em] animate-pulse">Initialising Station Terminal...</span>
      </div>
    );
  }

  if (!session && supabase) return <Auth />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className={`sticky top-0 z-[100] bg-white/90 backdrop-blur-xl border-b border-slate-200/60 py-4 px-4 md:px-8 flex items-center justify-between transition-transform duration-500 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20"><Compass className="text-white" size={20} /></div>
           <div>
             <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase tracking-tighter leading-none">SkyOPS <span className="text-blue-600 font-light">Station</span></h1>
             <div className="flex items-center gap-2 mt-1">
               <span className={`w-1.5 h-1.5 rounded-full ${cloudStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : cloudStatus === 'offline' ? 'bg-rose-50' : 'bg-slate-300'}`}></span>
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{session?.user?.email || 'Local Terminal'}</span>
               <button onClick={handleForceUpdate} title="Reset" className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors"><RefreshCw size={10} /></button>
             </div>
           </div>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden xl:flex items-center gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            {navigationTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase italic tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </nav>
          <GithubSync data={{ flights, staff, shifts, programs, leaveRequests }} />
          {supabase && <button onClick={() => auth.signOut()} className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-500 rounded-xl transition-all border border-slate-200"><LogOut size={16} /></button>}
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 md:p-12 pb-32">
        {isGenerating && (
          <div className="fixed inset-0 z-[2000] bg-white/90 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8">
             <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-8"></div>
             <h3 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter mb-4">Computing Operational Program</h3>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Running Fatigue Heuristics...</p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 relative z-10"><Plane size={24} /></div>
                    <div className="relative z-10">
                       <h2 className="text-4xl font-black italic text-slate-900 tracking-tighter">{flights.length}</h2>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Traffic</p>
                    </div>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 relative z-10"><Users size={24} /></div>
                    <div className="relative z-10">
                       <h2 className="text-4xl font-black italic text-slate-900 tracking-tighter">{staff.length}</h2>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Manpower</p>
                    </div>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 relative z-10"><Clock size={24} /></div>
                    <div className="relative z-10">
                       <h2 className="text-4xl font-black italic text-slate-900 tracking-tighter">{shifts.length}</h2>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Duty Slots</p>
                    </div>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* INCOMING DUTY / FATIGUE LOCK (MOBILE OPTIMIZED) */}
                  <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative z-20">
                      <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100"><Moon size={24} /></div>
                              <div>
                                   <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Fatigue Safety Lock</h4>
                                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Mandatory Rest Protocol</p>
                              </div>
                          </div>
                          {incomingDuties.length === 0 && (
                             <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 animate-pulse">
                               <ShieldCheck size={12} className="text-emerald-500" />
                               <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">Status: Clear</span>
                             </div>
                          )}
                      </div>

                      <div className="flex flex-col gap-4 mb-8">
                          <div className="relative group z-40">
                              <div className={`w-full min-h-[60px] px-5 py-3 bg-white rounded-2xl border-2 flex flex-wrap items-center gap-2 transition-all ${incomingSearchFocus ? 'border-amber-400 ring-8 ring-amber-500/5' : 'border-slate-100'}`}>
                                  <Search size={18} className="text-slate-300 mr-1" />
                                  {incomingSelectedStaffIds.map(id => {
                                      const s = staff.find(st => st.id === id);
                                      return (
                                          <span key={id} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 animate-in zoom-in-50 border border-amber-100">
                                              {s?.initials}
                                              <button onClick={(e) => { e.stopPropagation(); toggleIncomingStaff(id); }} className="hover:text-amber-900"><X size={12}/></button>
                                          </span>
                                      );
                                  })}
                                  <input 
                                      type="text" 
                                      className="flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none min-w-[140px] h-full py-1 placeholder:text-slate-400"
                                      placeholder={incomingSelectedStaffIds.length > 0 ? "" : "Search personnel to lock..."}
                                      value={incomingSearchTerm}
                                      onChange={e => setIncomingSearchTerm(e.target.value)}
                                      onFocus={() => setIncomingSearchFocus(true)}
                                      onBlur={() => setTimeout(() => setIncomingSearchFocus(false), 200)}
                                  />
                              </div>
                              {incomingSearchFocus && (
                                  <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-200 rounded-[2rem] shadow-2xl max-h-[280px] overflow-y-auto p-2 animate-in fade-in slide-in-from-top-4">
                                      {filteredStaff.map(s => (
                                          <button 
                                              key={s.id}
                                              onMouseDown={(e) => { e.preventDefault(); toggleIncomingStaff(s.id); setIncomingSearchTerm(''); }}
                                              className={`w-full text-left p-4 rounded-2xl text-[11px] font-black uppercase flex items-center justify-between border-b border-slate-50 last:border-0 transition-all ${incomingSelectedStaffIds.includes(s.id) ? 'bg-amber-50 text-amber-600' : 'text-slate-600 hover:bg-slate-50'}`}
                                          >
                                              <span className="flex items-center gap-3">
                                                 <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-[10px]">{s.initials}</span>
                                                 {s.name}
                                              </span>
                                              {incomingSelectedStaffIds.includes(s.id) && <CheckCircle2 size={16} className="text-amber-500" />}
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-4">
                               <div className="relative flex-1">
                                  <input 
                                     type="date"
                                     className="h-[64px] w-full px-5 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs text-slate-900 outline-none focus:border-amber-400 transition-all"
                                     value={incomingDate}
                                     onChange={e => setIncomingDate(e.target.value)}
                                  />
                               </div>

                               <div className="relative w-full sm:w-[240px]">
                                  <button 
                                    onClick={() => setIsClockOpen(!isClockOpen)}
                                    className="h-[64px] w-full px-6 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-between hover:border-amber-400 transition-all group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Clock size={20} className="text-slate-400 group-hover:text-amber-500" />
                                      <span className="text-sm font-black text-slate-900 tabular-nums">{incomingHour}:{incomingMin}</span>
                                    </div>
                                    <ChevronDown size={20} className={`text-slate-300 transition-transform ${isClockOpen ? 'rotate-180' : ''}`} />
                                  </button>

                                  {isClockOpen && (
                                    <div className="fixed sm:absolute bottom-0 sm:bottom-full left-0 right-0 sm:left-auto sm:right-0 mb-0 sm:mb-6 bg-white border-t sm:border-2 border-slate-200 rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl p-6 sm:p-10 w-full sm:min-w-[400px] animate-in slide-in-from-bottom-20 sm:zoom-in-95 origin-bottom z-[200]">
                                       <div className="flex items-center justify-between mb-8 px-1">
                                          <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 italic">Tactical Clock</p>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select Duty Completion Time</p>
                                          </div>
                                          <button onClick={() => setIsClockOpen(false)} className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-full"><X size={20} className="text-slate-400" /></button>
                                       </div>
                                       
                                       <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 mb-10">
                                          {Array.from({length: 24}).map((_, i) => {
                                            const val = i.toString().padStart(2, '0');
                                            const isActive = incomingHour === val;
                                            return (
                                              <button 
                                                key={i}
                                                onClick={() => setIncomingHour(val)}
                                                className={`h-14 sm:h-12 rounded-xl font-black text-[14px] sm:text-[12px] transition-all flex items-center justify-center border-2 ${isActive ? 'bg-amber-500 text-white border-amber-400 shadow-xl shadow-amber-500/30 scale-105' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
                                              >
                                                {val}
                                              </button>
                                            );
                                          })}
                                       </div>

                                       <div className="space-y-6 pt-6 border-t border-slate-50">
                                          <div className="grid grid-cols-3 gap-3">
                                            <button onClick={() => { setIncomingHour('06'); setIncomingMin('00'); setIsClockOpen(false); }} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-amber-50 transition-all"><Sunrise size={16} className="text-amber-500" /><span className="text-[8px] font-black uppercase">Morn.</span></button>
                                            <button onClick={() => { setIncomingHour('14'); setIncomingMin('00'); setIsClockOpen(false); }} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-amber-50 transition-all"><Sun size={16} className="text-amber-500" /><span className="text-[8px] font-black uppercase">After.</span></button>
                                            <button onClick={() => { setIncomingHour('22'); setIncomingMin('00'); setIsClockOpen(false); }} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-amber-50 transition-all"><Moon size={16} className="text-amber-500" /><span className="text-[8px] font-black uppercase">Night</span></button>
                                          </div>
                                          <div className="flex gap-2">
                                            {['00', '15', '30', '45'].map(m => (
                                              <button key={m} onClick={() => { setIncomingMin(m); setIsClockOpen(false); }} className={`flex-1 h-14 rounded-2xl font-black text-[11px] uppercase transition-all border-2 ${incomingMin === m ? 'bg-slate-950 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>:{m}</button>
                                            ))}
                                          </div>
                                       </div>
                                    </div>
                                  )}
                               </div>

                               <button 
                                   onClick={addIncomingDuties}
                                   disabled={incomingSelectedStaffIds.length === 0}
                                   className="h-[64px] w-full sm:px-12 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-[0.3em] hover:bg-amber-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl active:scale-95"
                               >
                                   <Lock size={18} /> <span>Engage Lock</span>
                               </button>
                          </div>
                      </div>

                      <div className="space-y-4">
                          {incomingDuties.length === 0 ? (
                              <div className="w-full py-8 flex flex-col items-center gap-4 border-2 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/50">
                                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-sm"><ShieldCheck size={20} /></div>
                                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic">Operational Deck Clear</p>
                              </div>
                          ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                  {incomingDuties.map(d => {
                                      const s = staff.find(st => st.id === d.staffId);
                                      const restUntil = calculateRestUntil(d.date, d.shiftEndTime);
                                      return (
                                          <div key={d.id} className="p-4 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-between hover:shadow-xl transition-all shadow-sm">
                                              <div className="flex items-center gap-4">
                                                  <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center font-black text-sm text-amber-600 shadow-sm">{s?.initials || '?'}</div>
                                                  <div>
                                                      <p className="text-[11px] font-black uppercase text-slate-900 leading-tight truncate max-w-[100px]">{s?.name || 'Unknown'}</p>
                                                      <p className="text-[8px] font-bold text-amber-600 uppercase tracking-tighter mt-1">{restUntil}</p>
                                                  </div>
                                              </div>
                                              <button onClick={() => removeIncomingDuty(d.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={16}/></button>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>

                  {/* LEAVE REGISTRY */}
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                     <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100"><Briefcase size={24} /></div>
                        <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Restriction Ledger</h4>
                     </div>
                     <form onSubmit={handleQuickLeaveSubmit} className="flex flex-col sm:flex-row gap-3 mb-8 p-3 bg-slate-50 rounded-[2rem] border border-slate-100">
                        <select className="w-full sm:w-40 px-5 py-4 bg-white rounded-2xl font-black text-xs uppercase text-slate-900 outline-none border border-slate-100" value={quickLeaveStaffId} onChange={e => setQuickLeaveStaffId(e.target.value)}><option value="">Select Staff...</option>{staff.map(s => (<option key={s.id} value={s.id}>{s.initials} - {s.name}</option>))}</select>
                        <input type="date" className="w-full flex-1 px-5 py-4 bg-white rounded-2xl font-bold text-xs text-slate-900 outline-none border border-slate-100" value={quickLeaveDate} onChange={e => setQuickLeaveDate(e.target.value)}/>
                        <select className="w-full sm:w-32 px-5 py-4 bg-white rounded-2xl font-black text-xs uppercase text-slate-900 outline-none border border-slate-100" value={quickLeaveType} onChange={e => setQuickLeaveType(e.target.value as LeaveType)}><option value="DAY OFF">Off</option><option value="ANNUAL LEAVE">Leave</option></select>
                        <button type="submit" className="w-full sm:w-auto px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest hover:bg-indigo-600 transition-all"><Plus size={16} /></button>
                     </form>
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {activeLeaveRequests.map(req => {
                          const s = staff.find(st => st.id === req.staffId);
                          const isOff = req.type === 'DAY OFF';
                          return (
                            <div key={req.id} className={`p-4 border rounded-[2rem] flex items-center justify-between ${isOff ? 'bg-slate-50/50 border-slate-100' : 'bg-amber-50/50 border-amber-100'}`}>
                               <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm border ${isOff ? 'bg-white text-slate-900' : 'bg-white text-amber-600'}`}>{s?.initials || '?'}</div>
                                  <div><p className="text-[10px] font-black uppercase text-slate-900 leading-tight">{s?.name || 'Unknown'}</p><p className="text-[8px] font-bold text-slate-400 mt-0.5">{req.startDate}</p></div>
                               </div>
                               <button onClick={() => handleLeaveDelete(req.id)} className="w-8 h-8 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
                            </div>
                          )
                        })}
                     </div>
                  </div>
                </div>

                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-10">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-blue-500 shadow-xl"><Terminal size={24} /></div>
                      <div>
                         <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Command Log</h4>
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Registry Parameters</p>
                      </div>
                   </div>
                   <div className="space-y-6">
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                           <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mb-2"><CalendarRange size={12} /> Start Date</label>
                           <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-transparent font-black text-xs outline-none text-slate-900" />
                        </div>
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                           <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mb-2"><Hourglass size={12} /> Duration (Days)</label>
                           <input type="number" min="1" max="30" value={programDuration} onChange={(e) => setProgramDuration(parseInt(e.target.value))} className="w-full bg-transparent font-black text-xs outline-none text-slate-900" />
                        </div>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center justify-between mb-4">
                          <span className="flex items-center gap-2"><Clock size={12} /> Rest Interval</span>
                          <span className="text-blue-600 font-black italic">{minRestHours}H</span>
                        </label>
                        <input type="range" min="8" max="24" step="1" value={minRestHours} onChange={(e) => setMinRestHours(parseInt(e.target.value))} className="w-full accent-blue-600 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer" />
                     </div>
                   </div>
                   <button onClick={() => setShowConfirmDialog(true)} className="w-full py-8 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.4em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 group active:scale-95">
                     <Zap size={20} className="text-blue-500 group-hover:text-white" />
                     Run Ops Engine
                   </button>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={handleFlightAdd} onUpdate={handleFlightUpdate} onDelete={handleFlightDelete} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={handleStaffDelete} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} staff={staff} leaveRequests={leaveRequests} startDate={startDate} onAdd={handleShiftAdd} onUpdate={handleShiftUpdate} onDelete={handleShiftDelete} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} leaveRequests={leaveRequests} startDate={startDate} endDate={endDate} stationHealth={stationHealth} alerts={alerts} />}
      </main>

      <nav className={`xl:hidden fixed bottom-0 left-0 right-0 z-[150] bg-white/95 backdrop-blur-xl border-t border-slate-200 px-6 py-4 pb-safe flex justify-between items-center transition-transform duration-500 shadow-2xl ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
        {navigationTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
            <tab.icon size={22} />
            <span className="text-[7px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[90vh] overflow-hidden relative shadow-2xl">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-8 right-8 p-4 bg-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all z-20"><X size={24} /></button>
              <div className="h-full overflow-auto no-scrollbar"><ProgramScanner onDataExtracted={handleDataExtracted} startDate={startDate} initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-in fade-in">
           <div className="bg-white rounded-[3.5rem] p-12 md:p-16 text-center max-w-lg w-full shadow-2xl border border-slate-100">
              <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-sm"><Activity size={40} /></div>
              <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-none mb-4">Initialize Roster?</h3>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-10 leading-relaxed px-4">Engine will resolve flight coverage, specialist skill mapping, and fatigue constraints for the defined window.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 text-slate-400 font-black uppercase text-[10px] tracking-widest">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-5 bg-slate-950 text-white rounded-[1.8rem] font-black uppercase italic tracking-[0.3em] shadow-xl hover:bg-blue-600 transition-all text-xs">Run Logic</button>
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
