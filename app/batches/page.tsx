'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Wand2, Trash2, Pencil, ArrowUpDown,
  Layers, CheckCircle2, Database, FileText, ShieldCheck,
  GitMerge, BarChart3, AlertTriangle, Info, X, FolderKanban,
} from 'lucide-react';
import { cn, formatNumber, formatPercent, formatDateTime } from '@/lib/utils';
import type { Batch, BatchStatus } from '@/lib/types';
import Link from 'next/link';

// ── Pipeline config ───────────────────────────────────────────────────────────

const PIPELINE_STAGES: {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  { key: 'source',         label: 'Source',        icon: Database,    color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  { key: 'valid',          label: 'Valid',          icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'enriched',       label: 'Enriched',       icon: GitMerge,    color: 'text-violet-600',  bg: 'bg-violet-50' },
  { key: 'loaded',         label: 'Loaded',         icon: FileText,    color: 'text-sky-600',     bg: 'bg-sky-50' },
  { key: 'reconciliation', label: 'Reconciliation', icon: BarChart3,   color: 'text-amber-600',   bg: 'bg-amber-50' },
];

type PipelineCounts = {
  source: number;
  valid: number | null;
  enriched: number | null;
  loaded: number | null;
  reconciliation: number | null;
};

function getPipelineCounts(batch: Batch, matchRate?: number): PipelineCounts {
  const source   = batch.sourceFile?.rowCount ?? batch.recordCount ?? 0;
  const valid    = batch.completedSteps.includes('rules')     ? Math.floor(source * 0.97) : null;
  const enriched = batch.completedSteps.includes('mapping')   ? Math.floor(source * 0.95) : null;
  const loaded   = batch.completedSteps.includes('pre-load')  ? Math.floor(source * 0.94) : null;
  const recon    = matchRate != null ? matchRate : null;
  return { source, valid, enriched, loaded, reconciliation: recon };
}

const STATUS_VARIANT: Record<BatchStatus, 'success' | 'info' | 'warning' | 'error' | 'outline'> = {
  completed:   'success',
  in_progress: 'info',
  pending:     'outline',
  failed:      'error',
};

// ── Batch Form Modal (create + edit) ─────────────────────────────────────────

interface BatchFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Pass an existing batch to edit; omit to create new */
  initial?: Batch;
}

