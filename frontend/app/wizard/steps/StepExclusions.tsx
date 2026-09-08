'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Trash2, FilterX, ToggleLeft, ToggleRight,
  Info, Eye, List, SlidersHorizontal, CheckCircle2, XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Exclusion } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS,
} from './shared';
import type { StepProps } from './shared';

type Operator = Exclusion['operator'];
const OPERATORS: { value: Operator; label: string; needsValue: boolean }[] = [
  { value: 'equals',      label: 'Equals',         needsValue: true },
  { value: 'contains',    label: 'Contains',        needsValue: true },
  { value: 'startsWith',  label: 'Starts With',     needsValue: true },
  { value: 'endsWith',    label: 'Ends With',       needsValue: true },
  { value: 'regex',       label: 'Regex Match',     needsValue: true },
  { value: 'isNull',      label: 'Is Null / Empty', needsValue: false },
  { value: 'greaterThan', label: 'Greater Than',    needsValue: true },
  { value: 'lessThan',    label: 'Less Than',       needsValue: true },
];

const TABS = [
  { id: 'rules',      label: 'Exclusion Rules', icon: <List size={12} /> },
  { id: 'conditions', label: 'Conditions',       icon: <SlidersHorizontal size={12} /> },
  { id: 'preview',    label: 'Preview',          icon: <Eye size={12} /> },
];

