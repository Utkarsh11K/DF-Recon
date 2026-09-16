/**
 * API client library for connecting DF-Recon Next.js Frontend to FastAPI Backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface FBDIValidationStep {
  step_number: number;
  step_name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: Record<string, unknown>;
}

export interface FBDIValidationResponse {
  status: string;
  entity: string;
  file_name: string;
  headers_valid: boolean;
  mandatory_fields_present: boolean;
  record_count: number;
  columns?: string[];
  primary_key?: string | null;
  duplicates_count?: number;
  null_counts?: Record<string, number>;
  steps?: FBDIValidationStep[];
  errors: string[];
  warnings: string[];
}



export interface ExtractPrepareResponse {
  file_name: string;
  entity: string;
  project_name: string;
  wave_name: string;
  opco_name: string;
  module_name: string;
  execution_timestamp: string;
  expected_execution_timestamp: string;
  execution_match: boolean;
  status: string;
  record_count: number;
  message: string;
}

export interface ReconciliationReportResponse {
  recon_run_id: string;
  batch_id: string;
  runAt: string;
  execution_timestamp: string;
  execution_match: boolean;
  status: string;
  totalSource: number;
  totalTarget: number;
  matched: number;
  unmatchedSource: number;
  unmatchedTarget: number;
  mismatched: number;
  duplicates: number;
  notLoaded: number;
  validationFailed: number;
  matchRate: number;
  qualityGrade: string;
  discrepancies: Array<{
    id: string;
    key: string;
    field: string;
    sourceValue: string;
    targetValue: string;
    type: string;
  }>;
  summary: Array<{
    column: string;
    matched: number;
    mismatched: number;
    missingSource: number;
    missingTarget: number;
  }>;
  message?: string;
}

export async function validateFBDI(file?: File, filePath?: string, entity: string = 'Supplier'): Promise<FBDIValidationResponse> {
  const formData = new FormData();
  if (file) formData.append('file', file);
  if (filePath) formData.append('file_path', filePath);
  formData.append('entity', entity);

  const res = await fetch(`${API_BASE_URL}/api/v1/fusion/fbdi/validate`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`FBDI Validation API failed: ${res.statusText}`);
  return res.json();
}



export async function prepareExtract(batchId: string, targetFilePath?: string, expectedTimestamp?: string): Promise<ExtractPrepareResponse> {
  const formData = new FormData();
  formData.append('batch_id', batchId);
  if (targetFilePath) formData.append('target_file_path', targetFilePath);
  if (expectedTimestamp) formData.append('expected_execution_timestamp', expectedTimestamp);

  const res = await fetch(`${API_BASE_URL}/api/v1/fusion/extract/prepare`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Extract Prepare API failed: ${res.statusText}`);
  return res.json();
}

export async function executeReconciliation(payload: {
  batch_id: string;
  source_file_path?: string;
  target_file_path?: string;
  expected_execution_timestamp?: string;
  fusion_execution_timestamp?: string;
  source_key?: string;
  target_key?: string;
}): Promise<ReconciliationReportResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/fusion/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Reconciliation Execution API failed: ${res.statusText}`);
  return res.json();
}

export async function getReconciliationResult(runId: string): Promise<ReconciliationReportResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/fusion/reconciliation/${runId}`);
  if (!res.ok) throw new Error(`Fetch Reconciliation Result failed: ${res.statusText}`);
  return res.json();
}

export async function exportReport(runId: string, format: string = 'json'): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/fusion/export-report/${runId}?format=${format}`);
  if (!res.ok) throw new Error(`Export Report failed: ${res.statusText}`);
  return res.json();
}

// ── File Storage in PostgreSQL ────────────────────────────────────────────────

export async function uploadFileToDb(
  file: File,
  fileId: string,
  projectId: string,
  batchId: string | undefined,
  fileType: string,
  storagePath: string,
): Promise<{ success: boolean; file_id: string; profile?: any }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('file_id', fileId);
  fd.append('project_id', projectId);
  if (batchId) fd.append('batch_id', batchId);
  fd.append('file_role', fileType);
  fd.append('storage_path', storagePath);
  const res = await fetch(`${API_BASE_URL}/api/v1/files/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`File upload to DB failed: ${res.statusText}`);
  return res.json();
}

export async function downloadFileFromDb(fileId: string): Promise<File | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/files/by-id/${fileId}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const nameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = nameMatch?.[1] ?? fileId;
    return new File([blob], fileName, { type: blob.type });
  } catch {
    return null;
  }
}

export async function downloadFileByPath(storagePath: string): Promise<File | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/files/by-path/${storagePath}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const nameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = nameMatch?.[1] ?? storagePath.split('/').pop() ?? 'file';
    return new File([blob], fileName, { type: blob.type });
  } catch {
    return null;
  }
}

export async function listFilesInDb(projectId?: string, batchId?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  if (batchId) params.set('batch_id', batchId);
  const res = await fetch(`${API_BASE_URL}/api/v1/files?${params}`);
  if (!res.ok) throw new Error(`List files failed: ${res.statusText}`);
  return res.json();
}

// ── Key Detection API ─────────────────────────────────────────────────────────

export interface KeyCandidateResult {
  column_name: string;
  uniqueness_pct: number;
  null_pct: number;
  recommendation: 'Strong' | 'Possible' | 'Weak';
  reason: string;
  fbdi_overlap_pct: number;
  fbdi_matched_col: string | null;
  fbdi_matched_role: string | null;
  sample_values: string[];
  is_composite: boolean;
}

export interface KeyDetectionResponse {
  status: 'success' | 'error';
  entity_type: string | null;
  entity_label: string | null;
  suggested_source_key: string | null;
  suggested_fbdi_key: string | null;
  candidates: KeyCandidateResult[];
  fbdi_keys_found: { role: string; col_name: string; unique_count: number }[];
  analysis_summary: {
    source_file: string;
    fbdi_file: string;
    source_rows: number;
    source_columns: number;
    fbdi_rows: number;
    fbdi_columns: number;
    entity_type: string | null;
    entity_label: string | null;
    fbdi_keys_detected: number;
    candidates_returned: number;
    suggested_source_key: string | null;
    suggested_fbdi_key: string | null;
  };
  errors: string[];
}

export async function detectKeys(
  sourceFile: File,
  fbdiFile: File,
): Promise<KeyDetectionResponse> {
  const fd = new FormData();
  fd.append('source_file', sourceFile);
  fd.append('fbdi_file', fbdiFile);
  const res = await fetch(`${API_BASE_URL}/api/v1/key-detect`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Key Detection API failed: ${res.statusText}`);
  return res.json();
}

