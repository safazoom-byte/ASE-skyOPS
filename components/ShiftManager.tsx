
import React, { useState, useMemo, useEffect } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { DAYS_OF_WEEK, AVAILABLE_SKILLS } from '../constants';
import { Settings, X, Calendar, Clock, Users, Layers, ChevronDown, ChevronUp, Zap, Target, ShieldCheck, Timer, PlaneLanding, Sparkles, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  
  // State for Termination Logic - using numbers, but input will handle empty display
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

  // Time Utility: HH:mm to total minutes
  const timeToMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Time Utility: Add minutes to HH:mm string
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

  const getDayDate = (dayIndex: number) => {
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayFullLabel = (dayIndex: number) => {
    return `${DAYS_OF_WEEK[dayIndex]} (${getDayDate(dayIndex)})`;
  };

  const dayFlights = useMemo(() => {
    if (selectedDays.length !== 1) return [];
    return flights.filter(f => f.day === selectedDays[0]);
  }, [flights, selectedDays]);

  const flightAssignmentsOnDay = useMemo(() => {
    const mapping: Record<string, string> = {};
    if (selectedDays.length !== 1) return mapping;
    
    shifts.filter(s => s.day === selectedDays[0]).forEach(s => {
      s.flightIds?.forEach(fId => {
        mapping[fId] = s.id;
      });
    });
    return mapping;
  }, [shifts, selectedDays]);

  // Logic to calculate end time based on mode
  useEffect(() => {
    if (endMode === 'fixed') {
      const hoursVal = typeof durationHours === 'number' ? durationHours : 0;
      const calculatedEnd = addTimeToStr(formData.pickupTime || '06:00', hoursVal * 60);
      setFormData(prev => ({ ...prev, endTime: calculatedEnd }));
    } else if (endMode === 'buffer' && formData.flightIds && formData.flightIds.length > 0) {
      const bufferVal = typeof bufferMinutes === 'number' ? bufferMinutes : 0;
      const linkedFlights = flights.filter(f => formData.flightIds?.includes(f.id));
      const stds = linkedFlights.map(f => f.std).filter(Boolean) as string[];
      if (stds.length > 0) {
        const sortedStds = [...stds].sort((a, b) => b.localeCompare(a));
        const latestStd = sortedStds[0];
        const calculatedEnd = addTimeToStr(latestStd, bufferVal);
        setFormData(prev => ({ ...prev, endTime: calculatedEnd }));
      }
    }
  }, [endMode, durationHours, bufferMinutes, formData.pickupTime, formData.flightIds, flights]);

  // Auto-link flights after shift start time by 4 hours
  useEffect(() => {
    if (selectedDays.length === 1 && formData.pickupTime) {
      const startTimeMins = timeToMins(formData.pickupTime);
      const windowMins = 240; // 4 Hours

      const autoLinkedIds = dayFlights
        .filter(f => {
          const conflictingId = flightAssignmentsOnDay[f.id];
          if (conflictingId && conflictingId !== editingId) return false;

          const checkInRange = (t?: string) => {
            if (!t) return false;
            const tMins = timeToMins(t);
            const diff = (tMins - startTimeMins + 1440) % 1440;
            return diff >= 0 && diff <= windowMins;
          };

          return checkInRange(f.sta) || checkInRange(f.std);
        })
        .map(f => f.id);

      setFormData(prev => ({ ...prev, flightIds: autoLinkedIds }));
    }
  }, [formData.pickupTime, selectedDays, dayFlights, flightAssignmentsOnDay, editingId]);

  const toggleShiftExpansion = (id: string) => {
    setExpandedShiftIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (editingId) {
      setSelectedDays([parseInt(val)]);
      setFormData(prev => ({ ...prev, flightIds: [] }));
      return;
    }

    if (val === 'all') {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (val === 'weekdays') {
      setSelectedDays([3, 4, 5, 6]); 
    } else if (val === 'weekend') {
      setSelectedDays([0, 1, 2]); 
    } else {
      setSelectedDays([parseInt(val)]);
    }
    setFormData(prev => ({ ...prev, flightIds: [] }));
  };

  const getDropdownValue = () => {
    if (selectedDays.length === 7) return 'all';
    if (selectedDays.length === 4 && selectedDays.every(d => [3,4,5,6].includes(d))) return 'weekdays';
    if (selectedDays.length === 3 && selectedDays.every(d => [0,1,2].includes(d))) return 'weekend';
    if (selectedDays.length === 1) return selectedDays[0].toString();
    return '';
  };

  const handleRoleCountChange = (skill: Skill, val: string) => {
    const num = val === '' ? '' : parseInt(val);
    setFormData({
      ...formData,
      roleCounts: {
        ...(formData.roleCounts || {}),
        [skill]: num as any
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final check for empty numeric values before committing
    const finalRoleCounts = { ...formData.roleCounts };
    Object.keys(finalRoleCounts).forEach(k => {
      if (finalRoleCounts[k as Skill] === ('' as any)) {
        finalRoleCounts[k as Skill] = 0;
      }
    });

    const finalShiftData = {
      ...formData as ShiftConfig,
      minStaff: typeof formData.minStaff === 'number' ? formData.minStaff : 5,
      maxStaff: typeof formData.maxStaff === 'number' ? formData.maxStaff : 8,
      targetPower: typeof formData.targetPower === 'number' ? formData.targetPower : 75,
      flightIds: formData.flightIds || [],
      roleCounts: finalRoleCounts
    };

    if (editingId) {
      onUpdate({ ...finalShiftData, id: editingId, day: selectedDays[0] });
    } else {
      selectedDays.forEach(day => {
        onAdd({
          ...finalShiftData,
          id: Math.random().toString(36).substr(2, 9),
          day: day,
          flightIds: selectedDays.length === 1 ? (formData.flightIds || []) : []
        });
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ pickupTime: '06:00', endTime: '14:00', minStaff: 5, maxStaff: 8, targetPower: 75, flightIds: [], roleCounts: {} });
    setSelectedDays([0]);
    setEditingId(null);
    setEndMode('fixed');
    setDurationHours(8);
    setBufferMinutes(60);
  };

  const handleEdit = (shift: ShiftConfig) => {
    setFormData({ ...shift, roleCounts: shift.roleCounts || {} });
    setSelectedDays([shift.day]);
    setEditingId(shift.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFlight = (flightId: string) => {
    const conflictingShiftId = flightAssignmentsOnDay[flightId];
    const isAssignedToOther = conflictingShiftId && conflictingShiftId !== editingId;
    if (isAssignedToOther) return;

    const current = formData.flightIds || [];
    if (current.includes(flightId)) {
      setFormData({ ...formData, flightIds: current.filter(id => id !== flightId) });
    } else {
      setFormData({ ...formData, flightIds: [...current, flightId] });
    }
  };

  return (
    <div className="space-y-8 lg:space-y-12 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-950 text-white p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 lg:gap-8">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
        <div className="relative z-10 text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-600 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Clock className="text-white" size={20} />
            </div>
            <h3 className="text-xl lg:text-4xl font-black uppercase italic tracking-tighter">Duty Master</h3>
          </div>
          <p className="text-slate-400 text-[10px] lg:text-sm max-w-md font-medium uppercase tracking-widest opacity-80">
            Define daily pickup and automated termination logic.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div className="xl:col-span-2">
          <div className={`bg-white p-6 lg:p-16 rounded-[2.5rem] lg:rounded-[5rem] shadow-sm border-2 transition-all duration-500 ${editingId ? 'border-indigo-500 ring-4 lg:ring-[20px] ring-indigo-50 shadow-2xl' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between mb-8 lg:mb-16">
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="w-10 h-10 lg:w-16 lg:h-16 bg-slate-950 text-white rounded-xl lg:rounded-3xl flex items-center justify-center shadow-xl">
                    {editingId ? <Settings size={18} /> : <Calendar size={18} />}
                </div>
                <h4 className="text-sm lg:text-xl font-black text-slate-800 uppercase tracking-tighter italic">
                  {editingId ? 'Update Duty Cycle' : 'Register New Shift'}
                </h4>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8 lg:space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    <Calendar size={12} /> Operational Day
                  </label>
                  <select 
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xs lg:text-sm"
                    value={getDropdownValue()}
                    onChange={handleDropdownChange}
                  >
                    {!editingId && (
                      <>
                        <option value="all">Weekly (7 Days)</option>
                        <option value="weekdays">Mon-Thu</option>
                        <option value="weekend">Fri-Sun</option>
                        {DAYS_OF_WEEK.map((day, i) => <option key={day} value={i}>{getDayFullLabel(i)}</option>)}
                      </>
                    )}
                    {editingId && DAYS_OF_WEEK.map((day, i) => <option key={day} value={i}>{getDayFullLabel(i)}</option>)}
                  </select>
                </div>
                
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">
                    <Clock size={12} /> Duty Start
                  </label>
                  <input 
                    type="time" 
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xl text-center" 
                    value={formData.pickupTime} 
                    onChange={e => setFormData({ ...formData, pickupTime: e.target.value })} 
                    required 
                  />
                </div>

                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-rose-600 uppercase tracking-[0.2em]">
                    <Timer size={12} /> Duty End (Auto)
                  </label>
                  <div className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-xl text-center text-rose-700 cursor-not-allowed">
                    {formData.endTime || '--:--'}
                  </div>
                </div>
              </div>

              {/* Termination Mode Logic */}
              <div className="p-6 lg:p-8 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Termination Calculation:</span>
                    <span className="text-[8px] text-indigo-500 font-bold uppercase mt-0.5">Determines shift end time automatically</span>
                  </div>
                  <div className="flex bg-white p-1 rounded-xl shadow-sm">
                    <button 
                      type="button" 
                      onClick={() => setEndMode('fixed')}
                      className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-2 ${endMode === 'fixed' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                      <Timer size={12}/> Fixed Duration
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setEndMode('buffer')}
                      className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-2 ${endMode === 'buffer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                      <PlaneLanding size={12}/> Flight Buffer
                    </button>
                  </div>
                </div>

                {endMode === 'fixed' ? (
                  <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 animate-in slide-in-from-top-2">
                    <div className="flex-1">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Shift Length (Hours)</label>
                      <input 
                        type="number" 
                        min="1" max="24"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl font-black text-sm" 
                        value={durationHours} 
                        onChange={e => {
                          const val = e.target.value;
                          setDurationHours(val === '' ? '' : parseInt(val));
                        }} 
                      />
                    </div>
                    <div className="text-slate-300 font-black italic">H</div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in slide-in-from-top-2">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Minutes After Last Departure</label>
                        <input 
                          type="number" 
                          min="0" step="15"
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl font-black text-sm" 
                          value={bufferMinutes} 
                          onChange={e => {
                            const val = e.target.value;
                            setBufferMinutes(val === '' ? '' : parseInt(val));
                          }} 
                        />
                      </div>
                      <div className="text-slate-300 font-black italic">MIN</div>
                    </div>
                    {(!formData.flightIds || formData.flightIds.length === 0) && (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-[8px] text-amber-600 font-black uppercase text-center italic">Link flight services below to activate buffer-based termination.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 lg:p-10 bg-indigo-50/50 rounded-[2rem] border border-indigo-100">
                <div className="flex items-center gap-3 mb-8">
                  <ShieldCheck className="text-indigo-600" size={16} />
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Team Matrix Requirements</h5>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Min Staff</label>
                      <input 
                        type="number" min="1" 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-center" 
                        value={formData.minStaff ?? ''} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({ ...formData, minStaff: val === '' ? '' : parseInt(val) as any });
                        }} 
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Max Staff</label>
                      <input 
                        type="number" min="1" 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-center" 
                        value={formData.maxStaff ?? ''} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({ ...formData, maxStaff: val === '' ? '' : parseInt(val) as any });
                        }} 
                        required 
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="block text-[8px] font-black text-emerald-600 uppercase tracking-widest">Target Power (%)</label>
                      <input 
                        type="number" min="0" max="100" 
                        className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-black text-center" 
                        value={formData.targetPower ?? ''} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({ ...formData, targetPower: val === '' ? '' : parseInt(val) as any });
                        }} 
                        required 
                      />
                    </div>
                    {AVAILABLE_SKILLS.map(skill => (
                      <div key={skill} className="space-y-2">
                        <label className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest text-center truncate">{skill}</label>
                        <input 
                          type="number" min="0"
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-center text-indigo-600" 
                          value={formData.roleCounts?.[skill] ?? ''} 
                          onChange={e => handleRoleCountChange(skill, e.target.value)} 
                        />
                      </div>
                    ))}
                </div>
              </div>

              {selectedDays.length === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Link Flight Services — {DAYS_OF_WEEK[selectedDays[0]]}</label>
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full animate-pulse">
                      <Sparkles size={10} className="text-indigo-600" />
                      <span className="text-[7px] font-black text-indigo-600 uppercase">4H Auto-Scan Active</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayFlights.map(flight => {
                      const conflictingId = flightAssignmentsOnDay[flight.id];
                      const taken = conflictingId && conflictingId !== editingId;
                      const active = formData.flightIds?.includes(flight.id);
                      return (
                        <button 
                          key={flight.id} type="button" disabled={taken} 
                          onClick={() => toggleFlight(flight.id)} 
                          className={`p-5 rounded-3xl border-2 text-left transition-all relative group overflow-hidden ${
                            active ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20' :
                            taken ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-40 cursor-not-allowed' :
                            'bg-white border-slate-100 text-slate-500 hover:border-indigo-400 hover:shadow-lg'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-tighter italic">{flight.flightNumber}</span>
                            <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              {flight.type}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black">{flight.from}</span>
                            <ArrowRight size={10} className={active ? 'text-white/40' : 'text-slate-300'} />
                            <span className="text-[10px] font-black">{flight.to}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className={`p-2 rounded-xl text-center border ${active ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-100'}`}>
                              <span className={`text-[7px] font-black block mb-0.5 ${active ? 'text-white/60' : 'text-slate-400'}`}>STA</span>
                              <span className="text-[10px] font-black italic">{flight.sta || '--:--'}</span>
                            </div>
                            <div className={`p-2 rounded-xl text-center border ${active ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-100'}`}>
                              <span className={`text-[7px] font-black block mb-0.5 ${active ? 'text-white/60' : 'text-slate-400'}`}>STD</span>
                              <span className="text-[10px] font-black italic">{flight.std || '--:--'}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl active:scale-95 italic">
                {editingId ? 'COMMIT CHANGES' : 'CREATE SHIFT SLOTS'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-indigo-600 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
              <div className="relative z-10 space-y-4">
                <h4 className="font-black uppercase italic text-lg">Duty Logic</h4>
                <div className="space-y-3 text-xs opacity-90">
                   <p><strong>Fixed Duration:</strong> Termination is set strictly by hours from pickup.</p>
                   <p><strong>Flight Buffer:</strong> Termination is set based on the latest departure time of all linked flights.</p>
                   <div className="pt-2 border-t border-indigo-500 mt-2">
                     <p className="flex items-center gap-2 font-black italic"><Sparkles size={14}/> Auto-Scan:</p>
                     <p className="mt-1 opacity-80">System automatically links all services within 4 hours of pickup time.</p>
                   </div>
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {DAYS_OF_WEEK.map((dayName, dayIndex) => {
          const dayShifts = shifts.filter(s => s.day === dayIndex).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
          return (
            <div key={dayName} className="space-y-3">
              <div className="text-center py-3 bg-slate-950 rounded-2xl border border-slate-800">
                <span className="text-[9px] font-black text-white uppercase tracking-widest">{dayName.substring(0,3)}</span>
              </div>
              {dayShifts.map(shift => {
                const isExpanded = !!expandedShiftIds[shift.id];
                return (
                  <div key={shift.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div 
                      onClick={() => toggleShiftExpansion(shift.id)}
                      className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-xs font-black text-slate-900">{shift.pickupTime} - {shift.endTime || '??'}</div>
                      <div className="text-[7px] font-bold text-slate-400 uppercase mt-1">{shift.minStaff}-{shift.maxStaff} PAX</div>
                    </div>
                    {isExpanded && (
                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex gap-1">
                        <button onClick={() => handleEdit(shift)} className="flex-1 p-2 bg-slate-900 text-white rounded-lg text-[7px] font-black uppercase">Edit</button>
                        <button onClick={() => onDelete(shift.id)} className="flex-1 p-2 bg-red-100 text-red-600 rounded-lg text-[7px] font-black uppercase">X</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
