
import React, { useState, useMemo, useEffect } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { DAYS_OF_WEEK, AVAILABLE_SKILLS } from '../constants';
import { Settings, Calendar, Clock, Timer, PlaneLanding, Sparkles, ArrowRight } from 'lucide-react';

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

  return (
    <div className="space-y-8 lg:space-y-12 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-950 text-white p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 lg:gap-8">
        <div className="relative z-10 text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-600 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Clock className="text-white" size={20} />
            </div>
            <h3 className="text-xl lg:text-4xl font-black uppercase italic tracking-tighter">Duty Master</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div className="xl:col-span-2">
          <div className={`bg-white p-6 lg:p-16 rounded-[2.5rem] lg:rounded-[5rem] shadow-sm border-2 transition-all duration-500 ${editingId ? 'border-indigo-500 ring-4 lg:ring-[20px] ring-indigo-50 shadow-2xl' : 'border-slate-100'}`}>
            <form onSubmit={handleSubmit} className="space-y-8 lg:space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Day</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xs lg:text-sm" value={selectedDays[0]} onChange={e => setSelectedDays([parseInt(e.target.value)])}>
                    {DAYS_OF_WEEK.map((day, i) => <option key={day} value={i}>{day}</option>)}
                  </select>
                </div>
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">Duty Start</label>
                  <input type="time" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xl text-center" value={formData.pickupTime} onChange={e => setFormData({ ...formData, pickupTime: e.target.value })} required />
                </div>
                <div className="space-y-3 lg:space-y-4">
                  <label className="flex items-center gap-2 text-[9px] lg:text-[11px] font-black text-rose-600 uppercase tracking-[0.2em]">Duty End (Auto)</label>
                  <div className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-xl text-center text-rose-700">{formData.endTime || '--:--'}</div>
                </div>
              </div>

              {selectedDays.length === 1 && (
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Link Flight Services</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayFlights.map(flight => {
                      const conflictingShiftId = flightAssignmentsOnDay[flight.id];
                      const taken = !!conflictingShiftId && conflictingShiftId !== editingId;
                      const active = !!formData.flightIds?.includes(flight.id);
                      return (
                        <button key={flight.id} type="button" disabled={taken} onClick={() => toggleFlight(flight.id)} className={`p-5 rounded-3xl border-2 text-left transition-all ${active ? 'bg-indigo-600 border-indigo-600 text-white' : taken ? 'bg-slate-50 opacity-40 cursor-not-allowed' : 'bg-white hover:border-indigo-400'}`}>
                          <div className="font-black italic text-sm">{flight.flightNumber}</div>
                          <div className="text-[10px] font-bold opacity-70">{flight.from} → {flight.to}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase shadow-2xl active:scale-95 italic">
                {editingId ? 'COMMIT CHANGES' : 'CREATE SHIFT SLOTS'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
