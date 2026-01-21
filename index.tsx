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
  Check,
  Calendar,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  ClipboardCheck,
  Send,
  MousePointer2,
  Fingerprint,
  Shield,
  Briefcase,
  FileText,
  AlertTriangle,
  Cpu,
  Loader2,
  Scale,
  RefreshCw
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types.ts';
import { FlightManager } from './components/FlightManager.tsx';
import { StaffManager } from './components/StaffManager.tsx';
import { ShiftManager } from './components/ShiftManager.tsx';
import { ProgramDisplay } from './components/ProgramDisplay.tsx';
import { ProgramScanner } from './components/ProgramScanner.tsx';
import { ProgramChat } from './components/ProgramChat.tsx';
import { generateAIProgram, refineAIProgram, extractDataFromContent, ShortageWarning, ResourceRecommendation, BuildResult } from './services/geminiService.ts';

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

const getSafeLocalStorageArray = <T,>(key: string): T[] => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Error parsing localStorage key ${key}:`, e);
    return [];
  }
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [startDate, setStartDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.START_DATE) || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.END_DATE) || new Date(Date.now() + 518400000).toISOString().split('T')[0]);
  
  const [flights, setFlights] = useState<Flight[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.FLIGHTS));
  const [staff, setStaff] = useState<Staff[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.STAFF));
  const [shifts, setShifts] = useState<ShiftConfig[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.SHIFTS));
  const [programs, setPrograms] = useState<DailyProgram[]>(() => getSafeLocalStorageArray(STORAGE_KEYS.PROGRAMS));
  
  const [recommendations, setRecommendations] = useState<ResourceRecommendation | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '');
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '');
  const [minRestHours, setMinRestHours] = useState<number>(() => parseInt(localStorage.getItem(STORAGE_KEYS.REST_HOURS) || '12'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<number>(0); 
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessChecklist, setShowSuccessChecklist] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [complianceLog, setComplianceLog] = useState<string[]>([]);
  const [pendingVerification, setPendingVerification] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[] } | null>(null);
  const [proposedPrograms, setProposedPrograms] = useState<DailyProgram[] | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageWarning[]>([]);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');

  const numDays = useMemo(() => {
    if (!startDate || !endDate) return 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  const activeFlightsInRange = useMemo(() => (flights || []).filter(f => f.date >= startDate && f.date <= endDate), [flights, startDate, endDate]);
  const activeShiftsInRange = useMemo(() => (shifts || []).filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate), [shifts, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(flights || []));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff || []));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts || []));
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(programs || []));
    localStorage.setItem(STORAGE_KEYS.START_DATE, startDate);
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
    localStorage.setItem(STORAGE_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recommendations));
    localStorage.setItem(STORAGE_KEYS.PREV_DUTY_LOG, previousDutyLog);
    localStorage.setItem(STORAGE_KEYS.PERSONNEL_REQUESTS, personnelRequests);
  }, [flights, staff, shifts, programs, startDate, endDate, minRestHours, recommendations, previousDutyLog, personnelRequests]);

  const commitVerifiedData = () => {
    if (!pendingVerification) return;
    
    // Helper to ensure an ID exists
    const ensureId = (obj: any) => ({
      ...obj,
      id: obj.id || Math.random().toString(36).substr(2, 9)
    });

    setStaff(prev => {
      const p = prev || [];
      const existingIds = new Set(p.map(s => s.id));
      const existingInitials = new Set(p.map(s => (s.initials || "").toUpperCase().trim()));
      
      const newStaff = (pendingVerification.staff || [])
        .map(ensureId)
        .filter(s => !existingIds.has(s.id) && !existingInitials.has((s.initials || "").toUpperCase().trim()));
        
      return [...p, ...newStaff];
    });

    setFlights(prev => {
      const p = prev || [];
      const existingKeys = new Set(p.map(f => `${f.flightNumber.toUpperCase().trim()}-${f.date}`));
      
      const newFlights = (pendingVerification.flights || [])
        .map(ensureId)
        .filter(f => !existingKeys.has(`${f.flightNumber.toUpperCase().trim()}-${f.date}`));
        
      return [...p, ...newFlights];
    });

    setShifts(prev => {
      const p = prev || [];
      const existingKeys = new Set(p.map(s => `${s.pickupDate}-${s.pickupTime.trim()}`));
      
      const newShifts = (pendingVerification.shifts || [])
        .map(ensureId)
        .filter(s => !existingKeys.has(`${s.pickupDate}-${s.pickupTime.trim()}`));
        
      return [...p, ...newShifts];
    });

    setPendingVerification(null);
    setShowSuccessChecklist(true);
  };

  const confirmGenerateProgram = async () => {
    if (activeFlightsInRange.length === 0) { setError("No flights in window."); setShowConfirmDialog(false); return; }
    setShowConfirmDialog(false); setIsGenerating(true); setComplianceLog([]); setShowFailureModal(false);
    
    try {
      const inputData: ProgramData = { flights: activeFlightsInRange, staff: staff || [], shifts: activeShiftsInRange, programs: [] };
      setGenerationStep(1); 
      let result = await generateAIProgram(inputData, `Log: ${previousDutyLog}\nRequests: ${personnelRequests}`, { numDays, customRules: '', minRestHours, startDate });
      
      if (!result.isCompliant) { 
        setComplianceLog(result.validationLog || ["Phase 1: Compliance Breach"]); 
        setShowFailureModal(true); return; 
      }

      setGenerationStep(2); 
      result = await refineAIProgram(result, inputData, 2, { minRestHours, startDate, numDays });
      if (!result.isCompliant) { 
        setComplianceLog(result.validationLog || ["Phase 2: Logic Deviation"]); 
        setShowFailureModal(true); return; 
      }

      setGenerationStep(3); 
      result = await refineAIProgram(result, inputData, 3, { minRestHours, startDate, numDays });
      if (!result.isCompliant) { 
        setComplianceLog(result.validationLog || ["Phase 3: Equity Failure"]); 
        setShowFailureModal(true); return; 
      }

      if (result.shortageReport && result.shortageReport.length > 0) {
        setProposedPrograms(result.programs); setShortageReport(result.shortageReport); setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs || []); if (result.recommendations) setRecommendations(result.recommendations);
        setActiveTab('program'); setShowSuccessChecklist(true);
      }
    } catch (err: any) { 
      console.error(err);
      setError(err.message || "An unexpected error occurred during generation."); 
    } 
    finally { setIsGenerating(false); setGenerationStep(0); }
  };

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="sticky top-0 z-[100] bg-slate-950/80 backdrop-blur-2xl border-b border-white/5 py-6 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
           <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Plane className="text-white" size={24} /></div>
           <div><h1 className="text-xl font-black italic text-white uppercase tracking-tighter">SkyOPS</h1><span className="text-[8px] font-black text-slate-500 uppercase block mt-1">Operational Command</span></div>
        </div>
        <nav className="hidden md:flex items-center gap-2">
          {navigationTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}><tab.icon size={16} className="mr-2 inline" />{tab.label}</button>
          ))}
        </nav>
      </header>

      {isGenerating && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/98 flex items-center justify-center p-8 animate-in fade-in">
           <div className="max-w-xl w-full text-center space-y-12">
              <div className="w-32 h-32 bg-blue-600/20 rounded-[2.5rem] flex items-center justify-center mx-auto animate-pulse"><Cpu size={48} className="text-blue-500" /></div>
              <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter">Triple-Pass Logic Lockdown</h3>
              <div className="grid grid-cols-3 gap-4 relative">
                 {[1, 2, 3].map(s => (<div key={s} className={`w-14 h-14 rounded-2xl flex items-center justify-center border mx-auto transition-all ${generationStep >= s ? 'bg-blue-600 text-white shadow-xl' : 'bg-slate-900 text-slate-700'}`}>{generationStep > s ? <Check /> : s}</div>))}
              </div>
              <p className="text-blue-400 font-black uppercase text-[10px] tracking-[0.4em] animate-pulse">Enforcing 100% 5/2 Law compliance</p>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-12">
        {error && (<div className="mb-10 p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[3rem] flex justify-between items-center"><span>{error}</span><button onClick={() => setError(null)}>&times;</button></div>)}
        
        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm"><Activity className="text-blue-600 mb-4" /><h4 className="text-3xl font-black italic">{activeFlightsInRange.length}</h4><p className="text-[10px] font-black text-slate-400 uppercase">Flights</p></div>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm"><Users className="text-indigo-600 mb-4" /><h4 className="text-3xl font-black italic">{(staff || []).length}</h4><p className="text-[10px] font-black text-slate-400 uppercase">Registry</p></div>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm"><Clock className="text-amber-600 mb-4" /><h4 className="text-3xl font-black italic">{activeShiftsInRange.length}</h4><p className="text-[10px] font-black text-slate-400 uppercase">Duty Slots</p></div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 space-y-6">
                  <h4 className="text-xl font-black italic uppercase flex items-center gap-4 text-slate-900">
                    <Briefcase className="text-blue-600" /> Requested Day Off / Leave Matrix
                  </h4>
                  <textarea 
                    className="w-full h-48 p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-sm outline-none focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"
                    placeholder="E.g. J.D. requested Friday OFF, S.K. on sick leave tomorrow..."
                    value={personnelRequests}
                    onChange={e => setPersonnelRequests(e.target.value)}
                  />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Overrides standard 5/2 Law for specific agents.</p>
                </div>
                
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 space-y-6">
                  <h4 className="text-xl font-black italic uppercase flex items-center gap-4 text-slate-900">
                    <History className="text-indigo-600" /> Previous Duty Log / Handover
                  </h4>
                  <textarea 
                    className="w-full h-48 p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all resize-none"
                    placeholder="Paste handover logs or notes from previous shift here..."
                    value={previousDutyLog}
                    onChange={e => setPreviousDutyLog(e.target.value)}
                  />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">AI uses this to maintain continuity and equity.</p>
                </div>
             </div>

             <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 space-y-10">
                <h3 className="text-2xl font-black uppercase italic flex items-center gap-4"><Zap className="text-blue-600" /> Operational Context</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Operational Window</label>
                      <div className="flex gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black" />
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black" />
                      </div>
                   </div>
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Min Rest ({minRestHours}h)</label>
                      <input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="w-full accent-blue-600" />
                   </div>
                </div>
                <button 
                  onClick={() => activeFlightsInRange.length ? setShowConfirmDialog(true) : setError("No flights in window.")} 
                  disabled={isGenerating} 
                  className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.4em] hover:bg-blue-600 transition-all flex items-center justify-center gap-6 shadow-2xl"
                >
                  <Sparkles /> INITIATE COMMAND SEQUENCE <ChevronRight />
                </button>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights || []} startDate={startDate} endDate={endDate} onAdd={f => setFlights(prev => [...(prev || []), f])} onUpdate={u => setFlights(prev => (prev || []).map(f => f.id === u.id ? u : f))} onDelete={id => setFlights(prev => (prev || []).filter(f => f.id !== id))} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff || []} onUpdate={u => setStaff(prev => { const p = prev || []; const exists = p.find(s => s.id === u.id); return exists ? p.map(s => s.id === u.id ? u : s) : [...p, u]; })} onDelete={id => setStaff(prev => (prev || []).filter(s => s.id !== id))} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts || []} flights={flights || []} startDate={startDate} onAdd={s => setShifts(prev => [...(prev || []), s])} onUpdate={u => setShifts(prev => (prev || []).map(s => s.id === u.id ? u : s))} onDelete={id => setShifts(prev => (prev || []).filter(s => s.id !== id))} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs || []} flights={flights || []} staff={staff || []} shifts={shifts || []} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      {showFailureModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] max-w-2xl w-full p-12 text-center">
              <AlertTriangle size={60} className="mx-auto text-rose-600 mb-6" />
              <h3 className="text-3xl font-black uppercase italic text-rose-600">Compliance Lockdown</h3>
              <p className="text-slate-500 text-xs font-bold uppercase mt-2 mb-8 italic">Operation Abortion: Logical laws were breached</p>
              <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2.5rem] mb-10 max-h-[300px] overflow-auto text-left space-y-3">
                 {complianceLog.map((log, i) => (<p key={i} className="text-[10px] font-bold text-rose-900 leading-tight border-b border-rose-100 pb-2 uppercase">&bull; {log}</p>))}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowFailureModal(false)} className="flex-1 py-6 font-black uppercase text-slate-400">Abort</button>
                <button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic flex items-center justify-center gap-4"><RefreshCw size={18}/> RE-ENGAGE REPAIR LOOP</button>
              </div>
           </div>
        </div>
      )}

      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] p-12 max-w-lg w-full text-center">
              <Check size={60} className="mx-auto text-emerald-500 mb-6" />
              <h3 className="text-3xl font-black italic uppercase">Roster Validated</h3>
              <p className="text-slate-400 text-[10px] font-black uppercase mt-2">All constraints strictly satisfied</p>
              <button onClick={() => setShowSuccessChecklist(false)} className="w-full mt-10 py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] flex items-center justify-center gap-4">DEPLOY PROGRAM <ArrowRight size={18}/></button>
           </div>
        </div>
      )}

      {pendingVerification && (
        <div className="fixed inset-0 z-[1500] bg-slate-950/95 flex items-center justify-center p-12">
           <div className="bg-white rounded-[4rem] w-full max-w-5xl h-[80vh] flex flex-col p-12">
              <h3 className="text-2xl font-black mb-8 italic">Verify Source Data</h3>
              <div className="flex-1 overflow-auto mb-8 bg-slate-50 p-6 rounded-3xl font-mono text-xs">{JSON.stringify(pendingVerification, null, 2)}</div>
              <button onClick={commitVerifiedData} className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic">AUTHORIZE MASTER SYNC</button>
           </div>
        </div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/95">
           <div className="bg-white rounded-[4.5rem] w-full max-w-5xl h-[85vh] overflow-hidden relative">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-10 p-4 bg-slate-100 rounded-2xl"><X /></button>
              <div className="h-full overflow-auto"><ProgramScanner onDataExtracted={d => { setPendingVerification(d); setIsScannerOpen(false); }} startDate={startDate} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-6">
           <div className="bg-white rounded-[4rem] p-12 text-center max-w-lg w-full">
              <Target size={60} className="mx-auto text-blue-600 mb-8" />
              <h3 className="text-3xl font-black italic uppercase">Engage Logic Engine?</h3>
              <p className="text-slate-400 text-xs font-medium mt-4">Initiating hard-lockdown compliance build for {activeFlightsInRange.length} flights.</p>
              <div className="flex gap-4 mt-10"><button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-6 text-slate-400 font-black">Cancel</button><button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic">ENGAGE</button></div>
           </div>
        </div>
      )}

      <ProgramChat data={{ flights: flights || [], staff: staff || [], shifts: shifts || [], programs: programs || [] }} onUpdate={setPrograms} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);