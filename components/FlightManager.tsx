
import React, { useState, useMemo } from 'react';
import { Flight } from '../types';
import { DAYS_OF_WEEK } from '../constants';

interface Props {
  flights: Flight[];
  startDate: string;
  onAdd: (f: Flight) => void;
  onUpdate: (f: Flight) => void;
  onDelete: (id: string) => void;
}

export const FlightManager: React.FC<Props> = ({ flights, startDate, onAdd, onUpdate, onDelete }) => {
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [newFlight, setNewFlight] = useState<Partial<Flight>>({
    flightNumber: '', from: '', to: '', sta: '', std: '', day: 0, type: 'Turnaround'
  });

  const getDayDate = (dayIndex: number) => {
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getFullDayName = (dayIndex: number) => {
    const start = new Date(startDate);
    const result = new Date(start);
    result.setDate(start.getDate() + dayIndex);
    return result.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const formatTimeInput = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length <= 2) return cleaned;
    return cleaned.slice(0, 2) + ':' + cleaned.slice(2, 4);
  };

  const validateTime = (time: string | undefined) => {
    if (!time) return true;
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateTime(newFlight.sta) || !validateTime(newFlight.std)) {
      alert("Please ensure all times are in HH:mm format (e.g., 08:30 or 21:00).");
      return;
    }

    const flightData = {
      ...newFlight as Flight,
      flightNumber: newFlight.flightNumber!.toUpperCase(),
      from: newFlight.from!.toUpperCase(),
      to: newFlight.to!.toUpperCase(),
      id: editingFlightId || Math.random().toString(36).substr(2, 9),
    };

    if (editingFlightId) onUpdate(flightData); else onAdd(flightData);
    resetForm();
  };

  const resetForm = () => {
    setNewFlight({ flightNumber: '', from: '', to: '', sta: '', std: '', day: 0, type: 'Turnaround' });
    setEditingFlightId(null);
  };

  const handleDelete = (flight: Flight) => {
    if (window.confirm(`Are you sure you want to delete flight ${flight.flightNumber}? This cannot be undone.`)) {
      onDelete(flight.id);
      if (editingFlightId === flight.id) resetForm();
    }
  };

  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => a.day - b.day || (a.sta || '').localeCompare(b.sta || ''));
  }, [flights]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="relative z-10">
          <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Flight Operations Control</h3>
          <p className="text-slate-400 text-sm max-w-md font-medium">Manage the station's flight schedule and ground handling operations.</p>
        </div>
      </div>

      <div className={`bg-white p-10 rounded-[3rem] shadow-sm border-2 transition-all duration-500 ${editingFlightId ? 'border-indigo-500 ring-8 ring-indigo-50 shadow-2xl' : 'border-slate-100'}`}>
        <div className="flex justify-between items-center mb-8">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">
            {editingFlightId ? 'Modify Flight Sequence' : 'Register New Flight Service'}
          </h4>
          {editingFlightId && (
            <button onClick={resetForm} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-4 py-2 bg-slate-50 rounded-xl">Discard Edit</button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Flight Number</label>
              <input 
                type="text" 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-black uppercase text-xl placeholder:text-slate-300" 
                placeholder="SM 492" 
                value={newFlight.flightNumber} 
                onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} 
                required 
              />
            </div>
            <div className="lg:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Sectors (From / To)</label>
              <div className="flex gap-3">
                <input type="text" maxLength={4} className="w-1/2 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black uppercase text-center text-xl placeholder:text-slate-300" placeholder="JED" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
                <input type="text" maxLength={4} className="w-1/2 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black uppercase text-center text-xl placeholder:text-slate-300" placeholder="CAI" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
              </div>
            </div>
            <div className="lg:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Operational Times (STA / STD)</label>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  maxLength={5}
                  className="w-1/2 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-center text-xl placeholder:text-slate-300" 
                  placeholder="00:00" 
                  value={newFlight.sta} 
                  onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} 
                />
                <input 
                  type="text" 
                  maxLength={5}
                  className="w-1/2 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-center text-xl placeholder:text-slate-300" 
                  placeholder="00:00" 
                  value={newFlight.std} 
                  onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} 
                />
              </div>
            </div>
            <div className="lg:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Date</label>
              <select 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-lg cursor-pointer appearance-none" 
                value={newFlight.day} 
                onChange={e => setNewFlight({ ...newFlight, day: parseInt(e.target.value) })}
              >
                {[...Array(14)].map((_, i) => (
                  <option key={i} value={i}>{getDayDate(i)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Service Type</label>
            <div className="flex gap-3 max-w-2xl">
              {['Arrival', 'Departure', 'Turnaround'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewFlight({ ...newFlight, type: type as any })}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${newFlight.type === type ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white border-slate-100 text-slate-400'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="w-full bg-slate-900 text-white font-black py-6 rounded-[2rem] uppercase shadow-2xl hover:bg-slate-800 transition-all active:scale-95 italic tracking-[0.2em] text-xs">
            {editingFlightId ? 'COMMIT CHANGES TO SCHEDULE' : 'INTEGRATE FLIGHT INTO STATION'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {sortedFlights.map(flight => (
          <div key={flight.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 hover:shadow-2xl hover:border-indigo-200 transition-all group relative overflow-hidden">
            <div className={`absolute top-0 right-0 px-6 py-2 rounded-bl-[1.5rem] text-[9px] font-black uppercase tracking-widest ${
              flight.type === 'Arrival' ? 'bg-emerald-100 text-emerald-600' :
              flight.type === 'Departure' ? 'bg-amber-100 text-amber-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              {flight.type}
            </div>

            <div className="flex flex-col h-full">
              <div className="mb-6">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-1">{getFullDayName(flight.day)}</span>
                <span className="text-xs font-black text-indigo-500 uppercase italic">{getDayDate(flight.day)}</span>
              </div>

              <div className="mb-6">
                <h4 className="text-3xl font-black italic tracking-tighter text-slate-900 group-hover:text-indigo-600 transition-colors uppercase">{flight.flightNumber}</h4>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">{flight.from} <span className="text-slate-200 mx-2">→</span> {flight.to}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">STA</span>
                  <span className="text-lg font-black text-slate-900 font-mono italic">{flight.sta || '--:--'}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">STD</span>
                  <span className="text-lg font-black text-slate-900 font-mono italic">{flight.std || '--:--'}</span>
                </div>
              </div>

              <div className="mt-auto flex justify-end items-center pt-4 border-t border-slate-50">
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setNewFlight({ ...flight }); setEditingFlightId(flight.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                    className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button 
                    onClick={() => handleDelete(flight)} 
                    className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
