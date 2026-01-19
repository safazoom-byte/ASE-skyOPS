import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, identifyMapping, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
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
  Settings2
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

type PasteTarget = 'flights' | 'staff' | 'shifts';

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, initialTarget }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [detectedRowCount, setDetectedRowCount] = useState(0);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>(initialTarget ? 'paste' : 'upload');
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>(initialTarget || 'flights');
  const [pastedText, setPastedText] = useState('');
  
  // Smart-Map State
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
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64Data);
      };
      reader.onerror = () => reject(new Error(`Failed to convert ${file.name} to Base64`));
      reader.readAsDataURL(file);
    });
  };

  /**
   * Local Parser: Fast-path for mapped data
   */
  const executeLocalMapping = () => {
    if (!pendingMapping) return;
    const { rows, target, map } = pendingMapping;
    
    // Skip header row if identified
    const dataRows = rows.slice(1);
    const result: any = { flights: [], staff: [], shifts: [] };

    dataRows.forEach((row, idx) => {
      if (!row || row.length === 0) return;

      if (target === 'flights') {
        const flight: any = {
          id: Math.random().toString(36).substr(2, 9),
          flightNumber: String(row[map.flightNumber] || '').trim().toUpperCase(),
          from: String(row[map.from] || '').trim().toUpperCase(),
          to: String(row[map.to] || '').trim().toUpperCase(),
          sta: String(row[map.sta] || '').trim(),
          std: String(row[map.std] || '').trim(),
          date: String(row[map.date] || '').trim(),
          type: 'Turnaround'
        };
        if (flight.flightNumber) result.flights.push(flight);
      } else if (target === 'staff') {
        const staff: any = {
          id: Math.random().toString(36).substr(2, 9),
          name: String(row[map.name] || '').trim(),
          initials: String(row[map.initials] || '').trim().toUpperCase(),
          type: String(row[map.type] || '').toLowerCase().includes('rost') ? 'Roster' : 'Local',
          powerRate: parseInt(String(row[map.powerRate] || '75')) || 75,
          workFromDate: map.workFromDate !== -1 ? String(row[map.workFromDate] || '') : undefined,
          workToDate: map.workToDate !== -1 ? String(row[map.workToDate] || '') : undefined,
          skillRatings: {
            'Ramp': String(row[map.skill_Ramp] || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
            'Operations': String(row[map.skill_Operations] || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
            'Load Control': String(row[map.skill_LoadControl] || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
            'Shift Leader': String(row[map.skill_ShiftLeader] || '').toLowerCase() === 'yes' ? 'Yes' : 'No'
          }
        };
        if (staff.name) result.staff.push(staff);
      } else if (target === 'shifts') {
        const shift: any = {
          id: Math.random().toString(36).substr(2, 9),
          pickupDate: String(row[map.pickupDate] || '').trim(),
          pickupTime: String(row[map.pickupTime] || '').trim(),
          endDate: String(row[map.endDate] || '').trim(),
          endTime: String(row[map.endTime] || '').trim(),
          minStaff: parseInt(String(row[map.minStaff] || '0')) || 4,
          maxStaff: parseInt(String(row[map.maxStaff] || '0')) || 8,
          roleCounts: {}
        };
        if (shift.pickupDate) result.shifts.push(shift);
      }
    });

    setExtractedData(result);
    setDetectedRowCount(result.flights.length + result.staff.length + result.shifts.length);
    setPendingMapping(null);
  };

  const processImport = async (textData?: string, mediaParts: ExtractionMedia[] = [], target: 'flights' | 'staff' | 'shifts' | 'all' = 'all') => {
    setIsScanning(true);
    setScanError(null);
    setDetectedRowCount(0);

    try {
      const data = await extractDataFromContent({ 
        textData, 
        media: mediaParts.length > 0 ? mediaParts : undefined,
        startDate: startDate,
        targetType: target
      });

      if (data && (data.flights?.length > 0 || data.staff?.length > 0 || data.shifts?.length > 0)) {
        setExtractedData(data);
        const count = (data.flights?.length || 0) + (data.staff?.length || 0) + (data.shifts?.length || 0);
        setDetectedRowCount(count);
      } else {
        throw { 
          title: "Intelligent Mapping Failed", 
          message: `The AI could not identify columns for your selected category (${target}). Ensure you are pasting relevant data and checking category headers.`
        };
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Mapping Error",
        message: error.message || "The smart parser encountered an unexpected format. Try providing headers like 'Name', 'Power Rate', and 'Work From'."
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
        
        // Identify target and mapping using AI on first few rows
        const mappingResponse = await identifyMapping(rows, pasteTarget);
        
        setIsScanning(false);
        if (mappingResponse && mappingResponse.columnMap) {
          setPendingMapping({ 
            rows, 
            target: pasteTarget, 
            map: mappingResponse.columnMap 
          });
        } else {
          // Fallback to generic AI extraction if mapping fails
          processImport(XLSX.utils.sheet_to_csv(worksheet), [], pasteTarget);
        }
      };
      reader.readAsBinaryString(file);
      return;
    }

    // PDF/Image Fallback
    let combinedTextData = '';
    let mediaParts: ExtractionMedia[] = [];

    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');
      const base64 = await fileToBase64(file);

      if (isPdf) {
        mediaParts.push({ data: base64, mimeType: 'application/pdf' });
      } else if (isImage) {
        mediaParts.push({ data: base64, mimeType: file.type });
      }
    }
    processImport(undefined, mediaParts, 'all');
  };

  const getTargetColor = () => {
    if (importMode === 'upload') return 'border-slate-700';
    switch (pasteTarget) {
      case 'flights': return 'border-blue-500/50';
      case 'staff': return 'border-emerald-500/50';
      case 'shifts': return 'border-indigo-500/50';
      default: return 'border-slate-700';
    }
  };

  return (
    <div className="relative h-full">
      {isScanning && (
        <div className="absolute inset-0 z-[2000] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-6 text-center rounded-[4rem]">
          <div className="space-y-12 max-w-md">
            <div className="relative">
              <Search className="mx-auto text-blue-400 animate-pulse" size={64} />
              <Sparkles className="absolute -top-2 -right-2 text-indigo-400 animate-bounce" size={24} />
            </div>
            <div className="space-y-4">
              <h3 className="text-white text-3xl font-black uppercase italic tracking-tighter leading-none">{phases[scanPhase]}</h3>
              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Exhaustive Smart Mapping Active</p>
            </div>
          </div>
        </div>
      )}

      <div className={`bg-slate-900 text-white p-10 rounded-[4rem] border-2 shadow-2xl relative overflow-hidden group transition-all duration-500 ${getTargetColor()} h-full`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-1000"></div>
        <div className="relative z-10 space-y-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="flex-1 text-center lg:text-left">
              <div className="flex items-center gap-2 mb-4 justify-center lg:justify-start">
                <Sparkles size={16} className="text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Station Registry Synchronizer v5.3</span>
              </div>
              <h3 className="text-3xl font-black mb-4 tracking-tight italic uppercase leading-none">External Data Command</h3>
              <p className="text-slate-400 text-xs max-w-xl font-medium leading-relaxed italic">
                Choose a category and paste directly from your operational spreadsheets to bypass manual entry.
              </p>
            </div>
            
            <div className="flex bg-white/5 p-1.5 rounded-[1.5rem] border border-white/10 shrink-0">
              <button 
                onClick={() => setImportMode('upload')}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all flex items-center gap-3 ${importMode === 'upload' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
              >
                <FileUp size={16} /> UPLOAD FILE
              </button>
              <button 
                onClick={() => setImportMode('paste')}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase italic tracking-widest transition-all flex items-center gap-3 ${importMode === 'paste' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
              >
                <Clipboard size={16} /> PASTE RAW TEXT
              </button>
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            {importMode === 'upload' ? (
              <div className="space-y-8">
                {/* Category Selector */}
                <div className="grid grid-cols-3 gap-4">
                  <button 
                    onClick={() => setPasteTarget('flights')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'flights' ? 'bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-blue-500/30'}`}
                  >
                    <Plane size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">FLIGHTS</span>
                  </button>
                  <button 
                    onClick={() => setPasteTarget('staff')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'staff' ? 'bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-emerald-500/30'}`}
                  >
                    <Users size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">STAFF</span>
                  </button>
                  <button 
                    onClick={() => setPasteTarget('shifts')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'shifts' ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-indigo-500/30'}`}
                  >
                    <Clock size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">SHIFTS</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full">
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanning}
                    className="w-full lg:w-auto px-10 py-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-sm uppercase italic flex items-center justify-center gap-4 shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 border border-white/10"
                  >
                    <FileUp size={24} /> SELECT SPREADSHEET
                  </button>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic ml-auto hidden lg:block">SMART-MAP TECHNOLOGY ACTIVE</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Category Selector */}
                <div className="grid grid-cols-3 gap-4">
                  <button 
                    onClick={() => setPasteTarget('flights')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'flights' ? 'bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-blue-500/30'}`}
                  >
                    <Plane size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">FLIGHTS</span>
                  </button>
                  <button 
                    onClick={() => setPasteTarget('staff')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'staff' ? 'bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-emerald-500/30'}`}
                  >
                    <Users size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">STAFF</span>
                  </button>
                  <button 
                    onClick={() => setPasteTarget('shifts')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border transition-all ${pasteTarget === 'shifts' ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-600/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-indigo-500/30'}`}
                  >
                    <Clock size={24} />
                    <span className="text-[10px] font-black uppercase italic tracking-widest">SHIFTS</span>
                  </button>
                </div>

                <textarea 
                  className={`w-full bg-slate-950/50 border border-white/10 p-8 rounded-[2rem] font-mono text-xs text-indigo-100 outline-none focus:ring-4 transition-all min-h-[200px] placeholder:text-slate-700 ${pasteTarget === 'flights' ? 'focus:ring-blue-600/20' : pasteTarget === 'staff' ? 'focus:ring-emerald-600/20' : 'focus:ring-indigo-600/20'}`}
                  placeholder={`Paste ${pasteTarget} data here... (e.g. from Excel, Google Sheets, or PDF text)`}
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                />
                
                <div className="flex justify-end">
                  <button 
                    onClick={handlePasteSubmit}
                    disabled={isScanning || !pastedText.trim()}
                    className={`px-12 py-6 text-white rounded-[1.5rem] font-black text-xs uppercase italic flex items-center gap-4 shadow-2xl transition-all active:scale-95 disabled:opacity-50 ${pasteTarget === 'flights' ? 'bg-blue-600 hover:bg-blue-500' : pasteTarget === 'staff' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                  >
                    <Check size={20} /> SYNC {pasteTarget.toUpperCase()}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {scanError && (
          <div className="mt-10 p-8 bg-rose-500/10 border border-rose-500/30 rounded-[2.5rem] flex items-center justify-between animate-in slide-in-from-top">
            <div className="flex items-center gap-4">
               <AlertCircle size={24} className="text-rose-500" />
               <div>
                  <p className="text-xs font-black text-white uppercase italic">{scanError.title}</p>
                  <p className="text-[10px] text-rose-200/60 font-medium uppercase tracking-widest mt-1">{scanError.message}</p>
               </div>
            </div>
            <button onClick={() => setScanError(null)} className="text-rose-400 font-black hover:text-white transition-colors">&times;</button>
          </div>
        )}
      </div>

      {/* Smart Mapping Confirmation Modal */}
      {pendingMapping && (
        <div className="absolute inset-0 z-[2200] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl rounded-[4rem]">
          <div className="bg-white rounded-[4rem] shadow-2xl max-w-xl w-full p-12 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8">
              <Settings2 size={40} className="text-indigo-600" />
            </div>
            <h3 className="text-2xl font-black italic uppercase mb-2 text-slate-950 tracking-tighter">Confirm AI Column Mapping</h3>
            <p className="text-slate-400 text-xs font-medium mb-10">AI has identified the following structure in your file.</p>
            
            <div className="bg-slate-50 rounded-[2.5rem] p-8 space-y-3 mb-10 text-left">
              {/* Fix: cast idx to number to avoid "Operator '+' cannot be applied to types 'unknown' and '1'" error */}
              {Object.entries(pendingMapping.map).filter(([_, idx]) => idx !== -1).map(([field, idx]) => (
                <div key={field} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{field}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-indigo-600">COL {(idx as number) + 1}</span>
                    <span className="text-[9px] font-black uppercase text-slate-300 italic">"{String(pendingMapping.rows[0][idx as number] || '').substring(0, 10)}..."</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setPendingMapping(null)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 italic">Abort</button>
              <button onClick={executeLocalMapping} className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] flex items-center justify-center gap-3">
                CONFIRM & IMPORT <ArrowRight size={16}/>
              </button>
            </div>
          </div>
        </div>
      )}

      {extractedData && (
        <div className="absolute inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl rounded-[4rem]">
          <div className="bg-white rounded-[4rem] shadow-2xl max-w-4xl w-full p-12 lg:p-16 text-center animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-indigo-100 shadow-inner">
                <Database size={40} className="text-indigo-500" />
              </div>
              <h3 className="text-2xl font-black italic uppercase mb-2 text-slate-950 tracking-tighter">Sync Validation Success</h3>
              <p className="text-slate-400 text-xs font-medium mb-8">Review critical registry data extracted by the engine.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 text-left">
                <div className={`p-6 rounded-[2rem] border transition-all ${extractedData.flights?.length ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100 opacity-30'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <Plane size={18} className="text-blue-500" />
                    <span className="text-2xl font-black text-slate-900 italic leading-none">{extractedData.flights?.length || 0}</span>
                  </div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Discovered Flights</div>
                </div>

                <div className={`p-6 rounded-[2rem] border transition-all ${extractedData.staff?.length ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 opacity-30'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <Users size={18} className="text-emerald-500" />
                    <span className="text-2xl font-black text-slate-900 italic leading-none">{extractedData.staff?.length || 0}</span>
                  </div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Personnel Extracted</div>
                  {extractedData.staff?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-emerald-100 space-y-2">
                       <div className="flex items-center gap-2 text-[8px] font-black text-emerald-700 uppercase">
                          <Zap size={10} /> {extractedData.staff.filter(s => s.powerRate).length} Power Rates Found
                       </div>
                       <div className="flex items-center gap-2 text-[8px] font-black text-emerald-700 uppercase">
                          <CalendarDays size={10} /> {extractedData.staff.filter(s => s.workFromDate).length} Contract Bounds Found
                       </div>
                    </div>
                  )}
                </div>

                <div className={`p-6 rounded-[2rem] border transition-all ${extractedData.shifts?.length ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100 opacity-30'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <Clock size={18} className="text-indigo-500" />
                    <span className="text-2xl font-black text-slate-900 italic leading-none">{extractedData.shifts?.length || 0}</span>
                  </div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duty Requirements</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 tracking-widest italic">Abort Import</button>
                <button 
                  onClick={() => { onDataExtracted(extractedData); setExtractedData(null); setPastedText(''); }} 
                  className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl shadow-slate-950/20 hover:bg-indigo-600 transition-all active:scale-95"
                >
                  COMMIT TO REGISTRY
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};