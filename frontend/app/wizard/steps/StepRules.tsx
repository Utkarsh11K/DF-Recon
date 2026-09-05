'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Trash2, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, ToggleLeft, ToggleRight, Info, BarChart3, ListChecks
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Rule, RuleType, RuleSeverity } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS,
} from './shared';
import type { StepProps } from './shared';

const TYPE_LABELS: Record<RuleType, string> = { format: 'Format', range: 'Range', regex: 'Regex', lookup: 'Lookup', custom: 'Custom' };

const TABS = [
  { id: 'summary',    label: 'Quality Summary',    icon: <BarChart3 size={12} /> },
  { id: 'rules',      label: 'Validation Rules',   icon: <ShieldCheck size={12} /> },
  { id: 'results',    label: 'Rule Results',        icon: <ListChecks size={12} /> },
];

// ── Rule Form Modal ───────────────────────────────────────────────────────────
function RuleModal({ open, onClose, batchId, initial }: {
  open: boolean; onClose: () => void; batchId: string; initial?: Rule;
}) {
  const { dispatch, genId, addAudit, state } = useStore();
  const { toast } = useToast();
  const cols = state.batches.find(b => b.id === batchId)?.sourceFile?.columns.map(c => c.name)
    ?? DEMO_SOURCE_COLS.map(c => c.name);

  const [form, setForm] = useState({
    name: initial?.name ?? '', description: initial?.description ?? '',
    column: initial?.column ?? (cols[0] ?? ''),
    type: (initial?.type ?? 'regex') as RuleType,
    severity: (initial?.severity ?? 'error') as RuleSeverity,
    configValue:
      initial?.type === 'regex'  ? (initial.config.pattern as string ?? '') :
      initial?.type === 'range'  ? `${initial.config.min ?? ''},${initial.config.max ?? ''}` :
      initial?.type === 'lookup' ? (initial.config.values as string[] ?? []).join(',') : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buildConfig = () => {
    if (form.type === 'regex')  return { pattern: form.configValue };
    if (form.type === 'range')  { const [a, b] = form.configValue.split(',').map(Number); return { min: isNaN(a) ? undefined : a, max: isNaN(b) ? undefined : b }; }
    if (form.type === 'lookup') return { values: form.configValue.split(',').map(s => s.trim()).filter(Boolean) };
    return {};
  };

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name required';
    setErrors(e);
    if (Object.keys(e).length) return;
    const config = buildConfig();
    if (initial) {
      dispatch({ type: 'UPDATE_RULE', payload: { ...initial, ...form, config } as Rule });
      addAudit('RULE_UPDATED', 'Rule', initial.id, form.name, `Rule "${form.name}" updated`);
      toast('Rule updated', 'success');
    } else {
      const id = genId();
      dispatch({ type: 'ADD_RULE', payload: { id, batchId, name: form.name, description: form.description, column: form.column, type: form.type, severity: form.severity, config, enabled: true, createdAt: new Date().toISOString() } });
      addAudit('RULE_CREATED', 'Rule', id, form.name, `Rule "${form.name}" added`);
      toast('Rule created', 'success');
    }
    onClose();
  };

  const configHint = form.type === 'regex' ? 'Regex pattern' : form.type === 'range' ? 'min,max values' : form.type === 'lookup' ? 'Comma-separated allowed values' : '';
  const configPlaceholder = form.type === 'regex' ? '^[^@]+@[^@]+\\.[^@]+$' : form.type === 'range' ? '0,1000' : 'value1,value2';

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Rule' : 'New Validation Rule'}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave}>{initial ? 'Save' : 'Create Rule'}</Button></>}>
      <div className="space-y-4">
        <Input label="Rule Name" placeholder="e.g. Email Format Check" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Input label="Description" placeholder="What does this rule check?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Column</label>
            <select value={form.column} onChange={e => setForm(f => ({ ...f, column: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as RuleType }))}>
            {(Object.keys(TYPE_LABELS) as RuleType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </Select>
        </div>
        <Select label="Severity" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as RuleSeverity }))}>
          <option value="error">Error – blocks reconciliation</option>
          <option value="warning">Warning – flags discrepancies</option>
          <option value="info">Info – informational</option>
        </Select>
        {form.type !== 'format' && form.type !== 'custom' && (
          <Input label="Configuration" placeholder={configPlaceholder} value={form.configValue}
            onChange={e => setForm(f => ({ ...f, configValue: e.target.value }))} hint={configHint} />
        )}
      </div>
    </Modal>
  );
}

