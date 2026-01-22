import React, { useState, useRef, useEffect } from 'react';
import { identifyMapping, extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill } from '../types';
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
  Eye,
  Trash2,
  ShieldCheck,
  Settings
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

// Categorized aliases for better organization in the mapper
const HEADER_ALIASES: Record<string, string[]> = {
  // Flight basic fields
  flightNumber: ['flight', 'flt', 'fn', 'flight no', 'flight number', 'f/n', 'service'],
  from: ['from', 'origin', 'dep', 'departure station', 'org', 'sector from'],
  to: ['to', 'destination', 'arr', 'arrival station', 'dest', 'sector to'],
  sta: ['sta', 'arrival time', 'arrival', 'sta time', 'eta'],
  std: ['std', 'departure time', 'departure', 'std time', 'etd'],
  date: ['date', 'day', 'flight date', 'op date', 'service date'],
  
  // Staff basic fields
  name: ['name', 'full name', 'staff name', 'personnel', 'agent', 'employee'],
  initials: ['initials', 'sign', 'code', 'staff id', 'id', 'user'],
  type: ['type', 'category', 'status', 'contract', 'staff type'],
  powerRate: ['power', 'rate', 'performance', 'power rate', '%', 'productivity'],
  
  // Shift basic fields
  pickupTime: ['pickup', 'start', 'duty start', 'on', 'shift start', 'start time', 'time from'],
  endTime: ['end', 'release', 'duty end', 'off', 'shift end', 'end time', 'time to'],
  pickupDate: ['shift date', 'start date', 'pickup date', 'duty date'],
  endDate: ['end date', 'release date', 'finish date'],
  minStaff: ['min', 'minimum', 'min hc', 'staff required', 'target staff'],
  maxStaff: ['max', 'maximum', 'max hc', 'staff max', 'total staff'],
  
  // Personnel Qualifications (Staff Import)
  isRamp: ['ramp', 'rmp', 'ramp qualified', 'ramp skill'],
  isLoadControl: ['load control', 'lc', 'loadcontrol', 'l/c', 'lc skill'],
  isOps: ['ops', 'operations', 'operation', 'ground ops', 'ops skill'],
  isShiftLeader: ['shift leader', 'sl', 'shiftleader', 'lead', 'team lead', 'sl skill'],
  isLostFound: ['lost and found', 'lost & found', 'l&f', 'lf', 'lost/found', 'lf skill'],

  // Specialist Requirements (Shift Import)
  role_shiftLeader: ['sl count', 'shift leader count', 'lead needed', 'sl required'],
  role_loadControl: ['lc count', 'load control count', 'lc needed', 'lc required'],
  role_ramp: ['ramp count', 'ramp needed', 'ramp required'],
  role_ops: ['ops count', 'operations count', 'ops required'],
  role_lostFound: ['lf count', 'lost and found count', 'lf required']
};

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, initialTarget }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>(initialTarget ? 'paste' : 'upload');
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>(initialTarget || 'all');
  const [pastedText, setPastedText] = useState('');
  
  const [pendingMapping, setPendingMapping] = useState<{ 
    rows: any[][], 
    target: PasteTarget, 
    map: Record<string, number> 
  } | null>(null);

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
    
    // Handle "6 am", "10pm"
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
    
    // Remove seconds if present
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
          day: 0
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
        
        // Overnight logic: if endDate is same as pickupDate but endTime is earlier than pickupTime
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

    setExtractedData({ flights, staff, shifts, programs: [] });
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

    if (file.name.match(/\.(xlsx|xls)$/i)) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    setIsScanning(true);
    
    try {
      const workbook = XLSX.read(pastedText, { type: 'string' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
      
      if (rows.length < 1) throw new Error("Empty buffer.");

      const localMap = detectHeadersLocally(rows[0]);
      if (Object.values(localMap).filter(v => v !== -1).length >= 2) {
        processLocalRows(rows, localMap);
      } else {
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
      if (data) setExtractedData(data);
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

  const updateMapping = (field: string, index: number) => {
    if (!pendingMapping) return;
    setPendingMapping({
      ...pendingMapping,
      map: { ...pendingMapping.map, [field]: index }
    });
  };

  // Group mappings for UI display
  const renderMappingGroup = (title: string, icon: React.ReactNode, fieldKeys: string[]) => {
    if (!pendingMapping) return null;
    return (
      <div className="space-y-6">
        <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
          {icon} {title}
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fieldKeys.map((field) => (
             <div key={field} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-3">
                <label className="text-[9px] font-black uppercase text-slate-400 block">{field.replace('role_', 'Required ').replace('is', 'Skill: ')}</label>
                <select 
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none"
                  value={pendingMapping.map[field] ?? -1}
                  onChange={(e) => updateMapping(field, parseInt(e.target.value))}
                >
                   <option value={-1}>[Ignore Field]</option>
                   {pendingMapping.rows[0]?.map((h: any, i: number) => (
                     <option key={i} value={i}>{h || `Column ${i+1}`}</option>
                   ))}
                </select>
             </div>
          ))}
        </div>
      </div>
    );
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
              <h4 className="text-2xl font-black italic uppercase text-slate-950 tracking-tighter">{phases[scanPhase]}</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 animate-pulse">Running Local Heuristics</p>
            </div>
          </div>
        )}

        {pendingMapping && (
          <div className="bg-white p-12 rounded-[4rem] shadow-xl border border-slate-100 animate-in slide-in-from-bottom-10 max-w-6xl mx-auto space-y-12">
             <div className="flex items-center gap-6 mb-4">
                <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white"><Table size={24}/></div>
                <div>
                   <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Map Source Columns</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase">Manual verification required for ambiguous headers.</p>
                </div>
             </div>
             
             <div className="space-y-12 max-h-[60vh] overflow-y-auto pr-6 no-scrollbar pb-10">
                {(pendingMapping.target === 'all' || pendingMapping.target === 'flights') && renderMappingGroup('Flight Parameters', <Plane size={14} />, ['flightNumber', 'from', 'to', 'sta', 'std', 'date'])}
                
                {(pendingMapping.target === 'all' || pendingMapping.target === 'staff') && (
                  <>
                    {renderMappingGroup('Staff Registry', <Users size={14} />, ['name', 'initials', 'type', 'powerRate'])}
                    {renderMappingGroup('Discipline Matrix', <ShieldCheck size={14} />, ['isRamp', 'isLoadControl', 'isOps', 'isShiftLeader', 'isLostFound'])}
                  </>
                )}

                {(pendingMapping.target === 'all' || pendingMapping.target === 'shifts') && (
                  <>
                    {renderMappingGroup('Shift Timing', <Clock size={14} />, ['pickupDate', 'pickupTime', 'endDate', 'endTime'])}
                    {renderMappingGroup('Capacity & Logistics', <Settings size={14} />, ['minStaff', 'maxStaff'])}
                    {renderMappingGroup('Specialist Requirements', <Zap size={14} />, ['role_shiftLeader', 'role_loadControl', 'role_ramp', 'role_ops', 'role_lostFound'])}
                  </>
                )}
             </div>

             <button onClick={() => processLocalRows(pendingMapping.rows, pendingMapping.map)} className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-emerald-600 transition-all">GENERATE REGISTRY FROM MAP <ArrowRight size={20}/></button>
          </div>
        )}

        {extractedData && (
          <div className="space-y-10 animate-in fade-in duration-700">
             <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-12">
                   <div className="flex items-center gap-8">
                      <div className="w-20 h-20 bg-emerald-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-xl shadow-emerald-600/20"><CheckCircle2 size={40} /></div>
                      <div>
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter">Data Synchronized</h3>
                        <p className="text-slate-400 text-[10px] font-black uppercase mt-1 italic">Verified locally — Mapping successful</p>
                      </div>
                   </div>
                   <div className="flex gap-4">
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Flights</span><span className="text-xl font-black italic">{extractedData.flights.length}</span></div>
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Staff</span><span className="text-xl font-black italic">{extractedData.staff.length}</span></div>
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center"><span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Shifts</span><span className="text-xl font-black italic">{extractedData.shifts.length}</span></div>
                   </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto rounded-[2rem] border border-slate-50 bg-slate-50/30 p-2 no-scrollbar mb-10">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-100 text-[8px] font-black uppercase tracking-widest text-slate-400 z-30">
                      <tr>
                        <th className="px-6 py-4">ENTITY</th>
                        <th className="px-6 py-4">IDENTIFIER</th>
                        <th className="px-6 py-4">DETAILS</th>
                        <th className="px-6 py-4">QUALIFICATIONS / ROLES</th>
                        <th className="px-6 py-4 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractedData.flights.map((f, i) => (
                        <tr key={`f-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-blue-50/50">
                          <td className="px-6 py-4 text-blue-600 uppercase flex items-center gap-2"><Plane size={12}/> FLT</td>
                          <td className="px-6 py-4">{f.flightNumber}</td>
                          <td className="px-6 py-4 text-slate-400 uppercase">{f.date} | {f.sta || f.std} | {f.from}→{f.to}</td>
                          <td className="px-6 py-4 text-emerald-500">PARSED</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => setExtractedData(prev => prev ? {...prev, flights: prev.flights.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))}
                      {extractedData.staff.map((s, i) => (
                        <tr key={`s-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-indigo-50/50">
                          <td className="px-6 py-4 text-indigo-600 uppercase flex items-center gap-2"><Users size={12}/> STAFF</td>
                          <td className="px-6 py-4">{s.name} ({s.initials})</td>
                          <td className="px-6 py-4 text-slate-400 uppercase">{s.type} | PR: {s.powerRate}%</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1">
                              {s.isShiftLeader && <span className="bg-slate-200 px-1 rounded text-[7px]">SL</span>}
                              {s.isRamp && <span className="bg-slate-200 px-1 rounded text-[7px]">RMP</span>}
                              {s.isLoadControl && <span className="bg-slate-200 px-1 rounded text-[7px]">LC</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => setExtractedData(prev => prev ? {...prev, staff: prev.staff.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))}
                      {extractedData.shifts.map((sh, i) => (
                        <tr key={`sh-${i}`} className="text-[10px] font-black italic text-slate-900 hover:bg-amber-50/50">
                          <td className="px-6 py-4 text-amber-600 uppercase flex items-center gap-2"><Clock size={12}/> SHIFT</td>
                          <td className="px-6 py-4">{sh.pickupTime} — {sh.endTime}</td>
                          <td className="px-6 py-4 text-slate-400 uppercase">{sh.pickupDate} | HC: {sh.minStaff}-{sh.maxStaff}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1">
                              {/* Fix type error: Operator > cannot be applied to types unknown and number */}
                              {Object.entries(sh.roleCounts || {}).map(([role, count]) => (count as number) > 0 && (
                                <span key={role} className="bg-amber-100 text-amber-700 px-1 rounded text-[7px]">{role}: {count}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => setExtractedData(prev => prev ? {...prev, shifts: prev.shifts.filter((_, idx) => idx !== i)} : null)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button onClick={finalizeImport} className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-6">
                   AUTHORIZE DATA COMMIT <Sparkles />
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};