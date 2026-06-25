import React, { useState, useEffect } from "react";
import { Plane, X } from "lucide-react";
import { Flight, ShiftConfig } from "../types";

interface Props {
  flightModal: { shiftId: string; flightId?: string; isNew?: boolean };
  setFlightModal: (val: any) => void;
  shifts: ShiftConfig[];
  flights: Flight[];
  onAddFlight?: (f: Flight) => void;
  onUpdateFlight?: (f: Flight) => void;
  onDeleteFlight?: (id: string) => void;
  onUpdate: (s: ShiftConfig) => void;
}

export function FlightModalDialog({
  flightModal,
  setFlightModal,
  shifts,
  flights,
  onAddFlight,
  onUpdateFlight,
  onDeleteFlight,
  onUpdate
}: Props) {
  const shift = shifts.find((s) => s.id === flightModal.shiftId);
  const safeFlights = flights || [];
  const exFlight = flightModal.flightId ? safeFlights.find((f) => f.id === flightModal.flightId) : null;
  const [fData, setFData] = useState<Partial<Flight>>(exFlight || {
    flightNumber: "",
    from: "",
    to: "",
    sta: "",
    std: "",
    type: "Arrival",
    date: shift?.pickupDate || new Date().toISOString().split("T")[0],
    day: shift?.day || 0,
    priority: "Standard"
  });

  useEffect(() => {
    setFData(exFlight || {
      flightNumber: "", from: "", to: "", sta: "", std: "", type: "Arrival",
      date: shift?.pickupDate || new Date().toISOString().split("T")[0],
      day: shift?.day || 0, priority: "Standard"
    });
  }, [flightModal.flightId, exFlight, shift]);

  const handleSave = () => {
    if (!fData.flightNumber || !fData.from || !fData.to) return alert("Fill required fields");
    
    if (flightModal.isNew && onAddFlight) {
      const newId = Math.random().toString(36).substr(2, 9);
      const newFlight = { ...fData, id: newId } as Flight;
      onAddFlight(newFlight);
      if (shift) {
        onUpdate({ ...shift, flightIds: [...(shift.flightIds || []), newId] });
      }
    } else if (onUpdateFlight && exFlight) {
      onUpdateFlight({ ...exFlight, ...fData } as Flight);
    }
    setFlightModal(null);
  };

  const handleDelete = () => {
    if (!confirm("Remove flight from system entirely?")) return;
    if (shift && exFlight) {
      onUpdate({ ...shift, flightIds: (shift.flightIds || []).filter((id) => id !== exFlight.id) });
      if (onDeleteFlight) onDeleteFlight(exFlight.id);
    }
    setFlightModal(null);
  };

  const handleRemoveFromShift = () => {
    if (shift && exFlight) {
      onUpdate({ ...shift, flightIds: (shift.flightIds || []).filter((id) => id !== exFlight.id) });
    }
    setFlightModal(null);
  };

  const handleSplit = () => {
    if (!exFlight || !shift || exFlight.type !== "Turnaround") return;
    const fArr: Flight = { ...exFlight, id: Math.random().toString(36).substr(2,9), type: "Arrival", std: "" };
    const fDep: Flight = { ...exFlight, id: Math.random().toString(36).substr(2,9), type: "Departure", sta: "" };
    if (onAddFlight) {
      onAddFlight(fArr);
      onAddFlight(fDep);
    }
    if (onDeleteFlight) onDeleteFlight(exFlight.id);
    const baseIds = (shift.flightIds || []).filter((id) => id !== exFlight.id);
    onUpdate({ ...shift, flightIds: [...baseIds, fArr.id, fDep.id] });
    setFlightModal(null);
  };
  
  const otherShiftFlights = (shift?.flightIds || [])
      .filter((id) => id !== flightModal.flightId)
      .map((id) => safeFlights.find((f) => f.id === id))
      .filter(Boolean) as Flight[];

  const handleMerge = (otherId: string) => {
    if (!exFlight || !shift) return;
    const other = safeFlights.find((f) => f.id === otherId);
    if (!other) return;
    
    const fTurn: Flight = {
      ...exFlight,
      flightNumber: `${exFlight.flightNumber}/${other.flightNumber}`,
      from: exFlight.type === "Arrival" ? exFlight.from : other.from,
      to: exFlight.type === "Departure" ? exFlight.to : other.to,
      sta: exFlight.type === "Arrival" ? exFlight.sta : other.sta,
      std: exFlight.type === "Departure" ? exFlight.std : other.std,
      type: "Turnaround"
    };
    if (onUpdateFlight) onUpdateFlight(fTurn);
    if (onDeleteFlight) onDeleteFlight(otherId);
    
    const newIds = (shift.flightIds || []).filter((id) => id !== otherId);
    onUpdate({ ...shift, flightIds: newIds });
    setFlightModal(null);
  };

  return (
    <div className="fixed inset-0 z-[1700] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[380px] flex flex-col overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <h3 className="text-[17px] font-black text-slate-900 flex items-center gap-2">
            <Plane size={18} className="text-blue-500 transform -rotate-45" />
            {flightModal.isNew ? "Add Flight" : "Manage Flight"}
          </h3>
          <button
            onClick={() => setFlightModal(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-5 pb-5 overflow-y-auto max-h-[80vh]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">Flight Num</label>
                <input className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.flightNumber} onChange={e => setFData({...fData, flightNumber: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">Type</label>
                <select className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors appearance-none" style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.8rem top 50%", backgroundSize: "0.65rem auto" }} value={fData.type} onChange={e => setFData({...fData, type: e.target.value as any})}>
                  <option value="Arrival">Arrival</option>
                  <option value="Departure">Departure</option>
                  <option value="Turnaround">Turnaround</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">From</label>
                <input className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.from} onChange={e => setFData({...fData, from: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">To</label>
                <input className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.to} onChange={e => setFData({...fData, to: e.target.value.toUpperCase()})} />
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">STA</label>
                <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.sta || ""} onChange={e => setFData({...fData, sta: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">STD</label>
                <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.std || ""} onChange={e => setFData({...fData, std: e.target.value})} />
              </div>

              {/* Only show ETA/ETD if they have values or user types in them, to keep UI clean, but let's include them as requested just below */}
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">ETA</label>
                <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.eta || ""} onChange={e => setFData({...fData, eta: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">ETD</label>
                <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors" value={fData.etd || ""} onChange={e => setFData({...fData, etd: e.target.value})} />
              </div>

              <div className="col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1.5 block tracking-wider">Date</label>
                <input type="date" className="w-1/2 bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 transition-colors pr-2" value={fData.date} onChange={e => setFData({...fData, date: e.target.value})} />
              </div>
            </div>

            <div className="pt-2">
              <button onClick={handleSave} className="w-full py-3.5 bg-[#2563eb] text-white rounded-[10px] font-bold hover:bg-blue-700 transition-colors text-[15px]">
                {flightModal.isNew ? "Create Flight" : "Save Changes"}
              </button>
            </div>

            {!flightModal.isNew && exFlight && (
              <div className="flex flex-row gap-3 mt-1">
                <button onClick={handleRemoveFromShift} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-[10px] font-bold hover:bg-slate-200 text-[13px] transition-colors text-center border border-slate-100">
                  Unlink from Shift
                </button>
                <button onClick={handleDelete} className="flex-1 py-3 bg-red-50 text-red-600 rounded-[10px] font-bold hover:bg-red-100 text-[13px] transition-colors text-center border border-red-50">
                  Delete Flight
                </button>
              </div>
            )}
            
            {!flightModal.isNew && exFlight?.type === "Turnaround" && (
              <div className="pt-2 mt-2 border-t border-slate-100 shrink-0">
                  <button onClick={handleSplit} className="w-full py-2 border border-blue-200 text-blue-600 rounded-xl font-bold hover:bg-blue-50 text-[11px]">
                    Split to Arrival / Departure
                  </button>
              </div>
            )}

            {!flightModal.isNew && exFlight && otherShiftFlights.length > 0 && (
              <div className="pt-4 mt-4 border-t border-slate-100">
                  <p className="text-[10px] uppercase font-black text-slate-400 mb-2">Merge with...</p>
                  <div className="flex flex-col gap-1">
                    {otherShiftFlights.map((other: Flight) => (
                      <button key={other.id} onClick={() => handleMerge(other.id)} className="text-left px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">{other.flightNumber} ({other.type})</span>
                        <span className="text-[10px] text-slate-400">{other.sta || '-'}/{other.std || '-'}</span>
                      </button>
                    ))}
                  </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
