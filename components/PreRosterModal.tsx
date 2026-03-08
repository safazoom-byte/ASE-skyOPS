import React, { useState, useMemo } from 'react';
import { Staff, ShiftConfig, ManualAssignment } from '../types';
import { X, Plus, AlertTriangle, Check, User, Clock } from 'lucide-react';

interface PreRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (assignments: ManualAssignment[]) => void;
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate: string;
  endDate: string;
}

export const PreRosterModal: React.FC<PreRosterModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  staff,
  shifts,
  startDate,
  endDate
}) => {
  const [assignments, setAssignments] = useState<ManualAssignment[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  const activeShifts = useMemo(() => {
    return shifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate)
                 .sort((a, b) => new Date(`${a.pickupDate}T${a.pickupTime}`).getTime() - new Date(`${b.pickupDate}T${b.pickupTime}`).getTime());
  }, [shifts, startDate, endDate]);

  if (!isOpen) return null;

  const handleAddAssignment = () => {
    if (!selectedStaffId || !selectedShiftId) return;
    
    // Check if already assigned
    if (assignments.some(a => a.staffId === selectedStaffId && a.shiftId === selectedShiftId)) {
      alert("This staff member is already assigned to this shift.");
      return;
    }

    const st = staff.find(s => s.id === selectedStaffId);
    if (!st) return;

    // Auto-detect roles based on staff skills
    const roles: string[] = [];
    if (st.isShiftLeader || st.initials.toUpperCase() === 'SK-ATZ') roles.push('SL');
    if (st.isLoadControl || st.initials.toUpperCase() === 'SK-ATZ') roles.push('LC');
    if (st.isRamp) roles.push('RMP');
    if (st.isOps) roles.push('OPS');
    if (st.isLostFound) roles.push('LF');

    setAssignments([...assignments, { staffId: selectedStaffId, shiftId: selectedShiftId, roles }]);
    setSelectedStaffId('');
    setSelectedShiftId('');
  };

  const handleRemoveAssignment = (staffId: string, shiftId: string) => {
    setAssignments(assignments.filter(a => !(a.staffId === staffId && a.shiftId === shiftId)));
  };

  const getShiftLabel = (shiftId: string) => {
    const s = activeShifts.find(s => s.id === shiftId);
    if (!s) return 'Unknown Shift';
    const d = new Date(s.pickupDate);
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${s.pickupTime}-${s.endTime}`;
  };

  const getStaffInitials = (staffId: string) => {
    return staff.find(s => s.id === staffId)?.initials || 'Unknown';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Manual Overrides</h2>
            <p className="text-slate-500 text-sm mt-1">Pre-assign staff to specific shifts before running the AI engine.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Plus size={16} /> Add Assignment
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Staff Member</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                >
                  <option value="">-- Select Staff --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.initials} - {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Target Shift</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                >
                  <option value="">-- Select Shift --</option>
                  {activeShifts.map(s => (
                    <option key={s.id} value={s.id}>{getShiftLabel(s.id)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex items-end">
                <button 
                  onClick={handleAddAssignment}
                  disabled={!selectedStaffId || !selectedShiftId}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {assignments.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Check size={16} className="text-emerald-500" /> Pinned Assignments ({assignments.length})
              </h3>
              {assignments.map((a, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                      {getStaffInitials(a.staffId)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        {getShiftLabel(a.shiftId)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-1 flex gap-1">
                        Roles covered: {a.roles.length > 0 ? a.roles.map(r => (
                          <span key={r} className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{r}</span>
                        )) : <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">AGT</span>}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveAssignment(a.staffId, a.shiftId)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
              <User size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-700">No Manual Overrides</h3>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                The AI will have full control over the roster. Add assignments above if you want to lock specific people into specific shifts.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(assignments)}
            className="px-8 py-3 bg-slate-900 hover:bg-blue-600 text-white font-black uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <Sparkles size={18} /> Run Engine
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple Sparkles icon for the button
const Sparkles = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  </svg>
);
