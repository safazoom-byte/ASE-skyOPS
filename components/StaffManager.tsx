
import React, { useState, useRef } from 'react';
import { Staff, Skill, ProficiencyLevel } from '../types';
import { AVAILABLE_SKILLS } from '../constants';
import { extractStaffOnly } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  UserPlus, 
  FileUp, 
  Edit2, 
  Trash2, 
  GraduationCap, 
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Globe,
  MapPin,
  LogIn,
  LogOut,
  Zap
} from 'lucide-react';

interface Props {
  staff: Staff[];
  onAdd: (s: Staff) => void;
  onDelete: (id: string) => void;
  defaultMaxShifts: number;
  programStartDate: string;
  programEndDate: string;
}

export const StaffManager: React.FC<Props> = ({ staff, onAdd, onDelete, defaultMaxShifts, programStartDate, programEndDate }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    initials: '',
    type: 'Local',
    skillRatings: {},
    powerRate: 75,
    workFromDate: '',
    workToDate: ''
  });

  const exportToExcel = () => {
    if (staff.length === 0) return;
    const workbook = XLSX.utils.book_new();
    const dataRows = staff.map(person => {
      const row: any = {
        'Full Name': person.name,
        'Initials': person.initials || '',
        'Category': person.type,
        'Power Rate': person.powerRate,
        'Work Pattern': person.type === 'Local' ? '5 Days On / 2 Off' : 'Continuous (Roster)',
        'Work From': person.type === 'Roster' ? (person.workFromDate || 'N/A') : 'Daily',
        'Work To': person.type === 'Roster' ? (person.workToDate || 'N/A') : 'Daily'
      };
      AVAILABLE_SKILLS.forEach(skill => {
        row[skill] = person.skillRatings[skill] === 'Yes' ? 'YES' : 'NO';
      });
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "PersonnelRegistry");
    XLSX.writeFile(workbook, `SkyOPS_Personnel_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleLevelChange = (skill: Skill, level: ProficiencyLevel) => {
    const current = { ...(formData.skillRatings || {}) };
    current[skill] = level;
    setFormData({ ...formData, skillRatings: current });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name?.trim()) newErrors.name = "Name is required";
    
    if (formData.type === 'Roster') {
      if (!formData.workFromDate || !formData.workToDate) {
        newErrors.dates = "Contract dates required for Roster staff";
      } else {
        const fromDate = new Date(formData.workFromDate);
        const toDate = new Date(formData.workToDate);
        if (fromDate > toDate) {
          newErrors.dates = "Logic Error: End date cannot be before start date.";
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const isLocal = formData.type === 'Local';
      const newStaff: Staff = {
        ...formData as Staff,
        id: editingStaffId || Math.random().toString(36).substr(2, 9),
        powerRate: formData.powerRate || 75,
        maxShiftsPerWeek: isLocal ? 5 : 7, 
        skillRatings: formData.skillRatings || {},
        workFromDate: isLocal ? undefined : formData.workFromDate,
        workToDate: isLocal ? undefined : formData.workToDate,
      };
      if (editingStaffId) onDelete(editingStaffId);
      onAdd(newStaff);
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({ name: '', initials: '', type: 'Local', skillRatings: {}, powerRate: 75, workFromDate: '', workToDate: '' });
    setEditingStaffId(null);
    setErrors({});
  };

  const handleEdit = (person: Staff) => {
    setFormData({ ...person });
    setEditingStaffId(person.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const extractedStaff = await extractStaffOnly({ textData: text });
        extractedStaff.forEach(s => onAdd({ 
          ...s, 
          type: 'Local', 
          maxShiftsPerWeek: 5, 
          skillRatings: {},
          powerRate: 75 
        }));
      };
      reader.readAsText(file);
    } catch (error) {
      alert("AI Processing Failed.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isInvalidDateRange = formData.type === 'Roster' && !!formData.workFromDate && !!formData.workToDate && (
    new Date(formData.workToDate) < new Date(formData.workFromDate)
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 relative">
      {isScanning && (
        <div className="fixed inset-0 z-[600] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 text-center">
          <div className="space-y-4">
             <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
             <p className="text-white font-black uppercase tracking-widest text-xs italic">Syncing Personnel Registry...</p>
          </div>
        </div>
      )}

      <div className="bg-slate-950 text-white p-8 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[100px] pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="text-2xl lg:text-4xl font-black uppercase italic tracking-tighter mb-2">Personnel Registry</h3>
            <p className="text-slate-500 text-[10px] lg:text-sm max-w-md font-medium uppercase tracking-widest">Employee classification and power rating management.</p>
          </div>
          <div className="flex gap-4">
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-8 py-5 bg-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 shadow-2xl transition-all active:scale-95 italic">
               <FileUp size={18} /> IMPORT LIST
            </button>
            <button onClick={exportToExcel} className="p-5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-500 transition-all shadow-xl"><FileSpreadsheet size={20} /></button>
          </div>
        </div>
      </div>

      <div className={`bg-white p-8 lg:p-16 rounded-[3rem] lg:rounded-[5rem] shadow-sm border-2 transition-all duration-500 ${editingStaffId ? 'border-blue-500 ring-[20px] ring-blue-50 shadow-2xl' : 'border-slate-100'}`}>
        <div className="flex items-center gap-4 mb-14">
          <div className="w-14 h-14 bg-slate-950 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl">
            {editingStaffId ? <Edit2 size={24} /> : <UserPlus size={24} />}
          </div>
          <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">{editingStaffId ? 'Modify Staff Record' : 'Enroll Employee'}</h4>
        </div>

        <form onSubmit={handleSubmit} className="space-y-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-12">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Employee Name</label>
                <input type="text" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-[12px] focus:ring-blue-500/5 font-black text-2xl transition-all" placeholder="Enter full name..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                {errors.name && <p className="text-red-500 text-[10px] font-black uppercase mt-2">{errors.name}</p>}
              </div>

              <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <label className="flex items-center gap-3 text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">
                    <Zap size={16} /> Staff Power Rate
                  </label>
                  <span className="text-3xl font-black italic text-indigo-600">{formData.powerRate}%</span>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="100" 
                  step="1"
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  value={formData.powerRate} 
                  onChange={e => setFormData({ ...formData, powerRate: parseInt(e.target.value) })}
                />
              </div>
            </div>
            
            <div className="space-y-12">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Initials</label>
                <input type="text" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-[12px] focus:ring-blue-500/5 font-black text-center text-2xl uppercase transition-all" placeholder="JD" value={formData.initials} onChange={e => setFormData({ ...formData, initials: e.target.value.toUpperCase() })} />
              </div>
              
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Employee Type</label>
                <div className="flex bg-slate-100 p-2 rounded-[2.5rem] gap-2">
                  <button 
                    type="button" 
                    onClick={() => setFormData({ ...formData, type: 'Local' })}
                    className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${formData.type === 'Local' ? 'bg-white text-slate-950 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <MapPin size={14} /> LOCAL
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({ ...formData, type: 'Roster' })}
                    className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${formData.type === 'Roster' ? 'bg-white text-slate-950 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Globe size={14} /> ROSTER
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-10 border-t-2 border-slate-50">
            {formData.type === 'Roster' && (
              <div className="animate-in slide-in-from-top duration-300 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                  <div>
                    <label className="block text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">START DATE</label>
                    <input type="date" className="w-full px-8 py-6 bg-emerald-50/50 border border-emerald-100 rounded-[2rem] font-black text-xl outline-none" value={formData.workFromDate} onChange={e => setFormData({ ...formData, workFromDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-amber-600 uppercase tracking-[0.2em] mb-4">END DATE</label>
                    <input type="date" className="w-full px-8 py-6 bg-amber-50/50 border border-amber-100 rounded-[2rem] font-black text-xl outline-none" value={formData.workToDate} onChange={e => setFormData({ ...formData, workToDate: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10">
              <GraduationCap size={20} className="text-slate-300" /> Operational Qualification Matrix
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {AVAILABLE_SKILLS.map(skill => (
                <div key={skill} className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 hover:border-blue-200 transition-all group/skill shadow-sm flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-800 tracking-widest group-hover/skill:text-blue-600 transition-colors">{skill}</span>
                  <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                    {(['Yes', 'No'] as const).map(lvl => (
                      <button 
                        key={lvl} 
                        type="button" 
                        onClick={() => handleLevelChange(skill, lvl)} 
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formData.skillRatings?.[skill] === lvl ? (lvl === 'Yes' ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white') : 'text-slate-300 hover:text-slate-500'}`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={!!isInvalidDateRange}
            className={`w-full py-8 text-white rounded-[2.5rem] font-black text-sm lg:text-base uppercase tracking-[0.5em] shadow-2xl transition-all italic active:scale-95 ${isInvalidDateRange ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-950 hover:bg-slate-800'}`}
          >
            {editingStaffId ? 'UPDATE RECORD' : 'ENROLL PERSONNEL'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {staff.map(person => (
          <div key={person.id} className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100 group hover:border-blue-200 transition-all duration-700 relative flex flex-col">
            <div className={`absolute top-8 right-8 px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${person.type === 'Local' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-indigo-50 border-indigo-200 text-indigo-600'}`}>
              {person.type}
            </div>

            <div className="flex items-center gap-5 mb-8">
              <div className="w-16 h-16 bg-slate-950 text-white rounded-2xl flex items-center justify-center font-black italic text-2xl shadow-xl">{person.initials || person.name.charAt(0)}</div>
              <div>
                <h4 className="font-black text-slate-900 uppercase italic leading-none text-xl tracking-tighter">{person.name}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <Zap size={12} className="text-indigo-500" />
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{person.powerRate}% POWER</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-8 right-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => handleEdit(person)} className="p-3 bg-slate-950 text-white rounded-xl shadow-lg hover:bg-blue-600 transition-all"><Edit2 size={16} /></button>
              <button onClick={() => onDelete(person.id)} className="p-3 bg-slate-50 text-slate-300 rounded-xl hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
