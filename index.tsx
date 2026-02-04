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
  DownloadCloud
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

  // Effect to sync endDate based on duration
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
  const [quickLeaveFeedback, setQuickLeaveFeedback] = useState<string | null>(null);

  // Incoming Duty Inputs
  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<string[]>([]);
  const [incomingEndTime, setIncomingEndTime] = useState('06:00');
  const [incomingDate, setIncomingDate] = useState(startDate);
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
    const d = new Date(startDate);
    d.setDate(d.getDate() - 1);
    setIncomingDate(d.toISOString().split('T')[0]);
  }, [startDate]);

  useEffect(() => {
    let mounted = true;

    const timeoutId = setTimeout(() => {
      if (mounted && isInitializing) setIsInitializing(false);
    }, 2000);

    const checkAuth = async () => {
      if (!supabase) {
        if (mounted) setIsInitializing(false);
        return;
      }
      try {
        const s = await auth.getSession();
        if (mounted) {
          setSession(s);
          setIsInitializing(false);
          clearTimeout(timeoutId);
        }
      } catch (e) {
        if (mounted) setIsInitializing(false);
      }
    };
    checkAuth();

    const unsubscribe = auth.onAuthStateChange((s) => {
      if (mounted) setSession(s);
    });

    return () => { 
      mounted = false; 
      unsubscribe(); 
      clearTimeout(timeoutId);
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
    setQuickLeaveFeedback(null);
    if (!quickLeaveStaffId || !quickLeaveDate) return;

    const targetStaff = staff.find(s => s.id === quickLeaveStaffId);
    
    if (!targetStaff) {
      setQuickLeaveFeedback(`Error: Staff not found.`);
      return;
    }

    const newReq: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      staffId: targetStaff.id,
      startDate: quickLeaveDate,
      endDate: quickLeaveDate, // Single day by default for quick log
      type: quickLeaveType
    };

    setLeaveRequests(prev => [...prev, newReq]);
    setQuickLeaveStaffId('');
    setQuickLeaveFeedback(`Logged: ${targetStaff.initials} - ${quickLeaveType} on ${quickLeaveDate}`);
    setTimeout(() => setQuickLeaveFeedback(null), 3000);
  };

  const handleForceUpdate = async () => {
    if (!confirm("This will delete old files and force a fresh update. Your data (Flights, Staff, Shifts) will persist. Continue?")) return;
    
    // 1. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    
    // 2. Clear Caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    
    // 3. Force Reload
    window.location.reload();
  };

  // Incoming Duty Handlers
  const toggleIncomingStaff = (id: string) => {
    setIncomingSelectedStaffIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addIncomingDuties = () => {
    if (incomingSelectedStaffIds.length === 0 || !incomingEndTime || !incomingDate) return;
    
    const newDuties: IncomingDuty[] = incomingSelectedStaffIds.map(sid => ({
      id: Math.random().toString(36).substr(2, 9),
      staffId: sid,
      date: incomingDate,
      shiftEndTime: incomingEndTime
    }));

    // Filter out existing entries for these staff to avoid duplicates
    const filteredCurrent = incomingDuties.filter(d => !incomingSelectedStaffIds.includes(d.staffId));
    
    setIncomingDuties([...filteredCurrent, ...newDuties]);
    setIncomingSelectedStaffIds([]);
    setIncomingEndTime('06:00');
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
    
    // Check if it's "today" (relative to startDate) or later
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

  const handleLeaveUpdate = async (req: LeaveRequest) => { setLeaveRequests(p => [...p.filter(r => r.id !== req.id), req]); };
  const handleLeaveDelete = async (id: string) => { setLeaveRequests(p => p.filter(r => r.id !== id)); };

  const handleDataExtracted = async (data: any) => {
    if (data.flights?.length) { setFlights(p => [...p, ...data.flights]); if (supabase) for (const f of data.flights) await db.upsertFlight(f); }
    if (data.staff?.length) { setStaff(p => [...p, ...data.staff]); if (supabase) for (const s of data.staff) await db.upsertStaff(s); }
    if (data.shifts?.length) { setShifts(p => [...p, ...data.shifts]); if (supabase) for (const s of data.shifts) await db.upsertShift(s); }
    setIsScannerOpen(false);
  };

  const activeLeaveRequests = useMemo(() => {
    // Show only future or recent requests
    return leaveRequests
      .filter(l => l.startDate >= startDate)
      .sort((a,b) => {
        if (a.startDate < b.startDate) return -1;
        if (a.startDate > b.startDate) return 1;
        return 0;
      });
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
      {/* HEADER: Light Theme (White with border) */}
      <header className={`sticky top-0 z-[100] bg-white/90 backdrop-blur-xl border-b border-slate-200/60 py-4 px-4 md:px-8 flex items-center justify-between transition-transform duration-500 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20"><Compass className="text-white" size={20} /></div>
           <div>
             {/* Text updated to Slate-900 (Black) */}
             <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase tracking-tighter leading-none">SkyOPS <span className="text-blue-600 font-light">Station</span></h1>
             <div className="flex items-center gap-2 mt-1">
               <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
               {/* Text updated to Slate-500 */}
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{session?.user?.email || 'Local Terminal'} (v10.5 Fix)</span>
               <button onClick={handleForceUpdate} title="Force Update / Reset" className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors">
                 <RefreshCw size={10} />
               </button>
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
             <div className="relative mb-12">
               <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center"><Zap size={32} className="text-blue-500 animate-pulse" /></div>
             </div>
             <h3 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter mb-4">Computing Operational Program</h3>
             <div className="space-y-2">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Running Fatigue Heuristics...</p>
             </div>
          </div>
        )}

        {error && (
          <div className="mb-8 p-6 bg-rose-50 border border-rose-100 text-rose-600 rounded-3xl flex justify-between items-center animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <ShieldAlert size={20} />
              <span className="text-[10px] font-black uppercase tracking-widest">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-white rounded-full transition-colors">&times;</button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             {/* STATS CARDS ROW */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Active Air Traffic */}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-48 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-blue-100"></div>
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 relative z-10">
                       <Plane size={24} />
                    </div>
                    <div className="relative z-10">
                       <h2 className="text-5xl font-black italic text-slate-900 tracking-tighter mb-2">{flights.length}</h2>
                       <div className="flex items-center gap-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Air Traffic</p>
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                       </div>
                    </div>
                 </div>

                 {/* Available Manpower */}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-48 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-100"></div>
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 relative z-10">
                       <Users size={24} />
                    </div>
                    <div className="relative z-10">
                       <h2 className="text-5xl font-black italic text-slate-900 tracking-tighter mb-2">{staff.length}</h2>
                       <div className="flex items-center gap-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Manpower</p>
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                       </div>
                    </div>
                 </div>

                 {/* Duty Assignments */}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-48 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-amber-100"></div>
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 relative z-10">
                       <Clock size={24} />
                    </div>
                    <div className="relative z-10">
                       <h2 className="text-5xl font-black italic text-slate-900 tracking-tighter mb-2">{shifts.length}</h2>
                       <div className="flex items-center gap-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Duty Assignments</p>
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                       </div>
                    </div>
                 </div>
             </div>

             {/* ACTIONS TOOLBAR */}
             <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
                 <div className="flex items-center gap-4 px-2">
                     <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-900 border border-slate-100"><Wind size={18}/></div>
                     <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">System Controls</p>
                        <p className="text-xs font-black text-slate-900">Operational Actions</p>
                     </div>
                 </div>
                 <div className="flex gap-3 w-full sm:w-auto">
                     <button onClick={seedMockData} className="flex-1 sm:flex-none px-6 py-3 bg-white text-slate-600 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-50 transition-all border border-slate-200 shadow-sm">
                       <Database size={14} /> Sample Ops
                     </button>
                     <button onClick={() => setIsScannerOpen(true)} className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20">
                       <Sparkles size={14} /> AI Importer
                     </button>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEAVE MANAGEMENT */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                     <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 shadow-sm">
                          <Briefcase size={20} />
                        </div>
                        <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Leave Management</h4>
                     </div>
                     
                     <form onSubmit={handleQuickLeaveSubmit} className="flex flex-col sm:flex-row gap-3 mb-8 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <select 
                          className="w-full sm:w-40 px-5 py-3 bg-white rounded-xl font-black text-xs uppercase text-slate-900 outline-none shadow-sm focus:ring-2 focus:ring-amber-500/20"
                          value={quickLeaveStaffId}
                          onChange={e => setQuickLeaveStaffId(e.target.value)}
                        >
                           <option value="">Select Staff...</option>
                           {staff.map(s => (
                             <option key={s.id} value={s.id}>{s.initials} - {s.name}</option>
                           ))}
                        </select>
                        
                        <input 
                          type="date"
                          className="w-full flex-1 px-5 py-3 bg-white rounded-xl font-bold text-xs text-slate-900 outline-none shadow-sm focus:ring-2 focus:ring-amber-500/20"
                          value={quickLeaveDate}
                          onChange={e => setQuickLeaveDate(e.target.value)}
                        />

                        <select
                           className="w-full sm:w-32 px-5 py-3 bg-white rounded-xl font-black text-xs uppercase text-slate-900 outline-none shadow-sm focus:ring-2 focus:ring-amber-500/20"
                           value={quickLeaveType}
                           onChange={e => setQuickLeaveType(e.target.value as LeaveType)}
                        >
                           <option value="DAY OFF">Day Off</option>
                           <option value="ANNUAL LEAVE">Annual Leave</option>
                        </select>

                        <button type="submit" className="w-full sm:w-auto px-6 py-3 bg-slate-950 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-amber-500 transition-all flex items-center justify-center gap-2">
                          <Plus size={14} /> Assign
                        </button>
                     </form>

                     {quickLeaveFeedback && (
                        <div className={`mb-6 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-in slide-in-from-top-2 ${quickLeaveFeedback.includes('Error') ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {quickLeaveFeedback.includes('Error') ? <ShieldAlert size={14}/> : <Target size={14}/>}
                          {quickLeaveFeedback}
                        </div>
                     )}

                     <div className="space-y-4">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2"><CalendarX size={12}/> Active Leave Registry</p>
                        
                        {activeLeaveRequests.length === 0 ? (
                          <div className="w-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] text-[10px] font-black text-slate-300 uppercase italic">
                             No Restrictions Active. Full Availability.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {activeLeaveRequests.map(req => {
                              const s = staff.find(st => st.id === req.staffId);
                              const isOff = req.type === 'DAY OFF';
                              return (
                                <div key={req.id} className={`p-4 border rounded-3xl flex items-center justify-between group transition-all ${isOff ? 'bg-slate-50 border-slate-100' : 'bg-amber-50 border-amber-100'}`}>
                                   <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm border ${isOff ? 'bg-white text-slate-900 border-slate-200' : 'bg-white text-amber-600 border-amber-200'}`}>{s?.initials || '?'}</div>
                                      <div>
                                         <p className="text-[10px] font-black uppercase text-slate-900 leading-tight">{s?.name || 'Unknown'}</p>
                                         <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">{req.startDate}</span>
                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${isOff ? 'bg-slate-200 text-slate-500' : 'bg-amber-200 text-amber-700'}`}>{isOff ? 'OFF' : 'LEAVE'}</span>
                                         </div>
                                      </div>
                                   </div>
                                   <button onClick={() => handleLeaveDelete(req.id)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                     </div>
                  </div>

                  {/* INCOMING DUTY / FATIGUE LOCK */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative z-20"> {/* z-20 for dropdown */}
                      <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100">
                              <Moon size={20} />
                          </div>
                          <div>
                               <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter">Previous 1st Day Shifts</h4>
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Fatigue Safety Lock</p>
                          </div>
                      </div>

                      {/* Form Container */}
                      <div className="flex flex-col xl:flex-row gap-3 mb-8 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          
                          {/* Multi-Select Staff Input */}
                          <div className="flex-1 relative group z-30"> {/* z-30 for dropdown */}
                              <div className={`w-full min-h-[52px] px-4 py-2 bg-white rounded-xl border flex flex-wrap items-center gap-2 transition-all ${incomingSearchFocus ? 'border-amber-400 ring-2 ring-amber-500/20' : 'border-slate-200'}`}>
                                  <Search size={14} className="text-slate-300 mr-1" />
                                  {incomingSelectedStaffIds.map(id => {
                                      const s = staff.find(st => st.id === id);
                                      return (
                                          <span key={id} className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 animate-in zoom-in-50">
                                              {s?.initials}
                                              <button onClick={(e) => { e.stopPropagation(); toggleIncomingStaff(id); }} className="hover:text-amber-900"><X size={10}/></button>
                                          </span>
                                      );
                                  })}
                                  <input 
                                      type="text" 
                                      className="flex-1 bg-transparent text-xs font-bold text-slate-900 outline-none min-w-[120px] h-full py-2 placeholder:text-slate-400 placeholder:font-normal"
                                      placeholder={incomingSelectedStaffIds.length > 0 ? "" : "Search Staff..."}
                                      value={incomingSearchTerm}
                                      onChange={e => setIncomingSearchTerm(e.target.value)}
                                      onFocus={() => setIncomingSearchFocus(true)}
                                      // Delay blur so click on dropdown works
                                      onBlur={() => setTimeout(() => setIncomingSearchFocus(false), 200)}
                                  />
                              </div>

                              {/* Dropdown Results */}
                              {incomingSearchFocus && (
                                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-60 overflow-y-auto no-scrollbar p-1 animate-in fade-in slide-in-from-top-2">
                                      {filteredStaff.length > 0 ? filteredStaff.map(s => {
                                          const isSelected = incomingSelectedStaffIds.includes(s.id);
                                          return (
                                              <button 
                                                  key={s.id}
                                                  onMouseDown={(e) => { e.preventDefault(); toggleIncomingStaff(s.id); setIncomingSearchTerm(''); }}
                                                  className={`w-full text-left p-2.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-between transition-all ${isSelected ? 'bg-amber-50 text-amber-600' : 'text-slate-600 hover:bg-slate-50'}`}
                                              >
                                                  <span className="flex items-center gap-2">
                                                     <span className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-[9px]">{s.initials}</span>
                                                     {s.name}
                                                  </span>
                                                  {isSelected && <Check size={12} />}
                                              </button>
                                          );
                                      }) : (
                                          <div className="p-4 text-center text-[9px] font-black text-slate-300 italic">No staff found matching "{incomingSearchTerm}"</div>
                                      )}
                                  </div>
                              )}
                          </div>

                          <div className="flex gap-3">
                               {/* Date Input */}
                               <div className="relative">
                                   <input 
                                      type="date"
                                      className="h-[52px] pl-4 pr-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/20"
                                      value={incomingDate}
                                      onChange={e => setIncomingDate(e.target.value)}
                                   />
                               </div>

                               {/* Time Input */}
                               <div className="relative w-28">
                                  <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input 
                                      type="text" 
                                      placeholder="06:00"
                                      className="w-full h-[52px] pl-9 pr-3 bg-white border border-slate-200 rounded-xl font-black text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/20"
                                      value={incomingEndTime}
                                      onChange={e => setIncomingEndTime(e.target.value)}
                                  />
                               </div>

                               {/* Add Button */}
                               <button 
                                   onClick={addIncomingDuties}
                                   disabled={incomingSelectedStaffIds.length === 0}
                                   className="h-[52px] px-8 bg-slate-950 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-amber-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-slate-950/20"
                               >
                                   <Lock size={14} /> <span className="hidden sm:inline">Lock</span>
                               </button>
                          </div>
                      </div>

                      {/* Active Locks List */}
                      <div className="space-y-4">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2"><ShieldAlert size={12} className="text-amber-500"/> Active Safety Locks</p>
                          
                          {incomingDuties.length === 0 ? (
                              <div className="w-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] text-[10px] font-black text-slate-300 uppercase italic">
                                  System Clear. No Fatigue Restrictions.
                              </div>
                          ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                  {incomingDuties.map(d => {
                                      const s = staff.find(st => st.id === d.staffId);
                                      const restUntil = calculateRestUntil(d.date, d.shiftEndTime);
                                      return (
                                          <div key={d.id} className="p-4 border border-amber-100 bg-amber-50/50 rounded-3xl flex items-center justify-between group transition-all hover:bg-amber-50">
                                              <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-white border border-amber-200 rounded-2xl flex items-center justify-center font-black text-sm text-amber-600 shadow-sm">{s?.initials || '?'}</div>
                                                  <div>
                                                      <p className="text-[10px] font-black uppercase text-slate-900 leading-tight">{s?.name || 'Unknown'}</p>
                                                      <div className="flex items-center gap-2 mt-0.5">
                                                          <span className="text-[8px] font-bold text-amber-600/70 uppercase">Rest Until {restUntil}</span>
                                                      </div>
                                                  </div>
                                              </div>
                                              <button onClick={() => removeIncomingDuty(d.id)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-amber-100 text-slate-300 hover:text-rose-500 hover:border-rose-200 transition-all"><Trash2 size={14}/></button>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                   <h4 className="text-xs font-black uppercase italic tracking-widest text-slate-900 flex items-center gap-3"><Terminal size={14} className="text-blue-600" /> Command Log</h4>
                   
                   <div className="space-y-4">
                     {/* Index Boxes: Date Range & Duration */}
                     <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                           <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1 mb-2"><CalendarRange size={10} /> Program Start</label>
                           <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-transparent font-bold text-xs outline-none text-slate-900" />
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                           <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1 mb-2"><Hourglass size={10} /> Duration (Days)</label>
                           <input type="number" min="1" max="30" value={programDuration} onChange={(e) => setProgramDuration(parseInt(e.target.value))} className="w-full bg-transparent font-bold text-xs outline-none text-slate-900" />
                        </div>
                     </div>

                     {/* Rest Horus Indicator (Rest Hours) */}
                     <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center justify-between mb-2">
                          <span className="flex items-center gap-1"><Clock size={10} /> Min Rest Interval</span>
                          <span className="text-blue-600">{minRestHours} Hours</span>
                        </label>
                        <input 
                           type="range" 
                           min="8" max="24" step="1" 
                           value={minRestHours} 
                           onChange={(e) => setMinRestHours(parseInt(e.target.value))}
                           className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                     </div>
                   </div>

                   <button 
                     onClick={() => setShowConfirmDialog(true)}
                     className="w-full py-6 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 group"
                   >
                     <Zap size={18} className="text-blue-500 group-hover:text-white" />
                     Engage Ops Engine
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

      {/* MOBILE NAV: Light Theme (White) */}
      <nav className={`xl:hidden fixed bottom-0 left-0 right-0 z-[150] bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 py-2 pb-safe flex justify-between items-center transition-transform duration-500 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
        {navigationTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}`}>
            <tab.icon size={20} />
            <span className="text-[8px] font-black uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </nav>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] overflow-hidden relative shadow-2xl">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-6 right-6 p-4 bg-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all z-20"><X size={24} /></button>
              <div className="h-full overflow-auto no-scrollbar"><ProgramScanner onDataExtracted={handleDataExtracted} startDate={startDate} initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="bg-white rounded-[3.5rem] p-10 md:p-16 text-center max-w-lg w-full shadow-2xl">
              <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-none mb-4">Run Ops Engine?</h3>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-10 text-center px-4 leading-relaxed">The AI will analyze current flight registry, personnel availability, and specialist skills to produce a safe and efficient week plan.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-5 bg-slate-950 text-white rounded-3xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-xs">ENGAGE OPS</button>
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