import React, { useState, useMemo, useEffect } from 'react';
import { Flight } from '../types.ts';
import { Trash2, Eraser, CalendarX, PlaneTakeoff, Clock, MapPin, Edit3, CalendarDays, Sparkles } from 'lucide-react';
import { DAYS_OF_WEEK_FULL } from '../constants.tsx';

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
      flightNumber: newFlight.flightNumber!.toUpperCase(),
      from: (newFlight.from || "").toUpperCase(),
      to: (newFlight.to || "").toUpperCase(),
      id: Math.random().toString(36).substr(2, 9),
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

  // Group flights by date
  const groupedFlights = useMemo(() => {
    const groups: Record<string, Flight[]> = {};
    
    // Sort all flights by date and time first
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
    <div className="space-y-12 pb-24 animate-in fade-in duration-500">
      {/* Dynamic Header */}
      <div className="bg-slate-950 text-white p-10 lg:p-14 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <PlaneTakeoff size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter">Flight Control</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
              Active Window: {startDate || "???"} — {endDate || "???"}
            </p>
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
          <button 
            onClick={() => { if(confirm('Wipe all flight data? This cannot be undone.')) flights.forEach(f => onDelete(f.id)) }} 
            className="px-8 py-5 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/20 rounded-2xl flex items-center gap-3 transition-all"
          >
            <Eraser size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest">Clear All</span>
          </button>
        </div>
      </div>

      {/* Quick Add Form */}
      <div className="bg-white p-10 lg:p-12 rounded-[3.5rem] shadow-sm border border-slate-100">
        <h4 className="text-xl font-black italic uppercase mb-10 flex items-center gap-3 text-slate-900">
          <Edit3 className="text-blue-600" />
          Register New Service
        </h4>
        <form onSubmit={handleAddNew} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="space-y-3">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
            <input 
              type="date" 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" 
              value={newFlight.date} 
              onChange={e => setNewFlight({ ...newFlight, date: e.target.value })} 
              required 
            />
          </div>
          <div className="space-y-3">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Flight Number</label>
            <input 
              type="text" 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm uppercase outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" 
              placeholder="SM 123" 
              value={newFlight.flightNumber} 
              onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} 
              required 
            />
          </div>
          <div className="space-y-3">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-center">STA / STD</label>
            <div className="flex gap-2">
              <input type="text" maxLength={5} placeholder="STA" className="w-1/2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center outline-none" value={newFlight.sta} onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} />
              <input type="text" maxLength={5} placeholder="STD" className="w-1/2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center outline-none" value={newFlight.std} onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-3">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-center">Sector (Origin/Dest)</label>
            <div className="flex gap-2">
              <input type="text" maxLength={4} placeholder="FRM" className="w-1/2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center uppercase outline-none" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
              <input type="text" maxLength={4} placeholder="TO" className="w-1/2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center uppercase outline-none" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full py-5 bg-slate-950 text-white rounded-2xl font-black uppercase shadow-2xl italic text-[10px] tracking-[0.2em] transition-all active:scale-95">
              Commit Entry
            </button>
          </div>
        </form>
      </div>

      {/* Grouped Chronological List */}
      <div className="space-y-16">
        {groupedFlights.length === 0 ? (
          <div className="py-32 text-center bg-slate-50 rounded-[4rem] border-2 border-dashed border-slate-200">
            <CalendarX size={64} className="mx-auto text-slate-200 mb-6" />
            <p className="text-xl font-black text-slate-300 uppercase italic tracking-tighter">Operational Core Empty</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">No flights registered for the current session.</p>
          </div>
        ) : (
          groupedFlights.map(([date, dayFlights]) => {
            const dayOffset = getDayOffset(date);
            const isOutOfRange = (startDate && date < startDate) || (endDate && date > endDate);

            return (
              <div key={date} className="space-y-8 animate-in slide-in-from-bottom duration-700">
                {/* Day Header */}
                <div className={`sticky top-4 z-20 flex items-center justify-between p-6 rounded-3xl shadow-xl backdrop-blur-xl border ${
                  isOutOfRange ? 'bg-amber-500/90 border-amber-400 text-white' : 'bg-white/90 border-slate-100 text-slate-900'
                }`}>
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-sm ${
                      isOutOfRange ? 'bg-white/20' : 'bg-slate-950 text-white'
                    }`}>
                      Day {dayOffset + 1}
                    </div>
                    <div>
                      <h4 className="text-lg font-black uppercase italic leading-none mb-1">{getDayLabel(date)}</h4>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${isOutOfRange ? 'text-white/70' : 'text-slate-400'}`}>
                        {date} {isOutOfRange && "— Outside Active Window"}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-black/5 rounded-xl font-black text-[10px] uppercase tracking-widest">
                    {dayFlights.length} {dayFlights.length === 1 ? 'Flight' : 'Flights'}
                  </div>
                </div>

                {/* Flights Grid for this Day */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 px-2">
                  {dayFlights.map(flight => (
                    <div key={flight.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-2xl hover:border-blue-100 transition-all relative overflow-hidden">
                      <div className="flex justify-between items-start mb-6">
                        <div className="bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-blue-600 uppercase italic">
                          {flight.type}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startInlineEdit(flight)} className="p-2 text-slate-300 hover:text-indigo-600"><Edit3 size={18} /></button>
                          <button onClick={() => { if(confirm('Delete flight?')) onDelete(flight.id) }} className="p-2 text-slate-300 hover:text-rose-600"><Trash2 size={18} /></button>
                        </div>
                      </div>

                      <div className="mb-6">
                        <h5 className="text-3xl font-black italic text-slate-900 tracking-tighter uppercase mb-1">{flight.flightNumber}</h5>
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <MapPin size={12} className="text-slate-300" />
                          {flight.from} <span className="text-indigo-300 mx-1">→</span> {flight.to}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} /> STA
                          </span>
                          <span className="text-lg font-black italic text-slate-900">{flight.sta || '--:--'}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} /> STD
                          </span>
                          <span className="text-lg font-black italic text-slate-900">{flight.std || '--:--'}</span>
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

      {/* Edit Modal */}
      {inlineEditingId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl">
          <div className="bg-white rounded-[3.5rem] shadow-2xl max-w-lg w-full p-12 border border-slate-100">
             <h4 className="text-2xl font-black uppercase italic mb-8 flex items-center gap-3">
               <CalendarDays className="text-indigo-600" /> Refine Service
             </h4>
             <form onSubmit={handleInlineSave} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Date</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={inlineFormData.date} onChange={e => setInlineFormData({...inlineFormData, date: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Flight Number</label>
                    <input type="text" className="w-full p-4 bg-slate-50 border rounded-2xl font-black uppercase outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={inlineFormData.flightNumber} onChange={e => setInlineFormData({...inlineFormData, flightNumber: e.target.value.toUpperCase()})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">STA</label>
                      <input type="text" maxLength={5} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-center outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="HH:mm" value={inlineFormData.sta} onChange={e => setInlineFormData({...inlineFormData, sta: formatTimeInput(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">STD</label>
                      <input type="text" maxLength={5} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-center outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="HH:mm" value={inlineFormData.std} onChange={e => setInlineFormData({...inlineFormData, std: formatTimeInput(e.target.value)})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">From</label>
                      <input type="text" maxLength={4} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-center uppercase outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={inlineFormData.from} onChange={e => setInlineFormData({...inlineFormData, from: e.target.value.toUpperCase()})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">To</label>
                      <input type="text" maxLength={4} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-center uppercase outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={inlineFormData.to} onChange={e => setInlineFormData({...inlineFormData, to: e.target.value.toUpperCase()})} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={() => setInlineEditingId(null)} className="flex-1 py-5 text-[10px] font-black uppercase text-slate-400">Discard</button>
                   <button type="submit" className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase shadow-2xl italic tracking-[0.2em] transition-all active:scale-95">Apply Refinement</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};