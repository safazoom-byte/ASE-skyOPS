
import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService.ts';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill, ProficiencyLevel } from '../types.ts';
import * as XLSX from 'xlsx';
import { 
  FileUp, 
  AlertCircle, 
  Activity, 
  Sparkles, 
  Check, 
  Plane, 
  Clock,
  Zap, 
  ArrowRight,
  X,
  Table,
  CheckCircle2,
  Layers,
  Users,
  Trash2
} from 'lucide-react';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => void;
  startDate?: string;
  numDays?: number;
  initialTarget?: 'flights' | 'staff' | 'shifts';
}

interface ScanError {
  title: string;
  message: string;
}

type PasteTarget = 'flights' | 'staff' | 'shifts' | 'all';

const HEADER_ALIASES: Record<string, string[]> = {
  flightNumber: ['flight', 'flt', 'fn', 'flight no', 'flight number', 'f/n', 'service', 'num'],
  from: ['from', 'origin', 'dep', 'departure station', 'org', 'sector from', 'dep station'],
  to: ['to', 'destination', 'arr', 'arrival station', 'dest', 'sector to', 'arr station'],
  sta: ['sta', 'arrival time', 'arrival', 'sta time', 'eta', 'arr time'],
  std: ['std', 'departure time', 'departure', 'std time', 'etd', 'dep time'],
  date: ['date', 'day', 'flight date', 'op date', 'service date', 'dated'],
  name: ['name', 'full name', 'staff name', 'personnel', 'agent', 'employee', 'staff'],
  initials: ['initials', 'sign', 'code', 'staff id', 'id', 'user', 'short name'],
  type: ['type', 'category', 'status', 'contract', 'staff type', 'cat'],
  powerRate: ['power', 'rate', 'performance', 'power rate', '%', 'productivity', 'efficiency'],
  pickupTime: ['pickup', 'start', 'duty start', 'on', 'shift start', 'start time', 'pickup time', 'time on'],
  endTime: ['end', 'release', 'duty end', 'off', 'shift end', 'end time', 'release time', 'time off'],
  pickupDate: ['shift date', 'start date', 'pickup date', 'on date'],
  minStaff: ['min', 'minimum', 'min hc', 'staff required', 'req', 'minimum staff'],
  maxStaff: ['max', 'maximum', 'max hc', 'staff max', 'limit', 'maximum staff'],
  skill_sl: ['shift leader', 'sl', 'leader', 'is shift leader'],
  skill_ops: ['operations', 'ops', 'is operations'],
  skill_ramp: ['ramp', 'is ramp', 'ramp agent'],
  skill_lc: ['load control', 'lc', 'weight', 'is load control'],
  skill_lf: ['lost and found', 'lf', 'lost&found', 'lost and found agent'],
};

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, initialTarget }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>(initialTarget ? 'paste' : 'upload');
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>(initialTarget || 'all');
  const [pastedText, setPastedText] = useState('');
  const [pendingMapping, setPendingMapping] = useState<{ rows: any[][], target: PasteTarget, map: Record<string, number> } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const phases = ["Initializing buffer...", "Scanning headers...", "Mapping dimensions...", "Validating rows...", "Compiling output..."];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => setScanPhase(prev => (prev + 1) % phases.length), 500);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  const detectHeadersLocally = (headers: any[]): Record<string, number> => {
    const map: Record<string, number> = {};
    const normalizedHeaders = headers.map(h => String(h || '').toLowerCase().trim());
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      map[key] = normalizedHeaders.findIndex(h => aliases.some(alias => h === alias || h.includes(alias)));
    });
    return map;
  };

  const parseImportDate = (val: any) => {
    if (!val) return startDate || '';
    if (typeof val === 'number') {
      const date = new Date(0);
      date.setUTCMilliseconds(Math.round((val - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split(' ')[0];
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        let d = parts[0].padStart(2, '0'), m = parts[1].padStart(2, '0'), y = parts[2];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
      }
    }
    return str;
  };

  const parseImportTime = (val: any) => {
    if (!val) return '';
    if (typeof val === 'number') {
      const totalMinutes = Math.round((val % 1) * 24 * 60);
      return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    }
    const str = String(val).trim();
    if (/^\d{3,4}$/.test(str)) return `${str.padStart(4, '0').slice(0, 2)}:${str.padStart(4, '0').slice(2, 4)}`;
    return str.substring(0, 5);
  };

  const processLocalRows = (rows: any[][], map: Record<string, number>) => {
    try {
      const dataRows = rows.slice(1);
      const flights: Flight[] = [];
      const staff: Staff[] = [];
      const shifts: ShiftConfig[] = [];

      dataRows.forEach((row, idx) => {
        if (!row || !row.length) return;
        
        const fNo = map.flightNumber !== -1 ? String(row[map.flightNumber] || '').trim() : '';
        if (fNo && (pasteTarget === 'all' || pasteTarget === 'flights')) {
          flights.push({
            id: `f-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            flightNumber: fNo.toUpperCase(),
            from: map.from !== -1 ? String(row[map.from] || 'UNK').trim().toUpperCase() : 'UNK',
            to: map.to !== -1 ? String(row[map.to] || 'UNK').trim().toUpperCase() : 'UNK',
            sta: parseImportTime(row[map.sta]),
            std: parseImportTime(row[map.std]),
            date: parseImportDate(row[map.date]),
            type: 'Turnaround',
            day: 0
          });
        }

        const sName = map.name !== -1 ? String(row[map.name] || '').trim() : '';
        if (sName && (pasteTarget === 'all' || pasteTarget === 'staff')) {
          const typeStr = map.type !== -1 ? String(row[map.type] || '').toLowerCase() : '';
          const skillRatings: Partial<Record<Skill, ProficiencyLevel>> = {};
          
          ['sl', 'ops', 'ramp', 'lc', 'lf'].forEach(key => {
            const skillIdx = (map as any)[`skill_${key}`];
            const skillName = key === 'sl' ? 'Shift Leader' : key === 'ops' ? 'Operations' : key === 'ramp' ? 'Ramp' : key === 'lc' ? 'Load Control' : 'Lost and Found';
            const val = skillIdx !== -1 ? String(row[skillIdx] || '').toLowerCase() : '';
            skillRatings[skillName as Skill] = ['yes', 'y', '1', 'true', 'x', 't'].includes(val) ? 'Yes' : 'No';
          });

          staff.push({
            id: `s-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            name: sName,
            initials: map.initials !== -1 ? String(row[map.initials] || '').trim().toUpperCase() : sName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
            type: typeStr.includes('rost') ? 'Roster' : 'Local',
            powerRate: map.powerRate !== -1 ? (parseInt(row[map.powerRate]) || 75) : 75,
            workPattern: typeStr.includes('rost') ? 'Continuous (Roster)' : '5 Days On / 2 Off',
            maxShiftsPerWeek: 5,
            skillRatings
          });
        }

        const pTime = map.pickupTime !== -1 ? parseImportTime(row[map.pickupTime]) : '';
        if (pTime && (pasteTarget === 'all' || pasteTarget === 'shifts')) {
          const pDate = parseImportDate(row[map.pickupDate] || row[map.date]);
          shifts.push({
            id: `sh-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            pickupDate: pDate,
            pickupTime: pTime,
            endDate: parseImportDate(row[map.endDate] || pDate),
            endTime: parseImportTime(row[map.endTime]),
            minStaff: map.minStaff !== -1 ? (parseInt(row[map.minStaff]) || 2) : 2,
            maxStaff: map.maxStaff !== -1 ? (parseInt(row[map.maxStaff]) || 8) : 8,
            day: 0,
            flightIds: []
          });
        }
      });

      if (!flights.length && !staff.length && !shifts.length) throw new Error("No valid data detected.");
      setExtractedData({ flights, staff, shifts, programs: [] });
      setPendingMapping(null);
    } catch (err: any) {
      setScanError({ title: "Parse Error", message: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setScanError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target?.result, { type: file.name.match(/\.(xlsx|xls)$/i) ? 'binary' : 'string' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        
        let headerRowIdx = 0;
        let localMap: Record<string, number> = {};
        let identifiedCount = 0;

        // Search first 10 rows for the best header row
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const currentMap = detectHeadersLocally(rows[i] || []);
          const count = Object.values(currentMap).filter(v => v !== -1).length;
          if (count > identifiedCount) {
            identifiedCount = count;
            headerRowIdx = i;
            localMap = currentMap;
          }
        }

        const dataRows = rows.slice(headerRowIdx);
        if (identifiedCount >= 3) processLocalRows(dataRows, localMap);
        else setPendingMapping({ rows: dataRows, target: pasteTarget, map: localMap });
      } catch (err: any) {
        setScanError({ title: "Import Failed", message: err.message });
      } finally {
        setIsScanning(false);
      }
    };
    if (file.name.match(/\.(xlsx|xls)$/i)) reader.readAsBinaryString(file);
    else reader.readAsText(file);
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    setIsScanning(true);
    try {
      const workbook = XLSX.read(pastedText, { type: 'string' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
      
      let headerRowIdx = 0;
      let localMap: Record<string, number> = {};
      let identifiedCount = 0;

      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const currentMap = detectHeadersLocally(rows[i] || []);
        const count = Object.values(currentMap).filter(v => v !== -1).length;
        if (count > identifiedCount) {
          identifiedCount = count;
          headerRowIdx = i;
          localMap = currentMap;
        }
      }

      const dataRows = rows.slice(headerRowIdx);
      if (identifiedCount >= 3) processLocalRows(dataRows, localMap);
      else setPendingMapping({ rows: dataRows, target: pasteTarget, map: localMap });
    } catch (e) {
      processAIImport(pastedText, [], pasteTarget);
    }
  };

  const processAIImport = async (textData?: string, mediaParts: ExtractionMedia[] = [], target: PasteTarget = 'all') => {
    setIsScanning(true);
    try {
      const data = await extractDataFromContent({ textData, media: mediaParts, startDate, targetType: target });
      if (data) setExtractedData(data);
    } catch (error: any) {
      setScanError({ title: "AI Sync Error", message: error.message });
    } finally {
      setIsScanning(false);
    }
  };

  const finalizeImport = () => { if (extractedData) { onDataExtracted(extractedData); setExtractedData(null); } };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="p-8 lg:p-12 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20"><Layers size={24} /></div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Data Injection</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational Registry Parser</p>
            </div>
         </div>
         <div className="flex gap-4 p-2 bg-slate-100 rounded-2xl">
           <button onClick={() => setImportMode('upload')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'upload' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>File</button>
           <button onClick={() => setImportMode('paste')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'paste' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>Paste</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-10 no-scrollbar">
        {scanError && (
          <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-6 animate-in slide-in-from-top-4">
            <AlertCircle size={32} className="text-rose-500 shrink-0" />
            <div className="flex-1">
              <h5 className="text-sm font-black text-rose-900 uppercase italic mb-1">{scanError.title}</h5>
              <p className="text-xs text-rose-600 font-bold">{scanError.message}</p>
            </div>
            <button onClick={() => setScanError(null)} className="p-2 bg-white rounded-full hover:bg-rose-100"><X size={16}/></button>
          </div>
        )}

        {!extractedData && !pendingMapping && !isScanning && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            {importMode === 'upload' ? (
              <div onClick={() => fileInputRef.current?.click()} className="group relative h-[400px] border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all bg-white shadow-inner">
                 <div className="w-24 h-24 bg-slate-50 rounded-[2rem] shadow-xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-all group-hover:scale-110"><FileUp size={40} /></div>
                 <p className="text-xl font-black italic text-slate-900 uppercase tracking-tighter mt-8">Upload Operational Registry</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">XLSX / CSV / XLS</p>
                 <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="space-y-6">
                <textarea className="w-full h-[350px] p-10 bg-white border border-slate-200 rounded-[3.5rem] font-mono text-xs outline-none shadow-inner focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="Paste rows from Excel..." value={pastedText} onChange={e => setPastedText(e.target.value)} />
                <button onClick={handlePasteSubmit} disabled={!pastedText.trim()} className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4">Process Paste Buffer <ArrowRight size={20}/></button>
              </div>
            )}
          </div>
        )}

        {isScanning && (
          <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in">
            <div className="relative"><div className="w-32 h-32 border-[6px] border-slate-100 rounded-full animate-spin border-t-blue-600"></div><div className="absolute inset-0 flex items-center justify-center"><Activity className="text-blue-600 animate-pulse" /></div></div>
            <div><h4 className="text-2xl font-black italic uppercase text-slate-950 tracking-tighter">{phases[scanPhase]}</h4><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 animate-pulse">Scanning Dimensions...</p></div>
          </div>
        )}

        {pendingMapping && (
          <div className="bg-white p-12 rounded-[4rem] shadow-xl border border-slate-100 animate-in slide-in-from-bottom-10 max-w-5xl mx-auto">
             <div className="flex items-center gap-6 mb-10"><div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white"><Table size={24}/></div><div><h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Verify Column Map</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manual confirmation required.</p></div></div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10 max-h-[400px] overflow-y-auto pr-4 no-scrollbar">
                {Object.keys(HEADER_ALIASES).map((field) => (
                   <div key={field} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-3">
                      <label className="text-[9px] font-black uppercase text-slate-400 block tracking-widest">{field.replace('_', ' ')}</label>
                      <select className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none cursor-pointer" value={pendingMapping.map[field] ?? -1} onChange={(e) => setPendingMapping({...pendingMapping, map: {...pendingMapping.map, [field]: parseInt(e.target.value)}})}>
                         <option value={-1}>[Ignore]</option>
                         {pendingMapping.rows[0]?.map((h: any, i: number) => (<option key={i} value={i}>{h || `Col ${i+1}`}</option>))}
                      </select>
                   </div>
                ))}
             </div>
             <button onClick={() => processLocalRows(pendingMapping.rows, pendingMapping.map)} className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4">Finalize Local Parse <ArrowRight size={20}/></button>
          </div>
        )}

        {extractedData && (
          <div className="space-y-10 animate-in fade-in duration-700">
             <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-12">
                   <div className="flex items-center gap-8"><div className="w-20 h-20 bg-emerald-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-xl shadow-emerald-600/20"><CheckCircle2 size={40} /></div><div><h3 className="text-3xl font-black uppercase italic tracking-tighter">Ready for Sync</h3><p className="text-slate-400 text-[10px] font-black uppercase mt-1 italic tracking-widest">Data validated locally</p></div></div>
                   <div className="flex gap-4">
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Flights</span><span className="text-xl font-black italic">{extractedData.flights.length}</span></div>
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Staff</span><span className="text-xl font-black italic">{extractedData.staff.length}</span></div>
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Shifts</span><span className="text-xl font-black italic">{extractedData.shifts.length}</span></div>
                   </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto rounded-[2rem] border border-slate-50 bg-slate-50/30 p-2 no-scrollbar mb-10">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-100 text-[8px] font-black uppercase tracking-widest text-slate-400 z-30"><tr><th className="px-6 py-4">TYPE</th><th className="px-6 py-4">IDENTIFIER</th><th className="px-6 py-4">DETAILS</th><th className="px-6 py-4 text-right">ACTION</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractedData.flights.map((f, i) => (<tr key={`f-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-blue-50/50"><td className="px-6 py-4 text-blue-600 uppercase flex items-center gap-2"><Plane size={12}/> FLT</td><td className="px-6 py-4">{f.flightNumber}</td><td className="px-6 py-4 text-slate-400 uppercase">{f.date} | {f.from}→{f.to}</td><td className="px-6 py-4 text-right"><button onClick={() => setExtractedData(prev => prev ? {...prev, flights: prev.flights.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button></td></tr>))}
                      {extractedData.staff.map((s, i) => (<tr key={`s-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-indigo-50/50"><td className="px-6 py-4 text-indigo-600 uppercase flex items-center gap-2"><Users size={12}/> STAFF</td><td className="px-6 py-4">{s.name} ({s.initials})</td><td className="px-6 py-4 text-slate-400 uppercase">{s.type} | {s.powerRate}%</td><td className="px-6 py-4 text-right"><button onClick={() => setExtractedData(prev => prev ? {...prev, staff: prev.staff.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button></td></tr>))}
                      {extractedData.shifts.map((sh, i) => (<tr key={`sh-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-amber-50/50"><td className="px-6 py-4 text-amber-600 uppercase flex items-center gap-2"><Clock size={12}/> SHIFT</td><td className="px-6 py-4">{sh.pickupTime} — {sh.endTime}</td><td className="px-6 py-4 text-slate-400 uppercase">{sh.pickupDate}</td><td className="px-6 py-4 text-right"><button onClick={() => setExtractedData(prev => prev ? {...prev, shifts: prev.shifts.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button></td></tr>))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setExtractedData(null)} className="flex-1 py-8 bg-slate-50 text-slate-400 rounded-[2.5rem] font-black uppercase italic border border-slate-200">Cancel</button>
                   <button onClick={finalizeImport} className="flex-[3] py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-6">Commit Registry to Cloud <Sparkles /></button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
