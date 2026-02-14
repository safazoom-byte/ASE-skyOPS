
import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill, LeaveRequest, IncomingDuty } from '../types';
import * as XLSX from 'xlsx';
import { 
  FileUp, AlertCircle, Activity, Sparkles, Check, Plane, Clock, Zap, ArrowRight, X, Table, CheckCircle2, Layers, Users, Eye, Trash2, ShieldCheck, Settings, CalendarX, Moon
} from 'lucide-react';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[], leaveRequests?: LeaveRequest[], incomingDuties?: IncomingDuty[] }) => void;
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
  flightNumber: ['flight', 'flt', 'fn', 'flight no', 'flight number', 'f/n', 'service'],
  from: ['from', 'origin', 'dep', 'departure station', 'org', 'sector from'],
  to: ['to', 'destination', 'arr', 'arrival station', 'dest', 'sector to'],
  sta: ['sta', 'arrival time', 'arrival', 'sta time', 'eta'],
  std: ['std', 'departure time', 'departure', 'std time', 'etd'],
  date: ['date', 'day', 'flight date', 'op date', 'service date'],
  name: ['name', 'full name', 'staff name', 'personnel', 'agent', 'employee'],
  initials: ['initials', 'sign', 'code', 'staff id', 'id', 'user'],
  type: ['type', 'category', 'status', 'contract', 'staff type'],
  powerRate: ['power', 'rate', 'performance', 'power rate', '%', 'productivity'],
  pickupTime: ['pickup', 'start', 'duty start', 'on', 'shift start', 'start time', 'time from'],
  endTime: ['end', 'release', 'duty end', 'off', 'shift end', 'end time', 'time to'],
  pickupDate: ['shift date', 'start date', 'pickup date', 'duty date'],
  endDate: ['end date', 'release date', 'finish date'],
  minStaff: ['min', 'minimum', 'min hc', 'staff required', 'target staff'],
  maxStaff: ['max', 'maximum', 'max hc', 'staff max', 'total staff'],
  isRamp: ['ramp', 'rmp', 'ramp qualified', 'ramp skill'],
  isLoadControl: ['load control', 'lc', 'loadcontrol', 'l/c', 'lc skill'],
  isOps: ['ops', 'operations', 'operation', 'ground ops', 'ops skill'],
  isShiftLeader: ['shift leader', 'sl', 'shiftleader', 'lead', 'team lead', 'sl skill'],
  isLostFound: ['lost and found', 'lost & found', 'l&f', 'lf', 'lost/found', 'lf skill'],
  role_shiftLeader: ['sl count', 'shift leader count', 'lead needed', 'sl required'],
  role_loadControl: ['lc count', 'load control count', 'lc needed', 'lc required'],
  role_ramp: ['ramp count', 'ramp needed', 'ramp required'],
  role_ops: ['ops count', 'operations count', 'ops required'],
  role_lostFound: ['lf count', 'lost and found count', 'lf required']
};

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, initialTarget }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[], leaveRequests: LeaveRequest[], incomingDuties: IncomingDuty[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>(initialTarget ? 'paste' : 'upload');
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>(initialTarget || 'all');
  const [pastedText, setPastedText] = useState('');
  const [pendingMapping, setPendingMapping] = useState<{ rows: any[][], target: PasteTarget, map: Record<string, number> } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const phases = [
    "Initializing local buffer...",
    "Scanning headers and keys...",
    "Mapping operational dimensions...",
    "Validating row integrity...",
    "Compiling registry output..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase((prev: number) => (prev + 1) % phases.length);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  const detectHeadersLocally = (headers: any[]): Record<string, number> => {
    const map: Record<string, number> = {};
    const normalizedHeaders = headers.map(h => String(h || '').toLowerCase().trim());

    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      const index = normalizedHeaders.findIndex(h => 
        aliases.some(alias => h === alias || h.includes(alias))
      );
      map[key] = index;
    });

    return map;
  };

  const parseImportDate = (val: any) => {
    if (val === null || val === undefined || val === '') return startDate || '';
    if (typeof val === 'number') {
      const date = new Date(0);
      date.setUTCMilliseconds(Math.round((val - 25569) * 86400 * 1000));
      return date.getUTCFullYear() + '-' + 
             String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getUTCDate()).padStart(2, '0');
    }
    const str = String(val).trim();
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
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'number') {
      const timeFraction = val % 1;
      const totalMinutes = Math.round(timeFraction * 24 * 60);
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    let str = String(val).trim().toLowerCase();
    const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1]);
      const m = ampmMatch[2] || '00';
      const ampm = ampmMatch[3];
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    if (/^\d{3,4}$/.test(str)) {
      str = str.padStart(4, '0');
      return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
    }
    if (/^\d{2}:\d{2}:\d{2}$/.test(str)) {
        return str.slice(0, 5);
    }
    return str;
  };

  const parseBoolean = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    const str = String(val).toLowerCase().trim();
    return ['yes', 'y', 'true', '1', 'ok', 'active'].includes(str);
  };

  const processLocalRows = (rows: any[][], map: Record<string, number>) => {
    const dataRows = rows.slice(1);
    const flights: Flight[] = [];
    const staff: Staff[] = [];
    const shifts: ShiftConfig[] = [];

    dataRows.forEach((row, idx) => {
      if (!row || row.length === 0) return;
      const flightNo = map.flightNumber !== -1 ? String(row[map.flightNumber] || '').trim() : '';
      const staffName = map.name !== -1 ? String(row[map.name] || '').trim() : '';
      const pickupTime = map.pickupTime !== -1 ? parseImportTime(row[map.pickupTime]) : '';

      if (flightNo && (pasteTarget === 'all' || pasteTarget === 'flights')) {
        flights.push({
          id: `f-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          flightNumber: flightNo.toUpperCase(),
          from: map.from !== -1 ? String(row[map.from] || '').trim().toUpperCase() : 'UNK',
          to: map.to !== -1 ? String(row[map.to] || '').trim().toUpperCase() : 'UNK',
          sta: map.sta !== -1 ? parseImportTime(row[map.sta]) : '',
          std: map.std !== -1 ? parseImportTime(row[map.std]) : '',
          date: parseImportDate(row[map.date]),
          type: 'Turnaround',
          day: 0,
          priority: 'Standard'
        });
      }

      if (staffName && (pasteTarget === 'all' || pasteTarget === 'staff')) {
        const typeStr = map.type !== -1 ? String(row[map.type] || '').toLowerCase() : '';
        const isRoster = typeStr.includes('rost') || typeStr.includes('contract');
        staff.push({
          id: `s-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          name: staffName,
          initials: map.initials !== -1 ? String(row[map.initials] || '').trim().toUpperCase() : staffName.substring(0, 2).toUpperCase(),
          type: isRoster ? 'Roster' : 'Local',
          powerRate: map.powerRate !== -1 ? (parseInt(row[map.powerRate]) || 75) : 75,
          workPattern: isRoster ? 'Continuous (Roster)' : '5 Days On / 2 Off',
          maxShiftsPerWeek: 5,
          isRamp: map.isRamp !== -1 ? parseBoolean(row[map.isRamp]) : false,
          isLoadControl: map.isLoadControl !== -1 ? parseBoolean(row[map.isLoadControl]) : false,
          isOps: map.isOps !== -1 ? parseBoolean(row[map.isOps]) : false,
          isShiftLeader: map.isShiftLeader !== -1 ? parseBoolean(row[map.isShiftLeader]) : false,
          isLostFound: map.isLostFound !== -1 ? parseBoolean(row[map.isLostFound]) : false
        });
      }

      if (pickupTime && (pasteTarget === 'all' || pasteTarget === 'shifts')) {
        const pDate = parseImportDate(row[map.pickupDate] || row[map.date]);
        let eDate = parseImportDate(row[map.endDate] || pDate);
        const eTime = map.endTime !== -1 ? parseImportTime(row[map.endTime]) : '';
        if (eTime && pickupTime && eDate === pDate) {
           const [h1, m1] = pickupTime.split(':').map(Number);
           const [h2, m2] = eTime.split(':').map(Number);
           if (h2 < h1 || (h2 === h1 && m2 < m1)) {
              const d = new Date(pDate);
              d.setDate(d.getDate() + 1);
              eDate = d.toISOString().split('T')[0];
           }
        }
        const roleCounts: Partial<Record<Skill, number>> = {};
        if (map.role_shiftLeader !== -1) roleCounts['Shift Leader'] = parseInt(row[map.role_shiftLeader]) || 0;
        if (map.role_loadControl !== -1) roleCounts['Load Control'] = parseInt(row[map.role_loadControl]) || 0;
        if (map.role_ramp !== -1) roleCounts['Ramp'] = parseInt(row[map.role_ramp]) || 0;
        if (map.role_ops !== -1) roleCounts['Operations'] = parseInt(row[map.role_ops]) || 0;
        if (map.role_lostFound !== -1) roleCounts['Lost and Found'] = parseInt(row[map.role_lostFound]) || 0;

        shifts.push({
          id: `sh-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          pickupDate: pDate,
          pickupTime: pickupTime,
          endDate: eDate,
          endTime: eTime,
          minStaff: map.minStaff !== -1 ? (parseInt(row[map.minStaff]) || 2) : 2,
          maxStaff: map.maxStaff !== -1 ? (parseInt(row[map.maxStaff]) || 8) : 8,
          day: 0,
          flightIds: [],
          roleCounts: Object.keys(roleCounts).length > 0 ? roleCounts : {}
        });
      }
    });

    setExtractedData({ flights, staff, shifts, programs: [], leaveRequests: [], incomingDuties: [] });
    setIsScanning(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setScanError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        let rows: any[][];
        if (file.name.match(/\.(xlsx|xls)$/i)) {
          const workbook = XLSX.read(data, { type: 'binary' });
          rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        } else {
          const workbook = XLSX.read(data, { type: 'string' });
          rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        }
        if (rows.length < 1) throw new Error("Document appears to be empty.");
        const localMap = detectHeadersLocally(rows[0]);
        const identifiedCount = Object.values(localMap).filter(v => v !== -1).length;
        if (identifiedCount >= 2) {
          processLocalRows(rows, localMap);
        } else {
          setPendingMapping({ rows, target: pasteTarget, map: localMap });
          setIsScanning(false);
        }
      } catch (err: any) {
        setScanError({ title: "Import Failed", message: err.message });
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
      if (rows.length < 1) throw new Error("Empty buffer.");
      const localMap = detectHeadersLocally(rows[0]);
      if (Object.values(localMap).filter(v => v !== -1).length >= 2) processLocalRows(rows, localMap);
      else {
        setPendingMapping({ rows, target: pasteTarget, map: localMap });
        setIsScanning(false);
      }
    } catch (e) {
      processAIImport(pastedText, [], pasteTarget);
    }
  };

  const processAIImport = async (textData?: string, mediaParts: ExtractionMedia[] = [], target: PasteTarget = 'all') => {
    setIsScanning(true);
    try {
      const data = await extractDataFromContent({ textData, media: mediaParts, startDate, targetType: target });
      if (data) setExtractedData({
        flights: data.flights || [],
        staff: data.staff || [],
        shifts: data.shifts || [],
        programs: [],
        leaveRequests: data.leaveRequests || [],
        incomingDuties: data.incomingDuties || []
      });
    } catch (error: any) {
      setScanError({ title: "AI Sync Error", message: error.message });
    } finally {
      setIsScanning(false);
    }
  };

  const finalizeImport = () => {
    if (extractedData) {
      onDataExtracted(extractedData);
      setExtractedData(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="p-8 lg:p-12 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20"><Layers size={24} /></div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Import Command</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">High-Speed Local Processing</p>
            </div>
         </div>
         <div className="flex gap-4 p-2 bg-slate-100 rounded-2xl">
           <button onClick={() => setImportMode('upload')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'upload' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>Upload File</button>
           <button onClick={() => setImportMode('paste')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'paste' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>Paste Buffer</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-10 no-scrollbar">
        {scanError && (
          <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-6 animate-in slide-in-from-top-4">
            <AlertCircle size={32} className="text-rose-500" />
            <div>
              <h5 className="text-sm font-black text-rose-900 uppercase italic mb-1">{scanError.title}</h5>
              <p className="text-xs text-rose-600">{scanError.message}</p>
            </div>
            <button onClick={() => setScanError(null)} className="ml-auto p-2 bg-white rounded-full"><X size={16}/></button>
          </div>
        )}

        {!extractedData && !pendingMapping && !isScanning && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            {importMode === 'upload' ? (
              <div onClick={() => fileInputRef.current?.click()} className="group relative h-[400px] border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all overflow-hidden bg-white shadow-inner">
                 <div className="w-24 h-24 bg-slate-50 rounded-[2rem] shadow-xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-all group-hover:scale-110"><FileUp size={40} /></div>
                 <p className="text-xl font-black italic text-slate-900 uppercase tracking-tighter mt-8">Engage Registry Sync</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">Instant XLSX / CSV / XLS Processing</p>
                 <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="space-y-6">
                <textarea className="w-full h-[350px] p-10 bg-white border border-slate-200 rounded-[3.5rem] font-mono text-xs outline-none shadow-inner focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="Paste tab-separated or comma-separated rows here..." value={pastedText} onChange={e => setPastedText(e.target.value)} />
                <div className="flex gap-4">
                  <button onClick={() => handlePasteSubmit()} disabled={!pastedText.trim()} className="flex-1 py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl transition-all flex items-center justify-center gap-4 hover:bg-blue-600">INJECT PASTE BUFFER <ArrowRight size={20}/></button>
                  <button onClick={() => setPastedText('')} className="px-10 py-8 bg-white text-slate-400 border border-slate-200 rounded-[2.5rem] font-black uppercase italic text-[10px] tracking-widest">Clear</button>
                </div>
              </div>
            )}
          </div>
        )}

        {isScanning && (
          <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in">
            <div className="relative">
              <div className="w-32 h-32 border-[6px] border-slate-100 rounded-full animate-spin border-t-blue-600"></div>
              <div className="absolute inset-0 flex items-center justify-center"><Activity className="text-blue-600 animate-pulse" /></div>
            </div>
            <div>
              <h4 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">{phases[scanPhase]}</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 animate-pulse">Running Local Heuristics</p>
            </div>
          </div>
        )}

        {extractedData && (
          <div className="space-y-10 animate-in zoom-in-95 duration-500">
             <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-10">
                   <h4 className="text-xl font-black italic uppercase text-slate-900 flex items-center gap-4"><CheckCircle2 className="text-emerald-500" /> Registry Review</h4>
                   <button onClick={finalizeImport} className="px-10 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase italic text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-600/10">Authorize Import</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                   <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                      <Plane size={24} className="mx-auto text-blue-500 mb-3" />
                      <h5 className="text-2xl font-black italic text-slate-900">{extractedData.flights.length}</h5>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Flights</p>
                   </div>
                   <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                      <Users size={24} className="mx-auto text-indigo-500 mb-3" />
                      <h5 className="text-2xl font-black italic text-slate-900">{extractedData.staff.length}</h5>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Staff</p>
                   </div>
                   <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                      <Clock size={24} className="mx-auto text-amber-500 mb-3" />
                      <h5 className="text-2xl font-black italic text-slate-900">{extractedData.shifts.length}</h5>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Shifts</p>
                   </div>
                   <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                      <CalendarX size={24} className="mx-auto text-rose-500 mb-3" />
                      <h5 className="text-2xl font-black italic text-slate-900">{extractedData.leaveRequests.length}</h5>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Leave Entries</p>
                   </div>
                   <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                      <Moon size={24} className="mx-auto text-purple-500 mb-3" />
                      <h5 className="text-2xl font-black italic text-slate-900">{extractedData.incomingDuties.length}</h5>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rest Logs</p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
