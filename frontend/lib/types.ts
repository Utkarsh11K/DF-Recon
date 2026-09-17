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
  folderPath?: string;
  repositoryPath?: string;
  repositoryUrl?: string;
  repositoryBranch?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  batchCount: number;
  tags: string[];
  fileManifest?: ProjectFile[];
}

export interface Batch {
  id: string;
  projectId: string;
  name: string;
  description: string;
  folderPath?: string;
  path?: string;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  sourceFile?: UploadedFile;
  targetFile?: UploadedFile;
  fbdiFile?: UploadedFile;
  enrichedFile?: UploadedFile;
  wizardStep: WizardStep;
  completedSteps: WizardStep[];
  sourceKey?: string;
  targetKey?: string;
  fbdiKey?: string;
  keyConfidence?: number;
  recordCount?: number;
  matchRate?: number;
}

export interface SheetProfile {
  name: string;
  rowCount: number;
  columns: ColumnProfile[];
  sampleData: Record<string, unknown>[];
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
  sheets?: SheetProfile[];
  relativePath?: string;
  storagePath?: string;
  projectId?: string;
  batchId?: string;
  role?: 'source' | 'target' | 'enriched' | 'fbdi' | 'other';
  selectedSheetIndex?: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  relativePath: string;
  storagePath: string;
  size: number;
  type: string;
  lastModified: number;
  uploadedAt: string;
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

export type RuleType = 'format' | 'range' | 'regex' | 'lookup' | 'custom';
export type RuleSeverity = 'error' | 'warning' | 'info';

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

// ── Deepti Tiwari's Exception & Reconciliation Types ─────────────────────────

export type ExceptionStage = 'SOURCE' | 'TRANSFORMED' | 'FBDI' | 'FUSION_LOAD' | 'ATTRIBUTE';
export type ExceptionSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
export type ExceptionStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'SIGNED_OFF' | 'IGNORED';

export interface ReconExceptionItem {
  id: string;
  recon_run_id: string;
  key: string;
  entity: string;
  stage: ExceptionStage;
  type: string;
  severity: ExceptionSeverity;
  column_name?: string;
  source_value?: string;
  target_value?: string;
  status: ExceptionStatus;
  assigned_to?: string;
  notes?: string;
}

export interface ReconWaterfallMetrics {
  project: string;
  wave: string;
  opco: string;
  module: string;
  entity: string;
  source_count: number;
  transformed_count: number;
  fbdi_count: number;
  fusion_count: number;
  matched_count: number;
  overall_match_rate: number;
  quality_grade: string;
}

export interface FieldDifferenceItem {
  record_key: string;
  field_name: string;
  expected_value: string;
  oracle_value: string;
  status: 'MATCH' | 'MISMATCH';
}

export interface AttributeDiffReport {
  record_key: string;
  entity: string;
  total_attributes_checked: number;
  mismatched_attributes_count: number;
  differences: FieldDifferenceItem[];
}

export interface UserSession {
  user_id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  token: string;
  authenticated_at: string;
}