// ── Exclusion Modal ───────────────────────────────────────────────────────────
function ExclusionModal({ open, onClose, batchId, initial }: {
  open: boolean; onClose: () => void; batchId: string; initial?: Exclusion;
}) {
  const { dispatch, genId, addAudit, state } = useStore();
  const { toast } = useToast();
  const cols = state.batches.find(b => b.id === batchId)?.sourceFile?.columns.map(c => c.name)
    ?? DEMO_SOURCE_COLS.map(c => c.name);

  const [form, setForm] = useState({
    name: initial?.name ?? '', description: initial?.description ?? '',
    column: initial?.column ?? (cols[0] ?? ''),
    operator: (initial?.operator ?? 'contains') as Operator,
    value: initial?.value ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const opDef = OPERATORS.find(o => o.value === form.operator);

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name required';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (initial) {
      dispatch({ type: 'UPDATE_EXCLUSION', payload: { ...initial, ...form } });
      addAudit('EXCLUSION_UPDATED', 'Exclusion', initial.id, form.name, `Exclusion "${form.name}" updated`);
      toast('Exclusion updated', 'success');
    } else {
      const id = genId();
      dispatch({ type: 'ADD_EXCLUSION', payload: { id, batchId, name: form.name, description: form.description, column: form.column, operator: form.operator, value: form.value, enabled: true, createdAt: new Date().toISOString() } });
      addAudit('EXCLUSION_CREATED', 'Exclusion', id, form.name, `Exclusion "${form.name}" added`);
      toast('Exclusion created', 'success');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Exclusion' : 'New Exclusion'}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave}>{initial ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-4">
        <Input label="Name" placeholder="e.g. Exclude Test Accounts" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Input label="Description" placeholder="Why exclude these records?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Column</label>
            <select value={form.column} onChange={e => setForm(f => ({ ...f, column: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Operator</label>
            <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value as Operator }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {opDef?.needsValue && (
          <Input label="Value" placeholder="Value to match" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
        )}
      </div>
    </Modal>
  );
}

// ── Exclusion Rules tab ───────────────────────────────────────────────────────
function TabExclusionRules({ exclusions, batchId, onAdd }: { exclusions: Exclusion[]; batchId: string; onAdd: () => void }) {
  const { dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [editEx, setEditEx] = useState<Exclusion | undefined>();
  const [deleteEx, setDeleteEx] = useState<Exclusion | undefined>();
  const opLabel = (op: Operator) => OPERATORS.find(o => o.value === op)?.label ?? op;

  const toggleEx = (ex: Exclusion) => dispatch({ type: 'UPDATE_EXCLUSION', payload: { ...ex, enabled: !ex.enabled } });
  const handleDelete = (ex: Exclusion) => {
    dispatch({ type: 'DELETE_EXCLUSION', payload: ex.id });
    addAudit('EXCLUSION_DELETED', 'Exclusion', ex.id, ex.name, `Exclusion "${ex.name}" deleted`);
    toast('Exclusion deleted', 'info');
    setDeleteEx(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">{exclusions.filter(e => e.enabled).length} of {exclusions.length} exclusions active</p>
        <Button icon={<Plus size={14} />} size="sm" onClick={onAdd}>Add Exclusion</Button>
      </div>
      {exclusions.length === 0 ? (
        <EmptyCard icon={<FilterX size={22} className="text-slate-400" />}
          title="No exclusions defined" message="Exclusions are optional. Add rules to skip specific records from reconciliation."
          action={<Button icon={<Plus size={14} />} size="sm" variant="outline" onClick={onAdd}>Add Exclusion</Button>} />
      ) : (
        <div className="space-y-2">
          {exclusions.map((ex, i) => (
            <motion.div key={ex.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
              className={cn('bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3', !ex.enabled && 'opacity-50')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{ex.name}</span>
                  {!ex.enabled && <Badge variant="outline">Disabled</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">{ex.column}</code>
                  <span className="text-slate-400">{opLabel(ex.operator)}</span>
                  {ex.value && <code className="bg-slate-100 px-1.5 py-0.5 rounded">"{ex.value}"</code>}
                </div>
                {ex.description && <p className="text-xs text-slate-400 mt-1">{ex.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleEx(ex)} className="p-1.5 rounded-md hover:bg-slate-100">
                  {ex.enabled ? <ToggleRight size={18} className="text-indigo-500" /> : <ToggleLeft size={18} className="text-slate-400" />}
                </button>
                <button onClick={() => setEditEx(ex)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil size={14} /></button>
                <button onClick={() => setDeleteEx(ex)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {editEx && <ExclusionModal open onClose={() => setEditEx(undefined)} batchId={batchId} initial={editEx} />}
      {deleteEx && <ConfirmDialog open onClose={() => setDeleteEx(undefined)} onConfirm={() => handleDelete(deleteEx)} title="Delete Exclusion" message={`Delete "${deleteEx.name}"?`} confirmLabel="Delete" />}
    </div>
  );
}

// ── Conditions tab ────────────────────────────────────────────────────────────
function TabConditions({ exclusions }: { exclusions: Exclusion[] }) {
  if (exclusions.length === 0) return (
    <EmptyCard icon={<SlidersHorizontal size={22} className="text-slate-400" />}
      title="No conditions" message="Add exclusion rules first, then see their conditions summarised here." />
  );
  const opLabel = (op: Operator) => OPERATORS.find(o => o.value === op)?.label ?? op;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">All enabled exclusion conditions are combined with OR logic — a record matching ANY condition will be excluded.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">Active Conditions</p>
        </div>
        <div className="divide-y divide-slate-100">
          {exclusions.filter(e => e.enabled).map((ex, i) => (
            <div key={ex.id} className="px-4 py-3 flex items-center gap-3">
              {i > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded mr-2">OR</span>}
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <code className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">{ex.column}</code>
                <span className="text-slate-500 text-xs">{opLabel(ex.operator)}</span>
                {ex.value && <code className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">"{ex.value}"</code>}
                <span className="text-xs text-slate-400">→ {ex.name}</span>
              </div>
            </div>
          ))}
          {exclusions.filter(e => e.enabled).length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">No enabled conditions</div>
          )}
        </div>
      </div>

      {/* Disabled conditions */}
      {exclusions.filter(e => !e.enabled).length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">Disabled Conditions (not applied)</p>
          <div className="space-y-1">
            {exclusions.filter(e => !e.enabled).map(ex => (
              <div key={ex.id} className="flex items-center gap-2 text-xs text-slate-400">
                <XCircle size={12} /> <span>{ex.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Preview tab ───────────────────────────────────────────────────────────────
function TabPreview({ exclusions, batch }: { exclusions: Exclusion[]; batch: ReturnType<typeof useStore>['state']['batches'][0] | null }) {
  const rowCount = batch?.sourceFile?.rowCount ?? 1000;
  const enabledCount = exclusions.filter(e => e.enabled).length;
  const estimatedExcluded = enabledCount > 0 ? Math.floor(rowCount * (enabledCount * 0.015)) : 0;
  const remaining = rowCount - estimatedExcluded;

  if (exclusions.length === 0) return (
    <EmptyCard icon={<Eye size={22} className="text-slate-400" />}
      title="No exclusions to preview" message="Add exclusion rules first to preview their effect on your data." />
  );

  // Simulate affected rows
  const cols = batch?.sourceFile?.columns.slice(0, 4) ?? DEMO_SOURCE_COLS.slice(0, 4);
  const fakeRows = Array.from({ length: Math.min(15, estimatedExcluded || 8) }, (_, i) => {
    const excl = exclusions[i % enabledCount];
    return {
      rowIndex: i + 1,
      reason: excl ? `${excl.name}: ${excl.column} ${OPERATORS.find(o => o.value === excl.operator)?.label ?? excl.operator} "${excl.value}"` : 'Unknown',
      data: Object.fromEntries(cols.map(c => [c.name, `${c.name.slice(0,2).toUpperCase()}${String(i+1).padStart(3,'0')}`])),
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Records"     value={rowCount.toLocaleString()}           color="bg-slate-50 text-slate-700" />
        <StatTile label="Est. Excluded"     value={estimatedExcluded.toLocaleString()}  color="bg-red-50 text-red-700" />
        <StatTile label="Remaining"         value={remaining.toLocaleString()}          color="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Sample Excluded Rows</p>
          <p className="text-xs text-slate-400 mt-0.5">Showing {fakeRows.length} sample rows that match exclusion conditions</p>
        </div>
        <table className="w-full text-xs min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 w-10">#</th>
              {cols.map(c => <th key={c.name} className="text-left py-2.5 px-3 font-semibold text-slate-500">{c.name}</th>)}
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500">Exclusion Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fakeRows.map(row => (
              <tr key={row.rowIndex} className="bg-red-50/40 hover:bg-red-50">
                <td className="py-2 px-3 text-slate-400">{row.rowIndex}</td>
                {cols.map(c => (
                  <td key={c.name} className="py-2 px-3 font-mono text-slate-600">{String(row.data[c.name] ?? '—')}</td>
                ))}
                <td className="py-2 px-3 text-red-600 text-xs">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepExclusions({ batch, onAdvance, onBack }: StepProps) {
  const { state } = useStore();
  const [activeTab, setActiveTab] = useState('rules');
  const [showCreate, setShowCreate] = useState(false);

  const activeBatchId = batch?.id ?? '__standalone__';
  const exclusions = state.exclusions.filter(e => e.batchId === activeBatchId);
  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? null : null;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Exclusions</h2>
        <p className="text-sm text-slate-500 mt-1">Define records to exclude before reconciliation runs.</p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'rules'      && <TabExclusionRules exclusions={exclusions} batchId={activeBatchId} onAdd={() => setShowCreate(true)} />}
          {activeTab === 'conditions' && <TabConditions exclusions={exclusions} />}
          {activeTab === 'preview'    && <TabPreview exclusions={exclusions} batch={batchObj} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Mapping" />

      <ExclusionModal open={showCreate} onClose={() => setShowCreate(false)} batchId={activeBatchId} />
    </div>
  );
}
