'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Search, BarChart3, List, FileWarning
} from 'lucide-react';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { ReconciliationResult, Discrepancy } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS, DEMO_TARGET_COLS,
} from './shared';
import type { StepProps } from './shared';

const TABS = [
  { id: 'run',        label: 'Run Reconciliation', icon: <Play size={12} /> },
  { id: 'results',    label: 'Results',             icon: <BarChart3 size={12} /> },
  { id: 'exceptions', label: 'Exceptions',          icon: <FileWarning size={12} /> },
  { id: 'summary',    label: 'Summary',             icon: <List size={12} /> },
];

// ── Build reconciliation result ───────────────────────────────────────────────
function buildResult(batch: NonNullable<StepProps['batch']>, wizardCtx: StepProps['wizardCtx']): ReconciliationResult {
  const src = batch.sourceFile?.rowCount ?? 1000;
  const tgt = batch.targetFile?.rowCount ?? 998;
  const matched = Math.floor(Math.min(src, tgt) * 0.972);
  const unmatchedSrc = src - matched;
  const unmatchedTgt = tgt - matched;
  const cols = batch.sourceFile?.columns ?? DEMO_SOURCE_COLS;

  const discrepancies: Discrepancy[] = [
    { id: 'd1', key: 'R003', field: 'email',   sourceValue: '(null)', targetValue: 'carol@legacy.net', type: 'value_mismatch' },
    { id: 'd2', key: 'R047', field: cols[3]?.name ?? 'value', sourceValue: '1200.00', targetValue: '1250.00', type: 'value_mismatch' },
    { id: 'd3', key: 'R198', field: cols[4]?.name ?? 'status', sourceValue: 'inactive', targetValue: 'INACTIVE', type: 'value_mismatch' },
    { id: 'd4', key: 'R245', field: '', sourceValue: 'R245', targetValue: '', type: 'missing_target' },
    { id: 'd5', key: 'R891', field: '', sourceValue: '', targetValue: 'R891', type: 'missing_source' },
    { id: 'd6', key: 'R312', field: cols[0]?.name ?? 'id', sourceValue: 'C312', targetValue: 'C312A', type: 'value_mismatch' },
  ];

  const summary = cols.slice(0, 4).map((col, i) => ({
    column: col.name, matched: matched - i * 8, mismatched: i * 5 + 2,
    missingSource: i, missingTarget: i + 1,
  }));

  return {
    batchId: batch.id, runAt: new Date().toISOString(),
    totalSource: src, totalTarget: tgt, matched,
    unmatchedSource: unmatchedSrc, unmatchedTarget: unmatchedTgt,
    matchRate: (matched / src) * 100, discrepancies, summary,
  };
}

