
import React, { useState, useMemo, useEffect } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { DAYS_OF_WEEK, AVAILABLE_SKILLS } from '../constants';
import { Settings, Calendar, Clock, Timer, PlaneLanding, Sparkles, ArrowRight, Trash2, Plus, Users, Zap, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  startDate: string;
  onAdd: (s: ShiftConfig) => void;
  onUpdate: (s: ShiftConfig) => void;
  onDelete: (id: string) => void;
}

export const ShiftManager: React.FC<Props> = ({ shifts, flights, startDate, onAdd, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([0]);
  const [expandedShiftIds, setExpandedShiftIds] = useState<Record<string, boolean>>({});
  
  const [endMode, setEndMode] = useState<'fixed' | 'buffer'>('fixed');
  const [durationHours, setDurationHours] = useState<number | ''>(8);
  const [bufferMinutes, setBufferMinutes] = useState<number | ''>(60);

  const [formData, setFormData] = useState<Partial<ShiftConfig>>({
    pickupTime: '06:00',
    endTime: '14:00',
    minStaff: 5,
    maxStaff: 8,
    targetPower: 75,
    flightIds: [],
    roleCounts: {}
  });

  const timeToMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const addTimeToStr = (timeStr: string, minutesToAdd: number) => {
    if (!timeStr) return '00:00';
    const [h, m] = timeStr.split(':').map(Number);
    let totalMins = h * 60 + m + minutesToAdd;
    totalMins = totalMins % (24 * 60);
    if (totalMins < 0) totalMins += (24 * 60);
    const newH = Math.floor(totalMins / 60);
    const newM = totalMins % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  };

  const dayFlights = useMemo(() => {
    if (selectedDays.length !== 1) return [];
    return flights.filter(f => f.day === selectedDays[0]);
  }, [flights, selectedDays]);

  const flightAssignmentsOnDay = useMemo(() => {
    const mapping: Record<string, string> = {};
    if (selectedDays.length !== 1) return mapping;
    shifts.filter(s => s.day === selectedDays[0]).forEach(s => {
      s.flightIds?.forEach(fId => { mapping[fId] = s.id; });
    });
    return mapping;
  }, [shifts, selectedDays]);

  useEffect(() => {
    if (endMode === 'fixed') {
      const hoursVal = typeof durationHours === 'number' ? durationHours : 0;
      setFormData(prev => ({ ...prev, endTime: addTimeToStr(formData.pickupTime || '06:00', hoursVal * 60) }));
    } else if (endMode === 'buffer' && formData.flightIds && formData.flightIds.length > 0) {
      const bufferVal = typeof bufferMinutes === 'number' ? bufferMinutes : 0;
      const linkedFlights = flights.filter(f => formData.flightIds?.includes(f.id));
      const stds = linkedFlights.map(f => f.std).filter(Boolean) as string[];
      if (stds.length > 0) {
        const latestStd = [...stds].sort((a, b) => b.localeCompare(a))[0];
        setFormData(prev => ({ ...prev, endTime: addTimeToStr(latestStd, bufferVal) }));
      }
    }
  }, [endMode, durationHours, bufferMinutes, formData.pickupTime, formData.flightIds, flights]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalShiftData = {
      ...formData as ShiftConfig,
      minStaff: typeof formData.minStaff === 'number' ? formData.minStaff : 5,
      maxStaff: typeof formData.maxStaff === 'number' ? formData.maxStaff : 8,
      targetPower: typeof formData.targetPower === 'number' ? formData.targetPower : 75,
      flightIds: formData.flightIds || [],
      roleCounts: formData.roleCounts || {}
    };
    if (editingId) {
      onUpdate({ ...finalShiftData, id: editingId, day: selectedDays[0] });
    } else {
      selectedDays.forEach(day => {
        onAdd({ ...finalShiftData, id: Math.random().toString(36).substr(2, 9), day });
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ pickupTime: '06:00', endTime: '14:00', minStaff: 5, maxStaff: 8, targetPower: 75, flightIds: [], roleCounts: {} });
    setSelectedDays([0]);
    setEditingId(null);
  };

  const toggleFlight = (flightId: string) => {
    const conflictingShiftId = flightAssignmentsOnDay[flightId];
    if (conflictingShiftId && conflictingShiftId !== editingId) return;
    const current = formData.flightIds || [];
    setFormData({ ...formData, flightIds: current.includes(flightId) ? current.filter(id => id !== flightId) : [...current, flightId] });
  };

  const setRoleCount = (role: Skill, count: number) => {
    const counts = { ...(formData.roleCounts || {}) };
    if (count <= 0) delete counts[role]; else counts[role] = count;
    setFormData({ ...formData, roleCounts: counts });
  };

  const toggleDaySelection = (dayIdx: number) => {
    if (editingId) return; // Edit mode only supports 1 day
    setSelectedDays(prev => prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx]);
  };

  const startEdit = (shift: ShiftConfig) => {
    setEditingId(shift.id);
    setSelectedDays([shift.day]);
    setFormData({ ...shift });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleExpand = (id: string) => {
    setExpandedShiftIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDayLabel = (idx: number) => DAYS_OF_WEEK[idx];

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => a.day - b.day || a.pickupTime.localeCompare(b.pickupTime));
  }, [shifts]);

  return (
    <div className="space-y-8 lg:space-y-12 animate-in fade-in duration-500 pb-20">
      {/* Header section */}
      <div className="bg-slate-950 text-white p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 lg:gap-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="relative z-10 text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-600 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Clock className="text-white" size={20} />
            </div>
            <h3 className="text-xl lg:text-4xl font-black uppercase italic tracking-tighter">Duty Master</h3>
          </div>
          <p className="text-slate-500 text-[10px] lg:text-sm font-medium uppercase tracking-[0.2em]">Operational Shift Architect & Resource Linking</p>
        </div>
        <div className="relative z-10 bg-white/5 border border-white/10 p-5 lg:p-8 rounded-[2rem] text-center backdrop-blur-md">
           <span className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Active Slots</span>
           <span className="text-3xl font-black italic">{shifts.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Creation Form */}
        <div className="xl:col-span-2">
          <div className={`bg-white p-6 lg:p-16 rounded-[2.5rem] lg:rounded-[5rem] shadow-sm border-2 transition-all duration-500 ${editingId ? 'border-indigo-500 ring-4 lg:ring-[20px] ring-indigo-50 shadow-2xl' : 'border-slate-100'}`}>
            <div className="flex items-center gap-4 mb-10 lg:mb-14">
              <div className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center shadow-lg ${editingId ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-white'}`}>
                {editingId ? <Edit2 size={20} /> : <Plus size={20} />}
              </div>
              <h4 className="text-xl lg:text-2xl font-black text-slate-800 uppercase tracking-tighter italic">{editingId ? 'Modify Slot Structure' : 'Engineer Shift Pattern'}</h4>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 lg:space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Day</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day, i) => (
                      <button 
                        key={day} 
                        type="button" 
                        onClick={() => toggleDaySelection(i)}
                        className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${selectedDays.includes(i) ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                      >
                        {day.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">Duty Start</label>
                  <input type="time" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xl text-center focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.pickupTime} onChange={e => setFormData({ ...formData, pickupTime: e.target.value })} required />
                </div>

                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-rose-600 uppercase tracking-[0.2em]">Duty End (Auto)</label>
                  <div className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-xl text-center text-rose-700">{formData.endTime || '--:--'}</div>
                </div>
              </div>

              {selectedDays.length === 1 && (
                <div className="space-y-4 animate-in slide-in-from-top duration-300">
                  <label className="block text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Link Flight Services (Coverage)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayFlights.map(flight => {
                      const conflictingShiftId = flightAssignmentsOnDay[flight.id];
                      // Fixed the TS error here by explicitly casting to boolean
                      const taken = !!(conflictingShiftId && conflictingShiftId !== editingId);
                      const active = !!formData.flightIds?.includes(flight.id);
                      return (
                        <button key={flight.id} type="button" disabled={taken} onClick={() => toggleFlight(flight.id)} className={`p-5 rounded-[1.5rem] border-2 text-left transition-all group ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20' : taken ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed' : 'bg-white border-slate-100 hover:border-indigo-400 hover:bg-slate-50'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-black italic text-sm tracking-tighter uppercase">{flight.flightNumber}</span>
                            {active && <CheckCircle2 size={12} />}
                          </div>
                          <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{flight.from} → {flight.to}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10 pt-8 border-t border-slate-50">
                 <div className="space-y-3 lg:space-y-4">
                   <label className="block text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Min Personnel</label>
                   <input type="number" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-lg text-center" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) })} />
                 </div>
                 <div className="space-y-3 lg:space-y-4">
                   <label className="block text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Max Personnel</label>
                   <input type="number" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-lg text-center" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) })} />
                 </div>
                 <div className="space-y-3 lg:space-y-4">
                   <label className="block text-[9px] lg:text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">Target Power %</label>
                   <input type="number" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-lg text-center" value={formData.targetPower} onChange={e => setFormData({ ...formData, targetPower: parseInt(e.target.value) })} />
                 </div>
              </div>

              <div>
                <label className="block text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Staffing Requirements (Per Service)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {AVAILABLE_SKILLS.map(skill => (
                    <div key={skill} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center gap-3">
                      <span className="text-[8px] font-black text-slate-400 uppercase text-center leading-tight tracking-widest h-8 flex items-center">{skill}</span>
                      <input type="number" className="w-full bg-white border border-slate-200 rounded-lg py-2 text-center font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500/10" value={formData.roleCounts?.[skill] || 0} onChange={e => setRoleCount(skill, parseInt(e.target.value))} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                {editingId && (
                  <button type="button" onClick={resetForm} className="px-10 py-6 bg-slate-100 text-slate-400 rounded-[2rem] font-black text-xs uppercase italic tracking-widest">Abort</button>
                )}
                <button type="submit" className="flex-1 py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase shadow-2xl active:scale-95 italic transition-all hover:bg-slate-800">
                  {editingId ? 'COMMIT ARCHITECT CHANGES' : 'CREATE STATION SHIFT SLOTS'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Shift List Dashboard */}
        <div className="space-y-6">
           {sortedShifts.length === 0 ? (
             <div className="bg-white p-12 rounded-[3rem] border-2 border-dashed border-slate-200 text-center space-y-4">
                <Clock className="mx-auto text-slate-300" size={32} />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic leading-relaxed">System awaiting operational shift parameters.</p>
             </div>
           ) : (
             sortedShifts.map((shift) => {
               const isExpanded = expandedShiftIds[shift.id];
               const linkedFlightsCount = shift.flightIds?.length || 0;

               return (
                 <div key={shift.id} className={`bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden transition-all duration-300 group hover:shadow-xl ${editingId === shift.id ? 'ring-2 ring-indigo-500 shadow-indigo-500/10' : ''}`}>
                    <div className="p-6 lg:p-8 flex items-center justify-between gap-4">
                       <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-sm ${shift.day % 2 === 0 ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white'}`}>
                             {getDayLabel(shift.day).substring(0, 3)}
                          </div>
                          <div>
                             <h5 className="text-lg font-black text-slate-900 italic tracking-tighter uppercase leading-none mb-1">
                                {shift.pickupTime} — {shift.endTime}
                             </h5>
                             <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{linkedFlightsCount} Flights</span>
                                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                <div className="flex items-center gap-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                                   <Zap size={10} /> {shift.targetPower}%
                                </div>
                             </div>
                          </div>
                       </div>

                       <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(shift)} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Edit2 size={18} /></button>
                          <button onClick={() => onDelete(shift.id)} className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                          <button onClick={() => toggleExpand(shift.id)} className="p-3 text-slate-400 hover:text-slate-950 rounded-xl transition-all">
                             {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </button>
                       </div>
                    </div>

                    {isExpanded && (
                       <div className="px-8 pb-8 space-y-6 animate-in slide-in-from-top duration-300">
                          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-3">Linked Services</span>
                             {linkedFlightsCount > 0 ? (
                               <div className="flex flex-wrap gap-2">
                                  {shift.flightIds?.map(fId => {
                                     const f = flights.find(fl => fl.id === fId);
                                     return (
                                       <span key={fId} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase italic text-slate-700">
                                          {f?.flightNumber || '??'}
                                       </span>
                                     );
                                  })}
                               </div>
                             ) : (
                               <p className="text-[8px] font-black text-rose-400 uppercase italic">Unlinked Pattern (Logical Gap)</p>
                             )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                                <span className="block text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Reach</span>
                                <span className="text-xs font-black text-slate-900 italic">{shift.minStaff} — {shift.maxStaff} Staff</span>
                             </div>
                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                                <span className="block text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Qualific. Matrix</span>
                                <span className="text-xs font-black text-slate-900 italic">{Object.keys(shift.roleCounts || {}).length} Roles</span>
                             </div>
                          </div>
                       </div>
                    )}
                 </div>
               );
             })
           )}
        </div>
      </div>
    </div>
  );
};

interface CheckCircle2Props {
  size?: number;
}
const CheckCircle2: React.FC<CheckCircle2Props> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
