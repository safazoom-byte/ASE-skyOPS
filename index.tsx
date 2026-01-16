
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plane, 
  Users, 
  Clock, 
  Calendar, 
  LayoutDashboard,
  Menu,
  X,
  AlertCircle
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
  TEMPLATE: 'skyops_template_binary',
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

  const [templateBinary, setTemplateBinary] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.TEMPLATE);
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    localStorage.setItem(STORAGE_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recommendations));
    if (templateBinary) localStorage.setItem(STORAGE_KEYS.TEMPLATE, templateBinary);
  }, [flights, staff, shifts, programs, startDate, endDate, templateBinary, minRestHours, recommendations]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
          console.debug('ServiceWorker registration failed: ', err);
        });
      });
    }
  }, []);

  const handleStaffUpdate = (updatedStaff: Staff) => {
    setStaff(prev => {
      const idMatchIdx = prev.findIndex(s => s.id === updatedStaff.id);
      if (idMatchIdx !== -1) {
        const existing = prev[idMatchIdx];
        const merged = { ...existing, ...updatedStaff };
        const newList = [...prev];
        newList[idMatchIdx] = merged;
        return newList;
      }
      return [...prev, updatedStaff];
    });
  };

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[], templateBinary?: string }) => {
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
      setShifts(prev => [...prev, ...data.shifts]);
    }
    
    if (data.programs && data.programs.length > 0) {
      setPrograms(data.programs);
      setActiveTab('program');
    }
    if (data.templateBinary) setTemplateBinary(data.templateBinary);
  };

  const handleBuildRequest = () => {
    setError(null);
    if (activeFlightsInRange.length === 0) {
      setError(`Critical Error: The current Target Window (${startDate} to ${endDate}) has zero scheduled flights. Assign flights to these dates before building.`);
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
        { flights, staff, shifts, programs },
        "", 
        { numDays, customRules, minRestHours, startDate }
      );
      
      if (result.shortageReport && result.shortageReport.length > 0) {
        setProposedPrograms(result.programs);
        setShortageReport(result.shortageReport);
        setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs);
        if (result.recommendations) setRecommendations(result.recommendations);
        setActiveTab('program');
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate program");
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
    { id: 'flights', icon: Plane, label: 'Flight Control' },
    { id: 'staff', icon: Users, label: 'Personnel' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: Calendar, label: 'Weekly Program' },
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
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-6 px-8 py-6 rounded-3xl transition-all ${
                    activeTab === item.id 
                      ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/20' 
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <item.icon size={24} />
                  <span className="text-lg font-black uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden lg:flex w-72 bg-slate-950 text-white flex-col border-r border-white/5">
        <div className="p-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold italic">ASE</div>
          <h1 className="text-xl font-black uppercase tracking-tighter italic">SkyOPS</h1>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${
                activeTab === item.id ? 'sidebar-item-active' : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              <item.icon size={20} />
              <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-950 text-white border-b border-white/5 z-[50]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold italic text-xs">ASE</div>
            <h1 className="text-base font-black uppercase italic tracking-tighter">SkyOPS</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <Menu size={24} />
          </button>
        </header>

        {isGenerating && (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-blue-400 font-black uppercase tracking-widest text-xs">Assembling Operational Logic...</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 no-scrollbar">
          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              {error && (
                <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top duration-300">
                  <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[10px] font-black text-rose-900 uppercase tracking-widest mb-1">Build Blocked</h4>
                    <p className="text-[10px] text-rose-700 font-medium leading-relaxed">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-2 text-rose-400 hover:text-rose-600">&times;</button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Window</h4>
                  <div>
                    <label className="block text-[8px] font-black text-slate-300 uppercase mb-2">Start Date</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-300 uppercase mb-2">End Date</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <ProgramScanner onDataExtracted={handleDataExtracted} templateBinary={templateBinary} startDate={startDate} numDays={numDays} />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Flights', value: flights.length, color: 'text-blue-600' },
                  { label: 'Personnel', value: staff.length, color: 'text-emerald-600' },
                  { label: 'Shifts', value: shifts.length, color: 'text-amber-600' },
                  { label: 'Days', value: numDays, color: 'text-indigo-600' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                    <h3 className={`text-3xl font-black italic ${stat.color} mb-2`}>{stat.value}</h3>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 p-12 rounded-[3rem] text-center lg:text-left flex flex-col lg:flex-row items-center justify-between gap-8">
                <div>
                  <h3 className="text-2xl font-black text-white italic uppercase mb-2">Intelligence Roster Build</h3>
                  <p className="text-slate-400 text-sm font-medium">Optimize station logic across {numDays} days.</p>
                </div>
                <button 
                  onClick={handleBuildRequest}
                  className="px-14 py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl disabled:opacity-20"
                >
                  EXECUTE BUILD
                </button>
              </div>
            </div>
          )}

          {activeTab === 'flights' && (
            <FlightManager 
              flights={flights} 
              startDate={startDate} 
              endDate={endDate} 
              onAdd={(f) => setFlights([...flights, f])} 
              onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} 
              onDelete={(id) => setFlights(flights.filter(f => f.id !== id))} 
            />
          )}
          {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={handleStaffUpdate} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} defaultMaxShifts={5} programStartDate={startDate} programEndDate={endDate} />}
          {activeTab === 'shifts' && (
            <ShiftManager 
              shifts={shifts} 
              flights={flights} 
              startDate={startDate} 
              onAdd={(s) => setShifts([...shifts, s])} 
              onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} 
              onDelete={(id) => setShifts(shifts.filter(sh => sh.id !== id))} 
            />
          )}
          {activeTab === 'program' && (
            <div className="space-y-12">
              <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} templateBinary={templateBinary} aiRecommendations={recommendations} />
              <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
            </div>
          )}
        </div>
      </main>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full p-12">
            <h3 className="text-2xl font-black italic uppercase mb-8">Program Constraints</h3>
            <div className="space-y-8">
              <div className="bg-slate-50 p-6 rounded-2xl border">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Min Rest (Hours)</label>
                <input type="number" className="w-full bg-transparent font-black text-2xl text-blue-600 outline-none" value={minRestHours} onChange={(e) => setMinRestHours(parseInt(e.target.value) || 12)} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Operational Rules</label>
                <textarea className="w-full p-4 bg-slate-50 border rounded-2xl text-sm font-bold h-32 outline-none" placeholder="e.g. Ensure supervisors are matched with trainees..." value={customRules} onChange={e => setCustomRules(e.target.value)} />
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-4 font-black uppercase text-xs text-slate-400">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-4 bg-slate-950 text-white rounded-2xl font-black uppercase italic text-xs">BUILD PROGRAM</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWaiverDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-2xl w-full p-12">
            <h3 className="text-2xl font-black italic uppercase mb-4">Operational Waiver</h3>
            <p className="text-slate-500 mb-8">Insufficient primary staff. Rest period violations proposed to meet operational demand.</p>
            <div className="space-y-4 mb-8">
              {shortageReport.map((w, i) => (
                <div key={i} className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="font-black text-sm uppercase italic">{w.staffName}</p>
                    <p className="text-[10px] text-rose-400 uppercase tracking-widest">Flt {w.flightNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-rose-600 italic">{w.actualRest}h Rest</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowWaiverDialog(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs">Reject</button>
              <button onClick={finalizeProposedPrograms} className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-black uppercase italic text-xs">Accept Waiver</button>
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
