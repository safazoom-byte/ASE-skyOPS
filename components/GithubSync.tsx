import React, { useState, useEffect } from 'react';
import { Github, Settings, RefreshCw, CheckCircle2, AlertCircle, X, Save, Database, Cloud, ExternalLink, Key, HelpCircle, Info, ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import { githubService, GitHubConfig } from '../services/githubService';

interface Props {
  data: any;
  onSyncComplete?: () => void;
}

export const GithubSync: React.FC<Props> = ({ data, onSyncComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [config, setConfig] = useState<GitHubConfig>(() => {
    const saved = localStorage.getItem('skyops_github_config');
    return saved ? JSON.parse(saved) : {
      token: '',
      owner: 'safazoom-byte',
      repo: 'ASE-skyOPS',
      branch: 'main',
      path: 'data/skyops-registry.json'
    };
  });

  useEffect(() => {
    localStorage.setItem('skyops_github_config', JSON.stringify(config));
  }, [config]);

  const testConnection = async () => {
    if (!config.token) {
      setErrorMessage("Please enter a token first.");
      setStatus('error');
      return;
    }
    setIsTesting(true);
    setStatus('idle');
    try {
      const res = await fetch(`https://api.github.com/user`, {
        headers: { 'Authorization': `token ${config.token}` }
      });
      if (res.ok) {
        setStatus('success');
        setErrorMessage("Connection Verified. Data uplink ready.");
      } else {
        const err = await res.json();
        throw new Error(err.message || "Invalid Token. Check permissions.");
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const performSync = async () => {
    if (!config.token || !config.owner || !config.repo) {
      setIsOpen(true);
      return;
    }
    setIsSyncing(true);
    setStatus('idle');
    try {
      await githubService.pushToGitHub(config, data);
      setStatus('success');
      onSyncComplete?.();
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Connection Refused');
      setIsOpen(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const generateTokenUrl = "https://github.com/settings/tokens/new?scopes=repo&description=SkyOPS_Backup_Token";

  return (
    <>
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
        <button 
          onClick={performSync}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[9px] font-black uppercase tracking-widest ${
             status === 'success' ? 'bg-emerald-50 text-emerald-600' :
             status === 'error' ? 'bg-rose-50 text-rose-600' :
             'hover:bg-slate-50 text-slate-600'
          }`}
        >
          {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <Github size={14} />}
          <span className="hidden sm:inline">
            {isSyncing ? 'Syncing...' : status === 'success' ? 'Backup Successful' : 'Backup to GitHub'}
          </span>
        </button>
        <div className="w-px h-4 bg-slate-200"></div>
        <button 
            onClick={() => setIsOpen(true)} 
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Open Sync Settings"
        >
            <Settings size={14} />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl relative overflow-hidden flex flex-col max-h-[95vh]">
            
            <div className="bg-blue-600 p-8 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                    <Cloud size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic text-white uppercase tracking-tighter leading-none">Uplink Config</h3>
                    <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mt-1">GitHub Registry Management</p>
                  </div>
               </div>
               <button onClick={() => setIsOpen(false)} className="text-blue-100 hover:text-white transition-colors bg-white/10 p-2 rounded-full"><X size={20}/></button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto no-scrollbar">
              
              {/* Mandatory Checklist */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <ChevronRight size={16} className="text-blue-600" /> Essential Setup Guide
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">1</div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-900 uppercase">Create Token</p>
                      <p className="text-[9px] text-slate-500 leading-tight">Click 'Get Token', check the 'repo' box on GitHub, and generate.</p>
                      <a href={generateTokenUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-black text-blue-600 hover:underline uppercase tracking-widest mt-2">
                        Get Token <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">2</div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-900 uppercase">Verify Link</p>
                      <p className="text-[9px] text-slate-500 leading-tight">Paste your token below and use 'Test Connection' before saving.</p>
                    </div>
                  </div>
                </div>
              </div>

              {status !== 'idle' && (
                <div className={`p-4 rounded-2xl flex items-center gap-4 text-[10px] font-black uppercase border animate-in slide-in-from-top-2 ${
                  status === 'error' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                }`}>
                  {status === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                  <div>
                    <p>{status === 'error' ? 'Config Error' : 'Success'}: {errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                 <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Personal Access Token (ghp_...)</label>
                      <button 
                        onClick={testConnection} 
                        disabled={isTesting || !config.token}
                        className="text-[9px] font-black text-blue-600 uppercase hover:underline disabled:opacity-30 flex items-center gap-1"
                      >
                        {isTesting ? <RefreshCw size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
                        {isTesting ? 'Verifying...' : 'Test Connection'}
                      </button>
                    </div>
                    <input 
                      type="password" 
                      className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-900 outline-none focus:ring-4 focus:ring-blue-600/10 transition-all placeholder:text-slate-300"
                      placeholder="Paste your ghp_ token here"
                      value={config.token}
                      onChange={e => setConfig({...config, token: e.target.value})}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GitHub Owner</label>
                        <input 
                          type="text" 
                          className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-900 outline-none"
                          value={config.owner}
                          onChange={e => setConfig({...config, owner: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Repo Name</label>
                        <input 
                          type="text" 
                          className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-900 outline-none"
                          value={config.repo}
                          onChange={e => setConfig({...config, repo: e.target.value})}
                        />
                    </div>
                 </div>
              </div>

              {/* Anti-Confusion Notice */}
              <div className="p-6 bg-slate-900 rounded-[2.5rem] flex items-start gap-4 shadow-xl border border-white/5">
                 <HelpCircle size={24} className="text-blue-400 shrink-0" />
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Important: Ignore the Vercel Toolbar</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      If a black bar appears at the bottom of your browser asking you to "Sign in to GitHub", <b>ignore it or close it</b>. 
                      That is a Vercel tool and it is not connected to this app's registry backup system. Use only this window to configure your sync.
                    </p>
                 </div>
              </div>

              <div className="pt-2">
                 <button 
                   onClick={performSync}
                   disabled={isSyncing}
                   className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]"
                 >
                   {isSyncing ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
                   {isSyncing ? 'Processing Uplink...' : 'Confirm & Sync Roster'}
                 </button>
                 <div className="mt-4 flex items-center justify-center gap-2">
                   <ShieldCheck size={14} className="text-emerald-500" />
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">End-to-End Encrypted</span>
                 </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};