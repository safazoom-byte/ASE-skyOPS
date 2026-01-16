import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { AVAILABLE_SKILLS, DAYS_OF_WEEK_FULL } from '../constants';
import * as XLSX from 'xlsx';
import { Clock, Trash2, Edit2, Users, Award, ShieldCheck, Target, Plus, Minus, FileDown, Calendar, Layers, Zap, Plane } from 'lucide-react';

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

  const dayFlights = useMemo(() => {
    return flights.filter(f => f.date === formData.pickupDate);
  }, [flights, formData.pickupDate]);

  const updateRoleCount = (skill: Skill, delta: number) => {
    const current = formData.roleCounts || {};
    const newVal = Math.max(0, (Number(current[skill]) || 0) + delta);
    setFormData({
      ...formData,
      roleCounts: { ...current, [skill]: newVal }
    });
  };

  const exportToExcel = () => {
    // Flatten shifts: Each flight gets its own row with granular label/value pairs
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

      // If no flights, return one row with placeholders
      if (!s.flightIds || s.flightIds.length === 0) {
        return [{
          ...baseInfo,
          'Flight No': 'N/A',
          'LBL_DATE': 'DATE',
          'Value_Date': '-',
          'LBL_STA': 'STA',
          'Value_STA': '-',
          'LBL_STD': 'STD',
          'Value_STD': '-',
          'LBL_FROM': 'FROM',
          'Value_From': '-',
          'LBL_TO': 'TO',
          'Value_To': '-'
        }];
      }

      // Return a discrete row for every flight linked to this shift
      return s.flightIds.map(fId => {
        const f = flights.find(fl => fl.id === fId);
        return {
          ...baseInfo,
          'Flight No': f?.flightNumber || 'Unknown',
          'LBL_DATE': 'DATE',
          'Value_Date': f?.date || '-',
          'LBL_STA': 'STA',
          'Value_STA': f?.sta || '--',
          'LBL_STD': 'STD',
          'Value_STD': f?.std || '--',
          'LBL_FROM': 'FROM',
          'Value_From': f?.from || '-',
          'LBL_TO': 'TO',
          'Value_To': f?.to || '-'
        };
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Station_Shift_Report");
    XLSX.writeFile(workbook, `SkyOPS_Station_Duty_Program_${new Date().toISOString().split('T')[0]}.xlsx`);
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

  const groupedShifts = useMemo(() => {
    const groups: Record<string, ShiftConfig[]> = {};
    shifts.forEach(s => {
      if (!groups[s.pickupDate]) groups[s.pickupDate] = [];
      groups[s.pickupDate].push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  return (
    <div className="space-y-12 pb-24">
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
        <button onClick={exportToExcel} className="px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-3 transition-all">
          <FileDown size={20} className="text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-widest">Master Export</span>
        </button>
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
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-blue-500" /> Pickup (Shift Start)
                  </label>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none" value={formData.pickupDate} onChange={e => setFormData(prev => ({ ...prev, pickupDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="06:00" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none" value={formData.pickupTime} onChange={e => setFormData(prev => ({ ...prev, pickupTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-indigo-500" /> Release (Shift End)
                  </label>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none" value={formData.endDate} onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="14:00" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none" value={formData.endTime} onChange={e => setFormData(prev => ({ ...prev, endTime: formatTimeInput(e.target.value) }))} required />
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
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3">Min Staff</label>
                    <input type="number" min="1" className="w-full bg-transparent font-black text-2xl outline-none" value={formData.minStaff} onChange={e => setFormData({...formData, minStaff: parseInt(e.target.value) || 1})} />
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3">Max Staff</label>
                    <input type="number" min="1" className="w-full bg-transparent font-black text-2xl outline-none" value={formData.maxStaff} onChange={e => setFormData({...formData, maxStaff: parseInt(e.target.value) || 1})} />
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3">Target Power %</label>
                    <input type="number" min="50" max="1000" className="w-full bg-transparent font-black text-2xl outline-none" value={formData.targetPower} onChange={e => setFormData({...formData, targetPower: parseInt(e.target.value) || 75})} />
                  </div>
                </div>
              </div>

              <div className="pt-10 border-t border-slate-50 space-y-8">
                <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Target size={14} /> Linked Flights (Operations Link)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {dayFlights.length === 0 ? (
                    <p className="col-span-full text-[10px] font-black text-slate-300 uppercase italic py-10 text-center border-2 border-dashed border-slate-100 rounded-3xl">No flights registered for {formData.pickupDate}.</p>
                  ) : dayFlights.map(flight => {
                    const active = formData.flightIds?.includes(flight.id);
                    return (
                      <button 
                        key={flight.id} type="button" 
                        onClick={() => {
                          const current = formData.flightIds || [];
                          const updated = active ? current.filter(id => id !== flight.id) : [...current, flight.id];
                          setFormData({ ...formData, flightIds: updated });
                        }}
                        className={`p-4 rounded-xl border text-left transition-all ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                      >
                        <p className="font-black italic text-xs uppercase">{flight.flightNumber}</p>
                        <p className={`text-[8px] font-bold opacity-60 mt-1 uppercase ${active ? 'text-white' : 'text-slate-400'}`}>{flight.sta || '--'}/{flight.std || '--'}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                {editingId && <button type="button" onClick={resetForm} className="px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Discard Changes</button>}
                <button type="submit" className="flex-1 py-5 bg-slate-950 text-white rounded-2xl font-black uppercase shadow-2xl italic text-xs tracking-[0.2em] transition-all">
                  {editingId ? 'SAVE REQUIREMENT' : 'COMMIT DUTY SLOT'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-8">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 flex items-center gap-2">
            <Layers size={14} /> Station Program Roadmap
          </h4>
          
          <div className="space-y-12">
            {groupedShifts.map(([date, dayShifts]) => {
              const dayOffset = getDayOffset(date);
              return (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-4 px-4">
                    <div className="px-3 py-1 bg-slate-950 text-white rounded-lg font-black italic text-[9px] uppercase tracking-widest">Day {dayOffset + 1}</div>
                    <div>
                      <p className="text-xs font-black uppercase italic text-slate-900 leading-none mb-1">{getDayLabel(date)}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{date}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {dayShifts.sort((a,b) => a.pickupTime.localeCompare(b.pickupTime)).map(shift => (
                      <div key={shift.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 group transition-all hover:shadow-xl">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="font-black italic uppercase text-slate-900 text-lg leading-none mb-2">{shift.pickupTime} — {shift.endTime}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Release: {shift.endDate}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(shift)} className="p-2 text-slate-300 hover:text-indigo-600"><Edit2 size={18} /></button>
                            <button onClick={() => onDelete(shift.id)} className="p-2 text-slate-300 hover:text-rose-600"><Trash2 size={18} /></button>
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-1"><Award size={10}/> Skill Quotas</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(shift.roleCounts || {}).map(([role, count]) => {
                              if (Number(count) <= 0) return null;
                              return (
                                <div key={role} className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[7px] font-black uppercase border border-slate-800">
                                  {role.substring(0, 10)}: {count}
                                </div>
                              );
                            })}
                            {Object.values(shift.roleCounts || {}).every(v => Number(v) === 0) && (
                              <span className="text-[7px] font-bold text-slate-300 italic">No specific quotas</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-1"><Plane size={10}/> Linked Services</p>
                          <div className="flex flex-wrap gap-1.5">
                            {shift.flightIds?.length ? shift.flightIds.map(fId => {
                              const f = flights.find(fl => fl.id === fId);
                              return f ? (
                                <span key={fId} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase border border-indigo-100">
                                  {f.flightNumber} ({f.date}) | {f.sta || '--'}/{f.std || '--'}
                                </span>
                              ) : null;
                            }) : <span className="text-[8px] font-bold text-slate-300 italic">No direct links</span>}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-50">
                          <div className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[8px] font-black uppercase flex items-center gap-1.5">
                            <Users size={12} /> {shift.minStaff}-{shift.maxStaff}
                          </div>
                          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[8px] font-black uppercase flex items-center gap-1.5">
                            <Zap size={12} /> {shift.targetPower}%
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
      </div>
    </div>
  );
};