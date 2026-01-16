
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
import * as XLSX from 'xlsx';
import { Loader2, FileUp, Sparkles, Database, AlertCircle, Info, HelpCircle, Search, Clock } from 'lucide-react';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[], templateBinary?: string }) => void;
  templateBinary: string | null;
  startDate?: string;
  numDays?: number;
}

interface ScanError {
  title: string;
  message: string;
  suggestion?: string;
}

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, templateBinary, startDate, numDays = 7 }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[], templateBinary?: string } | null>(null);
  const [templateOnlySuccess, setTemplateOnlySuccess] = useState<string | null>(null);
  const [useAsTemplate, setUseAsTemplate] = useState(false);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const phases = [
    "Initializing Neural Scanner...",
    "Decoding Spatial Layout...",
    "Scanning Flight Patterns...",
    "Analyzing Station Timings...",
    "Mapping Personnel Registry...",
    "Validating Logic Sync..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase(prev => (prev + 1) % phases.length);
      }, 2500);
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

  const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    setTemplateOnlySuccess(null);
    
    try {
      let combinedTextData = '';
      let mediaParts: ExtractionMedia[] = [];
      let lastTemplateBase64: string | undefined;
      let jsonImportData: any = null;

      for (const file of files) {
        const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');
        const isJson = file.name.endsWith('.json') || file.type === 'application/json';
        
        const base64 = await fileToBase64(file);

        if (useAsTemplate) {
          lastTemplateBase64 = base64;
          break; 
        }

        if (isJson) {
           const text = await fileToText(file);
           try {
             const parsed = JSON.parse(text);
             if (parsed.flights && parsed.staff) {
               jsonImportData = parsed;
               break; 
             }
           } catch (e) {
             console.error("JSON parse failed", e);
           }
        }

        if (isExcel) {
          const workbook = XLSX.read(base64, { type: 'base64' });
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            combinedTextData += `### FILE: ${file.name} | SHEET: ${sheetName} ###\n` + XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
          });
        } else if (isPdf) {
          mediaParts.push({ data: base64, mimeType: 'application/pdf' });
        } else if (isImage) {
          mediaParts.push({ data: base64, mimeType: file.type });
        }
      }

      if (useAsTemplate && lastTemplateBase64) {
        setTemplateOnlySuccess(lastTemplateBase64);
      } else if (jsonImportData) {
        setExtractedData({
           flights: jsonImportData.flights || [],
           staff: jsonImportData.staff || [],
           shifts: jsonImportData.shifts || [],
           programs: jsonImportData.programs || []
        });
      } else {
        const data = await extractDataFromContent({ 
          textData: combinedTextData || undefined, 
          media: mediaParts.length > 0 ? mediaParts : undefined,
          startDate: startDate
        });

        const hasFlights = (data.flights?.length || 0) > 0;
        const hasStaff = (data.staff?.length || 0) > 0;
        const hasShifts = (data.shifts?.length || 0) > 0;

        if (data && (hasFlights || hasStaff || hasShifts)) {
          setExtractedData(data);
        } else {
          throw { 
            title: "Analysis Timeout", 
            message: "Deep scanning was unable to find recognizable flight patterns or staff identifiers in the source.",
            suggestion: "If uploading an image, ensure the text is clear. If a roster, ensure flight numbers (SM123) and times (14:30) are visible."
          };
        }
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Extraction Failed",
        message: error.message || "An unexpected error occurred during deep reasoning analysis.",
        suggestion: error.suggestion || "Check document clarity and ensuring your API key has high-tier access enabled."
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const outOfRangeFlights = useMemo(() => {
    if (!extractedData) return [];
    return extractedData.flights.filter(f => f.day < 0 || f.day >= numDays);
  }, [extractedData, numDays]);

  return (
    <div className="relative">
      {isScanning && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-6 text-center">
          <div className="space-y-10 max-w-sm">
            <div className="relative inline-block">
              {/* RADAR EFFECT */}
              <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
              <div className="w-28 h-28 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin relative z-10"></div>
              <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400" size={32} />
            </div>
            <div className="space-y-4">
              <h3 className="text-white text-2xl font-black uppercase italic tracking-tighter">Station Intel Scan</h3>
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
                <p className="text-blue-400 text-xs font-black uppercase tracking-[0.2em] mb-2 animate-pulse">
                  {phases[scanPhase]}
                </p>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-1000 ease-in-out" style={{ width: `${((scanPhase + 1) / phases.length) * 100}%` }}></div>
                </div>
              </div>
              <div className="pt-4 flex items-center justify-center gap-2 text-slate-500 font-black text-[8px] uppercase tracking-widest">
                <Clock size={10} className="animate-spin" />
                This deep analysis may take 15-30 seconds
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-8 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 blur-[120px] pointer-events-none group-hover:bg-blue-500/20 transition-all duration-1000"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <div className="flex items-center gap-3 mb-3 justify-center lg:justify-start">
              <div className="px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full text-[8px] font-black uppercase text-blue-400">Deep Extraction Engine v3</div>
            </div>
            <h3 className="text-2xl lg:text-3xl font-black mb-3 tracking-tight italic uppercase">Import Operational Core</h3>
            <p className="text-slate-400 text-xs lg:text-sm max-w-xl font-medium leading-relaxed">
              Analyze complex <span className="text-blue-400 font-black">flight schedules</span> or <span className="text-blue-400 font-black">personnel PDF lists</span>. 
              Patterns are mapped relative to <span className="text-indigo-400 underline">{startDate || "Current Day"}</span>.
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-4 w-full lg:w-auto">
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border transition-all ${useAsTemplate ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/50 border-white/5'}`}>
              <input 
                type="checkbox" 
                id="template-toggle-main" 
                checked={useAsTemplate} 
                onChange={(e) => setUseAsTemplate(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
              <label htmlFor="template-toggle-main" className={`text-[9px] font-black uppercase tracking-widest cursor-pointer ${useAsTemplate ? 'text-blue-400' : 'text-slate-400'}`}>
                Apply as Layout Template
              </label>
            </div>
            
            <input type="file" multiple={!useAsTemplate} accept="image/*,.xlsx,.xls,.csv,.pdf,.json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className={`w-full lg:w-auto px-10 py-5 ${useAsTemplate ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'} text-white rounded-[1.5rem] font-black text-[10px] lg:text-xs transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-95`}
            >
              <FileUp size={18} />
              {useAsTemplate ? 'SET MASTER TEMPLATE' : 'DEEP SCAN DATA'}
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mt-8 p-6 bg-rose-500/10 border border-rose-500/30 rounded-[2rem] flex flex-col md:flex-row md:items-center gap-6 animate-in slide-in-from-top duration-300">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
              <AlertCircle size={24} />
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest">{scanError.title}</h4>
              <p className="text-[10px] text-rose-200/80 leading-relaxed font-medium">{scanError.message}</p>
              {scanError.suggestion && (
                <div className="flex items-start gap-2 pt-2 text-[10px] text-rose-300/60 italic">
                  <HelpCircle size={12} className="shrink-0 mt-0.5" />
                  <span>Tip: {scanError.suggestion}</span>
                </div>
              )}
            </div>
            <button onClick={() => setScanError(null)} className="p-3 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all font-black">&times;</button>
          </div>
        )}
      </div>

      {extractedData && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
            <div className="p-10 lg:p-14 text-center overflow-y-auto no-scrollbar">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
                <Database size={32} />
              </div>
              <h3 className="text-2xl font-black italic uppercase mb-8 text-slate-950 tracking-tighter">Extraction Sequence Complete</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="text-3xl font-black text-blue-600 mb-1">{extractedData.flights?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Flights Mapped</div>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="text-3xl font-black text-emerald-600 mb-1">{extractedData.staff?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Personnel Found</div>
                </div>
              </div>

              {outOfRangeFlights.length > 0 && (
                <div className="mb-10 p-6 bg-amber-50 border border-amber-200 rounded-[2rem] text-left flex items-start gap-4">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-1">Timeline Mismatch</h4>
                    <p className="text-[9px] text-amber-700 font-medium leading-relaxed">
                      Deep analysis identified <span className="font-black">{outOfRangeFlights.length} records</span> falling outside the active window. These will be highlighted in Flight Control.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Reject</button>
                <button onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} className="flex-[2] py-5 px-8 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 italic">SYNC TO CORE</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {templateOnlySuccess && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white rounded-[2rem] shadow-2xl max-sm w-full p-10 text-center">
            <h3 className="text-xl font-black italic uppercase mb-2 text-slate-900">Layout Registered</h3>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-8">Master output layout updated.</p>
            <button onClick={() => { onDataExtracted({ flights: [], staff: [], shifts: [], programs: [], templateBinary: templateOnlySuccess }); setTemplateOnlySuccess(null); }} className="w-full py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl">SET MASTER</button>
          </div>
        </div>
      )}
    </div>
  );
};
