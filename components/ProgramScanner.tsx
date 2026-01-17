import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig, DailyProgram } from '../types';
import * as XLSX from 'xlsx';
import { FileUp, Sparkles, Database, AlertCircle, HelpCircle, Search, Clock } from 'lucide-react';

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
    "Initializing Neural Scanner...",
    "Decoding Spatial Layout...",
    "Scanning Flight Patterns...",
    "Analyzing Station Timings...",
    "Mapping Man Power Registry...",
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
            combinedTextData += `### FILE: ${file.name} | SHEET: ${sheetName} ###\n` + XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
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
        throw { 
          title: "Analysis Timeout", 
          message: "Deep scanning was unable to find recognizable flight patterns or man power identifiers."
        };
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Extraction Failed",
        message: error.message || "Unexpected analysis error."
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const outOfRangeFlights = (extractedData?.flights || []).filter(f => f.day < 0 || f.day >= numDays);

  return (
    <div className="relative">
      {isScanning && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-6 text-center">
          <div className="space-y-10 max-w-sm">
            <Search className="mx-auto text-blue-400 animate-pulse" size={48} />
            <h3 className="text-white text-2xl font-black uppercase italic tracking-tighter">{phases[scanPhase]}</h3>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-8 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 blur-[120px] pointer-events-none group-hover:bg-blue-500/20 transition-all duration-1000"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <h3 className="text-2xl font-black mb-3 tracking-tight italic uppercase">Master Operational Scan</h3>
            <p className="text-slate-400 text-xs max-w-xl font-medium leading-relaxed">
              Upload <span className="text-blue-400 font-black">flight schedules</span> or <span className="text-blue-400 font-black">man power lists</span>. 
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <input type="file" multiple accept="image/*,.xlsx,.xls,.csv,.pdf,.json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-3 shadow-xl shadow-blue-600/20"
            >
              <FileUp size={18} /> DEEP SCAN DATA
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mt-8 p-6 bg-rose-500/10 border border-rose-500/30 rounded-[2rem] flex items-center justify-between">
            <p className="text-[10px] text-rose-200/80 font-medium">{scanError.message}</p>
            <button onClick={() => setScanError(null)} className="p-3 text-rose-400 font-black">&times;</button>
          </div>
        )}
      </div>

      {extractedData && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full p-10 lg:p-14 text-center">
              <Database size={48} className="mx-auto text-emerald-500 mb-8" />
              <h3 className="text-2xl font-black italic uppercase mb-8 text-slate-950 tracking-tighter">Sync Extracted Logic</h3>
              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-slate-50 p-5 rounded-3xl border">
                  <div className="text-3xl font-black text-blue-600">{extractedData.flights?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase">Flights</div>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border">
                  <div className="text-3xl font-black text-emerald-600">{extractedData.staff?.length || 0}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase">Staff</div>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-5 text-[10px] font-black uppercase text-slate-400">Discard</button>
                <button onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase italic shadow-2xl">COMMIT TO CORE</button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};