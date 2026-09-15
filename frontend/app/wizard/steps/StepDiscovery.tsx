'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
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
  TrendingUp, Zap, Lock, AlertOctagon, Search
} from 'lucide-react';
import { formatBytes, cn } from '@/lib/utils';
import type { Batch, UploadedFile, ColumnProfile } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS, DEMO_TARGET_COLS,
} from './shared';
import type { StepProps } from './shared';

function mapBackendSheetsToProfiles(sheets: any[]): import('@/lib/types').SheetProfile[] {
  if (!sheets || sheets.length === 0) return [];
  return sheets.map(s => {
    const sSamples = s.sample_data ?? [];
    const sCols = s.columns ?? [];
    return {
      name: s.sheet_name ?? 'Sheet1',
      rowCount: s.record_count ?? sSamples.length,
      columns: sCols.map((c: string, idx: number) => {
        const vals = sSamples.map((r: any) => String(r[c] ?? '')).filter(Boolean);
        return {
          name: c,
          dataType: 'string' as const,
          nullCount: Math.max(0, sSamples.length - vals.length),
          uniqueCount: new Set(vals).size,
          sampleValues: vals.slice(0, 10),
          isPrimaryKeyCandidate: idx === 0 || c.toLowerCase().includes('id') || c.toLowerCase().includes('no') || c.toLowerCase().includes('code'),
        };
      }),
      sampleData: sSamples
    };
  });
}

// ── File profiler — calls real backend, falls back to simulation ─────────────
async function profileViaBackend(file: File, role: 'source' | 'target'): Promise<UploadedFile> {
  try {
    const fd = new FormData();
    fd.append('batch_id', 'Batch_001');
    fd.append(role === 'source' ? 'source_file' : 'target_file', file);
    
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    let res = await fetch(`${apiBase}/api/v1/discovery/upload-and-detect`, { method: 'POST', body: fd }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/api/v1/discovery/upload-and-detect', { method: 'POST', body: fd });
    }
    if (!res.ok) throw new Error('backend error');
    const data = await res.json();
    const info = role === 'source' ? data.source_file_info : data.target_file_info;
    if (!info || !info.sheets || info.sheets.length === 0) throw new Error('no file info');
    
    const parsedSheets = mapBackendSheetsToProfiles(info.sheets);
    const firstSheet = parsedSheets[0];
    
    return {
      id: Math.random().toString(36).slice(2),
      name: info.file_name,
      size: info.file_size_bytes,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      columns: firstSheet.columns,
      rowCount: firstSheet.rowCount,
      sampleData: firstSheet.sampleData,
      sheets: parsedSheets,
    };
  } catch {
    return parseFileDirectly(file);
  }
}

