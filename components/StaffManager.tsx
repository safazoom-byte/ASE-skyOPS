
import React, { useState } from 'react';
import { Staff, Skill, StaffCategory } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import * as XLSX from 'xlsx';
import { 
  Users,
  Edit2, 
  Trash2, 
  FileSpreadsheet,
  User,
  Fingerprint,
  Plus,
  Eraser,
  ShieldCheck,
  Sparkles,
  Zap,
  CalendarDays,
  Shield,
  Briefcase
} from 'lucide-react';

interface Props {
  staff: Staff[];
  onUpdate: (s: Staff) => void;
  onDelete: (id: string) => void;
  onClearAll?: () => void;
  defaultMaxShifts: number;
  programStartDate?: string;
  programEndDate?: string;
  onOpenScanner?: () => void;
}

export const StaffManager: React.FC<Props> = ({ staff = [], onUpdate, onDelete, onClearAll, defaultMaxShifts, onOpenScanner }) => {
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  
  const [newStaff, setNewStaff] = useState<Partial<Staff>>({
    name: '',
    initials: '',
    type: 'Local',
    powerRate: 75,
    isRamp: false,
    isShiftLeader: false,
    isOps: false,
    isLoadControl: false,
    isLostFound: false,
    workFromDate: '',
    workToDate: ''
  });

  const generateInitials = (name: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return parts[0]?.substring(0, 2).toUpperCase() || "";
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatStaffDate = (dateStr?: string) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === '???') return '???';
    let date: Date;
    if (/^\d{5}$/.test(dateStr)) {
      const serial = parseInt(dateStr);
      date = new Date(0);
      date.setUTCMilliseconds(Math.round((serial - 25569) * 86400 * 1000));
    } else {
      date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00Z'));
    }
    if (isNaN(date.getTime())) return dateStr;
    return date.getUTCDate().toString().padStart(2, '0') + '/' + 
           (date.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + 
           date.getUTCFullYear();
  };

  const handleNewStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.name) return;
    const initials = (newStaff.initials || generateInitials(newStaff.name)).toUpperCase();
    const id = Math.random().toString(36).substring(2, 11);
    const isRoster = newStaff.type === 'Roster';
    const staffData: Staff = {
      id,
      name: newStaff.name,
      initials,
      type: (newStaff.type as StaffCategory) || 'Local',
      workPattern: isRoster ? 'Continuous (Roster)' : '5 Days On / 2 Off',
      powerRate: Number(newStaff.powerRate) || 75,
      isRamp: !!newStaff.isRamp,
      isShiftLeader: !!newStaff.isShiftLeader,
      isOps: !!newStaff.isOps,
      isLoadControl: !!newStaff.isLoadControl,
      isLostFound: !!newStaff.isLostFound,
      maxShiftsPerWeek: defaultMaxShifts,
      workFromDate: isRoster ? newStaff.workFromDate : undefined,
      workToDate: isRoster ? newStaff.workToDate : undefined
    };
    onUpdate(staffData);
    setNewStaff({ name: '', initials: '', type: 'Local', powerRate: 75, isRamp: false, isShiftLeader: false, isOps: false, isLoadControl: false, isLostFound: false, workFromDate: '', workToDate: '' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, isEdit: boolean) => {
    const { name, value } = e.target;
    const finalValue = name === 'powerRate' ? (parseInt(value, 10) || 75) : value;
    if (isEdit) {
      if (!editingStaff) return;
      setEditingStaff(prev => {
        if (!prev) return null;
        const update: any = { [name]: finalValue };
        if (name === 'type') {
          update.workPattern = finalValue === 'Roster' ? 'Continuous (Roster)' : '5 Days On / 2 Off';
          if (finalValue === 'Local') {
            update.workFromDate = undefined;
            update.workToDate = undefined;
          }
        }
        return { ...prev, ...update };
      });
    } else {
      setNewStaff(prev => {
        const update: any = { [name]: finalValue };
        if (name === 'type') {
          update.workPattern = finalValue === 'Roster' ? 'Continuous (Roster)' : '5 Days On / 2 Off';
          if (finalValue === 'Local') {
            update.workFromDate = '';
            update.workToDate = '';
          }
        }
        return { ...prev, ...update };
      });
    }
  };

  const toggleSkill = (skill: Skill, isEdit: boolean) => {
    const skillMap: Record<Skill, keyof Staff> = {
      'Ramp': 'isRamp',
      'Load Control': 'isLoadControl',
      'Lost and Found': 'isLostFound',
      'Shift Leader': 'isShiftLeader',
      'Operations': 'isOps',
      'Duty': 'isOps' // Fallback
    };
    const field = skillMap[skill];
    if (!field) return;

    if (isEdit) {
      if (!editingStaff) return;
      setEditingStaff({ ...editingStaff, [field]: !editingStaff[field] });
    } else {
      setNewStaff({ ...newStaff, [field]: !newStaff[field as keyof Partial<Staff>] });
    }
  };

  const isSkillActive = (member: any, skill: Skill) => {
    const skillMap: Record<Skill, string> = {
      'Ramp': 'isRamp',
      'Load Control': 'isLoadControl',
      'Lost and Found': 'isLostFound',
      'Shift Leader': 'isShiftLeader',
      'Operations': 'isOps',
      'Duty': ''
    };
    const field = skillMap[skill];
    return !!member[field];
  };

  const exportStaffCSV = () => {
    if (!staff || !staff.length) return;
    const data = staff.map(s => ({
      'Full Name': s.name,
      'Initials': s.initials,
      'Category': s.type,
      'Power Rate': `${s.powerRate}%`,
      'Work Pattern': s.workPattern,
      'From Date': s.type === 'Roster' ? (s.workFromDate || 'N/A') : 'Permanent',
      'To Date': s.type === 'Roster' ? (s.workToDate || 'N/A') : 'Permanent',
      'Ramp': s.isRamp ? 'Yes' : 'No',
      'Load Control': s.isLoadControl ? 'Yes' : 'No',
      'Lost and Found': s.isLostFound ? 'Yes' : 'No',
      'Shift Leader': s.isShiftLeader ? 'Yes' : 'No',
      'Operations': s.isOps ? 'Yes' : 'No'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ManPower");
    XLSX.writeFile(workbook, "SkyOPS_ManPower_Registry.xlsx");
  };

  return (
    <div className="space-y-12 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-10 lg:p-14 rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-8 relative z-10">
          <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/40 border-4 border-white/5">
            <Users size={36} />
          </div>
          <div>
            <h3 className="text-4xl font-black uppercase italic tracking-tighter text-white">Personnel Control</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-500" /> {staff.length} Active Agents
            </p>
          </div>
        </div>
        <div className="flex gap-4 relative z-10">
          <button onClick={onOpenScanner} className="px-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-indigo-600/20 group">
            <Sparkles size={18} className="group-hover:animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">AI Smart Sync</span>
          </button>
          <button onClick={exportStaffCSV} className="px-8 py-5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-black uppercase text-[10px] flex items-center gap-3 transition-all">
            <FileSpreadsheet size={18} /> Export XLS
          </button>
          <button onClick={() => setShowWipeConfirm(true)} className="px-8 py-5 bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-500 rounded-2xl font-black uppercase text-[10px] flex items-center gap-3 transition-all">
            <Eraser size={18} /> Wipe All
          </button>
        </div>
      </div>

      <div className="bg-white p-10 lg:p-14 rounded-[4rem] shadow-sm border border-slate-100">
        <h4 className="text-2xl font-black italic uppercase mb-10 flex items-center gap-4 text-slate-900">
          <Plus className="text-blue-600" /> Register New Personnel
        </h4>
        <form onSubmit={handleNewStaffSubmit} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input type="text" name="name" className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={newStaff.name} onChange={(e) => handleInputChange(e, false)} required />
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initials</label>
              <div className="relative">
                <Fingerprint className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input type="text" name="initials" className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-sm uppercase outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={newStaff.initials} onChange={(e) => handleInputChange(e, false)} />
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
              <select name="type" className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] font-bold text-sm outline-none appearance-none" value={newStaff.type} onChange={(e) => handleInputChange(e, false)}>
                <option value="Local">Local (Permanent 5/2)</option>
                <option value="Roster">Roster (Contract-Based)</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                <span>Power Rate</span>
                <span className="text-blue-600 font-black">{newStaff.powerRate}%</span>
              </label>
              <div className="px-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] flex items-center">
                <input type="range" name="powerRate" min="50" max="100" step="5" className="w-full accent-blue-600 h-1" value={newStaff.powerRate} onChange={(e) => handleInputChange(e, false)} />
              </div>
            </div>
          </div>
          
          {newStaff.type === 'Roster' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-10 bg-indigo-50/30 rounded-[3rem] border border-indigo-100 animate-in slide-in-from-top-4">
              <div>
                <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CalendarDays size={14} className="text-indigo-600" /> Contract Start
                </label>
                <input type="date" name="workFromDate" className="w-full p-4 border rounded-2xl bg-white font-bold" value={newStaff.workFromDate} onChange={(e) => handleInputChange(e, false)} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CalendarDays size={14} className="text-rose-600" /> Contract End
                </label>
                <input type="date" name="workToDate" className="w-full p-4 border rounded-2xl bg-white font-bold" value={newStaff.workToDate} onChange={(e) => handleInputChange(e, false)} />
              </div>
            </div>
          )}

          <div className="space-y-4 pt-6 border-t border-slate-50">
            <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2"> Discipline Matrix</p>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_SKILLS.map(skill => {
                const active = isSkillActive(newStaff, skill);
                return (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill, false)} className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white border-slate-100 text-slate-400'}`}>
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="submit" className="w-full py-6 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.3em] shadow-2xl hover:bg-blue-600 text-xs transition-all">
            Commit To Station Registry
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
        {staff.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-slate-100/50 rounded-[4rem] border-2 border-dashed border-slate-200">
            <Users size={64} className="mx-auto text-slate-200 mb-6" />
            <h4 className="text-xl font-black uppercase italic text-slate-300">Station Ranks Empty</h4>
          </div>
        ) : (
          staff.map((member) => {
            const power = member.powerRate || 75;
            const isRoster = member.type === 'Roster';
            return (
              <div key={member.id} className="bg-white rounded-[4rem] shadow-sm border border-slate-100 p-0 group hover:shadow-2xl transition-all relative overflow-hidden flex flex-col">
                <div className={`h-24 px-8 flex items-center justify-between ${isRoster ? 'bg-amber-500/10' : 'bg-blue-600/5'}`}>
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-950 font-black italic text-xl border border-slate-100">{member.initials}</div>
                      <div>
                        <h5 className="text-sm font-black text-slate-900 leading-tight truncate max-w-[140px]">{member.name}</h5>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${isRoster ? 'text-amber-600' : 'text-blue-600'}`}>{member.type} AGENT</span>
                      </div>
                   </div>
                   <div className="relative w-12 h-12 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * power / 100)} className={isRoster ? 'text-amber-500' : 'text-blue-600'} />
                      </svg>
                      <span className="absolute text-[8px] font-black">{power}%</span>
                   </div>
                </div>

                <div className="p-8 flex-1 flex flex-col justify-between space-y-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-slate-400">
                      <Briefcase size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">{member.workPattern}</span>
                    </div>

                    {isRoster && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center text-[8px] font-black uppercase">
                          <span className="text-slate-400">CONTRACT WINDOW</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black italic">
                          <span>{formatStaffDate(member.workFromDate)}</span>
                          <span className="text-slate-300">→</span>
                          <span>{formatStaffDate(member.workToDate)}</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Shield size={12} className="text-indigo-400" /> Qualifications</p>
                      <div className="flex flex-wrap gap-1.5">
                        {AVAILABLE_SKILLS.filter(s => isSkillActive(member, s)).map(s => (
                          <span key={s} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-tight">
                            {s}
                          </span>
                        ))}
                        {!member.isRamp && !member.isShiftLeader && !member.isOps && !member.isLoadControl && !member.isLostFound && (
                          <span className="text-[8px] font-bold text-slate-300 italic">Core Duty Only</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingStaff(member)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all">
                      <Edit2 size={14} /> REFINE
                    </button>
                    <button onClick={() => onDelete(member.id)} className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingStaff && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white rounded-[4rem] shadow-2xl max-w-xl w-full p-12">
            <h4 className="text-2xl font-black uppercase italic mb-10 flex items-center gap-4">
              <Edit2 className="text-indigo-600" /> Refine Profile
            </h4>
            <form onSubmit={(e) => { e.preventDefault(); onUpdate(editingStaff); setEditingStaff(null); }} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Full Name</label>
                  <input type="text" name="name" className="w-full px-6 py-5 bg-slate-50 border rounded-[2rem] font-bold" value={editingStaff.name} onChange={(e) => handleInputChange(e, true)} required />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Initials</label>
                  <input type="text" name="initials" className="w-full px-6 py-5 bg-slate-50 border rounded-[2rem] font-black uppercase" value={editingStaff.initials} onChange={(e) => handleInputChange(e, true)} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <select name="type" className="w-full px-6 py-5 bg-slate-50 border rounded-[2rem] font-bold appearance-none" value={editingStaff.type} onChange={(e) => handleInputChange(e, true)}>
                  <option value="Local">Local (Permanent)</option>
                  <option value="Roster">Roster (Contract)</option>
                </select>
                <div className="px-6 py-5 bg-slate-50 border rounded-[2rem] flex items-center">
                  <input type="range" name="powerRate" min="50" max="100" className="w-full accent-indigo-600" value={editingStaff.powerRate} onChange={(e) => handleInputChange(e, true)} />
                </div>
              </div>

              {editingStaff.type === 'Roster' && (
                <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Contract From</label>
                    <input type="date" name="workFromDate" className="w-full px-4 py-3 bg-slate-50 border rounded-xl font-bold" value={editingStaff.workFromDate || ''} onChange={(e) => handleInputChange(e, true)} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Contract To</label>
                    <input type="date" name="workToDate" className="w-full px-4 py-3 bg-slate-50 border rounded-xl font-bold" value={editingStaff.workToDate || ''} onChange={(e) => handleInputChange(e, true)} />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase"> Discipline Access</p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SKILLS.map(skill => {
                    const active = isSkillActive(editingStaff, skill);
                    return (
                      <button key={skill} type="button" onClick={() => toggleSkill(skill, true)} className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase transition-all border ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-6 pt-6">
                <button type="button" onClick={() => setEditingStaff(null)} className="flex-1 py-5 text-[10px] font-black uppercase text-slate-400">Discard</button>
                <button type="submit" className="flex-[2] py-5 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.2em] transition-all">Apply Refinement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showWipeConfirm && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[4rem] shadow-2xl max-sm w-full p-12 text-center">
              <ShieldCheck size={56} className="mx-auto text-rose-500 mb-8" />
              <h4 className="text-2xl font-black uppercase italic mb-3">Registry Purge</h4>
              <p className="text-xs text-slate-500 mb-10">Permanently erase all personnel data?</p>
              <div className="flex gap-4">
                <button onClick={() => setShowWipeConfirm(false)} className="flex-1 py-5 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                <button onClick={() => { onClearAll?.(); setShowWipeConfirm(false); }} className="flex-[2] py-5 bg-rose-600 text-white rounded-[1.5rem] font-black uppercase text-xs transition-all">Confirm Wipe</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
