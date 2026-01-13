
import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { DAYS_OF_WEEK, AVAILABLE_SKILLS } from '../constants';

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
  const [formData, setFormData] = useState<Partial<ShiftConfig>>({
    pickupTime: '06:00',
    minStaff: 5,
    maxStaff: 8,
    flightIds: [],
    roleCounts: {}
  });

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
    const num = val === '' ? 0 : parseInt(val);
    setFormData({
      ...formData,
      roleCounts: {
        ...(formData.roleCounts || {}),
        [skill]: num
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const finalShiftData = {
      ...formData as ShiftConfig,
      flightIds: formData.flightIds || [],
      roleCounts: formData.roleCounts || {}
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
    setFormData({ pickupTime: '06:00', minStaff: 5, maxStaff: 8, flightIds: [], roleCounts: {} });
    setSelectedDays([0]);
    setEditingId(null);
  };

  const handleEdit = (shift: ShiftConfig) => {
    setFormData({ ...shift, roleCounts: shift.roleCounts || {} });
    setSelectedDays([shift.day]);
    setEditingId(shift.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (shift: ShiftConfig) => {
    if (window.confirm("Are you sure you want to delete this operational shift slot?")) {
      onDelete(shift.id);
      if (editingId === shift.id) resetForm();
    }
  };

  const toggleFlight = (flightId: string) => {
    const assignedToOther = flightAssignmentsOnDay[flightId] && flightAssignmentsOnDay[flightId] !== editingId;
    if (assignedToOther) return;

    const current = formData.flightIds || [];
    if (current.includes(flightId)) {
      setFormData({ ...formData, flightIds: current.filter(id => id !== flightId) });
    } else {
      setFormData({ ...formData, flightIds: [...current, flightId] });
    }
  };

  const loadSampleData = () => {
    const sampleShifts: Partial<ShiftConfig>[] = [
      ...DAYS_OF_WEEK.flatMap((_, i) => [
        { day: i, pickupTime: '06:00', minStaff: 6, maxStaff: 10, roleCounts: { 'Shift Leader': 1, Ramp: 3, Operations: 2, 'Load Control': 1 } },
        { day: i, pickupTime: '14:00', minStaff: 8, maxStaff: 12, roleCounts: { 'Shift Leader': 1, Ramp: 4, Operations: 2, 'Load Control': 1, 'Lost and Found': 1 } },
        { day: i, pickupTime: '22:00', minStaff: 4, maxStaff: 6, roleCounts: { 'Shift Leader': 1, Ramp: 2, Operations: 1, 'Load Control': 1 } }
      ])
    ];

    sampleShifts.forEach(s => {
      onAdd({ ...s as ShiftConfig, id: Math.random().toString(36).substr(2, 9), flightIds: [] });
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[80px] pointer-events-none"></div>
        <div className="relative z-10 text-center md:text-left">
          <h3 className="text-2xl font-black uppercase italic tracking-tight text-white">Shift Master Console</h3>
          <p className="text-slate-400 text-sm max-w-md font-medium leading-relaxed">Define pickup windows and mandatory staffing levels for specific roles like Shift Leaders, Ramp, and Operations.</p>
        </div>
        <div className="relative z-10">
          <button onClick={loadSampleData} className="px-8 py-4 bg-slate-800 text-indigo-400 border border-indigo-500/30 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-slate-700 transition-all active:scale-95 flex items-center gap-2">
            Load Standard Week Data
          </button>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-8">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">
            {editingId ? 'Modify Shift Slot' : 'Register Operational Shift'}
          </h4>
          {editingId && (
            <button onClick={resetForm} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-4 py-2 bg-slate-50 rounded-lg">Discard Edit</button>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Operational Window</label>
              <div className="relative">
                <select 
                  className="w-full appearance-none px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-black text-lg text-slate-900 cursor-pointer transition-all pr-12"
                  value={getDropdownValue()}
                  onChange={handleDropdownChange}
                >
                  {!editingId && (
                    <>
                      <optgroup label="Batch Selection">
                        <option value="all">Full Week (All 7 Days)</option>
                        <option value="weekdays">Weekdays (Mon - Thu)</option>
                        <option value="weekend">Weekend (Fri - Sun)</option>
                      </optgroup>
                      <optgroup label="Individual Days">
                        {DAYS_OF_WEEK.map((day, i) => (
                          <option key={day} value={i}>{getDayFullLabel(i)}</option>
                        ))}
                      </optgroup>
                    </>
                  )}
                  {editingId && (
                    DAYS_OF_WEEK.map((day, i) => (
                      <option key={day} value={i}>{getDayFullLabel(i)}</option>
                    ))
                  )}
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Pickup Time (Duty Start)</label>
              <input type="time" className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-black text-2xl text-slate-900" value={formData.pickupTime} onChange={e => setFormData({ ...formData, pickupTime: e.target.value })} required />
            </div>
          </div>

          <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
             <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Staffing Requirements (Role-Specific)</h5>
             <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Min Total</label>
                  <input type="number" min="1" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-lg" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) })} required />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Max Total</label>
                  <input type="number" min="1" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-lg" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) })} required />
                </div>
                {AVAILABLE_SKILLS.map(skill => (
                  <div key={skill}>
                    <label className="block text-[8px] font-black text-indigo-500 uppercase mb-2">{skill}</label>
                    <input 
                      type="number" 
                      min="0" 
                      placeholder="0"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-lg text-indigo-600 placeholder:text-slate-200" 
                      value={formData.roleCounts?.[skill] ?? ''} 
                      onChange={e => handleRoleCountChange(skill, e.target.value)} 
                    />
                  </div>
                ))}
             </div>
          </div>

          {selectedDays.length === 1 ? (
            <div className="animate-in slide-in-from-bottom duration-500">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Assign Specific Flights for {DAYS_OF_WEEK[selectedDays[0]]}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {dayFlights.map(flight => {
                  const assignedToOther = flightAssignmentsOnDay[flight.id] && flightAssignmentsOnDay[flight.id] !== editingId;
                  const selectedHere = formData.flightIds?.includes(flight.id);
                  return (
                    <button key={flight.id} type="button" disabled={!!assignedToOther} onClick={() => toggleFlight(flight.id)} className={`p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${selectedHere ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20' : assignedToOther ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-60 cursor-not-allowed' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:shadow-lg'}`}>
                      {assignedToOther && <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-200 text-slate-500 text-[7px] font-black uppercase tracking-tighter rounded-bl-lg">Handled</div>}
                      <div className={`text-[9px] font-black uppercase tracking-tighter mb-1 ${selectedHere ? 'text-indigo-200' : 'text-slate-400'}`}>{flight.from} → {flight.to}</div>
                      <div className="text-sm font-black italic tracking-tighter">{flight.flightNumber}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-8 bg-slate-900 rounded-[2.5rem] text-center border border-slate-800">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Batch Processing Active</p>
              <p className="text-xs font-medium text-slate-400 italic">Manual flight assignment is disabled for multi-day ranges.</p>
            </div>
          )}

          <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl active:scale-95 italic">
            {editingId ? 'Commit Changes' : `Register ${selectedDays.length === 1 ? 'Individual' : selectedDays.length} Shift Slot${selectedDays.length > 1 ? 's' : ''}`}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {DAYS_OF_WEEK.map((dayName, dayIndex) => {
          const dayShifts = shifts.filter(s => s.day === dayIndex).sort((a,b) => a.pickupTime.localeCompare(b.pickupTime));
          return (
            <div key={dayName} className="flex flex-col gap-4">
              <div className="text-center py-4 bg-slate-900 rounded-3xl shadow-sm border border-slate-800">
                <span className="text-[10px] font-black text-white uppercase tracking-widest block mb-0.5">{dayName.substring(0,3)}</span>
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.1em]">{getDayDate(dayIndex)}</span>
              </div>
              <div className="space-y-4">
                {dayShifts.map(shift => (
                  <div key={shift.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm group hover:border-indigo-400 hover:shadow-xl transition-all relative">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-base font-black text-slate-900 italic block">{shift.pickupTime}</span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(shift)} className="text-slate-400 hover:text-indigo-600 p-1.5 bg-slate-50 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2.5" /></svg></button>
                        <button onClick={() => handleDeleteClick(shift)} className="text-slate-400 hover:text-red-500 p-1.5 bg-slate-50 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" /></svg></button>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 space-y-3">
                      <div className="flex justify-between items-center">
                         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Target Staff</span>
                         <span className="text-[10px] font-black text-indigo-600">{shift.minStaff}-{shift.maxStaff}</span>
                      </div>
                      
                      {shift.roleCounts && Object.values(shift.roleCounts).some(v => ((v as any) || 0) > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(shift.roleCounts).map(([role, count]) => (
                            count ? (
                              <span key={role} className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[7px] font-black uppercase">
                                {role.substring(0,4)}: {count}
                              </span>
                            ) : null
                          ))}
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Assigned Flights</div>
                        <div className="flex flex-wrap gap-1">
                          {shift.flightIds?.map(fId => {
                            const f = flights.find(fl => fl.id === fId);
                            return f ? <span key={fId} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-black italic">{f.flightNumber}</span> : null;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
