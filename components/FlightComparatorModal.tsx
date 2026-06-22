import React, { useState } from "react";
import { Flight } from "../types";
import { Search, Loader2, Sparkles, X, Check, FileUp, AlertTriangle } from "lucide-react";
import { ExtractionMedia, compareFlightsWithAI } from "../services/geminiService";

interface Props {
  currentFlights: Flight[];
  startDate?: string;
  endDate?: string;
  onClose: () => void;
  onApplyChanges: (
    added: Flight[],
    updated: Flight[],
    deletedIds: string[]
  ) => void;
}

export const FlightComparatorModal: React.FC<Props> = ({
  currentFlights,
  startDate,
  endDate,
  onClose,
  onApplyChanges,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    added: Flight[];
    updated: Flight[];
    deletedIds: string[];
  } | null>(null);
  
  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(new Set());
  const [selectedUpdated, setSelectedUpdated] = useState<Set<string>>(new Set());
  const [selectedDeleted, setSelectedDeleted] = useState<Set<string>>(new Set());

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Hard Security & Performance Check: Prevent excessively large files from crashing the browser or hitting API limits
    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Please upload a file smaller than 10MB.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const media = await fileToGenerativePart(file);
      const dateRangeStr = startDate && endDate ? `${startDate} to ${endDate}` : (startDate || 'Unknown period');
      const filteredCurrent = currentFlights.filter(f => {
        if (!f.date) return false;
        if (startDate && f.date < startDate) return false;
        if (endDate && f.date > endDate) return false;
        return true;
      });

      const res = await compareFlightsWithAI([media], filteredCurrent, dateRangeStr);
      setResult(res);
      setSelectedAdded(new Set(res.added.map(f => f.id)));
      setSelectedUpdated(new Set(res.updated.map(f => f.id)));
      setSelectedDeleted(new Set(res.deletedIds));
    } catch (err: any) {
      setError(err.message || "Failed to compare schedules.");
    } finally {
      setLoading(false);
    }
  };

  const applySelected = () => {
    if (!result) return;
    
    const addedToApply = result.added.filter(f => selectedAdded.has(f.id));
    const updatedToApply = result.updated.filter(f => selectedUpdated.has(f.id));
    const deletedToApply = result.deletedIds.filter(id => selectedDeleted.has(id));
    
    onApplyChanges(addedToApply, updatedToApply, deletedToApply);
    onClose();
  };

  const toggleSet = (set: Set<string>, val: string, updater: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    updater(next);
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-slate-950 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-black italic uppercase tracking-widest leading-none">Schedule Comparator</h3>
              <p className="text-[10px] text-indigo-200 mt-1 uppercase font-bold">Compare & Sync Flights</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                <FileUp size={40} />
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-2">Upload New Schedule</h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8 font-medium">
                Upload a PDF, Image, or Excel file containing the new flight schedule. The AI will compare it to your current flights and highlight the differences.
              </p>
              <label className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest italic cursor-pointer hover:bg-indigo-700 transition-colors shadow-lg hover:-translate-y-1">
                Select File to Compare
                <input
                  type="file"
                  accept="image/*,application/pdf,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              {error && (
                <div className="mt-6 text-rose-600 bg-rose-50 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full py-20 text-indigo-600 space-y-4 text-center">
              <Loader2 size={48} className="animate-spin" />
              <p className="font-black uppercase tracking-widest text-sm animate-pulse">Analyzing & Comparing Schedules...</p>
            </div>
          )}

          {result && (
            <div className="space-y-8">
              {/* ADDED */}
              <div>
                <h4 className="text-sm font-black uppercase text-emerald-600 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center">+</span>
                  New Flights ({result.added.length})
                </h4>
                {result.added.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium italic">No new flights detected.</p>
                ) : (
                  <div className="space-y-2">
                    {result.added.map(f => (
                      <div key={f.id} className="flex gap-4 items-center bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
                        <input 
                           type="checkbox" 
                           className="w-4 h-4 accent-emerald-600" 
                           checked={selectedAdded.has(f.id)} 
                           onChange={() => toggleSet(selectedAdded, f.id, setSelectedAdded)}
                        />
                        <div className="flex-1 text-sm font-bold text-slate-700">
                          {f.flightNumber} ({f.date})
                        </div>
                        <div className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {f.sta || '-'} / {f.std || '-'}
                        </div>
                        <div className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase">
                          {f.from} ➔ {f.to}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* UPDATED */}
              <div>
                <h4 className="text-sm font-black uppercase text-blue-600 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">~</span>
                  Updated Flights ({result.updated.length})
                </h4>
                {result.updated.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium italic">No modifications detected.</p>
                ) : (
                  <div className="space-y-2">
                    {result.updated.map(f => (
                      <div key={f.id} className="flex gap-4 items-center bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                        <input 
                           type="checkbox" 
                           className="w-4 h-4 accent-blue-600" 
                           checked={selectedUpdated.has(f.id)} 
                           onChange={() => toggleSet(selectedUpdated, f.id, setSelectedUpdated)}
                        />
                        <div className="flex-1 text-sm font-bold text-slate-700">
                          {f.flightNumber} ({f.date})
                        </div>
                        <div className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {f.sta || '-'} / {f.std || '-'}
                        </div>
                        <div className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase">
                          {f.from} ➔ {f.to}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MISSING/DELETED */}
              <div>
                <h4 className="text-sm font-black uppercase text-rose-600 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-rose-100 flex items-center justify-center">-</span>
                  Missing Flights ({result.deletedIds.length})
                </h4>
                {result.deletedIds.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium italic">All existing flights are present in the new schedule.</p>
                ) : (
                  <div className="space-y-2">
                    {result.deletedIds.map(id => {
                      const f = currentFlights.find(x => x.id === id);
                      return (
                        <div key={id} className="flex gap-4 items-center bg-white p-3 rounded-xl border border-rose-100 shadow-sm opacity-70">
                          <input 
                             type="checkbox" 
                             className="w-4 h-4 accent-rose-600" 
                             checked={selectedDeleted.has(id)} 
                             onChange={() => toggleSet(selectedDeleted, id, setSelectedDeleted)}
                          />
                          <div className="flex-1 text-sm font-bold text-slate-700">
                            {f ? `${f.flightNumber} (${f.date})` : 'Unknown Flight'}
                          </div>
                          <div className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase text-rose-500">
                            Remove from Database
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
            <p className="text-xs font-bold text-slate-500">
              Review changes carefully before applying.
            </p>
            <div className="flex gap-3">
               <button onClick={() => setResult(null)} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors">
                 Discard
               </button>
               <button onClick={applySelected} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest italic transition-colors">
                 Apply Selected
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Utils (you can keep it here or shared)
function fileToGenerativePart(file: File): Promise<ExtractionMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(",")[1];
      resolve({
        data: base64Data,
        mimeType: file.type || "application/octet-stream",
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
