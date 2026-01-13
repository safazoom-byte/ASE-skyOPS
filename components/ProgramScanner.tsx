
import React, { useState, useRef } from 'react';
import { extractDataFromContent, ExtractionMedia } from '../services/geminiService';
import { Flight, Staff, ShiftConfig } from '../types';
import * as XLSX from 'xlsx';

interface Props {
  onDataExtracted: (data: { flights: Flight[], staff: Staff[], shifts: ShiftConfig[], templateBinary?: string }) => void;
  templateBinary: string | null;
}

interface ScanError {
  title: string;
  message: string;
  type: 'format' | 'corrupted' | 'ai' | 'unknown';
}

export const ProgramScanner: React.FC<Props> = ({ onDataExtracted, templateBinary }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [extractedData, setExtractedData] = useState<{ flights: Flight[], staff: Staff[], shifts: ShiftConfig[], templateBinary?: string } | null>(null);
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
      let templateMimeType: string | undefined;

      for (const file of files) {
        const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');

        const base64 = await fileToBase64(file);

        if (useAsTemplate) {
          lastTemplateBase64 = base64;
          templateMimeType = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break; 
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
        const finalBinary = templateMimeType === 'application/pdf' ? `pdf:${lastTemplateBase64}` : lastTemplateBase64;
        setTemplateOnlySuccess(finalBinary);
      } else {
        const data = await extractDataFromContent({ 
          textData: combinedTextData || undefined, 
          media: mediaParts.length > 0 ? mediaParts : undefined
        });

        if (data && (data.flights.length > 0 || data.staff.length > 0 || data.shifts.length > 0)) {
          setExtractedData({
            flights: data.flights,
            staff: data.staff,
            shifts: data.shifts
          });
        } else {
          throw { title: "No Data Found", message: "AI could not find operational data in these files.", type: 'ai' };
        }
      }
    } catch (error: any) {
      setScanError({
        title: error.title || "Processing Failed",
        message: error.message || "An unexpected error occurred during document analysis.",
        type: 'unknown'
      });
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const finalizeTemplateUpload = () => {
    if (templateOnlySuccess) {
      onDataExtracted({ flights: [], staff: [], shifts: [], templateBinary: templateOnlySuccess });
      setTemplateOnlySuccess(null);
      setUseAsTemplate(false);
    }
  };

  return (
    <div className="relative">
      <div className="bg-slate-900 text-white p-8 rounded-3xl border border-slate-700 shadow-2xl mb-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 blur-[120px] pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <h3 className="text-3xl font-black mb-3 tracking-tight italic uppercase">Upload Documents</h3>
            <p className="text-slate-400 text-sm max-w-xl font-medium leading-relaxed">
              Scan schedules or duty lists. SkyOPS AI will extract flights, personnel, and shift configurations automatically.
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-6">
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all ${useAsTemplate ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/50 border-white/5'}`}>
              <input 
                type="checkbox" 
                id="template-toggle" 
                checked={useAsTemplate} 
                onChange={(e) => setUseAsTemplate(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
              />
              <label htmlFor="template-toggle" className={`text-[11px] font-black uppercase tracking-widest cursor-pointer ${useAsTemplate ? 'text-blue-400' : 'text-slate-400'}`}>
                Use as Output Template
              </label>
            </div>
            
            <input type="file" multiple={!useAsTemplate} accept="image/*,.xlsx,.xls,.csv,.pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className={`px-10 py-5 ${useAsTemplate ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'} text-white rounded-2xl font-black text-sm transition-all flex items-center gap-4 shadow-2xl active:scale-95`}
            >
              {isScanning ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {useAsTemplate ? 'Binding Template...' : 'Analyzing Files...'}</>
              ) : (
                useAsTemplate ? 'UPLOAD MASTER TEMPLATE' : 'SCAN STATION DOCUMENTS'
              )}
            </button>
          </div>
        </div>

        {scanError && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
            <div className="flex-1">
              <h4 className="text-xs font-black text-red-400 uppercase tracking-widest">{scanError.title}</h4>
              <p className="text-[10px] text-red-200/70">{scanError.message}</p>
            </div>
            <button onClick={() => setScanError(null)} className="text-red-400 p-2">&times;</button>
          </div>
        )}
      </div>

      {extractedData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-lg animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-xl w-full overflow-hidden">
            <div className="p-10 text-center">
              <h3 className="text-2xl font-black italic uppercase mb-6 text-slate-900 tracking-tighter">Operational Discovery</h3>
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="text-3xl font-black text-blue-600 mb-2">{extractedData.flights.length}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Flights</div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="text-3xl font-black text-emerald-600 mb-2">{extractedData.staff.length}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Personnel</div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="text-3xl font-black text-indigo-600 mb-2">{extractedData.shifts.length}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Shifts</div>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setExtractedData(null)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400">Cancel</button>
                <button onClick={() => { onDataExtracted(extractedData); setExtractedData(null); }} className="flex-[2] py-4 px-8 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl">Commit to Station</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {templateOnlySuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-lg animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-black italic uppercase mb-2 text-slate-900">Template Armed</h3>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest mb-8 leading-relaxed">
                Your custom layout has been registered.
              </p>
              <button onClick={finalizeTemplateUpload} className="w-full py-5 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20">Set as Master Layout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
