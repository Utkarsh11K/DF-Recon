'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  AlertTriangle, ToggleLeft, ToggleRight, Info, BarChart3, ListChecks,
  RefreshCw, Lock, MinusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Rule, RuleType, RuleSeverity, BusinessEntity, BusinessRuleDef, BusinessValidationReport } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS,
} from './shared';
import type { StepProps } from './shared';

const TYPE_LABELS: Record<RuleType, string> = {
  required: 'Required', equals_value: 'Equals Value', equals_field: 'Equals Field',
  regex: 'Regex / Format', unique_field: 'Unique',
  format: 'Format', range: 'Range', lookup: 'Lookup', custom: 'Custom',
};

// Rule types offered when creating a NEW dynamic rule (the engine supports
// exactly these). Legacy types (format/range/lookup/custom) still render
// correctly for older/demo rules but aren't offered for new rules.
const CREATABLE_TYPES: RuleType[] = ['required', 'equals_value', 'equals_field', 'regex', 'unique_field'];

const ENTITIES: BusinessEntity[] = ['Customer', 'Supplier', 'Employee'];

// Mirrors the CUS001-CUS010 catalog defined server-side in
// backend/app/services/business_rules.py (CORE_RULES). This is metadata
// only (rule names/fields/types) — never fabricated results — and exists
// solely so the Core Rules list still renders if the one catalog fetch on
// mount can't reach the backend (e.g. it's still starting up). The Rule
// Results tab always requires the live backend to actually execute rules;
// this fallback never affects PASS/FAIL numbers.
const LOCAL_CUSTOMER_CORE_RULES: BusinessRuleDef[] = [
  { rule_id: 'CUS001', rule_name: 'Address Line 1 Required', entity: 'Customer', field: 'ADDRESS_LINE_1', target_field: null, rule_type: 'required', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'ADDRESS_LINE_1 must not be null/blank.' },
  { rule_id: 'CUS002', rule_name: 'Account Description = Customer Name', entity: 'Customer', field: 'ACCOUNT_DESCRIPTION', target_field: 'CUSTOMER_NAME', rule_type: 'equals_field', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'ACCOUNT_DESCRIPTION must equal CUSTOMER_NAME.' },
  { rule_id: 'CUS003', rule_name: 'Bill To Required', entity: 'Customer', field: 'BILL_TO', target_field: null, rule_type: 'equals_value', operator: null, expected_value: 'Y', severity: 'error', enabled: true, is_core: true, description: 'BILL_TO must equal Y.' },
  { rule_id: 'CUS004', rule_name: 'Ship To Required', entity: 'Customer', field: 'SHIP_TO', target_field: null, rule_type: 'equals_value', operator: null, expected_value: 'Y', severity: 'error', enabled: true, is_core: true, description: 'SHIP_TO must equal Y.' },
  { rule_id: 'CUS005', rule_name: 'Customer Name Required', entity: 'Customer', field: 'CUSTOMER_NAME', target_field: null, rule_type: 'required', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'CUSTOMER_NAME must not be null/blank.' },
  { rule_id: 'CUS006', rule_name: 'Primary/Business Key Required & Unique', entity: 'Customer', field: null, target_field: null, rule_type: 'key_unique', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'The configured primary/business key must exist and be unique.' },
  { rule_id: 'CUS007', rule_name: 'Email Format Valid', entity: 'Customer', field: 'EMAIL', target_field: null, rule_type: 'regex', operator: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', expected_value: null, severity: 'warning', enabled: true, is_core: true, description: 'If an email field exists, validate its format.' },
  { rule_id: 'CUS008', rule_name: 'Phone Format Valid', entity: 'Customer', field: 'PHONE', target_field: null, rule_type: 'regex', operator: '^[+0-9()\\-\\s]{7,20}$', expected_value: null, severity: 'warning', enabled: true, is_core: true, description: 'If a phone field exists, validate its basic format.' },
  { rule_id: 'CUS009', rule_name: 'Country Required', entity: 'Customer', field: 'COUNTRY', target_field: null, rule_type: 'required', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'COUNTRY must not be null/blank.' },
  { rule_id: 'CUS010', rule_name: 'Duplicate Customer ID Not Allowed', entity: 'Customer', field: 'CUSTOMER_ID', target_field: null, rule_type: 'unique_field', operator: null, expected_value: null, severity: 'error', enabled: true, is_core: true, description: 'Customer/business ID must not contain duplicates.' },
];
const LOCAL_CORE_CATALOG: Record<string, BusinessRuleDef[]> = { Customer: LOCAL_CUSTOMER_CORE_RULES };

type CatalogStatus = 'loading' | 'loaded' | 'error';

const TABS = [
  { id: 'summary',    label: 'Quality Summary',    icon: <BarChart3 size={12} /> },
  { id: 'rules',      label: 'Validation Rules',   icon: <ShieldCheck size={12} /> },
  { id: 'results',    label: 'Rule Results',        icon: <ListChecks size={12} /> },
];

// ── Rule Form Modal ───────────────────────────────────────────────────────────
function RuleModal({ open, onClose, batchId, initial, entity, cols }: {
  open: boolean; onClose: () => void; batchId: string; initial?: Rule;
  entity: BusinessEntity; cols: string[];
}) {
  const { dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();
  const effectiveCols = cols.length ? cols : DEMO_SOURCE_COLS.map(c => c.name);

  const [form, setForm] = useState({
    name: initial?.name ?? '', description: initial?.description ?? '',
    column: initial?.column ?? (effectiveCols[0] ?? ''),
    type: (initial?.type ?? 'required') as RuleType,
    severity: (initial?.severity ?? 'error') as RuleSeverity,
    targetColumn: initial?.targetColumn ?? (effectiveCols[1] ?? effectiveCols[0] ?? ''),
    expectedValue: initial?.expectedValue ?? '',
    configValue: initial?.type === 'regex' ? (initial.config.pattern as string ?? '') : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buildConfig = () => (form.type === 'regex' ? { pattern: form.configValue } : {});

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name required';
    if (!form.column || !effectiveCols.includes(form.column)) e.column = 'Select a field that exists in the uploaded data';
    if (form.type === 'equals_field' && !effectiveCols.includes(form.targetColumn)) e.targetColumn = 'Select a valid target field';
    if (form.type === 'equals_value' && !form.expectedValue.trim()) e.expectedValue = 'Expected value required';
    if (form.type === 'regex' && !form.configValue.trim()) e.configValue = 'Pattern required';
    setErrors(e);
    if (Object.keys(e).length) return;

    const config = buildConfig();
    if (initial) {
      dispatch({
        type: 'UPDATE_RULE',
        payload: {
          ...initial, ...form, config,
          targetColumn: form.type === 'equals_field' ? form.targetColumn : undefined,
          expectedValue: form.type === 'equals_value' ? form.expectedValue : undefined,
        } as Rule,
      });
      addAudit('RULE_UPDATED', 'Rule', initial.id, form.name, `Rule "${form.name}" updated`);
      toast('Rule updated', 'success');
    } else {
      const id = genId();
      dispatch({
        type: 'ADD_RULE',
        payload: {
          id, batchId, name: form.name, description: form.description, column: form.column,
          type: form.type, severity: form.severity, config, enabled: true, createdAt: new Date().toISOString(),
          entity, isCore: false, ruleId: id,
          targetColumn: form.type === 'equals_field' ? form.targetColumn : undefined,
          expectedValue: form.type === 'equals_value' ? form.expectedValue : undefined,
        },
      });
      addAudit('RULE_CREATED', 'Rule', id, form.name, `Rule "${form.name}" added`);
      toast('Rule created', 'success');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Rule' : 'Create Rule'}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave}>{initial ? 'Save' : 'Create Rule'}</Button></>}>
      <div className="space-y-4">
        <Input label="Rule Name" placeholder="e.g. Address Required" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Input label="Description" placeholder="What does this rule check?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Entity</label>
            <input value={entity} disabled className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500" />
          </div>
          <Select label="Rule Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as RuleType }))}>
            {CREATABLE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Field</label>
          <select value={form.column} onChange={e => setForm(f => ({ ...f, column: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {effectiveCols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {errors.column && <p className="text-xs text-red-500 mt-1">{errors.column}</p>}
          <p className="text-xs text-slate-400 mt-1">Fields are pulled from the actual uploaded source columns.</p>
        </div>

        {form.type === 'equals_field' && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Target Field (must equal Field above)</label>
            <select value={form.targetColumn} onChange={e => setForm(f => ({ ...f, targetColumn: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {effectiveCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.targetColumn && <p className="text-xs text-red-500 mt-1">{errors.targetColumn}</p>}
          </div>
        )}

        {form.type === 'equals_value' && (
          <Input label="Expected Value" placeholder="e.g. Y" value={form.expectedValue}
            onChange={e => setForm(f => ({ ...f, expectedValue: e.target.value }))} error={errors.expectedValue} />
        )}

        {form.type === 'regex' && (
          <Input label="Pattern (Operator/Condition)" placeholder="^[^@]+@[^@]+\.[^@]+$" value={form.configValue}
            onChange={e => setForm(f => ({ ...f, configValue: e.target.value }))} error={errors.configValue}
            hint="Regular expression the field's value must match" />
        )}

        <Select label="Severity" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as RuleSeverity }))}>
          <option value="error">Error – blocks reconciliation</option>
          <option value="warning">Warning – flags discrepancies</option>
          <option value="info">Info – informational</option>
        </Select>
      </div>
    </Modal>
  );
}

// ── Quality Summary tab ───────────────────────────────────────────────────────
function TabQualitySummary({ rules, entity }: { rules: Rule[]; entity: BusinessEntity }) {
  const enabled = rules.filter(r => r.enabled);
  const errs = enabled.filter(r => r.severity === 'error').length;
  const warns = enabled.filter(r => r.severity === 'warning').length;
  const coreCount = rules.filter(r => r.isCore).length;
  const dynamicCount = rules.filter(r => !r.isCore).length;
  const score = rules.length ? Math.round(100 - (errs * 6 + warns * 2)) : 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Rules"    value={rules.length}   color="bg-slate-50 text-slate-700" />
        <StatTile label="Core Rules"     value={coreCount}      sub={entity} color="bg-indigo-50 text-indigo-700" />
        <StatTile label="Custom Rules"   value={dynamicCount}   color="bg-violet-50 text-violet-700" />
        <StatTile label="Quality Score"  value={`${Math.max(0, score)}%`} color={score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
      </div>

      {rules.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">No rules defined yet</p>
            <p>Switch to the Validation Rules tab — core rules for {entity} load automatically, and you can add custom ones.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Rules by Field</p>
          <div className="space-y-2">
            {Array.from(new Set(rules.map(r => r.column || '(record-level)'))).map(col => {
              const colRules = rules.filter(r => (r.column || '(record-level)') === col);
              return (
                <div key={col} className="flex items-center gap-3">
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded w-36 truncate">{col}</code>
                  <div className="flex gap-1.5 flex-wrap">
                    {colRules.map(r => (
                      <Badge key={r.id} variant={r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'info'}>
                        {r.isCore && <Lock size={9} className="mr-1 inline" />}{r.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Validation Rules tab ──────────────────────────────────────────────────────
function TabValidationRules({ rules, batchId, entity, cols, onAdd, catalogStatus, catalogSource, onRetryCatalog }: {
  rules: Rule[]; batchId: string; entity: BusinessEntity; cols: string[]; onAdd: () => void;
  catalogStatus: CatalogStatus; catalogSource: 'backend' | 'local' | null; onRetryCatalog: () => void;
}) {
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

  const coreRules = rules.filter(r => r.isCore).sort((a, b) => (a.ruleId ?? '').localeCompare(b.ruleId ?? ''));
  const dynamicRules = rules.filter(r => !r.isCore);

  const fieldExists = (rule: Rule) => {
    if (!cols.length) return true; // no real columns detected yet — don't flag
    if (rule.column && !cols.includes(rule.column)) return false;
    if (rule.type === 'equals_field' && rule.targetColumn && !cols.includes(rule.targetColumn)) return false;
    return true;
  };

  const RuleRow = ({ rule, i }: { rule: Rule; i: number }) => (
    <motion.div key={rule.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
      className={cn('bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3', !rule.enabled && 'opacity-50')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {rule.isCore && <code className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-semibold">{rule.ruleId}</code>}
          <span className="text-sm font-medium text-slate-800">{rule.name}</span>
          <Badge variant={rule.severity === 'error' ? 'error' : rule.severity === 'warning' ? 'warning' : 'info'}>{rule.severity}</Badge>
          <Badge variant="outline">{TYPE_LABELS[rule.type]}</Badge>
          {rule.column && <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{rule.column}</code>}
          {rule.type === 'equals_field' && rule.targetColumn && (
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">= {rule.targetColumn}</code>
          )}
          {!rule.enabled && <Badge variant="outline">Disabled</Badge>}
          {!fieldExists(rule) && (
            <Badge variant="error"><AlertTriangle size={10} className="mr-1" />Field not found in uploaded data</Badge>
          )}
        </div>
        {rule.description && <p className="text-xs text-slate-400 mt-1">{rule.description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => toggleRule(rule)} className="p-1.5 rounded-md hover:bg-slate-100">
          {rule.enabled ? <ToggleRight size={18} className="text-indigo-500" /> : <ToggleLeft size={18} className="text-slate-400" />}
        </button>
        {!rule.isCore && (
          <>
            <button onClick={() => setEditRule(rule)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil size={14} /></button>
            <button onClick={() => setDeleteRule(rule)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} size="sm" onClick={onAdd}>Create Rule</Button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Core Rules — {entity}</p>
          {catalogSource === 'local' && (
            <Badge variant="warning">Bundled catalog — backend unreachable</Badge>
          )}
        </div>
        {catalogStatus === 'loading' && coreRules.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw size={12} className="animate-spin" /> Loading core rule catalog…
          </div>
        ) : catalogStatus === 'error' && coreRules.length === 0 ? (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-700 flex-1">
              Couldn&apos;t load the core rule catalog for {entity} from the backend, and no bundled fallback is defined for this entity yet.
            </p>
            <Button size="sm" variant="outline" icon={<RefreshCw size={12} />} onClick={onRetryCatalog}>Retry</Button>
          </div>
        ) : coreRules.length === 0 ? (
          <p className="text-xs text-slate-400">No core rules are defined for {entity} yet.</p>
        ) : (
          <div className="space-y-2">{coreRules.map((r, i) => <RuleRow key={r.id} rule={r} i={i} />)}</div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Custom Rules</p>
        {dynamicRules.length === 0 ? (
          <EmptyCard icon={<ShieldCheck size={22} className="text-slate-400" />}
            title="No custom rules yet" message="Create additional rules on top of the core catalog without touching source code."
            action={<Button icon={<Plus size={14} />} size="sm" variant="outline" onClick={onAdd}>Create Rule</Button>} />
        ) : (
          <div className="space-y-2">{dynamicRules.map((r, i) => <RuleRow key={r.id} rule={r} i={i} />)}</div>
        )}
      </div>

      {editRule && <RuleModal open onClose={() => setEditRule(undefined)} batchId={batchId} initial={editRule} entity={entity} cols={cols} />}
      {deleteRule && <ConfirmDialog open onClose={() => setDeleteRule(undefined)} onConfirm={() => handleDelete(deleteRule)} title="Delete Rule" message={`Delete rule "${deleteRule.name}"?`} confirmLabel="Delete" />}
    </div>
  );
}

// ── Rule Results tab ──────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === 'PASS') return <Badge variant="success"><CheckCircle2 size={10} className="mr-1" />Pass</Badge>;
  if (status === 'FAIL') return <Badge variant="error"><XCircle size={10} className="mr-1" />Fail</Badge>;
  if (status === 'NOT_APPLICABLE') return <Badge variant="outline"><MinusCircle size={10} className="mr-1" />N/A</Badge>;
  return <Badge variant="warning"><AlertTriangle size={10} className="mr-1" />Error</Badge>;
}

function TabRuleResults({ rules, batch, entity, primaryKeyColumn }: {
  rules: Rule[]; batch: ReturnType<typeof useStore>['state']['batches'][0] | null;
  entity: BusinessEntity; primaryKeyColumn: string;
}) {
  const [report, setReport] = useState<BusinessValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverBacked = !!batch?.sourceFile?.serverBacked;
  const fileName = batch?.sourceFile?.name;
  const enabledRules = rules.filter(r => r.enabled);

  const runValidation = async () => {
    if (!serverBacked || !fileName) return;
    setLoading(true);
    setError(null);
    try {
      const core_rule_ids = enabledRules.filter(r => r.isCore && r.ruleId).map(r => r.ruleId as string);
      const dynamic_rules = enabledRules.filter(r => !r.isCore).map(r => ({
        rule_id: r.id,
        rule_name: r.name,
        entity,
        field: r.column || null,
        target_field: r.type === 'equals_field' ? (r.targetColumn || null) : null,
        rule_type: r.type,
        operator: r.type === 'regex' ? ((r.config?.pattern as string) ?? null) : null,
        expected_value: r.type === 'equals_value' ? (r.expectedValue ?? null) : null,
        severity: r.severity,
        enabled: true,
        is_core: false,
        description: r.description || null,
      }));

      const res = await fetch('/api/v1/business-rules/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: fileName,
          entity,
          primary_key_column: primaryKeyColumn || null,
          core_rule_ids,
          dynamic_rules,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Validation request failed (${res.status})`);
      }
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (serverBacked) runValidation(); }, [serverBacked, fileName, entity, primaryKeyColumn, rules.length]);

  if (rules.length === 0) return (
    <EmptyCard icon={<ListChecks size={22} className="text-slate-400" />}
      title="No rules to evaluate" message="Add validation rules first, then run validation to see results." />
  );

  if (!serverBacked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Info size={14} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">
            No server-verified source file for this batch, so real business-rule validation can&apos;t run yet.
            Upload a real file in Discovery (with the backend reachable) to see actual PASS/FAIL results — this list won&apos;t show fabricated numbers.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Rule', 'Field', 'Severity', 'Status'].map(h => <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map(r => (
                <tr key={r.id}>
                  <td className="py-2.5 px-4 font-medium text-slate-800">{r.ruleId ? `${r.ruleId} — ` : ''}{r.name}</td>
                  <td className="py-2.5 px-4"><code className="bg-slate-100 px-1.5 py-0.5 rounded">{r.column || '—'}</code></td>
                  <td className="py-2.5 px-4"><Badge variant={r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'info'}>{r.severity}</Badge></td>
                  <td className="py-2.5 px-4 text-slate-400">Not run</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {report ? `${report.record_count.toLocaleString()} records evaluated for ${entity}` : 'Running validation…'}
        </p>
        <Button size="sm" variant="outline" icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />} onClick={runValidation} disabled={loading}>
          Re-run Validation
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Rules Evaluated" value={report.rules_evaluated} color="bg-slate-50 text-slate-700" />
            <StatTile label="Records" value={report.record_count.toLocaleString()} color="bg-slate-50 text-slate-700" />
            <StatTile label="Overall Status" value={report.overall_status} color={report.overall_status === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'} />
            <StatTile label="Primary Key" value={report.primary_key_column || 'Not set'} color="bg-indigo-50 text-indigo-700" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Rule', 'Severity', 'Pass', 'Fail', 'Status', 'Note'].map(h => <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rule_summaries.map((s, i) => (
                  <motion.tr key={s.rule_id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-800">{s.rule_id} — {s.rule_name}</td>
                    <td className="py-2.5 px-4"><Badge variant={s.severity === 'error' ? 'error' : s.severity === 'warning' ? 'warning' : 'info'}>{s.severity}</Badge></td>
                    <td className="py-2.5 px-4 text-emerald-600 font-semibold">{s.applicable ? s.pass_count.toLocaleString() : '—'}</td>
                    <td className="py-2.5 px-4 text-red-600 font-semibold">{s.applicable ? s.fail_count.toLocaleString() : '—'}</td>
                    <td className="py-2.5 px-4">{statusBadge(s.status)}</td>
                    <td className="py-2.5 px-4 text-slate-400">{s.message || ''}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.results.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-1">Record-Level Tags</p>
              <p className="text-xs text-slate-400 mb-3">
                {report.results_truncated ? `Showing first ${report.results.length} tagged records (failures first).` : `${report.results.length} tagged records.`}
              </p>
              <div className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5">
                {report.results.map((r, i) => (
                  <div key={i} className={cn('px-2 py-0.5 rounded', r.status === 'FAIL' ? 'bg-red-50 text-red-700' : 'bg-emerald-50/50 text-emerald-700')}>
                    {r.entity} {r.record_key} → {r.rule_id} → {r.status} → {r.tag}
                    {r.failure_reason ? ` (${r.failure_reason})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepRules({ batch, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState('summary');
  const [showCreate, setShowCreate] = useState(false);

  const activeBatchId = batch?.id ?? '__standalone__';
  const rules = state.rules.filter(r => r.batchId === activeBatchId);
  const batchObj = batch ? state.batches.find(b => b.id === batch.id) ?? null : null;

  const entity: BusinessEntity = wizardCtx.entity ?? 'Customer';
  const primaryKeyColumn = wizardCtx.sourceKey || '';
  const detectedCols = batchObj?.sourceFile?.columns.map(c => c.name) ?? [];

  // Keep a live snapshot of rules so the catalog loader below can check
  // "already registered?" without needing `state.rules` in its own
  // dependency array (which would otherwise re-trigger on every unrelated
  // rule edit).
  const rulesRef = useRef(state.rules);
  useEffect(() => { rulesRef.current = state.rules; }, [state.rules]);

  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading');
  const [catalogSource, setCatalogSource] = useState<'backend' | 'local' | null>(null);

  const registerCoreRules = useCallback((defs: BusinessRuleDef[]) => {
    const existingIds = new Set(
      rulesRef.current.filter(r => r.batchId === activeBatchId && r.isCore).map(r => r.ruleId)
    );
    defs.forEach(cr => {
      if (existingIds.has(cr.rule_id)) return;
      dispatch({
        type: 'ADD_RULE',
        payload: {
          id: cr.rule_id, batchId: activeBatchId, name: cr.rule_name, description: cr.description || '',
          column: cr.field || '', type: cr.rule_type as RuleType, severity: cr.severity,
          config: cr.rule_type === 'regex' && cr.operator ? { pattern: cr.operator } : {},
          enabled: true, createdAt: new Date().toISOString(),
          entity: cr.entity, isCore: true, ruleId: cr.rule_id,
          targetColumn: cr.target_field || undefined,
          expectedValue: cr.expected_value || undefined,
        },
      });
    });
  }, [activeBatchId, dispatch]);

  // Fetch the core rule catalog for the current entity and auto-register any
  // core rules not yet present for this batch, so CUS001-CUS010 are always
  // available "where applicable" without the user creating them manually.
  // On failure this retries (via the Retry button) instead of failing
  // silently, and falls back to a bundled catalog mirror so the section
  // never gets stuck showing nothing.
  const loadCoreCatalog = useCallback(() => {
    setCatalogStatus('loading');
    fetch(`/api/v1/business-rules/core?entity=${encodeURIComponent(entity)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data: { rules: BusinessRuleDef[] }) => {
        registerCoreRules(data.rules);
        setCatalogSource('backend');
        setCatalogStatus('loaded');
      })
      .catch(() => {
        const fallback = LOCAL_CORE_CATALOG[entity] ?? [];
        if (fallback.length) {
          registerCoreRules(fallback);
          setCatalogSource('local');
          setCatalogStatus('loaded');
        } else {
          setCatalogSource(null);
          setCatalogStatus('error');
        }
      });
  }, [entity, registerCoreRules]);

  useEffect(() => { loadCoreCatalog(); }, [loadCoreCatalog]);

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Rules & Quality</h2>
        <p className="text-sm text-slate-500 mt-1">Define entity-aware validation rules and review data quality before reconciliation.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-3">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Entity</label>
          <select value={entity} onChange={e => onCtxChange({ entity: e.target.value })}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Primary / Business Key</label>
          {detectedCols.length > 0 ? (
            <select value={primaryKeyColumn} onChange={e => onCtxChange({ sourceKey: e.target.value })}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Not set</option>
              {detectedCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <span className="text-xs text-slate-400 italic">Set in Key Detection step</span>
          )}
        </div>
        {primaryKeyColumn && <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 ml-auto">Records identified by: {primaryKeyColumn}</code>}
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'summary' && <TabQualitySummary rules={rules} entity={entity} />}
          {activeTab === 'rules'   && <TabValidationRules rules={rules} batchId={activeBatchId} entity={entity} cols={detectedCols} onAdd={() => setShowCreate(true)} catalogStatus={catalogStatus} catalogSource={catalogSource} onRetryCatalog={loadCoreCatalog} />}
          {activeTab === 'results' && <TabRuleResults rules={rules} batch={batchObj} entity={entity} primaryKeyColumn={primaryKeyColumn} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={() => onAdvance()} nextLabel="Continue to Exclusions" />

      <RuleModal open={showCreate} onClose={() => setShowCreate(false)} batchId={activeBatchId} entity={entity} cols={detectedCols} />
    </div>
  );
}
