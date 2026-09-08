'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Trash2, GitMerge, Zap, ToggleLeft, ToggleRight,
  ArrowRight, CheckCircle2, XCircle, AlertTriangle, Columns, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Mapping, TransformType } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS, DEMO_TARGET_COLS,
} from './shared';
import type { StepProps } from './shared';

type ColShape = { name: string; dataType: string; isPrimaryKeyCandidate: boolean; nullCount?: number; uniqueCount?: number };

const TRANSFORMS: { value: TransformType; label: string; description: string; category: string }[] = [
  { value: 'direct',     label: 'Direct',       description: 'Copy value as-is',          category: 'Basic' },
  { value: 'rename',     label: 'Rename',        description: 'Map different column names', category: 'Basic' },
  { value: 'trim',       label: 'Trim',          description: 'Remove leading/trailing whitespace', category: 'String' },
  { value: 'upper',      label: 'UPPER',         description: 'Convert to uppercase',       category: 'String' },
  { value: 'lower',      label: 'lower',         description: 'Convert to lowercase',       category: 'String' },
  { value: 'dateFormat', label: 'Date Format',   description: 'Reformat date strings',      category: 'Date' },
  { value: 'formula',    label: 'Formula',       description: 'Custom expression',          category: 'Advanced' },
  { value: 'concat',     label: 'Concatenate',   description: 'Join multiple values',       category: 'Advanced' },
  { value: 'split',      label: 'Split',         description: 'Split into parts',           category: 'Advanced' },
  { value: 'lookup',     label: 'Lookup',        description: 'Map values via dictionary',  category: 'Advanced' },
];

const TABS = [
  { id: 'source',     label: 'Source Columns',      icon: <Columns size={12} /> },
  { id: 'target',     label: 'Target Columns',       icon: <Columns size={12} /> },
  { id: 'transform',  label: 'Transformations',      icon: <RefreshCw size={12} /> },
  { id: 'validation', label: 'Mapping Validation',   icon: <CheckCircle2 size={12} /> },
];

