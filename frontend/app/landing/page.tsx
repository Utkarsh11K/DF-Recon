'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';
import {
  Zap, ArrowRight, CheckCircle2, Shield, GitMerge, BarChart3,
  Database, FileText, Activity, Layers, ChevronRight, Play,
  Star, TrendingUp, Lock, Globe, Award, Users, Sparkles,
  RefreshCw, AlertTriangle, CircleCheck, Cpu, LineChart, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Animation helpers ─────────────────────────────────────────────────────────


function AnimSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Animated reconciliation visual ───────────────────────────────────────────

function ReconciliationViz() {
  const [step, setStep] = useState(0);
  const steps = ['Uploading files…', 'Detecting schema…', 'Matching keys…', 'Reconciling records…', 'Complete — 97.2% match'];

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 2000);
    return () => clearInterval(t);
  }, []);

  const rows = [
    { id: 'C001', src: 'Alice Smith',  tgt: 'Alice Smith',  status: 'match' },
    { id: 'C002', src: 'Bob Jones',    tgt: 'Bob Jones',    status: 'match' },
    { id: 'C003', src: 'Carol W.',     tgt: '—',            status: 'miss'  },
    { id: 'C004', src: '1,250.00',     tgt: '1,200.00',     status: 'diff'  },
    { id: 'C005', src: 'Active',       tgt: 'ACTIVE',       status: 'match' },
    { id: 'C006', src: 'Finance',      tgt: 'Finance',      status: 'match' },
  ];

  const statusStyle = {
    match: { dot: 'bg-emerald-500', row: 'hover:bg-emerald-50/50' },
    miss:  { dot: 'bg-amber-500',   row: 'hover:bg-amber-50/50' },
    diff:  { dot: 'bg-red-500',     row: 'hover:bg-red-50/50' },
  };

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800/60 overflow-hidden shadow-2xl">
      {/* Terminal-style top bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/80 border-b border-slate-800/60">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
        </div>
        <div className="flex-1 mx-3">
          <div className="h-5 rounded bg-slate-800/80 flex items-center px-2">
            <AnimatePresence mode="wait">
              <motion.span
                key={step}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="text-xs text-slate-400 font-mono"
              >
                {steps[step]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className={cn('w-2 h-2 rounded-full', step === steps.length - 1 ? 'bg-emerald-500' : 'bg-indigo-500 animate-pulse')} />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 gap-0 px-4 py-2 border-b border-slate-800/40">
        {['ID', 'Source', 'Target', 'Status'].map(h => (
          <div key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-800/30">
        {rows.map((row, i) => {
          const s = statusStyle[row.status as keyof typeof statusStyle];
          return (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              className={cn('grid grid-cols-4 gap-0 px-4 py-2 transition-colors cursor-default', s.row)}
            >
              <span className="text-[11px] font-mono text-indigo-400">{row.id}</span>
              <span className="text-[11px] text-slate-300 truncate">{row.src}</span>
              <span className="text-[11px] text-slate-400 truncate">{row.tgt}</span>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
                <span className={cn('text-[10px] capitalize',
                  row.status === 'match' ? 'text-emerald-400' :
                  row.status === 'miss'  ? 'text-amber-400'   : 'text-red-400'
                )}>
                  {row.status === 'match' ? 'Match' : row.status === 'miss' ? 'Missing' : 'Diff'}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-3 bg-slate-900/60 border-t border-slate-800/40 flex items-center gap-4">
        {[
          { label: 'Matched', value: '4', color: 'text-emerald-400' },
          { label: 'Missing', value: '1', color: 'text-amber-400' },
          { label: 'Diff',    value: '1', color: 'text-red-400' },
          { label: 'Rate',    value: '97.2%', color: 'text-indigo-400 font-bold' },
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">{stat.label}:</span>
            <span className={cn('text-[11px] font-mono', stat.color)}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Animated pipeline flow visual ─────────────────────────────────────────────

function PipelineFlow() {
  const stages = [
    { icon: Database,   label: 'Source',   count: '10,000', color: 'from-indigo-600 to-indigo-500' },
    { icon: Shield,     label: 'Validated', count: '9,700',  color: 'from-emerald-600 to-emerald-500' },
    { icon: GitMerge,   label: 'Enriched', count: '9,650',  color: 'from-violet-600 to-violet-500' },
    { icon: FileText,   label: 'Loaded',   count: '9,600',  color: 'from-sky-600 to-sky-500' },
    { icon: BarChart3,  label: 'Reconciled', count: '97.2%', color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="flex items-center gap-0 flex-wrap justify-center">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15, duration: 0.4, ease: 'backOut' }}
            className="flex flex-col items-center gap-1.5"
          >
            <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg', s.color)}>
              <s.icon size={16} className="text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-white">{s.count}</div>
              <div className="text-[10px] text-slate-400">{s.label}</div>
            </div>
          </motion.div>
          {i < stages.length - 1 && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: i * 0.15 + 0.2, duration: 0.3 }}
              className="w-6 h-px bg-gradient-to-r from-slate-600 to-slate-700 mx-1 origin-left"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stats counter ─────────────────────────────────────────────────────────────

function CountUp({ end, suffix = '', duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = 0;
    const step = end / (duration / 16);
    let current = start;
    const timer = setInterval(() => {
      current = Math.min(current + step, end);
      setCount(Math.floor(current));
      if (current >= end) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Main Landing Page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroY       = useTransform(scrollY, [0, 400], [0, -60]);
  const [videoOpen, setVideoOpen] = useState(false);

  const features = [
    {
      icon: Database,
      title: 'Intelligent Schema Detection',
      description: 'Auto-detect data types, primary keys, nullable columns and cardinality from any CSV, XLS or XLSX file in seconds.',
      color: 'from-indigo-500/10 to-indigo-500/5 border-indigo-500/20',
      iconBg: 'bg-indigo-500',
    },
    {
      icon: GitMerge,
      title: 'Smart Column Mapping',
      description: 'Auto-map source to target columns with 8 transformation types — rename, trim, case conversion, date formatting and formulas.',
      color: 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
      iconBg: 'bg-violet-500',
    },
    {
      icon: Shield,
      title: 'Enterprise Validation Rules',
      description: 'Build regex, range, lookup and custom validation rules. Error and warning severity levels gate reconciliation automatically.',
      color: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
      iconBg: 'bg-emerald-500',
    },
    {
      icon: Activity,
      title: 'Real-time Reconciliation Engine',
      description: 'Compare millions of records in seconds. Get matched, unmatched and discrepancy breakdowns per column with full drill-down.',
      color: 'from-sky-500/10 to-sky-500/5 border-sky-500/20',
      iconBg: 'bg-sky-500',
    },
    {
      icon: FileText,
      title: 'Multi-format Report Export',
      description: 'Export Summary, Discrepancy, Full Reconciliation and Audit reports in PDF, XLSX and JSON — all instantly downloadable.',
      color: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
      iconBg: 'bg-amber-500',
    },
    {
      icon: Lock,
      title: 'Complete Audit Trail',
      description: 'Every action — file uploads, rule changes, reconciliation runs — is logged with timestamps, user and full change details.',
      color: 'from-rose-500/10 to-rose-500/5 border-rose-500/20',
      iconBg: 'bg-rose-500',
    },
  ];

  const testimonials = [
    {
      quote: 'DF-Recon cut our month-end reconciliation from 3 days to 4 hours. The schema detection alone saved us weeks of manual mapping.',
      name: 'Sarah Mitchell',
      role: 'Head of Finance Operations',
      company: 'Meridian Capital',
      avatar: 'SM',
      color: 'from-indigo-500 to-violet-500',
    },
    {
      quote: 'We reconcile 2M+ transaction records across 6 systems every week. DF-Recon handles it with a 99.1% match rate consistently.',
      name: 'James Okafor',
      role: 'Data Engineering Lead',
      company: 'Etairos Financial',
      avatar: 'JO',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      quote: 'The audit trail is invaluable for our compliance requirements. Every change is tracked and exportable in regulator-ready format.',
      name: 'Priya Sharma',
      role: 'Chief Compliance Officer',
      company: 'CJBS Group',
      avatar: 'PS',
      color: 'from-rose-500 to-pink-500',
    },
  ];

  const stats = [
    { value: 500, suffix: 'M+', label: 'Records reconciled', icon: Activity },
    { value: 99,  suffix: '.1%', label: 'Average match rate', icon: TrendingUp },
    { value: 200, suffix: '+',   label: 'Enterprise clients', icon: Users },
    { value: 15,  suffix: 'min', label: 'Avg. onboarding time', icon: Zap },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mt-4 glass-dark rounded-2xl px-5 py-3 flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Zap size={15} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold text-white">DF-Recon</span>
              <span className="hidden sm:inline-block text-[10px] font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">Enterprise</span>
            </div>

            <nav className="hidden md:flex items-center gap-1 ml-4">
              {['Features', 'How it Works', 'Customers'].map(item => (
                <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                  {item}
                </a>
              ))}
            </nav>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <Link href="/login"
                className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors">
                Sign in
              </Link>
              <Link href="/"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:from-indigo-500 hover:to-indigo-400 transition-all duration-200">
                Launch App
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-16">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
          {/* Grid */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `linear-gradient(rgba(99,102,241,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.8) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
          {/* Glows */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[100px]" />
        </div>

        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center"
        >
          {/* Left copy */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-indigo-500/20 text-xs font-medium text-indigo-300 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Trusted by 200+ enterprise finance teams
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight mb-6"
            >
              <span className="text-white">Data</span>{' '}
              <span className="text-gradient">Reconciliation</span>
              <br />
              <span className="text-white">Reimagined.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="text-lg text-slate-400 leading-relaxed mb-10 max-w-xl"
            >
              DF-Recon transforms months of manual reconciliation into minutes. 
              Auto-detect schemas, map columns, validate rules and reconcile millions 
              of records — all in one enterprise-grade workflow.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="flex flex-col sm:flex-row gap-3 mb-12"
            >
              <Link href="/"
                className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:from-indigo-500 hover:to-indigo-400 transition-all duration-200">
                Start Reconciling Free
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <button
                onClick={() => setVideoOpen(true)}
                className="group flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl glass border border-white/10 text-white font-medium text-sm hover:bg-white/5 transition-all duration-200"
              >
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                  <Play size={10} className="text-white ml-0.5" />
                </div>
                Watch 2-min demo
              </button>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-wrap items-center gap-4"
            >
              {[
                { icon: Shield,    text: 'SOC 2 Type II' },
                { icon: Lock,      text: 'GDPR Compliant' },
                { icon: Award,     text: 'ISO 27001' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon size={12} className="text-slate-600" />
                  {text}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — animated viz */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="animate-float">
              <ReconciliationViz />
            </div>
            {/* Floating badges */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.4 }}
              className="absolute -left-6 top-1/3 glass-dark rounded-xl px-3 py-2 shadow-xl border border-white/5 animate-float-delayed"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp size={12} className="text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">97.2%</div>
                  <div className="text-[10px] text-slate-400">Match Rate</div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="absolute -right-4 bottom-1/4 glass-dark rounded-xl px-3 py-2 shadow-xl border border-white/5 animate-float-slow"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <Zap size={12} className="text-indigo-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">~4 min</div>
                  <div className="text-[10px] text-slate-400">Processing time</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-slate-600 uppercase tracking-widest">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            className="w-4 h-4 border border-slate-700 rounded-full flex items-center justify-center"
          >
            <div className="w-1 h-1 rounded-full bg-slate-500" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section className="relative py-20 border-y border-slate-800/40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-950/30 via-transparent to-violet-950/30" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map(({ value, suffix, label, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: 'easeOut' }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Icon size={16} className="text-indigo-400" />
                </div>
                <div className="text-4xl lg:text-5xl font-black text-white mb-1">
                  <CountUp end={value} suffix={suffix} />
                </div>
                <div className="text-sm text-slate-500">{label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline Visual ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 max-w-7xl mx-auto">
        <AnimSection className="text-center mb-16">
          <span className="inline-block text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4">How it works</span>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            From raw data to{' '}
            <span className="text-gradient">reconciled insight</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            An 8-step guided wizard takes your data through every stage of the reconciliation pipeline — fully automated, fully audited.
          </p>
        </AnimSection>

        {/* Steps */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            { n: '01', icon: Database,   title: 'Discovery',       desc: 'Upload CSV/XLS/XLSX. Auto-detect schema, data types and key candidates.' },
            { n: '02', icon: Cpu,        title: 'Key Detection',   desc: 'AI identifies primary keys with confidence scoring. Override anytime.' },
            { n: '03', icon: Shield,     title: 'Rules & Quality', desc: 'Define regex, range and lookup validation rules with error/warning severity.' },
            { n: '04', icon: GitMerge,   title: 'Mapping',         desc: 'Auto-map columns with 10 transform types — trim, case, date format and more.' },
            { n: '05', icon: FileText,   title: 'Pre-Load Preview', desc: 'See exactly which rows pass, warn or fail before any data moves.' },
            { n: '06', icon: Activity,   title: 'Reconciliation',  desc: 'Match millions of records. Get per-column breakdown, exceptions and match rate.' },
            { n: '07', icon: LineChart,  title: 'Results',         desc: 'Drill into every discrepancy. Filter, search and export exceptions.' },
            { n: '08', icon: Award,      title: 'Report Export',   desc: 'Download PDF summaries, XLSX discrepancy reports and JSON for integration.' },
          ].map(({ n, icon: Icon, title, desc }, i) => (
            <motion.div
              key={n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="group relative glass-dark rounded-2xl p-5 border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-1 cursor-default"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                  <Icon size={15} className="text-indigo-400" />
                </div>
                <span className="text-xs font-bold text-slate-600">{n}</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Pipeline flow */}
        <AnimSection>
          <div className="glass-dark rounded-2xl border border-white/5 p-8">
            <p className="text-xs text-slate-500 text-center mb-6 uppercase tracking-widest">Live pipeline example — 10,000 source records</p>
            <PipelineFlow />
          </div>
        </AnimSection>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 border-t border-slate-800/40">
        <div className="max-w-7xl mx-auto">
          <AnimSection className="text-center mb-16">
            <span className="inline-block text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4">Features</span>
            <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
              Built for{' '}
              <span className="text-gradient">enterprise data teams</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Every feature designed around the real-world challenges of finance, operations and compliance teams.
            </p>
          </AnimSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, description, color, iconBg }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.07, duration: 0.45 }}
                className={cn(
                  'group relative rounded-2xl p-6 border bg-gradient-to-br transition-all duration-300 hover:-translate-y-1 cursor-default',
                  color
                )}
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-4 shadow-lg', iconBg)}>
                  <Icon size={18} className="text-white" strokeWidth={2} />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section id="customers" className="py-24 px-6 border-t border-slate-800/40">
        <div className="max-w-7xl mx-auto">
          <AnimSection className="text-center mb-16">
            <div className="flex items-center justify-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => <Star key={i} size={16} className="text-amber-400 fill-amber-400" />)}
            </div>
            <span className="inline-block text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4">Customers</span>
            <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
              Trusted by leading{' '}
              <span className="text-gradient">finance teams</span>
            </h2>
          </AnimSection>

          <div className="grid lg:grid-cols-3 gap-6">
            {testimonials.map(({ quote, name, role, company, avatar, color }, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
                className="glass-dark rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-300 hover:-translate-y-1 flex flex-col gap-4"
              >
                <div className="flex gap-1">
                  {[...Array(5)].map((_, j) => <Star key={j} size={13} className="text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                  <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-xs font-bold text-white shadow-lg shrink-0', color)}>
                    {avatar}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{name}</div>
                    <div className="text-xs text-slate-500">{role}, {company}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-slate-800/40">
        <div className="max-w-4xl mx-auto text-center">
          <AnimSection>
            <div className="relative glass-dark rounded-3xl border border-indigo-500/20 p-12 overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-violet-600/10" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-indigo-500/20 rounded-full blur-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 font-medium mb-6">
                  <Sparkles size={12} />
                  Free to start — no credit card required
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
                  Start reconciling today
                </h2>
                <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto">
                  Join 200+ enterprise teams who've transformed their data reconciliation workflow with DF-Recon.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/"
                    className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:from-indigo-500 hover:to-indigo-400 transition-all duration-200">
                    Launch App
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link href="/login"
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl glass border border-white/10 text-white font-medium hover:bg-white/5 transition-all duration-200">
                    Sign In
                  </Link>
                </div>
              </div>
            </div>
          </AnimSection>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/40 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap size={13} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-white">DF-Recon</span>
            <span className="text-xs text-slate-600">Enterprise Data Reconciliation Platform</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <span>© 2025 DF-Recon. All rights reserved.</span>
            <Link href="/" className="hover:text-slate-400 transition-colors">App</Link>
            <Link href="/login" className="hover:text-slate-400 transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>

      {/* ── Video modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {videoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            onClick={() => setVideoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-3xl bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <span className="text-sm font-semibold text-white">DF-Recon Product Demo</span>
                <button onClick={() => setVideoOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="aspect-video bg-slate-950 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto">
                    <Play size={24} className="text-indigo-400 ml-1" />
                  </div>
                  <p className="text-sm text-slate-400">Demo video — click the app to explore live</p>
                  <Link href="/"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
                    onClick={() => setVideoOpen(false)}>
                    Launch Live App <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
