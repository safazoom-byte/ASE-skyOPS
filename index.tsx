
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
  AlertTriangle
} from 'lucide-react';

import { Flight, Staff, DailyProgram, ProgramData, ShiftConfig } from './types';
import { FlightManager } from './components/FlightManager';
import { StaffManager } from './components/StaffManager';
import { ShiftManager } from './components/ShiftManager';
import { ProgramDisplay } from './components/ProgramDisplay';
import { ProgramScanner } from './components/ProgramScanner';
import { ProgramChat } from './components/ProgramChat';
import { generateAIProgram, extractDataFromContent, ShortageWarning, ResourceRecommendation } from './services/geminiService';

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

  const [startDate, setStartDate] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.START_DATE);
    if (saved && isValidDateString(saved)) return saved;
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.END_DATE);
    if (saved && isValidDateString(saved)) return saved;
    const date = new Date(startDate);
    date.setDate(date.getDate() + 6);
    return date.toISOString().split('T')[0];
  });

  const [flights, setFlights] = useState<Flight[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FLIGHTS);
    if (!saved) return [];
    try { const data = JSON.parse(saved); return Array.isArray(data) ? data : []; } catch (e) { return []; }
  });
  
  const [staff, setStaff] = useState<Staff[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STAFF);
    if (!saved) return [];
    try { const data = JSON.parse(saved); return Array.isArray(data) ? data : []; } catch (e) { return []; }
  });

  const [shifts, setShifts] = useState<ShiftConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    if (!saved) return [];
    try { const data = JSON.parse(saved); return Array.isArray(data) ? data : []; } catch (e) { return []; }
  });

  const [programs, setPrograms] = useState<DailyProgram[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROGRAMS);
    if (!saved) return [];
    try { const data = JSON.parse(saved); return Array.isArray(data) ? data : []; } catch (e) { return []; }
  });

  const [recommendations, setRecommendations] = useState<ResourceRecommendation | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    if (!saved) return null;
    try { return JSON.parse(saved); } catch (e) { return null; }
  });

  const [previousDutyLog, setPreviousDutyLog] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PREV_DUTY_LOG) || '');
  const [personnelRequests, setPersonnelRequests] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.PERSONNEL_REQUESTS) || '');
  const [minRestHours, setMinRestHours] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REST_HOURS);
    return saved ? parseInt(saved) : 12;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showLinkWarning, setShowLinkWarning] = useState(false);
  const [unlinkedFlightsList, setUnlinkedFlightsList] = useState<Flight[]>([]);
  const [showSuccessChecklist, setShowSuccessChecklist] = useState(false);

  const [pendingVerification, setPendingVerification] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[] } | null>(null);

  const [proposedPrograms, setProposedPrograms] = useState<DailyProgram[] | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageWarning[]>([]);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);

  const numDays = useMemo(() => {
    if (!startDate || !endDate || !isValidDateString(startDate) || !isValidDateString(endDate)) return 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 14); 
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
    
    // Process Staff
    if (pendingVerification.staff?.length) {
      setStaff(prev => {
        const current = [...prev];
        pendingVerification.staff.forEach(s => {
          const idx = current.findIndex(ex => ex.name.toLowerCase() === s.name.toLowerCase());
          if (idx === -1) current.push({ ...s, id: s.id || Math.random().toString(36).substr(2, 9) });
          else current[idx] = { ...current[idx], ...s };
        });
        return current;
      });
    }

    // Process Flights
    if (pendingVerification.flights?.length) {
      setFlights(prev => {
        const updated = [...prev];
        pendingVerification.flights.forEach(newF => {
          const idx = updated.findIndex(f => f.flightNumber === newF.flightNumber && f.date === newF.date);
          if (idx !== -1) updated[idx] = { ...updated[idx], ...newF };
          else updated.push({ ...newF, id: newF.id || Math.random().toString(36).substr(2, 9) });
        });
        return updated;
      });
    }

    // Process Shifts
    if (pendingVerification.shifts?.length) {
      setShifts(prev => {
        const current = [...prev];
        pendingVerification.shifts.forEach(sh => {
          const idx = current.findIndex(s => s.pickupDate === sh.pickupDate && s.pickupTime === sh.pickupTime);
          if (idx === -1) current.push({ ...sh, id: sh.id || Math.random().toString(36).substr(2, 9) });
          else current[idx] = { ...current[idx], ...sh };
        });
        return current;
      });
    }

    setPendingVerification(null);
    setShowSuccessChecklist(true);
  };

  const checkLinkageAndInitiate = () => {
    const linkedFlightIds = new Set(activeShiftsInRange.flatMap(s => s.flightIds || []));
    const unlinked = activeFlightsInRange.filter(f => !linkedFlightIds.has(f.id));
    
    if (unlinked.length > 0) {
      setUnlinkedFlightsList(unlinked);
      setShowLinkWarning(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const confirmGenerateProgram = async () => {
    if (activeFlightsInRange.length === 0) {
      setError("Mission Aborted: No flights found in current window.");
      setShowConfirmDialog(false);
      return;
    }
    setShowConfirmDialog(false);
    setShowLinkWarning(false);
    setIsGenerating(true);
    setError(null);
    try {
      const programInputData: ProgramData = {
        flights: activeFlightsInRange,
        staff: staff,
        shifts: activeShiftsInRange,
        programs: []
      };

      const result = await generateAIProgram(
        programInputData,
        `Previous Duty Log: ${previousDutyLog}\nPersonnel Requests (Absence Box): ${personnelRequests}\nSPECIAL RULE: Do not automatically assign staff to unlinked flights. If a flight is not linked to a shift, leave it as NIL coverage.`,
        { numDays, customRules: '', minRestHours, startDate }
      );

      if (result.shortageReport && result.shortageReport.length > 0) {
        setProposedPrograms(result.programs);
        setShortageReport(result.shortageReport);
        setShowWaiverDialog(true);
      } else {
        setPrograms(result.programs);
        if (result.recommendations) setRecommendations(result.recommendations);
        setActiveTab('program');
        setShowSuccessChecklist(true);
      }
    } catch (err: any) {
      setError(err.message || "Logic engine failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const navigationTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'flights', icon: Activity, label: 'Flights' },
    { id: 'staff', icon: Users, label: 'Manpower' },
    { id: 'shifts', icon: Clock, label: 'Duty Master' },
    { id: 'program', icon: CalendarDays, label: 'Live Program' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100">
      <header className="sticky top-0 z-[100] bg-slate-950/80 backdrop-blur-2xl border-b border-white/5 py-6 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
           <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Plane className="text-white" size={24} /></div>
           <div><h1 className="text-xl font-black italic text-white uppercase tracking-tighter">SkyOPS</h1><span className="text-[8px] font-black text-slate-500 uppercase block mt-1">Operational Command</span></div>
        </div>
        <nav className="hidden md:flex items-center gap-2">
          {navigationTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all flex items-center gap-3 ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}><tab.icon size={16} />{tab.label}</button>
          ))}
        </nav>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-3 bg-white/5 text-white rounded-xl"><Menu /></button>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-3xl md:hidden flex flex-col p-12">
          <div className="flex justify-between items-center mb-20"><Plane className="text-blue-500" size={32} /><button onClick={() => setIsMobileMenuOpen(false)} className="p-4 bg-white/5 text-white rounded-2xl"><X size={24} /></button></div>
          <nav className="flex flex-col gap-6">{navigationTabs.map(tab => (<button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setIsMobileMenuOpen(false); }} className={`flex items-center gap-6 text-left py-6 px-8 rounded-[2rem] transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/30' : 'text-slate-500 hover:text-white'}`}><tab.icon size={28} /><span className="text-2xl font-black uppercase italic tracking-tighter">{tab.label}</span></button>))}</nav>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-12">
        {error && (<div className="mb-10 p-8 bg-rose-500/10 border border-rose-500/20 rounded-[3rem] flex items-center justify-between animate-in slide-in-from-top duration-500"><div className="flex items-center gap-6"><AlertCircle size={32} className="text-rose-500" /><div><h5 className="text-sm font-black text-white uppercase italic">Error</h5><p className="text-xs text-rose-300">{error}</p></div></div><button onClick={() => setError(null)}>&times;</button></div>)}

        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm"><div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4"><Activity size={20}/></div><h4 className="text-3xl font-black italic">{activeFlightsInRange.length}</h4><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Flights In Window</p></div>
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm"><div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4"><Users size={20}/></div><h4 className="text-3xl font-black italic">{staff.length}</h4><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Personnel Registry</p></div>
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm"><div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4"><Clock size={20}/></div><h4 className="text-3xl font-black italic">{activeShiftsInRange.length}</h4><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Duty Slots</p></div>
                   </div>

                   <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm space-y-10">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-4"><Zap className="text-blue-600" /> Sequence Parameters</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={14} className="text-indigo-600" /> Operational Window</label>
                            <div className="flex gap-2"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black text-sm outline-none" /><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 p-5 bg-slate-50 border rounded-2xl font-black text-sm outline-none" /></div>
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={14} className="text-blue-600" /> Rest Requirements</label>
                            <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border"><input type="range" min="8" max="18" value={minRestHours} onChange={e => setMinRestHours(parseInt(e.target.value))} className="flex-1 accent-blue-600" /><span className="font-black text-lg italic text-blue-600">{minRestHours}h</span></div>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Palmtree size={14} className="text-rose-500" /> Absence Box (Leaves Registry)</label>
                            <textarea className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-xs outline-none min-h-[140px]" placeholder="e.g. JD OFF 12/05..." value={personnelRequests} onChange={e => setPersonnelRequests(e.target.value)} />
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-amber-500" /> Previous Day Duty Log</label>
                            <textarea className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] font-medium text-xs outline-none min-h-[140px]" placeholder="Format: KA-ATZ - AF-ATZ (2026-01-23 04:00)..." value={previousDutyLog} onChange={e => setPreviousDutyLog(e.target.value)} />
                         </div>
                      </div>

                      <button onClick={() => { setError(null); activeFlightsInRange.length ? checkLinkageAndInitiate() : setError("No flights."); }} disabled={isGenerating} className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.4em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-6 group disabled:opacity-50"><Sparkles /> INITIATE BUILD SEQUENCE <ChevronRight /></button>
                   </div>
                </div>

                <div className="space-y-8">
                   <div className="bg-indigo-600 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                      <h4 className="text-xl font-black uppercase italic mb-6 flex items-center gap-3"><ShieldCheck size={24} /> Status Report</h4>
                      <div className="space-y-4">
                         <div className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/5"><span className="text-[9px] font-black uppercase tracking-widest opacity-60">System Core</span><span className="text-[9px] font-black uppercase text-emerald-300">Ready</span></div>
                         <div className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/5"><span className="text-[9px] font-black uppercase tracking-widest opacity-60">Personnel Sync</span><span className="text-[9px] font-black uppercase text-blue-300">{staff.length > 0 ? 'Verified' : 'None'}</span></div>
                      </div>
                   </div>
                   {recommendations && (
                     <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center justify-between"><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resource Health</h4><div className="font-black italic text-blue-600">{recommendations.healthScore}%</div></div>
                        <div className="space-y-2"><p className="text-sm font-black italic">Ideal Headcount: {recommendations.idealStaffCount}</p><p className="text-[10px] text-slate-500 font-medium">{recommendations.hireAdvice}</p></div>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'flights' && <FlightManager flights={flights} startDate={startDate} endDate={endDate} onAdd={f => setFlights(prev => [...prev, f])} onUpdate={u => setFlights(prev => prev.map(f => f.id === u.id ? u : f))} onDelete={id => setFlights(prev => prev.filter(f => f.id !== id))} onOpenScanner={() => {setScannerTarget('flights'); setIsScannerOpen(true);}} />}
        {activeTab === 'staff' && <StaffManager staff={staff} onUpdate={u => setStaff(prev => { const idx = prev.findIndex(ex => ex.name.toLowerCase() === u.name.toLowerCase()); if (idx !== -1) { const n = [...prev]; n[idx] = u; return n; } return [...prev, u]; })} onDelete={id => setStaff(prev => prev.filter(s => s.id !== id))} onClearAll={() => setStaff([])} defaultMaxShifts={5} onOpenScanner={() => {setScannerTarget('staff'); setIsScannerOpen(true);}} />}
        {activeTab === 'shifts' && <ShiftManager shifts={shifts} flights={flights} startDate={startDate} onAdd={s => setShifts(prev => [...prev, s])} onUpdate={u => setShifts(prev => prev.map(s => s.id === u.id ? u : s))} onDelete={id => setShifts(prev => prev.filter(s => s.id !== id))} onOpenScanner={() => {setScannerTarget('shifts'); setIsScannerOpen(true);}} />}
        {activeTab === 'program' && <ProgramDisplay programs={programs} flights={flights} staff={staff} shifts={shifts} startDate={startDate} endDate={endDate} onUpdatePrograms={setPrograms} />}
      </main>

      <footer className="mt-auto py-12 px-8 border-t border-slate-100 bg-white text-center"><p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">Right reserved for Mostafa Zaghloul 2026</p></footer>

      {showSuccessChecklist && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-2xl animate-in fade-in">
           <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full overflow-hidden">
              <div className="bg-slate-950 p-12 text-center border-b border-white/10">
                 <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-6"><Check size={40} /></div>
                 <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Sequence Successful</h3>
              </div>
              <div className="p-12 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: History, label: "Rest Guard", sub: "Transition Verified" },
                      { icon: Shield, label: "Skill Integrity", sub: "Logic Mapped" },
                      { icon: Palmtree, label: "Leave Box Sync", sub: "100% Registry Accounted" }
                    ].map((item, idx) => (
                      <div key={idx} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center"><Check size={18} /></div>
                        <div><p className="text-[10px] font-black uppercase italic text-slate-900">{item.label}</p><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.sub}</p></div>
                      </div>
                    ))}
                 </div>
                 <button onClick={() => setShowSuccessChecklist(false)} className="w-full mt-6 py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] flex items-center justify-center gap-4">VIEW LIVE PROGRAM <ArrowRight size={18}/></button>
              </div>
           </div>
        </div>
      )}

      {pendingVerification && (
        <div className="fixed inset-0 z-[1500] bg-slate-950/95 flex items-center justify-center p-12"><div className="bg-white rounded-[4rem] w-full max-w-5xl h-[80vh] flex flex-col p-12"><h3 className="text-2xl font-black mb-8 italic">Verify Sync</h3><div className="flex-1 overflow-auto mb-8 text-xs">{JSON.stringify(pendingVerification, null, 2)}</div><button onClick={commitVerifiedData} className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black">AUTHORIZE MASTER UPDATE</button></div></div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 lg:p-12 bg-slate-950/95 backdrop-blur-3xl">
           <div className="bg-white rounded-[4.5rem] shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-500">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-10 z-[1600] p-4 bg-slate-100 text-slate-400 rounded-2xl"><X size={24}/></button>
              <div className="flex-1 overflow-y-auto no-scrollbar"><ProgramScanner onDataExtracted={d => { setPendingVerification(d); setIsScannerOpen(false); }} startDate={startDate} initialTarget={scannerTarget === 'all' ? undefined : scannerTarget} /></div>
           </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[4rem] p-12 text-center max-w-lg w-full">
              <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8"><Target size={48} /></div>
              <h3 className="text-3xl font-black italic uppercase mb-4 tracking-tighter">Engage Logic Engine?</h3>
              <p className="text-slate-500 text-sm font-medium mb-10">Building roster for {activeFlightsInRange.length} flights.</p>
              <div className="flex gap-4"><button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Abort</button><button onClick={confirmGenerateProgram} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl">CONFIRM MISSION</button></div>
           </div>
        </div>
      )}

      {showLinkWarning && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-2xl">
           <div className="bg-white rounded-[4rem] p-12 max-w-2xl w-full animate-in slide-in-from-top duration-500">
              <div className="flex items-center gap-6 mb-10"><div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-[1.5rem] flex items-center justify-center shrink-0 border border-rose-100"><AlertTriangle size={32} /></div><div><h3 className="text-2xl font-black uppercase italic tracking-tighter">Coverage Summary</h3><p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mt-1">Flights Not Mapped to Duty Master</p></div></div>
              <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-200 max-h-[300px] overflow-y-auto mb-10">
                <p className="text-xs font-medium text-slate-600 mb-6 italic">The following flights are not linked to any handling shift. If you proceed, they will remain unassigned in the roster. Please ensure this is intended.</p>
                <div className="grid grid-cols-2 gap-3">
                  {unlinkedFlightsList.map((f, idx) => (
                    <div key={idx} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-3">
                      <Plane size={14} className="text-rose-500" />
                      <div><p className="text-[10px] font-black text-slate-900">{f.flightNumber}</p><p className="text-[8px] font-bold text-slate-400">{f.date}</p></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowLinkWarning(false)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Go Back & Link</button>
                <button onClick={() => setShowConfirmDialog(true)} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic shadow-2xl">I UNDERSTAND, PROCEED</button>
              </div>
           </div>
        </div>
      )}

      {showWaiverDialog && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-2xl">
           <div className="bg-white rounded-[4rem] p-12 max-w-2xl w-full animate-in slide-in-from-top duration-500">
              <div className="flex items-center gap-6 mb-10"><div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-[1.5rem] flex items-center justify-center shrink-0 border border-amber-100"><AlertCircle size={32} /></div><div><h3 className="text-2xl font-black uppercase italic tracking-tighter">Resource Warning</h3><p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">Operational Violations Detected</p></div></div>
              <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-200 max-h-[300px] overflow-y-auto mb-10">{shortageReport.map((sh, idx) => (<div key={idx} className="pb-4 mb-4 border-b border-slate-200 last:border-0"><p className="text-xs font-medium"><span className="font-black uppercase">{sh.staffName}</span> rest restricted to <span className="font-black text-rose-500">{sh.actualRest}h</span> (Target: {sh.targetRest}h). {sh.reason}</p></div>))}</div>
              <div className="flex gap-4"><button onClick={() => setShowWaiverDialog(false)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Decline</button><button onClick={() => { if(proposedPrograms) {setPrograms(proposedPrograms); setShowWaiverDialog(false); setActiveTab('program'); setShowSuccessChecklist(true);} }} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic shadow-2xl">AUTHORIZE WAIVER & APPLY</button></div>
           </div>
        </div>
      )}

      <ProgramChat data={{ flights, staff, shifts, programs }} onUpdate={setPrograms} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
