import React, { useState, useRef, useEffect } from 'react';
import { modifyProgramWithAI, ExtractionMedia } from '../services/geminiService';
import { ProgramData, DailyProgram } from '../types';
import { X, Send, MessageSquare, Sparkles, Check, RotateCcw, HelpCircle, AlertCircle, Paperclip, FileText } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  type?: 'standard' | 'pending' | 'error' | 'clarification';
  suggestedPhrases?: string[];
  hasAttachment?: boolean;
}

interface Props {
  data: ProgramData;
  onUpdate: (updatedPrograms: DailyProgram[]) => void;
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
      
      if (!result) {
        throw new Error("AI returned no response or invalid JSON.");
      }

      const isIdentical = JSON.stringify(result.programs) === JSON.stringify(data.programs);
      
      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: result.explanation || (isIdentical ? "I couldn't identify any logical changes to make based on your input." : "Refinement processed. Review the sequence below."), 
        sender: 'ai', 
        timestamp: new Date(),
        type: isIdentical ? 'clarification' : 'pending'
      };
      
      if (!isIdentical && result.programs) {
        setPendingUpdate(result.programs);
      }
      
      setMessages(prev => [...prev, aiMsg]);
      setAttachedFiles([]);
    } catch (error: any) {
      const errorMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: `Operation failed: ${error.message || "Logic conflict detected."}`, 
        sender: 'ai', 
        timestamp: new Date(),
        type: 'error'
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
        text: "Program synchronized successfully.",
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
  };

  const discardChanges = () => {
    setPendingUpdate(null);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: "Proposed sequence discarded.",
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
            <h4 className="text-xs font-black uppercase italic tracking-tighter">AI Refiner</h4>
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
                  'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                }`}>
                  {m.text}

                  {m.type === 'pending' && isLast && pendingUpdate && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                      <button onClick={applyChanges} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 hover:bg-emerald-500">
                        <Check size={12}/> Confirm
                      </button>
                      <button onClick={discardChanges} className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-200">
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 p-3 rounded-2xl flex gap-1 animate-pulse">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 bg-white border-t border-slate-100">
          <div className="flex gap-2">
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf" />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${attachedFiles.length > 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}
            >
              <Paperclip size={18} />
            </button>
            <input 
              type="text" 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs"
              placeholder="Refinement request..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              type="submit" disabled={isProcessing || (!input.trim() && attachedFiles.length === 0)}
              className="w-12 h-12 bg-slate-950 text-white rounded-xl flex items-center justify-center disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </>
  );
};