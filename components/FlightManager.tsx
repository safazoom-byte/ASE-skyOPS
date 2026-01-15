
import React, { useState, useMemo } from 'react';
import { Flight } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { Settings, Trash2, Eraser, AlertCircle, Info, Save, X } from 'lucide-react';

interface Props {
  flights: Flight[];
  startDate: string;
  endDate: string;
  onAdd: (f: Flight) => void;
  onUpdate: (f: Flight) => void;
  onDelete: (id: string) => void;
}

export const FlightManager: React.FC<Props> = ({ flights, startDate, endDate, onAdd, onUpdate, onDelete }) => {
  const [newFlight, setNewFlight] = useState<Partial<Flight>>({
    flightNumber: '', from: '', to: '', sta: '', std: '', day: 0, type: 'Turnaround'
  });

  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineFormData, setInlineFormData] = useState<Partial<Flight>>({});

  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean, flight: Flight | null, isAll: boolean }>({
    show: false,
    flight: null,
    isAll: false
  });

  const numDays = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 14); 
  }, [startDate, endDate]);

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

  // Fixed TypeScript error: explicitly cast 'type' to the union of allowed values to avoid string incompatibility
  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const type: 'Arrival' | 'Departure' | 'Turnaround' = newFlight.sta && !newFlight.std ? 'Arrival' : (!newFlight.sta && newFlight.std ? 'Departure' : 'Turnaround');
    const flightData: Flight = {
      ...newFlight as Flight,
      type,
      flightNumber: newFlight.flightNumber!.toUpperCase(),
      from: newFlight.from!.toUpperCase(),
      to: newFlight.to!.toUpperCase(),
      id: Math.random().toString(36).substr(2, 9),
    };
    onAdd(flightData);
    setNewFlight({ flightNumber: '', from: '', to: '', sta: '', std: '', day: 0, type: 'Turnaround' });
  };

  const startInlineEdit = (flight: Flight) => {
    setInlineEditingId(flight.id);
    setInlineFormData({ ...flight });
  };

  // Fixed TypeScript error: explicitly cast 'type' to the union of allowed values to avoid string incompatibility
  const handleInlineSave = (e: React.FormEvent) => {
    e.preventDefault();
    const type: 'Arrival' | 'Departure' | 'Turnaround' = inlineFormData.sta && !inlineFormData.std ? 'Arrival' : (!inlineFormData.sta && inlineFormData.std ? 'Departure' : 'Turnaround');
    onUpdate({ ...inlineFormData as Flight, type });
    setInlineEditingId(null);
  };

  const triggerClearAll = () => setDeleteConfirm({ show: true, flight: null, isAll: true });

  const executeDelete = () => {
    if (deleteConfirm.isAll) {
      flights.forEach(f => onDelete(f.id));
    } else if (deleteConfirm.flight) {
      onDelete(deleteConfirm.flight.id);
    }
    setDeleteConfirm({ show: false, flight: null, isAll: false });
  };

  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => a.day - b.day || (a.sta || '').localeCompare(b.sta || ''));
  }, [flights]);

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] lg:rounded-[3.5rem] shadow-2xl max-w-lg w-full p-8 lg:p-14 border border-slate-100">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <Trash2 size={32} />
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-xl lg:text-3xl font-black italic uppercase text-slate-950 tracking-tighter">
                {deleteConfirm.isAll ? 'Wipe Operational State?' : 'Confirm Removal'}
              </h3>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">
                {deleteConfirm.isAll ? 'CRITICAL: Permanently erase EVERY flight record.' : 'Are you certain you want to remove this flight?'}
              </p>
            </div>
            <div className="flex gap-4 mt-10">
              <button onClick={() => setDeleteConfirm({ show: false, flight: null, isAll: false })} className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-xl font-black uppercase text-xs">Abort</button>
              <button onClick={executeDelete} className="flex-[2] py-4 bg-rose-600 text-white rounded-xl font-black uppercase shadow-xl hover:bg-rose-500 italic text-xs">CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter">Flight Control</h3>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Operational range: {startDate} — {endDate}</p>
          </div>
          <button onClick={triggerClearAll} className="px-6 py-3 bg-rose-600/10 text-rose-500 rounded-2xl border border-rose-500/20 hover:bg-rose-600 hover:text-white transition-all text-[9px] font-black uppercase">
            <Eraser size={16} className="mr-2" /> Flush All
          </button>
        </div>
      </div>

      <div className="bg-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-sm border border-slate-100">
        <form onSubmit={handleAddNew} className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6">
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Flight #</label>
            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black uppercase" placeholder="SM 123" value={newFlight.flightNumber} onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} required />
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Sector (FRM / TO)</label>
            <div className="flex gap-2">
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center uppercase" placeholder="HBE" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center uppercase" placeholder="JED" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">STA / STD</label>
            <div className="flex gap-2">
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center" placeholder="STA" value={newFlight.sta} onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} />
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-center" placeholder="STD" value={newFlight.std} onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-slate-950 text-white font-black py-3.5 rounded-xl uppercase shadow-lg hover:bg-slate-800 italic text-[10px]">Add Flight</button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {sortedFlights.map(flight => {
          const isOutOfRange = flight.day < 0 || flight.day >= numDays;
          return (
            <div key={flight.id} className={`bg-white p-6 rounded-[2rem] shadow-sm border ${isOutOfRange ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100'} hover:shadow-xl transition-all group flex flex-col h-full`}>
              <div className="mb-4">
                <span className={`text-[9px] font-black uppercase tracking-widest block ${isOutOfRange ? 'text-amber-400' : 'text-slate-300'}`}>{getFullDayName(flight.day)}</span>
                <span className="text-[10px] font-black uppercase italic text-indigo-500">{getDayDate(flight.day)}</span>
              </div>
              <div className="mb-4">
                <h4 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">{flight.flightNumber}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{flight.from} → {flight.to}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">Arrival</span>
                  <span className="text-sm font-black italic">{flight.sta || '--:--'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">Departure</span>
                  <span className="text-sm font-black italic">{flight.std || '--:--'}</span>
                </div>
              </div>
              <div className="mt-auto flex justify-between pt-4 border-t border-slate-50">
                <button onClick={() => onDelete(flight.id)} className="text-slate-300 hover:text-rose-600 text-[8px] font-black uppercase">Remove</button>
                <button onClick={() => startInlineEdit(flight)} className="px-4 py-2 bg-slate-950 text-white rounded-xl text-[8px] font-black uppercase shadow-md">Edit</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
