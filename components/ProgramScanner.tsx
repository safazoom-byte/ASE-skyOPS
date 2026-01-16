import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
import * as XLSX from 'xlsx';
import { FileUp, Sparkles, Database, AlertCircle, HelpCircle, Search, Clock, FileType } from 'lucide-react';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs?: DailyProgram[] }) => void;
  startDate?: string;
  numDays?: number;
}

interface ScanError {
  title: string;
  message: string;
  suggestion?: string;
}

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, startDate, numDays = 7 }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(0);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], programs: DailyProgram[] } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const phases = [
    "Initializing Station Scanner...",
    "Decoding Document Geometry...",
    "Extracting Flight Service Numbers...",
    "Parsing STA/STD Timeframes...",
    "Compiling Personnel Skillsets...",
    "Validating Operational Constraints..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase(prev => (prev + 1) % phases.length);
      }, 1500);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    
    try {
      let combinedTextData = '';
      let mediaParts: ExtractionMedia[] = [];

      for (const file of files) {
        const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');
        
        const base64 = await fileToBase64(file);

        if (isExcel) {
          const workbook = XLSX.read(base64, { type: 'base64' });
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            combinedTextData += `### SOURCE: ${file.name} | TAB: ${sheetName} ###\n` + XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
          });
        } else if (isPdf) {
          mediaParts.push({ data: base64, mimeType: 'application/pdf' });
        } else if (isImage) {
          mediaParts.push({ data: base64, mimeType: file.type });
        }
      }

      const data = await extractDataFromContent({ 
        textData: combinedTextData || undefined, 
        media: mediaParts.length > 0 ? mediaParts : undefined,
        startDate: startDate
      });

      if (data && (data.flights?.length > 0 || data.staff?.length > 0)) {
        setExtractedData(data);
      } else {
        throw new Error("Analysis completed but no recognizable aviation data was identified. Check document clarity.");
      }
    } catch (error: any) {
      setScanError({
        title: "Extraction Failed",
        message: error.message || "Deep scanning error."
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative">
      {isScanning && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-6 text-center">
          <div className="space-y-12 max-w-sm">
            <div className="relative">
              <Search className="mx-auto text-blue-500 animate-pulse" size={64} />
              <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
            </div>
            <div className="space-y-4">
              <h3 className="text-white text-2xl font-black uppercase italic tracking-tighter">{phases[scanPhase]}</h3>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">AI Deep Scanning Active</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-8 lg:p-12 rounded-[3.5rem] border border-slate-700/50 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] pointer-events-none group-hover:bg-blue-500/10 transition-all duration-1000"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-blue-600/10 rounded-xl border border-blue-500/20 mb-6">
              <FileType size={14} className="text-blue-400" />
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Multi-format Extractor</span>
            </div>
            <h3 className="text-3xl font-black mb-4 tracking-tighter italic uppercase leading-none">Intelligence Scanner</h3>
            <p className="text-slate-400 text-xs max-w-xl font-bold leading-relaxed uppercase tracking-wide">
              Upload <span className="text-blue-400">PDFs, Images, or Excel</span> schedules. The AI will automatically map <span className="text-white">Flights</span>, <span className="text-white">Personnel</span>, and <span className="text-white">Contract Durations</span>.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <input type="file" multiple accept="image/*,.xlsx,.xls,.csv,.pdf,.json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="w-full lg:w-auto px-10 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 shadow-2xl shadow-blue-600/20 transition-all active:scale-95"
            >
              <FileUp size={20} /> START DEEP SCAN
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mt-10 p-6 bg-rose-500/10 border border-rose-500/30 rounded-[2.5rem] flex items-center justify-between animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-4">
              <AlertCircle size={20} className="text-rose-500" />
              <p className="text-[10px] text-rose-200/80 font-black uppercase tracking-widest">{scanError.message}</p>
            </div>
            <button onClick={() => setScanError(null)} className="p-2 text-rose-400 font-black text-xl hover:text-white">&times;</button>
          </div>
        )}
      </div>

      {extractedData && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl">
          <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full p-12 lg:p-16 text-center border border-slate-100">
              <div className="w-24 h-24 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-sm border border-emerald-100">
                <Database size={48} className="text-emerald-500" />
              </div>
              <h3 className="text-3xl font-black italic uppercase mb-4 text-slate-950 tracking-tighter">Extraction Verified</h3>
              <p className="text-slate-400 text-sm font-medium mb-12">The AI has successfully mapped your station data. Review the summary before committing to the live registry.</p>
              
              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:scale-105">
                  <div className="text-5xl font-black text-blue-600 tracking-tighter italic mb-2">{extractedData.flights?.length || 0}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Flights Mapped</div>
                </div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:scale-105">
                  <div className="text-5xl font-black text-emerald-600 tracking-tighter italic mb-2">{extractedData.staff?.length || 0}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Staff Identified</div>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 tracking-widest">Discard Logic</button>
                <button 
                  onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} 
                  className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all"
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