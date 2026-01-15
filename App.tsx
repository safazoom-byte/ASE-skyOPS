
import React, { useState, useEffect, useMemo } from 'react';
import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
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
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'flights' | 'staff' | 'shifts' | 'program' | 'dashboard'>('dashboard');
  
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
    const checkKey = async () => {
      // Robust check for injected API key
      const key = process.env.API_KEY;
      const isKeyPresent = key && key !== 'undefined' && key !== '';

      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected && isKeyPresent);
      } else { 
        setHasApiKey(isKeyPresent); 
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
  }, [flights, staff, shifts, programs, startDate, endDate]);

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
      if (err.message?.includes("entity was not found") || err.message?.includes("API Key")) setHasApiKey(false);
      setError(err.message || "Intelligence Build Error.");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {hasApiKey === false && (
        <div className="fixed inset-0 z-[1000] bg-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full p-12 text-center border border-slate-200">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-4">Activate ASE Station Intelligence</h2>
            <p className="text-slate-500 text-sm mb-6">
              To use professional station models, please select an API key from a paid GCP project. 
              See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">billing documentation</a> for requirements.
            </p>
            <button 
              onClick={async () => { 
                await window.aistudio?.openSelectKey?.(); 
                setHasApiKey(true); 
              }} 
              className="w-full py-5 bg-blue-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-800 transition-all"
            >
              Activate Engine
            </button>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-blue-400 font-black uppercase tracking-widest">Generating Program...</p>
          </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black italic uppercase mb-6 text-slate-900">Program Configuration</h3>
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Period</div>
                <div className="text-sm font-black text-slate-900 italic">{startDate} to {endDate} ({numDays} days)</div>
              </div>
              
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Fair Rotation</div>
                  <div className="text-[9px] font-medium text-slate-500">Balance unsocial shift hours across personnel</div>
                </div>
                <button 
                  onClick={() => setFairRotation(!fairRotation)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${fairRotation ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${fairRotation ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Custom Rules</label>
                <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={customRules} onChange={e => setCustomRules(e.target.value)} placeholder="e.g. Ensure fair shift rotation..." rows={3} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400">Cancel</button>
              <button onClick={confirmGenerateProgram} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl">Build Program</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold italic">ASE</div>
            <h1 className="text-lg font-black uppercase tracking-tighter italic">SkyOPS</h1>
          </div>
          <nav className="flex gap-1 overflow-x-auto no-scrollbar py-2">
            {['dashboard', 'flights', 'staff', 'shifts', 'program'].map(id => (
              <button key={id} onClick={() => setActiveTab(id as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>{id}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {error && (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-3xl flex items-center justify-between">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 font-bold p-2 text-xl">&times;</button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
               <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-1">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Operational Window</h4>
                    <h3 className="text-lg font-black text-slate-900 uppercase italic mb-6">Program Dates</h3>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">From</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-4 bg-slate-900 text-white rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-500/20 transition-all cursor-pointer"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">To</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-4 bg-slate-900 text-white rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-500/20 transition-all cursor-pointer"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-50">
                    <p className="text-xs font-black text-blue-600 uppercase tracking-tighter italic">Duration: {numDays} Days</p>
                  </div>
               </div>
               <div className="col-span-1 md:col-span-2">
                 <ProgramScanner onDataExtracted={handleDataExtracted} templateBinary={templateBinary} />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                <h3 className="text-3xl font-black text-slate-900 italic mb-1">{flights.length}</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Flights Registered</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                <h3 className="text-3xl font-black text-slate-900 italic mb-1">{staff.length}</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Personnel Enrolled</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                <h3 className="text-3xl font-black text-slate-900 italic mb-1">{shifts.length}</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operational Shifts</p>
              </div>
              <div className="bg-blue-900 text-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col justify-center">
                <button 
                  onClick={() => setShowConfirmDialog(true)} 
                  className="w-full py-4 bg-blue-400 text-slate-900 hover:bg-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                  disabled={flights.length === 0 || staff.length === 0 || shifts.length === 0}
                >
                  Start AI Builder
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} onAdd={(f) => setFlights([...flights, f])} onUpdate={(f) => setFlights(flights.map(prev => prev.id === f.id ? f : prev))} onDelete={(id) => setFlights(flights.filter(f => f.id !== id))} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onAdd={(s) => setStaff([...staff, s])} onDelete={(id) => setStaff(staff.filter(s => s.id !== id))} defaultMaxShifts={5} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={(s) => setShifts([...shifts, s])} onUpdate={(s) => setShifts(shifts.map(prev => prev.id === s.id ? s : prev))} onDelete={(id) => setShifts(shifts.filter(s => s.id !== id))} />}
        {activeTab === 'program' && (
          <>
            <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} onUpdatePrograms={setPrograms} templateBinary={templateBinary} />
            <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
          </>
        )}
      </main>
      
      <footer className="py-6 text-center border-t border-slate-200 bg-white">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">AI Weekly Engine • Mostafa Zaghloul • Station Operations Interface</p>
      </footer>
    </div>
  );
};

export default App;