// ── Quality Summary tab ───────────────────────────────────────────────────────
function TabQualitySummary({ rules, batchId }: { rules: Rule[]; batchId: string }) {
  const enabled = rules.filter(r => r.enabled);
  const errs = enabled.filter(r => r.severity === 'error').length;
  const warns = enabled.filter(r => r.severity === 'warning').length;
  const infos = enabled.filter(r => r.severity === 'info').length;
  const score = rules.length ? Math.round(100 - (errs * 10 + warns * 3)) : 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Rules"    value={rules.length}   color="bg-slate-50 text-slate-700" />
        <StatTile label="Error Rules"    value={errs}           color="bg-red-50 text-red-700" />
        <StatTile label="Warning Rules"  value={warns}          color="bg-amber-50 text-amber-700" />
        <StatTile label="Quality Score"  value={`${Math.max(0, score)}%`} color={score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
      </div>

      {rules.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">No rules defined yet</p>
            <p>Switch to the Validation Rules tab to add rules. Rules are optional but recommended for data quality assurance.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Rules by column */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Rules by Column</p>
            <div className="space-y-2">
              {Array.from(new Set(rules.map(r => r.column))).map(col => {
                const colRules = rules.filter(r => r.column === col);
                const hasError = colRules.some(r => r.severity === 'error');
                return (
                  <div key={col} className="flex items-center gap-3">
                    <code className="text-xs bg-slate-100 px-2 py-0.5 rounded w-36 truncate">{col}</code>
                    <div className="flex gap-1.5 flex-wrap">
                      {colRules.map(r => (
                        <Badge key={r.id} variant={r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'info'}>
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Coverage */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">Rule Coverage</p>
            <p className="text-xs text-slate-400 mb-3">{rules.length} rules across {new Set(rules.map(r => r.column)).size} columns</p>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.min(100, rules.length * 12)}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Validation Rules tab ──────────────────────────────────────────────────────
function TabValidationRules({ rules, batchId, onAdd }: { rules: Rule[]; batchId: string; onAdd: () => void }) {
  const { dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [editRule, setEditRule] = useState<Rule | undefined>();
  const [deleteRule, setDeleteRule] = useState<Rule | undefined>();

  const toggleRule = (rule: Rule) => dispatch({ type: 'UPDATE_RULE', payload: { ...rule, enabled: !rule.enabled } });
  const handleDelete = (rule: Rule) => {
    dispatch({ type: 'DELETE_RULE', payload: rule.id });
    addAudit('RULE_DELETED', 'Rule', rule.id, rule.name, `Rule "${rule.name}" deleted`);
    toast('Rule deleted', 'info');
    setDeleteRule(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} size="sm" onClick={onAdd}>Add Rule</Button>
      </div>

      {rules.length === 0 ? (
        <EmptyCard icon={<ShieldCheck size={22} className="text-slate-400" />}
          title="No rules defined" message="Add validation rules to enforce data quality before reconciliation."
          action={<Button icon={<Plus size={14} />} size="sm" variant="outline" onClick={onAdd}>Add First Rule</Button>} />
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <motion.div key={rule.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
              className={cn('bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3', !rule.enabled && 'opacity-50')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{rule.name}</span>
                  <Badge variant={rule.severity === 'error' ? 'error' : rule.severity === 'warning' ? 'warning' : 'info'}>{rule.severity}</Badge>
                  <Badge variant="outline">{TYPE_LABELS[rule.type]}</Badge>
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{rule.column}</code>
                  {!rule.enabled && <Badge variant="outline">Disabled</Badge>}
                </div>
                {rule.description && <p className="text-xs text-slate-400 mt-1">{rule.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleRule(rule)} className="p-1.5 rounded-md hover:bg-slate-100">
                  {rule.enabled ? <ToggleRight size={18} className="text-indigo-500" /> : <ToggleLeft size={18} className="text-slate-400" />}
                </button>
                <button onClick={() => setEditRule(rule)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil size={14} /></button>
                <button onClick={() => setDeleteRule(rule)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {editRule && <RuleModal open onClose={() => setEditRule(undefined)} batchId={batchId} initial={editRule} />}
      {deleteRule && <ConfirmDialog open onClose={() => setDeleteRule(undefined)} onConfirm={() => handleDelete(deleteRule)} title="Delete Rule" message={`Delete rule "${deleteRule.name}"?`} confirmLabel="Delete" />}
    </div>
  );
}

// ── Rule Results tab ──────────────────────────────────────────────────────────
function TabRuleResults({ rules, batch }: { rules: Rule[]; batch: ReturnType<typeof useStore>['state']['batches'][0] | null }) {
  if (rules.length === 0) return (
    <EmptyCard icon={<ListChecks size={22} className="text-slate-400" />}
      title="No rules to evaluate" message="Add validation rules first, then run the pre-load preview to see results." />
  );

  // Simulate rule evaluation results based on rules + file data
  const results = rules.map(rule => {
    const rowCount = batch?.sourceFile?.rowCount ?? 1000;
    const failCount = rule.severity === 'error'
      ? Math.floor(rowCount * (Math.random() * 0.03))
      : Math.floor(rowCount * (Math.random() * 0.08));
    const passCount = rowCount - failCount;
    return { ...rule, passCount, failCount, rowCount, passRate: (passCount / rowCount) * 100 };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <Info size={14} className="text-amber-500 shrink-0" />
        <p className="text-xs text-amber-700">Results shown are simulated based on schema analysis. Run Pre-Load Preview for exact counts.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Rule', 'Column', 'Severity', 'Pass', 'Fail', 'Pass Rate', 'Status'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.04 } }} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-800">{r.name}</td>
                <td className="py-2.5 px-4"><code className="bg-slate-100 px-1.5 py-0.5 rounded">{r.column}</code></td>
                <td className="py-2.5 px-4"><Badge variant={r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'info'}>{r.severity}</Badge></td>
                <td className="py-2.5 px-4 text-emerald-600 font-semibold">{r.passCount.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-red-600 font-semibold">{r.failCount.toLocaleString()}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${r.passRate}%` }} />
                    </div>
                    <span>{r.passRate.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="py-2.5 px-4">
                  {r.failCount === 0
                    ? <Badge variant="success"><CheckCircle2 size={10} className="mr-1" />Pass</Badge>
                    : r.severity === 'error'
                    ? <Badge variant="error"><XCircle size={10} className="mr-1" />Fail</Badge>
                    : <Badge variant="warning"><AlertTriangle size={10} className="mr-1" />Warn</Badge>}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepRules({ batch, onAdvance, onBack }: StepProps) {
  const { state } = useStore();
  const [activeTab, setActiveTab] = useState('summary');
  const [showCreate, setShowCreate] = useState(false);

  const activeBatchId = batch?.id ?? '__standalone__';
  const rules = state.rules.filter(r => r.batchId === activeBatchId);
  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? null : null;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Rules & Quality</h2>
        <p className="text-sm text-slate-500 mt-1">Define validation rules and review data quality before reconciliation.</p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'summary' && <TabQualitySummary rules={rules} batchId={activeBatchId} />}
          {activeTab === 'rules'   && <TabValidationRules rules={rules} batchId={activeBatchId} onAdd={() => setShowCreate(true)} />}
          {activeTab === 'results' && <TabRuleResults rules={rules} batch={batchObj} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Exclusions" />

      <RuleModal open={showCreate} onClose={() => setShowCreate(false)} batchId={activeBatchId} />
    </div>
  );
}
