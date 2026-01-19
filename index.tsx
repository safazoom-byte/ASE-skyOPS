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
  Settings,
  Check,
  Calendar,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  ClipboardCheck
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { generateAIProgram, ShortageWarning, ResourceRecommendation } from './services/geminiService';

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');

  const [startDate, setStartDate] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.START_DATE);
    if (saved) return saved;
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.END_DATE);
    if (saved) return saved;
    const date = new Date();
    date.setDate(date.getDate() + 6);
    return date.toISOString().split('T')[0];
  });

  const [flights, setFlights] = useState<Flight[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FLIGHTS);
    try { const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  });
  
  const [staff, setStaff] = useState<Staff[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STAFF);
    try { const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  });

  const [shifts, setShifts] = useState<ShiftConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    try { const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  });

  const [programs, setPrograms] = useState<DailyProgram[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROGRAMS);
    try { const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  });

  const [recommendations, setRecommendations] = useState<ResourceRecommendation | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    try { return saved ? JSON.parse(saved) : null; } catch (e) { return null; }
  });

  const [customRules, setCustomRules] = useState<string>('');
  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '';
  });
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '';
  });

  const [minRestHours, setMinRestHours] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REST_HOURS);
    return saved ? parseInt(saved) : 12;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessChecklist, setShowSuccessChecklist] = useState(false);

  const [proposedPrograms, setProposedPrograms] = useState<DailyProgram[] | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageWarning[]>([]);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);

  const numDays = useMemo(() => {
    if (!startDate || !endDate) return 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 14); 
  }, [startDate, endDate]);

  const activeFlightsInRange = useMemo(() => {
    return flights.filter(f => f.date >= startDate && f.date <= endDate);
  }, [flights, startDate, endDate]);

  const activeShiftsInRange = useMemo(() => {
    return shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
  }, [shifts, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    localStorage.setItem(STORAGE_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recommendations));
    localStorage.setItem(STORAGE_KEYS.PREV_DUTY_LOG, previousDutyLog);
    localStorage.setItem(STORAGE_KEYS.PERSONNEL_REQUESTS, personnelRequests);
  }, [flights, staff, shifts, programs, startDate, endDate, minRestHours, recommendations, previousDutyLog, personnelRequests]);

  const handleStaffUpdate = (updatedStaff: Staff) => {
    if (!updatedStaff || !updatedStaff.name) return;
    setStaff(prev => {
      const prevList = Array.isArray(prev) ? prev : [];
      const idMatchIdx = updatedStaff.id ? prevList.findIndex(s => s.id === updatedStaff.id) : -1;
      const nameMatchIdx = prevList.findIndex(s => s.name.toLowerCase() === updatedStaff.name.toLowerCase());
      const initialsMatchIdx = (updatedStaff.initials && typeof updatedStaff.initials === 'string' && updatedStaff.initials.trim().length > 0) 
        ? prevList.findIndex(s => s.initials.toUpperCase() === updatedStaff.initials.toUpperCase()) 
        : -1;
      
      let targetIdx = idMatchIdx !== -1 ? idMatchIdx : nameMatchIdx;
      
      if (targetIdx === -1 && initialsMatchIdx !== -1) {
          if (prevList[initialsMatchIdx].name.toLowerCase() === updatedStaff.name.toLowerCase()) {
              targetIdx = initialsMatchIdx;
          }
      }

      if (targetIdx !== -1) {
        const existing = prevList[targetIdx];
        const merged = { 
          ...existing, 
          ...updatedStaff,
          id: existing.id,
          skillRatings: { 
            ...(existing.skillRatings || {}), 
            ...(updatedStaff.skillRatings || {}) 
          }
        };
        const newList = [...prevList];
        newList[targetIdx] = merged;
        return newList;
      }
      
      const finalStaff = {
        ...updatedStaff,
        id: updatedStaff.id || Math.random().toString(36).substring(2, 11),
        skillRatings: updatedStaff.skillRatings || {}
      };
      return [...prevList, finalStaff];
    });
  };

  const clearStaff = () => {
    setStaff([]);
  };

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => {
    if (!data) return;

    let importedType: 'flights' | 'staff' | 'shifts' | null = null;

    if (Array.isArray(data.staff) && data.staff.length > 0) {
      data.staff.forEach(s => s && handleStaffUpdate(s));
      importedType = 'staff';
    }

    if (Array.isArray(data.flights) && data.flights.length > 0) {
      setFlights(prev => {
        const updated = [...prev];
        data.flights.forEach(newF => {
          if (!newF || !newF.flightNumber) return;
          const idx = updated.findIndex(f => f.flightNumber === newF.flightNumber && f.date === newF.date);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...newF };
          } else {
            updated.push({ ...newF, id: newF.id || Math.random().toString(36).substr(2, 9) });
          }
        });
        return updated;
      });
      importedType = 'flights';
    }

    if (Array.isArray(data.shifts) && data.shifts.length > 0) {
      setShifts(prev => {
        const current = [...prev];
        data.shifts.forEach(sh => {
          if (!sh || !sh.pickupDate) return;
          const idx = current.findIndex(s => s.pickupDate === sh.pickupDate && s.pickupTime === sh.pickupTime);
          if (idx === -1) {
            current.push({ ...sh, id: sh.id || Math.random().toString(36).substr(2, 9) });
          } else {
            current[idx] = { ...current[idx], ...sh };
          }
        });
        return current;
      });
      importedType = 'shifts';
    }
    
    if (Array.isArray(data.programs) && data.programs.length > 0) {
      setPrograms(data.programs);
      setActiveTab('program');
    } else if (importedType) {
      setActiveTab(importedType);
    }
    
    setIsScannerOpen(false);
  };

  const openScannerWithTarget = (target: 'flights' | 'staff' | 'shifts' | 'all') => {
    setScannerTarget(target);
    setIsScannerOpen(true);
  };

  const handleBuildRequest = () => {
    setError(null);
    if (activeFlightsInRange.length === 0 && flights.length > 0) {
      setError(`The target window (${startDate}) shows no flights in its range. Please add flights for this period.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    } else if (flights.length === 0) {
      setError(`No flights registered. Build sequence halted.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmGenerateProgram = async () => {
    setShowConfirmDialog(false);
    setIsGenerating(true);
    setError(null);
    try {
      const constraintsContext = [
        `Previous Duty Log: ${previousDutyLog}`,
        `Personnel Absence & Requests: ${personnelRequests}`
      ].join(' | ');

      const result = await generateAIProgram(
        { 
          flights: activeFlightsInRange, 
          staff, 
          shifts: activeShiftsInRange, 
          programs: [] 
        },
        constraintsContext, 
        { numDays, customRules, minRestHours, startDate }
      );
      
      const safePrograms = Array.isArray(result.programs) ? result.programs : [];
      const safeShortage = Array.isArray(result.shortageReport) ? result.shortageReport : [];

      setProposedPrograms(safePrograms);
      setShortageReport(safeShortage);
      
      if (result.recommendations) {
        setRecommendations(result.recommendations);
      }

      if (safeShortage.length > 0) {
        setShowWaiverDialog(true);
      } else {
        setPrograms(safePrograms);
        setActiveTab('program');
        setShowSuccessChecklist(true);
      }
    } catch (e: any) {
      setError(e.message || "Engine failure during roster assembly.");
    } finally {
      setIsGenerating(false);
    }
  };

  const acceptProposedProgram = () => {
    if (proposedPrograms) {
      setPrograms(proposedPrograms);
      setProposedPrograms(null);
      setShowWaiverDialog(false);
      setActiveTab('program');
      setShowSuccessChecklist(true);
    }
  };

  const handleChatUpdate = (updatedPrograms: DailyProgram[]) => {
    if (Array.isArray(updatedPrograms)) {
      setPrograms(updatedPrograms);
      setActiveTab('program');
    }
  };

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  const checklistPoints = [
    { label: "Day 1 Rest Guard", desc: "Previous shift finish times analyzed and respected." },
    { label: "Absence Registry", desc: "All 'Off' dates from Absence Box have been strictly applied." },
    { label: "Local 5/2 Pattern", desc: "Local staff forced to minimum 2 days off per period." },
    { label: "Contract Validation", desc: "Verified Roster staff stay within contract date bounds." },
    { label: "Role Matrix", desc: "Shift Leaders and specialties correctly deployed." },
    { label: "Coverage Minimums", desc: "Shift strengths never fall below station requirements." }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100">
      <header className="sticky top-0 z-[100] bg-slate-950/80 backdrop-blur-2xl border-b border-white/5 py-6 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
           <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 group">
             <Plane className="text-white group-hover:rotate-45 transition-transform" size={24} />
           </div>
           <div>
              <h1 className="text-xl font-black italic text-white uppercase tracking-tighter leading-none">SkyOPS</h1>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mt-1">Operational Command Hub</span>
           </div>
        </div>

        <nav className="hidden md:flex items-center gap-2">
          {navigationTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all flex items-center gap-3 ${
                activeTab === tab.id ? 'bg-white/10 text-white shadow-xl shadow-black/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>

        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="md:hidden p-3 bg-white/5 text-white rounded-xl active:scale-95 transition-all"
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-3xl md:hidden flex flex-col p-12 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-between items-center mb-20">
            <div className="flex items-center gap-4">
              <Plane className="text-blue-500" size={32} />
              <h1 className="text-2xl font-black italic text-white uppercase tracking-tighter">SkyOPS</h1>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-4 bg-white/5 text-white rounded-2xl">
              <X size={24} />
            </button>
          </div>
          
          <nav className="flex flex-col gap-6">
            {navigationTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-6 text-left py-6 px-8 rounded-[2rem] transition-all ${
                  activeTab === tab.id ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/30' : 'text-slate-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon size={28} />
                <span className="text-2xl font-black uppercase italic tracking-tighter leading-none">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-12">
        {error && (
          <div className="mb-10 p-8 bg-rose-500/10 border border-rose-500/20 rounded-[3rem] flex items-center justify-between animate-in slide-in-from-top duration-500">
             <div className="flex items-center gap-6">
                <AlertCircle size={32} className="text-rose-500" />
                <div>
                   <h5 className="text-sm font-black text-white uppercase italic mb-1">Operational Error</h5>
                   <p className="text-xs text-rose-300 font-medium">{error}</p>
                </div>
             </div>
             <button onClick={() => setError(null)} className="p-3 text-rose-500 hover:text-white transition-colors">&times;</button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                         <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Activity size={20}/></div>
                            <TrendingUp size={16} className="text-emerald-500" />
                         </div>
                         <h4 className="text-3xl font-black italic text-slate-950">{activeFlightsInRange.length}</h4>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Flights In Window</p>
                      </div>
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                         <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Users size={20}/></div>
                            <ShieldCheck size={16} className="text-blue-500" />
                         </div>
                         <h4 className="text-3xl font-black italic text-slate-950">{staff.length}</h4>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Active Personnel</p>
                      </div>
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                         <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><Clock size={20}/></div>
                            <History size={16} className="text-amber-500" />
                         </div>
                         <h4 className="text-3xl font-black italic text-slate-950">{activeShiftsInRange.length}</h4>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Defined Shifts</p>
                      </div>
                   </div>

                   <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm space-y-10">
                      <div className="flex items-center justify-between">
                         <h3 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-4"><Zap className="text-blue-600" /> Sequence Parameters</h3>
                         <div className="px-4 py-2 bg-slate-950 text-white rounded-xl text-[8px] font-black uppercase tracking-widest">Model: Gemini 3 Pro</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={14} className="text-indigo-600" /> Operational Window</label>
                            <div className="flex gap-2">
                               <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-blue-600/5 transition-all" />
                               <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-blue-600/5 transition-all" />
                            </div>
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{numDays} Days sequence will be generated.</p>
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={14} className="text-blue-600" /> Rest Requirements</label>
                            <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border">
                               <input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                               <span className="font-black text-lg italic text-blue-600">{minRestHours}h</span>
                            </div>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Palmtree size={14} className="text-rose-500" /> Absence Box (NIL/OFF)</label>
                            <textarea 
                               className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-xs outline-none min-h-[140px] focus:ring-4 focus:ring-rose-500/5"
                               placeholder="List names and dates of staff on leave or requests... (e.g. JD OFF 12/05)"
                               value={personnelRequests}
                               onChange={e => setPersonnelRequests(e.target.value)}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-amber-500" /> Prev Day Duty Log</label>
                            <textarea 
                               className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-xs outline-none min-h-[140px] focus:ring-4 focus:ring-amber-500/5"
                               placeholder="Input previous finish times for rest guard analysis..."
                               value={previousDutyLog}
                               onChange={e => setPreviousDutyLog(e.target.value)}
                            />
                         </div>
                      </div>

                      <button 
                        onClick={handleBuildRequest}
                        disabled={isGenerating}
                        className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.4em] shadow-2xl shadow-blue-600/10 hover:bg-blue-600 transition-all flex items-center justify-center gap-6 group active:scale-95 disabled:opacity-50"
                      >
                         {isGenerating ? (
                           <div className="flex gap-1 items-center">
                              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
                              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.2s]"></div>
                              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.4s]"></div>
                              <span className="ml-4 tracking-[0.2em]">ENGAGING LOGIC ENGINE...</span>
                           </div>
                         ) : (
                           <>
                             <Sparkles className="group-hover:rotate-12 transition-transform" />
                             INITIATE BUILD SEQUENCE
                             <ChevronRight />
                           </>
                         )}
                      </button>
                   </div>
                </div>

                <div className="space-y-8">
                   <div className="bg-indigo-600 p-10 rounded-[3.5rem] text-white shadow-2xl shadow-indigo-600/20 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-10 -mt-10"></div>
                      <h4 className="text-xl font-black uppercase italic mb-6 flex items-center gap-3"><CheckCircle2 size={24} /> Status Report</h4>
                      <div className="space-y-4">
                         <div className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/5">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">System Core</span>
                            <span className="text-[9px] font-black uppercase text-emerald-300">Operational</span>
                         </div>
                         <div className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/5">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Personnel Sync</span>
                            <span className="text-[9px] font-black uppercase text-blue-300">{staff.length > 0 ? 'Verified' : 'Pending'}</span>
                         </div>
                         <div className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/5">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Flight Matrix</span>
                            <span className="text-[9px] font-black uppercase text-amber-300">{activeFlightsInRange.length > 0 ? 'Mapped' : 'Empty'}</span>
                         </div>
                      </div>
                   </div>

                   {recommendations && (
                     <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center justify-between">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resource Health</h4>
                           <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black italic">{recommendations.healthScore}%</div>
                        </div>
                        <div className="space-y-2">
                           <p className="text-sm font-black text-slate-900 italic">Ideal Headcount: {recommendations.idealStaffCount}</p>
                           <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{recommendations.hireAdvice}</p>
                        </div>
                        <div className="pt-4 border-t flex flex-wrap gap-2">
                           {recommendations.skillGaps.map(gap => (
                             <span key={gap} className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-black uppercase border border-rose-100">{gap} GAP</span>
                           ))}
                        </div>
                     </div>
                   )}

                   <div className="p-10 bg-slate-950 rounded-[3.5rem] text-white flex items-center gap-6 group hover:bg-blue-600 transition-all cursor-pointer" onClick={() => setActiveTab('program')}>
                      <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-white/20"><History /></div>
                      <div>
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white/60">Live Program</p>
                         <h5 className="text-xl font-black uppercase italic tracking-tighter">Review Roster</h5>
                      </div>
                      <ChevronRight className="ml-auto opacity-20 group-hover:opacity-100" />
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'flights' && (
          <FlightManager 
            flights={flights} 
            startDate={startDate} 
            endDate={endDate}
            onAdd={f => setFlights(prev => [...prev, f])}
            onUpdate={updated => setFlights(prev => prev.map(f => f.id === updated.id ? updated : f))}
            onDelete={id => setFlights(prev => prev.filter(f => f.id !== id))}
            onOpenScanner={() => openScannerWithTarget('flights')}
          />
        )}

        {activeTab === 'staff' && (
          <StaffManager 
            staff={staff} 
            onUpdate={handleStaffUpdate} 
            onDelete={id => setStaff(prev => prev.filter(s => s.id !== id))}
            onClearAll={clearStaff}
            defaultMaxShifts={5}
            onOpenScanner={() => openScannerWithTarget('staff')}
          />
        )}

        {activeTab === 'shifts' && (
          <ShiftManager 
            shifts={shifts}
            flights={flights}
            startDate={startDate}
            onAdd={s => setShifts(prev => [...prev, s])}
            onUpdate={updated => setShifts(prev => prev.map(s => s.id === updated.id ? updated : s))}
            onDelete={id => setShifts(prev => prev.filter(s => s.id !== id))}
            onOpenScanner={() => openScannerWithTarget('shifts')}
          />
        )}

        {activeTab === 'program' && (
          <ProgramDisplay 
            programs={programs} 
            flights={flights} 
            staff={staff} 
            shifts={shifts}
            startDate={startDate}
            endDate={endDate}
            onUpdatePrograms={setPrograms}
            aiRecommendations={recommendations}
          />
        )}
      </main>

      <footer className="mt-auto py-12 px-8 border-t border-slate-100 bg-white text-center">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">HMB SkyOPS Operational Command Hub &copy; 2025</p>
      </footer>

      {/* Program AI Chatbot */}
      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={handleChatUpdate} />

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-lg w-full p-12 text-center animate-in zoom-in-95 duration-300">
              <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-blue-100 shadow-inner">
                <Target size={48} />
              </div>
              <h3 className="text-3xl font-black italic uppercase mb-4 text-slate-950 tracking-tighter">Engage Roster Logic?</h3>
              <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed">The AI Engine will now analyze {activeFlightsInRange.length} flights against {staff.length} personnel to build a valid sequence. Existing programs in this range will be overwritten.</p>
              <div className="flex gap-4">
                 <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 tracking-widest italic">Abort</button>
                 <button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all active:scale-95">CONFIRM MISSION</button>
              </div>
           </div>
        </div>
      )}

      {/* Success Checklist Modal */}
      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full overflow-hidden animate-in slide-in-from-bottom duration-500">
              <div className="bg-slate-950 p-12 text-center border-b border-white/10">
                 <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                    <Check size={40} strokeWidth={3} />
                 </div>
                 <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Sequence Assembled</h3>
                 <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.4em] mt-3">Verified Operational Pattern Live</p>
              </div>
              <div className="p-12 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {checklistPoints.map((point, i) => (
                      <div key={i} className="flex gap-4 p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                         <div className="shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center"><Check size={14} strokeWidth={3}/></div>
                         <div>
                            <p className="text-[10px] font-black uppercase text-slate-900 leading-tight mb-1">{point.label}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed">{point.desc}</p>
                         </div>
                      </div>
                    ))}
                 </div>
                 <button onClick={() => setShowSuccessChecklist(false)} className="w-full py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4">
                    ENTER LIVE PROGRAM <ArrowRight size={18}/>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Waiver / Shortage Dialog */}
      {showWaiverDialog && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-2xl">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full p-12 animate-in slide-in-from-top duration-500">
              <div className="flex items-center gap-6 mb-10">
                 <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-[1.5rem] flex items-center justify-center shrink-0 border border-amber-100">
                   <AlertCircle size={32} />
                 </div>
                 <div>
                   <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Resource Shortage Warning</h3>
                   <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">Operational Violations Detected</p>
                 </div>
              </div>
              <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-200 space-y-4 max-h-[300px] overflow-y-auto no-scrollbar mb-10">
                 {shortageReport.map((sh, idx) => (
                   <div key={idx} className="flex items-start gap-4 pb-4 border-b border-slate-200 last:border-0">
                      <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0"></div>
                      <p className="text-xs font-medium text-slate-600">
                        <span className="font-black text-slate-900 uppercase">{sh.staffName}</span> rest period restricted to <span className="font-black text-rose-500">{sh.actualRest}h</span> (Target: {sh.targetRest}h) on Flight {sh.flightNumber}. {sh.reason}
                      </p>
                   </div>
                 ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                 <button onClick={() => { setProposedPrograms(null); setShowWaiverDialog(false); }} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Decline & Refine</button>
                 <button onClick={acceptProposedProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-amber-600 transition-all flex items-center justify-center gap-4">
                   <ClipboardCheck size={20}/> AUTHORIZE WAIVER & APPLY
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Global Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 lg:p-12 bg-slate-950/95 backdrop-blur-3xl">
           <div className="bg-white rounded-[4.5rem] shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-500">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-10 z-[1600] p-4 bg-slate-100 text-slate-400 hover:bg-slate-950 hover:text-white rounded-2xl transition-all">
                <X size={24}/>
              </button>
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <ProgramScanner 
                  onDataExtracted={handleDataExtracted} 
                  startDate={startDate} 
                  initialTarget={scannerTarget === 'all' ? undefined : scannerTarget}
                />
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
