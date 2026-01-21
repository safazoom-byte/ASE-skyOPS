
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

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { generateAIProgram, refineAIProgram, extractDataFromContent, ShortageWarning, ResourceRecommendation, BuildResult } from './services/geminiService';

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

const isValidDateString = (str: string | null): boolean => {
  if (!str) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flights' | 'staff' | 'shifts' | 'program'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'flights' | 'staff' | 'shifts' | 'all'>('all');
  const [startDate, setStartDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.START_DATE) || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.END_DATE) || new Date(Date.now() + 518400000).toISOString().split('T')[0]);
  const [flights, setFlights] = useState<Flight[]>(() => JSON.parse(localStorage.getItem(STORAGE_KEYS.FLIGHTS) || '[]'));
  const [staff, setStaff] = useState<Staff[]>(() => JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]'));
  const [shifts, setShifts] = useState<ShiftConfig[]>(() => JSON.parse(localStorage.getItem(STORAGE_KEYS.SHIFTS) || '[]'));
  const [programs, setPrograms] = useState<DailyProgram[]>(() => JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRAMS) || '[]'));
  const [recommendations, setRecommendations] = useState<ResourceRecommendation | null>(() => JSON.parse(localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS) || 'null'));
  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '');
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '');
  const [minRestHours, setMinRestHours] = useState<number>(() => parseInt(localStorage.getItem(STORAGE_KEYS.REST_HOURS) || '12'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<number>(0); 
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showLinkWarning, setShowLinkWarning] = useState(false);
  const [unlinkedFlightsList, setUnlinkedFlightsList] = useState<Flight[]>([]);
  const [showSuccessChecklist, setShowSuccessChecklist] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [complianceLog, setComplianceLog] = useState<string[]>([]);
  const [pendingVerification, setPendingVerification] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[] } | null>(null);
  const [proposedPrograms, setProposedPrograms] = useState<DailyProgram[] | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageWarning[]>([]);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);

  const numDays = useMemo(() => {
    if (!startDate || !endDate) return 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  const activeFlightsInRange = useMemo(() => flights.filter(f => f.date >= startDate && f.date <= endDate), [flights, startDate, endDate]);
  const activeShiftsInRange = useMemo(() => shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate), [shifts, startDate, endDate]);

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

  const commitVerifiedData = () => {
    if (!pendingVerification) return;
    if (pendingVerification.staff?.length) setStaff(prev => [...prev, ...pendingVerification.staff]);
    if (pendingVerification.flights?.length) setFlights(prev => [...prev, ...pendingVerification.flights]);
    if (pendingVerification.shifts?.length) setShifts(prev => [...prev, ...pendingVerification.shifts]);
    setPendingVerification(null);
    setShowSuccessChecklist(true);
  };

  const confirmGenerateProgram = async () => {
    if (activeFlightsInRange.length === 0) { setError("No flights found."); setShowConfirmDialog(false); return; }
    setShowConfirmDialog(false); setShowLinkWarning(false); setIsGenerating(true); setError(null); setComplianceLog([]); setShowFailureModal(false);
    
    try {
      const inputData: ProgramData = { flights: activeFlightsInRange, staff, shifts: activeShiftsInRange, programs: [] };
      setGenerationStep(1); 
      let result = await generateAIProgram(inputData, `Log: ${previousDutyLog}\nReqs: ${personnelRequests}`, { numDays, customRules: '', minRestHours, startDate });
      if (!result.isCompliant) { setComplianceLog(result.validationLog || ["Phase 1 Logic Breach"]); setShowFailureModal(true); return; }

      setGenerationStep(2); 
      result = await refineAIProgram(result, inputData, 2, { minRestHours, startDate, numDays });
      if (!result.isCompliant) { setComplianceLog(result.validationLog || ["Phase 2 Logic Breach"]); setShowFailureModal(true); return; }

      setGenerationStep(3); 
      result = await refineAIProgram(result, inputData, 3, { minRestHours, startDate, numDays });
      if (!result.isCompliant) { setComplianceLog(result.validationLog || ["Phase 3 Logic Breach"]); setShowFailureModal(true); return; }

      if (result.shortageReport?.length > 0) {
        setProposedPrograms(result.programs); setShortageReport(result.shortageReport); setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs); if (result.recommendations) setRecommendations(result.recommendations);
        setActiveTab('program'); setShowSuccessChecklist(true);
      }
    } catch (err: any) { setError(err.message || "Logic engine failed."); } finally { setIsGenerating(false); setGenerationStep(0); }
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
        <div className="flex items-center gap-6"><div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Plane className="text-white" size={24} /></div><div><h1 className="text-xl font-black italic text-white uppercase tracking-tighter">SkyOPS</h1></div></div>
        <nav className="hidden md:flex items-center gap-2">
          {navigationTabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>{tab.label}</button>))}
        </nav>
      </header>

      {isGenerating && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/98 flex items-center justify-center p-8 animate-in fade-in">
           <div className="max-w-xl w-full text-center space-y-12">
              <div className="w-32 h-32 bg-blue-600/20 rounded-[2.5rem] flex items-center justify-center mx-auto animate-pulse"><Cpu size={48} className="text-blue-500" /></div>
              <h3 className="text-4xl font-black text-white italic uppercase">Audit Lockdown In Progress</h3>
              <div className="grid grid-cols-3 gap-4 relative">
                 {[1, 2, 3].map(s => (<div key={s} className={`w-14 h-14 rounded-2xl flex items-center justify-center border mx-auto ${generationStep >= s ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-700'}`}>{generationStep > s ? <Check /> : s}</div>))}
              </div>
              <p className="text-blue-400 font-black uppercase text-[10px] tracking-[0.4em] animate-pulse">Enforcing 5/2 Law compliance</p>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-12">
        {error && (<div className="mb-10 p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[3rem] flex justify-between items-center animate-bounce"><span>{error}</span><button onClick={() => setError(null)}>&times;</button></div>)}
        {activeTab === 'dashboard' && (
          <div className="space-y-12">
             <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 space-y-10">
                <h3 className="text-2xl font-black uppercase italic flex items-center gap-4"><Zap className="text-blue-600" /> Operational Parameters</h3>
                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase">Window Start/End</label><div className="flex gap-2"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl" /><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl" /></div></div>
                   <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase">Min Rest ({minRestHours}h)</label><input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="w-full accent-blue-600" /></div>
                </div>
                <button onClick={() => activeFlightsInRange.length ? setShowConfirmDialog(true) : setError("No flights.")} disabled={isGenerating} className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.4em] hover:bg-blue-600 transition-all flex items-center justify-center gap-6 group"><Sparkles /> INITIATE COMMAND SEQUENCE <ChevronRight /></button>
             </div>
          </div>
        )}
        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={f => setFlights(prev => [...prev, f])} onUpdate={u => setFlights(prev => prev.map(f => f.id === u.id ? u : f))} onDelete={id => setFlights(prev => prev.filter(f => f.id !== id))} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={u => setStaff(prev => [...prev.filter(s => s.id !== u.id), u])} onDelete={id => setStaff(prev => prev.filter(s => s.id !== id))} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={s => setShifts(prev => [...prev, s])} onUpdate={u => setShifts(prev => prev.map(s => s.id === u.id ? u : s))} onDelete={id => setShifts(prev => prev.filter(s => s.id !== id))} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      {showFailureModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] max-w-2xl w-full p-12 text-center">
              <div className="w-20 h-20 bg-rose-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
              <h3 className="text-3xl font-black uppercase italic">Compliance Breakdown</h3>
              <div className="p-6 bg-rose-50 border rounded-[2.5rem] mt-8 mb-10 max-h-[250px] overflow-auto text-left">
                 {complianceLog.map((log, i) => (<p key={i} className="text-[10px] font-bold text-rose-900 uppercase mb-2">&bull; {log}</p>))}
              </div>
              <div className="flex gap-4"><button onClick={() => setShowFailureModal(false)} className="flex-1 py-6 font-black uppercase text-slate-400">Abort</button><button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic flex items-center justify-center gap-4"><RefreshCw size={18}/> FORCE RE-BUILD</button></div>
           </div>
        </div>
      )}

      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/98 animate-in fade-in">
           <div className="bg-white rounded-[4rem] p-12 max-w-lg w-full text-center">
              <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6"><Check size={40} /></div>
              <h3 className="text-3xl font-black italic uppercase">Roster Validated</h3>
              <button onClick={() => setShowSuccessChecklist(false)} className="w-full mt-10 py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] flex items-center justify-center gap-4">VIEW DEPLOYMENT <ArrowRight size={18}/></button>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 p-6">
           <div className="bg-white rounded-[4rem] p-12 text-center max-w-lg w-full">
              <Target size={48} className="mx-auto text-blue-600 mb-8" />
              <h3 className="text-2xl font-black italic uppercase">Engage Logic Loop?</h3>
              <div className="flex gap-4 mt-10"><button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-6 text-slate-400 font-black">Cancel</button><button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase">Confirm</button></div>
           </div>
        </div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/95">
           <div className="bg-white rounded-[4.5rem] w-full max-w-5xl h-[85vh] overflow-hidden relative"><button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-10 p-4 bg-slate-100 rounded-2xl"><X /></button><div className="h-full overflow-auto"><ProgramScanner onDataExtracted={d => { setPendingVerification(d); setIsScannerOpen(false); }} startDate={startDate} initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} /></div></div>
        </div>
      )}

      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
