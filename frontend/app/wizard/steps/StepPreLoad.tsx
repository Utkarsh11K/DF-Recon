'use client';
import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, CheckCircle2, XCircle, AlertTriangle, Filter,
  RefreshCw, ArrowRight, BarChart2, ListChecks, Play
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { PreLoadRow } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS,
} from './shared';
import type { StepProps } from './shared';

const TABS = [
  { id: 'preview',    label: 'Transformation Preview', icon: <Eye size={12} /> },
  { id: 'validation', label: 'Validation',              icon: <ListChecks size={12} /> },
  { id: 'summary',    label: 'Load Summary',            icon: <BarChart2 size={12} /> },
];

// ── Data generator ────────────────────────────────────────────────────────────
function generateRows(batch: NonNullable<StepProps['batch']>, rules: ReturnType<typeof useStore>['state']['rules'], exclusions: ReturnType<typeof useStore>['state']['exclusions'], mappings: ReturnType<typeof useStore>['state']['mappings']): PreLoadRow[] {
  const cols = batch.sourceFile?.columns ?? DEMO_SOURCE_COLS;
  const rowCount = Math.min(cols.length > 0 ? 20 : 0, 20);
  const rows: PreLoadRow[] = [];
  const activeExclusions = exclusions.filter(e => e.enabled && e.batchId === batch.id);
  const activeRules = rules.filter(r => r.enabled && r.batchId === batch.id);

  for (let i = 0; i < rowCount; i++) {
    const data: Record<string, unknown> = {};
    const transformed: Record<string, unknown> = {};
    cols.forEach(col => {
      let val: unknown;
      if (col.dataType === 'number') val = (Math.random() * 5000).toFixed(2);
      else if (col.dataType === 'date') val = `2024-${String((i % 12) + 1).padStart(2, '0')}-15`;
      else val = `${col.name.slice(0,2).toUpperCase()}${String(i + 1).padStart(3, '0')}`;
      data[col.name] = val;

      // Apply transformation
      const mapping = mappings.find(m => m.sourceColumn === col.name && m.batchId === batch.id && m.enabled);
      if (mapping) {
        if (mapping.transformType === 'upper') transformed[mapping.targetColumn] = String(val).toUpperCase();
        else if (mapping.transformType === 'lower') transformed[mapping.targetColumn] = String(val).toLowerCase();
        else if (mapping.transformType === 'trim') transformed[mapping.targetColumn] = String(val).trim();
        else transformed[mapping.targetColumn] = val;
      }
    });

    const issues: string[] = [];
    let status: PreLoadRow['status'] = 'valid';

    // Simulate rule failures
    if (i === 2 && activeRules.some(r => r.severity === 'error')) {
      issues.push(`Rule violation: "${activeRules.find(r => r.severity === 'error')?.name}"`);
      status = 'error';
    }
    if (i === 5 && activeRules.some(r => r.severity === 'error')) {
      issues.push(`Rule violation: negative value detected`);
      status = 'error';
    }
    if (i === 8 && activeRules.some(r => r.severity === 'warning')) {
      issues.push(`Warning: "${activeRules.find(r => r.severity === 'warning')?.name}"`);
      if (status === 'valid') status = 'warning';
    }
    if (i === 11 && activeExclusions.length > 0) {
      issues.push(`Matched exclusion: "${activeExclusions[0].name}"`);
      if (status === 'valid') status = 'warning';
    }

    rows.push({ rowIndex: i + 1, data, status, issues });
  }
  return rows;
}