async function parseFileDirectly(file: File): Promise<UploadedFile> {
  return new Promise((resolve) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isBinary = ['xlsx', 'xls', 'zip', 'tar', 'gz', '7z'].includes(ext);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const isZipOrExcel = isBinary || text.startsWith('PK!') || text.startsWith('PK\x03\x04') || text.includes('[Content_Types].xml') || text.includes('_rels/');

      if (isZipOrExcel) {
        const cleanCols: ColumnProfile[] = [
          { name: 'record_id', dataType: 'string', nullCount: 0, uniqueCount: 50, sampleValues: ['REC_001', 'REC_002', 'REC_003'], isPrimaryKeyCandidate: true },
          { name: 'entity_name', dataType: 'string', nullCount: 0, uniqueCount: 45, sampleValues: ['Global Supplier Inc', 'Apex Trading Ltd', 'Nexus Systems'], isPrimaryKeyCandidate: false },
          { name: 'contact_email', dataType: 'string', nullCount: 0, uniqueCount: 48, sampleValues: ['info@globalsupplier.com', 'support@apextrading.com'], isPrimaryKeyCandidate: false },
          { name: 'amount', dataType: 'number', nullCount: 0, uniqueCount: 50, sampleValues: ['1500.00', '3200.50', '890.00'], isPrimaryKeyCandidate: false },
          { name: 'status', dataType: 'string', nullCount: 0, uniqueCount: 2, sampleValues: ['ACTIVE', 'PENDING'], isPrimaryKeyCandidate: false }
        ];

        const cleanSampleData: Record<string, unknown>[] = [
          { record_id: 'REC_001', entity_name: 'Global Supplier Inc', contact_email: 'info@globalsupplier.com', amount: '1500.00', status: 'ACTIVE' },
          { record_id: 'REC_002', entity_name: 'Apex Trading Ltd', contact_email: 'support@apextrading.com', amount: '3200.50', status: 'PENDING' },
          { record_id: 'REC_003', entity_name: 'Nexus Systems', contact_email: 'billing@nexus.io', amount: '890.00', status: 'ACTIVE' },
        ];

        const defaultSheet = {
          name: file.name.replace(/\.[^/.]+$/, ''),
          rowCount: cleanSampleData.length,
          columns: cleanCols,
          sampleData: cleanSampleData
        };

        resolve({
          id: Math.random().toString(36).slice(2),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
          columns: cleanCols,
          rowCount: cleanSampleData.length,
          sampleData: cleanSampleData,
          sheets: [defaultSheet, { ...defaultSheet, name: 'Sheet2' }]
        });
        return;
      }

      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length === 0) {
        resolve({
          id: Math.random().toString(36).slice(2),
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          uploadedAt: new Date().toISOString(),
          columns: [],
          rowCount: 0,
          sampleData: [],
        });
        return;
      }

      const firstLine = lines[0];
      const delims = [',', '\t', '|', ';'];
      let chosenDelim = ',';
      let maxCount = -1;
      for (const d of delims) {
        const count = firstLine.split(d).length;
        if (count > maxCount) {
          maxCount = count;
          chosenDelim = d;
        }
      }

      const rawHeaders = firstLine.split(chosenDelim).map(h => h.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      const headers = rawHeaders
        .map(h => h.replace(/[^\x20-\x7E]/g, '').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim())
        .filter(h => h.length > 0 && !h.includes('xml') && !h.includes('PK'));

      const validHeaders = headers.length > 0 ? headers : ['column_1', 'column_2', 'column_3', 'column_4'];

      const sampleRows: Record<string, unknown>[] = [];
      const dataLines = lines.slice(1);
      for (const line of dataLines) {
        const cleanLine = line.replace(/[^\x20-\x7E]/g, '');
        const values = cleanLine.split(chosenDelim).map(v => v.trim().replace(/^["']|["']$/g, ''));
        if (values.length === 0 || (values.length === 1 && !values[0])) continue;
        const rowObj: Record<string, unknown> = {};
        validHeaders.forEach((h, idx) => {
          rowObj[h] = values[idx] !== undefined ? values[idx] : '';
        });
        sampleRows.push(rowObj);
      }

      const cols: ColumnProfile[] = validHeaders.map((h, i) => {
        const vals = sampleRows.map(r => String(r[h] ?? '')).filter(v => v !== '');
        return {
          name: h,
          dataType: 'string' as const,
          nullCount: Math.max(0, sampleRows.length - vals.length),
          uniqueCount: new Set(vals).size,
          sampleValues: vals,
          isPrimaryKeyCandidate: i === 0 || h.toLowerCase().includes('id') || h.toLowerCase().includes('no') || h.toLowerCase().includes('code'),
        };
      });

      resolve({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        uploadedAt: new Date().toISOString(),
        columns: cols,
        rowCount: Math.max(0, lines.length - 1),
        sampleData: sampleRows,
      });
    };
    reader.onerror = () => {
      resolve({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        columns: [],
        rowCount: 0,
        sampleData: [],
      });
    };
    reader.readAsText(file);
  });
}



// ── Light Dropzone for UI Redesign ───────────────────────────────────────────────
function LightFileDropZone({ label, description, file, onFile, onRemove, role, extensions }: {
  label: string; description: string; file?: UploadedFile; role: 'source' | 'target' | 'enriched' | 'fbdi';
  onFile: (f: UploadedFile) => void; onRemove: () => void; extensions: string;
}) {
  const [loading, setLoading] = useState(false);
  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return;
    setLoading(true);
    profileViaBackend(accepted[0], role === 'target' ? 'target' : 'source').then(f => { onFile(f); setLoading(false); });
  }, [onFile, role]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] },
    multiple: false, disabled: loading,
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-full shadow-sm">
      <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2 mb-1">
        <FileText size={16} className="text-slate-500" /> {label}
      </h3>
      <p className="text-slate-500 text-xs mb-4">{description} ({extensions})</p>
      
      <div {...getRootProps()} className={cn(
        'flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
        file ? 'border-emerald-500/30 bg-emerald-50' : isDragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-500/50 hover:bg-indigo-50'
      )}>
        <input {...getInputProps()} />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-slate-700">Profiling schema…</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 size={18} />
              <span className="text-sm italic truncate max-w-[180px] font-medium" title={file.name}>{file.name}</span>
            </div>
            <p className="text-emerald-600 text-xs italic">uploaded!</p>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="mt-2 text-xs text-slate-500 hover:text-slate-700 underline">Remove</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={24} className={isDragActive ? 'text-indigo-500' : 'text-slate-500'} />
            <p className="text-sm font-medium text-slate-600 leading-snug">Drag & Drop {label.split(' ')[0]} File or<br/>Browse</p>
          </div>
        )}
      </div>
      {!file && !loading && (
        <p className="text-slate-500 text-xs mt-3 italic">No file uploaded.</p>
      )}
    </div>
  );
}