function BatchFormModal({ open, onClose, initial }: BatchFormModalProps) {
  const { state, dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();

  const firstProject = state.projects[0]?.id ?? '';
  const [form, setForm] = useState({
    name:        initial?.name        ?? '',
    description: initial?.description ?? '',
    projectId:   initial?.projectId   ?? firstProject,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!initial;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Batch name is required';
    if (!isEdit && !form.projectId) e.projectId = 'Select a project';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const now = new Date().toISOString();

    if (isEdit) {
      // ── Edit existing ──
      dispatch({
        type: 'UPDATE_BATCH',
        payload: {
          ...initial!,
          name:        form.name.trim(),
          description: form.description.trim(),
          updatedAt:   now,
        },
      });
      addAudit('BATCH_UPDATED', 'Batch', initial!.id, form.name, `Batch "${form.name}" updated`);
      toast('Batch updated', 'success');
    } else {
      // ── Create new ──
      const id = genId();
      const batch: Batch = {
        id,
        projectId:      form.projectId,
        name:           form.name.trim(),
        description:    form.description.trim(),
        status:         'pending',
        createdAt:      now,
        updatedAt:      now,
        wizardStep:     'discovery',
        completedSteps: [],
      };
      dispatch({ type: 'ADD_BATCH', payload: batch });

      const proj = state.projects.find(p => p.id === form.projectId);
      if (proj) {
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: { ...proj, batchCount: proj.batchCount + 1, updatedAt: now },
        });
      }
      addAudit('BATCH_CREATED', 'Batch', id, form.name, `Batch "${form.name}" created`);
      toast('Batch created', 'success');
      setForm({ name: '', description: '', projectId: firstProject });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Batch' : 'New Batch'}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Batch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* No-projects warning (create only) */}
        {!isEdit && state.projects.length === 0 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              No projects yet.{' '}
              <Link href="/projects" className="underline font-medium">Create a project first</Link>
              {' '}then add a batch.
            </p>
          </div>
        )}

        {/* Project selector — create only */}
        {!isEdit && state.projects.length > 0 && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Project</label>
            <select
              value={form.projectId}
              onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
              className={cn(
                'w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500',
                errors.projectId ? 'border-red-400' : 'border-slate-200',
              )}
            >
              <option value="">— select project —</option>
              {state.projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.projectId && (
              <p className="text-xs text-red-500 mt-1">{errors.projectId}</p>
            )}
          </div>
        )}

        <Input
          label="Batch Name"
          placeholder="e.g. Q3 2024 Initial Load"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          error={errors.name}
        />

        <Textarea
          label="Description"
          placeholder="Describe the scope of this batch…"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />

        {!isEdit && (
          <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
            <Info size={14} className="text-indigo-500 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-700">
              After creating, open the batch in the Conversion Wizard to upload files, define rules and run reconciliation.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Pipeline step (for detail drawer) ────────────────────────────────────────

function PipelineStepNode({
  stage,
  value,
  prevCount,
  isLast,
}: {
  stage: typeof PIPELINE_STAGES[0];
  value: number | null;
  prevCount: number | null;
  isLast: boolean;
}) {
  const active = value !== null;
  const drop   = prevCount != null && value != null && stage.key !== 'reconciliation'
    ? prevCount - value : 0;
  const yieldPct = prevCount != null && prevCount > 0 && value != null && drop > 0
    ? ((value / prevCount) * 100).toFixed(1) : null;

  return (
    <div className="flex items-stretch">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          active ? `${stage.bg} ${stage.color}` : 'bg-slate-100 text-slate-300',
        )}>
          <stage.icon size={18} />
        </div>
        {!isLast && (
          <div className={cn(
            'w-0.5 flex-1 my-1',
            active ? 'bg-indigo-200' : 'bg-slate-100',
          )} />
        )}
      </div>

      {/* Label + value */}
      <div className={cn('ml-4', isLast ? 'pb-0' : 'pb-5')}>
        <div className="flex items-center gap-2 pt-2">
          <span className={cn(
            'text-sm font-semibold',
            active ? 'text-slate-800' : 'text-slate-400',
          )}>
            {stage.label}
          </span>
          {active
            ? <CheckCircle2 size={13} className="text-emerald-500" />
            : <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Pending</span>
          }
        </div>

        {active && (
          <div className="mt-1.5">
            {stage.key === 'reconciliation' ? (
              /* match-rate bar */
              <div className="flex items-center gap-2">
                <div className="w-28 bg-slate-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-indigo-600">{formatPercent(value as number)}</span>
                <span className="text-xs text-slate-400">match rate</span>
              </div>
            ) : (
              /* record count */
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-slate-800 tabular-nums">
                  {formatNumber(value as number)}
                </span>
                <span className="text-xs text-slate-400">records</span>
                {drop > 0 && yieldPct && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    −{formatNumber(drop)} · {yieldPct}% yield
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Batch detail drawer ───────────────────────────────────────────────────────

function BatchDetailDrawer({
  batch,
  onClose,
  onEdit,
}: {
  batch: Batch;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { state } = useStore();
  const project  = state.projects.find(p => p.id === batch.projectId);
  const recon    = state.reconciliations.find(r => r.batchId === batch.id);
  const rules    = state.rules.filter(r => r.batchId === batch.id);
  const mappings = state.mappings.filter(m => m.batchId === batch.id);
  const pipeline = getPipelineCounts(batch, recon?.matchRate ?? batch.matchRate);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Slide-in panel */}
      <motion.div
        className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <Layers size={14} className="text-violet-500" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 truncate">{batch.name}</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_VARIANT[batch.status]}>
                {batch.status.replace('_', ' ')}
              </Badge>
              {project && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <FolderKanban size={11} /> {project.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Edit batch"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Quick stat pills */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Source Records',
                value: pipeline.source ? formatNumber(pipeline.source) : '—',
                color: 'text-indigo-700 bg-indigo-50',
              },
              {
                label: 'Match Rate',
                value: pipeline.reconciliation != null
                  ? formatPercent(pipeline.reconciliation) : '—',
                color: 'text-emerald-700 bg-emerald-50',
              },
              {
                label: 'Current Step',
                value: batch.wizardStep.replace(/-/g, ' '),
                color: 'text-slate-700 bg-slate-50',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className={cn('rounded-xl p-3 text-center', color)}>
                <div className="text-sm font-bold capitalize">{value}</div>
                <div className="text-xs mt-0.5 opacity-60">{label}</div>
              </div>
            ))}
          </div>

          {/* ── Pipeline hierarchy ── */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Pipeline Hierarchy
            </h3>
            {PIPELINE_STAGES.map((stage, idx) => {
              const key      = stage.key as keyof PipelineCounts;
              const value    = pipeline[key];
              const prevKey  = idx > 0 ? PIPELINE_STAGES[idx - 1].key as keyof PipelineCounts : null;
              const prev     = prevKey && stage.key !== 'reconciliation'
                ? (pipeline[prevKey] as number | null) : null;

              return (
                <PipelineStepNode
                  key={stage.key}
                  stage={stage}
                  value={typeof value === 'number' ? value : null}
                  prevCount={prev}
                  isLast={idx === PIPELINE_STAGES.length - 1}
                />
              );
            })}
          </div>

          {/* ── Files ── */}
          {(batch.sourceFile || batch.targetFile) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Files
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Source', file: batch.sourceFile, color: 'bg-indigo-50 text-indigo-600' },
                  { label: 'Target', file: batch.targetFile, color: 'bg-violet-50 text-violet-600' },
                ]
                  .filter(f => f.file)
                  .map(({ label, file, color }) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0', color,
                      )}>
                        <FileText size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{file!.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatNumber(file!.rowCount)} rows · {file!.columns.length} columns
                        </p>
                      </div>
                      <Badge variant="outline">{label}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── Rules + Mappings summary cards ── */}
          {(rules.length > 0 || mappings.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 mb-1">Validation Rules</p>
                <p className="text-xl font-bold text-slate-800">{rules.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {rules.filter(r => r.severity === 'error').length} error ·{' '}
                  {rules.filter(r => r.severity === 'warning').length} warning
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 mb-1">Column Mappings</p>
                <p className="text-xl font-bold text-slate-800">{mappings.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {mappings.filter(m => m.transformType !== 'direct').length} with transforms
                </p>
              </div>
            </div>
          )}

          {/* ── Reconciliation result ── */}
          {recon && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Reconciliation Result
              </h3>
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Match Rate</span>
                  <span className="text-lg font-black text-indigo-600">
                    {formatPercent(recon.matchRate)}
                  </span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-2">
                  <motion.div
                    className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${recon.matchRate}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  {[
                    { label: 'Matched',   value: formatNumber(recon.matched),          color: 'text-emerald-700' },
                    { label: 'Unmatched', value: formatNumber(recon.unmatchedSource),  color: 'text-amber-600'  },
                    { label: 'Issues',    value: String(recon.discrepancies.length),   color: 'text-red-600'    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white/70 rounded-lg p-2">
                      <div className={cn('text-sm font-bold', color)}>{value}</div>
                      <div className="text-xs text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Description ── */}
          {batch.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Description
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{batch.description}</p>
            </div>
          )}

          {/* ── Timestamps ── */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
            <div>
              <span className="font-medium text-slate-400 block mb-0.5">Created</span>
              {formatDateTime(batch.createdAt)}
            </div>
            <div>
              <span className="font-medium text-slate-400 block mb-0.5">Updated</span>
              {formatDateTime(batch.updatedAt)}
            </div>
          </div>
        </div>

        {/* ── Footer CTA ── */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          <Link href={`/wizard?batchId=${batch.id}`} className="flex-1">
            <Button className="w-full" icon={<Wand2 size={15} />}>
              Open in Wizard
            </Button>
          </Link>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function BatchTableRow({
  batch,
  animDelay,
  onClickRow,
  onEdit,
}: {
  batch: Batch;
  animDelay: number;
  onClickRow: () => void;
  onEdit: () => void;
}) {
  const { state, dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);

  const project  = state.projects.find(p => p.id === batch.projectId);
  const recon    = state.reconciliations.find(r => r.batchId === batch.id);
  const pipeline = getPipelineCounts(batch, recon?.matchRate ?? batch.matchRate);

  const handleDelete = () => {
    dispatch({ type: 'DELETE_BATCH', payload: batch.id });
    if (project) {
      dispatch({
        type: 'UPDATE_PROJECT',
        payload: { ...project, batchCount: Math.max(0, project.batchCount - 1), updatedAt: new Date().toISOString() },
      });
    }
    addAudit('BATCH_DELETED', 'Batch', batch.id, batch.name, `Batch "${batch.name}" deleted`);
    toast('Batch deleted', 'info');
    setShowDelete(false);
  };

  const reconCell = () => {
    if (pipeline.reconciliation == null) return <span className="text-slate-300">—</span>;
    const pct   = pipeline.reconciliation;
    const color = pct >= 97 ? 'text-emerald-600' : pct >= 90 ? 'text-amber-600' : 'text-red-600';
    const bar   = pct >= 97 ? 'bg-emerald-500'   : pct >= 90 ? 'bg-amber-400'   : 'bg-red-500';
    return (
      <div className="flex items-center gap-2">
        <div className="w-14 bg-slate-100 rounded-full h-1.5">
          <div className={cn('h-1.5 rounded-full', bar)} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn('text-sm font-semibold tabular-nums', color)}>
          {formatPercent(pct)}
        </span>
      </div>
    );
  };

  return (
    <>
      <tr
        onClick={onClickRow}
        style={{ opacity: 0, animation: `fadeIn 0.2s ease ${animDelay}s forwards` }}
        className="group cursor-pointer hover:bg-slate-50/80 transition-colors duration-100"
      >
        {/* Batch Name + project sub-label */}
        <td className="py-3.5 pl-6 pr-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <Layers size={14} className="text-violet-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">
                {batch.name}
              </div>
              {project && (
                <div className="text-xs text-slate-400 mt-0.5">{project.name}</div>
              )}
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="py-3.5 px-4">
          <Badge variant={STATUS_VARIANT[batch.status]}>
            {batch.status.replace('_', ' ')}
          </Badge>
        </td>

        {/* Source Records */}
        <td className="py-3.5 px-4 tabular-nums">
          <span className="text-sm font-medium text-slate-700">
            {pipeline.source ? formatNumber(pipeline.source) : <span className="text-slate-300">—</span>}
          </span>
        </td>

        {/* Valid */}
        <td className="py-3.5 px-4 tabular-nums">
          <span className="text-sm font-medium text-emerald-600">
            {pipeline.valid != null ? formatNumber(pipeline.valid) : <span className="text-slate-300">—</span>}
          </span>
        </td>

        {/* Enriched */}
        <td className="py-3.5 px-4 tabular-nums">
          <span className="text-sm font-medium text-violet-600">
            {pipeline.enriched != null ? formatNumber(pipeline.enriched) : <span className="text-slate-300">—</span>}
          </span>
        </td>

        {/* Loaded */}
        <td className="py-3.5 px-4 tabular-nums">
          <span className="text-sm font-medium text-sky-600">
            {pipeline.loaded != null ? formatNumber(pipeline.loaded) : <span className="text-slate-300">—</span>}
          </span>
        </td>

        {/* Reconciliation % */}
        <td className="py-3.5 px-4">{reconCell()}</td>

        {/* Row actions — visible on hover */}
        <td className="py-3.5 pl-2 pr-6">
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
            onClick={e => e.stopPropagation()}
          >
            <Link href={`/wizard?batchId=${batch.id}`}>
              <button
                className="p-1.5 rounded-md hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 transition-colors"
                title="Open in Wizard"
              >
                <Wand2 size={13} />
              </button>
            </Link>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Edit batch"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Delete batch"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Batch"
        confirmLabel="Delete"
        message={`Permanently delete "${batch.name}"? Associated rules, mappings and exclusions will also be removed.`}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BatchesPage() {
  const { state } = useStore();

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState<string>('all');
  const [projectFilter,  setProjectFilter]  = useState<string>('all');
  const [sortBy,         setSortBy]         = useState<'date' | 'name' | 'records'>('date');
  const [showCreate,     setShowCreate]     = useState(false);
  const [detailBatch,    setDetailBatch]    = useState<Batch | null>(null);
  const [editBatch,      setEditBatch]      = useState<Batch | null>(null);

  const filtered = useMemo(() => {
    let list = [...state.batches];
    if (search)                  list = list.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter  !== 'all') list = list.filter(b => b.status    === statusFilter);
    if (projectFilter !== 'all') list = list.filter(b => b.projectId === projectFilter);
    if (sortBy === 'name')       list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'records') list.sort((a, b) => (b.recordCount ?? 0) - (a.recordCount ?? 0));
    else                         list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [state.batches, search, statusFilter, projectFilter, sortBy]);

  const TABLE_COLS = [
    { key: 'name',    label: 'Batch Name',      cls: 'pl-6 pr-4 text-left' },
    { key: 'status',  label: 'Status',           cls: 'px-4 text-left' },
    { key: 'source',  label: 'Source Records',   cls: 'px-4 text-left' },
    { key: 'valid',   label: 'Valid',            cls: 'px-4 text-left' },
    { key: 'enriched',label: 'Enriched',         cls: 'px-4 text-left' },
    { key: 'loaded',  label: 'Loaded',           cls: 'px-4 text-left' },
    { key: 'recon',   label: 'Reconciliation %', cls: 'px-4 text-left' },
    { key: 'actions', label: '',                 cls: 'pl-2 pr-6' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">

        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Search batches…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Projects</option>
          {state.projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={() => setSortBy(s => s === 'date' ? 'name' : s === 'name' ? 'records' : 'date')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap"
        >
          <ArrowUpDown size={14} />
          Sort: {sortBy === 'date' ? 'Date' : sortBy === 'name' ? 'Name' : 'Records'}
        </button>

        <Button icon={<Plus size={15} />} onClick={() => setShowCreate(true)}>
          New Batch
        </Button>
      </div>

      {/* ── Filter summary chips ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">
          {filtered.length} batch{filtered.length !== 1 ? 'es' : ''}
        </span>
        {(['completed', 'in_progress', 'pending', 'failed'] as BatchStatus[]).map(s => {
          const count = state.batches.filter(b => b.status === s).length;
          if (!count) return null;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className="transition-opacity hover:opacity-75"
            >
              <Badge variant={STATUS_VARIANT[s]}>{count} {s.replace('_', ' ')}</Badge>
            </button>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Layers size={26} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">
            {search || statusFilter !== 'all' || projectFilter !== 'all'
              ? 'No batches match your filters'
              : 'No batches yet'}
          </p>
          <p className="text-xs text-slate-400 mb-5">
            {search || statusFilter !== 'all' || projectFilter !== 'all'
              ? 'Try adjusting search or filters'
              : 'Click + New Batch to get started'}
          </p>
          {!search && statusFilter === 'all' && projectFilter === 'all' && (
            <Button icon={<Plus size={14} />} size="sm" onClick={() => setShowCreate(true)}>
              Create First Batch
            </Button>
          )}
        </div>
      )}

      {/* ── Borderless table ── */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-slate-50/80">
                {TABLE_COLS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap',
                      col.cls,
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((batch, i) => (
                <BatchTableRow
                  key={batch.id}
                  batch={batch}
                  animDelay={i * 0.04}
                  onClickRow={() => setDetailBatch(batch)}
                  onEdit={() => { setEditBatch(batch); }}
                />
              ))}
            </tbody>
          </table>

          {/* Footer count */}
          <div className="px-6 py-3 bg-slate-50/40">
            <p className="text-xs text-slate-400">
              Showing {filtered.length} of {state.batches.length} batch{state.batches.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Create modal ── */}
      <BatchFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* ── Edit modal ── */}
      {editBatch && (
        <BatchFormModal
          open
          onClose={() => setEditBatch(null)}
          initial={editBatch}
        />
      )}

      {/* ── Detail drawer ── */}
      <AnimatePresence>
        {detailBatch && (
          <BatchDetailDrawer
            batch={detailBatch}
            onClose={() => setDetailBatch(null)}
            onEdit={() => {
              setEditBatch(detailBatch);
              setDetailBatch(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
