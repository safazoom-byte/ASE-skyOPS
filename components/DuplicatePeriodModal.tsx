import React, { useState } from "react";
import { Copy, X, Calendar } from "lucide-react";
import { Flight } from "../types";

interface Props {
  flights: Flight[];
  onClose: () => void;
  onDuplicate: (newFlights: Flight[]) => void;
}

export const DuplicatePeriodModal: React.FC<Props> = ({
  flights,
  onClose,
  onDuplicate,
}) => {
  const [sourceStart, setSourceStart] = useState("");
  const [sourceEnd, setSourceEnd] = useState("");
  const [targetStart, setTargetStart] = useState("");

  const handleDuplicate = () => {
    if (!sourceStart || !sourceEnd || !targetStart) return;

    const start = new Date(sourceStart);
    const end = new Date(sourceEnd);
    const target = new Date(targetStart);

    // Get time difference in milliseconds between target and source start dates
    const diffTime = target.getTime() - start.getTime();

    // Filter flights in the source period
    const flightsToDuplicate = flights.filter((f) => {
      if (!f.date) return false;
      const fDate = new Date(f.date);
      return fDate >= start && fDate <= end;
    });

    if (flightsToDuplicate.length === 0) {
      alert("No flights found in the selected source period.");
      return;
    }

    // Create new flights
    const newFlights = flightsToDuplicate.map((f) => {
      const fDate = new Date(f.date);
      const newDate = new Date(fDate.getTime() + diffTime);
      return {
        ...f,
        id: Math.random().toString(36).substr(2, 9),
        date: newDate.toISOString().split("T")[0],
      };
    });

    onDuplicate(newFlights);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Copy size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black italic tracking-tight text-slate-900 uppercase">
                Duplicate Period
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Copy flights to a new date
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Calendar size={14} /> Source Period
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={sourceStart}
                  onChange={(e) => setSourceStart(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={sourceEnd}
                  onChange={(e) => setSourceEnd(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Calendar size={14} /> Target Period
            </h3>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">
                New Start Date
              </label>
              <input
                type="date"
                value={targetStart}
                onChange={(e) => setTargetStart(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!sourceStart || !sourceEnd || !targetStart}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <Copy size={16} /> Duplicate
          </button>
        </div>
      </div>
    </div>
  );
};