// ── Mapping Modal ─────────────────────────────────────────────────────────────
function MappingModal({ open, onClose, batchId, initial }: {
  open: boolean; onClose: () => void; batchId: string; initial?: Mapping;
}) {
  const { dispatch, genId, addAudit, state } = useStore();
  const { toast } = useToast();
  const batch = state.batches.find(b => b.id === batchId);
  const sourceCols = (batch?.sourceFile?.columns ?? DEMO_SOURCE_COLS as ColShape[]).map(c => c.name);
  const targetCols = (batch?.targetFile?.columns ?? DEMO_TARGET_COLS as ColShape[]).map(c => c.name);

  const [form, setForm] = useState({
    sourceColumn: initial?.sourceColumn ?? (sourceCols[0] ?? ''),
    targetColumn: initial?.targetColumn ?? (targetCols[0] ?? ''),
    transformType: initial?.transformType ?? 'direct' as TransformType,
    formulaExpr: (initial?.transformConfig?.expression as string) ?? '',
    datePattern: (initial?.transformConfig?.pattern as string) ?? '',
  });

  const handleSave = () => {
    const config: Record<string, unknown> = {};
    if (form.transformType === 'formula')    config.expression = form.formulaExpr;
    if (form.transformType === 'dateFormat') config.pattern    = form.datePattern;
    if (initial) {
      dispatch({ type: 'UPDATE_MAPPING', payload: { ...initial, ...form, transformConfig: config } });
      addAudit('MAPPING_UPDATED', 'Mapping', initial.id, `${form.sourceColumn} → ${form.targetColumn}`, 'Mapping updated');
      toast('Mapping updated', 'success');
    } else {
      const id = genId();
      dispatch({ type: 'ADD_MAPPING', payload: { id, batchId, sourceColumn: form.sourceColumn, targetColumn: form.targetColumn, transformType: form.transformType, transformConfig: config, enabled: true, createdAt: new Date().toISOString() } });
      addAudit('MAPPING_CREATED', 'Mapping', id, `${form.sourceColumn} → ${form.targetColumn}`, 'Mapping created');
      toast('Mapping created', 'success');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Mapping' : 'New Column Mapping'}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave}>{initial ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Source Column</label>
            <select value={form.sourceColumn} onChange={e => setForm(f => ({ ...f, sourceColumn: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {sourceCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Target Column</label>
            <select value={form.targetColumn} onChange={e => setForm(f => ({ ...f, targetColumn: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {targetCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Transformation</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TRANSFORMS.map(t => (
              <button key={t.value} onClick={() => setForm(f => ({ ...f, transformType: t.value }))}
                className={cn('p-2.5 rounded-lg border text-xs text-left transition-colors',
                  form.transformType === t.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-200 text-slate-600')}>
                <div className="font-semibold">{t.label}</div>
                <div className="text-slate-400 leading-tight mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
        {form.transformType === 'formula' && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Formula Expression</label>
            <input className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. UPPER(TRIM(${source}))" value={form.formulaExpr}
              onChange={e => setForm(f => ({ ...f, formulaExpr: e.target.value }))} />
          </div>
        )}
        {form.transformType === 'dateFormat' && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Date Pattern</label>
            <input className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. YYYY-MM-DD → DD/MM/YYYY" value={form.datePattern}
              onChange={e => setForm(f => ({ ...f, datePattern: e.target.value }))} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Source Columns tab ────────────────────────────────────────────────────────
function TabSourceColumns({ sCols, mappings, onAddMapping }: { sCols: ColShape[]; mappings: Mapping[]; onAddMapping: (col: string) => void }) {
  const mappedSet = new Set(mappings.map(m => m.sourceColumn));
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Column', 'Type', 'Key?', 'Mapped To', 'Status', ''].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sCols.map((col, i) => {
              const mapping = mappings.find(m => m.sourceColumn === col.name);
              const isMapped = !!mapping;
              return (
                <motion.tr key={col.name} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-800">{col.name}</td>
                  <td className="py-2.5 px-4"><Badge variant="outline">{col.dataType}</Badge></td>
                  <td className="py-2.5 px-4">{col.isPrimaryKeyCandidate ? '🔑' : '—'}</td>
                  <td className="py-2.5 px-4">
                    {mapping ? <code className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{mapping.targetColumn}</code> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    {isMapped ? <Badge variant="success"><CheckCircle2 size={10} className="mr-1" />Mapped</Badge> : <Badge variant="outline">Unmapped</Badge>}
                  </td>
                  <td className="py-2.5 px-4">
                    {!isMapped && <button onClick={() => onAddMapping(col.name)} className="text-xs text-indigo-600 hover:underline font-medium">+ Map</button>}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Target Columns tab ────────────────────────────────────────────────────────
function TabTargetColumns({ tCols, mappings, onAddMapping }: { tCols: ColShape[]; mappings: Mapping[]; onAddMapping: (col: string) => void }) {
  const mappedSet = new Set(mappings.map(m => m.targetColumn));
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Column', 'Type', 'Key?', 'Mapped From', 'Status'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tCols.map((col, i) => {
              const mapping = mappings.find(m => m.targetColumn === col.name);
              const isMapped = !!mapping;
              return (
                <motion.tr key={col.name} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-800">{col.name}</td>
                  <td className="py-2.5 px-4"><Badge variant="outline">{col.dataType}</Badge></td>
                  <td className="py-2.5 px-4">{col.isPrimaryKeyCandidate ? '🔑' : '—'}</td>
                  <td className="py-2.5 px-4">
                    {mapping ? <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{mapping.sourceColumn}</code> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    {isMapped ? <Badge variant="success"><CheckCircle2 size={10} className="mr-1" />Mapped</Badge> : <Badge variant="warning">Unmapped</Badge>}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Transformations tab ───────────────────────────────────────────────────────
function TabTransformations({ mappings, batchId, onAdd }: { mappings: Mapping[]; batchId: string; onAdd: () => void }) {
  const { dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [editMap, setEditMap] = useState<Mapping | undefined>();
  const [deleteMap, setDeleteMap] = useState<Mapping | undefined>();

  const toggleMap = (m: Mapping) => dispatch({ type: 'UPDATE_MAPPING', payload: { ...m, enabled: !m.enabled } });
  const handleDelete = (m: Mapping) => {
    dispatch({ type: 'DELETE_MAPPING', payload: m.id });
    addAudit('MAPPING_DELETED', 'Mapping', m.id, `${m.sourceColumn} → ${m.targetColumn}`, 'Mapping deleted');
    toast('Mapping deleted', 'info');
    setDeleteMap(undefined);
  };

  const transformLabel = (t: TransformType) => TRANSFORMS.find(x => x.value === t)?.label ?? t;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3">
          <StatTile label="Total" value={mappings.length} color="bg-slate-50 text-slate-700" />
          <StatTile label="Transformed" value={mappings.filter(m => m.transformType !== 'direct').length} color="bg-violet-50 text-violet-700" />
          <StatTile label="Enabled" value={mappings.filter(m => m.enabled).length} color="bg-emerald-50 text-emerald-700" />
        </div>
        <Button icon={<Plus size={14} />} size="sm" onClick={onAdd}>Add Mapping</Button>
      </div>

      {mappings.length === 0 ? (
        <EmptyCard icon={<GitMerge size={22} className="text-slate-400" />}
          title="No mappings" message="Add mappings manually or use Auto-Map to detect matching columns."
          action={<Button icon={<Plus size={14} />} size="sm" variant="outline" onClick={onAdd}>Add Mapping</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Source', 'Transform', 'Target', 'Enabled', ''].map(h => (
                  <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappings.map((m, i) => (
                <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }}
                  className={cn('hover:bg-slate-50 transition-colors', !m.enabled && 'opacity-40')}>
                  <td className="py-2.5 px-4"><code className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{m.sourceColumn}</code></td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1">
                      <ArrowRight size={12} className="text-slate-300" />
                      <Badge variant={m.transformType === 'direct' ? 'outline' : 'info'}>{transformLabel(m.transformType)}</Badge>
                      <ArrowRight size={12} className="text-slate-300" />
                    </div>
                  </td>
                  <td className="py-2.5 px-4"><code className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded">{m.targetColumn}</code></td>
                  <td className="py-2.5 px-4">
                    <button onClick={() => toggleMap(m)}>
                      {m.enabled ? <ToggleRight size={16} className="text-indigo-500" /> : <ToggleLeft size={16} className="text-slate-300" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setEditMap(m)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteMap(m)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editMap && <MappingModal open onClose={() => setEditMap(undefined)} batchId={batchId} initial={editMap} />}
      {deleteMap && <ConfirmDialog open onClose={() => setDeleteMap(undefined)} onConfirm={() => handleDelete(deleteMap)} title="Delete Mapping" message={`Delete mapping "${deleteMap.sourceColumn} → ${deleteMap.targetColumn}"?`} confirmLabel="Delete" />}
    </div>
  );
}

// ── Mapping Validation tab ────────────────────────────────────────────────────
function TabMappingValidation({ mappings, sCols, tCols }: { mappings: Mapping[]; sCols: ColShape[]; tCols: ColShape[] }) {
  const issues: { type: 'error' | 'warning'; message: string }[] = [];
  const mappedSrc = new Set(mappings.filter(m => m.enabled).map(m => m.sourceColumn));
  const mappedTgt = new Set(mappings.filter(m => m.enabled).map(m => m.targetColumn));

  // Check for unmapped key columns
  sCols.filter(c => c.isPrimaryKeyCandidate && !mappedSrc.has(c.name))
    .forEach(c => issues.push({ type: 'error', message: `Key column "${c.name}" is not mapped` }));
  // Warn about unmapped non-key columns
  const unmappedSrc = sCols.filter(c => !c.isPrimaryKeyCandidate && !mappedSrc.has(c.name));
  if (unmappedSrc.length) issues.push({ type: 'warning', message: `${unmappedSrc.length} source column(s) unmapped: ${unmappedSrc.map(c => c.name).join(', ')}` });
  const unmappedTgt = tCols.filter(c => !mappedTgt.has(c.name));
  if (unmappedTgt.length) issues.push({ type: 'warning', message: `${unmappedTgt.length} target column(s) have no source mapping: ${unmappedTgt.map(c => c.name).join(', ')}` });

  // Check for duplicate mappings
  const srcDups = mappings.filter((m, i) => mappings.findIndex(x => x.sourceColumn === m.sourceColumn) !== i);
  srcDups.forEach(m => issues.push({ type: 'error', message: `Duplicate source mapping for "${m.sourceColumn}"` }));

  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Mappings" value={mappings.length}  color="bg-slate-50 text-slate-700" />
        <StatTile label="Errors"         value={errors}           color={errors > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'} />
        <StatTile label="Warnings"       value={warnings}         color={warnings > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} />
      </div>

      {issues.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 size={18} className="text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">All mapping validations passed</p>
            <p className="text-xs text-emerald-600 mt-0.5">All columns are mapped correctly with no conflicts.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
              className={cn('flex items-start gap-3 p-3 rounded-xl border',
                issue.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200')}>
              {issue.type === 'error'
                ? <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                : <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />}
              <p className={cn('text-xs', issue.type === 'error' ? 'text-red-700' : 'text-amber-700')}>{issue.message}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Coverage summary */}
      {mappings.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Coverage</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Source coverage ({mappedSrc.size}/{sCols.length})</p>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${sCols.length ? (mappedSrc.size / sCols.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Target coverage ({mappedTgt.size}/{tCols.length})</p>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="h-2 rounded-full bg-violet-500" style={{ width: `${tCols.length ? (mappedTgt.size / tCols.length) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepMapping({ batch, onAdvance, onBack }: StepProps) {
  const { state, dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('transform');
  const [showCreate, setShowCreate] = useState(false);
  const [preSelectSrc, setPreSelectSrc] = useState<string | undefined>();

  const activeBatchId = batch?.id ?? '__standalone__';
  const mappings = state.mappings.filter(m => m.batchId === activeBatchId);
  const sCols: ColShape[] = batch?.sourceFile?.columns ?? DEMO_SOURCE_COLS as ColShape[];
  const tCols: ColShape[] = batch?.targetFile?.columns ?? DEMO_TARGET_COLS as ColShape[];

  const autoMap = () => {
    const existing = new Set(mappings.map(m => m.sourceColumn));
    let added = 0;
    sCols.forEach(sc => {
      if (existing.has(sc.name)) return;
      const target = tCols.find(tc =>
        tc.name === sc.name ||
        tc.name.toLowerCase() === sc.name.toLowerCase() ||
        tc.name.replace(/[_\s]/g, '') === sc.name.replace(/[_\s]/g, '')
      );
      if (!target) return;
      const id = genId();
      dispatch({ type: 'ADD_MAPPING', payload: { id, batchId: activeBatchId, sourceColumn: sc.name, targetColumn: target.name, transformType: 'direct', transformConfig: {}, enabled: true, createdAt: new Date().toISOString() } });
      added++;
    });
    if (added > 0) {
      if (batch) addAudit('AUTO_MAPPING', 'Batch', batch.id, batch.name, `Auto-mapped ${added} column(s)`);
      toast(`Auto-mapped ${added} column${added !== 1 ? 's' : ''}`, 'success');
    } else {
      toast('All matching columns already mapped', 'info');
    }
  };

  const handleAddFromColumn = (col: string) => {
    setPreSelectSrc(col);
    setShowCreate(true);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Mapping & Transformations</h2>
          <p className="text-sm text-slate-500 mt-1">Map source columns to target columns and define transformations.</p>
        </div>
        <Button variant="secondary" icon={<Zap size={14} />} size="sm" onClick={autoMap}>Auto-Map Columns</Button>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'source'     && <TabSourceColumns sCols={sCols} mappings={mappings} onAddMapping={handleAddFromColumn} />}
          {activeTab === 'target'     && <TabTargetColumns tCols={tCols} mappings={mappings} onAddMapping={() => setShowCreate(true)} />}
          {activeTab === 'transform'  && <TabTransformations mappings={mappings} batchId={activeBatchId} onAdd={() => setShowCreate(true)} />}
          {activeTab === 'validation' && <TabMappingValidation mappings={mappings} sCols={sCols} tCols={tCols} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Pre-Load" />

      <MappingModal open={showCreate} onClose={() => { setShowCreate(false); setPreSelectSrc(undefined); }} batchId={activeBatchId} />
    </div>
  );
}
