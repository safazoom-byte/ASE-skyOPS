import React, { useState, useRef } from 'react';
import { Staff, Skill } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { extractStaffOnly } from '../services/geminiService';

interface Props {
  staff: Staff[];
  onAdd: (s: Staff) => void;
  onDelete: (id: string) => void;
  defaultMaxShifts: number;
}

export const StaffManager: React.FC<Props> = ({ staff, onAdd, onDelete, defaultMaxShifts }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    initials: '',
    skillRatings: {},
    maxShiftsPerWeek: undefined
  });

  const toggleSkill = (skill: Skill) => {
    const current = formData.skillRatings || {};
    setFormData({
      ...formData,
      skillRatings: {
        ...current,
        [skill]: !current[skill]
      }
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name?.trim()) {
      newErrors.name = "Name is required";
    }
    
    if (formData.maxShiftsPerWeek !== undefined) {
      if (formData.maxShiftsPerWeek < 1 || formData.maxShiftsPerWeek > 7) {
        newErrors.maxShiftsPerWeek = "Must be between 1 and 7";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const finalMaxShifts = typeof formData.maxShiftsPerWeek === 'number' 
        ? formData.maxShiftsPerWeek 
        : defaultMaxShifts;

      const newStaff: Staff = {
        ...formData as Staff,
        id: editingStaffId || Math.random().toString(36).substr(2, 9),
        maxShiftsPerWeek: finalMaxShifts,
        skillRatings: formData.skillRatings || {}
      };

      if (editingStaffId) {
        onDelete(editingStaffId);
      }
      onAdd(newStaff);
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      initials: '', 
      skillRatings: {}, 
      maxShiftsPerWeek: undefined 
    });
    setEditingStaffId(null);
    setErrors({});
  };

  const handleEdit = (person: Staff) => {
    setFormData({ ...person });
    setEditingStaffId(person.id);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const extractedStaff = await extractStaffOnly({ textData: event.target?.result as string });
        extractedStaff.forEach(s => {
          onAdd({
            ...s,
            maxShiftsPerWeek: defaultMaxShifts,
            skillRatings: {}
          });
        });
      };
      reader.readAsText(file);
    } catch (error) {
      alert("Failed to extract staff.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[80px] pointer-events-none"></div>
        <div className="relative z-10 text-center md:text-left">
          <h3 className="text-2xl font-black uppercase italic tracking-tight text-white">Personnel Registry</h3>
          <p className="text-slate-400 text-sm max-w-md font-medium">Manage station workforce and their qualifications for specialized roles.</p>
        </div>
        <div className="relative z-10">
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <button onClick={() => fileInputRef.current?.click()} disabled={isScanning} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-500 transition-all active:scale-95">
            {isScanning ? 'Syncing...' : 'Bulk Import Staff List'}
          </button>
        </div>
      </div>

      <div className={`bg-white p-8 rounded-3xl shadow-sm border-2 transition-all ${editingStaffId ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}>
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">{editingStaffId ? 'Modify Staff Record' : 'Enroll Station Personnel'}</h4>
          {editingStaffId && (
            <button onClick={resetForm} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">Cancel Modification</button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
              <input 
                type="text" 
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 font-bold transition-all ${errors.name ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-200 focus:ring-blue-500'}`}
                value={formData.name} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                required 
              />
              {errors.name && <p className="text-[9px] font-black text-red-500 uppercase mt-1 ml-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Initials</label>
              <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={formData.initials} onChange={e => setFormData({ ...formData, initials: e.target.value })} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Max Shifts / Week</label>
              <input 
                type="number" 
                min="1" 
                max="7" 
                placeholder={`Default: ${defaultMaxShifts}`}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 font-bold transition-all ${errors.maxShiftsPerWeek ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-200 focus:ring-blue-500'}`}
                value={formData.maxShiftsPerWeek ?? ''} 
                onChange={e => {
                  const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                  setFormData({ ...formData, maxShiftsPerWeek: val });
                }} 
              />
              {errors.maxShiftsPerWeek && <p className="text-[9px] font-black text-red-500 uppercase mt-1 ml-1">{errors.maxShiftsPerWeek}</p>}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Professional Qualifications</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_SKILLS.map(skill => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    formData.skillRatings?.[skill] 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-sm tracking-tighter italic shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">
            {editingStaffId ? 'Update Operational Record' : 'Commit Personnel to Registry'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {staff.map(person => (
          <div key={person.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col group relative overflow-hidden hover:shadow-xl transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-lg">
                  {person.initials || person.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-black text-slate-800 tracking-tight text-base leading-tight group-hover:text-blue-600 transition-colors">{person.name}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{person.initials || 'No Initials'}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(person)} className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onClick={() => onDelete(person.id)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-4 flex flex-col items-center text-center">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Weekly Limit</span>
              <span className="text-xl font-black text-slate-900 italic uppercase">{person.maxShiftsPerWeek} Shifts</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-auto pt-4 border-t border-slate-50">
              {Object.entries(person.skillRatings || {})
                .filter(([_, active]) => active)
                .map(([skill]) => (
                  <span key={skill} className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border border-blue-100">
                    {skill}
                  </span>
                ))}
              {Object.values(person.skillRatings || {}).filter(Boolean).length === 0 && (
                <span className="text-[9px] text-slate-300 font-bold italic uppercase">No Specialties</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};