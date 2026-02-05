
import React, { useState, useMemo, useEffect } from 'react';
import { Flight } from '../types';
import { Trash2, Eraser, CalendarX, PlaneTakeoff, Clock, MapPin, Edit3, CalendarDays, Sparkles } from 'lucide-react';
import { DAYS_OF_WEEK_FULL } from '../constants';

interface Props {
  flights: Flight[];
  startDate?: string;
  endDate?: string;
  onAdd: (f: Flight) => void;
  onUpdate: (f: Flight) => void;
  onDelete: (id: string) => void;
  onOpenScanner?: () => void;
}

export const FlightManager: React.FC<Props> = ({ flights, startDate, endDate, onAdd, onUpdate, onDelete, onOpenScanner }) => {
  const [newFlight, setNewFlight] = useState<Partial<Flight>>({
    flightNumber: '', from: '', to: '', sta: '', std: '', date: startDate || '', type: 'Turnaround'
  });

  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineFormData, setInlineFormData] = useState<Partial<Flight>>({});

  useEffect(() => {
    if (!newFlight.date && startDate) {
      setNewFlight(prev => ({ ...prev, date: startDate }));
    }
  }, [startDate]);

  const getDayOffset = (dateStr: string) => {
    if (!startDate) return 0;
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const getDayLabel = (dateStr: string) => {
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

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const type: 'Arrival' | 'Departure' | 'Turnaround' = newFlight.sta && !newFlight.std ? 'Arrival' : (!newFlight.sta && newFlight.std ? 'Departure' : 'Turnaround');
    const dateValue = newFlight.date || startDate || new Date().toISOString().split('T')[0];
    
    const flightData: Flight = {
      ...newFlight as Flight,
      type,
      date: dateValue,
      day: getDayOffset(dateValue), 
      flightNumber: (newFlight.flightNumber || "").toUpperCase(),
      from: (newFlight.from || "").toUpperCase(),
      to: (newFlight.to || "").toUpperCase(),
      id: Math.random().toString(36).substr(2, 9),
      priority: 'Standard'
    };
    onAdd(flightData);
    setNewFlight({ flightNumber: '', from: '', to: '', sta: '', std: '', date: dateValue, type: 'Turnaround' });
  };

  const startInlineEdit = (flight: Flight) => {
    setInlineEditingId(flight.id);
    setInlineFormData({ ...flight });
  };

  const handleInlineSave = (e: React.FormEvent) => {
    e.preventDefault();
    const type: 'Arrival' | 'Departure' | 'Turnaround' = inlineFormData.sta && !inlineFormData.std ? 'Arrival' : (!inlineFormData.sta && inlineFormData.std ? 'Departure' : 'Turnaround');
    onUpdate({ ...inlineFormData as Flight, type });
    setInlineEditingId(null);
  };

  const groupedFlights = useMemo(() => {
    const groups: Record<string, Flight[]> = {};
    const sorted = [...flights].sort((a, b) => 
      a.date.localeCompare(b.date) || (a.sta || a.std || '').localeCompare(b.sta || b.std || '')
    );
    sorted.forEach(f => {
      if (!groups[f.date]) groups[f.date] = [];
      groups[f.date].push(f);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [flights]);

  return (
    <div className="space-y-6 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-2xl md:rounded-[3rem] shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6 md:gap-8">
        <div className="flex items-center gap-4 md:gap-6 text-center lg:text-left flex-col lg:flex-row">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <PlaneTakeoff size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-xl md:text-3xl font-black uppercase italic tracking-tighter">Flight Control</h3>
            <p className="text-slate-500 text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-1">
              {flights.length} Registered Services
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button 
            onClick={onOpenScanner}
            className="flex-1 px-5 py-4 lg:px-8 lg:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl lg:rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-600/20 group"
          >
            <Sparkles size={16} className="group-hover:animate-pulse" />
            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest italic">AI Smart Sync</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 md:p-12 rounded-2xl md:rounded-[3.5rem] shadow-sm border border-slate-100">
        <h4 className="text-base md:text-xl font-black italic uppercase mb-6 md:mb-8 flex items-center gap-3 text-slate-900">
          <Edit3 className="text-blue-600" size={18} />
          Register Service
        </h4>
        <form onSubmit={handleAddNew} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-8">
          <div className="space-y-1 md:space-y-2">
            <label className="block text-[7px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Date</label>
            <input 
              type="date" 
              className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-bold text-xs text-slate-900 outline-none" 
              value={newFlight.date} 
              onChange={e => setNewFlight({ ...newFlight, date: e.target.value })} 
              required 
            />
          </div>
          <div className="space-y-1 md:space-y-2">
            <label className="block text-[7px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Flight No</label>
            <input 
              type="text" 
              className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-xs text-slate-900 uppercase outline-none" 
              placeholder="SM 123" 
              value={newFlight.flightNumber} 
              onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} 
              required 
            />
          </div>
          <div className="space-y-1 md:space-y-2">
            <label className="block text-[7px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 text-center">STA / STD</label>
            <div className="flex gap-2">
              <input type="text" maxLength={5} placeholder="STA" className="w-1/2 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-center text-xs text-slate-900 outline-none" value={newFlight.sta} onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} />
              <input type="text" maxLength={5} placeholder="STD" className="w-1/2 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-center text-xs text-slate-900 outline-none" value={newFlight.std} onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1 md:space-y-2">
            <label className="block text-[7px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 text-center">Sector</label>
            <div className="flex gap-2">
              <input type="text" maxLength={4} placeholder="FRM" className="w-1/2 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-center text-xs text-slate-900 uppercase outline-none" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
              <input type="text" maxLength={4} placeholder="TO" className="w-1/2 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-black text-center text-xs text-slate-900 uppercase outline-none" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full py-4 md:py-5 bg-slate-950 text-white rounded-xl md:rounded-2xl font-black uppercase italic text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.2em] transition-all active:scale-95 shadow-lg">
              Commit
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-8 md:space-y-12">
        {groupedFlights.length === 0 ? (
          <div className="py-16 md:py-32 text-center bg-slate-50 rounded-2xl md:rounded-[4rem] border-2 border-dashed border-slate-200 px-6">
            <CalendarX size={40} className="mx-auto text-slate-200 mb-6" />
            <p className="text-base md:text-xl font-black text-slate-300 uppercase italic tracking-tighter">Operational Core Empty</p>
          </div>
        ) : (
          groupedFlights.map(([date, dayFlights]) => {
            const dayOffset = getDayOffset(date);
            const isOutOfRange = (startDate && date < startDate) || (endDate && date > endDate);

            return (
              <div key={date} className="space-y-4 md:space-y-8 animate-in slide-in-from-bottom duration-700">
                <div className={`sticky top-20 md:top-24 z-20 flex items-center justify-between p-4 md:p-6 rounded-xl md:rounded-3xl shadow-xl backdrop-blur-xl border ${
                  isOutOfRange ? 'bg-amber-500/90 border-amber-400 text-white' : 'bg-white/90 border-slate-100 text-slate-900'
                }`}>
                  <div className="flex items-center gap-3 md:gap-6">
                    <div className={`w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-2xl flex items-center justify-center font-black italic text-xs md:text-sm ${
                      isOutOfRange ? 'bg-white/20' : 'bg-slate-950 text-white'
                    }`}>
                      D{dayOffset + 1}
                    </div>
                    <div>
                      <h4 className="text-sm md:text-lg font-black uppercase italic leading-none mb-1">{getDayLabel(date)}</h4>
                      <p className={`text-[7px] md:text-[10px] font-black uppercase tracking-widest ${isOutOfRange ? 'text-white/70' : 'text-slate-400'}`}>
                        {date}
                      </p>
                    </div>
                  </div>
                  <div className="px-2 py-1 bg-black/5 rounded-md font-black text-[7px] md:text-[10px] uppercase tracking-widest shrink-0">
                    {dayFlights.length} FLTS
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {dayFlights.map(flight => (
                    <div key={flight.id} className="bg-white p-6 md:p-8 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-xl hover:border-blue-100 transition-all relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4 md:mb-6">
                        <div className="bg-slate-50 px-2 md:px-3 py-1 rounded-lg md:rounded-xl text-[7px] md:text-[10px] font-black text-blue-600 uppercase italic">
                          {flight.type}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startInlineEdit(flight)} className="p-2 text-slate-300 hover:text-indigo-600"><Edit3 size={14} /></button>
                          <button onClick={() => { if(confirm('Delete flight?')) onDelete(flight.id) }} className="p-2 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
                        </div>
                      </div>

                      <div className="mb-4 md:mb-6">
                        <h5 className="text-xl md:text-3xl font-black italic text-slate-900 tracking-tighter uppercase mb-1">{flight.flightNumber}</h5>
                        <div className="flex items-center gap-2 text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <MapPin size={10} className="text-slate-300" />
                          {flight.from} <span className="text-indigo-300">→</span> {flight.to}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 md:pt-6 border-t border-slate-50">
                        <div className="space-y-1">
                          <span className="text-[6px] md:text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={8} /> STA
                          </span>
                          <span className="text-sm md:text-lg font-black italic text-slate-900">{flight.sta || '--:--'}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[6px] md:text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={8} /> STD
                          </span>
                          <span className="text-sm md:text-lg font-black italic text-slate-900">{flight.std || '--:--'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {inlineEditingId && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-2xl md:rounded-[3.5rem] shadow-2xl max-w-lg w-full p-6 md:p-12 border border-slate-100 animate-in zoom-in-95">
             <h4 className="text-lg md:text-2xl font-black uppercase italic mb-6 md:mb-8 flex items-center gap-3">
               <CalendarDays className="text-indigo-600" /> Refine Service
             </h4>
             <form onSubmit={handleInlineSave} className="space-y-4 md:space-y-6">
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <label className="block text-[8px] md:text-[9px] font-black text-slate-600 uppercase mb-2 ml-1">Date</label>
                    <input type="date" className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold text-xs text-slate-900 outline-none" value={inlineFormData.date} onChange={e => setInlineFormData({...inlineFormData, date: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[8px] md:text-[9px] font-black text-slate-600 uppercase mb-2 ml-1">Flight No</label>
                    <input type="text" className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-black uppercase text-xs text-slate-900 outline-none" value={inlineFormData.flightNumber} onChange={e => setInlineFormData({...inlineFormData, flightNumber: e.target.value?.toUpperCase()})} />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={() => setInlineEditingId(null)} className="flex-1 py-4 text-[8px] md:text-[10px] font-black uppercase text-slate-400">Discard</button>
                   <button type="submit" className="flex-[2] py-4 md:py-5 bg-slate-950 text-white rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase shadow-2xl italic tracking-[0.1em] md:tracking-[0.2em] transition-all active:scale-95">Apply Refinement</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
