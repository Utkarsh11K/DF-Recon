import type { ColumnProfile, ProjectFile, UploadedFile } from './types';
import { uploadFileToDb, downloadFileFromDb, downloadFileByPath } from './api';

const FILE_DB = 'df-recon-files';
const FILE_STORE = 'blobs';

export const ROLE_PATTERNS: { pattern: RegExp; role: UploadedFile['role'] }[] = [
  { pattern: /^(01[_-])?source/i, role: 'source'   },
  { pattern: /^(02[_-])?(tranformed|transformed|enriched)/i, role: 'enriched' },
  { pattern: /^(03[_-])?fbdi/i, role: 'fbdi'     },
  { pattern: /^(04[_-])?(fusion|target)/i, role: 'target'   },
  { pattern: /^(05[_-])?(recon|template|recon[_-]template)/i, role: 'other' },
];

/**
 * Given a relative path like:
 *   LightSpeed/Wave 1D/Airetech/03_Order Management/04_Customers/01-Source/20260902143000/file.xlsx
 * Returns the role indicator folder index (index of "01-Source").
 */
export function getRoleIndicatorIndex(parts: string[]): number {
  return parts.findIndex(p => ROLE_PATTERNS.some(r => r.pattern.test(p)));
}

export interface ParsedPathHierarchy {
  moduleName: string;
  entityName: string;
  batchName: string;
  relPath: string;
}

/**
 * Parses any relative path into module name, entity name, and batch name.
 * Handles role indicator subfolders (01-Source, 04-Fusion, 05-Recon_Template), direct nested folders,
 * and ignores standalone template/recon folders.
 */
export function parsePathHierarchy(relativePath: string): ParsedPathHierarchy | null {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(p => p.trim().length > 0);
  if (parts.length === 0) return null;

  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('.') || fileName.startsWith('~$') || fileName === 'Thumbs.db' || fileName === '.DS_Store') {
    return null;
  }

  const roleIdx = getRoleIndicatorIndex(parts);
  let entityName = '';
  let moduleName = '';
  let relPath = '';

  if (roleIdx >= 0) {
    if (roleIdx === 0) return null; // Role/template folder at root without entity folder
    entityName = roleIdx >= 1 ? parts[roleIdx - 1] : 'Default_Entity';
    moduleName = roleIdx >= 2 ? parts[roleIdx - 2] : 'Default_Module';
    relPath = parts.slice(0, roleIdx).join('/');
  } else {
    const dirParts = parts.slice(0, -1);
    const extStrippedName = fileName.replace(/\.[^/.]+$/, '');
    if (dirParts.length >= 2) {
      entityName = dirParts[dirParts.length - 1];
      moduleName = dirParts[dirParts.length - 2];
      relPath = dirParts.join('/');
    } else if (dirParts.length === 1) {
      moduleName = dirParts[0];
      entityName = extStrippedName;
      relPath = dirParts[0];
    } else {
      moduleName = 'Default_Module';
      entityName = extStrippedName;
      relPath = '';
    }
  }

  // Filter out template/recon folders from being treated as entity names
  const isTemplate = (name: string) => {
    const lower = name.toLowerCase();
    return lower.startsWith('05-') || lower.startsWith('05_') || lower.includes('recon_template') || lower.includes('recon-template') || lower === 'template';
  };

  if (isTemplate(entityName)) {
    return null;
  }

  const batchName = moduleName !== 'Default_Module' ? `${moduleName}_${entityName}` : entityName;
  return { moduleName, entityName, batchName, relPath };
}

/**
 * Returns the batch key for a file path.
 */
export function getBatchKey(relativePath: string): string | undefined {
  const parsed = parsePathHierarchy(relativePath);
  return parsed?.batchName;
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

// ── IndexedDB: local cache only ───────────────────────────────────────────────

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

async function getCachedBrowserFile(storagePath: string): Promise<File | null> {
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

/**
 * Retrieves a file — checks IndexedDB cache first, then falls back to PostgreSQL via backend.
 */
export async function retrieveBrowserFile(storagePath: string): Promise<File | null> {
  // 1. Try PostgreSQL via backend first (ensures we get the latest if modified elsewhere)
  const fromDb = await downloadFileByPath(storagePath).catch(() => null);
  if (fromDb) {
    // Cache it locally
    await persistBrowserFile(storagePath, fromDb);
    return fromDb;
  }

  // 2. Fall back to IndexedDB cache
  const cached = await getCachedBrowserFile(storagePath);
  if (cached) return cached;

  return null;
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
  } else if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    try {
      const fd = new FormData();
      fd.append('batch_id', batchId ?? 'Batch_001');
      fd.append(role === 'target' ? 'target_file' : 'source_file', file);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiBase}/api/v1/discovery/upload-and-detect`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        const info = role === 'target' ? data.target_file_info : data.source_file_info;
        if (info?.sheets?.length) {
          const firstSheet = info.sheets[0];
          const sSamples: Record<string, unknown>[] = firstSheet.sample_data ?? [];
          columns = (firstSheet.columns ?? []).map((c: string, idx: number) => {
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
          rowCount = firstSheet.record_count ?? sSamples.length;
          sampleData = sSamples;
        }
      }
    } catch (err) {
      console.error('Failed to profile Excel file on upload', err);
    }
  }

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

  // Upload to PostgreSQL (primary persistent storage)
  await uploadFileToDb(file, id, projectId, batchId, role ?? 'other', storagePath).catch(() => {
    // DB unavailable — IndexedDB cache is the fallback
  });

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

  // Try PostgreSQL first by id, then by path, then fallback to IndexedDB
  let file = await downloadFileFromDb(record.id).catch(() => null);
  if (!file) file = await downloadFileByPath(record.storagePath).catch(() => null);
  
  if (file) {
    await persistBrowserFile(record.storagePath, file); // cache locally
  } else {
    file = await getCachedBrowserFile(record.storagePath);
  }
  
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
