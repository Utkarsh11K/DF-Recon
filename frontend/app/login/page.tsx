'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Eye, EyeOff, ArrowRight, Shield, CheckCircle2,
  ChevronLeft, Sparkles, Lock, Mail, AlertCircle, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

// ── Animated background blobs ────────────────────────────────────────────────

function Blobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-900/20 blur-[80px]" />
      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />
    </div>
  );
}

// ── Live metrics ticker ──────────────────────────────────────────────────────

function LiveMetric() {
  const metrics = [
    { label: 'Records reconciled today', value: '2.4M', icon: Activity, color: 'text-emerald-400' },
    { label: 'Active reconciliations',   value: '47',   icon: Zap,      color: 'text-indigo-400' },
    { label: 'Average match rate',        value: '97.8%',icon: Shield,   color: 'text-violet-400' },
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % metrics.length), 3000);
    return () => clearInterval(t);
  }, []);

  const m = metrics[idx];
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-2"
        >
          <m.icon size={12} className={m.color} />
          <span className={cn('text-xs font-bold', m.color)}>{m.value}</span>
          <span className="text-xs text-slate-500">{m.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Main Login Page ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { loadDemo } = useStore();
  const { toast } = useToast();

  const [form, setForm]           = useState({ email: '', password: '' });
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [authMode, setAuthMode]   = useState<'signin' | 'sso'>('signin');

  const demoAccounts = [
    { email: 'admin@dfrecon.io',   role: 'Admin',      color: 'from-indigo-500 to-violet-500' },
    { email: 'analyst@cjbs.com',   role: 'Analyst',    color: 'from-emerald-500 to-teal-500' },
    { email: 'auditor@etairos.io', role: 'Auditor',    color: 'from-amber-500 to-orange-500' },
  ];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email.trim())                      e.email    = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password)                          e.password = 'Password is required';
    else if (form.password.length < 4)           e.password = 'Password too short';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    // Simulate auth — any valid-format credentials work
    setTimeout(() => {
      setLoading(false);
      toast(`Welcome back, ${form.email.split('@')[0]}!`, 'success');
      router.push('/');
    }, 1200);
  };

  const handleDemoLogin = (email: string) => {
    setForm({ email, password: 'demo1234' });
    setLoading(true);
    setTimeout(() => {
      loadDemo();
      setLoading(false);
      toast('Demo workspace loaded — welcome!', 'success');
      router.push('/');
    }, 1000);
  };

  const handleSSO = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast('SSO authentication successful', 'success');
      router.push('/');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">

      {/* ── Left panel — branding ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative flex-col justify-between p-12 overflow-hidden">
        <Blobs />

        {/* Top nav */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">DF-Recon</p>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">Enterprise Platform</p>
            </div>
          </Link>
          <Link href="/landing"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronLeft size={13} /> Back to site
          </Link>
        </div>

        {/* Centre content */}
        <div className="relative z-10 max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-4xl xl:text-5xl font-black text-white mb-6 leading-tight">
              Your data,<br />
              <span className="text-gradient">perfectly reconciled.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed mb-10">
              Log in to access your reconciliation workspace, review audit trails
              and run your next batch in minutes.
            </p>

            {/* Feature pills */}
            <div className="space-y-3">
              {[
                { icon: Zap,          text: 'Auto-detect schema & primary keys from any file format' },
                { icon: Shield,       text: 'Enterprise-grade validation rules with full audit trail' },
                { icon: Activity,     text: '97%+ average match rate across 500M+ records reconciled' },
                { icon: CheckCircle2, text: 'Export PDF, XLSX and JSON reports in one click' },
              ].map(({ icon: Icon, text }, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={13} className="text-indigo-400" />
                  </div>
                  <span className="text-sm text-slate-400 leading-relaxed">{text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom live metric */}
        <div className="relative z-10">
          <div className="glass-dark rounded-xl px-4 py-3 border border-white/5 inline-block">
            <LiveMetric />
          </div>
        </div>
      </div>

      {/* ── Right panel — auth form ───────────────────────────────────────── */}
      <div className="flex-1 lg:w-[45%] xl:w-[40%] flex flex-col justify-center px-6 py-12 sm:px-12 bg-slate-950 lg:bg-slate-900/50 lg:border-l lg:border-slate-800/50 relative overflow-hidden">
        {/* Mobile blobs */}
        <div className="lg:hidden absolute inset-0">
          <Blobs />
        </div>

        <div className="relative z-10 w-full max-w-sm mx-auto">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-white">DF-Recon</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-2xl font-black text-white mb-1">Welcome back</h1>
            <p className="text-sm text-slate-400 mb-8">Sign in to your reconciliation workspace</p>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl mb-7">
              {[
                { id: 'signin', label: 'Email' },
                { id: 'sso',    label: 'SSO / SAML' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setAuthMode(id as 'signin' | 'sso')}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200',
                    authMode === id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {authMode === 'signin' ? (
                <motion.form
                  key="email"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  {/* Email */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">Work email</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors(v => ({ ...v, email: '' })); }}
                        placeholder="you@company.com"
                        className={cn(
                          'w-full pl-9 pr-3 py-2.5 bg-slate-800/60 border rounded-xl text-sm text-white placeholder:text-slate-600',
                          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200',
                          errors.email ? 'border-red-500/50' : 'border-slate-700/60 hover:border-slate-600'
                        )}
                      />
                    </div>
                    {errors.email && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1 text-xs text-red-400 mt-1">
                        <AlertCircle size={11} /> {errors.email}
                      </motion.p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300">Password</label>
                      <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Forgot?</button>
                    </div>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(v => ({ ...v, password: '' })); }}
                        placeholder="Enter your password"
                        className={cn(
                          'w-full pl-9 pr-10 py-2.5 bg-slate-800/60 border rounded-xl text-sm text-white placeholder:text-slate-600',
                          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200',
                          errors.password ? 'border-red-500/50' : 'border-slate-700/60 hover:border-slate-600'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {errors.password && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1 text-xs text-red-400 mt-1">
                        <AlertCircle size={11} /> {errors.password}
                      </motion.p>
                    )}
                  </div>

                  {/* Remember me */}
                  <div className="flex items-center gap-2">
                    <input id="remember" type="checkbox" className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                    <label htmlFor="remember" className="text-xs text-slate-400 cursor-pointer">Keep me signed in for 30 days</label>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200',
                      'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/25',
                      'hover:from-indigo-500 hover:to-indigo-400 hover:shadow-indigo-500/40',
                      'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}
                  >
                    {loading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}>
                          <Zap size={14} />
                        </motion.div>
                        Signing in…
                      </>
                    ) : (
                      <>Sign In <ArrowRight size={14} /></>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="sso"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">Organisation domain</label>
                    <input
                      type="text"
                      placeholder="e.g. yourcompany.com"
                      className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSSO}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-indigo-400 transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}><Zap size={14} /></motion.div>Connecting…</>
                    ) : (
                      <>Continue with SSO <ArrowRight size={14} /></>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 text-center">Supports Okta, Azure AD, Google Workspace & custom SAML</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-600">or try a demo account</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Demo accounts */}
            <div className="space-y-2">
              {demoAccounts.map(({ email, role, color }) => (
                <button
                  key={email}
                  onClick={() => handleDemoLogin(email)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/60 transition-all duration-200 group disabled:opacity-50"
                >
                  <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0', color)}>
                    {role[0]}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">{email}</div>
                    <div className="text-[10px] text-slate-500">{role} · Demo workspace included</div>
                  </div>
                  <Sparkles size={12} className="text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>

            {/* Footer */}
            <p className="text-xs text-slate-600 text-center mt-8">
              By signing in you agree to our{' '}
              <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Terms</span>
              {' & '}
              <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Privacy Policy</span>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
