import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Settings, Search, AlertTriangle, CheckCircle2, Lock, Plus, Trash2, X } from 'lucide-react';
import { UserProfile, AuditLog } from '../types';
import { db } from '../services/supabaseService';

interface CommandCenterProps {
  currentUser: UserProfile;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'users'>('audit');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'master' | 'planner'>('planner');
  
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{id: string, email: string} | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedLogs, fetchedUsers] = await Promise.all([
        db.getAuditLogs(),
        db.getAllUserProfiles()
      ]);
      setLogs(fetchedLogs);
      setUsers(fetchedUsers);
    } catch (e) {
      console.error("Failed to load command center data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    await db.updateUserProfile(updatedUser);
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    db.logAction('UPDATE', 'USER_PROFILE', updatedUser.id, `Updated quotas/role for ${updatedUser.email}`);
  };

  const handleDeleteUserClick = (id: string, email: string) => {
    if (id === currentUser.id) {
      setErrorModalMessage("You cannot delete your own account.");
      return;
    }
    setDeleteConfirmUser({ id, email });
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    
    await db.deleteUserProfile(deleteConfirmUser.id);
    setUsers(users.filter(u => u.id !== deleteConfirmUser.id));
    db.logAction('DELETE', 'USER_PROFILE', deleteConfirmUser.id, `Deleted user ${deleteConfirmUser.email}`);
    setDeleteConfirmUser(null);
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !newUserEmail.includes('@')) {
      setErrorModalMessage("Please enter a valid email address.");
      return;
    }
    if (users.some(u => u.email.toLowerCase() === newUserEmail.toLowerCase())) {
      setErrorModalMessage("A user with this email already exists.");
      return;
    }

    const newProfile: UserProfile = {
      id: crypto.randomUUID(), // Will be updated when they actually sign in via Supabase Auth
      email: newUserEmail.trim(),
      role: newUserRole,
      aiDailyLimit: 5,
      aiWeeklyLimit: 20,
      aiMonthlyLimit: 50,
      maxStaff: 50,
      maxShifts: 20,
      isActive: true
    };

    await db.createUserProfile(newProfile);
    setUsers([...users, newProfile]);
    db.logAction('CREATE', 'USER_PROFILE', newProfile.id, `Created pre-approved user ${newProfile.email}`);
    
    setNewUserEmail('');
    setNewUserRole('planner');
    setIsAddUserModalOpen(false);
  };

  const filteredLogs = logs.filter(l => 
    l.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.actionType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group logs by user email
  const logsByUser = filteredLogs.reduce((acc, log) => {
    if (!acc[log.userEmail]) {
      acc[log.userEmail] = [];
    }
    acc[log.userEmail].push(log);
    return acc;
  }, {} as Record<string, AuditLog[]>);

  // Sort users alphabetically
  const sortedUsers = Object.keys(logsByUser).sort();

  // Sort logs within each user chronologically (newest first)
  sortedUsers.forEach(email => {
    logsByUser[email].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  const sortedUsersList = [...users].sort((a, b) => {
    if (a.role === 'master' && b.role !== 'master') return -1;
    if (a.role !== 'master' && b.role === 'master') return 1;
    return a.email.localeCompare(b.email);
  });

  if (currentUser.role !== 'master') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500">
        <Lock size={48} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">Access Denied</h2>
        <p>You do not have Master User privileges to view this area.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-8 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Shield size={32} className="text-white" />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Command Center</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Master User Override & Audit</p>
          </div>
        </div>
        
        <div className="flex bg-slate-900 p-1 rounded-xl relative z-10">
          <button 
            onClick={() => setActiveTab('audit')}
            className={`px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'audit' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Activity size={14} className="inline mr-2" /> Black Box
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Users size={14} className="inline mr-2" /> Access & Quotas
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
      ) : activeTab === 'audit' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">System Audit Trail</h4>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-6 space-y-8 bg-slate-50/30">
            {sortedUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No logs found.</div>
            ) : (
              sortedUsers.map(email => (
                <div key={email} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs uppercase">
                      {email.substring(0, 2)}
                    </div>
                    <h3 className="font-bold text-slate-800">{email}</h3>
                    <span className="ml-auto text-xs font-bold text-slate-400 uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-slate-200">
                      {logsByUser[email].length} Actions
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {logsByUser[email].map(log => (
                      <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
                        <div className={`mt-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 w-24 text-center ${
                          log.actionType === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                          log.actionType === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                          log.actionType === 'DELETE' ? 'bg-red-100 text-red-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {log.actionType}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {log.entityType}
                            </p>
                            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">{log.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h4 className="font-bold text-slate-800">User Management</h4>
              <p className="text-xs text-slate-500 mt-1">Manage access, roles, and AI quotas for all users.</p>
            </div>
            <button 
              onClick={() => setIsAddUserModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              <Plus size={16} /> Add User
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedUsersList.map(user => (
              <div key={user.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-inner ${
                      user.role === 'master' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">{user.email}</h4>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                        user.role === 'master' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  </div>
                  <label className={`flex items-center ${user.email === 'safazoom@gmail.com' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} bg-slate-50 p-2 rounded-xl border border-slate-100`}>
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={user.isActive} disabled={user.email === 'safazoom@gmail.com'} onChange={e => handleUpdateUser({...user, isActive: e.target.checked})} />
                      <div className={`block w-10 h-6 rounded-full transition-colors ${user.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${user.isActive ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                    <span className="ml-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{user.isActive ? 'Active' : 'Frozen'}</span>
                  </label>
                </div>

                <div className="space-y-6 flex-1">
                  <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Account Settings</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Role</label>
                        <select 
                          value={user.role}
                          onChange={e => handleUpdateUser({...user, role: e.target.value as 'master' | 'planner'})}
                          disabled={user.id === currentUser.id || user.email === 'safazoom@gmail.com'} // Cannot change own role or master
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="planner">Planner</option>
                          <option value="master">Master</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Max Staff</label>
                        <input 
                          type="number" 
                          value={user.maxStaff}
                          onChange={e => handleUpdateUser({...user, maxStaff: parseInt(e.target.value) || 0})}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Max Shifts</label>
                        <input 
                          type="number" 
                          value={user.maxShifts}
                          onChange={e => handleUpdateUser({...user, maxShifts: parseInt(e.target.value) || 0})}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-600/70 mb-3">AI Quotas</h5>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Daily</label>
                        <input 
                          type="number" 
                          value={user.aiDailyLimit}
                          onChange={e => handleUpdateUser({...user, aiDailyLimit: parseInt(e.target.value) || 0})}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Weekly</label>
                        <input 
                          type="number" 
                          value={user.aiWeeklyLimit}
                          onChange={e => handleUpdateUser({...user, aiWeeklyLimit: parseInt(e.target.value) || 0})}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Monthly</label>
                        <input 
                          type="number" 
                          value={user.aiMonthlyLimit}
                          onChange={e => handleUpdateUser({...user, aiMonthlyLimit: parseInt(e.target.value) || 0})}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => handleDeleteUserClick(user.id, user.email)}
                    disabled={user.id === currentUser.id || user.email === 'safazoom@gmail.com'}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      user.id === currentUser.id || user.email === 'safazoom@gmail.com'
                        ? 'bg-slate-50 text-slate-400 cursor-not-allowed' 
                        : 'bg-red-50 text-red-600 hover:bg-red-100 shadow-sm'
                    }`}
                  >
                    <Trash2 size={16} /> Delete User
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Add New User</h3>
              <button 
                onClick={() => setIsAddUserModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email Address</label>
                <input 
                  type="email" 
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label>
                <select 
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as 'master' | 'planner')}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="planner">Planner</option>
                  <option value="master">Master</option>
                </select>
              </div>
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm">
                <strong>Note:</strong> The user will be able to log in using this email address. Their quotas and limits will be set to the default values, which you can edit later.
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button 
                onClick={() => setIsAddUserModalOpen(false)}
                className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddUser}
                className="px-6 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModalMessage && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-2">Error</h3>
              <p className="text-slate-500">{errorModalMessage}</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
              <button 
                onClick={() => setErrorModalMessage(null)}
                className="px-8 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 transition-colors w-full"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-2">Delete User?</h3>
              <p className="text-slate-500">Are you sure you want to delete the user <strong>{deleteConfirmUser.email}</strong>? This action cannot be undone.</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button 
                onClick={() => setDeleteConfirmUser(null)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteUser}
                className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
