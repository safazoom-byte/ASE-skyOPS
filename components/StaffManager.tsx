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
  AlertTriangle
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
    workFromDate: '',
    workToDate: ''
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
      maxShiftsPerWeek: formData.type === 'Roster' ? 7 : defaultMaxShifts,
      workFromDate: formData.workFromDate,
      workToDate: formData.workToDate,
    };
    onUpdate(newStaff);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', initials: '', type: 'Local', skillRatings: {}, powerRate: 75, workFromDate: '', workToDate: '' });
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
      {/* Header Panel */}
      <div className="bg-slate-900 text-white p-8 lg:p-12 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6 text-center md:text-left">
          <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Users size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter">Man Power Registry</h3>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">{staff.length} Active Operators</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={exportStaffCSV} className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 transition-all">
            <FileSpreadsheet size={16} /> Export XLS
          </button>
          <button 
            onClick={() => setShowWipeConfirm(true)} 
            className="px-6 py-4 bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-500 rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 transition-all"
          >
            <Eraser size={16} /> Wipe Registry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Entry Form */}
        <div className="xl:col-span-1">
          <div className="bg-white p-8 lg:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-10">
            <h4 className="text-xl font-black uppercase italic mb-8 flex items-center gap-3">
              {editingStaffId ? <Edit2 className="text-indigo-500" size={20} /> : <UserPlus className="text-blue-500" size={24} />}
              {editingStaffId ? 'Refine Profile' : 'Recruit Operator'}
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input type="text" name="name" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-500/5 transition-all outline-none" placeholder="e.g. John Smith" value={formData.name} onChange={handleInputChange} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Initials</label>
                    <div className="relative">
                      <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input type="text" name="initials" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm uppercase text-center focus:ring-4 focus:ring-blue-500/5 transition-all outline-none" maxLength={3} value={formData.initials} onChange={handleInputChange} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Category</label>
                    <select name="type" className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none" value={formData.type} onChange={handleInputChange}>
                      <option value="Local">Local (Fixed)</option>
                      <option value="Roster">Roster (Variable)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 ml-1 flex justify-between">
                    <span>Performance Rating</span>
                    <span className="text-blue-600 font-black italic">{formData.powerRate}%</span>
                  </label>
                  <input type="range" name="powerRate" min="50" max="100" className="w-full h-2 bg-slate-100 rounded-full appearance-none accent-blue-600 cursor-pointer" value={formData.powerRate} onChange={e => setFormData({ ...formData, powerRate: parseInt(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 ml-1">Proficiency Matrix</label>
                <div className="grid grid-cols-1 gap-2">
                  {AVAILABLE_SKILLS.map(skill => (
                    <button 
                      key={skill} 
                      type="button" 
                      onClick={() => toggleSkill(skill)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        formData.skillRatings?.[skill] === 'Yes' 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-white text-slate-400 hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <GraduationCap size={16} className={formData.skillRatings?.[skill] === 'Yes' ? 'text-blue-200' : 'text-slate-200'} />
                        <span className="text-[10px] font-black uppercase tracking-wider">{skill}</span>
                      </div>
                      {formData.skillRatings?.[skill] === 'Yes' ? <Check size={16} /> : <X size={16} className="opacity-20" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                {editingStaffId && (
                  <button type="button" onClick={resetForm} className="px-6 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
                )}
                <button type="submit" className="flex-1 py-5 bg-slate-950 text-white rounded-2xl font-black uppercase text-[11px] shadow-2xl shadow-slate-950/20 active:scale-95 transition-all italic tracking-widest flex items-center justify-center gap-3">
                  <Save size={18} /> {editingStaffId ? 'UPDATE REGISTRY' : 'ENLIST OPERATOR'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Staff List */}
        <div className="xl:col-span-2">
          {staff.length === 0 ? (
            <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
              <User className="mx-auto text-slate-200 mb-6" size={64} />
              <h4 className="text-xl font-black uppercase italic text-slate-300">No Man Power Found</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Use the scanner or manual enlistment to populate the registry.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {staff.map(member => (
                <div key={member.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden">
                  {/* Skill Badges */}
                  <div className="absolute -top-1 -right-1 flex flex-col gap-1 p-4">
                    {Object.entries(member.skillRatings).filter(([_, level]) => level === 'Yes').map(([skill]) => (
                      <div key={skill} className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg border border-indigo-100" title={skill}>
                        <Zap size={10} fill="currentColor" />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-6 mb-8">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl italic shadow-inner ${
                      member.type === 'Roster' ? 'bg-amber-50 text-amber-600' : 'bg-slate-950 text-white'
                    }`}>
                      {member.initials}
                    </div>
                    <div>
                      <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-900 leading-tight">{member.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${
                          member.type === 'Roster' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {member.type}
                        </span>
                        <span className="text-[8px] font-black text-blue-500 uppercase italic">PWR {member.powerRate}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_SKILLS.map(skill => {
                        const hasSkill = member.skillRatings[skill] === 'Yes';
                        return (
                          <span key={skill} className={`px-3 py-1.5 rounded-xl text-[7px] font-black uppercase tracking-widest border transition-all ${
                            hasSkill ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-300'
                          }`}>
                            {skill}
                          </span>
                        );
                      })}
                    </div>
                    
                    <div className="pt-4 mt-4 border-t border-slate-50 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <button onClick={() => startEdit(member)} className="text-[9px] font-black text-slate-400 hover:text-indigo-600 uppercase transition-colors">Modify</button>
                        <button onClick={() => { if(confirm(`Confirm deletion of ${member.name}?`)) onDelete(member.id); }} className="text-[9px] font-black text-slate-400 hover:text-rose-600 uppercase transition-colors">Terminate</button>
                      </div>
                      <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Logic Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Wipe Confirmation Dialog */}
      {showWipeConfirm && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-lg w-full p-12 text-center border border-white/10">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 animate-bounce">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black italic uppercase mb-4 text-slate-950 tracking-tighter">Wipe Man Power Registry?</h3>
            <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed">
              This action is irreversible. All <span className="text-rose-600 font-black">{staff.length}</span> operator records will be purged from the station core.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={() => setShowWipeConfirm(false)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
              <button 
                onClick={handleWipeRegistry} 
                className="flex-[2] py-5 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-rose-600/20 active:scale-95 transition-all italic"
              >
                CONFIRM WIPE ALL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};