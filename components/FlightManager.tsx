
import React, { useState, useMemo, useEffect } from 'react';
import { Flight } from '../types';
import { Trash2, Eraser, CalendarX } from 'lucide-react';

interface Props {
  flights: Flight[];
  startDate?: string;
  endDate?: string;
  onAdd: (f: Flight) => void;
  onUpdate: (f: Flight) => void;
  onDelete: (id: string) => void;
}

export const FlightManager: React.FC<Props> = ({ flights, startDate, endDate, onAdd, onUpdate, onDelete }) => {
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

  const flightsInRange = useMemo(() => {
    if (!startDate || !endDate) return flights;
    return flights.filter(f => f.date >= startDate && f.date <= endDate);
  }, [flights, startDate, endDate]);

  const getDayDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimeInput = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length <= 2) return cleaned;
    return cleaned.slice(0, 2) + ':' + cleaned.slice(2, 4);
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const type: 'Arrival' | 'Departure' | 'Turnaround' = newFlight.sta && !newFlight.std ? 'Arrival' : (!newFlight.sta && newFlight.std ? 'Departure' : 'Turnaround');
    const dateValue = newFlight.date || startDate || new Date().toISOString().split('T')[0];
    
    const flightData: Flight = {
      ...newFlight as Flight,
      type,
      date: dateValue,
      day: 0, 
      flightNumber: newFlight.flightNumber!.toUpperCase(),
      from: (newFlight.from || "").toUpperCase(),
      to: (newFlight.to || "").toUpperCase(),
      id: Math.random().toString(36).substr(2, 9),
    };
    onAdd(flightData);
    setNewFlight({ flightNumber: '', from: '', to: '', sta: '', std: '', date: startDate || '', type: 'Turnaround' });
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

  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => a.date.localeCompare(b.date) || (a.sta || '').localeCompare(b.sta || ''));
  }, [flights]);

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-900 text-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-2xl flex justify-between items-center">
        <div>
          <h3 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter">Flight Control</h3>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Operation Dates: {startDate || "Not Set"} — {endDate || "Not Set"}</p>
        </div>
        <button onClick={() => { if(confirm('Are you sure you want to clear all flights?')) flights.forEach(f => onDelete(f.id)) }} className="px-6 py-3 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] italic flex items-center gap-2">
          <Eraser size={14} /> Wipe List
        </button>
      </div>

      {flights.length > 0 && flightsInRange.length === 0 && (
        <div className="p-6 bg-amber-50 border border-amber-100 rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
            <CalendarX size={24} />
          </div>
          <div>
            <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-1">Window Empty</h4>
            <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
              No flights found for the selected Target Window. Adjust your dates in Overview or update flight assignments below.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-sm border border-slate-100">
        <form onSubmit={handleAddNew} className="grid grid-cols-1 md:grid-cols-5 gap-4 lg:gap-6">
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Operation Date</label>
            <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black" value={newFlight.date} onChange={e => setNewFlight({ ...newFlight, date: e.target.value })} required />
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Flight #</label>
            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black uppercase" placeholder="SM 123" value={newFlight.flightNumber} onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} required />
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">STA / STD</label>
            <div className="flex gap-2">
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center" placeholder="STA" value={newFlight.sta} onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} />
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center" placeholder="STD" value={newFlight.std} onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Sector</label>
            <div className="flex gap-2">
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center uppercase" placeholder="FRM" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center uppercase" placeholder="TO" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-slate-950 text-white font-black py-3.5 rounded-xl uppercase shadow-lg hover:bg-slate-800 italic text-[10px]">Add Service</button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {sortedFlights.map(flight => {
          const isOutOfRange = flight.date < (startDate || '') || flight.date > (endDate || '');
          return (
            <div key={flight.id} className={`bg-white p-6 rounded-[2rem] shadow-sm border relative transition-all group flex flex-col h-full ${
              isOutOfRange 
                ? 'border-amber-400 border-dashed bg-amber-50/10' 
                : 'border-slate-100 hover:shadow-xl'
            }`}>
              {isOutOfRange && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full border border-amber-200 shadow-sm animate-pulse">
                  <CalendarX size={12} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Window Mismatch</span>
                </div>
              )}
              
              <div className="mb-4">
                <span className={`text-[9px] font-black uppercase tracking-widest block ${isOutOfRange ? 'text-amber-500' : 'text-slate-300'}`}>{getDayDateLabel(flight.date)}</span>
                <span className={`text-[10px] font-black uppercase italic ${isOutOfRange ? 'text-amber-600' : 'text-indigo-500'}`}>{flight.date}</span>
              </div>
              <div className="mb-4">
                <h4 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">{flight.flightNumber}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{flight.from} → {flight.to}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">STA</span>
                  <span className="text-sm font-black italic">{flight.sta || '--:--'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">STD</span>
                  <span className="text-sm font-black italic">{flight.std || '--:--'}</span>
                </div>
              </div>
              <div className="mt-auto flex justify-between pt-4 border-t border-slate-50">
                <button onClick={() => { if(confirm('Delete this flight?')) onDelete(flight.id) }} className="text-slate-300 hover:text-rose-600 text-[8px] font-black uppercase">Remove</button>
                <button onClick={() => startInlineEdit(flight)} className="text-slate-950 font-black uppercase text-[8px] hover:underline">Edit Entry</button>
              </div>
            </div>
          );
        })}
      </div>

      {inlineEditingId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 border border-slate-100">
             <h4 className="text-xl font-black uppercase italic mb-6">Edit Flight Details</h4>
             <form onSubmit={handleInlineSave} className="space-y-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Date</label>
                  <input type="date" className="w-full p-3 bg-slate-50 border rounded-xl font-black" value={inlineFormData.date} onChange={e => setInlineFormData({...inlineFormData, date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Flight Number</label>
                  <input type="text" className="w-full p-3 bg-slate-50 border rounded-xl font-black uppercase" value={inlineFormData.flightNumber} onChange={e => setInlineFormData({...inlineFormData, flightNumber: e.target.value.toUpperCase()})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">STA</label>
                    <input type="text" maxLength={5} className="w-full p-3 bg-slate-50 border rounded-xl font-black text-center" placeholder="HH:mm" value={inlineFormData.sta} onChange={e => setInlineFormData({...inlineFormData, sta: formatTimeInput(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">STD</label>
                    <input type="text" maxLength={5} className="w-full p-3 bg-slate-50 border rounded-xl font-black text-center" placeholder="HH:mm" value={inlineFormData.std} onChange={e => setInlineFormData({...inlineFormData, std: formatTimeInput(e.target.value)})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">From</label>
                    <input type="text" maxLength={4} className="w-full p-3 bg-slate-50 border rounded-xl font-black text-center uppercase" value={inlineFormData.from} onChange={e => setInlineFormData({...inlineFormData, from: e.target.value.toUpperCase()})} />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">To</label>
                    <input type="text" maxLength={4} className="w-full p-3 bg-slate-50 border rounded-xl font-black text-center uppercase" value={inlineFormData.to} onChange={e => setInlineFormData({...inlineFormData, to: e.target.value.toUpperCase()})} />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                   <button type="button" onClick={() => setInlineEditingId(null)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                   <button type="submit" className="flex-[2] py-3 bg-slate-950 text-white rounded-xl text-[10px] font-black uppercase shadow-xl">Apply Changes</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
