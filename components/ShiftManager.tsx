import React, { useState, useMemo, useEffect } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { DAYS_OF_WEEK, AVAILABLE_SKILLS } from '../constants';
import { Clock, Trash2, Edit2, ChevronDown, ChevronUp, Zap, Plane, Timer, Settings2, AlertCircle } from 'lucide-react';

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  startDate?: string;
  onAdd: (s: ShiftConfig) => void;
  onUpdate: (s: ShiftConfig) => void;
  onDelete: (id: string) => void;
}

export const ShiftManager: React.FC<Props> = ({ shifts, flights, startDate, onAdd, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([0]);
  const [expandedShiftIds, setExpandedShiftIds] = useState<Record<string, boolean>>({});
  
  const [endMode, setEndMode] = useState<'fixed' | 'buffer'>('fixed');
  const [durationHours, setDurationHours] = useState<number>(8);
  const [bufferMinutes, setBufferMinutes] = useState<number>(60);

  const [formData, setFormData] = useState<Partial<ShiftConfig>>({
    pickupTime: '06:00',
    endTime: '14:00',
    minStaff: 5,
    maxStaff: 8,
    targetPower: 75,
    flightIds: [],
    roleCounts: {}
  });

  const addTimeToStr = (timeStr: string, minutesToAdd: number) => {
    if (!timeStr) return '00:00';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '00:00';
    let totalMins = h * 60 + m + minutesToAdd;
    totalMins = totalMins % (24 * 60);
    if (totalMins < 0) totalMins += (24 * 60);
    const newH = Math.floor(totalMins / 60);
    const newHStr = newH.toString().padStart(2, '0');
    const newM = totalMins % 60;
    const newMStr = newM.toString().padStart(2, '0');
    return `${newHStr}:${newMStr}`;
  };

  const dayFlights = useMemo(() => {
    if (selectedDays.length !== 1) return [];
    return flights.filter(f => f.day === selectedDays[0]);
  }, [flights, selectedDays]);

  const flightAssignmentsOnDay = useMemo(() => {
    const mapping: Record<string, ShiftConfig> = {};
    if (selectedDays.length !== 1) return mapping;
    shifts.filter(s => s.day === selectedDays[0]).forEach(s => {
      s.flightIds?.forEach(fId => { 
        mapping[fId] = s; 
      });
    });
    return mapping;
  }, [shifts, selectedDays]);

  useEffect(() => {
    if (endMode === 'fixed') {
      const hoursVal = Number(durationHours) || 0;
      setFormData(prev => ({ ...prev, endTime: addTimeToStr(formData.pickupTime || '06:00', hoursVal * 60) }));
    } else if (endMode === 'buffer') {
      const bufferVal = Number(bufferMinutes) || 0;
      const linkedFlights = flights.filter(f => formData.flightIds?.includes(f.id));
      const stds = linkedFlights.map(f => f.std).filter(Boolean) as string[];
      if (stds.length > 0) {
        const latestStd = [...stds].sort((a, b) => b.localeCompare(a))[0];
        setFormData(prev => ({ ...prev, endTime: addTimeToStr(latestStd, bufferVal) }));
      } else {
        setFormData(prev => ({ ...prev, endTime: prev.pickupTime }));
      }
    }
  }, [endMode, durationHours, bufferMinutes, formData.pickupTime, formData.flightIds, flights]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validatedFlightIds = (formData.flightIds || []).filter(fid => flights.some(f => f.id === fid));
    
    const finalShiftData = {
      ...formData as ShiftConfig,
      minStaff: typeof formData.minStaff === 'number' ? formData.minStaff : 5,
      maxStaff: typeof formData.maxStaff === 'number' ? formData.maxStaff : 8,
      targetPower: typeof formData.targetPower === 'number' ? formData.targetPower : 75,
      flightIds: validatedFlightIds,
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
    setFormData({ 
      pickupTime: '06:00', 
      endTime: '14:00', 
      minStaff: 5, 
      maxStaff: 8, 
      targetPower: 75, 
      flightIds: [], 
      roleCounts: {} 
    });
    setEndMode('fixed');
    setDurationHours(8);
    setBufferMinutes(60);
    setSelectedDays([0]);
    setEditingId(null);
  };

  const toggleFlight = (flightId: string) => {
    const conflictingShift = flightAssignmentsOnDay[flightId];
    if (conflictingShift && conflictingShift.id !== editingId) return;
    const current = formData.flightIds || [];
    setFormData({ ...formData, flightIds: current.includes(flightId) ? current.filter(id => id !== flightId) : [...current, flightId] });
  };

  const setRoleCount = (role: Skill, count: number) => {
    const counts = { ...(formData.roleCounts || {}) };
    if (count <= 0) delete counts[role]; else counts[role] = count;
    setFormData({ ...formData, roleCounts: counts });
  };

  const toggleDaySelection = (dayIdx: number) => {
    if (editingId) return; 
    setSelectedDays(prev => prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx]);
  };

  const startEdit = (shift: ShiftConfig) => {
    setEditingId(shift.id);
    setSelectedDays([shift.day]);
    setFormData({ ...shift, flightIds: shift.flightIds || [] });
  };

  const toggleExpand = (id: string) => {
    setExpandedShiftIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDayLabel = (idx: number) => DAYS_OF_WEEK[idx];

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => a.day - b.day || a.pickupTime.localeCompare(b.pickupTime));
  }, [shifts]);

  return (
    <div className="space-y-12 pb-20">
      <div className="bg-slate-950 text-white p-12 rounded-[3rem] shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Clock size={40} className="text-blue-500" />
          <h3 className="text-3xl font-black uppercase italic tracking-tighter">Duty Master</h3>
        </div>
        <div className="bg-white/5 p-6 rounded-2xl text-center">
          <span className="text-3xl font-black italic">{shifts.length} Slots</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-white p-12 rounded-[3rem] shadow-sm border">
            <h4 className="text-xl font-black italic uppercase mb-10">{editingId ? 'Modify Slot' : 'Engineer Shift'}</h4>
            <form onSubmit={handleSubmit} className="space-y-10">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-4">Pickup Time</label>
                  <input type="time" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-xl text-center outline-none focus:ring-2 focus:ring-blue-500/20" value={formData.pickupTime} onChange={e => setFormData({ ...formData, pickupTime: e.target.value })} required />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 flex justify-between">
                    <span>Shift Calculation Mode</span>
                    <span className="text-blue-500 flex items-center gap-1"><Settings2 size={10} /> Dynamic</span>
                  </label>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2">
                    <button type="button" onClick={() => setEndMode('fixed')} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase transition-all ${endMode === 'fixed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                      <Timer size={14} /> Fixed Duration
                    </button>
                    <button type="button" onClick={() => setEndMode('buffer')} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase transition-all ${endMode === 'buffer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                      <Plane size={14} /> Flight Buffer
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 bg-slate-50/50 rounded-[2rem] border border-dashed">
                <div>
                  {endMode === 'fixed' ? (
                    <>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Duration (Hours)</label>
                      <div className="flex items-center gap-4">
                        <input type="range" min="1" max="14" step="0.5" className="flex-1 accent-slate-950" value={durationHours} onChange={e => setDurationHours(parseFloat(e.target.value))} />
                        <span className="w-16 text-center font-black text-lg">{durationHours}h</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Post-Flight Buffer (Mins)</label>
                      <div className="flex items-center gap-4">
                        <input type="range" min="15" max="180" step="5" className="flex-1 accent-blue-600" value={bufferMinutes} onChange={e => setBufferMinutes(parseInt(e.target.value))} />
                        <span className="w-16 text-center font-black text-lg text-blue-600">+{bufferMinutes}m</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-col justify-center text-center">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Calculated End Time</label>
                  <div className="relative inline-block">
                    <div className="text-4xl font-black italic text-slate-950">{formData.endTime || '--:--'}</div>
                    {endMode === 'buffer' && (
                      <div className="absolute -top-3 -right-6 px-2 py-0.5 bg-blue-500 text-white text-[7px] font-black rounded-full animate-pulse uppercase">Live</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-4">Day of Operations</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day, i) => (
                    <button key={i} type="button" onClick={() => toggleDaySelection(i)} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${selectedDays.includes(i) ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {selectedDays.length === 1 && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 flex justify-between">
                    <span>Link Coverage</span>
                    <span className="text-[8px] font-black text-slate-300 italic uppercase">Flights define shift end in Buffer Mode</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {dayFlights.length === 0 ? (
                      <p className="col-span-full text-[10px] font-black text-slate-300 uppercase italic py-4 text-center">No flights registered for {getDayLabel(selectedDays[0])}.</p>
                    ) : dayFlights.map(flight => {
                      const conflictingShift = flightAssignmentsOnDay[flight.id];
                      const taken = !!(conflictingShift && conflictingShift.id !== editingId);
                      const active = !!formData.flightIds?.includes(flight.id);
                      return (
                        <button key={flight.id} type="button" disabled={taken} onClick={() => toggleFlight(flight.id)} className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : taken ? 'bg-slate-50 border-rose-100 opacity-60 cursor-not-allowed' : 'bg-white hover:border-indigo-400'}`}>
                          <p className={`font-black italic text-xs uppercase ${taken ? 'text-slate-400' : ''}`}>{flight.flightNumber}</p>
                          <div className="flex justify-between items-end mt-2">
                            <p className="text-[9px] font-bold opacity-60 uppercase">{flight.from}-{flight.to}</p>
                            <p className="text-[9px] font-black italic">{flight.std || '??:??'}</p>
                          </div>
                          
                          {active && <Zap size={12} className="absolute top-2 right-2 opacity-40" />}
                          {taken && (
                            <div className="absolute top-0 right-0 p-1.5 bg-rose-50 border-l border-b border-rose-100 text-[6px] font-black uppercase text-rose-500 flex items-center gap-1 rounded-bl-lg">
                              <AlertCircle size={8} /> Used in {conflictingShift.pickupTime}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Min Staff</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-center" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Max Staff</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-center" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Target Power %</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border rounded-xl font-black text-center" value={formData.targetPower} onChange={e => setFormData({ ...formData, targetPower: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-4">Staffing Matrix</label>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {AVAILABLE_SKILLS.map(skill => (
                    <div key={skill} className="bg-slate-50 p-4 rounded-xl text-center space-y-2 border">
                      <span className="text-[8px] font-black text-slate-400 uppercase block leading-none">{skill}</span>
                      <input type="number" className="w-full bg-white border rounded py-1 text-center font-black text-xs" value={formData.roleCounts?.[skill] || 0} onChange={e => setRoleCount(skill, parseInt(e.target.value) || 0)} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                {editingId && <button type="button" onClick={resetForm} className="px-8 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Abort</button>}
                <button type="submit" className="flex-1 py-5 bg-slate-950 text-white rounded-2xl font-black uppercase shadow-2xl italic text-xs">
                  {editingId ? 'SYNCHRONIZE SHIFT' : 'ENGINEER SHIFT SLOTS'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-slate-900 rounded-3xl text-white mb-2">
            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Queue Overview</h5>
            <p className="text-xs font-black italic">{shifts.length} Active Slots</p>
          </div>
          {sortedShifts.length === 0 ? (
            <div className="bg-white p-12 rounded-[2rem] border-2 border-dashed text-center">
              <p className="text-[10px] font-black text-slate-300 uppercase italic">No active shift slots engineered.</p>
            </div>
          ) : sortedShifts.map((shift) => {
            const isExpanded = !!expandedShiftIds[shift.id];
            return (
              <div key={shift.id} className="bg-white rounded-[2rem] shadow-sm border overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center font-black italic text-xs">{getDayLabel(shift.day).substring(0, 3)}</div>
                    <div>
                      <p className="font-black italic uppercase text-slate-900">{shift.pickupTime}-{shift.endTime}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{shift.flightIds?.length || 0} Flights | {shift.targetPower}% Power</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(shift)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => onDelete(shift.id)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                    <button onClick={() => toggleExpand(shift.id)} className="p-2 text-slate-300 hover:text-slate-950 transition-colors">{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t space-y-4 bg-slate-50/50">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Logic Breakdown:</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-[10px] font-black uppercase">Staff: {shift.minStaff}-{shift.maxStaff}</div>
                      <div className="text-[10px] font-black uppercase italic text-indigo-600">Power: {shift.targetPower}%</div>
                    </div>
                    {shift.flightIds && shift.flightIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {shift.flightIds.map(fid => {
                          const flt = flights.find(f => f.id === fid);
                          return flt ? (
                            <span key={fid} className="px-2 py-1 bg-white border rounded-md text-[8px] font-black uppercase">{flt.flightNumber}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