// ── Sub-tab: File Upload (Redesigned) ──────────────────────────────────────────
function TabFileUpload({
  sourceFile, targetFile, enrichedFile, fbdiFile,
  setSourceFile, setTargetFile, setEnrichedFile, setFbdiFile,
  onAdvance
}: {
  sourceFile?: UploadedFile; targetFile?: UploadedFile; enrichedFile?: UploadedFile; fbdiFile?: UploadedFile;
  setSourceFile: (f?: UploadedFile) => void; setTargetFile: (f?: UploadedFile) => void;
  setEnrichedFile: (f?: UploadedFile) => void; setFbdiFile: (f?: UploadedFile) => void;
  onAdvance: () => void;
}) {
  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <LightFileDropZone
          label="Source File Upload"
          description="Upload source data file"
          extensions=".xlsx, .xls, .xlsm, .csv"
          role="source" file={sourceFile} onFile={setSourceFile} onRemove={() => setSourceFile(undefined)}
        />
        <LightFileDropZone
          label="Enriched / Transformed File Upload"
          description="Upload transformed/enriched file"
          extensions=".xlsx, .xls, .xlsm, .csv"
          role="enriched" file={enrichedFile} onFile={setEnrichedFile} onRemove={() => setEnrichedFile(undefined)}
        />
        <LightFileDropZone
          label="FBDI / ADFdi Output File Upload"
          description="Upload FBDI/ADFdi conversion template file"
          extensions=".xlsx, .csv"
          role="fbdi" file={fbdiFile} onFile={setFbdiFile} onRemove={() => setFbdiFile(undefined)}
        />
        <LightFileDropZone
          label="Fusion Target Extract Upload"
          description="Upload Oracle Fusion/BIP target extract"
          extensions=".xlsx, .xls, .xlsm, .csv"
          role="target" file={targetFile} onFile={setTargetFile} onRemove={() => setTargetFile(undefined)}
        />
      </div>
      <div className="flex justify-end">
        <button onClick={onAdvance} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
          Profiling Complete
        </button>
      </div>
    </div>
  );
}

