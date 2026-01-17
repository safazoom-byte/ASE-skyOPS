
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import { 
  Plane, 
  Users, 
  Clock, 
  Calendar, 
  LayoutDashboard,
  Menu,
  X,
  AlertCircle,
  Info,
  ShieldCheck,
  TrendingUp,
  Activity,
  ChevronRight
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
  FLIGHTS: 'skyops_flights_v2',
  STAFF: 'skyops_staff_v2',
  SHIFTS: 'skyops_shifts_v2',
  PROGRAMS: 'skyops_programs_v2',
  START_DATE: 'skyops_start_date',
  END_DATE: 'skyops_end_date',
  REST_HOURS: 'skyops_min_rest',
  RECOMMENDATIONS: 'skyops_recommendations'
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
  const [minRestHours, setMinRestHours] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REST_HOURS);
    return saved ? parseInt(saved) : 12;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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
  }, [flights, staff, shifts, programs, startDate, endDate, minRestHours, recommendations]);

  const handleStaffUpdate = (updatedStaff: Staff) => {
    setStaff(prev => {
      const idMatchIdx = prev.findIndex(s => s.id === updatedStaff.id);
      const nameMatchIdx = prev.findIndex(s => s.name.toLowerCase() === updatedStaff.name.toLowerCase());
      const initialsMatchIdx = prev.findIndex(s => s.initials.toUpperCase() === updatedStaff.initials.toUpperCase());
      
      const targetIdx = idMatchIdx !== -1 ? idMatchIdx : (nameMatchIdx !== -1 ? nameMatchIdx : initialsMatchIdx);

      if (targetIdx !== -1) {
        const existing = prev[targetIdx];
        const merged = { 
          ...existing, 
          ...updatedStaff,
          skillRatings: { ...existing.skillRatings, ...updatedStaff.skillRatings }
        };
        const newList = [...prev];
        newList[targetIdx] = merged;
        return newList;
      }
      return [...prev, updatedStaff];
    });
  };

  const clearStaff = () => {
    setStaff([]);
  };

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => {
    if (data.staff?.length > 0) {
      data.staff.forEach(s => handleStaffUpdate(s));
    }

    if (data.flights?.length > 0) {
      setFlights(prev => {
        const updated = [...prev];
        data.flights.forEach(newF => {
          const idx = updated.findIndex(f => f.flightNumber === newF.flightNumber && f.date === newF.date);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...newF };
          } else {
            updated.push(newF);
          }
        });
        return updated;
      });
    }

    if (data.shifts && data.shifts.length > 0) {
      setShifts(prev => {
        const current = [...prev];
        data.shifts.forEach(sh => {
          if (!current.some(s => s.id === sh.id)) current.push(sh);
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
      setError(`The target window (${startDate}) shows no flights in its strict range. Please add flights for this period.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    } else if (flights.length === 0) {
      setError(`Critical: No flights registered. Build sequence halted.`);
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
      const result = await generateAIProgram(
        { 
          flights: activeFlightsInRange, 
          staff, 
          shifts: activeShiftsInRange, 
          programs: [] 
        },
        "", 
        { numDays, customRules, minRestHours, startDate }
      );
      
      if (result.recommendations) {
        setRecommendations(result.recommendations);
      }

      if (result.shortageReport && result.shortageReport.length > 0) {
        setProposedPrograms(result.programs);
        setShortageReport(result.shortageReport);
        setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs);
        setActiveTab('program');
      }
    } catch (err: any) {
      setError(err.message || "Logic assembly failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const finalizeProposedPrograms = () => {
    if (proposedPrograms) {
      setPrograms(proposedPrograms);
      setProposedPrograms(null);
      setShortageReport([]);
      setShowWaiverDialog(false);
      setActiveTab('program');
    }
  };

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Plane, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Staff' },
    { id: 'shifts', icon: Clock, label: 'Duties' },
    { id: 'program', icon: Calendar, label: 'Program' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[3000] lg:hidden animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-2xl" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative h-full flex flex-col p-8 w-[85%] bg-slate-950 border-r border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold italic text-white">ASE</div>
                <h1 className="text-xl font-black uppercase tracking-tighter italic text-white">SkyOPS</h1>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-white/50 hover:text-white transition-colors">
                <X size={32} />
              </button>
            </div>
            <nav className="flex-1 space-y-4">
              {navItems.map((item) => (
                <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-6 px-8 py-6 rounded-3xl transition-all ${activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>
                  <item.icon size={24} />
                  <span className="text-lg font-black uppercase">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden lg:flex w-72 bg-slate-950 text-white flex-col border-r border-white/5">
        <div className="p-8 flex items-center gap-4 border-b border-white/5">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold italic shadow-lg shadow-blue-600/20">ASE</div>
          <h1 className="text-xl font-black uppercase tracking-tighter italic">SkyOPS</h1>
        </div>
        <nav className="flex-1 px-4 py-8 space-y-2">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'sidebar-item-active' : 'text-slate-500 hover:text-slate-200'}`}>
              <item.icon size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-950 text-white z-[50]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold italic text-xs">ASE</div>
            <h1 className="text-base font-black uppercase italic tracking-tighter">SkyOPS</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2"><Menu size={24} /></button>
        </header>

        {isGenerating && (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
            <div className="text-center">
              <div className="w-20 h-20 border-t-4 border-blue-500 rounded-full animate-spin mx-auto mb-6 shadow-2xl shadow-blue-500/20"></div>
              <p className="text-blue-400 font-black uppercase tracking-widest text-xs">Assembling Station Logic...</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 lg:p-12 no-scrollbar">
          {activeTab === 'dashboard' && (
            <div className="space-y-12 max-w-7xl mx-auto">
              {error && (
                <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-4">
                  <AlertCircle size={20} className="text-rose-600" />
                  <p className="text-[11px] font-black text-rose-700 uppercase">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-10">
                  <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-10">
                       <h3 className="text-2xl font-black italic uppercase text-slate-950 tracking-tighter">Station Command Dashboard</h3>
                       <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                         <Activity size={14} /> Systems Live
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {[
                        { label: 'Active Flights', value: activeFlightsInRange.length, icon: Plane, color: 'text-blue-600' },
                        { label: 'Personnel', value: staff.length, icon: Users, color: 'text-emerald-600' },
                        { label: 'Duty Hours', value: activeShiftsInRange.length * 8, icon: Clock, color: 'text-amber-600' },
                        { label: 'Health Score', value: recommendations ? `${recommendations.healthScore}%` : '---', icon: ShieldCheck, color: 'text-indigo-600' }
                      ].map((stat, i) => (
                        <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 transition-all hover:scale-[1.02]">
                          <stat.icon size={20} className={`${stat.color} mb-3`} />
                          <h4 className="text-3xl font-black text-slate-900 leading-none mb-2 italic">{stat.value}</h4>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {recommendations && (
                      <div className="mt-10 p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] space-y-6">
                        <div className="flex items-center gap-4">
                           <TrendingUp className="text-indigo-600" size={20} />
                           <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Resource Recommendations</h4>
                        </div>
                        <p className="text-xs font-medium text-indigo-800 leading-relaxed italic">"{recommendations.hireAdvice}"</p>
                        <div className="flex flex-wrap gap-2">
                           {recommendations.skillGaps.map((gap, i) => (
                             <span key={i} className="px-3 py-1 bg-white border border-indigo-200 rounded-xl text-[8px] font-black uppercase text-indigo-600 tracking-widest">
                               Critical Need: {gap}
                             </span>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <ProgramScanner onDataExtracted={handleDataExtracted} startDate={startDate} numDays={numDays} />
                </div>

                <div className="lg:col-span-4 space-y-10">
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} /> Operational Window
                    </h4>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[8px] font-black text-slate-300 uppercase mb-2">Effective From</label>
                        <input type="date" className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black text-slate-300 uppercase mb-2">Effective Till</label>
                        <input type="date" className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                    <button 
                      onClick={handleBuildRequest}
                      className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl italic hover:bg-slate-900 transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                      GENERATE WEEKLY PROGRAM <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={(f) => setFlights([...flights, f])} onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} onDelete={(id) => setFlights(flights.filter(f => f.id !== id))} />}
          {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} onClearAll={clearStaff} defaultMaxShifts={5} programStartDate={startDate} programEndDate={endDate} />}
          {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={(s) => setShifts([...shifts, s])} onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} onDelete={(id) => setShifts(shifts.filter(sh => sh.id !== id))} />}
          {activeTab === 'program' && (
            <div className="space-y-12">
              <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} aiRecommendations={recommendations} />
              <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
            </div>
          )}

          <footer className="mt-24 pb-12 pt-8 border-t border-slate-200 text-center">
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] italic mb-2">SkyOPS Station Intelligence System</p>
             <p className="text-[7px] font-bold text-slate-300 uppercase tracking-widest">© 2026 Mostafa Zaghloul. Production Build.</p>
          </footer>
        </div>
      </main>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
          <div className="bg-white rounded-[3.5rem] shadow-2xl max-w-xl w-full p-12">
            <h3 className="text-2xl font-black italic uppercase mb-10 text-slate-900 tracking-tighter">Operational Constraints</h3>
            <div className="space-y-8">
              <div className="bg-slate-50 p-6 rounded-2xl border">
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2">Min Rest Buffer (Hours)</label>
                <input type="number" className="w-full bg-transparent font-black text-3xl text-blue-600 outline-none" value={minRestHours} onChange={(e) => setMinRestHours(parseInt(e.target.value) || 12)} />
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2">Build Instructions</label>
                <textarea className="w-full p-6 bg-slate-50 border rounded-2xl text-xs font-bold h-32 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="e.g. Ensure supervisors on SM416..." value={customRules} onChange={e => setCustomRules(e.target.value)} />
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl font-black uppercase italic text-xs tracking-widest shadow-xl">BUILD PROGRAM</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWaiverDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white rounded-[3.5rem] shadow-2xl max-w-2xl w-full p-12">
            <h3 className="text-2xl font-black italic uppercase mb-4 text-rose-600">Shortage Waiver Required</h3>
            <p className="text-slate-500 text-sm font-medium mb-10">Primary man power deficit detected. The AI has proposed a coverage plan with minimal rest violations.</p>
            <div className="space-y-3 mb-10 max-h-64 overflow-y-auto no-scrollbar">
              {shortageReport.map((w, i) => (
                <div key={i} className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="font-black text-[11px] uppercase italic text-slate-900">{w.staffName}</p>
                    <p className="text-[8px] text-rose-400 uppercase tracking-widest font-black">Violation: {w.reason}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowWaiverDialog(false)} className="flex-1 py-5 font-black text-slate-400 uppercase text-[10px]">Reject</button>
              <button onClick={finalizeProposedPrograms} className="flex-[2] py-5 bg-rose-600 text-white rounded-2xl font-black uppercase italic text-xs tracking-widest">Authorize Waiver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
