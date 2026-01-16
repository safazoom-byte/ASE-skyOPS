import React, { useState } from 'react';
import { Staff, Skill, ProficiencyLevel } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import * as XLSX from 'xlsx';
import { 
  UserPlus, 
  Users,
  Edit2, 
  Trash2, 
  GraduationCap, 
  FileSpreadsheet,
  Zap,
  User,
  Fingerprint,
  Check,
  X,
  Eraser,
  Calendar,
  Save,
  AlertTriangle,
  History,
  Clock,
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
}

export const StaffManager: React.FC<Props> = ({ staff, onUpdate, onDelete, onClearAll, defaultMaxShifts, programStartDate, programEndDate }) => {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    initials: '',
    type: 'Local',
    skillRatings: {},
    powerRate: 75,
    workFromDate: programStartDate || '',
    workToDate: programEndDate || ''
  });

  const generateInitials = (name: string): string => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'name' && !prev.initials) {
        updated.initials = generateInitials(value);
      }
      return updated;
    });
  };

  const toggleSkill = (skill: Skill) => {
    const current = formData.skillRatings || {};
    const newRating: ProficiencyLevel = current[skill] === 'Yes' ? 'No' : 'Yes';
    setFormData({
      ...formData,
      skillRatings: { ...current, [skill]: newRating }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newStaff: Staff = {
      id: editingStaffId || Math.random().toString(36).substr(2, 9),
      name: formData.name || 'Unknown',
      initials: formData.initials || '??',
      type: formData.type || 'Local',
      skillRatings: formData.skillRatings || {},
      powerRate: formData.powerRate || 75,
      maxShiftsPerWeek: formData.type === 'Local' ? 5 : 7,
      workFromDate: formData.workFromDate,
      workToDate: formData.workToDate,
    };
    onUpdate(newStaff);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      initials: '', 
      type: 'Local', 
      skillRatings: {}, 
      powerRate: 75, 
      workFromDate: programStartDate || '', 
      workToDate: programEndDate || '' 
    });
    setEditingStaffId(null);
  };

  const startEdit = (s: Staff) => {
    setEditingStaffId(s.id);
    setFormData({ ...s });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleWipeRegistry = () => {
    if (onClearAll) {
      onClearAll();
      setShowWipeConfirm(false);
    }
  };

  const exportStaffCSV = () => {
    const data = staff.map(s => ({
      Name: s.name,
      Initials: s.initials,
      Type: s.type,
      'Active From': s.workFromDate || 'N/A',
      'Active To': s.workToDate || 'N/A',
      Power: `${s.powerRate}%`,
      Skills: Object.entries(s.skillRatings)
        .filter(([_, level]) => level === 'Yes')
        .map(([skill]) => skill)
        .join(', ')
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ManPower");
    XLSX.writeFile(workbook, "SkyOPS_ManPower.xlsx");
  };

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-900 text-white p-8 lg:p-12 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6 text-center md:text-left">
          <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Users size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter">Man Power Registry</h3>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">{staff.length} Operational Personnel</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={exportStaffCSV} className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 transition-all">
            <FileSpreadsheet size={16} /> Export XLS
          </button>
          <button onClick={() => setShowWipeConfirm(true)} className="px-6 py-4 bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-500 rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 transition-all">
            <Eraser size={16} /> Wipe All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-1">
          <div className="bg-white p-8 lg:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-10">
            <h4 className="text-lg font-black italic uppercase mb-8 flex items-center gap-3 text-slate-900">
              {editingStaffId ? <Edit2 className="text-indigo-600" size={20} /> : <UserPlus className="text-blue-600" size={20} />}
              {editingStaffId ? 'Edit Profile' : 'Recruit Personnel'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" name="name" placeholder="Full Name" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none" value={formData.name} onChange={handleInputChange} required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" name="initials" placeholder="Initials" maxLength={4} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm uppercase outline-none" value={formData.initials} onChange={handleInputChange} required />
                  </div>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select name="type" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none appearance-none" value={formData.type} onChange={handleInputChange}>
                      <option value="Local">Local (5 on/2 off)</option>
                      <option value="Roster">Roster (Variable)</option>
                    </select>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-blue-500" /> Working Duration
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-1">From Date</label>
                      <input type="date" name="workFromDate" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" value={formData.workFromDate} onChange={handleInputChange} required />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-1">To Date</label>
                      <input type="date" name="workToDate" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" value={formData.workToDate} onChange={handleInputChange} required />
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Power Rating</p>
                    <span className="text-xs font-black text-blue-600">{formData.powerRate}%</span>
                  </div>
                  <input type="range" name="powerRate" min="50" max="100" step="5" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" value={formData.powerRate} onChange={handleInputChange} />
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <GraduationCap size={14} className="text-indigo-500" /> Verified Skill Matrix
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_SKILLS.map(skill => {
                      const active = formData.skillRatings?.[skill] === 'Yes';
                      return (
                        <button key={skill} type="button" onClick={() => toggleSkill(skill)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300'}`}>
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                {editingStaffId && <button type="button" onClick={resetForm} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Cancel</button>}
                <button type="submit" className="flex-[2] py-4 bg-slate-950 text-white rounded-2xl font-black uppercase italic text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all">
                  {editingStaffId ? 'Update Record' : 'Commit to Registry'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-5 border-b border-slate-100">Personnel</th>
                    <th className="px-6 py-5 border-b border-slate-100">Category</th>
                    <th className="px-6 py-5 border-b border-slate-100">Working Period</th>
                    <th className="px-6 py-5 border-b border-slate-100">Skillset</th>
                    <th className="px-6 py-5 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staff.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <Users size={48} className="mx-auto text-slate-100 mb-4" />
                        <p className="text-sm font-black text-slate-300 uppercase italic">Empty Registry</p>
                      </td>
                    </tr>
                  ) : staff.map(s => (
                    <tr key={s.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black italic text-[10px]">
                            {s.initials}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase italic text-slate-900 leading-none mb-1">{s.name}</p>
                            <div className="flex items-center gap-2">
                              <Zap size={10} className="text-amber-500" />
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{s.powerRate}% Potency</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${s.type === 'Roster' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {s.type}
                        </span>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-2 text-slate-400">
                           <Clock size={12} />
                           <span className="text-[9px] font-black uppercase">
                             {s.workFromDate && s.workToDate ? `${s.workFromDate.split('-').slice(1).join('/')} - ${s.workToDate.split('-').slice(1).join('/')}` : 'UNSET'}
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {Object.entries(s.skillRatings).filter(([_, level]) => level === 'Yes').map(([skill]) => (
                            <span key={skill} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[7px] font-black uppercase tracking-tighter">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(s)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => onDelete(s.id)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showWipeConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[3rem] shadow-2xl max-w-sm w-full p-10 text-center">
              <AlertTriangle size={48} className="mx-auto text-rose-500 mb-6" />
              <h4 className="text-xl font-black uppercase italic mb-2">Destructive Action</h4>
              <p className="text-xs text-slate-500 font-medium mb-8">This will erase the entire personnel registry. Proceed with extreme caution.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowWipeConfirm(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                <button onClick={handleWipeRegistry} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs italic tracking-widest shadow-xl shadow-rose-600/20">Wipe Registry</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};