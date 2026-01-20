
import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, identifyMapping, ExtractionMedia, sanitizeRole } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import * as XLSX from 'xlsx';
import { 
  FileUp, 
  Database, 
  AlertCircle, 
  Search, 
  Activity, 
  Users, 
  Sparkles, 
  Clipboard, 
  Check, 
  Plane, 
  Clock,
  CalendarDays,
  Zap, 
  ArrowRight,
  Settings2,
  X
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

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, initialTarget }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [detectedRowCount, setDetectedRowCount] = useState(0);
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
    "Analyzing document structure...",
    "Identifying column headers fuzzy match...",
    "Temporal linkage processing...",
    "Normalizing power rates and dates...",
    "Validating extracted rows...",
    "Assembling station data..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase((prev: number) => (prev + 1) % phases.length);
      }, 1200);
    } else {
      setScanPhase(0);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(new Error(`Failed to convert ${file.name} to Base64`));
      reader.readAsDataURL(file);
    });
  };

  const parseImportDate = (val: any) => {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'number') {
      const date = new Date(0);
      date.setUTCMilliseconds(Math.round((val - 25569) * 86400 * 1000));
      return date.getUTCFullYear() + '-' + 
             String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getUTCDate()).padStart(2, '0');
    }
    const str = String(val).trim();
    if (str.includes('/') && !str.includes('-')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        let d = parts[0], m = parts[1], y = parts[2];
        if (d.length === 1) d = '0' + d;
        if (m.length === 1) m = '0' + m;
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
    let str = String(val).trim();
    if (/^\d{3,4}$/.test(str)) {
      str = str.padStart(4, '0');
      return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
    }
    return str;
  };

  const parsePowerRate = (val: any) => {
    if (val === undefined || val === null || val === '') return 75;
    const cleanStr = String(val).replace('%', '').trim();
    let num = parseFloat(cleanStr);
    if (isNaN(num)) return 75;
    if (num > 0 && num <= 1) return Math.round(num * 100);
    return Math.round(num);
  };

  const parseRoleString = (str: any): Partial<Record<Skill, number>> => {
    const counts: Partial<Record<Skill, number>> = {};
    if (!str || typeof str !== 'string') return counts;
    const parts = str.split(/[,\n;]/);
    parts.forEach(part => {
      const segments = part.split(/[:\-= ]+/).filter(Boolean);
      if (segments.length >= 2) {
        const count = parseInt(segments[segments.length - 1]);
        const nameParts = segments.slice(0, segments.length - 1);
        const name = nameParts.join(' ').trim();
        if (name && !isNaN(count)) {
          const sanitized = sanitizeRole(name);
          counts[sanitized] = count;
        }
      }
    });
    return counts;
  };

  const timeToMinutes = (time?: string) => {
    if (!time || !time.includes(':')) return -1;
    const [h, m] = time.split(':').map(Number);
    return (h * 60) + m;
  };

  const executeLocalMapping = () => {
    if (!pendingMapping) return;
    const { rows, map } = pendingMapping;
    const dataRows = rows.slice(1);
    const flights: Flight[] = [];
    const staff: Staff[] = [];
    const shifts: ShiftConfig[] = [];

    dataRows.forEach((row) => {
      if (!row || row.length === 0) return;
      
      const hasFlightNo = map.flightNumber !== undefined && map.flightNumber !== -1 && row[map.flightNumber];
      const hasStaffName = map.name !== undefined && map.name !== -1 && row[map.name];
      const shiftDateCol = (map.pickupDate !== undefined && map.pickupDate !== -1) ? map.pickupDate : map.date;
      const hasShiftTime = map.pickupTime !== undefined && map.pickupTime !== -1 && row[map.pickupTime];
      const hasRoleMatrix = map.roleMatrix !== undefined && map.roleMatrix !== -1 && row[map.roleMatrix];

      const isShiftRow = !!hasShiftTime || !!hasRoleMatrix;

      let rowFlightId: string | null = null;
      if (hasFlightNo) {
        rowFlightId = Math.random().toString(36).substr(2, 9);
        flights.push({
          id: rowFlightId,
          flightNumber: String(row[map.flightNumber] || '').trim().toUpperCase(),
          from: String(row[map.from] || '').trim().toUpperCase(),
          to: String(row[map.to] || '').trim().toUpperCase(),
          sta: parseImportTime(row[map.sta]),
          std: parseImportTime(row[map.std]),
          date: parseImportDate(row[map.date]),
          type: 'Turnaround',
          day: 0
        });
      }

      if (isShiftRow) {
        const shiftId = Math.random().toString(36).substr(2, 9);
        let roleCounts: Partial<Record<Skill, number>> = {};
        if (hasRoleMatrix) roleCounts = parseRoleString(row[map.roleMatrix]);
        
        const tryMergeSkill = (skill: Skill, colIndex: number | undefined) => {
          if (colIndex !== undefined && colIndex !== -1) {
            const val = parseInt(row[colIndex]);
            if (!isNaN(val) && val > 0) roleCounts[skill] = (roleCounts[skill] || 0) + val;
          }
        };
        
        tryMergeSkill('Shift Leader', map.skill_ShiftLeader);
        tryMergeSkill('Operations', map.skill_Operations);
        tryMergeSkill('Ramp', map.skill_Ramp);
        tryMergeSkill('Load Control', map.skill_LoadControl);
        tryMergeSkill('Lost and Found', map['skill_Lost and Found']);

        shifts.push({
          id: shiftId,
          pickupDate: parseImportDate(row[shiftDateCol]),
          pickupTime: parseImportTime(row[map.pickupTime]),
          endDate: parseImportDate(row[map.endDate] || row[shiftDateCol]),
          endTime: parseImportTime(row[map.endTime]),
          minStaff: parseInt(row[map.minStaff]) || 2,
          maxStaff: parseInt(row[map.maxStaff]) || 8,
          day: 0,
          roleCounts: roleCounts,
          flightIds: rowFlightId ? [rowFlightId] : []
        });
      }

      if (hasStaffName) {
        staff.push({
          id: Math.random().toString(36).substr(2, 9),
          name: String(row[map.name] || '').trim(),
          initials: String(row[map.initials] || '').trim().toUpperCase(),
          type: String(row[map.type] || '').toLowerCase().includes('rost') ? 'Roster' : 'Local',
          powerRate: parsePowerRate(row[map.powerRate]),
          workPattern: String(row[map.type] || '').toLowerCase().includes('rost') ? 'Continuous (Roster)' : '5 Days On / 2 Off',
          maxShiftsPerWeek: 5,
          workFromDate: map.workFromDate !== undefined && map.workFromDate !== -1 ? parseImportDate(row[map.workFromDate]) : undefined,
          workToDate: map.workToDate !== undefined && map.workToDate !== -1 ? parseImportDate(row[map.workToDate]) : undefined,
          skillRatings: {
            'Ramp': (map.skill_Ramp !== undefined && map.skill_Ramp !== -1 && (String(row[map.skill_Ramp]).toLowerCase().includes('yes') || String(row[map.skill_Ramp]) === '1')) ? 'Yes' : 'No',
            'Operations': (map.skill_Operations !== undefined && map.skill_Operations !== -1 && (String(row[map.skill_Operations]).toLowerCase().includes('yes') || String(row[map.skill_Operations]) === '1')) ? 'Yes' : 'No',
            'Load Control': (map.skill_LoadControl !== undefined && map.skill_LoadControl !== -1 && (String(row[map.skill_LoadControl]).toLowerCase().includes('yes') || String(row[map.skill_LoadControl]) === '1')) ? 'Yes' : 'No',
            'Shift Leader': (map.skill_ShiftLeader !== undefined && map.skill_ShiftLeader !== -1 && (String(row[map.skill_ShiftLeader]).toLowerCase().includes('yes') || String(row[map.skill_ShiftLeader]) === '1')) ? 'Yes' : 'No',
            'Lost and Found': (map['skill_Lost and Found'] !== undefined && map['skill_Lost and Found'] !== -1 && (String(row[map['skill_Lost and Found']]).toLowerCase().includes('yes') || String(row[map['skill_Lost and Found']]) === '1')) ? 'Yes' : 'No'
          }
        });
      }
    });

    // AUTO-LINKAGE ENGINE: Link all flights occurring during shift times on the same date
    shifts.forEach(s => {
      const shiftStart = timeToMinutes(s.pickupTime);
      const shiftEnd = timeToMinutes(s.endTime);
      
      const matchingFlights = flights.filter(f => {
        if (f.date !== s.pickupDate) return false;
        const flightTime = timeToMinutes(f.sta || f.std);
        if (flightTime === -1) return false;
        
        // Flight is linked if it falls within the shift window (with 15 min buffer)
        const inWindow = shiftEnd > shiftStart 
          ? (flightTime >= shiftStart - 15 && flightTime <= shiftEnd + 15)
          : (flightTime >= shiftStart - 15 || flightTime <= shiftEnd + 15); // Overnight wrap
        
        return inWindow;
      });

      matchingFlights.forEach(f => {
        if (!s.flightIds) s.flightIds = [];
        if (!s.flightIds.includes(f.id)) s.flightIds.push(f.id);
      });
    });

    setExtractedData({ flights, staff, shifts, programs: [] });
    setDetectedRowCount(flights.length + staff.length + shifts.length);
    setPendingMapping(null);
  };

  const processImport = async (textData?: string, mediaParts: ExtractionMedia[] = [], target: PasteTarget = 'all') => {
    setIsScanning(true);
    setScanError(null);
    try {
      const data = await extractDataFromContent({ textData, media: mediaParts, startDate, targetType: target });
      if (data) {
        setExtractedData(data);
        setDetectedRowCount((data.flights?.length || 0) + (data.staff?.length || 0) + (data.shifts?.length || 0));
      }
    } catch (error: any) {
      setScanError({ title: "Extraction Error", message: error.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handlePasteSubmit = () => pastedText.trim() && processImport(pastedText, [], pasteTarget);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setIsScanning(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const workbook = XLSX.read(evt.target?.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        const mappingResponse = await identifyMapping(rows, pasteTarget);
        setIsScanning(false);
        if (mappingResponse?.columnMap) setPendingMapping({ rows, target: pasteTarget, map: mappingResponse.columnMap });
        else processImport(XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]));
      };
      reader.readAsBinaryString(file);
    } else {
      const base64 = await fileToBase64(file);
      processImport(undefined, [{ data: base64, mimeType: file.type }], pasteTarget);
    }
  };

  const finalizeImport = () => extractedData && (onDataExtracted(extractedData), setExtractedData(null));

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="p-8 lg:p-12 bg-white border-b border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20"><Database size={24} /></div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">AI Extraction Core</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Smart Document Sync</p>
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-10 no-scrollbar">
        <div className="flex gap-4 p-2 bg-slate-200/50 rounded-2xl w-fit">
           <button onClick={() => setImportMode('upload')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'upload' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>Upload File</button>
           <button onClick={() => setImportMode('paste')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'paste' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400'}`}>Paste Data</button>
        </div>

        {scanError && <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-6"><AlertCircle size={32} className="text-rose-500" /><div><h5 className="text-sm font-black text-rose-900 uppercase italic mb-1">{scanError.title}</h5><p className="text-xs text-rose-600">{scanError.message}</p></div></div>}

        {!extractedData && !pendingMapping && !isScanning && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            {importMode === 'upload' ? (
              <div onClick={() => fileInputRef.current?.click()} className="group relative h-[400px] border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all overflow-hidden">
                 <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-all"><FileUp size={40} /></div>
                 <p className="text-xl font-black italic text-slate-900 uppercase tracking-tighter mt-8">Drop Operation Source</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Supports XLSX, CSV, PNG, JPG</p>
                 <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="space-y-6">
                <textarea className="w-full h-[300px] p-10 bg-white border border-slate-200 rounded-[3.5rem] font-medium text-sm outline-none shadow-inner" placeholder="Paste roster data here..." value={pastedText} onChange={e => setPastedText(e.target.value)} />
                <button onClick={handlePasteSubmit} disabled={!pastedText.trim()} className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl transition-all">Engage Smart Mapping</button>
              </div>
            )}
          </div>
        )}

        {isScanning && <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-10"><div className="w-32 h-32 border-4 border-slate-200 rounded-full animate-spin border-t-blue-600"></div><h4 className="text-2xl font-black italic uppercase text-slate-950">{phases[scanPhase]}</h4></div>}

        {pendingMapping && (
          <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100">
             <div className="flex items-center gap-6 mb-10"><h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Confirm Column Mapping</h3></div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {Object.entries(pendingMapping.map).map(([key, idx]) => (
                   <div key={key} className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-400">{key}</span><span className="text-sm font-black text-slate-950">{idx !== -1 ? `Col ${(idx as any) + 1}` : 'N/A'}</span></div>
                ))}
             </div>
             <button onClick={executeLocalMapping} className="w-full py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl">PROCEED WITH DATA SYNC <ArrowRight size={18}/></button>
          </div>
        )}

        {extractedData && (
          <div className="space-y-10">
             <div className="bg-emerald-600 p-12 rounded-[4rem] text-white shadow-2xl">
                <div className="flex items-center gap-8 mb-10"><div className="w-20 h-20 bg-white/10 rounded-[2.5rem] flex items-center justify-center"><Check size={40} /></div><div><h3 className="text-3xl font-black uppercase italic tracking-tighter">Extraction Results</h3><p className="text-emerald-300 text-[10px] font-black uppercase mt-1">{detectedRowCount} Entities Isolated</p></div></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Flights</span><span className="text-2xl font-black">{extractedData.flights.length}</span></div>
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Staff</span><span className="text-2xl font-black">{extractedData.staff.length}</span></div>
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Shifts</span><span className="text-2xl font-black">{extractedData.shifts.length}</span></div>
                </div>
             </div>
             <button onClick={finalizeImport} className="w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.3em] shadow-2xl flex items-center justify-center gap-4">AUTHORIZE MASTER UPDATE <Sparkles size={20}/></button>
          </div>
        )}
      </div>
    </div>
  );
};
