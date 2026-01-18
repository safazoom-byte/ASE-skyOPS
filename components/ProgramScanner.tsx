
import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
import * as XLSX from 'xlsx';
import { FileUp, Sparkles, Database, AlertCircle, HelpCircle, Search, Clock, Activity, Users, ListFilter } from 'lucide-react';

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
  const [detectedRowCount, setDetectedRowCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const phases = [
    "Analyzing cell structure...",
    "Executing Flash-mapping...",
    "Stabilizing JSON stream...",
    "Reconstructing registry...",
    "Balancing data integrity...",
    "Finalizing import..."
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      interval = setInterval(() => {
        setScanPhase(prev => (prev + 1) % phases.length);
      }, 1000);
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
    setDetectedRowCount(0);
    
    try {
      let combinedTextData = '';
      let mediaParts: ExtractionMedia[] = [];
      let totalRows = 0;

      for (const file of files) {
        const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');
        
        const base64 = await fileToBase64(file);

        if (isExcel) {
          const workbook = XLSX.read(base64, { type: 'base64' });
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            const rowCount = csv.split('\n').filter(r => r.trim()).length;
            totalRows += rowCount;
            combinedTextData += `### FILE: ${file.name} | SHEET: ${sheetName} ###\n` + csv + '\n\n';
          });
        } else if (isPdf) {
          mediaParts.push({ data: base64, mimeType: 'application/pdf' });
        } else if (isImage) {
          mediaParts.push({ data: base64, mimeType: file.type });
        }
      }

      setDetectedRowCount(totalRows);

      const data = await extractDataFromContent({ 
        textData: combinedTextData || undefined, 
        media: mediaParts.length > 0 ? mediaParts : undefined,
        startDate: startDate
      });

      if (data && (data.flights?.length > 0 || data.staff?.length > 0)) {
        setExtractedData(data);
      } else {
        throw { 
          title: "Import Error", 
          message: "The data mapping failed to produce a valid registry. Check if the headers like 'Name' or 'Flight' are present."
        };
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Registry Sync Failed",
        message: error.message || "High-volume data caused a structural conflict. Try splitting the file or ensuring headers are clear."
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative">
      {isScanning && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-6 text-center">
          <div className="space-y-12 max-w-md">
            <div className="relative mx-auto w-24 h-24">
               <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse rounded-full"></div>
               <Search className="relative mx-auto text-blue-400 animate-bounce" size={64} />
            </div>
            <div className="space-y-4">
              <h3 className="text-white text-3xl font-black uppercase italic tracking-tighter leading-none">{phases[scanPhase]}</h3>
              <p className="text-blue-400/60 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Flash-Optimized Data Stream</p>
            </div>
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10">
               <div 
                 className="h-full bg-blue-500 transition-all duration-1000 ease-in-out" 
                 style={{ width: `${((scanPhase + 1) / phases.length) * 100}%` }}
               ></div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-slate-700 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 blur-[120px] pointer-events-none group-hover:bg-blue-500/15 transition-all duration-1000"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <div className="flex items-center gap-3 mb-4 justify-center lg:justify-start">
               <div className="px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest text-blue-400">
                 Registry Data Import v3.5
               </div>
            </div>
            <h3 className="text-3xl font-black mb-4 tracking-tight italic uppercase leading-none">External Data Registry</h3>
            <p className="text-slate-400 text-xs max-w-xl font-medium leading-relaxed italic">
              Flash-Optimized import for <span className="text-white font-bold">Large Staff Lists</span>. 
              Self-healing JSON recovery for truncated spreadsheets up to 1000+ rows.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <input type="file" multiple accept="image/*,.xlsx,.xls,.csv,.pdf,.json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase flex items-center gap-4 shadow-2xl shadow-blue-600/30 transition-all active:scale-95 group/btn"
            >
              <FileUp size={20} className="group-hover/btn:-translate-y-1 transition-transform" /> IMPORT REGISTRY DATA
            </button>
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
            <button onClick={() => setScanError(null)} className="p-4 text-rose-400 font-black hover:text-white transition-colors">&times;</button>
          </div>
        )}
      </div>

      {extractedData && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl">
          <div className="bg-white rounded-[4rem] shadow-2xl max-w-2xl w-full p-12 lg:p-16 text-center animate-in zoom-in-95 duration-300">
              <div className="w-24 h-24 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-inner border border-emerald-100">
                <Database size={48} className="text-emerald-500" />
              </div>
              <h3 className="text-3xl font-black italic uppercase mb-4 text-slate-950 tracking-tighter">Registry Processed</h3>
              <p className="text-slate-400 text-sm font-medium mb-12">The system has mapped your data into the station registry. Self-healing logic applied to recover truncated rows.</p>
              
              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 group hover:border-blue-200 transition-all">
                  <Activity size={20} className="mx-auto mb-4 text-blue-400" />
                  <div className="text-4xl font-black text-slate-900 italic leading-none mb-2">{extractedData.flights?.length || 0}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">FLIGHT SERVICES</div>
                </div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 group hover:border-emerald-200 transition-all">
                  <Users size={20} className="mx-auto mb-4 text-emerald-400" />
                  <div className="text-4xl font-black text-slate-900 italic leading-none mb-2">{extractedData.staff?.length || 0}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PERSONNEL ENTRIES</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-6 text-[11px] font-black uppercase text-slate-400 tracking-widest italic">Abort Import</button>
                <button 
                  onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} 
                  className="flex-[2] py-6 bg-slate-950 text-white rounded-[2rem] text-xs font-black uppercase italic tracking-[0.3em] shadow-2xl shadow-slate-950/20 hover:bg-emerald-600 transition-all active:scale-95"
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
