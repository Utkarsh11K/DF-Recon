// ── Core domain types for DF-Recon ──────────────────────────────────────────

export type ProjectStatus = 'active' | 'completed' | 'paused' | 'archived';
export type BatchStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type WizardStep =
  | 'discovery'
  | 'key-detection'
  | 'rules'
  | 'exclusions'
  | 'mapping'
  | 'pre-load'
  | 'reconciliation'
  | 'export';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  batchCount: number;
  tags: string[];
}

export interface Batch {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  sourceFile?: UploadedFile;
  targetFile?: UploadedFile;
  wizardStep: WizardStep;
  completedSteps: WizardStep[];
  recordCount?: number;
  matchRate?: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  columns: ColumnProfile[];
  rowCount: number;
  sampleData: Record<string, unknown>[];
  // True only when this file was actually persisted server-side via the
  // Discovery backend call (vs. a client-only simulated profile fallback).
  // Business-rule validation needs the real file, so this flag gates it.
  serverBacked?: boolean;
}

export interface ColumnProfile {
  name: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'unknown';
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
  isPrimaryKeyCandidate: boolean;
}

export interface KeyDetection {
  batchId: string;
  sourceKey: string;
  targetKey: string;
  confidence: number;
  matchedRecords: number;
  unmatchedSource: number;
  unmatchedTarget: number;
}

export type RuleType = 'format' | 'range' | 'regex' | 'lookup' | 'custom' | 'required' | 'equals_value' | 'equals_field' | 'unique_field';
export type RuleSeverity = 'error' | 'warning' | 'info';
export type BusinessEntity = 'Customer' | 'Supplier' | 'Employee' | string;

export interface Rule {
  id: string;
  batchId: string;
  name: string;
  description: string;
  column: string;
  type: RuleType;
  severity: RuleSeverity;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  // Business validation rules extension (Conversion Wizard → Quality).
  // Optional/additive so existing Rule records (demo data, legacy rule
  // types) keep working unchanged.
  entity?: BusinessEntity;
  ruleId?: string;          // e.g. "CUS001" for core rules; matches dynamic rule's own id otherwise
  isCore?: boolean;
  targetColumn?: string;    // used when type === 'equals_field'
  expectedValue?: string;   // used when type === 'equals_value'
}

// ── Business rule validation results (Quality section) ─────────────────────

export interface BusinessRuleDef {
  rule_id: string;
  rule_name: string;
  entity: string;
  field: string | null;
  target_field: string | null;
  rule_type: string;
  operator: string | null;
  expected_value: string | null;
  severity: RuleSeverity;
  enabled: boolean;
  is_core: boolean;
  description: string | null;
}

export interface RuleResultRow {
  entity: string;
  record_key: string;
  rule_id: string;
  rule_name: string;
  status: 'PASS' | 'FAIL';
  severity: RuleSeverity;
  failure_reason: string | null;
  tag: string;
}

export interface RuleSummaryRow {
  rule_id: string;
  rule_name: string;
  entity: string;
  severity: RuleSeverity;
  rule_type: string;
  status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'ERROR';
  pass_count: number;
  fail_count: number;
  total_evaluated: number;
  applicable: boolean;
  message: string | null;
}

export interface BusinessValidationReport {
  entity: string;
  primary_key_column: string | null;
  record_count: number;
  rules_evaluated: number;
  overall_status: 'PASS' | 'FAIL';
  rule_summaries: RuleSummaryRow[];
  results: RuleResultRow[];
  results_truncated: boolean;
}

export interface Exclusion {
  id: string;
  batchId: string;
  name: string;
  description: string;
  column: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'isNull' | 'greaterThan' | 'lessThan';
  value: string;
  enabled: boolean;
  createdAt: string;
}

export type TransformType = 'direct' | 'rename' | 'formula' | 'lookup' | 'concat' | 'split' | 'trim' | 'upper' | 'lower' | 'dateFormat';

export interface Mapping {
  id: string;
  batchId: string;
  sourceColumn: string;
  targetColumn: string;
  transformType: TransformType;
  transformConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface PreLoadRow {
  rowIndex: number;
  data: Record<string, unknown>;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
}

export interface ReconciliationResult {
  batchId: string;
  runAt: string;
  totalSource: number;
  totalTarget: number;
  matched: number;
  unmatchedSource: number;
  unmatchedTarget: number;
  matchRate: number;
  discrepancies: Discrepancy[];
  summary: ColumnSummary[];
}

export interface Discrepancy {
  id: string;
  key: string;
  field: string;
  sourceValue: string;
  targetValue: string;
  type: 'value_mismatch' | 'missing_source' | 'missing_target';
}

export interface ColumnSummary {
  column: string;
  matched: number;
  mismatched: number;
  missingSource: number;
  missingTarget: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  entity: string;
  entityId: string;
  entityName: string;
  user: string;
  details: string;
  status: 'success' | 'error' | 'info';
}

export interface AppState {
  projects: Project[];
  batches: Batch[];
  files: UploadedFile[];
  rules: Rule[];
  exclusions: Exclusion[];
  mappings: Mapping[];
  reconciliations: ReconciliationResult[];
  auditEntries: AuditEntry[];
}
