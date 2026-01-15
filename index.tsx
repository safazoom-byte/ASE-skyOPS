import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plane, 
  Users, 
  Clock, 
  Calendar, 
  LayoutDashboard,
  BrainCircuit,
  Settings,
  Menu,
  X,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  Moon,
  AlertCircle,
  CalendarDays
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
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 14); 
  }, [startDate, endDate]);

  const getDayDate = (dayIndex: number) => {
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const outOfRangeFlights = useMemo(() => {
    return flights.filter(f => f.day < 0 || f.day >= numDays);
  }, [flights, numDays]);

  const unlinkedFlights = useMemo(() => {
    const linkedIds = new Set(shifts.flatMap(s => s.flightIds || []));
    return flights.filter(f => f.day >= 0 && f.day < numDays && !linkedIds.has(f.id));
  }, [flights, shifts, numDays]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        // Fixed: Ensure we use the boolean result directly to avoid unintentional string comparison error
        setHasApiKey(selected ?? false);
      } else {
        setHasApiKey(Boolean(process.env.API_KEY));
      }
    };
    checkKey();
  }, []);

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

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[], templateBinary?: string }) => {
    if (data.flights?.length > 0) setFlights(prev => [...prev, ...data.flights]);
    if (data.staff?.length > 0) setStaff(prev => [...prev, ...data.staff]);
    if (data.shifts && data.shifts.length > 0) setShifts(prev => [...prev, ...data.shifts]);
    if (data.programs && data.programs.length > 0) {
      setPrograms(data.programs);
      setActiveTab('program');
    }
    if (data.templateBinary) setTemplateBinary(data.templateBinary);
  };

  const handleFlightDelete = (flightId: string) => {
    setFlights(prev => prev.filter(f => f.id !== flightId));
    setPrograms(prev => prev.map(p => ({
      ...p,
      assignments: (p.assignments || []).filter(a => a.flightId !== flightId)
    })));
  };

  const confirmGenerateProgram = async () => {
    setShowConfirmDialog(false);
    setIsGenerating(true);
    setError(null);
    try {
      const data: ProgramData = { flights, staff, shifts, programs };
      const result = await generateAIProgram(data, '', { customRules, numDays, minRestHours });
      
      setProposedPrograms(result.programs);
      setShortageReport(result.shortageReport);
      
      if (result.recommendations) setRecommendations(result.recommendations);

      if (result.shortageReport.length > 0) {
        setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs);
        setActiveTab('program');
      }
    } catch (err: any) {
      if (err.message?.includes("entity was not found") || err.message?.includes("API key")) {
        setHasApiKey(false);
      }
      setError(err.message || "Intelligence Build Error.");
    } finally { setIsGenerating(false); }
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
      {hasApiKey === false && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] lg:rounded-[3rem] shadow-2xl max-w-xl w-full p-8 lg:p-12 text-center border border-slate-200">
            <ShieldAlert size={64} className="text-blue-600 mx-auto mb-8" />
            <h2 className="text-2xl lg:text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-4">Activate Station Engine</h2>
            <p className="text-slate-500 text-sm mb-8">Select an API key from a paid Google Cloud project to proceed.</p>
            <button 
              onClick={async () => { await window.aistudio?.openSelectKey?.(); setHasApiKey(true); }} 
              className="w-full py-5 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95"
            >
              INITIALIZE AI CORE
            </button>
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
                activeTab === item.id ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              <item.icon size={20} />
              <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-950 text-white">
          <h1 className="text-lg font-black uppercase italic">SkyOPS</h1>
          <button onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
        </header>

        {isGenerating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-blue-400 font-black uppercase tracking-widest text-xs">Assembling Operational Logic...</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {activeTab === 'dashboard' && (
            <div className="space-y-10">
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
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={flights.length === 0 || staff.length === 0}
                  className="px-14 py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl disabled:opacity-20"
                >
                  EXECUTE BUILD
                </button>
              </div>
            </div>
          )}

          {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={(f) => setFlights([...flights, f])} onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} onDelete={handleFlightDelete} />}
          {activeTab === 'staff' && <StaffManager staff={staff} onAdd={(s) => setStaff([...staff, s])} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} defaultMaxShifts={5} programStartDate={startDate} programEndDate={endDate} />}
          {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={(s) => setShifts([...shifts, s])} onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} onDelete={(id) => setShifts(shifts.filter(s => s.id !== id))} />}
          {activeTab === 'program' && (
            <div className="space-y-12">
              <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} templateBinary={templateBinary} aiRecommendations={recommendations} />
              <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
            </div>
          )}
        </div>
      </main>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
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
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
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