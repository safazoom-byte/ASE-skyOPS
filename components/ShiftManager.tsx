
import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
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
  ArrowRight
} from 'lucide-react';

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  startDate?: string;
  onAdd: (s: ShiftConfig) => void;
  onUpdate: (s: ShiftConfig) => void;
  onDelete: (id: string) => void;
  onOpenScanner?: () => void;
}

export const ShiftManager: React.FC<Props> = ({ shifts = [], flights = [], startDate, onAdd, onUpdate, onDelete, onOpenScanner }) => {
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

  const getDayOffset = (dateStr: string) => {
    if (!startDate || !dateStr) return 0;
    const start = new Date(startDate);
    const target = new Date(dateStr);
    if (isNaN(start.getTime()) || isNaN(target.getTime())) return 0;
    
    start.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const availableFlights = useMemo(() => {
    if (!formData.pickupDate) return [];
    const targetOffset = getDayOffset(formData.pickupDate);
    return flights.filter(f => {
      const flightOffset = getDayOffset(f.date);
      return Math.abs(flightOffset - targetOffset) <= 1;
    });
  }, [flights, formData.pickupDate, startDate]);

  const getDayLabel = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'Invalid Date' : DAYS_OF_WEEK_FULL[date.getDay()];
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

  const getRoleSummary = (roleCounts: Partial<Record<Skill, number>> | undefined) => {
    if (!roleCounts) return 'None';
    const parts = Object.entries(roleCounts)
      .filter(([_, count]) => count && count > 0)
      .map(([role, count]) => `${role}: ${count}`);
    return parts.length > 0 ? parts.join(', ') : 'None';
  };

  const updateRoleCount = (skill: Skill, delta: number) => {
    const current = formData.roleCounts || {};
    const newVal = Math.max(0, (Number(current[skill]) || 0) + delta);
    setFormData(prev => ({
      ...prev,
      roleCounts: { ...current, [skill]: newVal }
    }));
  };

  const toggleFlightEngagement = (flightId: string) => {
    const current = formData.flightIds || [];
    const next = current.includes(flightId) 
      ? current.filter(id => id !== flightId) 
      : [...current, flightId];
    setFormData(prev => ({ ...prev, flightIds: next }));
  };

  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const exportToExcel = () => {
    if (!shifts.length) return;
    const rows = shifts.flatMap(s => {
      const shiftFlights = (s.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean);
      const getBase = () => ({
        'Day Index': s.day,
        'Day Name': getDayLabel(s.pickupDate),
        'Shift Start Date': s.pickupDate,
        'Shift Start Time': s.pickupTime,
        'Shift End Date': s.endDate,
        'Shift End Time': s.endTime,
        'Min Staff': s.minStaff,
        'Max Staff': s.maxStaff,
        'Role Matrix': getRoleSummary(s.roleCounts)
      });
      if (shiftFlights.length === 0) return [getBase()];
      return shiftFlights.map(f => ({ ...getBase(), 'Flight No': f!.flightNumber }));
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Shift Registry");
    XLSX.writeFile(workbook, `SkyOPS_Station_Registry.xlsx`);
  };

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

  const durationText = calculateDuration();

  return (
    <div className="space-y-8 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
        <div className="flex items-center gap-4 md:gap-6 text-center md:text-left flex-col md:flex-row">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Clock size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white">Duty Master</h3>
            <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-1">Operational Registry</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={onOpenScanner} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl shadow-indigo-600/20">
            <Sparkles size={16} className="group-hover:animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">AI Smart Sync</span>
          </button>
          <button onClick={exportToExcel} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all">
            <FileDown size={18} className="text-emerald-400" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white">Export</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 md:gap-10">
        <div className="xl:col-span-1 space-y-8 md:space-y-10">
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 xl:sticky xl:top-24">
            <h4 className="text-lg md:text-xl font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900">
              {editingId ? <Edit2 size={20} className="text-indigo-600" /> : <Plus size={20} className="text-blue-600" />}
              {editingId ? 'Refine Slot' : 'New Slot'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
                <div className="space-y-3 md:space-y-4">
                  <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Calendar size={12} className="text-blue-600" /> Pickup Start
                  </label>
                  <div className="flex flex-col gap-2">
                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-xs outline-none" value={formData.pickupDate} onChange={e => setFormData(prev => ({ ...prev, pickupDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="06:00" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-base md:text-lg text-center outline-none" value={formData.pickupTime} onChange={e => setFormData(prev => ({ ...prev, pickupTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={12} className="text-indigo-600" /> Release End
                    </label>
                    {durationText && <span className="text-[7px] md:text-[8px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded">Dur: {durationText}</span>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-xs outline-none" value={formData.endDate} onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="14:00" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-base md:text-lg text-center outline-none" value={formData.endTime} onChange={e => setFormData(prev => ({ ...prev, endTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="space-y-3 md:space-y-4 pt-4 border-t border-slate-50">
                  <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Plane size={12} className="text-indigo-600" /> Handled Flights
                  </label>
                  <div className="space-y-2 max-h-[250px] md:max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                    {availableFlights.length === 0 ? (
                      <div className="p-4 md:p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">No flights in range</p>
                      </div>
                    ) : (
                      availableFlights.map(flight => {
                        const isEngaged = formData.flightIds?.includes(flight.id);
                        const flightOffset = getDayOffset(flight.date);
                        const targetOffset = getDayOffset(formData.pickupDate!);
                        const diff = flightOffset - targetOffset;
                        const dayLabel = diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : 'Today';

                        return (
                          <button
                            key={flight.id}
                            type="button"
                            onClick={() => toggleFlightEngagement(flight.id)}
                            className={`w-full p-3 md:p-4 rounded-xl md:rounded-2xl border text-left transition-all ${
                              isEngaged 
                                ? 'bg-slate-950 border-slate-900 text-white shadow-md' 
                                : 'bg-white border-slate-100 text-slate-900'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-xs md:text-sm font-black italic uppercase tracking-tighter">{flight.flightNumber}</span>
                              <span className={`text-[6px] md:text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${
                                diff === 0 ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                              }`}>{dayLabel}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-50">
                              <span>STA {flight.sta || '--'}</span>
                              <span>STD {flight.std || '--'}</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="p-3 md:p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                    <label className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-2 block">Min Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-lg md:rounded-xl font-black text-center text-sm" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="p-3 md:p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                    <label className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-2 block">Max Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-lg md:rounded-xl font-black text-center text-sm" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                <div className="space-y-3 md:space-y-4 pt-4 border-t border-slate-50">
                  <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <ShieldCheck size={12} className="text-blue-600" /> Specialist Matrix
                  </label>
                  <div className="space-y-2 md:space-y-3">
                    {AVAILABLE_SKILLS.map(skill => (
                      <div key={skill} className="flex items-center justify-between p-2.5 md:p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[8px] md:text-[9px] font-black uppercase text-slate-500">{skill}</span>
                        <div className="flex items-center gap-2 md:gap-3">
                          <button type="button" onClick={() => updateRoleCount(skill, -1)} className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg">
                            <Minus size={12}/>
                          </button>
                          <span className="text-xs font-black text-slate-900 w-3 md:w-4 text-center">{formData.roleCounts?.[skill] || 0}</span>
                          <button type="button" onClick={() => updateRoleCount(skill, 1)} className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-slate-950 text-white rounded-lg">
                            <Plus size={12}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              <div className="flex gap-3 pt-4">
                 {editingId && (
                   <button type="button" onClick={resetForm} className="flex-1 py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-400 italic">Cancel</button>
                 )}
                 <button type="submit" className="flex-[2] py-4 md:py-6 bg-slate-950 text-white rounded-2xl md:rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-[10px] active:scale-95">
                   {editingId ? 'Update' : 'Save Slot'}
                 </button>
              </div>
            </form>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-8 md:space-y-10 overflow-hidden">
          <div className="bg-white p-4 md:p-10 rounded-3xl md:rounded-[4rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar rounded-2xl md:rounded-[3rem] border border-slate-100 shadow-inner">
              <table className="min-w-[1200px] text-left border-collapse">
                <thead className="bg-slate-950 text-white font-black uppercase tracking-widest text-[8px] sticky top-0 z-20">
                  <tr>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5">Day</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5">Date</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5">Time</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5 text-center">HC</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5 bg-blue-600/20">Flights</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5">STA/STD</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 border-r border-white/5">Matrix</th>
                    <th className="px-4 py-5 md:px-6 md:py-7 text-right sticky right-0 bg-slate-950">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shifts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 md:py-32 text-center text-slate-300 font-black uppercase italic text-lg md:text-xl">
                        Registry Empty
                      </td>
                    </tr>
                  ) : (
                    [...shifts].sort((a,b) => (a.pickupDate || '').localeCompare(b.pickupDate || '') || (a.pickupTime || '').localeCompare(b.pickupTime || '')).map((s) => {
                      const engagedFlights = (s.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors align-top">
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100">
                             <span className="font-black text-slate-900 italic block text-xs md:text-sm">{getDayLabel(s.pickupDate)}</span>
                             <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">D{s.day + 1}</span>
                          </td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100 font-black text-slate-600 text-[10px] md:text-[11px]">{s.pickupDate}</td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100 font-black text-slate-950 text-base md:text-lg italic whitespace-nowrap">{s.pickupTime} — {s.endTime}</td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100 text-center">
                             <div className="inline-flex flex-col items-center">
                               <span className="font-black text-base md:text-lg italic text-slate-900 leading-none">{s.minStaff}—{s.maxStaff}</span>
                             </div>
                          </td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100 bg-blue-50/30">
                             <div className="flex flex-wrap gap-1 md:gap-2">
                               {engagedFlights.map(f => (
                                 <div key={f!.id} className="px-2 py-1 bg-slate-950 text-white rounded text-[8px] md:text-[9px] font-black uppercase italic flex items-center gap-1.5">
                                   <Plane size={8} className="text-blue-400" /> {f!.flightNumber}
                                 </div>
                               ))}
                               {engagedFlights.length === 0 && <span className="text-[8px] font-black text-slate-300 uppercase italic">None</span>}
                             </div>
                          </td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100 min-w-[100px]">
                             <div className="space-y-1">
                               {engagedFlights.map(f => (
                                 <div key={f!.id} className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5 truncate">
                                   {f!.sta || '--'}/{f!.std || '--'}
                                 </div>
                               ))}
                             </div>
                          </td>
                          <td className="px-4 py-6 md:px-6 md:py-8 border-r border-slate-100">
                             <div className="flex flex-wrap gap-1">
                               {Object.entries(s.roleCounts || {}).filter(([_, c]) => (c as number) > 0).map(([role, count]) => (
                                 <span key={role} className="px-2 py-0.5 bg-slate-100 rounded text-[7px] md:text-[8px] font-black text-slate-500 uppercase">
                                   {role.split(' ')[0]}: {count}
                                 </span>
                               ))}
                             </div>
                          </td>
                          <td className="px-4 py-6 md:px-6 md:py-8 text-right sticky right-0 bg-white/95 backdrop-blur-sm group">
                             <div className="flex justify-end gap-1.5 md:gap-2">
                               <button onClick={() => startEdit(s)} className="p-2 md:p-3 bg-slate-100 text-slate-600 rounded-lg md:rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                                 <Edit2 size={14} />
                               </button>
                               <button onClick={() => { if(confirm('Delete slot?')) onDelete(s.id); }} className="p-2 md:p-3 bg-rose-50 text-rose-500 rounded-lg md:rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                                 <Trash2 size={14} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
