import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { DailyProgram, Staff, Flight } from '../types';

interface Props {
  programs: DailyProgram[];
  staff: Staff[];
  flights: Flight[];
}

export const LiveAssistant: React.FC<Props> = ({ programs, staff, flights }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState<{user: string, ai: string}>({ user: '', ai: '' });
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Audio Processing Helpers
  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const stopAssistant = () => {
    if (sessionRef.current) {
      sessionRef.current.close?.();
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsActive(false);
    setIsConnecting(false);
  };

  const startAssistant = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              setTranscription(prev => ({ ...prev, ai: prev.ai + msg.serverContent!.outputTranscription!.text }));
            } else if (msg.serverContent?.inputTranscription) {
              setTranscription(prev => ({ ...prev, user: prev.user + msg.serverContent!.inputTranscription!.text }));
            }

            if (msg.serverContent?.turnComplete) {
              setTranscription({ user: '', ai: '' });
            }

            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error("Live API Error:", e);
            setError("Connection disrupted. Please try again.");
            stopAssistant();
          },
          onclose: () => stopAssistant()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are the HMB SkyOPS Station Assistant. 
          Respond with natural, brief aviation-style updates. 
          STATION PROGRAM DATA: ${JSON.stringify(programs.slice(0, 3))}... 
          STAFF DATA: ${JSON.stringify(staff.map(s => ({n: s.name, i: s.initials, r: s.skillRatings})))}
          Be precise about flight numbers and staff initials. Help the manager verify station readiness.`
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      setError("Could not access microphone or initiate connection.");
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="relative">
        <div className={`absolute -inset-8 bg-blue-500/20 rounded-full blur-3xl transition-opacity duration-1000 ${isActive ? 'opacity-100 animate-pulse' : 'opacity-0'}`}></div>
        <div className={`w-48 h-48 rounded-[3rem] bg-slate-900 flex items-center justify-center relative z-10 border-4 transition-all duration-500 ${isActive ? 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.5)] scale-110' : 'border-slate-800 shadow-xl'}`}>
          {isActive ? (
            <div className="flex items-end gap-1.5 h-12">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-2 bg-blue-400 rounded-full animate-wave" style={{ animationDelay: `${i * 0.1}s`, height: '20%' }}></div>
              ))}
            </div>
          ) : (
            <svg className={`w-16 h-16 ${isConnecting ? 'text-slate-700' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>
      </div>

      <div className="text-center space-y-4 max-w-md px-6">
        <h2 className="text-2xl font-black uppercase italic text-slate-900 tracking-tighter">
          {isActive ? 'Operations Live' : isConnecting ? 'Establishing Link...' : 'Voice Operations'}
        </h2>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest leading-relaxed">
          {isActive ? 'Speak naturally to query assignments or flight status.' : 'Link with the AI Station Manager for hands-free coordination.'}
        </p>
      </div>

      {(transcription.user || transcription.ai) && (
        <div className="w-full max-w-lg space-y-4 px-6">
          {transcription.user && (
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm animate-in slide-in-from-left duration-300">
              <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block mb-1">Manager</span>
              <p className="text-sm font-medium text-slate-700 italic">"{transcription.user}"</p>
            </div>
          )}
          {transcription.ai && (
            <div className="bg-slate-900 p-4 rounded-2xl shadow-xl animate-in slide-in-from-right duration-300 ml-auto max-w-[90%]">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">SkyOPS Assistant</span>
              <p className="text-sm font-medium text-white italic">"{transcription.ai}"</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-6 py-3 rounded-xl border border-red-100 text-[10px] font-black uppercase tracking-widest">
          {error}
        </div>
      )}

      <button
        onClick={isActive ? stopAssistant : startAssistant}
        disabled={isConnecting}
        className={`px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95 ${
          isActive 
            ? 'bg-red-600 text-white hover:bg-red-500' 
            : isConnecting 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
              : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        {isActive ? 'Terminate Session' : isConnecting ? 'Initializing...' : 'Engage Voice Control'}
      </button>
    </div>
  );
};
