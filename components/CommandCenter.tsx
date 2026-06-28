import React, { useState, useEffect } from "react";
import {
  Shield,
  Users,
  Activity,
  Settings,
  Search,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  X,
  PlaneTakeoff,
} from "lucide-react";
import { UserProfile, AuditLog, Flight, ShiftConfig } from "../types";
import { db } from "../services/supabaseService";
import { AirlineManager } from "./AirlineManager";

const SignatureInput = ({ label, value, placeholder, onChange }: any) => {
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase text-slate-400">{label}</label>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onChange(val)}
        placeholder={placeholder}
        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-blue-500 outline-none"
      />
    </div>
  );
};

interface CommandCenterProps {
  currentUser: UserProfile;
  flights?: Flight[];
  shifts?: ShiftConfig[];
  startDate?: string;
  endDate?: string;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  currentUser,
  flights = [],
  shifts = [],
  startDate,
  endDate,
}) => {
  const [activeTab, setActiveTab] = useState<"audit" | "users" | "system" | "airports" | "airlines">("audit");
  const [newAirportName, setNewAirportName] = useState("");
  const [newAirportCode, setNewAirportCode] = useState("");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [airports, setAirports] = useState<any[]>([]);
  const [newUserAirportId, setNewUserAirportId] = useState("");

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"super_admin" | "admin" | "planner">(
    "planner",
  );

  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(
    null,
  );
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{
    id: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedLogs, fetchedUsers, fetchedAirports] = await Promise.all([
        db.getAuditLogs(),
        db.getAllUserProfiles(),
        db.getAirports(),
      ]);
      setLogs(fetchedLogs);
      setUsers(fetchedUsers);
      setAirports(fetchedAirports);
    } catch (e) {
      console.error("Failed to load command center data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    await db.updateUserProfile(updatedUser);
    setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    db.logAction(
      "UPDATE",
      "USER_PROFILE",
      updatedUser.id,
      `Updated quotas/role for ${updatedUser.email}`,
    );
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
    setUsers(users.filter((u) => u.id !== deleteConfirmUser.id));
    db.logAction(
      "DELETE",
      "USER_PROFILE",
      deleteConfirmUser.id,
      `Deleted user ${deleteConfirmUser.email}`,
    );
    setDeleteConfirmUser(null);
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !newUserEmail.includes("@")) {
      setErrorModalMessage("Please enter a valid email address.");
      return;
    }
    if (
      users.some((u) => u.email.toLowerCase() === newUserEmail.toLowerCase())
    ) {
      setErrorModalMessage("A user with this email already exists.");
      return;
    }

    const newProfile: UserProfile = {
      id: crypto.randomUUID(), // Will be updated when they actually sign in via Supabase Auth
      email: newUserEmail.trim(),
      role: newUserRole,
      airport_id: currentUser.role === "admin" ? currentUser.airport_id : newUserAirportId,
      aiDailyLimit: 5,
      aiWeeklyLimit: 20,
      aiMonthlyLimit: 50,
      maxStaff: 50,
      maxShifts: 20,
      isActive: true,
    };

    await db.createUserProfile(newProfile);
    setUsers([...users, newProfile]);
    db.logAction(
      "CREATE",
      "USER_PROFILE",
      newProfile.id,
      `Created pre-approved user ${newProfile.email}`,
    );

    setNewUserEmail("");
    setNewUserRole("planner");
    setIsAddUserModalOpen(false);
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actionType.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Group logs by user email
  const logsByUser = filteredLogs.reduce(
    (acc, log) => {
      if (!acc[log.userEmail]) {
        acc[log.userEmail] = [];
      }
      acc[log.userEmail].push(log);
      return acc;
    },
    {} as Record<string, AuditLog[]>,
  );

  // Sort users alphabetically
  const sortedUsers = Object.keys(logsByUser).sort();

  // Sort logs within each user chronologically (newest first)
  sortedUsers.forEach((email) => {
    logsByUser[email].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });

  const sortedUsersList = [...users].sort((a, b) => {
    if ((a.role === "super_admin" || a.role === "admin") && (b.role === "planner")) return -1;
    if ((a.role === "planner") && (b.role === "super_admin" || b.role === "admin")) return 1;
    return (a.email || "").localeCompare(b.email || "");
  });

  if (currentUser.role === "planner") {
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
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 relative z-10 text-center sm:text-left">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex shrink-0 items-center justify-center shadow-lg shadow-emerald-600/20">
            <Shield size={32} className="text-white" />
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none">
              Command Center
            </h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
              Master User Override & Audit
            </p>
          </div>
        </div>

        <div className="flex overflow-x-auto sm:flex-wrap bg-slate-900 p-1.5 md:p-1 rounded-xl relative z-10 w-full mt-4 md:mt-0 justify-start md:justify-center gap-1 md:gap-0 hide-scrollbar">
          <button
            onClick={() => setActiveTab("audit")}
            className={`whitespace-nowrap px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "audit" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            <Activity size={14} className="inline mr-1 md:mr-2" /> Black Box
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`whitespace-nowrap px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "users" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            <Users size={14} className="inline mr-1 md:mr-2" /> Access & Quotas
          </button>
          {currentUser.role === "super_admin" && (
            <button
              onClick={() => setActiveTab("airports")}
              className={`whitespace-nowrap px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "airports" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
            >
              <Activity size={14} className="inline mr-1 md:mr-2" /> Airports
            </button>
          )}
          <button
            onClick={() => setActiveTab("airlines")}
            className={`whitespace-nowrap px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "airlines" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            <PlaneTakeoff size={14} className="inline mr-1 md:mr-2" /> Airlines
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`whitespace-nowrap px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "system" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            <Settings size={14} className="inline mr-1 md:mr-2" /> System Settings
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : activeTab === "audit" ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-start sm:items-center bg-slate-50/50">
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              System Audit Trail
            </h4>
            <div className="relative w-full sm:w-auto">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-64"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-6 space-y-8 bg-slate-50/30">
            {sortedUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No logs found.
              </div>
            ) : (
              sortedUsers.map((email) => (
                <div
                  key={email}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
                >
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
                    {logsByUser[email].map((log) => (
                      <div
                        key={log.id}
                        className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4"
                      >
                        <div
                          className={`mt-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 w-24 text-center ${
                            log.actionType === "CREATE"
                              ? "bg-emerald-100 text-emerald-700"
                              : log.actionType === "UPDATE"
                                ? "bg-blue-100 text-blue-700"
                                : log.actionType === "DELETE"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-purple-100 text-purple-700"
                          }`}
                        >
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
                          <p className="text-sm text-slate-500 mt-1">
                            {log.details}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      
      ) : activeTab === "airports" && currentUser.role === "super_admin" ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h4 className="font-bold text-slate-800 mb-6">Manage Airports</h4>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <input
                type="text"
                placeholder="Airport Name"
                value={newAirportName}
                onChange={(e) => setNewAirportName(e.target.value)}
                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="text"
                placeholder="Airport Code (e.g. LHR)"
                value={newAirportCode}
                onChange={(e) => setNewAirportCode(e.target.value)}
                className="w-full sm:w-32 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <button
                onClick={async () => {
                  if (newAirportName && newAirportCode) {
                    const client = (await import('../services/supabaseService')).supabase;
                    if (client) {
                      const { data } = await client.from("airports").insert({ name: newAirportName, code: newAirportCode }).select();
                      if (data) {
                        setAirports([...airports, data[0]]);
                        setNewAirportName("");
                        setNewAirportCode("");
                      }
                    }
                  }
                }}
                className="bg-emerald-600 text-white px-6 rounded-xl font-bold hover:bg-emerald-700"
              >
                Add
              </button>
            </div>
            
            <div className="space-y-3">
              {airports.map(a => (
                <div key={a.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <h5 className="font-bold text-slate-800">{a.name}</h5>
                    <span className="text-xs text-slate-500 font-mono">{a.code}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === "users" ? (

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h4 className="font-bold text-slate-800">User Management</h4>
              <p className="text-xs text-slate-500 mt-1">
                Manage access, roles, and AI quotas for all users.
              </p>
            </div>
            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              <Plus size={16} /> Add User
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedUsersList.map((user) => (
              <div
                key={user.id}
                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-inner ${
                        (user.role === "super_admin" || user.role === "admin")
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {(user.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">
                        {user.email || "Unknown User"}
                      </h4>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                          (user.role === "super_admin" || user.role === "admin")
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                  </div>
                  <label
                    className={`flex items-center ${user.email === "safazoom@gmail.com" ? "cursor-not-allowed opacity-60" : "cursor-pointer"} bg-slate-50 p-2 rounded-xl border border-slate-100`}
                  >
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={user.isActive}
                        disabled={user.email === "safazoom@gmail.com"}
                        onChange={(e) =>
                          handleUpdateUser({
                            ...user,
                            isActive: e.target.checked,
                          })
                        }
                      />
                      <div
                        className={`block w-10 h-6 rounded-full transition-colors ${user.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                      ></div>
                      <div
                        className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${user.isActive ? "transform translate-x-4" : ""}`}
                      ></div>
                    </div>
                    <span className="ml-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {user.isActive ? "Active" : "Frozen"}
                    </span>
                  </label>
                </div>

                <div className="space-y-6 flex-1">
                  <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Account Settings
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Role
                        </label>
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              role: e.target.value as "super_admin" | "admin" | "planner",
                            })
                          }
                          disabled={
                            user.id === currentUser.id ||
                            user.email === "safazoom@gmail.com"
                          } // Cannot change own role or master
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="planner">Planner</option>
                          <option value="admin">Admin</option>
                          {currentUser.role === "super_admin" && <option value="super_admin">Super Admin</option>}
                        </select>
                      </div>
                      
                      {currentUser.role === "super_admin" && user.role !== "super_admin" ? (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Airport Assignment
                          </label>
                          <select
                            value={user.airport_id || ""}
                            onChange={(e) =>
                              handleUpdateUser({
                                ...user,
                                airport_id: e.target.value,
                              })
                            }
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                          >
                            <option value="">Select Airport...</option>
                            {airports.map(a => (
                              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Max Staff
                          </label>
                          <input
                            type="number"
                            value={user.maxStaff}
                            onChange={(e) =>
                              handleUpdateUser({
                                ...user,
                                maxStaff: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                          />
                        </div>
                      )}

                      {currentUser.role === "super_admin" && user.role !== "super_admin" && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Max Staff
                          </label>
                          <input
                            type="number"
                            value={user.maxStaff}
                            onChange={(e) =>
                              handleUpdateUser({
                                ...user,
                                maxStaff: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                          />
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Max Shifts
                        </label>
                        <input
                          type="number"
                          value={user.maxShifts}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              maxShifts: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-600/70 mb-3">
                      AI Quotas
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Daily
                        </label>
                        <input
                          type="number"
                          value={user.aiDailyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiDailyLimit: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Weekly
                        </label>
                        <input
                          type="number"
                          value={user.aiWeeklyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiWeeklyLimit: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Monthly
                        </label>
                        <input
                          type="number"
                          value={user.aiMonthlyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiMonthlyLimit: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => handleDeleteUserClick(user.id, user.email)}
                    disabled={
                      user.id === currentUser.id ||
                      user.email === "safazoom@gmail.com"
                    }
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      user.id === currentUser.id ||
                      user.email === "safazoom@gmail.com"
                        ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                        : "bg-red-50 text-red-600 hover:bg-red-100 shadow-sm"
                    }`}
                  >
                    <Trash2 size={16} /> Delete User
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "airlines" ? (
        <AirlineManager flights={flights} shifts={shifts} startDate={startDate} endDate={endDate} />
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
            <h4 className="font-bold text-slate-800 mb-6">System Settings & Configurations</h4>
            
             {(() => {
              const myProfile = users.find(u => u.id === currentUser.id) || currentUser;
              
              const handleImageUpload = (file: File, field: 'companyLogo' | 'skyopsLogo') => {
                 const reader = new FileReader();
                 reader.onload = (e) => {
                     const img = new Image();
                     img.onload = async () => {
                         const canvas = document.createElement('canvas');
                         let width = img.width;
                         let height = img.height;
                         const MAX_WIDTH = 300;
                         const MAX_HEIGHT = 300;
                         
                         if (width > height) {
                             if (width > MAX_WIDTH) {
                                 height *= MAX_WIDTH / width;
                                 width = MAX_WIDTH;
                             }
                         } else {
                             if (height > MAX_HEIGHT) {
                                 width *= MAX_HEIGHT / height;
                                 height = MAX_HEIGHT;
                             }
                         }
                         canvas.width = width;
                         canvas.height = height;
                         const ctx = canvas.getContext('2d');
                         ctx?.drawImage(img, 0, 0, width, height);
                         const resizedBase64 = canvas.toDataURL('image/png', 0.8);
                         await handleUpdateUser({ ...myProfile, [field]: resizedBase64 });
                     };
                     img.src = e.target?.result as string;
                 };
                 reader.readAsDataURL(file);
              };

              return (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-200 p-6 rounded-2xl">
                      <h5 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Company Logo (Left)</h5>
                      {myProfile.companyLogo && (
                        <img src={myProfile.companyLogo} alt="Company Logo" className="h-16 object-contain mb-4" />
                      )}
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, 'companyLogo');
                        }}
                        className="text-xs" 
                      />
                    </div>

                    <div className="border border-slate-200 p-6 rounded-2xl">
                      <h5 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">SkyOPS Logo (Right)</h5>
                      {myProfile.skyopsLogo && (
                        <img src={myProfile.skyopsLogo} alt="SkyOPS Logo" className="h-16 object-contain mb-4" />
                      )}
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, 'skyopsLogo');
                        }}
                        className="text-xs" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-200 p-6 rounded-2xl flex flex-col gap-2">
                      <h5 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Default Signatures</h5>
                      <SignatureInput 
                         label="Prepared By" 
                         value={myProfile.preparedBy || ""} 
                         placeholder="e.g. Operation Control Center"
                         onChange={(val: string) => {
                             if (val !== myProfile.preparedBy) {
                                 handleUpdateUser({ ...myProfile, preparedBy: val });
                             }
                         }}
                      />
                      <div className="mt-2" />
                      <SignatureInput 
                         label="Revised By" 
                         value={myProfile.revisedBy || ""} 
                         onChange={(val: string) => {
                             if (val !== myProfile.revisedBy) {
                                 handleUpdateUser({ ...myProfile, revisedBy: val });
                             }
                         }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="border border-slate-200 p-6 rounded-2xl flex flex-col gap-2">
                      <h5 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Database Backup</h5>
                      <p className="text-xs text-slate-400 mb-4">Export or import a full JSON backup of your current database.</p>
                      <div className="flex gap-4">
                        <button
                          onClick={async () => {
                            const data = await db.exportDatabase();
                            if (!data) return;
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `skyops_backup_${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
                        >
                          Export Backup
                        </button>
                        <div className="relative">
                          <input
                            type="file"
                            accept=".json"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = async (ev) => {
                                  const text = ev.target?.result as string;
                                  if (text) {
                                    const success = await db.importDatabase(text);
                                    if (success) {
                                      alert("Database restored successfully! Please refresh the page.");
                                      window.location.reload();
                                    } else {
                                      alert("Failed to restore database. Check console for details.");
                                    }
                                  }
                                };
                                reader.readAsText(file);
                              }
                              e.target.value = '';
                            }}
                          />
                          <button className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors pointer-events-none">
                            Restore Backup
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={async () => {
                        await handleUpdateUser({ ...myProfile, companyLogo: "", skyopsLogo: "" });
                      }}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                    >
                      Clear All Logos
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                Add New User
              </h3>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) =>
                    setNewUserRole(e.target.value as "super_admin" | "admin" | "planner")
                  }
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="planner">Planner</option>
                  <option value="admin">Admin</option>
                          {currentUser.role === "super_admin" && <option value="super_admin">Super Admin</option>}
                </select>
              </div>
              {currentUser.role === "super_admin" && newUserRole !== "super_admin" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Airport Assignment
                  </label>
                  <select
                    value={newUserAirportId}
                    onChange={(e) => setNewUserAirportId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select Airport...</option>
                    {airports.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm leading-relaxed">
                <strong>Important:</strong> To set up their password, the user must go to the login screen and use the <strong>Sign Up</strong> tab with this exact email address. Once they sign up, their pre-approved account and permissions will be automatically linked.
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
              <h3 className="text-lg font-black text-slate-800 mb-2">
                Delete User?
              </h3>
              <p className="text-slate-500">
                Are you sure you want to delete the user{" "}
                <strong>{deleteConfirmUser.email}</strong>? This action cannot
                be undone.
              </p>
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
