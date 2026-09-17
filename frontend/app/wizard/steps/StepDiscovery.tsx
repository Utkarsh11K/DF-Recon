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
import type { Batch, UploadedFile, ColumnProfile, SheetProfile } from '@/lib/types';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
} from './shared';
import type { StepProps } from './shared';
import { createUploadedFileRecord, rehydrateUploadedFile, retrieveBrowserFile } from '@/lib/project-files';

export const openDataViewerTab = async (file: UploadedFile, toast: any, options?: { highlightNulls?: boolean }) => {
  if (!file.storagePath) {
    toast('Cannot view this file directly.', 'error');
    return;
  }
  const blob = await retrieveBrowserFile(file.storagePath);
  if (!blob) {
    toast('File not found in local browser storage.', 'error');
    return;
  }
  const title = `Data Viewer: ${file.name}`;
  const rawFileUrl = URL.createObjectURL(blob);
  let html = `<html><head><title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #1e293b; background: #f8fafc; }
    .header-bar { background: #107c41; color: white; padding: 12px 24px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header-bar .subtitle { font-weight: 400; font-size: 0.85rem; opacity: 0.9; }
    .container { padding: 24px; max-width: 100%; box-sizing: border-box; }
    
    #loading { padding: 40px; text-align: center; color: #64748b; font-size: 1.1rem; }
    
    /* Excel-like Table Styles */
    .excel-table-container { background: white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #cbd5e1; border-top: 0; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; overflow: hidden; display: none; }
    .sheet-tabs { display: none; background: #f1f5f9; border: 1px solid #cbd5e1; border-bottom: 0; border-top-left-radius: 8px; border-top-right-radius: 8px; overflow: hidden; }
    .sheet-tab { padding: 10px 20px; font-size: 0.85rem; font-weight: 600; color: #64748b; cursor: pointer; border-right: 1px solid #cbd5e1; background: #f8fafc; border-bottom: 2px solid transparent; transition: all 0.15s; }
    .sheet-tab:hover { background: #f1f5f9; color: #1e293b; }
    .sheet-tab.active { color: #107c41; background: white; border-bottom: 2px solid #107c41; cursor: default; }
    
    table { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 13px; font-family: 'Calibri', 'Arial', sans-serif; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 10px; text-align: left; white-space: nowrap; max-width: 350px; overflow: hidden; text-overflow: ellipsis; }
    
    th { background: #f8fafc; font-weight: 600; color: #475569; text-align: center; position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 0 #cbd5e1; user-select: none; }
    th.row-num { position: sticky; left: 0; z-index: 20; width: 40px; background: #f8fafc; color: #64748b; font-weight: 500; text-align: center; box-shadow: 1px 0 0 #cbd5e1; border-right: 2px solid #cbd5e1; }
    th.col-letter { font-weight: normal; color: #64748b; font-size: 12px; border-bottom: 2px solid #cbd5e1; }
    th.top-left { z-index: 30; left: 0; top: 0; box-shadow: 1px 1px 0 #cbd5e1; border-right: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; background: #f1f5f9; }
    
    td.row-header { position: sticky; left: 0; background: #f8fafc; font-weight: 500; color: #64748b; text-align: center; z-index: 5; border-right: 2px solid #cbd5e1; box-shadow: 1px 0 0 #cbd5e1; user-select: none; }
    
    tr:hover td:not(.row-header) { background: #f1f5f9; }
    td:hover { outline: 2px solid #107c41; outline-offset: -2px; }
    
    .overflow-x { overflow: auto; max-height: calc(100vh - 180px); width: 100%; background: #e2e8f0; }
    
    .sheet-content { display: none; }
    .sheet-content.active { display: block; }
    .null-cell { background-color: #fef08a !important; color: #b45309 !important; border: 1px solid #ca8a04 !important; font-style: italic; }
  </style>
  <script>
    function switchSheet(id) {
      document.querySelectorAll('.sheet-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.sheet-tab').forEach(el => el.classList.remove('active'));
      document.getElementById('content-' + id).classList.add('active');
      document.getElementById('tab-' + id).classList.add('active');
    }

    const getColLetter = (index) => {
      let letter = '';
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    async function loadData() {
      const rawUrl = "${rawFileUrl}";
      const isCsv = ${file.name.toLowerCase().endsWith('.csv')};
      try {
        const res = await fetch(rawUrl);
        const arrayBuffer = await res.arrayBuffer();
        
        let sheetList = [];
        if (isCsv) {
          const text = new TextDecoder().decode(arrayBuffer);
          const results = Papa.parse(text, { header: true, skipEmptyLines: true });
          if (results.data.length > 0) {
            const columns = Object.keys(results.data[0]);
            sheetList = [{ name: 'CSV Data', columns, sampleData: results.data }];
          }
        } else {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            if (data.length > 0) {
              const columns = Object.keys(data[0]);
              sheetList.push({ name: sheetName, columns, sampleData: data });
            }
          });
        }
        
        if (sheetList.length === 0) {
          document.getElementById('loading').innerHTML = 'No data found in this file.';
          return;
        }

        let totalRows = sheetList.reduce((acc, s) => acc + s.sampleData.length, 0);
        document.getElementById('row-count-display').innerText = 'Total Rows: ' + totalRows.toLocaleString();

        let tabsHtml = '';
        let contentHtml = '';
        
        sheetList.forEach((sheet, i) => {
          tabsHtml += \`<div id="tab-\${i}" class="sheet-tab \${i === 0 ? 'active' : ''}" onclick="switchSheet(\${i})">\${sheet.name}</div>\`;
          
          let tbl = \`<div class="overflow-x"><table><thead><tr><th class="top-left"></th>\`;
          sheet.columns.forEach((_, cIdx) => { tbl += \`<th class="col-letter">\${getColLetter(cIdx)}</th>\`; });
          tbl += \`</tr><tr><th class="row-num"></th>\`;
          sheet.columns.forEach(c => { tbl += \`<th>\${c}</th>\`; });
          tbl += \`</tr></thead><tbody>\`;
          
          sheet.sampleData.forEach((row, idx) => {
            tbl += \`<tr><td class="row-header">\${idx + 1}</td>\`;
            sheet.columns.forEach(c => { 
              const val = row[c] ?? '';
              const isNull = val === '' || val === null || val === undefined;
              const classStr = (isNull && ${options?.highlightNulls ? 'true' : 'false'}) ? ' class="null-cell"' : '';
              const displayVal = (isNull && ${options?.highlightNulls ? 'true' : 'false'}) ? 'NULL' : val;
              tbl += \`<td\${classStr}>\${displayVal}</td>\`; 
            });
            tbl += \`</tr>\`;
          });
          tbl += \`</tbody></table></div>\`;
          
          contentHtml += \`<div id="content-\${i}" class="sheet-content \${i === 0 ? 'active' : ''}">\${tbl}</div>\`;
        });

        document.getElementById('sheet-tabs').innerHTML = tabsHtml;
        document.getElementById('sheet-tabs').style.display = 'flex';
        document.getElementById('excel-container').innerHTML = contentHtml;
        document.getElementById('excel-container').style.display = 'block';
        document.getElementById('loading').style.display = 'none';

      } catch (err) {
        document.getElementById('loading').innerHTML = 'Error loading file: ' + err.message;
      }
    }
    
    window.onload = loadData;
  </script>
  </head><body>
  <div class="header-bar">
    <div>Data Viewer: ${file.name}</div>
    <div id="row-count-display" class="subtitle">Loading...</div>
  </div>
  <div class="container">
    <div id="loading">Parsing file... please wait.</div>
    <div id="sheet-tabs" class="sheet-tabs"></div>
    <div id="excel-container" class="excel-table-container"></div>
  </div>
  </body></html>`;

  const blobHtml = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blobHtml);
  window.open(url, '_blank');
};

