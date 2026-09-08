'use client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  FolderKanban, Layers, FileText, ShieldCheck,
  GitMerge, AlertTriangle, TrendingUp, Sparkles,
  ArrowRight, Clock, CheckCircle2, Activity, Wand2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatNumber, formatPercent, timeAgo, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.3 } }),
};

export default function DashboardPage() {
  const { state, loadDemo } = useStore();
  const { toast } = useToast();
  const { projects, batches, files, rules, exclusions, mappings, reconciliations, auditEntries } = state;

  const isEmpty = projects.length === 0;

  const totalMatched = reconciliations.reduce((s, r) => s + r.matched, 0);
  const totalRecords = reconciliations.reduce((s, r) => s + r.totalSource, 0);
  const avgMatchRate = totalRecords > 0 ? (totalMatched / totalRecords) * 100 : 0;
  const activeBatches = batches.filter(b => b.status === 'in_progress').length;
  const completedBatches = batches.filter(b => b.status === 'completed').length;
  const recentAudit = auditEntries.slice(0, 5);

  const stats = [
    { label: 'Projects', value: formatNumber(projects.length), icon: FolderKanban, color: 'bg-indigo-500', light: 'bg-indigo-50 text-indigo-600', trend: null },
    { label: 'Batches', value: formatNumber(batches.length), icon: Layers, color: 'bg-violet-500', light: 'bg-violet-50 text-violet-600', trend: activeBatches > 0 ? `${activeBatches} active` : null },
    { label: 'Files Uploaded', value: formatNumber(files.length), icon: FileText, color: 'bg-sky-500', light: 'bg-sky-50 text-sky-600', trend: null },
    { label: 'Rules Defined', value: formatNumber(rules.length), icon: ShieldCheck, color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-600', trend: null },
    { label: 'Mappings', value: formatNumber(mappings.length), icon: GitMerge, color: 'bg-amber-500', light: 'bg-amber-50 text-amber-600', trend: null },
    { label: 'Exclusions', value: formatNumber(exclusions.length), icon: AlertTriangle, color: 'bg-rose-500', light: 'bg-rose-50 text-rose-600', trend: null },
    { label: 'Reconciliations', value: formatNumber(reconciliations.length), icon: Activity, color: 'bg-teal-500', light: 'bg-teal-50 text-teal-600', trend: completedBatches > 0 ? `${completedBatches} completed` : null },
    { label: 'Avg Match Rate', value: reconciliations.length > 0 ? formatPercent(avgMatchRate) : '—', icon: TrendingUp, color: 'bg-pink-500', light: 'bg-pink-50 text-pink-600', trend: null },
  ];

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-6">
            <Wand2 size={36} className="text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to DF-Recon</h2>
          <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
            Your workspace is empty. Load demo data to explore the platform, or create your first project to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              icon={<Sparkles size={16} />}
              size="lg"
              onClick={() => { loadDemo(); toast('Demo data loaded!', 'success'); }}
            >
              Load Demo Data
            </Button>
            <Link href="/projects">
              <Button variant="secondary" size="lg" icon={<FolderKanban size={16} />}>
                Create Project
              </Button>
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              { icon: FolderKanban, title: '1. Create a Project', desc: 'Organise your reconciliation work into projects and batches.' },
              { icon: Wand2, title: '2. Run the Wizard', desc: 'Upload files, detect keys, define rules, map columns and reconcile.' },
              { icon: TrendingUp, title: '3. Review Results', desc: 'Get match-rate analysis, discrepancies, and exportable reports.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl bg-white border border-slate-200 text-left">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                  <Icon size={18} className="text-indigo-500" />
                </div>
                <div className="text-sm font-semibold text-slate-800 mb-1">{title}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', s.light)}>
                <s.icon size={18} />
              </div>
              {s.trend && (
                <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">{s.trend}</span>
              )}
            </div>
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Projects */}
        <motion.div custom={8} variants={fadeUp} initial="hidden" animate="show"
          className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Projects</h2>
            <Link href="/projects" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {projects.slice(0, 4).map(p => {
              const pb = batches.filter(b => b.projectId === p.id);
              const completed = pb.filter(b => b.status === 'completed');
              return (
                <Link key={p.id} href="/projects" className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <FolderKanban size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">{pb.length} batch{pb.length !== 1 ? 'es' : ''} · {completed.length} completed</div>
                  </div>
                  <Badge variant={p.status === 'active' ? 'success' : p.status === 'completed' ? 'info' : 'warning'}>
                    {p.status}
                  </Badge>
                </Link>
              );
            })}
            {projects.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No projects yet</div>
            )}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div custom={9} variants={fadeUp} initial="hidden" animate="show"
          className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
            <Link href="/audit" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentAudit.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  entry.status === 'success' ? 'bg-emerald-50' : entry.status === 'error' ? 'bg-red-50' : 'bg-blue-50'
                )}>
                  {entry.status === 'success'
                    ? <CheckCircle2 size={13} className="text-emerald-500" />
                    : entry.status === 'error'
                    ? <AlertTriangle size={13} className="text-red-500" />
                    : <Activity size={13} className="text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 font-medium leading-tight">{entry.entityName}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.action.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                  <Clock size={10} />
                  {timeAgo(entry.timestamp)}
                </div>
              </div>
            ))}
            {recentAudit.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No activity yet</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Reconciliation summary */}
      {reconciliations.length > 0 && (
        <motion.div custom={10} variants={fadeUp} initial="hidden" animate="show"
          className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Reconciliation Overview</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {reconciliations.slice(0, 3).map(r => {
              const batch = batches.find(b => b.id === r.batchId);
              return (
                <div key={r.batchId} className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500 mb-1 truncate">{batch?.name ?? r.batchId}</div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-2xl font-bold text-slate-900">{formatPercent(r.matchRate)}</span>
                    <span className="text-xs text-slate-400 pb-1">match rate</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${r.matchRate}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <div className="text-sm font-semibold text-emerald-700">{formatNumber(r.matched)}</div>
                      <div className="text-xs text-emerald-600">Matched</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2">
                      <div className="text-sm font-semibold text-amber-700">{formatNumber(r.unmatchedSource)}</div>
                      <div className="text-xs text-amber-600">Unmatched</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2">
                      <div className="text-sm font-semibold text-red-700">{formatNumber(r.discrepancies.length)}</div>
                      <div className="text-xs text-red-600">Issues</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
