import type { ColumnProfile, ProjectFile, UploadedFile } from './types';
import { uploadFileToDb } from './api';

const FILE_DB = 'df-recon-files';
const FILE_STORE = 'blobs';

export const ROLE_PATTERNS: { pattern: RegExp; role: UploadedFile['role'] }[] = [
  { pattern: /^(01[_-])?source/i, role: 'source'   },
  { pattern: /^(02[_-])?(tranformed|enriched)/i, role: 'enriched' },
  { pattern: /^(03[_-])?fbdi/i, role: 'fbdi'     },
  { pattern: /^(04[_-])?(fusion|target)/i, role: 'target'   },
];

/**
 * Given a relative path like:
 *   LightSpeed/Wave 1D/Airetech/03_Order Management/04_Customers/01-Source/20260902143000/file.xlsx
 * Returns the role indicator folder index (index of "01-Source").
 */
export function getRoleIndicatorIndex(parts: string[]): number {
  return parts.findIndex(p => ROLE_PATTERNS.some(r => r.pattern.test(p)));
}

/**
 * Parses a relative file path and extracts batchName and moduleName.
 * e.g. LightSpeed/Wave1/Airetech/03_Order Management/04_Customers/01-Source/file.xlsx
 * → { batchName: "04_Customers", moduleName: "03_Order Management" }
 */
export function parsePathHierarchy(relativePath: string): { batchName?: string; moduleName?: string } | null {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const idx = getRoleIndicatorIndex(parts);
  if (idx <= 0) return null;
  const batchName = parts[idx - 1];
  const moduleName = idx > 1 ? parts[idx - 2] : undefined;
  return { batchName, moduleName };
}

/**
 * Returns the batch key for a file path.
 * Batch = folder immediately before the role indicator  → "04_Customers"
 * Module = folder before that                           → "03_Order Management"
 * Key = "03_Order Management - 04_Customers"
 */
export function getBatchKey(relativePath: string): string | undefined {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const idx = getRoleIndicatorIndex(parts);
  if (idx <= 0) return undefined;
  const batchName = parts[idx - 1];
  const moduleName = idx > 1 ? parts[idx - 2] : undefined;
  return moduleName ? `${moduleName}_${batchName}` : batchName;
}

/**
 * Returns the role for a file based on which numbered folder it lives in.
 */
export function getFileRole(relativePath: string): UploadedFile['role'] {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const idx = getRoleIndicatorIndex(parts);
  if (idx < 0) return 'other';
  return ROLE_PATTERNS.find(r => r.pattern.test(parts[idx]))?.role ?? 'other';
}

/**
 * Builds the canonical storage path for a file inside a batch.
 * Format: {projectId}/{module} - {batch}/{roleFolder}/{filename}
 * e.g.  abc123/03_Order Management - 04_Customers/01-Source/customers.xlsx
 *
 * Used both when storing from folder upload AND when storing a manual upload,
 * so the path is always consistent and findable.
 */
export function buildStoragePath(
  projectId: string,
  batchName: string,
  role: UploadedFile['role'],
  fileName: string,
): string {
  const roleFolder =
    role === 'source'   ? '01-Source'     :
    role === 'enriched' ? '02-Tranformed' :
    role === 'fbdi'     ? '03-FBDI'       :
    role === 'target'   ? '04-Fusion'     : 'other';
  return `${projectId}/${batchName}/${roleFolder}/${fileName}`;
}

// ── CSV profiler ──────────────────────────────────────────────────────────────

