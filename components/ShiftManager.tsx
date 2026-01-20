import React, { useState, useMemo } from 'react';
import { ShiftConfig, Flight, Skill } from '../types';
import { AVAILABLE_SKILLS, DAYS_OF_WEEK_FULL } from '../constants';
import * as XLSX from 'xlsx';
import { Clock, Trash2, Edit2, Plus, Minus, FileDown, Calendar, Layers, Sparkles, Plane, ShieldCheck } from 'lucide-react';

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

  const getRoleSummary = (roleCounts: Partial<Record<Skill, number>> | undefined) => {
    if (!roleCounts) return 'None';
    // Removed abbreviations as per user request. Using full role names.
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

  const getFlightById = (id: string) => flights.find(f => f.id === id);

  const exportToExcel = () => {
    if (!shifts.length) return;
    const rows = shifts.flatMap(s => {
      const shiftFlights = (s.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean);
      const roleText = getRoleSummary(s.roleCounts);
      
      const getBase = () => ({
        'Day Index': s.day,
        'Day Name': getDayLabel(s.pickupDate),
        'Shift Start Date': s.pickupDate,
        'Shift Start Time': s.pickupTime,
        'Shift End Date': s.endDate,
        'Shift End Time': s.endTime,
        'Min Staff': s.minStaff,
        'Max Staff': s.maxStaff,
        'Target Power %': s.targetPower || 75,
        'Role Matrix': roleText,
        'Flight No': 'N/A',
        'LBL_DATE': 'Date', 'Value_Date': 'N/A',
        'LBL_STA': 'STA', 'Value_STA': 'N/A',
        'LBL_STD': 'STD', 'Value_STD': 'N/A',
        'LBL_FROM': 'From', 'Value_From': 'N/A',
        'LBL_TO': 'To', 'Value_To': 'N/A'
      });

      if (shiftFlights.length === 0) return [getBase()];

      return shiftFlights.map(f => ({
        ...getBase(),
        'Flight No': f!.flightNumber,
        'Value_Date': f!.date,
        'Value_STA': f!.sta || '--:--',
        'Value_STD': f!.std || '--:--',
        'Value_From': f!.from,
        'Value_To': f!.to
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Shift Registry");
    XLSX.writeFile(workbook, `SkyOPS_Station_Registry.xlsx`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dayOffset = getDayOffset(formData.pickupDate!);
    const finalData = {
      ...formData as ShiftConfig,
      day: dayOffset,
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

  const handleFlightToggle = (flight: Flight) => {
    const current = formData.flightIds || [];
    const isSelected = current.includes(flight.id);
    let next = isSelected ? current.filter(id => id !== flight.id) : [...current, flight.id];
    setFormData(prev => ({ ...prev, flightIds: next }));
  };

  return (
    <div className="space-y-12 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-10 lg:p-14 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Clock size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white">Duty Master</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">21-Column Registry Core</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={onOpenScanner} className="px-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-indigo-600/20 group">
            <Sparkles size={18} className="group-hover:animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">AI Smart Sync</span>
          </button>
          <button onClick={exportToExcel} className="px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-3 transition-all">
            <FileDown size={20} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Full Export</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
        <div className="xl:col-span-1 space-y-10">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
            <h4 className="text-xl font-black italic uppercase mb-10 flex items-center gap-3 text-slate-900">
              {editingId ? <Edit2 size={24} className="text-indigo-600" /> : <Plus size={24} className="text-blue-600" />}
              {editingId ? 'Refine Slot' : 'Engineer Slot'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-blue-500" /> Pickup (Shift Start)
                  </label>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-blue-600/5" value={formData.pickupDate} onChange={e => setFormData(prev => ({ ...prev, pickupDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="06:00" className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none" value={formData.pickupTime} onChange={e => setFormData(prev => ({ ...prev, pickupTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-indigo-500" /> Release (Shift End)
                  </label>
                  <div className="flex gap-3">
                    <input type="date" className="flex-[2] p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-600/5" value={formData.endDate} onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))} required />
                    <input type="text" maxLength={5} placeholder="14:00" className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg text-center outline-none" value={formData.endTime} onChange={e => setFormData(prev => ({ ...prev, endTime: formatTimeInput(e.target.value) }))} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <label className="text-[8px] font-black text-slate-400 uppercase mb-2 block">Min Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center" value={formData.minStaff} onChange={e => setFormData({ ...formData, minStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <label className="text-[8px] font-black text-slate-400 uppercase mb-2 block">Max Staff</label>
                    <input type="number" className="w-full bg-white border border-slate-200 p-2 rounded-xl font-black text-center" value={formData.maxStaff} onChange={e => setFormData({ ...formData, maxStaff: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={14} className="text-blue-500" /> Requirement Matrix</label>
                  <div className="space-y-3">
                    {AVAILABLE_SKILLS.map(skill => (
                      <div key={skill} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[9px] font-black uppercase text-slate-500">{skill}</span>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => updateRoleCount(skill, -1)} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-100"><Minus size={12}/></button>
                          <span className="text-xs font-black text-slate-900 w-4 text-center">{formData.roleCounts?.[skill] || 0}</span>
                          <button type="button" onClick={() => updateRoleCount(skill, 1)} className="w-6 h-6 flex items-center justify-center bg-slate-950 text-white rounded-lg hover:bg-blue-600"><Plus size={12}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              <div className="pt-6 border-t border-slate-50 space-y-4">
                <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><Plane size={14} /> Link Flights</h5>
                <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto no-scrollbar">
                  {[...flights].sort((a,b) => a.date.localeCompare(b.date)).map(f => (
                    <button key={f.id} type="button" onClick={() => handleFlightToggle(f)} className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase italic transition-all ${formData.flightIds?.includes(f.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      {f.flightNumber}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] shadow-2xl active:scale-95 transition-all">
                {editingId ? 'Update Slot' : 'Save Slot'}
              </button>
            </form>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-10 overflow-hidden">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar rounded-[2.5rem] border border-slate-100 shadow-inner">
              <table className="min-w-[2400px] text-left border-collapse">
                <thead className="bg-slate-950 text-white font-black uppercase tracking-widest text-[8px] sticky top-0 z-20">
                  <tr>
                    <th className="px-4 py-6 border-r border-white/5">Day Index</th>
                    <th className="px-4 py-6 border-r border-white/5">Day Name</th>
                    <th className="px-4 py-6 border-r border-white/5">Shift Start Date</th>
                    <th className="px-4 py-6 border-r border-white/5">Shift Start Time</th>
                    <th className="px-4 py-6 border-r border-white/5">Shift End Date</th>
                    <th className="px-4 py-6 border-r border-white/5">Shift End Time</th>
                    <th className="px-4 py-6 border-r border-white/5">Min Staff</th>
                    <th className="px-4 py-6 border-r border-white/5">Max Staff</th>
                    <th className="px-4 py-6 border-r border-white/5">Target Power %</th>
                    <th className="px-4 py-6 border-r border-white/5">Role Matrix</th>
                    <th className="px-4 py-6 border-r border-white/5 bg-indigo-600 text-white">Flight No</th>
                    <th className="px-4 py-6 border-r border-white/5">LBL_DATE</th>
                    <th className="px-4 py-6 border-r border-white/5">Value_Date</th>
                    <th className="px-4 py-6 border-r border-white/5">LBL_STA</th>
                    <th className="px-4 py-6 border-r border-white/5">Value_STA</th>
                    <th className="px-4 py-6 border-r border-white/5">LBL_STD</th>
                    <th className="px-4 py-6 border-r border-white/5">Value_STD</th>
                    <th className="px-4 py-6 border-r border-white/5">LBL_FROM</th>
                    <th className="px-4 py-6 border-r border-white/5">Value_From</th>
                    <th className="px-4 py-6 border-r border-white/5">LBL_TO</th>
                    <th className="px-4 py-6 border-r border-white/5">Value_To</th>
                    <th className="px-4 py-6 text-right sticky right-0 bg-slate-950">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shifts.length === 0 ? (
                    <tr>
                      <td colSpan={22} className="px-6 py-12 text-center text-[10px] font-black uppercase text-slate-300 italic">No shifts configured in Duty Master</td>
                    </tr>
                  ) : shifts.sort((a,b) => a.pickupDate.localeCompare(b.pickupDate) || a.pickupTime.localeCompare(b.pickupTime)).flatMap((s) => {
                    const shiftFlights = (s.flightIds || []).map(fid => getFlightById(fid)).filter(Boolean);
                    
                    const renderRow = (f: Flight | null, fIdx: number) => (
                      <tr key={`${s.id}-${f?.id || 'empty'}`} className={`group hover:bg-slate-50 transition-all font-black text-[10px] uppercase italic text-slate-900 ${fIdx === 0 && shiftFlights.length > 1 ? 'border-t-2 border-slate-200' : ''}`}>
                        <td className="px-4 py-5 border-r border-slate-100 text-slate-300">{s.day}</td>
                        <td className="px-4 py-5 border-r border-slate-100">{getDayLabel(s.pickupDate)}</td>
                        <td className="px-4 py-5 border-r border-slate-100">{s.pickupDate}</td>
                        <td className="px-4 py-5 border-r border-slate-100 font-black">{s.pickupTime}</td>
                        <td className="px-4 py-5 border-r border-slate-100">{s.endDate}</td>
                        <td className="px-4 py-5 border-r border-slate-100 font-black">{s.endTime}</td>
                        <td className="px-4 py-5 border-r border-slate-100 text-center">{s.minStaff}</td>
                        <td className="px-4 py-5 border-r border-slate-100 text-center">{s.maxStaff}</td>
                        <td className="px-4 py-5 border-r border-slate-100 text-center text-blue-600">{s.targetPower || 75}%</td>
                        <td className="px-4 py-5 border-r border-slate-100 text-blue-900 font-black tracking-tight">{getRoleSummary(s.roleCounts)}</td>
                        <td className={`px-4 py-5 border-r border-slate-100 ${f ? 'bg-indigo-600 text-white shadow-inner font-black' : 'text-slate-300 bg-slate-50'}`}>{f?.flightNumber || 'NIL'}</td>
                        <td className="px-4 py-5 border-r border-slate-100 opacity-30 text-[8px]">Date</td>
                        <td className="px-4 py-5 border-r border-slate-100">{f?.date || '-'}</td>
                        <td className="px-4 py-5 border-r border-slate-100 opacity-30 text-[8px]">STA</td>
                        <td className="px-4 py-5 border-r border-slate-100">{f?.sta || '--:--'}</td>
                        <td className="px-4 py-5 border-r border-slate-100 opacity-30 text-[8px]">STD</td>
                        <td className="px-4 py-5 border-r border-slate-100">{f?.std || '--:--'}</td>
                        <td className="px-4 py-5 border-r border-slate-100 opacity-30 text-[8px]">FROM</td>
                        <td className="px-4 py-5 border-r border-slate-100">{f?.from || '-'}</td>
                        <td className="px-4 py-5 border-r border-slate-100 opacity-30 text-[8px]">TO</td>
                        <td className="px-4 py-5 border-r border-slate-100">{f?.to || '-'}</td>
                        <td className="px-4 py-5 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors">
                          {fIdx === 0 && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => startEdit(s)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14}/></button>
                              <button onClick={() => onDelete(s.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={14}/></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );

                    if (shiftFlights.length === 0) return [renderRow(null, 0)];
                    return shiftFlights.map((f, idx) => renderRow(f, idx));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};