// ── Transformation Preview tab ────────────────────────────────────────────────
function TabTransformationPreview({ rows, batch, mappings, generated, onGenerate, loading }: {
  rows: PreLoadRow[]; batch: StepProps['batch'];
  mappings: ReturnType<typeof useStore>['state']['mappings'];
  generated: boolean; onGenerate: () => void; loading: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'valid' | 'warning' | 'error'>('all');

  const cols = batch?.sourceFile?.columns.slice(0, 4) ?? DEMO_SOURCE_COLS.slice(0, 4);
  const activeMappings = mappings.filter(m => m.batchId === (batch?.id ?? '') && m.enabled);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter(r => (r.status as string) === filter);
  }, [rows, filter]);

  if (!generated) return (
    <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
        <Eye size={26} className="text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">Generate pre-load preview</p>
        <p className="text-xs text-slate-400 mt-1">Applies all rules, exclusions, and mappings to sample data.</p>
      </div>
      <Button onClick={onGenerate} loading={loading}>Generate Preview</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filter + Before/After toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-slate-400" />
        {(['all', 'valid', 'warning', 'error'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors',
              filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && <span className="ml-1 opacity-70">({rows.filter(r => r.status === (f as PreLoadRow['status'])).length})</span>}
          </button>
        ))}
        <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={onGenerate} loading={loading}>Refresh</Button>
      </div>

      {/* Transformation legend */}
      {activeMappings.filter(m => m.transformType !== 'direct').length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeMappings.filter(m => m.transformType !== 'direct').map(m => (
            <div key={m.id} className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-lg border border-violet-200">
              <code>{m.sourceColumn}</code><ArrowRight size={10} /><code>{m.targetColumn}</code>
              <Badge variant="info" className="ml-1">{m.transformType}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 w-10">#</th>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 w-20">Status</th>
              {cols.map(c => <th key={c.name} className="text-left py-2.5 px-3 font-semibold text-slate-500">{c.name}</th>)}
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(row => (
              <tr key={row.rowIndex} className={cn('transition-colors',
                row.status === 'error' ? 'bg-red-50/50 hover:bg-red-50' :
                row.status === 'warning' ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50')}>
                <td className="py-2 px-3 text-slate-400 font-mono">{row.rowIndex}</td>
                <td className="py-2 px-3">
                  {row.status === 'valid' ? <CheckCircle2 size={13} className="text-emerald-500" /> :
                   row.status === 'warning' ? <AlertTriangle size={13} className="text-amber-500" /> :
                   <XCircle size={13} className="text-red-500" />}
                </td>
                {cols.map(c => (
                  <td key={c.name} className="py-2 px-3 font-mono text-slate-700 truncate max-w-[140px]">
                    {String(row.data[c.name] ?? '—')}
                  </td>
                ))}
                <td className="py-2 px-3 text-xs text-slate-500 max-w-xs">
                  {row.issues.length ? row.issues.join('; ') : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Validation tab ────────────────────────────────────────────────────────────
function TabValidation({ rows, rules, exclusions, batch }: {
  rows: PreLoadRow[];
  rules: ReturnType<typeof useStore>['state']['rules'];
  exclusions: ReturnType<typeof useStore>['state']['exclusions'];
  batch: StepProps['batch'];
}) {
  const batchId = batch?.id ?? '__standalone__';
  const activeRules = rules.filter(r => r.enabled && r.batchId === batchId);
  const activeExclusions = exclusions.filter(e => e.enabled && e.batchId === batchId);
  const errors = rows.filter(r => r.status === 'error').length;
  const warnings = rows.filter(r => r.status === 'warning').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Rows"   value={rows.length}   color="bg-slate-50 text-slate-700" />
        <StatTile label="Valid"        value={rows.filter(r => r.status === 'valid').length} color="bg-emerald-50 text-emerald-700" />
        <StatTile label="Warnings"     value={warnings}      color={warnings > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} />
        <StatTile label="Errors"       value={errors}        color={errors > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'} />
      </div>

      {/* Rules applied */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Rules Applied ({activeRules.length})</p>
        {activeRules.length === 0 ? (
          <p className="text-xs text-slate-400">No rules defined. All rows pass by default.</p>
        ) : (
          <div className="space-y-2">
            {activeRules.map(rule => {
              const fails = rows.filter(r => r.issues.some(i => i.includes(rule.name))).length;
              return (
                <div key={rule.id} className="flex items-center gap-3 text-xs">
                  {fails === 0 ? <CheckCircle2 size={13} className="text-emerald-500" /> : <XCircle size={13} className="text-red-500" />}
                  <span className="font-medium text-slate-700">{rule.name}</span>
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{rule.column}</code>
                  <Badge variant={rule.severity === 'error' ? 'error' : 'warning'}>{rule.severity}</Badge>
                  {fails > 0 && <span className="text-red-600 font-medium">{fails} failures</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Exclusions applied */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Exclusions Applied ({activeExclusions.length})</p>
        {activeExclusions.length === 0 ? (
          <p className="text-xs text-slate-400">No exclusions defined. All rows included.</p>
        ) : (
          <div className="space-y-2">
            {activeExclusions.map(ex => {
              const affected = rows.filter(r => r.issues.some(i => i.includes(ex.name))).length;
              return (
                <div key={ex.id} className="flex items-center gap-3 text-xs">
                  <AlertTriangle size={13} className="text-amber-500" />
                  <span className="font-medium text-slate-700">{ex.name}</span>
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{ex.column}</code>
                  {affected > 0 && <span className="text-amber-600 font-medium">{affected} rows excluded</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {errors > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700"><span className="font-semibold">{errors} rows</span> have errors and will be excluded. Fix rules or review data.</p>
        </div>
      )}
    </div>
  );
}

// ── Load Summary tab ──────────────────────────────────────────────────────────
function TabLoadSummary({ rows, batch, mappings, onApprove }: {
  rows: PreLoadRow[]; batch: StepProps['batch'];
  mappings: ReturnType<typeof useStore>['state']['mappings'];
  onApprove: () => void;
}) {
  const [approved, setApproved] = useState(false);
  const total = batch?.sourceFile?.rowCount ?? rows.length;
  const errors = rows.filter(r => r.status === 'error').length;
  const warnings = rows.filter(r => r.status === 'warning').length;
  const valid = rows.filter(r => r.status === 'valid').length;
  const readyToLoad = total - errors;
  const activeMappings = mappings.filter(m => m.batchId === (batch?.id ?? '') && m.enabled);

  if (rows.length === 0) return (
    <EmptyCard icon={<BarChart2 size={22} className="text-slate-400" />}
      title="No preview generated" message="Generate a preview first in the Transformation Preview tab." />
  );

  return (
    <div className="space-y-4">
      {/* Summary hero */}
      <div className={cn('rounded-xl p-5 border', approved ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200')}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Pre-Load Summary</p>
            <p className="text-xs text-slate-500 mt-0.5">{batch?.name ?? 'Current batch'}</p>
          </div>
          {approved
            ? <Badge variant="success"><CheckCircle2 size={12} className="mr-1" />Approved for Load</Badge>
            : <Button size="sm" onClick={() => { setApproved(true); onApprove(); }}>Approve & Proceed</Button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatTile label="Total Source Rows" value={formatNumber(total)} color="bg-indigo-50 text-indigo-700" />
          <StatTile label="Ready to Load"     value={formatNumber(readyToLoad)} color="bg-emerald-50 text-emerald-700" />
          <StatTile label="Error Rows"        value={errors}  color={errors > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'} />
          <StatTile label="Columns Mapped"    value={activeMappings.length} color="bg-violet-50 text-violet-700" />
        </div>
      </div>

      {/* Transformation summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Transformation Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['direct','upper','lower','trim','dateFormat','formula','rename','concat'].map(t => {
            const count = activeMappings.filter(m => m.transformType === t).length;
            if (!count) return null;
            return <StatTile key={t} label={t} value={count} color="bg-slate-50 text-slate-700" />;
          })}
          {activeMappings.length === 0 && <p className="text-xs text-slate-400 col-span-4">No mappings defined.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepPreLoad({ batch, onAdvance, onBack }: StepProps) {
  const { state } = useStore();
  const [activeTab, setActiveTab] = useState('preview');
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PreLoadRow[]>([]);

  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? null : null;

  const generate = () => {
    if (!batchObj) return;
    setLoading(true);
    setTimeout(() => {
      setRows(generateRows(batchObj, state.rules, state.exclusions, state.mappings));
      setGenerated(true);
      setLoading(false);
    }, 1300);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Pre-Load Preview</h2>
        <p className="text-sm text-slate-500 mt-1">Review mapped and validated data before running reconciliation.</p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'preview'    && <TabTransformationPreview rows={rows} batch={batch} mappings={state.mappings} generated={generated} onGenerate={generate} loading={loading} />}
          {activeTab === 'validation' && <TabValidation rows={rows} rules={state.rules} exclusions={state.exclusions} batch={batch} />}
          {activeTab === 'summary'    && <TabLoadSummary rows={rows} batch={batch} mappings={state.mappings} onApprove={() => {}} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Reconciliation" />
    </div>
  );
}
