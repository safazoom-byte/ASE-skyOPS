
import React, { useState, useMemo } from 'react';
import { Flight } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { Settings, X, Save, Trash2, ArrowLeft, AlertCircle, AlertTriangle, Eraser, Info } from 'lucide-react';

interface Props {
  flights: Flight[];
  startDate: string;
  endDate: string;
  onAdd: (f: Flight) => void;
  onUpdate: (f: Flight) => void;
  onDelete: (id: string) => void;
}

export const FlightManager: React.FC<Props> = ({ flights, startDate, endDate, onAdd, onUpdate, onDelete }) => {
  // Main form state for NEW flights
  const [newFlight, setNewFlight] = useState<Partial<Flight>>({
    flightNumber: '', from: '', to: '', sta: '', std: '', day: 0, type: 'Turnaround'
  });

  // State for inline editing in boxes
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineFormData, setInlineFormData] = useState<Partial<Flight>>({});

  // Custom Modal States
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

  const timeToMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

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
    if (!time || time === '') return true;
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  };

  const checkConflicts = (flight: Partial<Flight>, existingFlights: Flight[], excludeId?: string) => {
    const dayFlights = existingFlights.filter(f => f.day === flight.day && f.id !== excludeId);
    
    // 1. Same Flight Number Check
    const duplicate = dayFlights.find(f => f.flightNumber.toUpperCase() === flight.flightNumber?.toUpperCase());
    if (duplicate) return `Conflict: Flight ${flight.flightNumber} is already scheduled for this day.`;

    // 2. Overlap Check
    if (flight.sta || flight.std) {
      const fSta = flight.sta ? timeToMins(flight.sta) : null;
      const fStd = flight.std ? timeToMins(flight.std) : null;

      const conflict = dayFlights.find(f => {
        const eSta = f.sta ? timeToMins(f.sta) : null;
        const eStd = f.std ? timeToMins(f.std) : null;

        // Exact match on STA or STD
        if (fSta !== null && fSta === eSta) return true;
        if (fStd !== null && fStd === eStd) return true;

        // Turnaround Range Overlap
        if (fSta !== null && fStd !== null && eSta !== null && eStd !== null) {
          // Range overlap if: max(starts) < min(ends)
          return Math.max(fSta, eSta) < Math.min(fStd, eStd);
        }
        return false;
      });

      if (conflict) return `Operational Alert: Potential time overlap with flight ${conflict.flightNumber} on this day.`;
    }
    
    return null;
  };

  const getInferredType = (sta?: string, std?: string): 'Arrival' | 'Departure' | 'Turnaround' => {
    if (sta && !std) return 'Arrival';
    if (!sta && std) return 'Departure';
    return 'Turnaround';
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateTime(newFlight.sta) || !validateTime(newFlight.std)) {
      alert("Please ensure all times are in HH:mm format.");
      return;
    }

    const conflictMsg = checkConflicts(newFlight, flights);
    if (conflictMsg) {
      alert(conflictMsg);
      return;
    }

    const type = getInferredType(newFlight.sta, newFlight.std);
    const flightData = {
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

  const cancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineFormData({});
  };

  const handleInlineSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateTime(inlineFormData.sta) || !validateTime(inlineFormData.std)) {
      alert("Invalid time format.");
      return;
    }

    const conflictMsg = checkConflicts(inlineFormData, flights, inlineEditingId || undefined);
    if (conflictMsg) {
      alert(conflictMsg);
      return;
    }

    const type = getInferredType(inlineFormData.sta, inlineFormData.std);
    const updated = {
      ...inlineFormData as Flight,
      type,
      flightNumber: inlineFormData.flightNumber!.toUpperCase(),
      from: inlineFormData.from!.toUpperCase(),
      to: inlineFormData.to!.toUpperCase(),
    };

    onUpdate(updated);
    cancelInlineEdit();
  };

  const triggerDelete = (flight: Flight) => {
    setDeleteConfirm({ show: true, flight, isAll: false });
  };

  const triggerClearAll = () => {
    setDeleteConfirm({ show: true, flight: null, isAll: true });
  };

  const executeDelete = () => {
    if (deleteConfirm.isAll) {
      flights.forEach(f => onDelete(f.id));
    } else if (deleteConfirm.flight) {
      onDelete(deleteConfirm.flight.id);
      if (inlineEditingId === deleteConfirm.flight.id) cancelInlineEdit();
    }
    setDeleteConfirm({ show: false, flight: null, isAll: false });
  };

  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => a.day - b.day || (a.sta || '').localeCompare(b.sta || ''));
  }, [flights]);

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] lg:rounded-[3.5rem] shadow-2xl max-w-lg w-full p-8 lg:p-14 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-rose-50 text-rose-600 rounded-[1.5rem] lg:rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Trash2 size={32} />
            </div>
            
            <div className="text-center space-y-4">
              <h3 className="text-xl lg:text-3xl font-black italic uppercase text-slate-950 tracking-tighter leading-none">
                {deleteConfirm.isAll ? 'Wipe Operational State?' : 'Confirm Removal'}
              </h3>
              <p className="text-slate-500 text-[10px] lg:text-sm font-medium uppercase tracking-widest leading-relaxed">
                {deleteConfirm.isAll 
                  ? 'CRITICAL: This action will permanently erase EVERY flight record currently in the system.' 
                  : `Are you certain you want to remove Flight ${deleteConfirm.flight?.flightNumber}? This will automatically clear all associated staff assignments.`}
              </p>
            </div>

            <div className="flex gap-4 mt-10 lg:mt-12">
              <button 
                onClick={() => setDeleteConfirm({ show: false, flight: null, isAll: false })}
                className="flex-1 py-4 lg:py-5 bg-slate-100 text-slate-400 rounded-xl lg:rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all text-[9px] lg:text-xs"
              >
                Abort
              </button>
              <button 
                onClick={executeDelete}
                className="flex-[2] py-4 lg:py-5 bg-rose-600 text-white rounded-xl lg:rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-rose-200 hover:bg-rose-500 transition-all active:scale-95 italic text-[9px] lg:text-xs"
              >
                {deleteConfirm.isAll ? 'FLUSH ALL RECORDS' : 'CONFIRM REMOVAL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header section */}
      <div className="bg-slate-900 text-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[80px] pointer-events-none"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h3 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter mb-2">Flight Control</h3>
            <p className="text-slate-400 text-xs lg:text-sm max-w-md font-medium uppercase tracking-widest">Global Station Schedule & Dynamic Classification.</p>
          </div>
          <div className="hidden lg:flex items-center gap-4">
            <button 
              onClick={triggerClearAll}
              disabled={flights.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-rose-600/10 text-rose-500 rounded-2xl border border-rose-500/20 hover:bg-rose-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-20"
            >
              <Eraser size={16} /> Flush All Records
            </button>
            <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/10 text-center">
              <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest">Total Ops</span>
              <span className="text-xl font-black italic">{flights.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* New Flight Entry */}
      <div className="bg-white p-6 lg:p-10 rounded-[2rem] lg:rounded-[3rem] shadow-sm border border-slate-100">
        <h4 className="text-[10px] lg:text-sm font-black text-slate-800 uppercase tracking-widest italic mb-6">Register New Flight</h4>
        <form onSubmit={handleAddNew} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Flight #</label>
            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 font-black uppercase" placeholder="SM 123" value={newFlight.flightNumber} onChange={e => setNewFlight({ ...newFlight, flightNumber: e.target.value })} required />
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Sector (FRM / TO)</label>
            <div className="flex gap-2">
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-center uppercase" placeholder="HBE" value={newFlight.from} onChange={e => setNewFlight({ ...newFlight, from: e.target.value })} required />
              <input type="text" maxLength={4} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-center uppercase" placeholder="JED" value={newFlight.to} onChange={e => setNewFlight({ ...newFlight, to: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">STA / STD</label>
            <div className="flex gap-2">
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-center" placeholder="STA" value={newFlight.sta} onChange={e => setNewFlight({ ...newFlight, sta: formatTimeInput(e.target.value) })} />
              <input type="text" maxLength={5} className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-center" placeholder="STD" value={newFlight.std} onChange={e => setNewFlight({ ...newFlight, std: formatTimeInput(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-slate-950 text-white font-black py-3.5 rounded-xl uppercase shadow-lg hover:bg-slate-800 transition-all active:scale-95 italic text-[10px] tracking-widest">
              Add Flight
            </button>
          </div>
        </form>
      </div>

      {/* Flight List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {sortedFlights.map(flight => {
          const isEditing = inlineEditingId === flight.id;
          const isOutOfRange = flight.day < 0 || flight.day >= numDays;

          if (isEditing) {
            return (
              <div key={flight.id} className="bg-white p-6 rounded-[2rem] shadow-2xl border-2 border-blue-500 animate-in zoom-in-95 duration-200 flex flex-col h-full">
                <form onSubmit={handleInlineSave} className="space-y-4 flex-1">
                  <div>
                    <label className="block text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Flight Number</label>
                    <input autoFocus type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-black uppercase text-sm" value={inlineFormData.flightNumber} onChange={e => setInlineFormData({ ...inlineFormData, flightNumber: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">From</label>
                      <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-black text-center text-xs" value={inlineFormData.from} onChange={e => setInlineFormData({ ...inlineFormData, from: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">To</label>
                      <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-black text-center text-xs" value={inlineFormData.to} onChange={e => setInlineFormData({ ...inlineFormData, to: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">STA</label>
                      <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-black text-center text-xs" value={inlineFormData.sta} onChange={e => setInlineFormData({ ...inlineFormData, sta: formatTimeInput(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">STD</label>
                      <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-black text-center text-xs" value={inlineFormData.std} onChange={e => setInlineFormData({ ...inlineFormData, std: formatTimeInput(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">Day</label>
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-black text-[10px] uppercase appearance-none" value={inlineFormData.day} onChange={e => setInlineFormData({ ...inlineFormData, day: parseInt(e.target.value) })}>
                      {[...Array(14)].map((_, i) => <option key={i} value={i}>{getDayDate(i)}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={cancelInlineEdit} className="flex-1 px-3 py-2 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase hover:text-slate-600 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1">
                      <Save size={12} /> Save
                    </button>
                  </div>
                </form>
              </div>
            );
          }

          return (
            <div key={flight.id} className={`bg-white p-6 rounded-[2rem] shadow-sm border ${isOutOfRange ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100'} hover:shadow-xl transition-all group relative overflow-hidden flex flex-col h-full`}>
              {isOutOfRange && (
                <div className="absolute top-4 right-4 text-amber-500" title="Out of range flight">
                  <AlertCircle size={16} />
                </div>
              )}
              <div className="mb-4">
                <span className={`text-[9px] font-black uppercase tracking-widest block ${isOutOfRange ? 'text-amber-400' : 'text-slate-300'}`}>
                  {getFullDayName(flight.day)} {isOutOfRange && '(OUT OF RANGE)'}
                </span>
                <span className={`text-[10px] font-black uppercase italic ${isOutOfRange ? 'text-amber-600' : 'text-indigo-500'}`}>
                  {getDayDate(flight.day)}
                </span>
              </div>
              <div className="mb-4">
                <h4 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">
                  {flight.flightNumber}
                </h4>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{flight.from} <span className="text-slate-200 mx-1">→</span> {flight.to}</p>
                   <span className={`px-2 py-0.5 border text-[7px] font-black uppercase rounded-lg ${flight.type === 'Turnaround' ? 'bg-blue-50 border-blue-100 text-blue-500' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                     {flight.type}
                   </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">Arrival</span>
                  <span className={`text-sm font-black font-mono italic ${!flight.sta ? 'text-slate-200' : 'text-slate-900'}`}>{flight.sta || '--:--'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">Departure</span>
                  <span className={`text-sm font-black font-mono italic ${!flight.std ? 'text-slate-200' : 'text-slate-900'}`}>{flight.std || '--:--'}</span>
                </div>
              </div>
              
              {/* Action area always at bottom */}
              <div className="mt-auto flex justify-between items-center pt-4 border-t border-slate-50">
                <button 
                  onClick={() => triggerDelete(flight)} 
                  className="flex items-center gap-1.5 px-3 py-2 text-slate-300 hover:text-rose-600 transition-all text-[8px] font-black uppercase tracking-widest"
                >
                  <Trash2 size={12} /> Remove
                </button>
                <button 
                  onClick={() => startInlineEdit(flight)} 
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-950 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-md active:scale-95"
                >
                  <Settings size={12} /> Edit Service
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {flights.length === 0 && (
        <div className="py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
           <p className="text-[10px] font-black text-slate-300 uppercase italic tracking-widest">No flights active in current schedule</p>
        </div>
      )}
    </div>
  );
};
