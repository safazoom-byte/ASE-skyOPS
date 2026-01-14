
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plane, 
  Users, 
  Clock, 
  Calendar, 
  Plus, 
  LayoutDashboard,
  BrainCircuit,
  Settings,
  Mic,
  MessageSquare,
  FileSearch
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { LiveAssistant } from './components/LiveAssistant';
import { generateAIProgram } from './services/geminiService';

const STORAGE_KEYS = {
  FLIGHTS: 'skyops_flights_v2',
  STAFF: 'skyops_staff_v2',
  SHIFTS: 'skyops_shifts_v2',
  PROGRAMS: 'skyops_programs_v2',
  START_DATE: 'skyops_start_date',
  END_DATE: 'skyops_end_date',
  TEMPLATE: 'skyops_template_binary'
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program' | 'voice'>('dashboard');
  
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

  const [templateBinary, setTemplateBinary] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.TEMPLATE);
  });

  const [customRules, setCustomRules] = useState<string>('');
  const [fairRotation, setFairRotation] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const numDays = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 14); 
  }, [startDate, endDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    if (templateBinary) localStorage.setItem(STORAGE_KEYS.TEMPLATE, templateBinary);
  }, [flights, staff, shifts, programs, startDate, endDate, templateBinary]);

  const handleDataExtracted = (data: { flights: Flight[], staff: Staff[], shifts?: ShiftConfig[], templateBinary?: string }) => {
    if (data.flights?.length > 0) setFlights(prev => [...prev, ...data.flights]);
    if (data.staff?.length > 0) setStaff(prev => [...prev, ...data.staff]);
    if (data.shifts && data.shifts.length > 0) setShifts(prev => [...prev, ...data.shifts!]);
    if (data.templateBinary) setTemplateBinary(data.templateBinary);
    setActiveTab('dashboard');
  };

  const confirmGenerateProgram = async () => {
    setShowConfirmDialog(false);
    setIsGenerating(true);
    setError(null);
    try {
      const data: ProgramData = { flights, staff, shifts, programs };
      const newPrograms = await generateAIProgram(data, '', { customRules, numDays, fairRotation });
      setPrograms(newPrograms);
      setActiveTab('program');
    } catch (err: any) {
      setError(err.message || "Intelligence Build Error.");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-72 bg-slate-950 text-white flex flex-col border-r border-white/5">
        <div className="p-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold italic shadow-lg shadow-blue-600/20">ASE</div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter italic leading-none">SkyOPS</h1>
            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Station Intelligence</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
            { id: 'flights', icon: Plane, label: 'Flight Control' },
            { id: 'staff', icon: Users, label: 'Personnel' },
            { id: 'shifts', icon: Clock, label: 'Duty Master' },
            { id: 'program', icon: Calendar, label: 'Weekly Program' },
            { id: 'voice', icon: Mic, label: 'Voice Control' },
          ].map((item: any) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all group ${
                activeTab === item.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <item.icon size={20} className={activeTab === item.id ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'} />
              <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-white/5 bg-slate-900/50">
           <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Core Online</span>
           </div>
           <p className="text-[9px] font-medium text-slate-600 uppercase tracking-widest">SkyOPS v2.5 Deployment</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 scroll-smooth relative">
        {isGenerating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
            <div className="text-center space-y-6">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500 animate-pulse" size={32} />
              </div>
              <p className="text-blue-400 font-black uppercase tracking-[0.3em] text-[10px]">Assembling Operational Logic...</p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-10 py-12">
          {error && (
            <div className="mb-10 p-6 bg-red-50 border border-red-200 rounded-3xl flex items-center justify-between group animate-in slide-in-from-top duration-500">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                  <Settings size={20} />
                </div>
                <p className="text-sm font-black text-red-900 uppercase italic tracking-tighter">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-black p-2 text-xl">&times;</button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-black text-slate-950 uppercase italic tracking-tighter">Station Dashboard</h2>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Active Operational Period: {startDate} TO {endDate}</p>
                </div>
                <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                  <div className="px-4 py-2 text-center border-r border-slate-100">
                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</span>
                    <span className="text-xs font-black text-blue-600">{numDays} Days</span>
                  </div>
                  <div className="px-4 py-2 text-center">
                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Region</span>
                    <span className="text-xs font-black text-slate-900">MENA-WEST</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Window</h4>
                    <div className="space-y-6">
                      <div className="group">
                        <label className="block text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2 group-focus-within:text-blue-500 transition-colors">Start Date</label>
                        <input type="date" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 cursor-pointer" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </div>
                      <div className="group">
                        <label className="block text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2 group-focus-within:text-blue-500 transition-colors">End Date</label>
                        <input type="date" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 cursor-pointer" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                 </div>
                 <div className="md:col-span-2">
                   <ProgramScanner onDataExtracted={handleDataExtracted} templateBinary={templateBinary} />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {[
                  { label: 'Flights Tracked', value: flights.length, color: 'text-blue-600' },
                  { label: 'Staff Enrolled', value: staff.length, color: 'text-emerald-600' },
                  { label: 'Shift Configurations', value: shifts.length, color: 'text-amber-600' },
                  { label: 'Total Assignments', value: programs.reduce((acc, p) => acc + p.assignments.length, 0), color: 'text-indigo-600' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
                    <h3 className={`text-4xl font-black italic tracking-tighter mb-2 ${stat.color}`}>{stat.value}</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 p-12 rounded-[4rem] shadow-2xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-600/10 blur-[120px] pointer-events-none group-hover:bg-blue-600/20 transition-all duration-1000"></div>
                 <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                   <div className="text-center md:text-left space-y-4">
                     <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter leading-none">Intelligence Roster Build</h3>
                     <p className="text-slate-400 text-sm font-medium max-w-md">Our high-fidelity model optimizes shift rotations based on flight STA/STD and mandatory skill pairings.</p>
                   </div>
                   <button 
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={flights.length === 0 || staff.length === 0}
                    className="px-14 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-20 disabled:grayscale"
                   >
                     EXECUTE PROGRAM BUILD
                   </button>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} onAdd={(f) => setFlights([...flights, f])} onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} onDelete={(id) => setFlights(flights.filter(f => f.id !== id))} />}
          {activeTab === 'staff' && <StaffManager staff={staff} onAdd={(s) => setStaff([...staff, s])} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} defaultMaxShifts={5} />}
          {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={(s) => setShifts([...shifts, s])} onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} onDelete={(id) => setShifts(shifts.filter(s => s.id !== id))} />}
          {activeTab === 'program' && (
            <div className="space-y-12">
              <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} onUpdatePrograms={setPrograms} templateBinary={templateBinary} />
              <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
            </div>
          )}
          {activeTab === 'voice' && <LiveAssistant programs={programs} staff={staff} flights={flights} />}
        </div>
      </main>

      {/* Roster Configuration Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full p-12 relative border border-slate-100">
            <h3 className="text-2xl font-black italic uppercase mb-8 text-slate-950 tracking-tighter">Program Constraints</h3>
            <div className="space-y-8">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group">
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fair Workload Rotation</div>
                  <div className="text-[9px] font-medium text-slate-400 uppercase">Balance unsocial shift hours across team</div>
                </div>
                <button onClick={() => setFairRotation(!fairRotation)} className={`w-14 h-8 rounded-full p-1 transition-all ${fairRotation ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <div className={`w-6 h-6 bg-white rounded-full shadow-lg transition-transform ${fairRotation ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Operational Rules</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" 
                  value={customRules} 
                  onChange={e => setCustomRules(e.target.value)} 
                  placeholder="e.g. Ensure Joe has Monday off for training. Prioritize initials ABC for morning Ramp..." 
                  rows={4} 
                />
              </div>
            </div>
            <div className="flex gap-6 mt-12">
              <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Abort</button>
              <button onClick={confirmGenerateProgram} className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 italic">BUILD PROGRAM</button>
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
