'use client';
import { useState, useMemo, useEffect } from 'react';
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
  validateFBDI,
  FBDIValidationResponse
} from '@/lib/api';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
} from './shared';
import type { StepProps } from './shared';



const TABS = [
  { id: 'preview',    label: 'Transformation Preview', icon: <Eye size={12} /> },
  { id: 'validation', label: 'Validation',              icon: <ListChecks size={12} /> },
  { id: 'summary',    label: 'Load Summary',            icon: <BarChart2 size={12} /> },
];

function generateRows(batch: StepProps['batch'], rules: ReturnType<typeof useStore>['state']['rules'], exclusions: ReturnType<typeof useStore>['state']['exclusions'], mappings: ReturnType<typeof useStore>['state']['mappings']): PreLoadRow[] {
  if (!batch) return [];
  const file = batch.sourceFile ?? batch.targetFile;
  if (!file) return [];

  const cols = file.columns ?? [];
  if (cols.length === 0) return [];

  const sampleRows = file.sampleData ?? [];
  const activeExclusions = exclusions.filter(e => e.enabled && e.batchId === batch.id);
  const activeRules = rules.filter(r => r.enabled && r.batchId === batch.id);
  const activeMappings = mappings.filter(m => m.batchId === batch.id && m.enabled);

  const rowCount = sampleRows.length > 0 ? sampleRows.length : (file.rowCount > 0 ? file.rowCount : 10);

  const rows: PreLoadRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const rawRow = sampleRows[i] ?? {};
    const data: Record<string, unknown> = {};

    cols.forEach((col) => {
      let val: unknown = rawRow[col.name];
      if (val === undefined || val === null || val === '') {
        const samples = col.sampleValues ?? [];
        if (samples.length > 0) {
          val = samples[i % samples.length] ?? '';
        } else {
          val = '';
        }
      }
      data[col.name] = val;

      const mapping = activeMappings.find(m => m.sourceColumn === col.name);
      if (mapping) {
        let transformedVal = val;
        if (mapping.transformType === 'upper') transformedVal = String(val).toUpperCase();
        else if (mapping.transformType === 'lower') transformedVal = String(val).toLowerCase();
        else if (mapping.transformType === 'trim') transformedVal = String(val).trim();
        data[mapping.targetColumn] = transformedVal;
      }
    });

    const issues: string[] = [];
    let status: PreLoadRow['status'] = 'valid';

    activeRules.forEach(rule => {
      const valStr = String(data[rule.column] ?? '').trim();
      if (!valStr && rule.type === 'format') {
        issues.push(`Rule violation: "${rule.name}" on column ${rule.column}`);
        if (rule.severity === 'error') status = 'error';
        else if (status === 'valid') status = 'warning';
      }
    });

    activeExclusions.forEach(excl => {
      const valStr = String(data[excl.column] ?? '').trim();
      if (excl.operator === 'equals' && valStr.toLowerCase() === excl.value.toLowerCase()) {
        issues.push(`Matched exclusion: "${excl.name}" on column ${excl.column}`);
        if (status === 'valid') status = 'warning';
      }
    });

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

  const cols: Array<{ name: string }> = batch?.sourceFile?.columns ?? batch?.targetFile?.columns ?? [];
  const activeMappings = mappings.filter(m => m.batchId === (batch?.id ?? '') && m.enabled);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter(r => (r.status as string) === filter);
  }, [rows, filter]);

  if (!generated && rows.length === 0) return (
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
        {(['all', 'valid', 'warning', 'error'] as const).map(f => {
          const count = f === 'all' ? rows.length : rows.filter(r => r.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors',
                filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
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
              {cols.map((c: { name: string }) => <th key={c.name} className="text-left py-2.5 px-3 font-semibold text-slate-500">{c.name}</th>)}
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
                {cols.map((c: { name: string }) => (
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

  const [fbdiRes, setFbdiRes] = useState<FBDIValidationResponse | null>(null);
  const [fbdiLoading, setFbdiLoading] = useState(false);
  const [fbdiError, setFbdiError] = useState<string | null>(null);

  const fileName = batch?.targetFile?.name || batch?.sourceFile?.name;

  const runFbdiValidation = () => {
    if (!fileName) return;
    setFbdiLoading(true);
    setFbdiError(null);
    // Pass the server-side file path (file already saved in uploads dir)
    validateFBDI(undefined, fileName, 'Supplier')
      .then(res => { setFbdiRes(res); setFbdiLoading(false); })
      .catch(err => { setFbdiError(String(err)); setFbdiLoading(false); });
  };

  useEffect(() => {
    runFbdiValidation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  const stepColor = (status: string) => {
    if (status === 'PASS') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (status === 'FAIL') return 'text-red-600 bg-red-50 border-red-200';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  };
  const stepIcon = (status: string) => {
    if (status === 'PASS') return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
    if (status === 'FAIL') return <XCircle size={14} className="text-red-500 shrink-0" />;
    return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
  };

  const overallBadgeVariant = fbdiRes?.status === 'PASSED' ? 'success'
    : fbdiRes?.status === 'NO_FILE_PROVIDED' ? 'outline'
    : fbdiRes?.status === 'VALIDATION_FAILED' ? 'error'
    : 'warning';

  return (
    <div className="space-y-5">
      {/* Row stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Rows"  value={rows.length}   color="bg-slate-50 text-slate-700" />
        <StatTile label="Valid"       value={rows.filter(r => r.status === 'valid').length} color="bg-emerald-50 text-emerald-700" />
        <StatTile label="Warnings"    value={warnings} color={warnings > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} />
        <StatTile label="Errors"      value={errors}   color={errors > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'} />
      </div>

      {/* ── FBDI Real-Time Validation Card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <ListChecks size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Oracle Fusion FBDI Validation</p>
              <p className="text-xs text-slate-500">{fileName ?? 'No file detected'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fbdiRes && (
              <Badge variant={overallBadgeVariant}>
                {fbdiRes.status}
              </Badge>
            )}
            <button
              onClick={runFbdiValidation}
              disabled={fbdiLoading || !fileName}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 transition-all"
            >
              <RefreshCw size={11} className={fbdiLoading ? 'animate-spin' : ''} />
              {fbdiLoading ? 'Validating…' : 'Re-validate'}
            </button>
          </div>
        </div>

        {/* No file state */}
        {!fileName && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
            <AlertTriangle size={22} />
            <p className="text-sm font-medium">No FBDI file detected in this batch.</p>
            <p className="text-xs">Upload a file in the Discovery step first.</p>
          </div>
        )}

        {/* Loading pulse */}
        {fbdiLoading && fileName && (
          <div className="px-5 py-6 space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-6 h-6 bg-slate-100 rounded-full" />
                <div className="flex-1 h-3 bg-slate-100 rounded" />
                <div className="w-16 h-5 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error fetching */}
        {fbdiError && !fbdiLoading && (
          <div className="px-5 py-4 flex items-center gap-2 text-red-600 text-sm">
            <XCircle size={15} />
            <span>Validation failed: {fbdiError}</span>
          </div>
        )}

        {/* Results */}
        {fbdiRes && !fbdiLoading && (
          <div className="p-5 space-y-5">
            {/* File metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Entity</p>
                <p className="text-sm font-bold text-slate-700">{fbdiRes.entity}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Records</p>
                <p className="text-sm font-bold text-indigo-700">{fbdiRes.record_count.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Columns</p>
                <p className="text-sm font-bold text-slate-700">{fbdiRes.columns?.length ?? 0}</p>
              </div>
              <div className={cn('border rounded-xl p-3 space-y-0.5',
                (fbdiRes.duplicates_count ?? 0) > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'
              )}>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Duplicates</p>
                <p className={cn('text-sm font-bold', (fbdiRes.duplicates_count ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {fbdiRes.duplicates_count ?? 0}
                </p>
              </div>
            </div>

            {/* PK + Null summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              {fbdiRes.primary_key && (
                <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-700 px-2.5 py-1 rounded-lg font-medium">
                  🔑 Primary Key: <code className="font-mono">{fbdiRes.primary_key}</code>
                </span>
              )}
              {fbdiRes.null_counts && Object.keys(fbdiRes.null_counts).length > 0 ? (
                Object.entries(fbdiRes.null_counts).map(([col, count]) => (
                  <span key={col} className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg">
                    <AlertTriangle size={10} /> {col}: <strong>{count}</strong> nulls
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 size={10} /> No null fields detected
                </span>
              )}
            </div>

            {/* 5-Step Validation Timeline */}
            {fbdiRes.steps && fbdiRes.steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Validation Steps</p>
                <div className="space-y-2">
                  {fbdiRes.steps.map((step) => (
                    <div
                      key={step.step_number}
                      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', stepColor(step.status))}
                    >
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <span className="text-xs font-bold opacity-50 w-4 text-right">{step.step_number}</span>
                        {stepIcon(step.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs">{step.step_name}</p>
                        <p className="text-xs opacity-80 mt-0.5 leading-relaxed">{step.message}</p>
                      </div>
                      <Badge
                        variant={step.status === 'PASS' ? 'success' : step.status === 'FAIL' ? 'error' : 'warning'}
                        className="shrink-0 text-[10px]"
                      >
                        {step.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Columns list */}
            {fbdiRes.columns && fbdiRes.columns.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Detected Columns ({fbdiRes.columns.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fbdiRes.columns.map(col => (
                    <code key={col} className={cn(
                      'text-[11px] px-2 py-0.5 rounded-md border font-mono',
                      col === fbdiRes.primary_key
                        ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    )}>
                      {col === fbdiRes.primary_key ? '🔑 ' : ''}{col}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {fbdiRes.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Errors ({fbdiRes.errors.length})</p>
                {fbdiRes.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <XCircle size={12} className="shrink-0 mt-0.5" />
                    {e}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {fbdiRes.warnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Warnings ({fbdiRes.warnings.length})</p>
                {fbdiRes.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
  const [loading, setLoading] = useState(false);

  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? batch : batch;

  const [rows, setRows] = useState<PreLoadRow[]>(() =>
    batchObj ? generateRows(batchObj, state.rules, state.exclusions, state.mappings) : []
  );
  const [generated, setGenerated] = useState<boolean>(rows.length > 0);

  useEffect(() => {
    if (batchObj) {
      const generatedRows = generateRows(batchObj, state.rules, state.exclusions, state.mappings);
      setRows(generatedRows);
      setGenerated(true);
    }
  }, [batchObj, state.rules, state.exclusions, state.mappings]);

  const generate = () => {
    if (!batchObj) return;
    setLoading(true);
    setTimeout(() => {
      const generatedRows = generateRows(batchObj, state.rules, state.exclusions, state.mappings);
      setRows(generatedRows);
      setGenerated(true);
      setLoading(false);
    }, 600);
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
