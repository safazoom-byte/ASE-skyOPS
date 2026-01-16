import React, { useState } from 'react';
import { Staff, Skill, ProficiencyLevel } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import * as XLSX from 'xlsx';
import { 
  UserPlus, 
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
  Save
} from 'lucide-react';

interface Props {
  staff: Staff[];
  onUpdate: (s: Staff) => void;
  onDelete: (id: string) => void;
  defaultMaxShifts: number;
  programStartDate?: string;
  programEndDate?: string;
}

export const StaffManager: React.FC<Props> = ({ staff, onUpdate, onDelete, defaultMaxShifts, programStartDate, programEndDate }) => {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
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

  const handleMagicInitials = (target: 'new' | 'inline') => {
    if (formData.name) {
      setFormData(prev => ({ ...prev, initials: generateInitials(formData.name!) }));
    }
  };

  const exportToExcel = () => {
    if (staff.length === 0) {
      alert("No personnel records found to export.");
      return;
    }
    
    const workbook = XLSX.utils.book_new();
    const dataRows = staff.map(person => {
      const row: any = {
        'ID': person.id,
        'Full Name': person.name,
        'Initials': person.initials,
        'Category': person.type,
        'Power Rate': `${person.powerRate}%`,
        'Contract Start': person.workFromDate || 'N/A',
        'Contract End': person.workToDate || 'N/A'
      };
      
      // Inject skills into the spreadsheet columns
      AVAILABLE_SKILLS.forEach(skill => {
        row[skill] = person.skillRatings[skill] === 'Yes' ? 'QUALIFIED' : 'NO';
      });
      
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Station_Personnel");
    XLSX.writeFile(workbook, `SkyOPS_Station_Personnel_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleLevelChange = (skill: Skill, level: ProficiencyLevel) => {
    const current = { ...(formData.skillRatings || {}) };
    current[skill] = level;
    setFormData(prev => ({ ...prev, skillRatings: current }));
  };

  const validate = (data: Partial<Staff>, staffId: string | null): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.name?.trim()) newErrors.name = "Required";
    if (!data.initials?.trim()) {
      newErrors.initials = "Required";
    } else {
      const isDuplicate = staff.some(s => 
        s.initials.toUpperCase() === data.initials?.trim().toUpperCase() && 
        s.id !== staffId
      );
      if (isDuplicate) newErrors.initials = "Duplicate";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate(formData, editingStaffId)) {
      const isLocal = formData.type === 'Local';
      const updatedStaff: Staff = {
        name: formData.name || '',
        initials: (formData.initials || '').toUpperCase(),
        type: formData.type || 'Local',
        id: editingStaffId || Math.random().toString(36).substr(2, 9),
        powerRate: formData.powerRate || 75,
        maxShiftsPerWeek: isLocal ? 5 : 7, 
        skillRatings: formData.skillRatings || {},
        workFromDate: isLocal ? undefined : (formData.workFromDate || undefined),
        workToDate: isLocal ? undefined : (formData.workToDate || undefined),
      };
      onUpdate(updatedStaff);
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({ name: '', initials: '', type: 'Local', skillRatings: {}, powerRate: 75, workFromDate: '', workToDate: '' });
    setEditingStaffId(null);
    setErrors({});
  };

  const handleEditInline = (person: Staff) => {
    setEditingStaffId(person.id);
    setFormData({ ...person });
  };

  const handleWipeRegistry = () => {
    if (staff.length === 0) return;
    if (confirm("🚨 CRITICAL WARNING: You are about to PERMANENTLY DELETE the entire staff database. This action is irreversible. Continue?")) {
      if (confirm("Second Confirmation: All personnel records and their associated history will be wiped. Proceed?")) {
        const pin = prompt("Please type 'WIPE ALL' to confirm deletion:");
        if (pin === 'WIPE ALL') {
          // Clear everything
          staff.forEach(s => onDelete(s.id));
        } else {
          alert("Wipe cancelled. Confirmation input did not match.");
        }
      }
    }
  };

  return (
    <div className="space-y-8 pb-20 relative animate-in fade-in duration-500">
      {/* Registry Controls */}
      <div className="bg-slate-950 text-white p-8 lg:p-12 rounded-[2rem] lg:rounded-[3rem] shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter">Personnel Registry</h3>
          <p className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">Active Station Headcount: {staff.length}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button 
            onClick={exportToExcel} 
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase italic shadow-xl hover:bg-emerald-500 transition-all active:scale-95"
          >
            <FileSpreadsheet size={16} /> EXPORT EXCEL
          </button>
          <button 
            onClick={handleWipeRegistry} 
            className="px-8 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] italic flex items-center gap-2 shadow-xl hover:bg-rose-500 transition-all active:scale-95"
          >
            <Eraser size={16} /> WIPE REGISTRY
          </button>
        </div>
      </div>

      {/* Enrollment Form - Only shown when not editing inline */}
      {!editingStaffId && (
        <div className="bg-white p-8 lg:p-12 rounded-[2rem] lg:rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-top-4 duration-500">
          <h4 className="text-xl font-black text-slate-800 uppercase italic mb-10">Enroll New Employee</h4>
          <form onSubmit={handleSubmit} className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><User size={12}/> Full Name</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="e.g. Mostafa Zaghloul" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Fingerprint size={12}/> Roster Initials</label>
                  <button type="button" onClick={() => handleMagicInitials('new')} className="text-blue-500 text-[8px] font-black uppercase hover:underline">Generate</button>
                </div>
                <input type="text" maxLength={4} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-black uppercase outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="MZ" value={formData.initials || ''} onChange={e => setFormData({ ...formData, initials: e.target.value.toUpperCase() })} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Employment Category</label>
                <div className="flex bg-slate-50 p-1 rounded-2xl gap-1">
                  <button type="button" onClick={() => setFormData({...formData, type: 'Local'})} className={`flex-1 py-4 rounded-xl font-black text-[10px] border transition-all ${formData.type === 'Local' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-transparent text-slate-400 border-transparent hover:text-slate-600'}`}>LOCAL</button>
                  <button type="button" onClick={() => setFormData({...formData, type: 'Roster'})} className={`flex-1 py-4 rounded-xl font-black text-[10px] border transition-all ${formData.type === 'Roster' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-transparent text-slate-400 border-transparent hover:text-slate-600'}`}>ROSTER</button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Zap size={12}/> Power Rating</label>
                  <span className="text-lg font-black italic text-blue-600">{formData.powerRate}%</span>
                </div>
                <input type="range" min="50" max="100" className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900" value={formData.powerRate || 75} onChange={e => setFormData({ ...formData, powerRate: parseInt(e.target.value) })} />
              </div>
            </div>

            {formData.type === 'Roster' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-4">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Calendar size={12}/> Contract Starts</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-black" value={formData.workFromDate || ''} onChange={e => setFormData({ ...formData, workFromDate: e.target.value })} />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Calendar size={12}/> Contract Ends</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-black" value={formData.workToDate || ''} onChange={e => setFormData({ ...formData, workToDate: e.target.value })} />
                </div>
              </div>
            )}

            <div className="space-y-6">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><GraduationCap size={14}/> Station Skills Matrix</label>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {AVAILABLE_SKILLS.map(skill => (
                  <button 
                    key={skill} 
                    type="button" 
                    onClick={() => handleLevelChange(skill, formData.skillRatings?.[skill] === 'Yes' ? 'No' : 'Yes')} 
                    className={`p-4 rounded-2xl border text-[9px] font-black uppercase tracking-tighter transition-all ${formData.skillRatings?.[skill] === 'Yes' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-300'}`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black text-xs uppercase italic tracking-[0.3em] shadow-2xl hover:bg-slate-800 transition-all active:scale-[0.98]">
              SYNCHRONIZE TO REGISTRY
            </button>
          </form>
        </div>
      )}

      {/* Staff List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {staff.map(person => {
          const isEditing = editingStaffId === person.id;
          return (
            <div 
              key={person.id} 
              className={`bg-white rounded-[3rem] shadow-sm border overflow-hidden transition-all duration-300 ${isEditing ? 'border-blue-500 ring-8 ring-blue-500/5 scale-[1.02] z-20' : 'border-slate-100 hover:shadow-2xl hover:scale-[1.01]'}`}
            >
              {isEditing ? (
                /* INLINE EDIT FORM */
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-center mb-4">
                    <h5 className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Update Profile</h5>
                    <button onClick={resetForm} className="text-slate-300 hover:text-slate-900 transition-colors"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Name</label>
                      <input 
                        type="text" 
                        className="w-full p-3 bg-slate-50 border rounded-xl font-black text-xs outline-none focus:ring-2 focus:ring-blue-500/20" 
                        value={formData.name || ''} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Initials</label>
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full p-3 bg-slate-50 border rounded-xl font-black text-xs uppercase outline-none focus:ring-2 focus:ring-blue-500/20" 
                        value={formData.initials || ''} 
                        onChange={e => setFormData({...formData, initials: e.target.value.toUpperCase()})} 
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-1 flex justify-between">Power <span>{formData.powerRate}%</span></label>
                      <input 
                        type="range" min="50" max="100" 
                        className="w-full accent-blue-600" 
                        value={formData.powerRate || 75} 
                        onChange={e => setFormData({...formData, powerRate: parseInt(e.target.value)})} 
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase block mb-2">Qualifications</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {AVAILABLE_SKILLS.map(skill => (
                          <button 
                            key={skill} 
                            type="button"
                            onClick={() => handleLevelChange(skill, formData.skillRatings?.[skill] === 'Yes' ? 'No' : 'Yes')} 
                            className={`py-2 rounded-xl border text-[7px] font-black uppercase transition-all ${formData.skillRatings?.[skill] === 'Yes' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-300 border-slate-100'}`}
                          >
                            {skill}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button 
                      onClick={handleSubmit} 
                      className="flex-1 py-4 bg-slate-950 text-white rounded-2xl font-black text-[10px] uppercase italic flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95"
                    >
                      <Save size={14} /> Update
                    </button>
                    <button 
                      onClick={resetForm} 
                      className="px-6 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* VIEW MODE CARD */
                <div className="p-10 group flex flex-col h-full relative">
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-14 h-14 bg-slate-950 text-white rounded-2xl flex items-center justify-center font-black italic text-xl shadow-xl transition-transform group-hover:scale-110 duration-500">
                      {person.initials}
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.1em] border ${person.type === 'Local' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                      {person.type}
                    </div>
                  </div>
                  
                  <h4 className="font-black text-slate-900 uppercase italic text-xl truncate mb-6">{person.name}</h4>
                  
                  <div className="space-y-5 flex-1">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className="text-slate-400">Power Factor</span>
                      <span className="text-indigo-600">{person.powerRate}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(person.skillRatings).map(([skill, lvl]) => lvl === 'Yes' && (
                        <span key={skill} className="px-2.5 py-1 bg-slate-50 text-[7px] font-black text-slate-500 uppercase rounded-lg border border-slate-100">
                          {skill}
                        </span>
                      ))}
                    </div>
                    {person.type === 'Roster' && (
                       <div className="pt-2">
                         <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest block mb-1">Contract Validity</span>
                         <span className="text-[8px] font-black text-slate-500 uppercase">{person.workFromDate} — {person.workToDate}</span>
                       </div>
                    )}
                  </div>
                  
                  {/* Inline Action Bar */}
                  <div className="mt-10 pt-8 border-t border-slate-50 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                    <button 
                      onClick={() => handleEditInline(person)} 
                      className="flex-1 py-4 bg-slate-950 text-white rounded-2xl text-[9px] font-black uppercase italic shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 size={12}/> Edit
                    </button>
                    <button 
                      onClick={() => { if(confirm(`Confirm removal of ${person.name}?`)) onDelete(person.id) }} 
                      className="p-4 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-2xl transition-all border border-rose-100 shadow-sm" 
                      title="Remove Employee"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {staff.length === 0 && (
        <div className="bg-white p-20 rounded-[4rem] border-2 border-dashed border-slate-100 text-center animate-in zoom-in-95">
           <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
             <UserPlus size={32} className="text-slate-200" />
           </div>
           <h5 className="text-xl font-black text-slate-300 uppercase italic tracking-tighter">Registry Empty</h5>
           <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2">Enroll personnel to start building your station roster.</p>
        </div>
      )}
    </div>
  );
};
