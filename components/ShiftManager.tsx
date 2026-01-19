
import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { AVAILABLE_SKILLS, DAYS_OF_WEEK_FULL } from '../constants';
import * as XLSX from 'xlsx';
import { Clock, Trash2, Edit2, Users, Award, ShieldCheck, Target, Plus, Minus, FileDown, Calendar, Layers, Zap, Plane, Sparkles, Link as LinkIcon } from 'lucide-react';

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
    minStaff: 4,
    maxStaff: 8,
    targetPower: 75,
    flightIds: [],
    roleCounts: {}
  });

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'Invalid Date' : DAYS_OF_WEEK_FULL[date.getDay()];
  };

  const getDayOffset = (dateStr: string) => {
    if (!startDate) return 0;
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
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

  // Show all flights to allow picking a flight to inherit its date, or filter to a reasonable range
  const availableFlights = useMemo(() => {
    return [...flights].sort((a, b) => a.date.localeCompare(b.date) || a.flightNumber.localeCompare(b.flightNumber));
  }, [flights]);

  const updateRoleCount = (skill: Skill, delta: number) => {
    const current = formData.roleCounts || {};
    const newVal = Math.max(0, (Number(current[skill]) || 0) + delta);
    setFormData({
      ...formData,
      roleCounts: { ...current, [skill]: newVal }
    });
  };

  const exportToExcel = () => {
    if (!shifts.length) return;
    const rows = shifts.flatMap(s => {
      const roleMatrix = Object.entries(s.roleCounts || {})
        .filter(([_, count]) => Number(count) > 0)
        .map(([role, count]) => `${role}: ${count}`)
        .join(', ');

      const baseInfo = {
        'Day Index': `Day ${getDayOffset(s.pickupDate) + 1}`,
        'Day Name': getDayLabel(s.pickupDate),
        'Shift Start Date': s.pickupDate,
        'Shift Start Time': s.pickupTime,
        'Shift End Date': s.endDate,
        'Shift End Time': s.endTime,
        'Min Staff': s.minStaff,
        'Max Staff': s.maxStaff,
        'Target Power %': s.targetPower,
        'Role Matrix': roleMatrix
      };

      if (!s.flightIds || s.flightIds.length === 0) {
        return [{
          ...baseInfo,
          'Flight No': 'N/A'
        }];
      }

      return s.flightIds.map(fId => {
        const f = flights.find(fl => fl.id === fId);
        return {
          ...baseInfo,
          'Flight No': f?.flightNumber || 'Unknown',
          'STA': f?.sta || '--',
          'STD': f?.std || '--',
          'Sector': `${f?.from || '-'} to ${f?.to || '-'}`
        };
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Station_Shift_Report");
    XLSX.writeFile(workbook, `SkyOPS_Shift_Program_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dayOffset = getDayOffset(formData.pickupDate!);
    const finalData = {
      ...formData as ShiftConfig,
      day: dayOffset,
      id: editingId || Math.random().toString(36).substr(2, 9)
    };
    if (editingId) {
      onUpdate(finalData);
    } else {
      onAdd(finalData);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      pickupDate: startDate || new Date().toISOString().split('T')[0], 
      pickupTime: '06:00', 
      endDate: startDate || new Date().toISOString().split('T')[0], 
      endTime: '14:00', 
      minStaff: 4, 
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

  const handleFlightToggle = (flight: Flight) => {
    const current = formData.flightIds || [];
    const isSelected = current.includes(flight.id);
    
    let next = isSelected 
      ? current.filter(id => id !== flight.id) 
      : [...current, flight.id];

    // Inheritance logic: If we just added a flight, inherit its date
    const updates: Partial<ShiftConfig> = { flightIds: next };
    if (!isSelected) {
      updates.pickupDate = flight.date;
      updates.endDate = flight.date;
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

  const groupedShifts = useMemo(() => {
    const groups: Record<string, ShiftConfig[]> = {};
    shifts.forEach(s => {
      if (!groups[s.pickupDate]) groups[s.pickupDate] = [];
      groups[s.pickupDate].push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  const hasSelectedFlights = (formData.flightIds?.length || 0) > 0;

  return (
    <div className="space-y-12 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-10 lg:p-14 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Clock size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter">Duty Master</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Operational Requirements Mapping</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={onOpenScanner}
            className="px-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-indigo-600/20 group"
          >
            <Sparkles size={18} className="group-hover:animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">AI Smart Sync</span>
          </button>
          <button onClick={exportToExcel} className="px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-3 transition-all">
            <FileDown size={20} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">Master Export</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-10">
          <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100">
            <h4 className="text-xl font-black italic uppercase mb-10 flex items-center gap-3 text-slate-900">
              {editingId ? <Edit2 className="text-indigo-600" /> : <Plus className="text-blue-600" />}
              {editingId ? 'Refine Active Requirement' : 'Engineer New Shift Slot'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} className="text-blue-500" /> Pickup (Shift Start)
                    </label>
                    {hasSelectedFlights && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 animate-pulse">
                        <LinkIcon size={10} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Date Synced</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none transition-all focus:ring-4 focus:ring-blue-600/5" value={formData.pickupDate} onChange={e => setFormData(prev => ({ ...prev, pickupDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="06:00" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none focus:ring-4 focus:ring-blue-600/5" value={formData.pickupTime} onChange={e => setFormData(prev => ({ ...prev, pickupTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} className="text-indigo-500" /> Release (Shift End)
                    </label>
                    {hasSelectedFlights && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 animate-pulse">
                        <LinkIcon size={10} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Date Synced</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none transition-all focus:ring-4 focus:ring-indigo-600/5" value={formData.endDate} onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="14:00" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none focus:ring-4 focus:ring-indigo-600/5" value={formData.endTime} onChange={e => setFormData(prev => ({ ...prev, endTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>
              </div>

              <div className="pt-10 border-t border-slate-50 space-y-8">
                <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Award size={14} /> Specific Role Matrix
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {AVAILABLE_SKILLS.map(skill => (
                    <div key={skill} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl group hover:border-indigo-300 transition-all">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900">{skill}</span>
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={() => updateRoleCount(skill, -1)} className="p-2 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"><Minus size={14} /></button>
                        <span className="w-8 text-center font-black text-sm">{formData.roleCounts?.[skill] || 0}</span>
                        <button type="button" onClick={() => updateRoleCount(skill, 1)} className="p-2 bg-slate-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"><Plus size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-10 border-t border-slate-50 space-y-8">
                <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2"><ShieldCheck size={14} /> Capacity Targets</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] space-y-3">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Min Personnel</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-4 rounded-xl font-black text-lg outline-none" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] space-y-3">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Max Personnel</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-4 rounded-xl font-black text-lg outline-none" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] space-y-3">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Target Power %</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-4 rounded-xl font-black text-lg outline-none" value={formData.targetPower} onChange={e => setFormData({ ...formData, targetPower: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              <div className="pt-10 border-t border-slate-50 space-y-8">
                <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center gap-2"><Plane size={14} /> Flight Coupling</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                  {availableFlights.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic font-bold">No flights registered in system.</p>
                  ) : availableFlights.map(f => (
                    <button 
                      key={f.id} type="button" 
                      onClick={() => handleFlightToggle(f)}
                      className={`p-4 rounded-2xl border text-[10px] font-black uppercase italic tracking-widest transition-all text-left flex flex-col gap-1 ${
                        formData.flightIds?.includes(f.id) ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-400'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{f.flightNumber}</span>
                        {formData.flightIds?.includes(f.id) ? <Plus className="rotate-45" size={12} /> : <Plus size={12} />}
                      </div>
                      <span className={`text-[8px] font-black opacity-60`}>
                        {new Date(f.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-10">
                {editingId && (
                  <button type="button" onClick={resetForm} className="flex-1 py-6 text-[10px] font-black uppercase text-slate-400 italic">Cancel Refinement</button>
                )}
                <button type="submit" className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] shadow-2xl active:scale-95 transition-all">
                  {editingId ? 'Apply Logical Changes' : 'Commit Requirement Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-10">
          <div className="bg-slate-950 p-10 rounded-[3.5rem] text-white shadow-2xl">
            <h5 className="text-xl font-black uppercase italic mb-8 flex items-center gap-3"><Layers className="text-blue-500" /> Operational Stack</h5>
            <div className="space-y-6">
              {groupedShifts.length === 0 ? (
                <div className="py-12 text-center opacity-30">
                  <Clock size={48} className="mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No Active Requirements</p>
                </div>
              ) : groupedShifts.map(([date, dayShifts]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{getDayLabel(date)}</p>
                    <p className="text-[9px] font-black text-slate-700 uppercase">{date}</p>
                  </div>
                  {dayShifts.map(s => (
                    <div key={s.id} className="p-6 bg-white/5 border border-white/10 rounded-[2rem] group hover:bg-white/10 transition-all cursor-pointer" onClick={() => startEdit(s)}>
                      <div className="flex justify-between items-start mb-4">
                         <div className="flex items-center gap-3">
                           <Zap size={14} className="text-blue-400" />
                           <span className="font-black italic text-lg">{s.pickupTime} — {s.endTime}</span>
                         </div>
                         <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="p-2 bg-white/5 text-slate-500 hover:text-rose-500 rounded-lg"><Trash2 size={14} /></button>
                         </div>
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <Users size={12} className="text-slate-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.minStaff}-{s.maxStaff} Agents Required</span>
                      </div>
                      {Object.keys(s.roleCounts || {}).some(k => (s.roleCounts?.[k as Skill] || 0) > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(s.roleCounts || {}).map(([role, count]) => count && Number(count) > 0 ? (
                            <span key={role} className="px-2 py-1 bg-white/5 border border-white/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-400">
                              {role}: {count}
                            </span>
                          ) : null)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