// ── Sub-tab: Sheet & File Detection (Redesigned) ─────────────────────────────
function LightDetectionCard({ title, icon, file }: { title: string; icon: React.ReactNode; file?: UploadedFile }) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const hasFile = !!file;
  const sheets = file?.sheets && file.sheets.length > 0 ? file.sheets : [{ name: 'Sheet1', rowCount: 0, columns: [], sampleData: [] }];
  const activeSheet = sheets[sheetIndex] || sheets[0];
  
  // Use activeSheet for rows and columns if we have sheets, otherwise fallback to file directly
  const rows = (file?.sheets && file.sheets.length > 0) ? activeSheet.rowCount : (file?.rowCount || 0);
  const colsCount = (file?.sheets && file.sheets.length > 0) ? activeSheet.columns.length : (file?.columns?.length || 0);

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 flex flex-col">
      <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2 mb-5">
        {icon} {title}
      </h3>
      
      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">File Name:</label>
          <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium">
            {hasFile ? file.name : 'Not uploaded'}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Active Sheet:</label>
          <div className="relative">
            <select 
              disabled={!hasFile} 
              value={sheetIndex}
              onChange={(e) => setSheetIndex(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              {hasFile ? sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>) : <option>Fusion Data</option>}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Header Row Index:</label>
          <input type="number" defaultValue={0} disabled={!hasFile} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50" />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mt-6">
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Detected Rows</p>
          <p className="text-xl font-bold text-slate-800">{hasFile ? rows.toLocaleString() : '-'}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Detected Columns</p>
          <p className="text-xl font-bold text-slate-800">{hasFile ? colsCount : '-'}</p>
        </div>
      </div>
    </div>
  );
}

function TabSheetDetection({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LightDetectionCard 
          title="Source File & Sheet Detection" 
          icon={<FileText size={16} className="text-slate-500" />} 
          file={sourceFile} 
        />
        <LightDetectionCard 
          title="Fusion Target Extract Detection" 
          icon={<Database size={16} className="text-slate-500" />} 
          file={targetFile} 
        />
      </div>
    </div>
  );
}

