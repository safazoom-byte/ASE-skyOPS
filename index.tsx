
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

  // Shortage/Waiver States
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
        setHasApiKey(Boolean(selected));
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

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts?: ShiftConfig[], programs?: DailyProgram[], templateBinary?: string }) => {
    if (data.flights?.length > 0) setFlights(prev => [...prev, ...data.flights]);
    if (data.staff?.length > 0) setStaff(prev => [...prev, ...data.staff]);
    if (data.shifts && data.shifts.length > 0) setShifts(prev => [...prev, ...data.shifts!]);
    if (data.programs && data.programs.length > 0) {
      setPrograms(data.programs);
      setActiveTab('program');
    } else {
      setActiveTab('dashboard');
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
      
      const newPrograms = result.programs || [];
      const newShortage = result.shortageReport || [];
      
      setProposedPrograms(newPrograms);
      setShortageReport(newShortage);
      
      if (result.recommendations) {
        setRecommendations(result.recommendations);
      }

      if (newShortage.length > 0) {
        setShowWaiverDialog(true);
      } else {
        setPrograms(newPrograms);
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

  const NavItem: React.FC<{ item: any }> = ({ item }) => (
    <button
      onClick={() => {
        setActiveTab(item.id);
        setIsMobileMenuOpen(false);
      }}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all group ${
        activeTab === item.id 
          ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
          : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
      }`}
    >
      <item.icon size={20} className={activeTab === item.id ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'} />
      <span className="text-xs font-black uppercase tracking-widest flex-1 text-left">{item.label}</span>
      <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${activeTab === item.id ? 'opacity-100' : ''}`} />
    </button>
  );

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Plane, label: 'Flight Control' },
    { id: 'staff', icon: Users, label: 'Personnel' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: Calendar, label: 'Weekly Program' },
  ];

  const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const formattedEndDate = new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {hasApiKey === false && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] lg:rounded-[3rem] shadow-2xl max-w-xl w-full p-8 lg:p-12 text-center border border-slate-200 animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh]">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-blue-50 text-blue-600 rounded-[1.5rem] lg:rounded-3xl flex items-center justify-center mx-auto mb-6 lg:mb-8">
              <ShieldAlert size={32} className="lg:size-40" />
            </div>
            <h2 className="text-2xl lg:text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-4 leading-none">Activate Station Engine</h2>
            <p className="text-slate-500 text-xs lg:text-sm mb-8 leading-relaxed font-medium">
              To utilize the AI Station Intelligence models, please select an API key from a paid Google Cloud project. 
              Review the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-600 underline font-black">billing documentation</a> for details.
            </p>
            <button 
              onClick={async () => { 
                await window.aistudio?.openSelectKey?.(); 
                setHasApiKey(true); 
              }} 
              className="w-full py-5 lg:py-6 bg-slate-950 text-white rounded-2xl lg:rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-800 transition-all active:scale-95 italic text-xs"
            >
              INITIALIZE AI CORE
            </button>
          </div>
        </div>
      )}

      <aside className="hidden lg:flex w-72 bg-slate-950 text-white flex-col border-r border-white/5">
        <div className="p-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold italic shadow-lg shadow-blue-600/20 text-white">ASE</div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter italic leading-none">SkyOPS</h1>
            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Station Intelligence</span>
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => <NavItem key={item.id} item={item} />)}
        </nav>
        <div className="p-8 border-t border-white/5 bg-slate-900/50">
           <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Core Online</span>
           </div>
           <p className="text-[9px] font-medium text-slate-600 uppercase tracking-widest italic">AI Weekly Engine Platform</p>
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-xl lg:hidden animate-in fade-in duration-300">
          <div className="p-6 flex justify-between items-center border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold italic text-white">ASE</div>
              <h1 className="text-lg font-black uppercase tracking-tighter italic text-white">SkyOPS</h1>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          <nav className="p-6 space-y-2 overflow-y-auto h-full pb-24">
            {navItems.map((item) => <NavItem key={item.id} item={item} />)}
          </nav>
        </div>
      )}

      <main className="flex-1 overflow-hidden bg-slate-50 flex flex-col relative">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-950 text-white sticky top-0 z-[100] border-b border-white/5 shrink-0 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold italic">ASE</div>
            <h1 className="text-lg font-black uppercase tracking-tighter italic">SkyOPS</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
            <Menu size={24} />
          </button>
        </header>

        {isGenerating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
            <div className="text-center space-y-6 px-6">
              <div className="relative">
                <div className="w-16 h-16 lg:w-20 lg:h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500 animate-pulse" size={24} />
              </div>
              <p className="text-blue-400 font-black uppercase tracking-[0.2em] text-[10px]">Assembling Operational Logic...</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-7xl mx-auto px-4 lg:px-10 py-6 lg:py-12">
            
            {outOfRangeFlights.length > 0 && (
              <div className="mb-6 p-4 lg:p-6 bg-amber-50 border border-amber-200 rounded-2xl lg:rounded-3xl flex items-center justify-between group animate-in slide-in-from-top duration-500">
                <div className="flex items-center gap-3 lg:gap-4">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 bg-amber-100 text-amber-600 rounded-lg lg:rounded-xl flex items-center justify-center shrink-0">
                    <CalendarDays size={18} className="lg:size-20" />
                  </div>
                  <div>
                    <p className="text-[10px] lg:text-sm font-black text-amber-900 uppercase italic tracking-tighter leading-tight">
                      {outOfRangeFlights.length} flights detected outside Target Window
                    </p>
                    <p className="text-[8px] lg:text-[10px] font-medium text-amber-600 uppercase tracking-widest mt-1">
                      Target Window: {formattedStartDate} — {formattedEndDate}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('flights')}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[8px] lg:text-[10px] font-black uppercase italic tracking-widest hover:bg-amber-500 transition-colors"
                >
                  View Details
                </button>
              </div>
            )}

            {error && (
              <div className="mb-6 lg:mb-8 p-4 lg:p-6 bg-red-50 border border-red-200 rounded-2xl lg:rounded-3xl flex items-center justify-between group animate-in slide-in-from-top duration-500">
                <div className="flex items-center gap-3 lg:gap-4">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 bg-red-100 text-red-600 rounded-lg lg:rounded-xl flex items-center justify-center shrink-0">
                    <Settings size={18} className="lg:size-20" />
                  </div>
                  <p className="text-[10px] lg:text-sm font-black text-red-900 uppercase italic tracking-tighter leading-tight">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-black p-2 text-xl">&times;</button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="space-y-6 lg:space-y-12 animate-in fade-in duration-700">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl lg:text-4xl font-black text-slate-950 uppercase italic tracking-tighter">Station Dashboard</h2>
                    <p className="text-slate-400 font-bold uppercase text-[8px] lg:text-[10px] tracking-[0.15em]">Ops Period: {startDate} — {endDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                   <div className="bg-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] border border-slate-100 shadow-sm">
                      <h4 className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Target Window</h4>
                      <div className="space-y-5">
                        <div className="group">
                          <label className="block text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2 group-focus-within:text-blue-500 transition-colors">Start Date</label>
                          <input type="date" className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-slate-50 border border-slate-200 rounded-xl lg:rounded-2xl font-black text-xs lg:text-sm outline-none focus:ring-4 focus:ring-blue-500/10 cursor-pointer" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="group">
                          <label className="block text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2 group-focus-within:text-blue-500 transition-colors">End Date</label>
                          <input type="date" className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-slate-50 border border-slate-200 rounded-xl lg:rounded-2xl font-black text-xs lg:text-sm outline-none focus:ring-4 focus:ring-blue-500/10 cursor-pointer" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                      </div>
                   </div>
                   <div className="lg:col-span-2">
                     <ProgramScanner onDataExtracted={handleDataExtracted} templateBinary={templateBinary} startDate={startDate} numDays={numDays} />
                   </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">
                  {[
                    { label: 'Flights', value: flights.length, color: 'text-blue-600' },
                    { label: 'Personnel', value: staff.length, color: 'text-emerald-600' },
                    { label: 'Shift Slots', value: shifts.length, color: 'text-amber-600' },
                    { label: 'Assignments', value: (programs || []).reduce((acc, p) => acc + (p.assignments?.length || 0), 0), color: 'text-indigo-600' }
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-5 lg:p-8 rounded-[1.5rem] lg:rounded-[2.5rem] border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center">
                      <h3 className={`text-xl lg:text-4xl font-black italic tracking-tighter mb-0.5 lg:mb-2 ${stat.color}`}>{stat.value}</h3>
                      <p className="text-[7px] lg:text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-950 p-6 lg:p-12 rounded-[2rem] lg:rounded-[4rem] shadow-2xl relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-full h-full bg-blue-600/10 blur-[100px] pointer-events-none group-hover:bg-blue-600/20 transition-all duration-1000"></div>
                   <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 text-center lg:text-left">
                     <div className="space-y-2 lg:space-y-4">
                       <h3 className="text-xl lg:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">Intelligence Roster Build</h3>
                       <p className="text-slate-400 text-[10px] lg:text-sm font-medium max-w-md">Optimize shift rotations based on flight STA/STD and skill pairings.</p>
                     </div>
                     <button 
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={flights.length === 0 || staff.length === 0}
                      className="w-full lg:w-auto px-8 lg:px-14 py-4 lg:py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl lg:rounded-[2rem] font-black text-[9px] lg:text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-20 disabled:grayscale"
                     >
                       EXECUTE PROGRAM BUILD
                     </button>
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={(f) => setFlights([...flights, f])} onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} onDelete={handleFlightDelete} />}
            {activeTab === 'staff' && <StaffManager staff={staff} onAdd={(s) => setStaff([...staff, s])} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} defaultMaxShifts={5} programStartDate={startDate} programEndDate={endDate} />}
            {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={(s) => setShifts([...shifts, s])} onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} onDelete={(id) => setShifts(shifts.filter(s => s.id !== id))} />}
            {activeTab === 'program' && (
              <div className="space-y-8 lg:space-y-12">
                <ProgramDisplay 
                  programs={programs} 
                  flights={flights} 
                  staff={staff} 
                  shifts={shifts} 
                  startDate={startDate} 
                  endDate={endDate}
                  onUpdatePrograms={setPrograms} 
                  templateBinary={templateBinary}
                  aiRecommendations={recommendations}
                />
                <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
              </div>
            )}
          </div>
        </div>

        <footer className="mt-auto py-6 lg:py-12 bg-white border-t border-slate-100 shrink-0">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <p className="text-[8px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest italic leading-tight">
              AI Weekly Engine by Mostafa Zaghloul
            </p>
          </div>
        </footer>
      </main>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] lg:rounded-[3rem] shadow-2xl max-w-xl w-full p-8 lg:p-12 relative border border-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="text-xl lg:text-2xl font-black italic uppercase mb-6 lg:mb-8 text-slate-950 tracking-tighter">Program Constraints</h3>
            
            <div className="space-y-6 lg:space-y-8">
              {unlinkedFlights.length > 0 && (
                <div className="p-5 lg:p-6 bg-amber-50 border border-amber-200 rounded-2xl animate-in slide-in-from-top duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[10px] lg:text-xs font-black text-amber-900 uppercase tracking-widest mb-1">Operational Gap Detected</h4>
                      <p className="text-[9px] lg:text-[10px] text-amber-700 font-medium leading-relaxed">
                        The following {unlinkedFlights.length} flight(s) are not linked to any shift.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {unlinkedFlights.map(f => (
                          <span key={f.id} className="px-2 py-1 bg-white border border-amber-100 rounded-lg text-[8px] font-black text-amber-600 uppercase italic">
                            {f.flightNumber} ({getDayDate(f.day)})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 lg:p-6 bg-slate-50 rounded-xl lg:rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                  <Moon size={20} />
                </div>
                <div className="flex-1">
                  <label className="block text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Min Rest (Hours)</label>
                  <input 
                    type="number" 
                    min="8" max="24"
                    className="w-full bg-transparent border-none p-0 outline-none font-black text-lg lg:text-xl text-indigo-600" 
                    value={minRestHours} 
                    onChange={(e) => setMinRestHours(parseInt(e.target.value) || 12)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Operational Rules</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl lg:rounded-2xl p-4 lg:p-6 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" 
                  value={customRules} 
                  onChange={e => setCustomRules(e.target.value)} 
                  placeholder="e.g. Ensure Joe has Monday off..." 
                  rows={4} 
                />
              </div>
            </div>

            <div className="flex gap-4 lg:gap-6 mt-8 lg:mt-12">
              <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Abort</button>
              <button onClick={confirmGenerateProgram} className="flex-[2] py-4 lg:py-5 bg-slate-950 text-white rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-[0.1em] shadow-2xl active:scale-95 italic">BUILD PROGRAM</button>
            </div>
          </div>
        </div>
      )}

      {showWaiverDialog && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl animate-in zoom-in-95 duration-300">
          <div className="bg-white rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl max-w-2xl w-full p-8 lg:p-14 border border-slate-100 overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex items-center gap-4 lg:gap-6 mb-8 lg:mb-10">
              <div className="w-14 h-14 lg:w-20 lg:h-20 bg-rose-50 text-rose-600 rounded-[1.5rem] lg:rounded-3xl flex items-center justify-center shadow-lg shadow-rose-100">
                <AlertCircle size={32} className="lg:size-40" />
              </div>
              <div>
                <h3 className="text-xl lg:text-3xl font-black italic uppercase text-slate-950 tracking-tighter leading-none">Operational Waiver</h3>
                <p className="text-slate-400 text-[9px] lg:text-[11px] font-bold uppercase tracking-[0.15em] mt-2 italic">Insufficient primary staff — Extension protocol engaged</p>
              </div>
            </div>

            <div className="p-6 lg:p-8 bg-slate-50 rounded-[2rem] lg:rounded-[3rem] border border-slate-100 mb-8 lg:mb-10">
              <p className="text-[10px] lg:text-xs text-slate-600 font-medium leading-relaxed mb-6">
                To fulfill the station program requirements, the following personnel have been <span className="text-rose-600 font-black">extended from previous shifts</span>. This will result in rest periods <span className="underline italic">shorter</span> than your configured {minRestHours} hours.
              </p>

              <div className="space-y-3">
                {shortageReport.map((w, i) => (
                  <div key={i} className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] lg:text-xs font-black text-slate-900 uppercase italic leading-none mb-1">{w.staffName}</span>
                      <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Covering Flight {w.flightNumber}</span>
                    </div>
                    <div className="flex items-center gap-4 lg:gap-6">
                       <div className="text-right">
                          <span className="block text-[7px] lg:text-[8px] font-black text-slate-400 uppercase tracking-widest">Actual Rest</span>
                          <span className="text-[10px] lg:text-sm font-black text-rose-600 italic">{w.actualRest} Hours</span>
                       </div>
                       <div className="w-px h-6 bg-slate-100"></div>
                       <div className="text-right">
                          <span className="block text-[7px] lg:text-[8px] font-black text-slate-400 uppercase tracking-widest">Target Rest</span>
                          <span className="text-[10px] lg:text-sm font-black text-slate-300 italic">{w.targetRest} Hours</span>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 lg:gap-6">
              <button 
                onClick={() => {
                  setShowWaiverDialog(false);
                  setProposedPrograms(null);
                  setShortageReport([]);
                }} 
                className="flex-1 py-5 lg:py-6 text-[9px] lg:text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
              >
                Reject & Rebuild
              </button>
              <button 
                onClick={finalizeProposedPrograms} 
                className="flex-[2] py-5 lg:py-7 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl lg:rounded-[2.5rem] text-[9px] lg:text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-rose-200 active:scale-95 italic"
              >
                Confirm & Accept Waiver
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
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