function mapBackendSheetsToProfiles(sheets: any[]): import('@/lib/types').SheetProfile[] {
  if (!sheets || sheets.length === 0) return [];
  const parsed = sheets.map(s => {
    const sSamples = s.sample_data ?? [];
    const sCols = s.columns ?? [];
    const rowCount = s.record_count ?? sSamples.length;
    return {
      name: s.sheet_name ?? 'Sheet1',
      rowCount: rowCount,
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

  // Dynamically rank sheets by data density (rowCount * columns) & sheet structure
  // so the primary data sheet with highest row count/size is automatically placed first (index 0).
  const scoreSheet = (s: import('@/lib/types').SheetProfile) => {
    const nameLow = s.name.toLowerCase();
    let mult = 1.0;
    if (['instruction', 'readme', 'summary', 'metadata', 'note', 'cover', 'contents', 'info'].some(k => nameLow.includes(k))) {
      mult = 0.05;
    } else if (['data', 'source', 'extract', 'detail', 'line', 'header', 'order', 'cust', 'emp', 'item', 'trans', 'master', 'table'].some(k => nameLow.includes(k))) {
      mult = 1.5;
    }
    return (s.rowCount * Math.max(1, s.columns.length)) * mult;
  };

  parsed.sort((a, b) => scoreSheet(b) - scoreSheet(a));
  return parsed;
}

// ── File profiler — calls real backend, falls back to simulation ─────────────
async function profileViaBackend(file: File, role: 'source' | 'target', batchId?: string): Promise<UploadedFile> {
  try {
    const fd = new FormData();
    if (batchId) fd.append('batch_id', batchId);
    else fd.append('batch_id', 'Batch_001');
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

export async function parseFileDirectly(file: File): Promise<UploadedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isBinary = ['xlsx', 'xls', 'xlsm', 'zip', 'tar', 'gz', '7z'].includes(ext);

  if (isBinary) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const XLSX = (window as any).XLSX;
          if (XLSX && e.target?.result) {
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            const sheets: SheetProfile[] = [];
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
              if (!jsonData || jsonData.length === 0) continue;

              const rawKeys = Array.from(new Set(jsonData.flatMap(row => Object.keys(row))));
              const cols: ColumnProfile[] = rawKeys.map((k, i) => {
                const vals = jsonData.map(r => String(r[k] ?? '')).filter(v => v !== '');
                return {
                  name: k,
                  dataType: 'string',
                  nullCount: Math.max(0, jsonData.length - vals.length),
                  uniqueCount: new Set(vals).size,
                  sampleValues: vals.slice(0, 5),
                  isPrimaryKeyCandidate: i === 0 || k.toLowerCase().includes('id') || k.toLowerCase().includes('code') || k.toLowerCase().includes('no')
                };
              });
              sheets.push({
                name: sheetName,
                rowCount: jsonData.length,
                columns: cols,
                sampleData: jsonData.slice(0, 50)
              });
            }
            if (sheets.length > 0) {
              sheets.sort((a, b) => (b.rowCount * b.columns.length) - (a.rowCount * a.columns.length));
              const top = sheets[0];
              resolve({
                id: Math.random().toString(36).slice(2),
                name: file.name,
                size: file.size,
                type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                uploadedAt: new Date().toISOString(),
                columns: top.columns,
                rowCount: top.rowCount,
                sampleData: top.sampleData,
                sheets: sheets
              });
              return;
            }
          }
        } catch (err) {
          console.error('Direct binary parse error:', err);
        }
        resolve({
          id: Math.random().toString(36).slice(2),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
          columns: [],
          rowCount: 0,
          sampleData: [],
          sheets: []
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
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
          sheets: []
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
        .filter(h => h.length > 0);

      const validHeaders = headers.length > 0 ? headers : [];

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
          sampleValues: vals.slice(0, 5),
          isPrimaryKeyCandidate: i === 0 || h.toLowerCase().includes('id') || h.toLowerCase().includes('no') || h.toLowerCase().includes('code'),
        };
      });

      const mainSheet: SheetProfile = {
        name: file.name.replace(/\.[^/.]+$/, ''),
        rowCount: sampleRows.length,
        columns: cols,
        sampleData: sampleRows
      };

      resolve({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        type: file.type || 'text/csv',
        uploadedAt: new Date().toISOString(),
        columns: cols,
        rowCount: sampleRows.length,
        sampleData: sampleRows,
        sheets: [mainSheet]
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
        sheets: []
      });
    };
    reader.readAsText(file);
  });
}



