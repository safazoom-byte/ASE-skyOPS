
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
  Calendar
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
    try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });
  
  const [staff, setStaff] = useState<Staff[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STAFF);
    try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });

  const [shifts, setShifts] = useState<ShiftConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });

  const [programs, setPrograms] = useState<DailyProgram[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROGRAMS);
    try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
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
    setStaff(prev => {
      const idMatchIdx = updatedStaff.id ? prev.findIndex(s => s.id === updatedStaff.id) : -1;
      const nameMatchIdx = prev.findIndex(s => s.name.toLowerCase() === updatedStaff.name.toLowerCase());
      const initialsMatchIdx = (updatedStaff.initials && updatedStaff.initials.trim().length > 0) 
        ? prev.findIndex(s => s.initials.toUpperCase() === updatedStaff.initials.toUpperCase()) 
        : -1;
      
      let targetIdx = idMatchIdx !== -1 ? idMatchIdx : nameMatchIdx;
      
      if (targetIdx === -1 && initialsMatchIdx !== -1) {
          if (prev[initialsMatchIdx].name.toLowerCase() === updatedStaff.name.toLowerCase()) {
              targetIdx = initialsMatchIdx;
          }
      }

      if (targetIdx !== -1) {
        const existing = prev[targetIdx];
        const merged = { 
          ...existing, 
          ...updatedStaff,
          id: existing.id,
          skillRatings: { ...existing.skillRatings, ...updatedStaff.skillRatings }
        };
        const newList = [...prev];
        newList[targetIdx] = merged;
        return newList;
      }
      
      const finalStaff = {
        ...updatedStaff,
        id: updatedStaff.id || Math.random().toString(36).substring(2, 11)
      };
      return [...prev, finalStaff];
    });
  };

  const clearStaff = () => {
    setStaff([]);
  };

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => {
    if (data.staff && data.staff.length > 0) {
      data.staff.forEach(s => handleStaffUpdate(s));
    }

    if (data.flights && data.flights.length > 0) {
      setFlights(prev => {
        const updated = [...prev];
        data.flights.forEach(newF => {
          const idx = updated.findIndex(f => f.flightNumber === newF.flightNumber && f.date === newF.date);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...newF };
          } else {
            updated.push({ ...newF, id: newF.id || Math.random().toString(36).substr(2, 9) });
          }
        });
        return updated;
      });
    }

    if (data.shifts && data.shifts.length > 0) {
      setShifts(prev => {
        const current = [...prev];
        data.shifts.forEach(sh => {
          const idx = current.findIndex(s => s.pickupDate === sh.pickupDate && s.pickupTime === sh.pickupTime);
          if (idx === -1) {
            current.push({ ...sh, id: sh.id || Math.random().toString(36).substr(2, 9) });
          } else {
            current[idx] = { ...current[idx], ...sh };
          }
        });
        return current;
      });
    }
    
    if (data.programs && data.programs.length > 0) {
      setPrograms(data.programs);
      setActiveTab('program');
    }
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
      
      setProposedPrograms(result.programs);
      setShortageReport(result.shortageReport);
      
      if (result.recommendations) {
        setRecommendations(result.recommendations);
      }

      if (result.shortageReport.length > 0) {
        setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs);
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
    setPrograms(updatedPrograms);
    setActiveTab('program');
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
          
          <div className="mt-auto pt-12 border-t border-white/5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] text-center">Operational Command Hub v3.1</p>
          </div>
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
                   <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] pointer-events-none transition-all duration-1000 group-hover:bg-indigo-500/10"></div>
                      <h2 className="text-4xl font-black italic text-slate-950 uppercase tracking-tighter leading-none mb-4">Command Dashboard</h2>
                      <p className="text-slate-400 text-sm font-medium italic mb-12">Targeting window: <span className="text-slate-900 font-black">{startDate} — {endDate}</span></p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-blue-200 transition-all">
                           <Activity className="text-blue-500 mb-3" size={20} />
                           <p className="text-3xl font-black text-slate-900 italic leading-none mb-1">{activeFlightsInRange.length}</p>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Flights</p>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-emerald-200 transition-all">
                           <Users className="text-emerald-500 mb-3" size={20} />
                           <p className="text-3xl font-black text-slate-900 italic leading-none mb-1">{staff.length}</p>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Station Agents</p>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-amber-200 transition-all">
                           <Clock className="text-amber-500 mb-3" size={20} />
                           <p className="text-3xl font-black text-slate-900 italic leading-none mb-1">{activeShiftsInRange.length}</p>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekly Shifts</p>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-indigo-200 transition-all">
                           <ShieldCheck className="text-indigo-500 mb-3" size={20} />
                           <p className="text-3xl font-black text-slate-900 italic leading-none mb-1">{recommendations?.healthScore || 0}%</p>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Health Score</p>
                        </div>
                      </div>
                   </div>

                   <ProgramScanner onDataExtracted={handleDataExtracted} startDate={startDate} numDays={numDays} />
                </div>

                <div className="bg-slate-950 rounded-[4rem] p-12 text-white shadow-2xl relative overflow-hidden flex flex-col">
                   <div className="absolute inset-0 bg-blue-600/5 mix-blend-overlay"></div>
                   <div className="relative z-10 flex-1">
                      <div className="flex items-center gap-4 mb-10">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                          <TrendingUp size={24} className="text-blue-400" />
                        </div>
                        <h4 className="text-xl font-black italic uppercase tracking-tighter">Operational Build</h4>
                      </div>

                      <div className="space-y-10 mb-12">
                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-1">Date Window</label>
                           <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                               <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 opacity-60">Start</label>
                               <div 
                                 onClick={() => (document.getElementById('start-date-picker') as any)?.showPicker?.()}
                                 className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/10 transition-all group"
                               >
                                 <span className="text-[11px] font-black text-white">{startDate}</span>
                                 <Calendar size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                                 <input 
                                   id="start-date-picker"
                                   type="date" 
                                   className="sr-only" 
                                   value={startDate} 
                                   onChange={e => setStartDate(e.target.value)} 
                                 />
                               </div>
                             </div>
                             <div className="space-y-2">
                               <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 opacity-60">End</label>
                               <div 
                                 onClick={() => (document.getElementById('end-date-picker') as any)?.showPicker?.()}
                                 className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/10 transition-all group"
                               >
                                 <span className="text-[11px] font-black text-white">{endDate}</span>
                                 <Calendar size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                                 <input 
                                   id="end-date-picker"
                                   type="date" 
                                   className="sr-only" 
                                   value={endDate} 
                                   min={startDate}
                                   onChange={e => setEndDate(e.target.value)} 
                                 />
                               </div>
                             </div>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-1">Rest Constraint (Hrs)</label>
                           <input type="number" min="8" max="24" className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-2xl font-black italic outline-none focus:border-blue-500 transition-all" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value) || 12)} />
                        </div>
                      </div>
                   </div>

                   <button 
                      onClick={handleBuildRequest}
                      disabled={isGenerating}
                      className="relative z-10 w-full py-8 bg-blue-600 hover:bg-blue-500 text-white rounded-[2.5rem] font-black text-sm uppercase italic tracking-[0.3em] shadow-2xl shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-4"
                   >
                     {isGenerating ? (
                       <div className="flex gap-2 items-center">
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.4s]"></div>
                       </div>
                     ) : (
                       <>GENERATE WEEKLY PROGRAM <ChevronRight size={18} /></>
                     )}
                   </button>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'flights' && (
          <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={f => setFlights([...flights, f])} onUpdate={f => setFlights(flights.map(fl => fl.id === f.id ? f : fl))} onDelete={id => setFlights(flights.filter(f => f.id !== id))} />
        )}

        {activeTab === 'staff' && (
          <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={id => setStaff(staff.filter(s => s.id !== id))} onClearAll={clearStaff} defaultMaxShifts={5} programStartDate={startDate} programEndDate={endDate} />
        )}

        {activeTab === 'shifts' && (
          <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={s => setShifts([...shifts, s])} onUpdate={s => setShifts(shifts.map(sh => sh.id === s.id ? s : sh))} onDelete={id => setShifts(shifts.filter(s => s.id !== id))} />
        )}

        {activeTab === 'program' && (
          <div className="relative">
            <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} aiRecommendations={recommendations} />
            <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={handleChatUpdate} />
          </div>
        )}
      </main>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-300">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full p-12 lg:p-16 border border-white/10">
              <div className="flex items-center gap-6 mb-12">
                <div className="w-16 h-16 bg-slate-950 rounded-3xl flex items-center justify-center">
                  <Settings className="text-white" size={32} />
                </div>
                <div>
                  <h4 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter leading-none mb-1">Operational Constraints</h4>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Define station variables</p>
                </div>
              </div>

              <div className="space-y-10 mb-12">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 ml-1">
                      <History size={16} className="text-blue-500" /> Previous Duty Log (Finish Times)
                    </label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-200 p-6 rounded-[2rem] font-bold text-xs outline-none focus:ring-8 focus:ring-blue-500/5 transition-all min-h-[100px]" 
                      placeholder="e.g. MZ finished 02:00, AH finished 23:00..."
                      value={previousDutyLog}
                      onChange={e => setPreviousDutyLog(e.target.value)}
                    />
                 </div>

                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 ml-1">
                      <Palmtree size={16} className="text-emerald-500" /> Personnel Absence & Requests
                    </label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-200 p-6 rounded-[2rem] font-bold text-xs outline-none focus:ring-8 focus:ring-emerald-500/5 transition-all min-h-[140px]" 
                      placeholder="e.g. MZ Off 12May, AH Annual Leave 13-15May, JS Sick 14May..."
                      value={personnelRequests}
                      onChange={e => setPersonnelRequests(e.target.value)}
                    />
                 </div>

                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 ml-1">
                      <ShieldCheck size={16} className="text-indigo-500" /> Custom Deployment Rules
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-200 p-6 rounded-3xl font-bold text-xs outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all" 
                      placeholder="e.g. Always pair MZ with a Senior agent..."
                      value={customRules}
                      onChange={e => setCustomRules(e.target.value)}
                    />
                 </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                 <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-6 text-xs font-black uppercase text-slate-400 tracking-widest italic">Discard</button>
                 <button 
                  onClick={confirmGenerateProgram} 
                  className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all active:scale-95"
                 >
                   GENERATE PROGRAM
                 </button>
              </div>
           </div>
        </div>
      )}

      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-3xl animate-in zoom-in-95 duration-500">
           <div className="bg-white rounded-[5rem] shadow-2xl max-w-2xl w-full p-16 border border-white/10 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/5 blur-[80px] pointer-events-none"></div>
              
              <div className="w-24 h-24 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-emerald-100">
                 <CheckCircle2 size={56} className="text-emerald-500" />
              </div>
              
              <div className="text-center mb-10">
                <h3 className="text-4xl font-black italic uppercase text-slate-950 tracking-tighter mb-2 leading-none">Logic Verified</h3>
                <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Aviation Standards Checksum: PASS</p>
              </div>

              <div className="space-y-4 mb-12">
                 {checklistPoints.map((point, i) => (
                   <div key={i} className="flex items-center gap-6 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] group hover:bg-emerald-50/30 hover:border-emerald-100 transition-all duration-300">
                      <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                         <Check size={20} className="text-emerald-600 font-black" />
                      </div>
                      <div className="flex-1">
                         <div className="flex items-center gap-3 mb-1">
                            <h5 className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{point.label}</h5>
                            <span className="text-[9px] font-black text-emerald-500 bg-emerald-100/50 px-2 py-0.5 rounded-lg uppercase tracking-widest flex items-center gap-1">✅ Verified</span>
                         </div>
                         <p className="text-[10px] text-slate-400 font-medium italic">{point.desc}</p>
                      </div>
                   </div>
                 ))}
              </div>
              
              <button 
                onClick={() => setShowSuccessChecklist(false)} 
                className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] text-xs font-black uppercase italic tracking-[0.4em] shadow-2xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-4 group"
              >
                ACCESS FINAL PROGRAM <ChevronRight className="group-hover:translate-x-2 transition-transform" />
              </button>
           </div>
        </div>
      )}

      {showWaiverDialog && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-3xl w-full p-12 lg:p-16 border border-white/10 max-h-[90vh] overflow-y-auto no-scrollbar">
              <div className="flex items-center gap-6 mb-10">
                 <AlertCircle size={40} className="text-amber-500" />
                 <div>
                    <h4 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter leading-none mb-1">Resource Alert</h4>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Logic conflict detected</p>
                 </div>
              </div>

              <div className="space-y-6 mb-12">
                 <p className="text-xs text-slate-600 font-medium italic leading-relaxed">The AI has identified potential conflicts. Review below:</p>
                 <div className="space-y-4">
                    {shortageReport.map((s, i) => (
                      <div key={i} className="p-6 bg-slate-50 border border-slate-200 rounded-3xl group hover:border-amber-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                           <p className="font-black italic text-slate-900 text-xs uppercase">{s.staffName} — Flight {s.flightNumber}</p>
                           <span className="px-2 py-1 bg-amber-100 text-amber-600 rounded-lg text-[8px] font-black uppercase">{s.reason}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Actual Rest: <span className="text-rose-500">{s.actualRest}h</span> / Target: {s.targetRest}h</p>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sticky bottom-0 bg-white pt-6">
                 <button onClick={() => setShowWaiverDialog(false)} className="flex-1 py-6 text-xs font-black uppercase text-slate-400 tracking-widest italic">Discard</button>
                 <button 
                  onClick={acceptProposedProgram} 
                  className="flex-[2] py-6 bg-amber-500 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-amber-600 transition-all active:scale-95"
                 >
                   APPROVE & DEPLOY
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
