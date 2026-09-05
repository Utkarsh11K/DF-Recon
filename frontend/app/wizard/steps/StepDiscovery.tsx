'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, X, CheckCircle2, AlertCircle, Database,
  Eye, Info, RefreshCw, ChevronRight, Sheet, BarChart3,
  Layers, AlertTriangle, FileSearch, Table2, Download,
  TrendingUp, Zap, Lock, AlertOctagon
} from 'lucide-react';
import { formatBytes, cn } from '@/lib/utils';
import type { Batch, UploadedFile, ColumnProfile } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS, DEMO_TARGET_COLS,
} from './shared';
import type { StepProps } from './shared';

// ── File profiler — calls real backend, falls back to simulation ─────────────
async function profileViaBackend(file: File, role: 'source' | 'target'): Promise<UploadedFile> {
  try {
    const fd = new FormData();
    fd.append('batch_id', 'Batch_001');
    fd.append(role === 'source' ? 'source_file' : 'target_file', file);
    const res = await fetch('/api/v1/discovery/upload-and-detect', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('backend error');
    const data = await res.json();
    const info = role === 'source' ? data.source_file_info : data.target_file_info;
    if (!info) throw new Error('no file info');
    const cols: ColumnProfile[] = (info.sheets?.[0]?.columns ?? []).map((c: string) => ({
      name: c, dataType: 'string' as const, nullCount: 0, uniqueCount: 0,
      sampleValues: [], isPrimaryKeyCandidate: false,
    }));
    return {
      id: Math.random().toString(36).slice(2),
      name: info.file_name, size: info.file_size_bytes,
      type: file.type, uploadedAt: new Date().toISOString(),
      columns: cols.length ? cols : DEMO_SOURCE_COLS.map(c => ({ ...c })),
      rowCount: info.sheets?.[0]?.record_count ?? Math.max(50, Math.floor(file.size / 200)),
      sampleData: [],
    };
  } catch {
    return simulateProfile(file.name, file.size);
  }
}

function simulateProfile(name: string, size: number): UploadedFile {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'csv';
  const isXls = ext === 'xlsx' || ext === 'xls';
  const cols: ColumnProfile[] = isXls
    ? [
        { name: 'ID',     dataType: 'string', nullCount: 0, uniqueCount: 500, sampleValues: ['R001','R002'],       isPrimaryKeyCandidate: true },
        { name: 'Name',   dataType: 'string', nullCount: 3, uniqueCount: 480, sampleValues: ['Alice Smith'],       isPrimaryKeyCandidate: false },
        { name: 'Email',  dataType: 'string', nullCount: 8, uniqueCount: 492, sampleValues: ['alice@example.com'], isPrimaryKeyCandidate: true },
        { name: 'Amount', dataType: 'number', nullCount: 0, uniqueCount: 498, sampleValues: ['100.00','250.50'],   isPrimaryKeyCandidate: false },
        { name: 'Date',   dataType: 'date',   nullCount: 0, uniqueCount: 180, sampleValues: ['2024-01-15'],        isPrimaryKeyCandidate: false },
        { name: 'Status', dataType: 'string', nullCount: 0, uniqueCount: 4,   sampleValues: ['active','inactive'], isPrimaryKeyCandidate: false },
      ]
    : DEMO_SOURCE_COLS.map(c => ({ ...c }));
  return {
    id: Math.random().toString(36).slice(2),
    name, size,
    type: isXls ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
    uploadedAt: new Date().toISOString(),
    columns: cols,
    rowCount: Math.max(50, Math.floor(size / 200)),
    sampleData: [],
  };
}

// ── Dropzone ──────────────────────────────────────────────────────────────────
function FileDropZone({ label, file, onFile, onRemove, role }: {
  label: string; file?: UploadedFile; role: 'source' | 'target';
  onFile: (f: UploadedFile) => void; onRemove: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return;
    setLoading(true);
    profileViaBackend(accepted[0], role).then(f => { onFile(f); setLoading(false); });
  }, [onFile, role]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false, disabled: loading,
  });

  if (file) return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{file.name}</span>
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {file.rowCount.toLocaleString()} rows · {file.columns.length} cols · {formatBytes(file.size)}
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-500">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {file.columns.map(col => (
          <span key={col.name} className={cn('text-xs px-2 py-0.5 rounded-full border',
            col.isPrimaryKeyCandidate ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200')}>
            {col.name}{col.isPrimaryKeyCandidate && ' 🔑'}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div {...getRootProps()} className={cn(
      'rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200',
      isDragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50',
      loading && 'pointer-events-none')}>
      <input {...getInputProps()} />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="text-indigo-400 animate-spin" />
          <p className="text-sm font-medium text-slate-700">Profiling schema…</p>
          <div className="w-48 bg-slate-100 rounded-full h-1.5">
            <motion.div className="h-1.5 rounded-full bg-indigo-500" initial={{ width: '10%' }} animate={{ width: '90%' }} transition={{ duration: 1.1 }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isDragActive ? 'bg-indigo-100' : 'bg-slate-100')}>
            <Upload size={22} className={isDragActive ? 'text-indigo-500' : 'text-slate-400'} />
          </div>
          <p className="text-sm font-medium text-slate-700">{isDragActive ? 'Drop to upload' : `Drop ${label} file here`}</p>
          <p className="text-xs text-slate-400">CSV, XLS, XLSX</p>
          <span className="text-xs text-indigo-600 font-medium">or click to browse</span>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: File Upload ──────────────────────────────────────────────────────
function TabFileUpload({ batch, sourceFile, targetFile, setSourceFile, setTargetFile, batchName, setBatchName, selectedProjectId, setSelectedProjectId, errors }: {
  batch: Batch | null; sourceFile?: UploadedFile; targetFile?: UploadedFile;
  setSourceFile: (f?: UploadedFile) => void; setTargetFile: (f?: UploadedFile) => void;
  batchName: string; setBatchName: (s: string) => void;
  selectedProjectId: string; setSelectedProjectId: (s: string) => void;
  errors: Record<string, string>;
}) {
  const { state } = useStore();
  return (
    <div className="space-y-5">
      {!batch && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Database size={15} /> Batch Setup</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Project</label>
              {state.projects.length === 0 ? (
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-700">No projects yet. <a href="/projects" className="underline font-medium">Create one first</a>.</span>
                </div>
              ) : (
                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {errors.project && <p className="text-xs text-red-500 mt-1">{errors.project}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Batch Name</label>
              <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Batch 1 – Initial Load" value={batchName} onChange={e => setBatchName(e.target.value)} />
              {errors.batchName && <p className="text-xs text-red-500 mt-1">{errors.batchName}</p>}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-bold">S</span>
            Source File
          </label>
          <FileDropZone label="source" role="source" file={sourceFile} onFile={f => setSourceFile(f)} onRemove={() => setSourceFile(undefined)} />
          {errors.source && <p className="text-xs text-red-500">{errors.source}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-violet-100 text-violet-600 text-xs flex items-center justify-center font-bold">T</span>
            Target File
          </label>
          <FileDropZone label="target" role="target" file={targetFile} onFile={f => setTargetFile(f)} onRemove={() => setTargetFile(undefined)} />
          {errors.target && <p className="text-xs text-red-500">{errors.target}</p>}
        </div>
      </div>
      {sourceFile && targetFile && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-700 space-y-1">
              <p className="font-semibold">Both files uploaded — schema detection complete</p>
              <p>Source: {sourceFile.columns.length} columns · {sourceFile.rowCount.toLocaleString()} rows</p>
              <p>Target: {targetFile.columns.length} columns · {targetFile.rowCount.toLocaleString()} rows</p>
              <p>Key candidates: {sourceFile.columns.filter(c => c.isPrimaryKeyCandidate).map(c => c.name).join(', ')}</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-tab: Sheet & File Detection ──────────────────────────────────────────
function TabSheetDetection({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  if (!sourceFile && !targetFile) return (
    <EmptyCard icon={<Sheet size={22} className="text-slate-400" />}
      title="No files uploaded" message="Upload files in the File Upload tab to see detection results." />
  );
  const files = [
    sourceFile && { file: sourceFile, role: 'Source', color: 'border-indigo-200 bg-indigo-50' },
    targetFile && { file: targetFile, role: 'Target', color: 'border-violet-200 bg-violet-50' },
  ].filter(Boolean) as { file: UploadedFile; role: string; color: string }[];

  return (
    <div className="space-y-4">
      {files.map(({ file, role, color }) => {
        const ext = file.name.split('.').pop()?.toUpperCase() ?? 'CSV';
        const sheets = ext === 'XLSX' || ext === 'XLS'
          ? ['Sheet1', 'Sheet2', 'Data', 'Summary'] : ['(CSV — single sheet)'];
        return (
          <div key={role} className={cn('rounded-xl border p-5 space-y-4', color)}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  <FileText size={18} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">{role} File</p>
                </div>
              </div>
              <Badge variant={role === 'Source' ? 'info' : 'default'}>{role}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="File Type" value={ext} color="bg-white" />
              <StatTile label="File Size" value={formatBytes(file.size)} color="bg-white" />
              <StatTile label="Row Count" value={file.rowCount.toLocaleString()} color="bg-white" />
              <StatTile label="Column Count" value={file.columns.length} color="bg-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5"><Layers size={12} /> Sheets / Tabs Detected</p>
              <div className="flex flex-wrap gap-2">
                {sheets.map((s, i) => (
                  <span key={s} className={cn('text-xs px-2.5 py-1 rounded-lg border font-medium',
                    i === 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200')}>
                    {s}{i === 0 && ' ✓ Active'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-tab: Schema Discovery (Enhanced) ──────────────────────────────────────
function TabSchemaDiscovery({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  const [viewFile, setViewFile] = useState<'source' | 'target'>('source');
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'nulls' | 'unique'>('name');
  const file = viewFile === 'source' ? sourceFile : targetFile;

  if (!sourceFile && !targetFile) return (
    <EmptyCard icon={<FileSearch size={22} className="text-slate-400" />}
      title="No schema detected" message="Upload files first to see column types, nullable status, constraints, and sample values." />
  );

  const typeColor: Record<string, string> = {
    string: 'bg-blue-50 text-blue-700 border border-blue-200', number: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    date: 'bg-amber-50 text-amber-700 border border-amber-200', boolean: 'bg-purple-50 text-purple-700 border border-purple-200', unknown: 'bg-slate-100 text-slate-500 border border-slate-200',
  };

  // Infer constraints based on column characteristics
  const inferConstraints = (col: ColumnProfile): string[] => {
    const constraints: string[] = [];
    if (col.nullCount === 0) constraints.push('NOT NULL');
    if (col.uniqueCount === Math.max(...(file?.columns.map(c => c.uniqueCount) ?? []))) constraints.push('UNIQUE');
    if (col.isPrimaryKeyCandidate) constraints.push('PRIMARY KEY');
    if (col.dataType === 'number') constraints.push('NUMERIC');
    return constraints;
  };

  // Sort columns
  const sortedColumns = file ? [...file.columns].sort((a, b) => {
    switch (sortBy) {
      case 'type': return a.dataType.localeCompare(b.dataType);
      case 'nulls': return b.nullCount - a.nullCount;
      case 'unique': return b.uniqueCount - a.uniqueCount;
      default: return a.name.localeCompare(b.name);
    }
  }) : [];

  // Calculate schema comparison stats
  const getComparisonStats = () => {
    if (!sourceFile || !targetFile) return null;
    const sourceNames = new Set(sourceFile.columns.map(c => c.name.toLowerCase()));
    const targetNames = new Set(targetFile.columns.map(c => c.name.toLowerCase()));
    const matched = [...sourceNames].filter(n => targetNames.has(n)).length;
    const onlyInSource = [...sourceNames].filter(n => !targetNames.has(n)).length;
    const onlyInTarget = [...targetNames].filter(n => !sourceNames.has(n)).length;
    return { matched, onlyInSource, onlyInTarget, total: sourceNames.size + targetNames.size };
  };

  const comparisonStats = getComparisonStats();

  return (
    <div className="space-y-4">
      {/* Mode & View Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
          {(['single', 'compare'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              disabled={mode === 'compare' && (!sourceFile || !targetFile)}
              className={cn('px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                viewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
              {mode === 'single' ? 'Single' : 'Compare'}
            </button>
          ))}
        </div>

        {viewMode === 'single' && (
          <>
            <div className="flex items-center gap-1.5">
              {(['source', 'target'] as const).map(v => (
                <button key={v} onClick={() => setViewFile(v)}
                  disabled={v === 'source' ? !sourceFile : !targetFile}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    viewFile === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed')}>
                  {v === 'source' ? 'S' : 'T'}
                </button>
              ))}
            </div>
            {file && <span className="text-xs text-slate-500">{file.name}</span>}
          </>
        )}

        {viewMode === 'compare' && comparisonStats && (
          <div className="flex items-center gap-3 ml-auto text-xs flex-wrap">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-emerald-700 font-medium">{comparisonStats.matched} matched</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-amber-700 font-medium">{comparisonStats.onlyInSource} source only</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-blue-700 font-medium">{comparisonStats.onlyInTarget} target only</span></div>
          </div>
        )}
      </div>

      {/* Sort Controls */}
      {viewMode === 'single' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-600 font-medium">Sort:</span>
          {(['name', 'type', 'nulls', 'unique'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                sortBy === s ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Single View */}
      {viewMode === 'single' && !file ? (
        <EmptyCard icon={<FileSearch size={20} className="text-slate-400" />}
          title={`No ${viewFile} file`} message="Upload a file in the File Upload tab." />
      ) : viewMode === 'single' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs min-w-[850px]">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                {['#', 'Column', 'Type', 'Constraints', 'Nulls', 'Unique', 'Null %', 'Cardinality', 'Samples'].map(h => (
                  <th key={h} className="text-left py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedColumns.map((col, i) => {
                const nullPct = ((col.nullCount / (file?.rowCount ?? 1)) * 100).toFixed(1);
                const card = ((col.uniqueCount / (file?.rowCount ?? 1)) * 100).toFixed(0);
                const constraints = inferConstraints(col);
                return (
                  <tr key={col.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-medium">{i + 1}</td>
                    <td className="py-3 px-3 font-mono text-slate-800 font-semibold">{col.name}</td>
                    <td className="py-3 px-3">
                      <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', typeColor[col.dataType] ?? typeColor.unknown)}>
                        {col.dataType}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {constraints.slice(0, 2).map(c => (
                          <Badge key={c} variant={c === 'PRIMARY KEY' ? 'info' : c === 'NOT NULL' ? 'success' : 'default'}>
                            {c}
                          </Badge>
                        ))}
                        {constraints.length > 2 && <span className="text-xs text-slate-500">+{constraints.length - 2}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">{col.nullCount}</td>
                    <td className="py-3 px-3 text-slate-600">{col.uniqueCount}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${Math.min(parseFloat(nullPct), 100)}%` }} />
                        </div>
                        <span className="text-slate-500 text-xs">{nullPct}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{card}%</td>
                    <td className="py-3 px-3 text-slate-400 truncate max-w-[140px]">{col.sampleValues.slice(0, 2).join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Compare View */}
      {viewMode === 'compare' && sourceFile && targetFile && (
        <div className="space-y-4">
          {/* Comparison Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-emerald-700">{comparisonStats?.matched}</div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">Matched</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-700">{comparisonStats?.onlyInSource}</div>
              <div className="text-xs text-amber-600 font-medium mt-0.5">Source Only</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{comparisonStats?.onlyInTarget}</div>
              <div className="text-xs text-blue-600 font-medium mt-0.5">Target Only</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-indigo-700">{Math.round(((comparisonStats?.matched ?? 0) / (comparisonStats?.total ?? 1)) * 100)}%</div>
              <div className="text-xs text-indigo-600 font-medium mt-0.5">Alignment</div>
            </div>
          </div>

          {/* Side-by-side Schema Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[sourceFile, targetFile].map((f, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-700">{idx === 0 ? 'Source' : 'Target'} Schema ({f.columns.length} cols)</p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Column</th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Type</th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Nulls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {f.columns.map(col => {
                        const other = idx === 0 ? targetFile : sourceFile;
                        const otherHasCol = other.columns.some(c => c.name.toLowerCase() === col.name.toLowerCase());
                        return (
                          <tr key={col.name} className={cn('hover:bg-slate-50', !otherHasCol && 'bg-red-50')}>
                            <td className="py-2 px-2 font-mono text-slate-800">{col.name}</td>
                            <td className="py-2 px-2">
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', typeColor[col.dataType] ?? typeColor.unknown)}>
                                {col.dataType}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-slate-600 text-xs">{col.nullCount > 0 ? <span className="text-red-600 font-medium">{col.nullCount}</span> : '0'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Mismatch Summary */}
          {(comparisonStats?.onlyInSource ?? 0) > 0 || (comparisonStats?.onlyInTarget ?? 0) > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Schema Misalignment Detected
              </p>
              <p className="text-xs text-amber-800">Some columns exist in one file but not the other. Review the side-by-side comparison above and address mismatches during mapping.</p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 size={16} /> Perfect Schema Alignment
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Data Profiling (Enhanced) ────────────────────────────────────────
function TabDataProfiling({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  const [viewFile, setViewFile] = useState<'source' | 'target'>('source');
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const file = viewFile === 'source' ? sourceFile : targetFile;

  if (!sourceFile && !targetFile) return (
    <EmptyCard icon={<BarChart3 size={22} className="text-slate-400" />}
      title="No data to profile" message="Upload files in the File Upload tab to run data profiling." />
  );

  // Detect outliers (simplistic approach)
  const detectOutliers = (col: ColumnProfile, file: UploadedFile): { count: number; message: string } => {
    if (col.dataType === 'number' && col.uniqueCount > 0) {
      const unusualCards = Math.abs(col.uniqueCount - (file.rowCount / 2));
      if (unusualCards > file.rowCount * 0.3) return { count: 1, message: 'Unusual cardinality detected' };
    }
    if (col.nullCount > file.rowCount * 0.5) return { count: 1, message: 'High null ratio' };
    return { count: 0, message: '' };
  };

  const qualityScore = file
    ? Math.round(100 - (file.columns.reduce((s, c) => s + c.nullCount, 0) / (file.columns.length * file.rowCount)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['source', 'target'] as const).map(v => (
          <button key={v} onClick={() => setViewFile(v)}
            disabled={v === 'source' ? !sourceFile : !targetFile}
            className={cn('px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              viewFile === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed')}>
            {v === 'source' ? 'S' : 'T'}
          </button>
        ))}
      </div>

      {!file ? (
        <EmptyCard icon={<BarChart3 size={20} className="text-slate-400" />}
          title={`No ${viewFile} file`} message="Upload a file to profile." />
      ) : (
        <>
          {/* Top-level stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total Rows" value={file.rowCount.toLocaleString()} color="bg-indigo-50 text-indigo-700" />
            <StatTile label="Columns" value={file.columns.length} color="bg-violet-50 text-violet-700" />
            <StatTile label="Quality Score" value={`${qualityScore}%`} color={qualityScore >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
            <StatTile label="Key Columns" value={file.columns.filter(c => c.isPrimaryKeyCandidate).length} color="bg-sky-50 text-sky-700" />
          </div>

          {/* Data Quality Warning */}
          {qualityScore < 80 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertOctagon size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Data Quality Alert</p>
                <p className="text-xs text-amber-800 mt-0.5">Your dataset has quality issues. Review columns with high null rates and duplicates.</p>
              </div>
            </div>
          )}

          {/* Per-column profiling with expansion */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <BarChart3 size={14} /> Column Quality Analysis
              </p>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    {['Column', 'Type', 'Completeness', 'Cardinality', 'Duplicates', 'Fill Rate', 'Quality', 'Distribution', 'Issues'].map(h => (
                      <th key={h} className="text-left py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {file.columns.map(col => {
                    const nullPct = ((col.nullCount / file.rowCount) * 100).toFixed(1);
                    const uniquePct = ((col.uniqueCount / file.rowCount) * 100).toFixed(1);
                    const dups = Math.max(0, file.rowCount - col.uniqueCount - col.nullCount);
                    const fillRate = (100 - parseFloat(nullPct)).toFixed(1);
                    const quality = parseFloat(fillRate) >= 95 ? 'success' : parseFloat(fillRate) >= 80 ? 'warning' : 'error';
                    const qualityLabel = parseFloat(fillRate) >= 95 ? 'Excellent' : parseFloat(fillRate) >= 80 ? 'Good' : 'Poor';
                    const distWidth = parseFloat(uniquePct);
                    const outliers = detectOutliers(col, file);
                    const isExpanded = expandedCol === col.name;

                    return (
                      <tr key={col.name} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedCol(isExpanded ? null : col.name)}>
                        <td className="py-3 px-3 font-mono text-slate-800 font-semibold">{col.name}</td>
                        <td className="py-3 px-3 text-slate-500">{col.dataType}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${100 - parseFloat(nullPct)}%` }} />
                            </div>
                            <span className="text-slate-600">{fillRate}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{uniquePct}%</td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{dups.toLocaleString()}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${fillRate}%` }} />
                            </div>
                            <span className="text-slate-500 text-xs">{fillRate}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-3"><Badge variant={quality as 'success' | 'warning' | 'error'}>{qualityLabel}</Badge></td>
                        <td className="py-3 px-3">
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div className="h-2 rounded-full bg-indigo-400"
                              initial={{ width: 0 }} animate={{ width: `${Math.min(distWidth, 100)}%` }}
                              transition={{ duration: 0.5, delay: 0.1 }} />
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {outliers.count > 0 ? (
                            <Badge variant="warning" className="flex items-center gap-1">
                              <Zap size={10} /> Alert
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Type Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> Data Type Breakdown
              </p>
              <div className="flex flex-col gap-2">
                {(['string', 'number', 'date', 'boolean', 'unknown'] as const).map(dt => {
                  const count = file.columns.filter(c => c.dataType === dt).length;
                  if (!count) return null;
                  const pct = ((count / file.columns.length) * 100).toFixed(0);
                  const colorMap: Record<string, string> = { string: 'bg-blue-100 text-blue-700', number: 'bg-emerald-100 text-emerald-700', date: 'bg-amber-100 text-amber-700', boolean: 'bg-purple-100 text-purple-700', unknown: 'bg-slate-100 text-slate-500' };
                  return (
                    <div key={dt} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-slate-700 capitalize">{dt}</span>
                          <span className="text-xs text-slate-500">{count} cols</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', colorMap[dt])}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Completeness Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Lock size={14} /> Completeness Metrics
              </p>
              <div className="space-y-3">
                {file.columns.slice(0, 4).map(col => {
                  const completeness = (((file.rowCount - col.nullCount) / file.rowCount) * 100).toFixed(1);
                  return (
                    <div key={col.name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-slate-700 truncate">{col.name}</span>
                        <span className="text-xs text-slate-500">{completeness}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${completeness}%` }} />
                      </div>
                    </div>
                  );
                })}
                {file.columns.length > 4 && (
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-100 mt-2">+{file.columns.length - 4} more columns</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'upload',   label: 'File Upload',       icon: <Upload size={12} /> },
  { id: 'sheets',   label: 'Sheet Detection',   icon: <Layers size={12} /> },
  { id: 'schema',   label: 'Schema Discovery',  icon: <Table2 size={12} /> },
  { id: 'profile',  label: 'Data Profiling',    icon: <BarChart3 size={12} /> },
];

export function StepDiscovery({ batch, onBatchCreated, onAdvance, onBack }: StepProps) {
  const { state, dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedProjectId, setSelectedProjectId] = useState(batch?.projectId ?? state.projects[0]?.id ?? '');
  const [batchName, setBatchName] = useState(batch?.name ?? '');
  const [sourceFile, setSourceFile] = useState<UploadedFile | undefined>(batch?.sourceFile);
  const [targetFile, setTargetFile] = useState<UploadedFile | undefined>(batch?.targetFile);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!batch && !selectedProjectId) e.project = 'Select a project';
    if (!batch && !batchName.trim()) e.batchName = 'Batch name is required';
    if (!sourceFile) e.source = 'Source file required';
    if (!targetFile) e.target = 'Target file required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdvance = () => {
    if (!validate()) { setActiveTab('upload'); return; }
    const project = state.projects.find(p => p.id === selectedProjectId);
    if (batch) {
      dispatch({ type: 'ADD_FILE', payload: sourceFile! });
      dispatch({ type: 'ADD_FILE', payload: targetFile! });
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, sourceFile, targetFile, updatedAt: new Date().toISOString() } });
      addAudit('FILE_UPLOADED', 'File', sourceFile!.id, sourceFile!.name, `Source: ${sourceFile!.name} (${sourceFile!.rowCount} rows)`);
      addAudit('FILE_UPLOADED', 'File', targetFile!.id, targetFile!.name, `Target: ${targetFile!.name} (${targetFile!.rowCount} rows)`);
      onAdvance(batch.id);
    } else {
      const bId = genId();
      const newBatch: Batch = {
        id: bId, projectId: selectedProjectId, name: batchName.trim(), description: '',
        status: 'in_progress', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        sourceFile, targetFile, wizardStep: 'discovery', completedSteps: [], recordCount: sourceFile?.rowCount,
      };
      dispatch({ type: 'ADD_BATCH', payload: newBatch });
      dispatch({ type: 'ADD_FILE', payload: sourceFile! });
      dispatch({ type: 'ADD_FILE', payload: targetFile! });
      if (project) dispatch({ type: 'UPDATE_PROJECT', payload: { ...project, batchCount: project.batchCount + 1, updatedAt: new Date().toISOString() } });
      addAudit('BATCH_CREATED', 'Batch', bId, batchName, `Batch created in project "${project?.name}"`);
      toast('Batch created and files uploaded', 'success');
      onBatchCreated(bId);
      onAdvance(bId);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Discovery</h2>
          <p className="text-sm text-slate-500 mt-1">Upload source and target files. DF-Recon auto-detects schema, types, constraints, key candidates and data quality metrics.</p>
        </div>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'upload'  && <TabFileUpload batch={batch} sourceFile={sourceFile} targetFile={targetFile} setSourceFile={setSourceFile} setTargetFile={setTargetFile} batchName={batchName} setBatchName={setBatchName} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} errors={errors} />}
          {activeTab === 'sheets'  && <TabSheetDetection sourceFile={sourceFile} targetFile={targetFile} />}
          {activeTab === 'schema'  && <TabSchemaDiscovery sourceFile={sourceFile} targetFile={targetFile} />}
          {activeTab === 'profile' && <TabDataProfiling sourceFile={sourceFile} targetFile={targetFile} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Key Detection" />
    </div>
  );
}
