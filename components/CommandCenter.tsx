import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Settings, Search, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {users.map(user => (
            <div key={user.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="font-bold text-slate-900">{user.email}</h4>
                  <span className={`inline-block mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                    user.role === 'master' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {user.role}
                  </span>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={user.isActive} onChange={e => handleUpdateUser({...user, isActive: e.target.checked})} />
                    <div className={`block w-10 h-6 rounded-full transition-colors ${user.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${user.isActive ? 'transform translate-x-4' : ''}`}></div>
                  </div>
                  <span className="ml-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{user.isActive ? 'Active' : 'Frozen'}</span>
                </label>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Role</label>
                    <select 
                      value={user.role}
                      onChange={e => handleUpdateUser({...user, role: e.target.value as 'master' | 'planner'})}
                      disabled={user.id === currentUser.id} // Cannot change own role
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Max Shifts</label>
                    <input 
                      type="number" 
                      value={user.maxShifts}
                      onChange={e => handleUpdateUser({...user, maxShifts: parseInt(e.target.value) || 0})}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">AI Daily Limit</label>
                    <input 
                      type="number" 
                      value={user.aiDailyLimit}
                      onChange={e => handleUpdateUser({...user, aiDailyLimit: parseInt(e.target.value) || 0})}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">AI Weekly Limit</label>
                    <input 
                      type="number" 
                      value={user.aiWeeklyLimit}
                      onChange={e => handleUpdateUser({...user, aiWeeklyLimit: parseInt(e.target.value) || 0})}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">AI Monthly Limit</label>
                    <input 
                      type="number" 
                      value={user.aiMonthlyLimit}
                      onChange={e => handleUpdateUser({...user, aiMonthlyLimit: parseInt(e.target.value) || 0})}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