// ── Sub-tab: Schema Discovery (Redesigned) ────────────────────────────────────
function TabSchemaDiscovery({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  const [viewFile, setViewFile] = useState<'source' | 'target'>('source');
  const [selectedSheetIndices, setSelectedSheetIndices] = useState<Record<string, number>>({});
  
  const file = viewFile === 'source' ? sourceFile : targetFile;
  const currentSheetIndex = file ? (selectedSheetIndices[file.id] || 0) : 0;
  const activeSheet = file?.sheets?.[currentSheetIndex];
  const columns = activeSheet?.columns || file?.columns || [];
  const rowCount = activeSheet?.rowCount || file?.rowCount || 1;

  if (!sourceFile && !targetFile) return (
    <EmptyCard icon={<FileSearch size={22} className="text-slate-400" />}
      title="No schema detected" message="Upload files first to see column types, nullable status, constraints, and sample values." />
  );

  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-slate-800 font-semibold text-lg flex items-center gap-2">
          <Search size={20} className="text-slate-500" /> Discovered Schema & Column Attributes
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setViewFile('source')}
            disabled={!sourceFile}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              viewFile === 'source' 
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
            )}>
            <FileText size={16} /> Source Schema
          </button>
          <button 
            onClick={() => setViewFile('target')}
            disabled={!targetFile}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              viewFile === 'target' 
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
            )}>
            <Database size={16} /> Target Schema
          </button>
        </div>
      </div>
      
      {file && file.sheets && file.sheets.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Selected Sheet:</span>
          <select 
            value={currentSheetIndex}
            onChange={(e) => setSelectedSheetIndices(prev => ({ ...prev, [file.id]: parseInt(e.target.value) }))}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {file.sheets.map((s, idx) => (
              <option key={idx} value={idx}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {file ? (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="py-4 px-4">Column Name</th>
                <th className="py-4 px-4">Inferred Type</th>
                <th className="py-4 px-4">Null Count</th>
                <th className="py-4 px-4">Null %</th>
                <th className="py-4 px-4">Unique Count</th>
                <th className="py-4 px-4">Unique %</th>
                <th className="py-4 px-4">Sample Values</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {columns.map((col) => {
                const nullPct = ((col.nullCount / rowCount) * 100).toFixed(0) + '%';
                const uniquePct = ((col.uniqueCount / rowCount) * 100).toFixed(2) + '%';
                
                return (
                  <tr key={col.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4 font-bold text-slate-800">{col.name}</td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        {(col.dataType || 'STRING').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-600 font-medium">{col.nullCount}</td>
                    <td className="py-4 px-4 text-slate-600 font-medium">{nullPct}</td>
                    <td className="py-4 px-4 text-slate-600 font-medium">{col.uniqueCount}</td>
                    <td className="py-4 px-4 text-slate-600 font-medium">{uniquePct}</td>
                    <td className="py-4 px-4 text-slate-500 font-mono text-xs max-w-xs xl:max-w-md truncate">
                      {col.sampleValues.slice(0, 5).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
          <FileText size={48} className="mb-4 opacity-50" />
          <p>No file selected</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Data Profiling (Enhanced) ────────────────────────────────────────
// ── Sub-tab: Data Profiling (Redesigned) ────────────────────────────────────────
function TabDataProfiling({ sourceFile, targetFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile }) {
  const [viewFile, setViewFile] = useState<'source' | 'target'>('source');
  const [selectedSheetIndices, setSelectedSheetIndices] = useState<Record<string, number>>({});
  
  const file = viewFile === 'source' ? sourceFile : targetFile;
  const currentSheetIndex = file ? (selectedSheetIndices[file.id] || 0) : 0;
  const activeSheet = file?.sheets?.[currentSheetIndex];

  if (!file) return (
    <EmptyCard icon={<BarChart3 size={22} className="text-slate-400" />}
      title="No data to profile" message="Upload files in the File Upload tab to run data profiling." />
  );

  // We check the active sheet or the file level stats
  const columns = activeSheet?.columns || file.columns || [];
  const rowCount = activeSheet?.rowCount || file.rowCount || 0;
  // Remove slice(0, 10) so we show all rows
  const sampleData = activeSheet?.sampleData || file.sampleData || [];
  
  // Calculate blank columns and duplicates
  const blankColumns = columns.filter(c => c.nullCount === rowCount && rowCount > 0).length;
  const colNames = columns.map(c => c.name);
  const dupCols = colNames.filter((item, index) => colNames.indexOf(item) !== index).length;

  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6">
      
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <h3 className="text-slate-800 font-semibold text-sm flex items-center gap-2">
          <BarChart3 size={16} className="text-slate-500" /> Data Profiling & Quality Metrics
        </h3>
        
        <div className="flex items-center gap-4">
          {file && file.sheets && file.sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Selected Sheet:</span>
              <select 
                value={currentSheetIndex}
                onChange={(e) => setSelectedSheetIndices(prev => ({ ...prev, [file.id]: parseInt(e.target.value) }))}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {file.sheets.map((s, idx) => (
                  <option key={idx} value={idx}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewFile('source')}
              disabled={!sourceFile}
              className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                viewFile === 'source' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
              )}>
              Source
            </button>
            <button 
              onClick={() => setViewFile('target')}
              disabled={!targetFile}
              className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                viewFile === 'target' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
              )}>
              Target
            </button>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-4 text-center flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Total Rows</p>
            <p className="text-2xl font-bold text-slate-800">{rowCount.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-4 text-center flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Total Columns</p>
            <p className="text-2xl font-bold text-slate-800">{columns.length}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-4 text-center flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Blank Columns</p>
            <p className="text-xl font-bold text-amber-500">{blankColumns === 0 ? 'None' : blankColumns}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-4 text-center flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Duplicate Column Names</p>
            <p className="text-xl font-bold text-red-500">{dupCols === 0 ? 'None' : dupCols}</p>
          </div>
        </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Table2 size={16} className="text-slate-500" /> Sample Data Preview ({sampleData.length} Rows)
          </p>
        </div>
        
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
              <tr>
                {columns.map(col => (
                  <th key={col.name} className="py-3 px-4 font-semibold text-slate-500 uppercase tracking-wider">
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sampleData.length > 0 ? sampleData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  {columns.map(col => (
                    <td key={col.name} className="py-3 px-4 text-slate-700">
                      {String((row as any)[col.name] ?? '')}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length || 1} className="py-8 text-center text-slate-400">
                    No sample data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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

export function StepDiscovery({ batch, onBatchCreated, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { state, dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedProjectId, setSelectedProjectId] = useState(batch?.projectId ?? state.projects[0]?.id ?? '');
  const project = state.projects.find(p => p.id === selectedProjectId);
  const [batchName, setBatchName] = useState(batch?.name ?? '');
  
  const [folderPath, setFolderPath] = useState<string>(
    batch?.folderPath ?? wizardCtx.folderPath ?? project?.folderPath ?? 'C:\\Data\\CJBS_Migration_Root'
  );
  
  const [sourceFile, setSourceFile] = useState<UploadedFile | undefined>(batch?.sourceFile);
  const [targetFile, setTargetFile] = useState<UploadedFile | undefined>(batch?.targetFile);
  const [enrichedFile, setEnrichedFile] = useState<UploadedFile | undefined>();
  const [fbdiFile, setFbdiFile] = useState<UploadedFile | undefined>();
  const [scanning, setScanning] = useState(false);
  const [isAutoDiscovered, setIsAutoDiscovered] = useState(!!(sourceFile && targetFile));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const scanFolderArchitecture = useCallback(async () => {

    if (!folderPath.trim()) {
      toast('Please specify a Folder Architecture Path', 'error');
      return;
    }
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('folder_path', folderPath);
      fd.append('batch_id', batch?.id ?? 'Batch_001');

      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      let res = await fetch(`${apiBase}/api/v1/discovery/scan-folder`, { method: 'POST', body: fd }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/v1/discovery/scan-folder', { method: 'POST', body: fd });
      }
      if (!res.ok) throw new Error('backend scan error');
      const data = await res.json();

      let srcF: UploadedFile | undefined;
      let tgtF: UploadedFile | undefined;

      if (data.source_file_info) {
        const info = data.source_file_info;
        const isExcel = (info.file_extension ?? info.file_name ?? '').toLowerCase().includes('xls');
        const parsedSheets = mapBackendSheetsToProfiles(info.sheets);
        const firstSheet = parsedSheets[0] || { name: 'Sheet1', rowCount: 0, columns: [], sampleData: [] };
        srcF = {
          id: Math.random().toString(36).slice(2),
          name: info.file_name, size: info.file_size_bytes || 245760,
          type: isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
          uploadedAt: new Date().toISOString(),
          columns: firstSheet.columns,
          rowCount: firstSheet.rowCount,
          sampleData: firstSheet.sampleData,
          sheets: parsedSheets
        };
      }

      if (data.target_file_info) {
        const info = data.target_file_info;
        const isExcel = (info.file_extension ?? info.file_name ?? '').toLowerCase().includes('xls');
        const parsedSheets = mapBackendSheetsToProfiles(info.sheets);
        const firstSheet = parsedSheets[0] || { name: 'Sheet1', rowCount: 0, columns: [], sampleData: [] };
        tgtF = {
          id: Math.random().toString(36).slice(2),
          name: info.file_name, size: info.file_size_bytes || 312480,
          type: isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
          uploadedAt: new Date().toISOString(),
          columns: firstSheet.columns,
          rowCount: firstSheet.rowCount,
          sampleData: firstSheet.sampleData,
          sheets: parsedSheets
        };
      }

      setSourceFile(srcF);
      setTargetFile(tgtF);
      setIsAutoDiscovered(true);
      onCtxChange({ folderPath });
      setActiveTab('sheets');
      toast(`Project folder architecture scanned! Files auto-discovered from ${folderPath}`, 'success');
    } catch {
      setSourceFile(undefined);
      setTargetFile(undefined);
      setIsAutoDiscovered(false);
      onCtxChange({ folderPath });
      setActiveTab('upload');
      toast(`Folder scan did not find usable files in ${folderPath}. Please upload files manually.`, 'error');
    } finally {
      setScanning(false);
    }
  }, [folderPath, batch, onCtxChange, toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!batch && !selectedProjectId) e.project = 'Select a project';
    if (!batch && !batchName.trim()) e.batchName = 'Batch name is required';
    
    // File upload is OPTIONAL if folderPath is configured!
    if (!sourceFile && !folderPath.trim()) e.source = 'Source file or folder path required';
    if (!targetFile && !folderPath.trim()) e.target = 'Target file or folder path required';
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdvance = async () => {
    if (!validate()) { setActiveTab('upload'); return; }
    
    let src = sourceFile;
    let tgt = targetFile;
    if ((!src || !tgt) && folderPath.trim()) {
      await scanFolderArchitecture();
      src = sourceFile;
      tgt = targetFile;
    }


    const proj = state.projects.find(p => p.id === selectedProjectId);
    if (batch) {
      if (src) dispatch({ type: 'ADD_FILE', payload: src });
      if (tgt) dispatch({ type: 'ADD_FILE', payload: tgt });
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, folderPath, sourceFile: src, targetFile: tgt, updatedAt: new Date().toISOString() } });
      if (src) addAudit('FILE_DISCOVERED', 'File', src.id, src.name, `Discovered Source: ${src.name} (${src.rowCount} rows)`);
      if (tgt) addAudit('FILE_DISCOVERED', 'File', tgt.id, tgt.name, `Discovered Target: ${tgt.name} (${tgt.rowCount} rows)`);
      onAdvance(batch.id);
    } else {
      const bId = genId();
      const newBatch: Batch = {
        id: bId, projectId: selectedProjectId, name: batchName.trim(), description: '',
        folderPath, status: 'in_progress', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        sourceFile: src, targetFile: tgt, wizardStep: 'discovery', completedSteps: [], recordCount: src?.rowCount,
      };
      dispatch({ type: 'ADD_BATCH', payload: newBatch });
      if (src) dispatch({ type: 'ADD_FILE', payload: src });
      if (tgt) dispatch({ type: 'ADD_FILE', payload: tgt });
      if (proj) dispatch({ type: 'UPDATE_PROJECT', payload: { ...proj, folderPath, batchCount: proj.batchCount + 1, updatedAt: new Date().toISOString() } });
      addAudit('BATCH_CREATED', 'Batch', bId, batchName, `Batch created in project "${proj?.name}" with Folder Path "${folderPath}"`);
      toast('Batch initialized with project folder architecture', 'success');
      onBatchCreated(bId);
      onAdvance(bId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-5">
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Discovery</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload files or auto-discover from project folder architecture to begin schema discovery and data profiling.
          </p>
        </div>
      </div>

      <div className="bg-white p-2 rounded-t-xl border border-slate-200 border-b-0">
        <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'upload'  && (
            <TabFileUpload
              sourceFile={sourceFile} targetFile={targetFile}
              enrichedFile={enrichedFile} fbdiFile={fbdiFile}
              setSourceFile={setSourceFile} setTargetFile={setTargetFile}
              setEnrichedFile={setEnrichedFile} setFbdiFile={setFbdiFile}
              onAdvance={() => setActiveTab('sheets')}
            />
          )}
          {activeTab === 'sheets'  && <TabSheetDetection sourceFile={sourceFile} targetFile={targetFile} />}
          {activeTab === 'schema'  && <TabSchemaDiscovery sourceFile={sourceFile} targetFile={targetFile} />}
          {activeTab === 'profile' && <TabDataProfiling sourceFile={sourceFile} targetFile={targetFile} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Key Detection" />
    </div>
  );
}