async function profileCsvFile(file: File): Promise<{
  columns: ColumnProfile[];
  rowCount: number;
  sampleData: Record<string, unknown>[];
}> {
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { columns: [], rowCount: 0, sampleData: [] };

    const firstLine = lines[0];
    const delims = [',', '\t', '|', ';'];
    let delim = ',';
    let maxCount = -1;
    for (const d of delims) {
      const c = firstLine.split(d).length;
      if (c > maxCount) { maxCount = c; delim = d; }
    }

    const rawHeaders = firstLine.split(delim).map(h => h.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const headers = rawHeaders.map(h => h.replace(/[^\x20-\x7E]/g, '').trim()).filter(h => h.length > 0);
    const validHeaders = headers.length > 0 ? headers : ['column_1', 'column_2', 'column_3'];

    const sampleData: Record<string, unknown>[] = [];
    for (const line of lines.slice(1)) {
      const values = line.split(delim).map(v => v.trim().replace(/^["']|["']$/g, ''));
      if (!values.some(v => v)) continue;
      const row: Record<string, unknown> = {};
      validHeaders.forEach((h, i) => { row[h] = values[i] ?? ''; });
      sampleData.push(row);
    }

    const columns: ColumnProfile[] = validHeaders.map((h, i) => {
      const vals = sampleData.map(r => String(r[h] ?? '')).filter(v => v !== '');
      return {
        name: h,
        dataType: 'string' as const,
        nullCount: Math.max(0, sampleData.length - vals.length),
        uniqueCount: new Set(vals).size,
        sampleValues: vals.slice(0, 10),
        isPrimaryKeyCandidate: i === 0 || /id|no|code/i.test(h),
      };
    });

    return { columns, rowCount: sampleData.length, sampleData };
  } catch {
    return { columns: [], rowCount: 0, sampleData: [] };
  }
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistBrowserFile(storagePath: string, file: File): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put(file, storagePath);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function retrieveBrowserFile(storagePath: string): Promise<File | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    return new Promise<File | null>((resolve) => {
      const tx = db.transaction(FILE_STORE, 'readonly');
      const req = tx.objectStore(FILE_STORE).get(storagePath);
      req.onsuccess = () => resolve((req.result as File) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates an UploadedFile record, profiles the file (CSV inline, Excel via backend),
 * persists the blob to IndexedDB, and returns the record + manifest entry.
 *
 * storagePath is always built from buildStoragePath so it is canonical and
 * consistent whether the file came from a folder upload or a manual upload.
 */
export async function createUploadedFileRecord(
  file: File,
  projectId: string,
  batchId: string | undefined,
  batchName: string,
  role: UploadedFile['role'] = 'other',
): Promise<{ record: UploadedFile; manifest: ProjectFile }> {
  const id = Math.random().toString(36).slice(2, 10);
  const uploadedAt = new Date().toISOString();
  const storagePath = buildStoragePath(projectId, batchName, role, file.name);

  const isCsv = file.type === 'text/csv' || /\.csv$/i.test(file.name);

  let columns: ColumnProfile[] = [];
  let rowCount = 0;
  let sampleData: Record<string, unknown>[] = [];

  if (isCsv) {
    ({ columns, rowCount, sampleData } = await profileCsvFile(file));
  }
  // Excel: columns stay empty; rehydrateUploadedFile will call backend when wizard opens

  const record: UploadedFile = {
    id,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt,
    columns,
    rowCount,
    sampleData,
    relativePath: storagePath, // store canonical path as relativePath too
    storagePath,
    projectId,
    batchId,
    role,
  };

  await persistBrowserFile(storagePath, file);

  try {
    const res = await uploadFileToDb(file, id, projectId, batchId, role, storagePath);
    if (res.profile && !isCsv) {
      // For Excel files, the backend profiles them upon upload. Use the returned profile.
      if (res.profile.sheets && res.profile.sheets.length > 0) {
        const first = res.profile.sheets[0];
        record.rowCount = first.record_count ?? 0;
        // Map backend columns back to frontend ColumnProfile if needed, but for now we just 
        // trust rehydrateUploadedFile to do it fully later if it's not perfect.
      }
    }
  } catch (err) {
    console.error("Backend DB sync failed for file:", file.name, err);
  }

  return {
    record,
    manifest: {
      id,
      projectId,
      name: file.name,
      relativePath: storagePath,
      storagePath,
      size: file.size,
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
      uploadedAt,
    },
  };
}

/**
 * Loads the stored File blob from IndexedDB and re-profiles it.
 * - CSV: parsed directly in browser
 * - Excel: sent to backend /api/v1/discovery/upload-and-detect
 * Returns the enriched UploadedFile with real columns/rowCount/sheets/sampleData.
 */
export async function rehydrateUploadedFile(record: UploadedFile): Promise<UploadedFile> {
  if (!record.storagePath) return record;

  // Already fully profiled — return as-is
  if (record.columns.length > 0 && record.rowCount > 0 && record.sampleData.length > 0) {
    return record;
  }

  const file = await retrieveBrowserFile(record.storagePath);
  if (!file) return record;

  // CSV — profile locally
  if (/\.csv$/i.test(file.name)) {
    const { columns, rowCount, sampleData } = await profileCsvFile(file);
    return { ...record, columns, rowCount, sampleData };
  }

  // Excel — call backend
  try {
    const fd = new FormData();
    fd.append('batch_id', record.batchId ?? 'Batch_001');
    fd.append(record.role === 'target' ? 'target_file' : 'source_file', file);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${apiBase}/api/v1/discovery/upload-and-detect`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('backend error');
    const data = await res.json();
    const info = record.role === 'target' ? data.target_file_info : data.source_file_info;
    if (!info?.sheets?.length) throw new Error('no sheets');

    const sheets = info.sheets.map((s: any) => {
      const sSamples: Record<string, unknown>[] = s.sample_data ?? [];
      const sCols: ColumnProfile[] = (s.columns ?? []).map((c: string, idx: number) => {
        const vals = sSamples.map((r: any) => String(r[c] ?? '')).filter(Boolean);
        return {
          name: c,
          dataType: 'string' as const,
          nullCount: Math.max(0, sSamples.length - vals.length),
          uniqueCount: new Set(vals).size,
          sampleValues: vals.slice(0, 10),
          isPrimaryKeyCandidate: idx === 0 || /id|no|code/i.test(c),
        };
      });
      return {
        name: s.sheet_name ?? 'Sheet1',
        rowCount: s.record_count ?? sSamples.length,
        columns: sCols,
        sampleData: sSamples,
      };
    });

    const first = sheets[0];
    return {
      ...record,
      columns: first.columns,
      rowCount: first.rowCount,
      sampleData: first.sampleData,
      sheets,
    };
  } catch {
    return record;
  }
}
