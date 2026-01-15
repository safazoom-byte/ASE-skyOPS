
import React, { useState, useRef, useEffect } from 'react';
import { modifyProgramWithAI, ExtractionMedia } from '../services/geminiService';
import { ProgramData, DailyProgram } from '../types';
import { X, Send, MessageSquare, Sparkles, Check, RotateCcw, HelpCircle, AlertCircle, Paperclip, FileText } from 'lucide-react';

interface Props {
  data: ProgramData;
  onUpdate: (updatedPrograms: DailyProgram[]) => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  type?: 'standard' | 'pending' | 'error' | 'clarification';
  suggestedPhrases?: string[];
  hasAttachment?: boolean;
}

export const ProgramChat: React.FC<Props> = ({ data, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '1', 
      text: "Operational AI Active. Describe your roster changes (e.g., 'Swap AH with MZ on Friday') and I'll propose a sequence.", 
      sender: 'ai', 
      timestamp: new Date() 
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<DailyProgram[] | null>(null);
  const [lastInstruction, setLastInstruction] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isProcessing]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSend = async (instructionOverride?: string) => {
    const instruction = (instructionOverride || input).trim();
    if (!instruction && attachedFiles.length === 0) return;
    if (isProcessing) return;

    if (!instructionOverride) {
      const userMsg: Message = { 
        id: Date.now().toString(), 
        text: instruction || "Analyze attached document(s) for roster refinement...", 
        sender: 'user', 
        timestamp: new Date(),
        hasAttachment: attachedFiles.length > 0
      };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
    }
    
    setLastInstruction(instruction);
    setIsProcessing(true);
    setPendingUpdate(null);

    try {
      let media: ExtractionMedia[] = [];
      if (attachedFiles.length > 0) {
        media = await Promise.all(attachedFiles.map(async f => ({
          data: await fileToBase64(f),
          mimeType: f.type || 'application/octet-stream'
        })));
      }

      const result = await modifyProgramWithAI(instruction, data, media);
      
      // Detection for "No Changes Made" - check if program data is identical
      const isIdentical = JSON.stringify(result.programs) === JSON.stringify(data.programs);
      
      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: result.explanation || (isIdentical ? "I couldn't identify any logical changes to make based on your input. Could you please provide a better explanation or more specific instructions?" : "Refinement processed. Review the sequence below."), 
        sender: 'ai', 
        timestamp: new Date(),
        type: isIdentical ? 'clarification' : 'pending'
      };
      
      if (!isIdentical) {
        setPendingUpdate(result.programs);
      }
      
      setMessages(prev => [...prev, aiMsg]);
      setAttachedFiles([]);
    } catch (error: any) {
      const errorMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: `Operation failed: ${error.message || "Logic conflict detected. Could you rephrase your request?"}`, 
        sender: 'ai', 
        timestamp: new Date(),
        type: 'error',
        suggestedPhrases: [
          "Swap staff [Initials] with [Initials] on [Day]",
          "Remove staff [Initials] from flight [FlightNo]",
          "Use the attached file to update the roster"
        ]
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles(Array.from(e.target.files));
    }
  };

  const applyChanges = () => {
    if (pendingUpdate) {
      onUpdate(pendingUpdate);
      setPendingUpdate(null);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Program synchronized successfully. Iterative refinement live.",
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
  };

  const discardChanges = () => {
    setPendingUpdate(null);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: "Proposed sequence discarded. Operational state maintained.",
      sender: 'ai',
      timestamp: new Date()
    }]);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-[50] w-14 h-14 bg-slate-950 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all border-2 border-white/10 ${isOpen ? 'opacity-0' : 'opacity-100'}`}
      >
        <MessageSquare size={20} />
      </button>

      <div className={`fixed inset-y-0 right-0 z-[100] w-full md:w-[400px] bg-white shadow-2xl transition-transform duration-500 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-slate-100`}>
        <div className="flex items-center justify-between p-4 bg-slate-950 text-white">
          <div className="flex items-center gap-3">
            <Sparkles size={16} className="text-blue-400" />
            <div>
              <h4 className="text-xs font-black uppercase italic tracking-tighter leading-none">AI Refiner</h4>
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mt-1">Iterative Modeling</span>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 no-scrollbar">
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            return (
              <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
                  m.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 
                  m.type === 'error' || m.type === 'clarification' ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-tl-none' :
                  'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                }`}>
                  {(m.type === 'error' || m.type === 'clarification') && <AlertCircle size={14} className="mb-2 text-amber-600" />}
                  {m.hasAttachment && (
                    <div className="mb-2 flex items-center gap-2 px-2 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest">
                      <Paperclip size={10} /> Attachment Sent
                    </div>
                  )}
                  {m.text}

                  {m.type === 'pending' && isLast && pendingUpdate && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                      <button onClick={applyChanges} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 hover:bg-emerald-500 shadow-sm transition-all active:scale-95">
                        <Check size={12}/> Confirm Changes
                      </button>
                      <button onClick={discardChanges} className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95">
                        Discard
                      </button>
                    </div>
                  )}

                  {(m.type === 'error' || m.type === 'clarification') && isLast && (
                    <div className="mt-4 space-y-4">
                      <div className="p-3 bg-white/50 rounded-xl border border-amber-100">
                        <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <HelpCircle size={10} /> Clarification Tips
                        </p>
                        <p className="text-[10px] text-amber-800 italic">
                          "Swap [Person A] with [Person B] on [Day]" works best. If using a file, mention what to look for (e.g., 'Update roster from the schedule image').
                        </p>
                      </div>

                      <button onClick={() => handleSend(lastInstruction)} className="w-full py-2.5 bg-slate-950 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 shadow-md transition-all active:scale-95">
                        <RotateCcw size={12}/> Retry Last Instruction
                      </button>

                      {m.suggestedPhrases && (
                        <div className="pt-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase block mb-2 tracking-widest">Example Requests:</span>
                          <div className="space-y-1.5">
                            {m.suggestedPhrases.map((phrase, i) => (
                              <button key={i} onClick={() => setInput(phrase)} className="w-full text-left p-2.5 bg-white/70 border border-amber-100/30 rounded-lg text-[10px] font-medium italic hover:bg-white transition-all">"{phrase}"</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <span className={`text-[7px] font-black uppercase mt-2 block opacity-40 ${m.sender === 'user' ? 'text-white' : 'text-slate-400'}`}>
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none flex gap-1 animate-pulse">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
              </div>
            </div>
          )}
        </div>

        {attachedFiles.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
            {attachedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100 text-[10px] font-black uppercase">
                <FileText size={12} /> {f.name.substring(0, 15)}...
                <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 text-indigo-300 hover:text-indigo-600 font-black">&times;</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 bg-white border-t border-slate-100">
          <div className="flex gap-2">
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf" />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${attachedFiles.length > 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
              title="Attach operational document"
            >
              <Paperclip size={18} />
            </button>
            <input 
              type="text" 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-xs"
              placeholder="Operational request..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              type="submit" disabled={isProcessing || (!input.trim() && attachedFiles.length === 0)}
              className="w-12 h-12 bg-slate-950 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 disabled:opacity-30 transition-all shrink-0 shadow-lg"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
