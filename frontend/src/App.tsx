import React, { useState, useEffect } from 'react';
import { 
  Mail, BarChart2, Settings, LogOut, RefreshCw, Send, 
  Shield, Eye, EyeOff, User, CheckCircle, AlertTriangle, 
  Clock, X, Check, ArrowRight, Inbox
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { authAPI, emailAPI } from './api';
import type { UserStatus, EmailRecord } from './api';

export default function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState<string | null>(localStorage.getItem('email'));
  const [isLogin, setIsLogin] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // User & Google Status
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  
  // Dashboard state
  const [activeTab, setActiveTab] = useState<'inbox' | 'review' | 'analytics' | 'settings'>('inbox');
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Selected email for modal/details
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [editedReply, setEditedReply] = useState('');

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchStatus();
      fetchEmails();
    }
  }, [token]);

  // Read URL params (redirect callback check)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const detail = params.get('detail');
    
    if (status === 'success') {
      setSuccessMsg('Google Account linked successfully!');
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (status === 'error') {
      setErrorMsg(`Failed to link Google Account: ${detail || 'Unknown error'}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const status = await authAPI.getStatus();
      setUserStatus(status);
    } catch (err) {
      console.error('Failed to fetch status', err);
      handleLogout();
    }
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const list = await emailAPI.getEmails();
      setEmails(list);
    } catch (err) {
      console.error('Failed to fetch emails', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError('Please fill in all fields');
      return;
    }
    setAuthError('');
    setAuthLoading(true);

    try {
      let data;
      if (isLogin) {
        data = await authAPI.login(authEmail, authPassword);
      } else {
        data = await authAPI.signup(authEmail, authPassword);
      }
      setToken(data.access_token);
      setEmail(data.email);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    setToken(null);
    setEmail(null);
    setUserStatus(null);
    setEmails([]);
  };

  const handleLinkGoogle = async () => {
    try {
      const url = await authAPI.getGoogleAuthURL();
      window.location.href = url; // Redirect to google consent screen
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Could not initiate Google Auth. Check backend console.');
    }
  };

  const handleProcessEmails = async () => {
    setProcessing(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await emailAPI.triggerProcess();
      setSuccessMsg('Inbox scanning initiated! Scanning and classifying emails in background...');
      // Wait a bit and refresh emails list
      setTimeout(() => {
        fetchEmails();
        setProcessing(false);
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to scan inbox.');
      setProcessing(false);
    }
  };

  const handleSendReply = async (emailId: number, replyText: string) => {
    setActionLoading(emailId);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await emailAPI.sendReply(emailId, replyText);
      setSuccessMsg('Reply sent successfully!');
      setSelectedEmail(null);
      fetchEmails();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to send reply.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkipReply = async (emailId: number) => {
    setActionLoading(emailId);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await emailAPI.skipReply(emailId);
      setSuccessMsg('Email draft skipped.');
      setSelectedEmail(null);
      fetchEmails();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to skip email.');
    } finally {
      setActionLoading(null);
    }
  };

  // Helper getters
  const reviewEmails = emails.filter(e => e.status === 'Human Review');
  const autoSentEmails = emails.filter(e => e.status === 'Auto Sent');
  const skippedEmails = emails.filter(e => e.status === 'Skipped');

  // Chart statistics data
  const getIntentChartData = () => {
    const intents: { [key: string]: number } = { meeting: 0, support: 0, general: 0 };
    emails.forEach(e => {
      if (intents[e.intent] !== undefined) {
        intents[e.intent]++;
      } else {
        intents['general']++;
      }
    });
    return Object.keys(intents).map(k => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: intents[k] }));
  };

  const getStatusChartData = () => {
    const statuses: { [key: string]: number } = { 'Auto Sent': 0, 'Human Review': 0, 'Skipped': 0 };
    emails.forEach(e => {
      if (statuses[e.status] !== undefined) {
        statuses[e.status]++;
      }
    });
    return Object.keys(statuses).map(k => ({ name: k, value: statuses[k] }));
  };

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased text-gray-200">
      
      {/* NOTIFICATION TOASTS */}
      {(successMsg || errorMsg) && (
        <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-md animate-fade-in">
          {successMsg && (
            <div className="flex items-center gap-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl shadow-2xl backdrop-blur-md">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm font-medium">{successMsg}</div>
              <button onClick={() => setSuccessMsg('')} className="ml-auto hover:text-white text-emerald-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-3 bg-rose-950/80 border border-rose-500/30 text-rose-300 p-4 rounded-xl shadow-2xl backdrop-blur-md">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="text-sm font-medium">{errorMsg}</div>
              <button onClick={() => setErrorMsg('')} className="ml-auto hover:text-white text-rose-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {!token ? (
        // ==========================================
        // AUTHENTICATION SCREEN
        // ==========================================
        <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-[#070b13]">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-700/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="w-full max-w-md glass p-8 rounded-3xl shadow-3xl border border-gray-800/60 relative z-10 animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-primary-600 to-primary-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 mb-4">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">AI Email Assistant</h2>
              <p className="text-sm text-gray-400 mt-1">Automatic email answering & booking system</p>
            </div>

            {authError && (
              <div className="bg-rose-950/40 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl text-xs mb-5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-[#0a0f1d] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500">
                    <Shield className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0a0f1d] border border-gray-800 rounded-xl py-3 pl-10 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-primary-500/10 hover:shadow-primary-500/25 hover:from-primary-500 hover:to-primary-600 transition flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? 'Login to Dashboard' : 'Create Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-800 text-center">
              <button 
                onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}
                className="text-xs text-gray-400 hover:text-primary-400 transition"
              >
                {isLogin ? "New here? Create a free account" : "Already have an account? Login instead"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ==========================================
        // MAIN APP DASHBOARD
        // ==========================================
        <div className="flex-1 flex flex-col md:flex-row bg-[#080c14]">
          
          {/* SIDEBAR NAVIGATION */}
          <aside className="w-full md:w-64 shrink-0 bg-[#0c1220] border-r border-gray-800/80 flex flex-col">
            <div className="p-6 flex items-center gap-3 border-b border-gray-800/50">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-primary-500/10">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-white tracking-tight leading-tight">AI Assistant</h1>
                <span className="text-[10px] text-primary-400 font-semibold tracking-wider uppercase">Full-Stack Cloud</span>
              </div>
            </div>

            {/* Google Status Widget */}
            {userStatus && (
              <div className="m-4 p-4 rounded-2xl bg-[#0f182a]/60 border border-gray-800/60 text-xs">
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <User className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[150px]">{email}</span>
                </div>
                {userStatus.google_linked ? (
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Gmail & Calendar Connected</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-amber-400 bg-amber-950/20 border border-amber-500/20 px-2.5 py-1.5 rounded-lg font-semibold mb-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Google Account Unlinked</span>
                    </div>
                    <button 
                      onClick={handleLinkGoogle}
                      className="w-full py-1.5 px-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-center font-medium transition"
                    >
                      Connect Account
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* NAV ITEMS */}
            <nav className="flex-1 px-4 py-2 space-y-1">
              <button
                onClick={() => setActiveTab('inbox')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'inbox' 
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/15' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border border-transparent'
                }`}
              >
                <Inbox className="w-4 h-4" />
                <span>Inbox Overview</span>
                <span className="ml-auto bg-[#1a233b] text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium">
                  {emails.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('review')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'review' 
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/15' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border border-transparent'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Human Review</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                  reviewEmails.length > 0 ? 'bg-amber-950 text-amber-400' : 'bg-[#1a233b] text-gray-300'
                }`}>
                  {reviewEmails.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'analytics' 
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/15' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border border-transparent'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                <span>Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'settings' 
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/15' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border border-transparent'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Setup Guide</span>
              </button>
            </nav>

            {/* LOGOUT BUTTON */}
            <div className="p-4 border-t border-gray-800/50 mt-auto">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-400 hover:text-white hover:bg-rose-950/20 border border-transparent hover:border-rose-500/10 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout Session</span>
              </button>
            </div>
          </aside>

          {/* MAIN WORKSPACE */}
          <main className="flex-1 flex flex-col overflow-y-auto">
            
            {/* HEADER */}
            <header className="p-6 bg-[#0c1220]/50 border-b border-gray-800/50 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {activeTab === 'inbox' && 'Inbox Overview'}
                  {activeTab === 'review' && 'Human-in-the-Loop Review'}
                  {activeTab === 'analytics' && 'Email Statistics'}
                  {activeTab === 'settings' && 'System Setup & Settings'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeTab === 'inbox' && 'View all categorized incoming emails and response logs'}
                  {activeTab === 'review' && 'Approve or customize draft responses before they are sent'}
                  {activeTab === 'analytics' && 'Visualize classification breakdown and agent metrics'}
                  {activeTab === 'settings' && 'How to configure Google credentials and cloud details'}
                </p>
              </div>

              {/* ACTION: PROCESS EMAILS */}
              {userStatus?.google_linked && (
                <button
                  disabled={processing}
                  onClick={handleProcessEmails}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-xl shadow-lg shadow-primary-500/10 hover:shadow-primary-500/25 hover:from-primary-500 hover:to-primary-600 font-semibold text-xs transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} />
                  <span>{processing ? 'Scanning Gmail...' : 'Scan Unread Emails'}</span>
                </button>
              )}
            </header>

            {/* TAB CONTENTS */}
            <div className="p-6 flex-1 max-w-6xl w-full mx-auto">
              
              {/* ==========================================
                  TAB 1: INBOX OVERVIEW
                  ========================================== */}
              {activeTab === 'inbox' && (
                <div className="space-y-6">
                  {/* METRIC CARD STRIP */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="glass p-5 rounded-2xl border border-gray-800/60">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Handled</div>
                      <div className="text-3xl font-extrabold text-white mt-2">{emails.length}</div>
                    </div>
                    <div className="glass p-5 rounded-2xl border border-gray-800/60">
                      <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Pending Review</div>
                      <div className="text-3xl font-extrabold text-amber-400 mt-2">{reviewEmails.length}</div>
                    </div>
                    <div className="glass p-5 rounded-2xl border border-gray-800/60">
                      <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Replied (Auto)</div>
                      <div className="text-3xl font-extrabold text-emerald-400 mt-2">{autoSentEmails.length}</div>
                    </div>
                    <div className="glass p-5 rounded-2xl border border-gray-800/60">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Skipped / Ignored</div>
                      <div className="text-3xl font-extrabold text-gray-300 mt-2">{skippedEmails.length}</div>
                    </div>
                  </div>

                  {/* EMAILS TABLE */}
                  <div className="glass rounded-2xl border border-gray-800/60 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between bg-slate-950/20">
                      <span className="font-bold text-sm">All Processed Emails</span>
                      <button onClick={fetchEmails} className="text-xs text-primary-400 hover:text-primary-300 font-semibold flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh List
                      </button>
                    </div>

                    {loading ? (
                      <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
                        <span className="text-sm">Fetching email records...</span>
                      </div>
                    ) : emails.length === 0 ? (
                      <div className="p-12 text-center text-gray-400">
                        <Inbox className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                        <p className="text-sm font-semibold">No emails processed yet.</p>
                        <p className="text-xs text-gray-500 mt-1">Make sure Google status is linked, then click 'Scan Unread Emails' above.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-gray-800 text-gray-400 font-semibold bg-slate-950/10">
                              <th className="py-4 px-6">Sender</th>
                              <th className="py-4 px-6">Subject</th>
                              <th className="py-4 px-6">Intent Type</th>
                              <th className="py-4 px-6">Reply Status</th>
                              <th className="py-4 px-6 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/40">
                            {emails.map((email) => (
                              <tr key={email.id} className="hover:bg-slate-900/10 transition group">
                                <td className="py-4 px-6 font-medium text-gray-200 max-w-[200px] truncate">{email.sender}</td>
                                <td className="py-4 px-6 text-gray-300 font-medium max-w-[250px] truncate">{email.subject}</td>
                                <td className="py-4 px-6">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    email.intent === 'meeting' ? 'bg-indigo-950 text-indigo-300' :
                                    email.intent === 'support' ? 'bg-cyan-950 text-cyan-300' :
                                    'bg-slate-800 text-slate-300'
                                  }`}>
                                    {email.intent.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-4 px-6">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    email.status === 'Auto Sent' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/20' :
                                    email.status === 'Human Review' ? 'bg-amber-950 text-amber-300 border border-amber-500/20' :
                                    'bg-slate-800 text-gray-400'
                                  }`}>
                                    {email.status === 'Auto Sent' && <Check className="w-3.5 h-3.5" />}
                                    {email.status === 'Human Review' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                                    {email.status}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <button
                                    onClick={() => { setSelectedEmail(email); setEditedReply(email.ai_reply || ''); }}
                                    className="text-xs text-primary-400 hover:text-white bg-slate-800 hover:bg-primary-600 px-3 py-1.5 rounded-lg font-semibold transition"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==========================================
                  TAB 2: HUMAN REVIEW PANEL
                  ========================================== */}
              {activeTab === 'review' && (
                <div className="space-y-6">
                  {reviewEmails.length === 0 ? (
                    <div className="glass p-12 text-center text-gray-400 rounded-3xl border border-gray-800/60 max-w-lg mx-auto mt-12">
                      <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                      <p className="text-base font-bold text-white">Inbox Clean!</p>
                      <p className="text-xs text-gray-500 mt-1">There are no generated email replies awaiting human review or confirmation.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6">
                      {reviewEmails.map((email) => (
                        <div key={email.id} className="glass p-6 rounded-3xl border border-gray-800/60 space-y-4 animate-fade-in">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/60 pb-4">
                            <div>
                              <div className="text-xs text-gray-400">Sender: <span className="font-semibold text-gray-200">{email.sender}</span></div>
                              <h3 className="font-bold text-lg text-white mt-1">{email.subject}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300">
                                {email.intent.toUpperCase()}
                              </span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300">
                                HIGH PRIORITY
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* EMAIL CONTENT */}
                            <div className="bg-slate-950/40 border border-gray-900 rounded-2xl p-5 space-y-2">
                              <div className="text-xs text-primary-400 font-bold uppercase tracking-wider">Incoming Email Content:</div>
                              <div className="text-xs text-gray-400 font-medium">Received {new Date(email.created_at).toLocaleString()}</div>
                              <div className="text-sm text-gray-300 whitespace-pre-wrap mt-3 bg-black/10 p-3 rounded-lg border border-gray-950 max-h-[250px] overflow-y-auto">
                                {email.body || '(Empty body content)'}
                              </div>
                            </div>

                            {/* AI DRAFT RESPONSE */}
                            <div className="flex flex-col space-y-2">
                              <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider">AI Draft Response:</div>
                              <textarea
                                value={selectedEmail?.id === email.id ? editedReply : email.ai_reply}
                                onChange={(e) => {
                                  setSelectedEmail(email);
                                  setEditedReply(e.target.value);
                                }}
                                rows={8}
                                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-2xl p-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none flex-1"
                              />
                            </div>
                          </div>

                          {/* ACTION PANEL */}
                          <div className="flex justify-end gap-3 border-t border-gray-800/60 pt-4 mt-2">
                            <button
                              disabled={actionLoading !== null}
                              onClick={() => handleSkipReply(email.id)}
                              className="px-4 py-2 border border-gray-800 hover:border-gray-700 bg-slate-900/60 text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition"
                            >
                              Skip Reply
                            </button>
                            <button
                              disabled={actionLoading !== null}
                              onClick={() => {
                                const finalReply = selectedEmail?.id === email.id ? editedReply : email.ai_reply;
                                handleSendReply(email.id, finalReply);
                              }}
                              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition flex items-center gap-2"
                            >
                              {actionLoading === email.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>Approve & Send Email</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ==========================================
                  TAB 3: ANALYTICS & CHARTS
                  ========================================== */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {emails.length === 0 ? (
                    <div className="glass p-12 text-center text-gray-400 rounded-3xl border border-gray-800/60 max-w-lg mx-auto mt-12">
                      <BarChart2 className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                      <p className="text-sm font-semibold">No Analytics Data Available</p>
                      <p className="text-xs text-gray-500 mt-1">Please process some emails first to render statistics.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* INTENTS BAR CHART */}
                      <div className="glass p-6 rounded-3xl border border-gray-800/60 flex flex-col h-[400px]">
                        <h3 className="font-bold text-base mb-6">Intent Distribution</h3>
                        <div className="flex-1 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={getIntentChartData()}>
                              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                              <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                              <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* STATUS PIE CHART */}
                      <div className="glass p-6 rounded-3xl border border-gray-800/60 flex flex-col h-[400px]">
                        <h3 className="font-bold text-base mb-6">Response Status</h3>
                        <div className="flex-1 w-full flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getStatusChartData()}
                                cx="50%"
                                cy="45%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {getStatusChartData().map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                              <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==========================================
                  TAB 4: SETUP GUIDE & SETTINGS
                  ========================================= */}
              {activeTab === 'settings' && (
                <div className="glass p-8 rounded-3xl border border-gray-800/60 space-y-6 max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 border-b border-gray-800/50 pb-4">
                    <Shield className="w-6 h-6 text-primary-500" />
                    <h3 className="font-bold text-lg text-white">Full-Stack Cloud Configuration Guide</h3>
                  </div>

                  <p className="text-sm text-gray-300 leading-relaxed">
                    This project has been transformed from a single-machine script into a clean Full-Stack API and Frontend dashboard. Below are the steps needed to connect everything for live cloud deployment:
                  </p>

                  <div className="space-y-4 pt-2">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 font-bold flex items-center justify-center shrink-0 text-sm mt-0.5">1</div>
                      <div>
                        <h4 className="font-semibold text-white text-sm">Convert Google Client Credentials to Web Application</h4>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Your current credentials file is an <code className="bg-slate-900 px-1 py-0.5 rounded text-primary-300">installed</code> (desktop) application type. To run in the cloud, go to the Google Cloud Console &gt; APIs &amp; Services &gt; Credentials, create new credentials of type **Web Application**, download the JSON file and overwrite <code className="bg-slate-900 px-1 py-0.5 rounded text-primary-300">backend/credentials.json</code>.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 font-bold flex items-center justify-center shrink-0 text-sm mt-0.5">2</div>
                      <div>
                        <h4 className="font-semibold text-white text-sm">Add Authorized Redirect URIs in Google Cloud Console</h4>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          While editing your Google OAuth credentials on the console, make sure to add the following redirect URI in the **Authorized redirect URIs** section:
                          <code className="block bg-slate-950 p-2 border border-gray-800 rounded-lg text-emerald-400 text-xs font-mono mt-1.5">http://localhost:8000/auth/google/callback</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 font-bold flex items-center justify-center shrink-0 text-sm mt-0.5">3</div>
                      <div>
                        <h4 className="font-semibold text-white text-sm">Swap DB URL to PostgreSQL for cloud deployment</h4>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          The backend currently creates a local SQLite database file named <code className="bg-slate-900 px-1.5 py-0.5 rounded">email_system.db</code> for immediate testing. In production, change the <code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-300">DATABASE_URL</code> variable inside <code className="bg-slate-900 px-1.5 py-0.5 rounded">backend/.env</code> to point to a PostgreSQL connection URI (e.g. from Neon or Supabase) to enable permanent remote storage.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* DETAIL DIALOG / MODAL */}
          {selectedEmail && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="w-full max-w-2xl bg-[#0c1220] border border-gray-800 rounded-3xl shadow-2xl p-6 space-y-4">
                
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-bold text-lg text-white">Email Conversation Record</h3>
                  <button onClick={() => setSelectedEmail(null)} className="text-gray-500 hover:text-white transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-gray-500 block">SENDER</span>
                      <span className="text-gray-200 font-semibold">{selectedEmail.sender}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">INTENT DETECTED</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 mt-0.5">
                        {selectedEmail.intent.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">SUBJECT</span>
                      <span className="text-gray-200 font-semibold">{selectedEmail.subject}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">STATUS</span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedEmail.status === 'Auto Sent' ? 'bg-emerald-950 text-emerald-300' :
                        selectedEmail.status === 'Human Review' ? 'bg-amber-950 text-amber-300' :
                        'bg-slate-800 text-gray-400'
                      } mt-0.5`}>
                        {selectedEmail.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-gray-500 block">INCOMING BODY</span>
                    <div className="bg-[#060a12] p-4 border border-gray-900 rounded-xl text-sm text-gray-300 whitespace-pre-wrap max-h-[150px] overflow-y-auto font-mono">
                      {selectedEmail.body}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-emerald-400 font-bold block">AI DRAFT REPLY</span>
                    {selectedEmail.status === 'Human Review' ? (
                      <textarea
                        value={editedReply}
                        onChange={(e) => setEditedReply(e.target.value)}
                        rows={5}
                        className="w-full bg-[#060a12] border border-gray-800 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono resize-none"
                      />
                    ) : (
                      <div className="bg-[#060a12] p-4 border border-gray-900 rounded-xl text-sm text-gray-300 whitespace-pre-wrap max-h-[150px] overflow-y-auto font-mono">
                        {selectedEmail.ai_reply || '(No reply sent)'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
                  <button 
                    onClick={() => setSelectedEmail(null)}
                    className="px-4 py-2 bg-slate-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition"
                  >
                    Close
                  </button>

                  {selectedEmail.status === 'Human Review' && (
                    <>
                      <button
                        onClick={() => handleSkipReply(selectedEmail.id)}
                        className="px-4 py-2 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-semibold transition"
                      >
                        Skip Draft
                      </button>
                      <button
                        onClick={() => handleSendReply(selectedEmail.id, editedReply)}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Reply</span>
                      </button>
                    </>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* FOOTER */}
      <footer className="py-4 text-center text-xs text-gray-500 bg-[#060a12] border-t border-gray-800/40">
        <span>© {new Date().getFullYear()} AI Email Assistant. Developed for Full-Stack Engineering Portfolios.</span>
      </footer>

    </div>
  );
}
