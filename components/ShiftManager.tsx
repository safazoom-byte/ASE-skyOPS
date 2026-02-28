import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill, Staff, LeaveRequest } from '../types';
import { AVAILABLE_SKILLS, DAYS_OF_WEEK_FULL } from '../constants';
import * as XLSX from 'xlsx';
import { 
  Clock, 
  Trash2, 
  Edit2, 
  Plus, 
  Minus, 
  FileDown, 
  Calendar, 
  Sparkles, 
  Plane, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ArrowRight,
  Shield,
  Box,
  Truck,
  Terminal,
  Search,
  Activity,
  Layers,
  Zap,
  Layout,
  Lock,
  ChevronRight,
  ChevronLeft,
  MoveHorizontal,
  CalendarX,
  Coffee,
  AlertTriangle,
  X
} from 'lucide-react';

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  staff: Staff[];
  leaveRequests: LeaveRequest[];
  startDate?: string;
  onAdd: (s: ShiftConfig) => void;
  onUpdate: (s: ShiftConfig) => void;
  onDelete: (id: string) => void;
  onOpenScanner?: () => void;
}

export const ShiftManager: React.FC<Props> = ({ shifts = [], flights = [], staff = [], leaveRequests = [], startDate, onAdd, onUpdate, onDelete, onOpenScanner }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ShiftConfig>>({
    pickupDate: startDate || new Date().toISOString().split('T')[0],
    pickupTime: '06:00',
    endDate: startDate || new Date().toISOString().split('T')[0],
    endTime: '14:00',
    minStaff: 2,
    maxStaff: 8,
    targetPower: 75,
    flightIds: [],
    roleCounts: {}
  });

  // --- BULK SHIFT CREATOR STATE ---
  interface BulkShiftTemplate {
    id: string;
    pickupTime: string;
    endTime: string;
    minStaff: number;
    maxStaff: number;
    roleCounts: Record<string, number>;
  }

  const [showBulkModal, setShowBulkModal] = useState(false);
  
  // Weekly State
  const [bulkStartDate, setBulkStartDate] = useState(startDate || new Date().toISOString().split('T')[0]);
  const [bulkEndDate, setBulkEndDate] = useState(() => {
    const d = new Date(startDate || new Date());
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  });
  const [bulkDays, setBulkDays] = useState<number[]>([1,2,3,4,5]); // Mon-Fri default
  const [bulkTemplates, setBulkTemplates] = useState<BulkShiftTemplate[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      pickupTime: '06:00',
      endTime: '14:00',
      minStaff: 2,
      maxStaff: 8,
      roleCounts: {}
    }
  ]);

  const handleBulkCreateWeekly = () => {
    const start = new Date(bulkStartDate);
    const end = new Date(bulkEndDate);
    const newShifts: ShiftConfig[] = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (bulkDays.includes(d.getDay())) {
        const dateStr = d.toISOString().split('T')[0];
        
        bulkTemplates.forEach(template => {
          let endDateStr = dateStr;
          if (template.endTime < template.pickupTime) {
            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 1);
            endDateStr = nextDay.toISOString().split('T')[0];
          }

          newShifts.push({
            id: Math.random().toString(36).substr(2, 9),
            day: getDayOffset(dateStr),
            pickupDate: dateStr,
            pickupTime: template.pickupTime,
            endDate: endDateStr,
            endTime: template.endTime,
            minStaff: template.minStaff,
            maxStaff: template.maxStaff,
            targetPower: 75,
            roleCounts: { ...template.roleCounts },
            flightIds: []
          });
        });
      }
    }
    
    if (newShifts.length === 0) {
      alert("No days matched your selection in this date range.");
      return;
    }
    
    if (!window.confirm(`This will create ${newShifts.length} shifts. Proceed?`)) return;
    
    newShifts.forEach(s => onAdd(s));
    setShowBulkModal(false);
  };
  // --------------------------------

  const getDayOffset = (dateStr: string) => {
    if (!startDate || !dateStr) return 0;
    const start = new Date(startDate);
    const target = new Date(dateStr);
    if (isNaN(start.getTime()) || isNaN(target.getTime())) return 0;
    
    start.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - start.getTime();
    // Clamp to 0 to prevent negative indices
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  const availableFlights = useMemo(() => {
    if (!formData.pickupDate) return [];
    const targetDate = new Date(formData.pickupDate);
    return flights.filter(f => {
      const flightDate = new Date(f.date);
      const diffDays = Math.abs(flightDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 1;
    });
  }, [flights, formData.pickupDate]);

  const engagedFlightIds = useMemo(() => {
    const engaged = new Set<string>();
    shifts.forEach(s => {
      if (s.id !== editingId) {
        s.flightIds?.forEach(fid => engaged.add(fid));
      }
    });
    return engaged;
  }, [shifts, editingId]);

  const toggleFlightEngagement = (flightId: string) => {
    if (engagedFlightIds.has(flightId)) return;
    const current = formData.flightIds || [];
    const next = current.includes(flightId) 
      ? current.filter(id => id !== flightId) 
      : [...current, flightId];
    setFormData(prev => ({ ...prev, flightIds: next }));
  };

  const formatTimeInput = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length <= 2) return cleaned;
    let hh = cleaned.slice(0, 2);
    let mm = cleaned.slice(2, 4);
    if (parseInt(hh) > 23) hh = '23';
    if (parseInt(mm) > 59) mm = '59';
    return hh + ':' + mm;
  };

  const calculateDuration = () => {
    if (!formData.pickupTime || !formData.endTime) return null;
    try {
      const [h1, m1] = formData.pickupTime.split(':').map(Number);
      const [h2, m2] = formData.endTime.split(':').map(Number);
      const startMins = h1 * 60 + (m1 || 0);
      let endMins = h2 * 60 + (m2 || 0);
      
      if (formData.endDate && formData.pickupDate && formData.endDate > formData.pickupDate) {
        endMins += 1440;
      } else if (endMins < startMins) {
        endMins += 1440;
      }
      
      const diff = endMins - startMins;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hours}h ${mins}m`;
    } catch(e) { return null; }
  };

  const updateRoleCount = (skill: Skill, delta: number) => {
    const current = formData.roleCounts || {};
    const newVal = Math.max(0, (Number(current[skill]) || 0) + delta);
    setFormData(prev => ({
      ...prev,
      roleCounts: { ...current, [skill]: newVal }
    }));
  };

  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getStaffById = (id: string) => staff.find(s => s.id === id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { 
      ...formData as ShiftConfig, 
      day: getDayOffset(formData.pickupDate!), 
      id: editingId || Math.random().toString(36).substr(2, 9) 
    };
    if (editingId) onUpdate(finalData);
    else onAdd(finalData);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      pickupDate: startDate || new Date().toISOString().split('T')[0], 
      pickupTime: '06:00', 
      endDate: startDate || new Date().toISOString().split('T')[0], 
      endTime: '14:00', 
      minStaff: 2, 
      maxStaff: 8, 
      targetPower: 75, 
      flightIds: [], 
      roleCounts: {} 
    });
    setEditingId(null);
  };

  const startEdit = (shift: ShiftConfig) => { 
    setEditingId(shift.id); 
    setFormData({ ...shift }); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const getSkillIcon = (skill: string) => {
    switch (skill) {
      case 'Shift Leader': return <Shield size={16} />;
      case 'Load Control': return <Box size={16} />;
      case 'Ramp': return <Truck size={16} />;
      case 'Operations': return <Terminal size={16} />;
      case 'Lost and Found': return <Search size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const getSkillCode = (skill: string) => {
    switch(skill) {
      case 'Shift Leader': return 'SL';
      case 'Load Control': return 'LC';
      case 'Ramp': return 'RMP';
      case 'Operations': return 'OPS';
      case 'Lost and Found': return 'LF';
      default: return '';
    }
  };

  const getPhaseStyle = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 4 && hour < 12) return { label: 'Morning', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (hour >= 12 && hour < 20) return { label: 'Afternoon', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    return { label: 'Night', color: 'text-indigo-400', bg: 'bg-indigo-400/10' };
  };

  const getShiftHealth = (s: ShiftConfig) => {
    const totalRequired = Object.values(s.roleCounts || {}).reduce((acc, v) => acc + (v || 0), 0);
    const hasShiftLeader = (s.roleCounts?.['Shift Leader'] || 0) > 0;
    
    if (totalRequired < s.minStaff) return 'critical';
    if (!hasShiftLeader) return 'warning';
    return 'healthy';
  };

  const timelineShifts = useMemo(() => {
    if (!shifts.length) return [];
    return [...shifts].sort((a, b) => a.pickupTime.localeCompare(b.pickupTime)).map(s => {
      const [h, m] = s.pickupTime.split(':').map(Number);
      const startPercent = ((h * 60 + m) / 1440) * 100;
      const [eh, em] = s.endTime.split(':').map(Number);
      let endPercent = ((eh * 60 + em) / 1440) * 100;
      if (endPercent < startPercent) endPercent = 100;
      return { ...s, startPercent, width: Math.max(2, endPercent - startPercent) };
    });
  }, [shifts]);

  const durationText = calculateDuration();

  return (
    <div className="space-y-8 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-4 md:gap-6 text-center md:text-left flex-col md:flex-row relative z-10">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Layout size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none">Operations Command</h3>
            <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-1 md:mt-2">Real-time Duty Management</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10">
          <button onClick={() => setShowBulkModal(true)} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl shadow-amber-500/20">
            <Layers size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">Bulk Creator</span>
          </button>
          <button onClick={onOpenScanner} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl shadow-indigo-600/20">
            <Sparkles size={16} className="group-hover:animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">AI Sync</span>
          </button>
          <button className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all">
            <FileDown size={18} className="text-emerald-400" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white">Report</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between mb-8">
           <h4 className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3">
             <Layers size={16} className="text-blue-600" /> Station Coverage Ribbon
           </h4>
           <div className="flex items-center gap-4">
              <div className="hidden sm:flex gap-4">
                {['AM', 'PM', 'Night'].map(phase => (
                  <div key={phase} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${phase === 'AM' ? 'bg-blue-500' : phase === 'PM' ? 'bg-amber-500' : 'bg-indigo-400'}`}></div>
                    <span className="text-[7px] font-black uppercase text-slate-400">{phase}</span>
                  </div>
                ))}
              </div>
              <div className="sm:hidden flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full animate-pulse">
                <MoveHorizontal size={10} className="text-blue-500" />
                <span className="text-[6px] font-black uppercase tracking-widest text-slate-400">Swipe</span>
              </div>
           </div>
        </div>
        
        <div className="relative overflow-x-auto no-scrollbar pb-2">
           <div className="relative h-28 md:h-32 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 p-4 min-w-[900px] md:min-w-full overflow-hidden">
              <div className="absolute inset-0 flex pointer-events-none px-6">
                {Array.from({length: 25}).map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-full border-l border-slate-200/50 flex flex-col justify-end pb-2`}
                    style={{ position: 'absolute', left: `${(i/24)*100}%` }}
                  >
                    {i % 3 === 0 && <span className="text-[7px] font-black text-slate-300 ml-1 translate-y-2">{i}:00</span>}
                  </div>
                ))}
              </div>

              <div className="relative h-full flex flex-col justify-center gap-2 pt-2">
                  {timelineShifts.map((s) => {
                    const phase = getPhaseStyle(s.pickupTime);
                    const health = getShiftHealth(s);
                    return (
                      <div 
                        key={s.id} 
                        className={`h-6 md:h-7 rounded-full border-2 border-white shadow-md flex items-center px-4 transition-all hover:scale-[1.01] cursor-pointer ${phase.bg} ${health === 'critical' ? 'ring-2 ring-rose-500/30' : ''}`}
                        style={{ marginLeft: `${s.startPercent}%`, width: `${s.width}%` }}
                        onClick={() => startEdit(s)}
                      >
                         <span className={`text-[8px] font-black uppercase tracking-tighter truncate ${phase.color}`}>{s.pickupTime} - {s.endTime}</span>
                      </div>
                    );
                  })}
                  {timelineShifts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                       <Zap size={14} className="text-slate-200" />
                       <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] italic">Awaiting Flight Registry Commit</span>
                    </div>
                  )}
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 md:gap-10">
        <div className="xl:col-span-1">
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 xl:sticky xl:top-24 max-h-[85vh] overflow-y-auto no-scrollbar">
            <h4 className="text-lg md:text-xl font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900 leading-none">
              {editingId ? <Edit2 size={20} className="text-indigo-600" /> : <Plus size={20} className="text-blue-600" />}
              {editingId ? 'Modify Logic' : 'New Duty'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
              <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Clock size={12} className="text-blue-500" /> Timing Profile</label>
                <div className="grid grid-cols-2 gap-2">
                   <div className="space-y-1">
                     <span className="text-[7px] font-black text-slate-600 uppercase ml-1">On-Duty Date</span>
                     <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs text-slate-900 outline-none" value={formData.pickupDate} onChange={e => setFormData({...formData, pickupDate: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[7px] font-black text-slate-600 uppercase ml-1">On-Duty Time</span>
                     <input type="text" maxLength={5} placeholder="06:00" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center text-sm text-slate-900 outline-none" value={formData.pickupTime} onChange={e => setFormData({...formData, pickupTime: formatTimeInput(e.target.value)})} />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[7px] font-black text-slate-600 uppercase ml-1">Release Date</span>
                     <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs text-slate-900 outline-none" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[7px] font-black text-slate-600 uppercase ml-1">Release Time</span>
                     <input type="text" maxLength={5} placeholder="14:00" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center text-sm text-slate-900 outline-none" value={formData.endTime} onChange={e => setFormData({...formData, endTime: formatTimeInput(e.target.value)})} />
                   </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Plane size={12} className="text-blue-500" /> Linked Traffic</label>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto no-scrollbar p-1">
                  {availableFlights.length === 0 ? (
                    <p className="col-span-full text-[8px] font-black text-slate-300 uppercase italic py-4 text-center">No matching flights in range</p>
                  ) : (
                    availableFlights.map(f => {
                      const isSelected = (formData.flightIds || []).includes(f.id);
                      const isEngaged = engagedFlightIds.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={isEngaged}
                          onClick={() => toggleFlightEngagement(f.id)}
                          className={`p-4 rounded-2xl border text-left transition-all space-y-2 relative ${
                            isSelected 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg z-10' 
                              : isEngaged
                                ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-40 cursor-not-allowed grayscale pointer-events-none'
                                : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="text-[11px] font-black leading-none flex items-center gap-2">
                              {f.flightNumber}
                              {isEngaged && <Lock size={10} className="text-slate-400" />}
                            </div>
                            <div className={`text-[8px] font-black flex items-center gap-1 ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                              <MapPin size={8} /> {f.from} <ArrowRight size={8} /> {f.to}
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-current border-opacity-10">
                            <div className={`text-[10px] font-black italic ${isSelected ? 'text-white' : isEngaged ? 'text-slate-300' : 'text-slate-900'}`}>
                              {f.sta || f.std || '--:--'}
                            </div>
                            <div className={`text-[7px] font-bold uppercase flex items-center gap-1 ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                              <Calendar size={8} /> {f.date}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">Min Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center text-sm text-slate-900" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">Max Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center text-sm text-slate-900" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) || 0 })} />
                  </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 flex items-center gap-2"><ShieldCheck size={12} className="text-indigo-500" /> Specialist Logic</label>
                <div className="space-y-2">
                   {AVAILABLE_SKILLS.map(skill => (
                     <div key={skill} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className="p-2 bg-white rounded-xl text-slate-400">{getSkillIcon(skill)}</div>
                           <span className="text-[9px] font-black uppercase text-slate-500">{skill}</span>
                        </div>
                        <div className="flex items-center gap-3">
                           <button type="button" onClick={() => updateRoleCount(skill, -1)} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-rose-500 transition-colors"><Minus size={14}/></button>
                           <span className="text-sm font-black text-slate-900 w-4 text-center">{formData.roleCounts?.[skill] || 0}</span>
                           <button type="button" onClick={() => updateRoleCount(skill, 1)} className="w-8 h-8 flex items-center justify-center bg-slate-950 text-white rounded-xl hover:bg-blue-600 transition-all"><Plus size={14}/></button>
                        </div>
                     </div>
                   ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                 {editingId && <button type="button" onClick={resetForm} className="flex-1 text-[10px] font-black uppercase text-slate-400 italic">Discard</button>}
                 <button type="submit" className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-xs active:scale-95 leading-none">
                   {editingId ? 'Apply Edit' : 'Register Slot'}
                 </button>
              </div>
            </form>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-8 md:space-y-10">
          
          {/* Duty Log Box */}
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5">
                <Activity size={120} className="text-blue-500" />
             </div>

             <h4 className="text-xl font-black italic uppercase text-slate-900 tracking-tighter mb-8 px-2 flex items-center gap-4 relative z-10">
               <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                 <Activity size={24} />
               </div>
               <div>
                 <span className="block leading-none">Duty Log</span>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Pre-weekly Program</span>
               </div>
             </h4>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                {shifts.length === 0 ? (
                  <div className="col-span-full py-32 text-center flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-100 rounded-[3rem]">
                    <AlertTriangle size={32} className="text-slate-200" />
                    <span className="text-slate-300 font-black uppercase italic text-xl">Registry Empty</span>
                  </div>
                ) : (
                  [...shifts].sort((a,b) => (a.pickupDate || '').localeCompare(b.pickupDate || '') || (a.pickupTime || '').localeCompare(b.pickupTime || '')).map((s) => {
                    const health = getShiftHealth(s);
                    const phase = getPhaseStyle(s.pickupTime);
                    const engagedFlights = (s.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean);
                    
                    return (
                      <div 
                        key={s.id} 
                        className={`group bg-white rounded-3xl md:rounded-[2.5rem] border-2 p-6 md:p-8 transition-all hover:shadow-2xl relative overflow-hidden flex flex-col justify-between ${
                          health === 'critical' ? 'border-rose-100 bg-rose-50/20' : 
                          health === 'warning' ? 'border-amber-100 bg-amber-50/20' : 
                          'border-slate-100 hover:border-blue-100'
                        }`}
                      >
                         <div className={`absolute top-0 left-0 bottom-0 w-2 ${
                            health === 'critical' ? 'bg-rose-500' : 
                            health === 'warning' ? 'bg-amber-500' : 
                            'bg-emerald-500'
                         }`} />

                         <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all flex gap-2 z-20">
                           <button onClick={() => startEdit(s)} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={16}/></button>
                           <button onClick={() => { if(confirm('Purge slot?')) onDelete(s.id); }} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-rose-500 shadow-sm"><Trash2 size={16}/></button>
                         </div>

                         <div className="space-y-8 pl-2 relative z-10">
                            <div className="flex justify-between items-start">
                               <div>
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">D{s.day + 1} | {s.pickupDate}</p>
                                  <div className="flex items-center gap-3">
                                     <h5 className="text-2xl md:text-3xl font-black italic text-slate-900 leading-none">{s.pickupTime}</h5>
                                     <ArrowRight size={16} className="text-slate-300" />
                                     <h5 className="text-2xl md:text-3xl font-black italic text-slate-900 leading-none">{s.endTime}</h5>
                                  </div>
                               </div>
                               <div className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase italic ${phase.bg} ${phase.color}`}>
                                 {phase.label}
                               </div>
                            </div>

                            <div className="space-y-3">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Specialist Matrix</p>
                               <div className="flex flex-wrap gap-2">
                                  {AVAILABLE_SKILLS.map(skill => {
                                    const count = s.roleCounts?.[skill] || 0;
                                    const isNeeded = count > 0;
                                    const shortCode = getSkillCode(skill);
                                    
                                    return (
                                      <div 
                                        key={skill} 
                                        title={`${skill}: ${count}`} 
                                        className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all ${
                                          isNeeded 
                                            ? 'bg-slate-900 text-white shadow-lg scale-105' 
                                            : 'bg-slate-50 text-slate-300'
                                        }`}
                                      >
                                        {getSkillIcon(skill)}
                                        {isNeeded && (
                                          <div className="flex items-center gap-1">
                                            <span className="text-[9px] font-black">{shortCode}</span>
                                            {count > 1 && (
                                              <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-[8px] font-black flex items-center justify-center border border-blue-500">
                                                {count}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                               </div>
                            </div>

                            <div className="pt-6 border-t border-slate-50 flex flex-wrap gap-2">
                               {engagedFlights.map(f => (
                                 <div key={f!.id} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[9px] font-black uppercase italic text-slate-600 flex items-center gap-2">
                                    <Plane size={12} className="text-blue-500" /> {f!.flightNumber}
                                 </div>
                               ))}
                            </div>
                         </div>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        </div>
      </div>

      {/* BULK SHIFT CREATOR MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto flex flex-col">
            <div className="p-4 md:p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600"><Layers size={20} className="md:w-6 md:h-6" /></div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 leading-none">Bulk Shifts Creater</h3>
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Mass Schedule Generation</p>
                </div>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-4 md:p-8 flex-1">
              <div className="space-y-6 md:space-y-8 animate-in slide-in-from-right-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">From Date</label>
                    <input type="date" className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">To Date</label>
                    <input type="date" className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={bulkEndDate} min={bulkStartDate} onChange={e => setBulkEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Repeat On Days</label>
                  <div className="flex flex-wrap gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                      <button 
                        key={day} 
                        onClick={() => setBulkDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort())}
                        className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all ${bulkDays.includes(idx) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shift Templates</h4>
                    <button 
                      onClick={() => setBulkTemplates([...bulkTemplates, { id: Math.random().toString(36).substr(2, 9), pickupTime: '14:00', endTime: '22:00', minStaff: 2, maxStaff: 8, roleCounts: {} }])}
                      className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Another Shift
                    </button>
                  </div>

                  {bulkTemplates.map((template, index) => (
                    <div key={template.id} className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-200 space-y-4 md:space-y-6 relative">
                      {bulkTemplates.length > 1 && (
                        <button 
                          onClick={() => setBulkTemplates(bulkTemplates.filter(t => t.id !== template.id))}
                          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 bg-white rounded-xl shadow-sm border border-slate-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      
                      <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">Shift {index + 1}</h5>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pickup Time (24H)</label>
                          <input type="time" className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" value={template.pickupTime} onChange={e => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, pickupTime: e.target.value } : t))} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Release Time (24H)</label>
                          <input type="time" className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" value={template.endTime} onChange={e => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, endTime: e.target.value } : t))} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Min Staff</label>
                          <input type="number" className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" value={template.minStaff} onChange={e => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, minStaff: Number(e.target.value) } : t))} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Max Staff</label>
                          <input type="number" className="h-[56px] w-full px-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" value={template.maxStaff} onChange={e => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, maxStaff: Number(e.target.value) } : t))} />
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Specialist Roles Required</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {AVAILABLE_SKILLS.map(skill => (
                            <div key={skill} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                              <span className="text-[10px] font-bold text-slate-600 uppercase">{skill}</span>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, roleCounts: { ...t.roleCounts, [skill]: Math.max(0, (t.roleCounts[skill]||0)-1) } } : t))} className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200"><Minus size={10}/></button>
                                <span className="text-xs font-black w-4 text-center">{template.roleCounts[skill] || 0}</span>
                                <button onClick={() => setBulkTemplates(bulkTemplates.map(t => t.id === template.id ? { ...t, roleCounts: { ...t.roleCounts, [skill]: (t.roleCounts[skill]||0)+1 } } : t))} className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200"><Plus size={10}/></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={handleBulkCreateWeekly} className="w-full py-5 bg-amber-500 text-slate-900 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl shadow-amber-500/20 hover:bg-amber-400 transition-all flex items-center justify-center gap-3 active:scale-95">
                  <Layers size={18} /> Generate Bulk Shifts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};