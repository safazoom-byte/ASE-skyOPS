
import React, { useState, useRef, useMemo } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
import * as XLSX from 'xlsx';
import { Loader2, FileUp, Sparkles, Database, AlertCircle, Info } from 'lucide-react';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[], templateBinary?: string }) => void;
  templateBinary: string | null;
  startDate: string;
  numDays: number;
}

interface ScanError {
  title: string;
  message: string;
}

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, templateBinary, startDate, numDays }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[], templateBinary?: string } | null>(null);
  const [templateOnlySuccess, setTemplateOnlySuccess] = useState<string | null>(null);
  const [useAsTemplate, setUseAsTemplate] = useState(false);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        if (data && ((data.flights?.length || 0) > 0 || (data.staff?.length || 0) > 0 || (data.shifts?.length || 0) > 0 || (data.programs?.length || 0) > 0)) {
          setExtractedData(data);
        } else {
          throw { title: "Extraction Failed", message: "AI Analysis did not yield usable ground handling data from these sources." };
        }
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Extraction Error",
        message: error.message || "An unexpected error occurred during AI analysis."
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
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 text-center">
          <div className="space-y-8 max-w-sm">
            <div className="relative inline-block">
              <div className="w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400" size={32} />
            </div>
            <div className="space-y-3">
              <h3 className="text-white text-2xl font-black uppercase italic tracking-tighter">AI Station Scanner</h3>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.2em] leading-relaxed">
                Rebuilding operational state from documents. This ensures logical mapping to your Target Window.
              </p>
              <div className="pt-4 flex items-center justify-center gap-2 text-blue-500 font-black text-[9px] uppercase tracking-widest">
                <Loader2 size={12} className="animate-spin" />
                Synchronizing Logistics...
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-8 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 blur-[120px] pointer-events-none group-hover:bg-blue-500/20 transition-all duration-1000"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <h3 className="text-2xl lg:text-3xl font-black mb-3 tracking-tight italic uppercase">Import Operational Core</h3>
            <p className="text-slate-400 text-xs lg:text-sm max-w-xl font-medium leading-relaxed">
              Scan existing <span className="text-blue-400 font-black">schedules (PDF/Img)</span> or <span className="text-blue-400 font-black">Excel rosters</span>. 
              The system will map services relative to <span className="text-indigo-400 underline">{startDate}</span>.
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
              {useAsTemplate ? 'SET MASTER TEMPLATE' : 'SCAN OPERATION DATA'}
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mt-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
            <div className="flex-1">
              <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest">{scanError.title}</h4>
              <p className="text-[9px] text-red-200/70">{scanError.message}</p>
            </div>
            <button onClick={() => setScanError(null)} className="text-red-400 p-2">&times;</button>
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
              <h3 className="text-2xl font-black italic uppercase mb-8 text-slate-950 tracking-tighter">Operational Logic Ready</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="text-3xl font-black text-blue-600 mb-1">{extractedData.flights?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Flights Found</div>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="text-3xl font-black text-emerald-600 mb-1">{extractedData.staff?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Staff Found</div>
                </div>
              </div>

              {outOfRangeFlights.length > 0 && (
                <div className="mb-10 p-6 bg-amber-50 border border-amber-200 rounded-[2rem] text-left flex items-start gap-4">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-1">Range Alert Detected</h4>
                    <p className="text-[9px] text-amber-700 font-medium leading-relaxed">
                      AI identified <span className="font-black">{outOfRangeFlights.length} flight(s)</span> outside your {numDays}-day program window starting {startDate}.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Abort</button>
                <button onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} className="flex-[2] py-5 px-8 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 italic">INTEGRATE SCHEDULE</button>
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
