
import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, identifyMapping, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram, Skill } from '../types';
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
    "Mapping staff registry synonyms...",
    "Normalizing power rates and dates...",
    "Validating extracted rows...",
    "Assembling station data..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase(prev => (prev + 1) % phases.length);
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

  const executeLocalMapping = () => {
    if (!pendingMapping) return;
    const { rows, map } = pendingMapping;
    
    const parseImportDate = (val: any) => {
      if (val === null || val === undefined || val === '') return '';
      if (typeof val === 'number') {
        try {
          const date = new Date(Math.round((val - 25569) * 86400 * 1000));
          if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {}
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{5}$/.test(trimmed)) {
          const serial = parseInt(trimmed);
          const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
          if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
            return date.toISOString().split('T')[0];
          }
        }
        return trimmed;
      }
      return String(val).trim();
    };
    
    const dataRows = rows.slice(1);
    const result: any = { flights: [], staff: [], shifts: [] };

    dataRows.forEach((row) => {
      if (!row || row.length === 0) return;

      const hasFlight = map.flightNumber !== undefined && map.flightNumber !== -1 && row[map.flightNumber];
      const hasShift = map.pickupTime !== undefined && map.pickupTime !== -1 && row[map.pickupTime];
      const hasStaff = map.name !== undefined && map.name !== -1 && row[map.name];

      let currentFlightId: string | null = null;
      let flightDate: string = "";

      if (hasFlight) {
        currentFlightId = Math.random().toString(36).substr(2, 9);
        flightDate = parseImportDate(row[map.date]);
        result.flights.push({
          id: currentFlightId,
          flightNumber: String(row[map.flightNumber] || '').trim().toUpperCase(),
          from: String(row[map.from] || '').trim().toUpperCase(),
          to: String(row[map.to] || '').trim().toUpperCase(),
          sta: String(row[map.sta] || '').trim(),
          std: String(row[map.std] || '').trim(),
          date: flightDate,
          type: 'Turnaround'
        });
      }

      if (hasShift) {
        const shiftDate = flightDate || parseImportDate(row[map.pickupDate]);
        const shiftEndDate = flightDate || parseImportDate(row[map.endDate]);
        
        // Extract role requirements using full role names from columns
        const roleCounts: Partial<Record<Skill, number>> = {};
        if (map.skill_ShiftLeader !== -1 && row[map.skill_ShiftLeader]) roleCounts['Shift Leader'] = parseInt(row[map.skill_ShiftLeader]) || 0;
        if (map.skill_Operations !== -1 && row[map.skill_Operations]) roleCounts['Operations'] = parseInt(row[map.skill_Operations]) || 0;
        if (map.skill_Ramp !== -1 && row[map.skill_Ramp]) roleCounts['Ramp'] = parseInt(row[map.skill_Ramp]) || 0;
        if (map.skill_LoadControl !== -1 && row[map.skill_LoadControl]) roleCounts['Load Control'] = parseInt(row[map.skill_LoadControl]) || 0;
        if (map['skill_Lost and Found'] !== -1 && row[map['skill_Lost and Found']]) roleCounts['Lost and Found'] = parseInt(row[map['skill_Lost and Found']]) || 0;

        result.shifts.push({
          id: Math.random().toString(36).substr(2, 9),
          pickupDate: shiftDate,
          pickupTime: String(row[map.pickupTime] || '').trim(),
          endDate: shiftEndDate || shiftDate,
          endTime: String(row[map.endTime] || '').trim(),
          minStaff: parseInt(String(row[map.minStaff] || '2')) || 2,
          maxStaff: parseInt(String(row[map.maxStaff] || '6')) || 6,
          roleCounts: roleCounts,
          flightIds: currentFlightId ? [currentFlightId] : []
        });
      }

      if (hasStaff) {
        result.staff.push({
          id: Math.random().toString(36).substr(2, 9),
          name: String(row[map.name] || '').trim(),
          initials: String(row[map.initials] || '').trim().toUpperCase(),
          type: String(row[map.type] || '').toLowerCase().includes('rost') ? 'Roster' : 'Local',
          powerRate: parseInt(String(row[map.powerRate] || '75')) || 75,
          workFromDate: map.workFromDate !== -1 ? parseImportDate(row[map.workFromDate]) : undefined,
          workToDate: map.workToDate !== -1 ? parseImportDate(row[map.workToDate]) : undefined,
          skillRatings: {
            'Ramp': String(row[map.skill_Ramp] || '').toLowerCase().includes('yes') ? 'Yes' : 'No',
            'Operations': String(row[map.skill_Operations] || '').toLowerCase().includes('yes') ? 'Yes' : 'No',
            'Load Control': String(row[map.skill_LoadControl] || '').toLowerCase().includes('yes') ? 'Yes' : 'No',
            'Shift Leader': String(row[map.skill_ShiftLeader] || '').toLowerCase().includes('yes') ? 'Yes' : 'No',
            'Lost and Found': String(row[map['skill_Lost and Found']] || '').toLowerCase().includes('yes') ? 'Yes' : 'No'
          }
        });
      }
    });

    setExtractedData(result);
    setDetectedRowCount(result.flights.length + result.staff.length + result.shifts.length);
    setPendingMapping(null);
  };

  const processImport = async (textData?: string, mediaParts: ExtractionMedia[] = [], target: PasteTarget = 'all') => {
    setIsScanning(true);
    setScanError(null);
    setDetectedRowCount(0);

    try {
      const data = await extractDataFromContent({ 
        textData, 
        media: mediaParts.length > 0 ? mediaParts : undefined,
        startDate: startDate,
        targetType: target === 'all' ? undefined : target
      });

      if (data && (data.flights?.length > 0 || data.staff?.length > 0 || data.shifts?.length > 0)) {
        setExtractedData(data);
        const count = (data.flights?.length || 0) + (data.staff?.length || 0) + (data.shifts?.length || 0);
        setDetectedRowCount(count);
      } else {
        throw { 
          title: "Intelligent Mapping Failed", 
          message: `The AI could not identify columns. Ensure you are providing headers and data.`
        };
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Mapping Error",
        message: error.message || "The smart parser encountered an unexpected format."
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    processImport(pastedText, [], pasteTarget);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const file = files[0];
    const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
    
    if (isExcel) {
      setIsScanning(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        const mappingResponse = await identifyMapping(rows, pasteTarget);
        
        setIsScanning(false);
        if (mappingResponse && mappingResponse.columnMap) {
          setPendingMapping({ 
            rows, 
            target: pasteTarget, 
            map: mappingResponse.columnMap 
          });
        } else {
          processImport(XLSX.utils.sheet_to_csv(worksheet), [], pasteTarget);
        }
      };
      reader.readAsBinaryString(file);
      return;
    }

    let mediaParts: ExtractionMedia[] = [];
    for (const f of files) {
      const isImage = f.type.startsWith('image/');
      const base64 = await fileToBase64(f);
      if (isImage) {
        mediaParts.push({ data: base64, mimeType: f.type });
      }
    }
    processImport(undefined, mediaParts, pasteTarget);
  };

  const finalizeImport = () => {
    if (extractedData) {
      onDataExtracted(extractedData);
      setExtractedData(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      {/* Header */}
      <div className="p-8 lg:p-12 bg-white border-b border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
              <Database size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">AI Extraction Core</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Smart Document Sync</p>
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-10 no-scrollbar">
        {/* Step 1: Source Selection */}
        <div className="flex gap-4 p-2 bg-slate-200/50 rounded-2xl w-fit">
           <button onClick={() => setImportMode('upload')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'upload' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Upload File</button>
           <button onClick={() => setImportMode('paste')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${importMode === 'paste' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Paste Data</button>
        </div>

        {scanError && (
          <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-6 animate-in slide-in-from-top duration-300">
             <AlertCircle size={32} className="text-rose-500" />
             <div>
                <h5 className="text-sm font-black text-rose-900 uppercase italic mb-1">{scanError.title}</h5>
                <p className="text-xs text-rose-600 font-medium">{scanError.message}</p>
             </div>
          </div>
        )}

        {!extractedData && !pendingMapping && !isScanning && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            {importMode === 'upload' ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-[400px] border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all overflow-hidden"
              >
                 <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 group-hover:scale-110 transition-all relative z-10">
                   <FileUp size={40} />
                 </div>
                 <p className="text-xl font-black italic text-slate-900 uppercase tracking-tighter mt-8 relative z-10">Drop Operation Source</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 relative z-10">Supports XLSX, CSV, PNG, JPG</p>
                 <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".xlsx,.xls,.csv,image/*" />
              </div>
            ) : (
              <div className="space-y-6">
                <textarea 
                  className="w-full h-[300px] p-10 bg-white border border-slate-200 rounded-[3.5rem] font-medium text-sm outline-none focus:ring-4 focus:ring-blue-600/5 transition-all shadow-inner"
                  placeholder="Paste roster data, flight tables, or personnel lists here..."
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                />
                <button 
                  onClick={handlePasteSubmit}
                  disabled={!pastedText.trim()}
                  className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-30"
                >
                  Engage Smart Mapping
                </button>
              </div>
            )}
          </div>
        )}

        {isScanning && (
          <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in duration-500">
             <div className="relative">
                <div className="w-32 h-32 border-4 border-slate-200 rounded-full animate-spin border-t-blue-600"></div>
                <Search className="absolute inset-0 m-auto text-blue-600" size={32} />
             </div>
             <div className="space-y-2">
                <h4 className="text-2xl font-black italic uppercase tracking-tighter text-slate-950">{phases[scanPhase]}</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Neural Logic Processing...</p>
             </div>
          </div>
        )}

        {pendingMapping && (
          <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 animate-in zoom-in-95 duration-500">
             <div className="flex items-center gap-6 mb-10">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center">
                   <Settings2 size={32} />
                </div>
                <div>
                   <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-950">Confirm Column Mapping</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Verification Required</p>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10 max-h-[400px] overflow-y-auto no-scrollbar pr-4">
                {Object.entries(pendingMapping.map).map(([key, idx]) => (
                   <div key={key} className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] flex justify-between items-center group">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{key.replace(/skill_/, '').replace(/_/g, ' ')}</span>
                      <span className="text-sm font-black text-slate-950 italic">
                        {idx !== -1 ? `Column ${String.fromCharCode(65 + Number(idx))}` : 'NOT FOUND'}
                      </span>
                   </div>
                ))}
             </div>
             <div className="flex gap-4">
                <button onClick={() => setPendingMapping(null)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Discard</button>
                <button onClick={executeLocalMapping} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4">
                  PROCEED WITH DATA SYNC <ArrowRight size={18}/>
                </button>
             </div>
          </div>
        )}

        {extractedData && (
          <div className="space-y-10 animate-in slide-in-from-bottom duration-500">
             <div className="bg-emerald-600 p-12 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 blur-[100px] -mr-10 -mt-10"></div>
                <div className="flex items-center gap-8 mb-10">
                   <div className="w-20 h-20 bg-white/10 rounded-[2.5rem] flex items-center justify-center shadow-inner">
                      <Check size={40} strokeWidth={3} />
                   </div>
                   <div>
                      <h3 className="text-3xl font-black uppercase italic tracking-tighter">Extraction Results</h3>
                      <p className="text-emerald-300 text-[10px] font-black uppercase tracking-widest mt-1">{detectedRowCount} Entities Isolated</p>
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <Plane size={20} className="text-emerald-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Flights</span>
                      </div>
                      <span className="text-2xl font-black italic">{extractedData.flights.length}</span>
                   </div>
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <Users size={20} className="text-emerald-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Staff</span>
                      </div>
                      <span className="text-2xl font-black italic">{extractedData.staff.length}</span>
                   </div>
                   <div className="p-6 bg-white/10 border border-white/5 rounded-[2rem] flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <Clock size={20} className="text-emerald-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Shifts</span>
                      </div>
                      <span className="text-2xl font-black italic">{extractedData.shifts.length}</span>
                   </div>
                </div>
             </div>

             <div className="flex gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-8 text-[11px] font-black uppercase text-slate-400 italic">Wipe Cache</button>
                <button 
                  onClick={finalizeImport}
                  className="flex-[2] py-8 bg-slate-950 text-white rounded-[3rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  AUTHORIZE MASTER UPDATE <Sparkles size={20}/>
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
