
import React, { useState, useRef, useEffect } from 'react';
import { modifyProgramWithAI } from '../services/geminiService';
import { ProgramData, DailyProgram } from '../types';

interface Props {
  data: ProgramData;
  onUpdate: (updatedPrograms: DailyProgram[]) => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export const ProgramChat: React.FC<Props> = ({ data, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hello! I can help you modify the generated program. For example, 'Swap Joe and Mary on Monday' or 'Remove the Shift Leader from SM492'. What would you like to change?", sender: 'ai', timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    const instruction = input;
    setInput('');
    setIsProcessing(true);

    try {
      const updatedPrograms = await modifyProgramWithAI(instruction, data);
      onUpdate(updatedPrograms);
      
      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: "Changes applied successfully. The operational view has been updated.", 
        sender: 'ai', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error: any) {
      const errorMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: `Error: ${error.message || "Could not apply changes."}`, 
        sender: 'ai', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-8 z-[60] w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all border-4 border-white"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <div className="relative">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-ping"></div>
          </div>
        )}
      </button>

      {/* Chat Sidebar/Panel */}
      <div className={`fixed inset-y-0 right-0 z-[55] w-full md:w-96 bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] transition-transform duration-500 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-slate-100 flex flex-col`}>
        <div className="p-8 bg-slate-900 text-white">
          <h4 className="text-xl font-black uppercase italic tracking-tighter">Program Intelligence</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Natural Language Schedule Adjustment</p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${m.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                <p className="font-medium leading-relaxed">{m.text}</p>
                <span className={`text-[8px] font-black uppercase mt-2 block opacity-50 ${m.sender === 'user' ? 'text-white' : 'text-slate-400'}`}>
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl rounded-tl-none flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-75"></div>
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-6 border-t border-slate-50 bg-slate-50/50">
          <div className="relative">
            <input 
              type="text" 
              className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-sm placeholder:text-slate-300 transition-all"
              placeholder="Type your changes..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              type="submit"
              disabled={isProcessing || !input.trim()}
              className="absolute right-2 top-2 w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
            </button>
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-3 text-center">AI understands conversational scheduling requests</p>
        </form>
      </div>
    </>
  );
};