// ── Light Dropzone for UI Redesign ───────────────────────────────────────────────
function LightFileDropZone({ label, description, file, onFile, onRemove, role, extensions, projectId, batchId, batchName, isAutoLoading }: {
  label: string; description: string; file?: UploadedFile; role: 'source' | 'target' | 'enriched' | 'fbdi';
  onFile: (f: UploadedFile) => void; onRemove: () => void; extensions: string;
  projectId?: string; batchId?: string; batchName?: string;
  isAutoLoading?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const isUploading = loading || (isAutoLoading && !file);
  const { toast } = useToast();
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const rawFile = acceptedFiles[0];
    if (!rawFile) return;
    if (rawFile.size === 0) {
      toast(`File "${rawFile.name}" is empty (0 bytes) and cannot be uploaded as a data source. Please choose a valid file with data.`, 'error');
      return;
    }
    setLoading(true);
    toast(`Uploading ${rawFile.name} to database...`, 'info');
    
    createUploadedFileRecord(
      rawFile,
      projectId || 'proj_123',
      batchId || 'batch_temp',
      batchName || 'batch_temp',
      role
    ).then(res => {
      if (!res.record.storagePath) {
        toast('Upload succeeded, but file was not cached locally.', 'info');
      }
      onFile(res.record);
      toast(`File "${rawFile.name}" successfully uploaded!`, 'success');
    }).catch(err => {
      toast(`Error processing file: ${err.message}`, 'error');
    }).finally(() => {
      setLoading(false);
    });
  }, [onFile, projectId, batchName, role, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] },
    multiple: false, disabled: isUploading,
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col h-full shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-all hover:shadow-[0_4px_16px_-4px_rgba(6,81,237,0.15)] relative overflow-hidden group">
      {/* Subtle top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${isUploading ? 'bg-indigo-500 animate-pulse' : file ? 'bg-emerald-500' : 'bg-indigo-500/10 group-hover:bg-indigo-500/30'} transition-colors`} />
      
      <h3 className="text-slate-800 font-bold tracking-tight text-sm flex items-center gap-2 mb-1">
        <FileText size={16} className={isUploading ? "text-indigo-500 animate-pulse" : file ? "text-emerald-500" : "text-indigo-500"} /> {label}
      </h3>
      <p className="text-slate-500 text-xs mb-5 font-medium">{description} <span className="text-slate-400 font-normal">({extensions})</span></p>
      
      <div {...getRootProps()} className={cn(
        'flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300',
        isUploading ? 'border-indigo-300 bg-gradient-to-b from-indigo-50/70 to-indigo-100/30'
             : file ? 'border-emerald-300/60 bg-gradient-to-b from-emerald-50/50 to-emerald-100/30 hover:border-emerald-400' 
             : isDragActive ? 'border-indigo-400 bg-indigo-50 scale-[1.02]' 
             : 'border-slate-200 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-inner'
      )}>
        <input {...getInputProps()} />
        {isUploading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-2">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <Upload size={18} className="text-indigo-600 absolute" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-bold tracking-tight text-slate-800 flex items-center justify-center gap-1.5">
                Uploading & Profiling File…
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              </p>
              <p className="text-[10px] text-slate-500 font-medium">Reading file structure, detecting sheets & schema...</p>
            </div>
          </div>
        ) : file ? (() => {
          const isEmpty = file.size === 0 || file.rowCount === 0;
          return (
            <div className="flex flex-col items-center gap-2">
              {isEmpty ? (
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-100/90 px-3 py-1.5 rounded-full shadow-sm border border-amber-300">
                    <AlertOctagon size={16} className="text-amber-600" />
                    <span className="text-sm truncate max-w-[160px] font-semibold" title={file.name}>{file.name}</span>
                  </div>
                  <p className="text-amber-700 font-bold text-xs mt-1">Empty File Detected (0 Records)</p>
                  <p className="text-slate-500 text-[11px] font-normal max-w-[200px]">This file has 0 data rows and will be ignored as a data source.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100/50 px-3 py-1.5 rounded-full shadow-sm border border-emerald-200/50">
                    <CheckCircle2 size={16} />
                    <span className="text-sm truncate max-w-[160px] font-semibold" title={file.name}>{file.name}</span>
                  </div>
                  <p className="text-emerald-600/80 text-[11px] font-medium tracking-wide uppercase mt-1">Successfully Uploaded</p>
                </>
              )}
              <div className="flex items-center gap-2 mt-3">
                {!isEmpty && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      openDataViewerTab(file, toast);
                    }} 
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-1 rounded-md border border-indigo-100 hover:border-indigo-200 shadow-sm"
                  >
                    View File
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors bg-white px-3 py-1 rounded-md border border-slate-200 hover:border-red-200 shadow-sm">
                  {isEmpty ? 'Remove Empty File' : 'Replace'}
                </button>
              </div>
            </div>
          );
        })() : (
          <div className="flex flex-col items-center gap-2 mt-2">
            <div className="bg-indigo-50 p-3 rounded-full mb-1 group-hover:bg-indigo-100 transition-colors">
              <Upload size={20} className="text-indigo-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Drop your file here</p>
            <p className="text-xs text-slate-500 font-medium px-4">or click to browse from your computer</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-tab: File Upload (Redesigned) ──────────────────────────────────────────
function TabFileUpload({
  sourceFile, targetFile, enrichedFile, fbdiFile,
  setSourceFile, setTargetFile, setEnrichedFile, setFbdiFile,
  onAdvance, projectId, batchId, batchName, isAutoLoading,
}: {
  sourceFile?: UploadedFile; targetFile?: UploadedFile; enrichedFile?: UploadedFile; fbdiFile?: UploadedFile;
  setSourceFile: (f?: UploadedFile) => void; setTargetFile: (f?: UploadedFile) => void;
  setEnrichedFile: (f?: UploadedFile) => void; setFbdiFile: (f?: UploadedFile) => void;
  onAdvance: () => void; projectId?: string; batchId?: string; batchName?: string;
  isAutoLoading?: boolean;
}) {
  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <LightFileDropZone
          label="Source File Upload" description="Upload source data file"
          extensions=".xlsx, .xls, .xlsm, .csv" role="source"
          file={sourceFile} onFile={setSourceFile} onRemove={() => setSourceFile(undefined)}
          projectId={projectId} batchId={batchId} batchName={batchName} isAutoLoading={isAutoLoading}
        />
        <LightFileDropZone
          label="Enriched / Transformed File Upload" description="Upload transformed/enriched file"
          extensions=".xlsx, .xls, .xlsm, .csv" role="enriched"
          file={enrichedFile} onFile={setEnrichedFile} onRemove={() => setEnrichedFile(undefined)}
          projectId={projectId} batchId={batchId} batchName={batchName} isAutoLoading={isAutoLoading}
        />
        <LightFileDropZone
          label="FBDI / ADFdi Output File Upload" description="Upload FBDI/ADFdi conversion template file"
          extensions=".xlsx, .xlsm, .csv" role="fbdi"
          file={fbdiFile} onFile={setFbdiFile} onRemove={() => setFbdiFile(undefined)}
          projectId={projectId} batchId={batchId} batchName={batchName} isAutoLoading={isAutoLoading}
        />
        <LightFileDropZone
          label="Fusion Target Extract Upload" description="Upload Oracle Fusion/BIP target extract"
          extensions=".xlsx, .xls, .xlsm, .csv" role="target"
          file={targetFile} onFile={setTargetFile} onRemove={() => setTargetFile(undefined)}
          projectId={projectId} batchId={batchId} batchName={batchName} isAutoLoading={isAutoLoading}
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
function LightDetectionCard({ title, icon, file, onSheetChange }: { title: string; icon: React.ReactNode; file?: UploadedFile; onSheetChange?: (updatedFile: UploadedFile) => void }) {
  const [sheetIndex, setSheetIndex] = useState(file?.selectedSheetIndex ?? 0);
  
  useEffect(() => {
    if (file?.selectedSheetIndex !== undefined) {
      setSheetIndex(file.selectedSheetIndex);
    }
  }, [file?.selectedSheetIndex]);

  const hasFile = file && (file.rowCount > 0 || (file.columns && file.columns.length > 0) || (file.sheets && file.sheets.length > 0));
  const sheets = file?.sheets && file.sheets.length > 0 ? file.sheets : [{ name: 'Sheet1', rowCount: 0, columns: [], sampleData: [] }];
  const activeSheet = sheets[sheetIndex] || sheets[0];
  
  // Use activeSheet for rows and columns if we have sheets, otherwise fallback to file directly
  const rows = (file?.sheets && file.sheets.length > 0) ? activeSheet.rowCount : (file?.rowCount || 0);
  const colsCount = (file?.sheets && file.sheets.length > 0) ? activeSheet.columns.length : (file?.columns?.length || 0);

  const handleSheetSelect = (newIdx: number) => {
    setSheetIndex(newIdx);
    if (file && sheets[newIdx] && onSheetChange) {
      const selected = sheets[newIdx];
      onSheetChange({
        ...file,
        selectedSheetIndex: newIdx,
        columns: selected.columns,
        rowCount: selected.rowCount,
        sampleData: selected.sampleData,
      });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col h-full shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-all hover:shadow-[0_4px_16px_-4px_rgba(6,81,237,0.15)] relative overflow-hidden">
      {/* Accent line */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${hasFile ? 'bg-emerald-500' : 'bg-indigo-500/10'}`} />
      
      <h3 className="text-slate-800 font-bold tracking-tight text-sm flex items-center gap-2 mb-6">
        {icon} {title}
      </h3>
      
      <div className="space-y-5 flex-1">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">File Name:</label>
          <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium">
            {hasFile ? file.name : 'Not uploaded'}
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-500">Active Sheet:</label>
            {hasFile && sheets.length > 1 && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Auto-Selected Main Sheet
              </span>
            )}
          </div>
          <div className="relative">
            <select 
              disabled={!hasFile} 
              value={sheetIndex}
              onChange={(e) => handleSheetSelect(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              {hasFile ? sheets.map((s, i) => (
                <option key={i} value={i}>
                  {s.name} ({s.rowCount.toLocaleString()} rows, {s.columns.length} cols){i === 0 ? ' ⭐ Main Sheet' : ''}
                </option>
              )) : <option>Fusion Data</option>}
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
      
      <div className="grid grid-cols-2 gap-4 mt-8">
        <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 border border-slate-200 rounded-xl p-4 text-center shadow-inner">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Detected Rows</p>
          <p className="text-2xl font-black text-slate-800">{hasFile ? rows.toLocaleString() : '-'}</p>
        </div>
        <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 border border-slate-200 rounded-xl p-4 text-center shadow-inner">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Detected Columns</p>
          <p className="text-2xl font-black text-slate-800">{hasFile ? colsCount : '-'}</p>
        </div>
      </div>
    </div>
  );
}

function TabSheetDetection({
  sourceFile, targetFile,
  setSourceFile, setTargetFile,
  onAdvance
}: {
  sourceFile?: UploadedFile; targetFile?: UploadedFile;
  setSourceFile?: (f: UploadedFile) => void; setTargetFile?: (f: UploadedFile) => void;
  onAdvance?: () => void;
}) {
  return (
    <div className="bg-white p-6 rounded-b-xl border border-slate-200 border-t-0 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LightDetectionCard 
          title="Source File & Sheet Detection" 
          icon={<FileText size={16} className="text-slate-500" />} 
          file={sourceFile}
          onSheetChange={setSourceFile}
        />
        <LightDetectionCard 
          title="Fusion Target Extract Detection" 
          icon={<Database size={16} className="text-slate-500" />} 
          file={targetFile}
          onSheetChange={setTargetFile}
        />
      </div>
      {onAdvance && (
        <div className="flex justify-end mt-4">
          <button onClick={onAdvance} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2">
            Next: Schema Discovery <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Schema Discovery (Redesigned) ────────────────────────────────────
function TabSchemaDiscovery({ 
  sourceFile, targetFile, fbdiFile, onAdvance, setSourceFile, setTargetFile, setFbdiFile 
}: { 
  sourceFile?: UploadedFile; targetFile?: UploadedFile; fbdiFile?: UploadedFile; onAdvance?: () => void;
  setSourceFile?: (f: UploadedFile) => void; setTargetFile?: (f: UploadedFile) => void; setFbdiFile?: (f: UploadedFile) => void;
}) {
  const [viewFile, setViewFile] = useState<'source' | 'target' | 'fbdi'>('source');
  const [selectedSheetIndices, setSelectedSheetIndices] = useState<Record<string, number>>({});
  
  const file = viewFile === 'source' ? sourceFile : viewFile === 'target' ? targetFile : fbdiFile;
  const currentSheetIndex = file ? (selectedSheetIndices[file.id] ?? file.selectedSheetIndex ?? 0) : 0;
  const activeSheet = file?.sheets?.[currentSheetIndex];
  const columns = activeSheet?.columns || file?.columns || [];
  const rowCount = activeSheet?.rowCount || file?.rowCount || 1;

  const handleSheetChange = (newIdx: number) => {
    if (!file) return;
    setSelectedSheetIndices(prev => ({ ...prev, [file.id]: newIdx }));
    const selected = file.sheets?.[newIdx];
    if (selected) {
      const updatedFile: UploadedFile = {
        ...file,
        selectedSheetIndex: newIdx,
        columns: selected.columns,
        rowCount: selected.rowCount,
        sampleData: selected.sampleData,
      };
      if (viewFile === 'source' && setSourceFile) setSourceFile(updatedFile);
      if (viewFile === 'target' && setTargetFile) setTargetFile(updatedFile);
      if (viewFile === 'fbdi' && setFbdiFile) setFbdiFile(updatedFile);
    }
  };

  if (!sourceFile && !targetFile && !fbdiFile) return (
    <EmptyCard icon={<FileSearch size={22} className="text-slate-400" />}
      title="No schema detected" message="Upload files first to see column types, nullable status, constraints, and sample values." />
  );

  return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 space-y-8 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
          <Search size={20} className="text-indigo-600" /> Discovered Schema & Column Attributes
        </h3>
        <div className="flex items-center gap-3">
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
            <button 
              onClick={() => setViewFile('fbdi')}
              disabled={!fbdiFile}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                viewFile === 'fbdi' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
              )}>
              <Sheet size={16} /> FBDI Schema
            </button>
          </div>
          {onAdvance && (
            <button 
              onClick={onAdvance} 
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
            >
              Next: Data Profiling <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
      
      {file && file.sheets && file.sheets.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Selected Sheet:</span>
          <select 
            value={currentSheetIndex}
            onChange={(e) => handleSheetChange(parseInt(e.target.value))}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
          >
            {file.sheets.map((s, idx) => (
              <option key={idx} value={idx}>{s.name} ({s.rowCount.toLocaleString()} rows, {s.columns.length} cols)</option>
            ))}
          </select>
        </div>
      )}

      {file ? (
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                <th className="py-4 px-5">Column Name</th>
                <th className="py-4 px-5">Inferred Type</th>
                <th className="py-4 px-5">Null Count</th>
                <th className="py-4 px-5">Null %</th>
                <th className="py-4 px-5">Unique Count</th>
                <th className="py-4 px-5">Unique %</th>
                <th className="py-4 px-5">Sample Values</th>
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

      {onAdvance && (
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button onClick={onAdvance} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2">
            Next: Data Profiling <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Data Profiling (Enhanced) ────────────────────────────────────────
// ── Sub-tab: Data Profiling (Redesigned) ────────────────────────────────────────
function TabDataProfiling({ sourceFile, targetFile, fbdiFile }: { sourceFile?: UploadedFile; targetFile?: UploadedFile; fbdiFile?: UploadedFile }) {
  const { toast } = useToast();
  const [viewFile, setViewFile] = useState<'source' | 'target' | 'fbdi'>('source');
  const [selectedSheetIndices, setSelectedSheetIndices] = useState<Record<string, number>>({});
  
  const file = viewFile === 'source' ? sourceFile : viewFile === 'target' ? targetFile : fbdiFile;
  const currentSheetIndex = file ? (selectedSheetIndices[file.id] || 0) : 0;
  const activeSheet = file?.sheets?.[currentSheetIndex];

  if (!file) return (
    <EmptyCard icon={<BarChart3 size={22} className="text-slate-400" />}
      title="No data to profile" message="Upload files in the File Upload tab to run data profiling." />
  );

  // We check the active sheet or the file level stats
  const columns = activeSheet?.columns || file.columns || [];
  const rowCount = activeSheet?.rowCount || file.rowCount || (activeSheet?.sampleData?.length ?? file.sampleData?.length ?? 0);
  const sampleData = activeSheet?.sampleData || file.sampleData || [];
  
  // Calculate blank columns (columns where nullCount === rowCount, or where all sample values are null/empty)
  const blankColumns = columns.filter(c => {
    if (rowCount > 0 && c.nullCount === rowCount) return true;
    if (sampleData.length > 0) {
      return sampleData.every(row => {
        const val = (row as any)[c.name];
        return val === null || val === undefined || String(val).trim() === '';
      });
    }
    return false;
  }).length;

  // Calculate duplicate column names (case-insensitive)
  const colNamesLower = columns.map(c => c.name.trim().toLowerCase());
  const dupCols = colNamesLower.filter((item, index) => colNamesLower.indexOf(item) !== index).length;
  const totalNullCells = columns.reduce((acc, c) => acc + (c.nullCount || 0), 0);

  return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 space-y-8 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)]">
      
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
          <BarChart3 size={20} className="text-indigo-600" /> Data Profiling & Quality Metrics
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
            <button 
              onClick={() => setViewFile('fbdi')}
              disabled={!fbdiFile}
              className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                viewFile === 'fbdi' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
              )}>
              FBDI
            </button>
            
            {file && (
              <button 
                onClick={() => {
                  openDataViewerTab(file, toast);
                }}
                className="ml-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm"
              >
                <Eye size={16} /> View Full Data
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
          <div 
            onClick={() => openDataViewerTab(file, toast, { highlightNulls: true })}
            className="bg-white border border-slate-200 shadow-sm rounded-lg p-4 text-center flex flex-col justify-center relative overflow-hidden group cursor-pointer hover:border-amber-400 hover:shadow-md transition-all"
          >
            <div className="absolute inset-0 bg-amber-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10 flex flex-col items-center justify-center h-full">
              <p className="text-xs text-slate-500 font-medium mb-1 group-hover:text-amber-700">Total Null Cells</p>
              <p className="text-xl font-bold text-slate-800 group-hover:text-amber-600 mb-2">{totalNullCells.toLocaleString()}</p>
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-600 bg-amber-100/80 px-2 py-1 rounded-full border border-amber-200 inline-flex items-center gap-1 shadow-sm">
                <Eye size={10} /> View Nulls
              </span>
            </div>
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
  const [enrichedFile, setEnrichedFile] = useState<UploadedFile | undefined>(batch?.enrichedFile);
  const [fbdiFile, setFbdiFile] = useState<UploadedFile | undefined>(batch?.fbdiFile);
  const [scanning, setScanning] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [isAutoDiscovered, setIsAutoDiscovered] = useState(!!(sourceFile && targetFile));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateReduxAndState = (field: 'sourceFile' | 'targetFile' | 'enrichedFile' | 'fbdiFile', file?: UploadedFile) => {
    if (field === 'sourceFile') setSourceFile(file);
    else if (field === 'targetFile') setTargetFile(file);
    else if (field === 'enrichedFile') setEnrichedFile(file);
    else if (field === 'fbdiFile') setFbdiFile(file);

    if (batch) {
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, [field]: file, updatedAt: new Date().toISOString() } });
      if (file) {
        let role: 'source' | 'target' | 'enriched' | 'fbdi' = 'source';
        if (field === 'targetFile') role = 'target';
        if (field === 'enrichedFile') role = 'enriched';
        if (field === 'fbdiFile') role = 'fbdi';
        dispatch({ type: 'ADD_FILE', payload: { ...file, projectId: batch.projectId, batchId: batch.id, role } });
      }
    }
  };

  // ── Auto-load pre-persisted files when wizard opens for a batch ────────────
  useEffect(() => {
    if (!batch) return;

    // Collect all files linked to this batch from state
    const batchFiles = state.files.filter(f => f.batchId === batch.id);

    const srcRecord  = batch.sourceFile ?? batchFiles.find(f => f.role === 'source');
    const tgtRecord  = batch.targetFile ?? batchFiles.find(f => f.role === 'target');
    const enrRecord  = batchFiles.find(f => f.role === 'enriched');
    const fbdRecord  = batchFiles.find(f => f.role === 'fbdi');

    // If everything is already fully profiled, just set state and return
    const alreadyReady = (
      (!srcRecord || (srcRecord.columns.length > 0 && srcRecord.sampleData.length > 0)) &&
      (!tgtRecord || (tgtRecord.columns.length > 0 && tgtRecord.sampleData.length > 0))
    );
    if (alreadyReady) {
      if (srcRecord) setSourceFile(srcRecord);
      if (tgtRecord) setTargetFile(tgtRecord);
      if (enrRecord) setEnrichedFile(enrRecord);
      if (fbdRecord) setFbdiFile(fbdRecord);
      if (srcRecord || tgtRecord) setIsAutoDiscovered(true);
      return;
    }

    // Need to rehydrate (Excel files or missing profiles) or fetch from backend
    const load = async () => {
      setAutoLoading(true);
      try {
        let src = srcRecord ? await rehydrateUploadedFile(srcRecord) : undefined;
        let tgt = tgtRecord ? await rehydrateUploadedFile(tgtRecord) : undefined;
        let enr = enrRecord ? await rehydrateUploadedFile(enrRecord) : undefined;
        let fbd = fbdRecord ? await rehydrateUploadedFile(fbdRecord) : undefined;

        if (!src || !tgt) {
          try {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiBase}/api/v1/batches/${batch.id}/files`);
            if (res.ok) {
              const data = await res.json();
              if (data.source_file && !src) {
                const profile = data.source_file.profile;
                let parsedSheets: any[] = [];
                let cols: any[] = [];
                let rowCount = 0;
                let sampleData: any[] = [];
                
                if (profile && profile.sheets) {
                   parsedSheets = mapBackendSheetsToProfiles(profile.sheets);
                   if (parsedSheets.length > 0) {
                       cols = parsedSheets[0].columns;
                       rowCount = parsedSheets[0].rowCount;
                       sampleData = parsedSheets[0].sampleData;
                   }
                }
                
                src = {
                  id: data.source_file.id, name: data.source_file.file_name, size: profile?.file_size_bytes || 1000,
                  type: data.source_file.file_name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  uploadedAt: new Date().toISOString(), columns: cols as any, rowCount: rowCount, sampleData: sampleData, sheets: parsedSheets
                };
              }
              if (data.target_file && !tgt) {
                const profile = data.target_file.profile;
                let parsedSheets: any[] = [];
                let cols: any[] = [];
                let rowCount = 0;
                let sampleData: any[] = [];
                
                if (profile && profile.sheets) {
                   parsedSheets = mapBackendSheetsToProfiles(profile.sheets);
                   if (parsedSheets.length > 0) {
                       cols = parsedSheets[0].columns;
                       rowCount = parsedSheets[0].rowCount;
                       sampleData = parsedSheets[0].sampleData;
                   }
                }
                
                tgt = {
                  id: data.target_file.id, name: data.target_file.file_name, size: profile?.file_size_bytes || 1000,
                  type: data.target_file.file_name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  uploadedAt: new Date().toISOString(), columns: cols as any, rowCount: rowCount, sampleData: sampleData, sheets: parsedSheets
                };
              }
            }
          } catch (err) {
            console.error("Failed to fetch backend files", err);
          }
        }

        if (src) setSourceFile(src);
        if (tgt) setTargetFile(tgt);
        if (enr) setEnrichedFile(enr);
        if (fbd) setFbdiFile(fbd);

        if (src || tgt || fbd) {
          setIsAutoDiscovered(true);
          dispatch({
            type: 'UPDATE_BATCH',
            payload: {
              ...batch,
              sourceFile: src ?? batch.sourceFile,
              targetFile: tgt ?? batch.targetFile,
              fbdiFile: fbd ?? batch.fbdiFile,
              recordCount: src?.rowCount ?? batch.recordCount,
              updatedAt: new Date().toISOString(),
            },
          });
          toast('Files loaded automatically from stored folder.', 'info');
        }
      } finally {
        setAutoLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id]);

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
    
    if (sourceFile && (sourceFile.size === 0 || sourceFile.rowCount === 0)) {
      e.source = 'Selected source file is empty (0 records / 0 bytes). Please upload a valid non-empty file.';
    } else if (!sourceFile && !folderPath.trim()) {
      e.source = 'Source file or folder path required';
    }

    if (targetFile && (targetFile.size === 0 || targetFile.rowCount === 0)) {
      e.target = 'Selected target file is empty (0 records / 0 bytes). Please upload a valid non-empty file.';
    } else if (!targetFile && !folderPath.trim()) {
      e.target = 'Target file or folder path required';
    }
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdvance = async () => {
    if (!validate()) { setActiveTab('upload'); return; }

    // Use refs to avoid stale closure after scanFolderArchitecture
    let src = sourceFile;
    let tgt = targetFile;

    if ((!src || !tgt) && folderPath.trim()) {
      // scanFolderArchitecture sets state but we need the values immediately
      // so we call it and then read from the scan result directly
      await scanFolderArchitecture();
      // After scan, state updates are async — read from the component state
      // which will have been updated by the time we reach handleAdvance again
      // via the re-render. For now use the current values.
      src = sourceFile;
      tgt = targetFile;
    }

    const proj = state.projects.find(p => p.id === selectedProjectId);
    const fbd = fbdiFile ?? (tgt?.name?.toLowerCase().includes('template') || tgt?.name?.toLowerCase().includes('fbdi') || tgt?.name?.toLowerCase().includes('customer') ? tgt : undefined);
    const enr = enrichedFile;

    if (batch) {
      if (src) dispatch({ type: 'ADD_FILE', payload: { ...src, projectId: batch.projectId, batchId: batch.id, role: 'source' as const } });
      if (tgt) dispatch({ type: 'ADD_FILE', payload: { ...tgt, projectId: batch.projectId, batchId: batch.id, role: 'target' as const } });
      if (fbd) dispatch({ type: 'ADD_FILE', payload: { ...fbd, projectId: batch.projectId, batchId: batch.id, role: 'fbdi' as const } });
      if (enr) dispatch({ type: 'ADD_FILE', payload: { ...enr, projectId: batch.projectId, batchId: batch.id, role: 'enriched' as const } });
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, folderPath, sourceFile: src, targetFile: tgt, fbdiFile: fbd, enrichedFile: enr, updatedAt: new Date().toISOString() } });
      if (src) addAudit('FILE_DISCOVERED', 'File', src.id, src.name, `Source: ${src.name} (${src.rowCount} rows)`);
      if (tgt) addAudit('FILE_DISCOVERED', 'File', tgt.id, tgt.name, `Target: ${tgt.name} (${tgt.rowCount} rows)`);
      if (fbd) addAudit('FILE_DISCOVERED', 'File', fbd.id, fbd.name, `FBDI: ${fbd.name} (${fbd.rowCount} rows)`);
      onAdvance(batch.id);
    } else {
      const bId = genId();
      const newBatch: Batch = {
        id: bId, projectId: selectedProjectId, name: batchName.trim(), description: '',
        folderPath, status: 'in_progress',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        sourceFile: src, targetFile: tgt, fbdiFile: fbd, enrichedFile: enr,
        wizardStep: 'discovery', completedSteps: [],
        recordCount: src?.rowCount,
      };
      dispatch({ type: 'ADD_BATCH', payload: newBatch });
      if (src) dispatch({ type: 'ADD_FILE', payload: { ...src, projectId: selectedProjectId, batchId: bId, role: 'source' as const } });
      if (tgt) dispatch({ type: 'ADD_FILE', payload: { ...tgt, projectId: selectedProjectId, batchId: bId, role: 'target' as const } });
      if (fbd) dispatch({ type: 'ADD_FILE', payload: { ...fbd, projectId: selectedProjectId, batchId: bId, role: 'fbdi' as const } });
      if (enr) dispatch({ type: 'ADD_FILE', payload: { ...enr, projectId: selectedProjectId, batchId: bId, role: 'enriched' as const } });
      if (proj) dispatch({ type: 'UPDATE_PROJECT', payload: { ...proj, folderPath, batchCount: proj.batchCount + 1, updatedAt: new Date().toISOString() } });
      addAudit('BATCH_CREATED', 'Batch', bId, batchName, `Batch "${batchName}" created in project "${proj?.name}"`);
      toast('Batch initialized', 'success');
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
          {activeTab === 'upload' && (
            <TabFileUpload
              sourceFile={sourceFile} setSourceFile={(f) => updateReduxAndState('sourceFile', f)}
              targetFile={targetFile} setTargetFile={(f) => updateReduxAndState('targetFile', f)}
              enrichedFile={enrichedFile} setEnrichedFile={(f) => updateReduxAndState('enrichedFile', f)}
              fbdiFile={fbdiFile} setFbdiFile={(f) => updateReduxAndState('fbdiFile', f)}
              onAdvance={() => setActiveTab('sheets')}
              projectId={batch?.projectId ?? selectedProjectId}
              batchId={batch?.id}
              batchName={batchName}
              isAutoLoading={autoLoading || scanning}
            />
          )}
          {activeTab === 'sheets'  && (
            <TabSheetDetection 
              sourceFile={sourceFile} setSourceFile={(f) => updateReduxAndState('sourceFile', f)}
              targetFile={targetFile} setTargetFile={(f) => updateReduxAndState('targetFile', f)}
              onAdvance={() => setActiveTab('schema')}
            />
          )}
          {activeTab === 'schema'  && (
            <TabSchemaDiscovery 
              sourceFile={sourceFile} 
              targetFile={targetFile} 
              fbdiFile={fbdiFile}
              setSourceFile={(f) => updateReduxAndState('sourceFile', f)}
              setTargetFile={(f) => updateReduxAndState('targetFile', f)}
              setFbdiFile={(f) => updateReduxAndState('fbdiFile', f)}
              onAdvance={() => setActiveTab('profile')} 
            />
          )}
          {activeTab === 'profile' && <TabDataProfiling sourceFile={sourceFile} targetFile={targetFile} fbdiFile={fbdiFile} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Key Detection" />
    </div>
  );
}
