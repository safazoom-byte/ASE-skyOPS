import React, { useState } from 'react';
import { auth, supabase } from '../services/supabaseService';
import { Mail, ChevronRight, Loader2, ShieldCheck, AlertCircle, Settings, Shield } from 'lucide-react';
import { SkyOpsLogo } from './Logo';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = !!supabase;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) {
      setError("Cloud configuration missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables in Vercel.");
      return;
    }
    setLoading(true);
    setError(null);
    
    try {
      const { error: authError } = isLogin 
        ? await auth.signIn(email, password)
        : await auth.signUp(email, password);
        
      if (authError) throw authError;
      if (!isLogin) alert("Registration successful! You can now log in.");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Aesthetic Blue Glow Elements matching the logo energy */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-400/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-12">
           <div className="w-28 h-28 bg-[#020617] border-2 border-white/10 rounded-[3rem] flex items-center justify-center mx-auto shadow-2xl shadow-blue-600/20 mb-6 transition-transform hover:scale-105 relative group">
              <div className="absolute inset-0 bg-blue-600/10 blur-xl rounded-full group-hover:bg-blue-600/20 transition-all"></div>
              <SkyOpsLogo size={64} className="relative z-10" />
           </div>
           <h1 className="text-4xl font-black italic text-white uppercase tracking-tighter mb-2">SkyOPS <span className="text-blue-500 font-light">AI</span></h1>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Weekly Program Builder</p>
        </div>

        {!isConfigured && (
          <div className="mb-8 p-6 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex flex-col items-center gap-3 text-amber-500 text-center animate-in fade-in zoom-in-95">
            <Settings size={24} className="animate-spin" />
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest">Connection Config Required</p>
              <p className="text-[9px] font-bold text-slate-400">Environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be defined in Vercel settings for cloud sync.</p>
            </div>
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3.5rem] p-10 shadow-2xl">
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Terminal Email</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input 
                  type="email" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-white font-bold outline-none focus:ring-4 focus:ring-blue-600/20 transition-all disabled:opacity-50"
                  placeholder="name@station.aero"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={!isConfigured}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Cipher</label>
              <div className="relative">
                <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input 
                  type="password" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-white font-bold outline-none focus:ring-4 focus:ring-blue-600/20 transition-all disabled:opacity-50"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={!isConfigured}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-[10px] font-black uppercase italic animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || !isConfigured}
              className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[1.5rem] font-black uppercase italic tracking-[0.3em] shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (
                <> {isLogin ? 'Initialize Uplink' : 'Register Terminal'} <ChevronRight size={18} /> </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              disabled={!isConfigured}
              className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors disabled:opacity-30"
            >
              {isLogin ? 'Request New Station Access →' : 'Already Authorized? Login →'}
            </button>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-4">
           <ShieldCheck size={16} className="text-blue-500" />
           <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.5em]">AES-256 Cloud Encryption</span>
        </div>
      </div>
    </div>
  );
};