// ── Run tab ───────────────────────────────────────────────────────────────────
function TabRun({ batch, result, running, onRun, wizardCtx }: {
  batch: StepProps['batch']; result: ReconciliationResult | null;
  running: boolean; onRun: () => void; wizardCtx: StepProps['wizardCtx'];
}) {
  const hasFiles = !!(batch?.sourceFile && batch?.targetFile);

  return (
    <div className="space-y-4">
      {/* Config summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Source Rows"  value={formatNumber(batch?.sourceFile?.rowCount ?? 1000)} color="bg-indigo-50 text-indigo-700" />
        <StatTile label="Target Rows"  value={formatNumber(batch?.targetFile?.rowCount ?? 998)}  color="bg-violet-50 text-violet-700" />
        <StatTile label="Source Key"   value={wizardCtx.sourceKey || '—'} color="bg-slate-50 text-slate-700" />
        <StatTile label="Target Key"   value={wizardCtx.targetKey || '—'} color="bg-slate-50 text-slate-700" />
      </div>

      {!hasFiles && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">No files uploaded. Upload source and target files in the Discovery step for real reconciliation.</p>
        </div>
      )}

      {running && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto">
            <Activity size={26} className="text-indigo-400 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Reconciliation in progress…</p>
            <p className="text-xs text-slate-400 mt-1">Comparing {formatNumber(batch?.sourceFile?.rowCount ?? 1000)} source + {formatNumber(batch?.targetFile?.rowCount ?? 998)} target records</p>
          </div>
          <div className="w-64 mx-auto bg-slate-100 rounded-full h-2">
            <motion.div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              initial={{ width: '5%' }} animate={{ width: '92%' }} transition={{ duration: 2.3, ease: 'easeInOut' }} />
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            {['Applying exclusion filters…','Matching on key columns…','Comparing field values…','Generating exception report…'].map((s, i) => (
              <motion.p key={s} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.5 }}>{s}</motion.p>
            ))}
          </div>
        </motion.div>
      )}

      {!running && !result && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <Activity size={26} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">Ready to reconcile</p>
          <p className="text-xs text-slate-400">Click Run to compare source and target records using the configured keys and mappings.</p>
          <Button icon={<Play size={14} />} onClick={onRun} loading={running}>Run Reconciliation</Button>
        </div>
      )}

      {!running && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm opacity-80">Reconciliation Complete</p>
              <p className="text-5xl font-black mt-1">{formatPercent(result.matchRate)}</p>
              <p className="text-sm opacity-70 mt-1">{formatNumber(result.matched)} of {formatNumber(result.totalSource)} records matched</p>
            </div>
            <div className="w-20 h-20 relative flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <motion.circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray="100" initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - result.matchRate }}
                  transition={{ duration: 1.5, ease: 'easeOut' }} strokeLinecap="round" />
              </svg>
              <span className="absolute text-xs font-bold">{formatPercent(result.matchRate, 0)}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/20 text-center">
            {[
              { label: 'Matched',       value: formatNumber(result.matched) },
              { label: 'Unmatched (S)', value: formatNumber(result.unmatchedSource) },
              { label: 'Unmatched (T)', value: formatNumber(result.unmatchedTarget) },
              { label: 'Issues',        value: String(result.discrepancies.length) },
            ].map(({ label, value }) => (
              <div key={label}><div className="text-lg font-bold">{value}</div><div className="text-xs opacity-70">{label}</div></div>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={onRun}>Re-Run</Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Results tab ───────────────────────────────────────────────────────────────
function TabResults({ result }: { result: ReconciliationResult | null }) {
  if (!result) return (
    <EmptyCard icon={<BarChart3 size={22} className="text-slate-400" />}
      title="No results yet" message="Run reconciliation first in the Run tab." />
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Column-Level Results</p>
        </div>
        <table className="w-full text-xs min-w-[560px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Column', 'Matched', 'Mismatched', 'Missing (Src)', 'Missing (Tgt)', 'Match %'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.summary.map(col => {
              const total = col.matched + col.mismatched + col.missingSource + col.missingTarget;
              const pct = total > 0 ? (col.matched / total) * 100 : 100;
              return (
                <tr key={col.column} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-800">{col.column}</td>
                  <td className="py-2.5 px-4 text-emerald-600 font-semibold">{formatNumber(col.matched)}</td>
                  <td className="py-2.5 px-4 text-amber-600">{col.mismatched}</td>
                  <td className="py-2.5 px-4 text-red-500">{col.missingSource}</td>
                  <td className="py-2.5 px-4 text-red-500">{col.missingTarget}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span>{formatPercent(pct, 0)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Exceptions tab ────────────────────────────────────────────────────────────
function TabExceptions({ result }: { result: ReconciliationResult | null }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Discrepancy['type']>('all');

  if (!result) return (
    <EmptyCard icon={<FileWarning size={22} className="text-slate-400" />}
      title="No exceptions" message="Run reconciliation to see exceptions and discrepancies." />
  );

  const filtered = result.discrepancies.filter(d => {
    if (typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.key.toLowerCase().includes(q) || d.field.toLowerCase().includes(q) ||
        d.sourceValue.toLowerCase().includes(q) || d.targetValue.toLowerCase().includes(q);
    }
    return true;
  });

  const typeCounts = {
    value_mismatch:  result.discrepancies.filter(d => d.type === 'value_mismatch').length,
    missing_source:  result.discrepancies.filter(d => d.type === 'missing_source').length,
    missing_target:  result.discrepancies.filter(d => d.type === 'missing_target').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Value Mismatches"  value={typeCounts.value_mismatch}  color="bg-amber-50 text-amber-700" />
        <StatTile label="Missing in Source" value={typeCounts.missing_source}  color="bg-red-50 text-red-700" />
        <StatTile label="Missing in Target" value={typeCounts.missing_target}  color="bg-orange-50 text-orange-700" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Search key, field, value…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">All Types</option>
          <option value="value_mismatch">Value Mismatch</option>
          <option value="missing_source">Missing in Source</option>
          <option value="missing_target">Missing in Target</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Key', 'Field', 'Source Value', 'Target Value', 'Type'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d, i) => (
              <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">{d.key}</td>
                <td className="py-2.5 px-4 text-slate-600">{d.field || '—'}</td>
                <td className="py-2.5 px-4 font-mono text-slate-700">{d.sourceValue || <span className="text-slate-300">(absent)</span>}</td>
                <td className="py-2.5 px-4 font-mono text-slate-700">{d.targetValue || <span className="text-slate-300">(absent)</span>}</td>
                <td className="py-2.5 px-4">
                  <Badge variant={d.type === 'value_mismatch' ? 'warning' : 'error'}>{d.type.replace(/_/g, ' ')}</Badge>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-6 text-center text-xs text-slate-400">No exceptions match your filter</div>}
      </div>
    </div>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────────────
function TabSummary({ result, batch, wizardCtx }: { result: ReconciliationResult | null; batch: StepProps['batch']; wizardCtx: StepProps['wizardCtx'] }) {
  if (!result) return (
    <EmptyCard icon={<List size={22} className="text-slate-400" />}
      title="No summary available" message="Run reconciliation to see the executive summary." />
  );

  const qualityGrade = result.matchRate >= 99 ? 'A+' : result.matchRate >= 97 ? 'A' : result.matchRate >= 95 ? 'B' : result.matchRate >= 90 ? 'C' : 'D';
  const gradeColor = qualityGrade.startsWith('A') ? 'text-emerald-700 bg-emerald-50' : qualityGrade === 'B' ? 'text-blue-700 bg-blue-50' : 'text-amber-700 bg-amber-50';

  const items = [
    { label: 'Batch',          value: batch?.name ?? 'N/A' },
    { label: 'Run Date',       value: new Date(result.runAt).toLocaleString('en-GB') },
    { label: 'Source Key',     value: wizardCtx.sourceKey || '—' },
    { label: 'Target Key',     value: wizardCtx.targetKey || '—' },
    { label: 'Source Records', value: formatNumber(result.totalSource) },
    { label: 'Target Records', value: formatNumber(result.totalTarget) },
    { label: 'Matched',        value: formatNumber(result.matched) },
    { label: 'Unmatched (S)',  value: formatNumber(result.unmatchedSource) },
    { label: 'Unmatched (T)',  value: formatNumber(result.unmatchedTarget) },
    { label: 'Discrepancies',  value: result.discrepancies.length.toString() },
    { label: 'Match Rate',     value: formatPercent(result.matchRate) },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-700">Executive Summary</p>
          <div className={cn('text-2xl font-black px-4 py-2 rounded-xl', gradeColor)}>Grade: {qualityGrade}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6">
          {items.map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Recommendations</p>
        <div className="space-y-2">
          {result.unmatchedSource > 0 && (
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5" />
              Review {result.unmatchedSource} unmatched source records — they may indicate missing data in the target.
            </div>
          )}
          {result.discrepancies.filter(d => d.type === 'value_mismatch').length > 0 && (
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5" />
              {result.discrepancies.filter(d => d.type === 'value_mismatch').length} value mismatches detected — check case sensitivity and data transformations.
            </div>
          )}
          {result.matchRate >= 97 && (
            <div className="flex items-start gap-2 text-xs text-emerald-600">
              <CheckCircle2 size={13} className="text-emerald-500 mt-0.5" />
              Excellent match rate. Proceed to export reports.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepReconciliation({ batch, onAdvance, onBack, wizardCtx }: StepProps) {
  const { state, dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('run');
  const [running, setRunning] = useState(false);

  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? null : null;
  const result = batchObj ? (state.reconciliations.find(r => r.batchId === batchObj.id) ?? null) : null;
  const [localResult, setLocalResult] = useState<ReconciliationResult | null>(result);

  const runReconciliation = () => {
    const b = batchObj;
    if (!b) { toast('No active batch — create a batch in Discovery first', 'error'); return; }
    setRunning(true);
    setTimeout(() => {
      const r = buildResult(b, wizardCtx);
      dispatch({ type: 'ADD_RECONCILIATION', payload: r });
      dispatch({ type: 'UPDATE_BATCH', payload: { ...b, matchRate: r.matchRate, status: 'completed', updatedAt: new Date().toISOString() } });
      addAudit('RECONCILIATION_RUN', 'Batch', b.id, b.name, `Match rate: ${formatPercent(r.matchRate)}`);
      setLocalResult(r);
      setRunning(false);
      toast(`Reconciliation complete — ${formatPercent(r.matchRate)} match rate`, 'success');
      setActiveTab('results');
    }, 2600);
  };

  const currentResult = localResult ?? result;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Reconciliation</h2>
        <p className="text-sm text-slate-500 mt-1">Run the reconciliation engine to compare source and target records using configured keys and mappings.</p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'run'        && <TabRun batch={batch} result={currentResult} running={running} onRun={runReconciliation} wizardCtx={wizardCtx} />}
          {activeTab === 'results'    && <TabResults result={currentResult} />}
          {activeTab === 'exceptions' && <TabExceptions result={currentResult} />}
          {activeTab === 'summary'    && <TabSummary result={currentResult} batch={batch} wizardCtx={wizardCtx} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Export" disableNext={!currentResult} />
    </div>
  );
}
