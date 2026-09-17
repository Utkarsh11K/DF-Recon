'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitMerge,
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Key,
  Columns,
  Layers,
  Eye,
  X,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

interface MergeResult {
  status: string;
  source_file: string;
  fbdi_file: string;
  source_key: string;
  fbdi_key: string;
  total_source: number;
  total_fbdi: number;
  total_merged: number;
  match_count: number;
  mismatch_count: number;
  missing_count: number;
  missing_columns: string[];
  columns?: string[];
  records: Record<string, any>[];
  download_url: string;
}

interface MergeSourceFbdiModalProps {
  open: boolean;
  onClose: () => void;
  defaultSourceKey?: string;
  defaultTargetKey?: string;
}

export function MergeSourceFbdiModal({
  open,
  onClose,
  defaultSourceKey = 'Customer Name',
  defaultTargetKey = '*Customer Name',
}: MergeSourceFbdiModalProps) {
  const { toast } = useToast();

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fbdiFile, setFbdiFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected row for detail inspection
  const [selectedRecord, setSelectedRecord] = useState<Record<string, any> | null>(null);

  // Results View States
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCH' | 'MISMATCH' | 'MISSING'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMissingCols, setShowMissingCols] = useState(false);

  const getApiBase = () => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return `http://${host}:8000`;
      }
    }
    return process.env.NEXT_PUBLIC_API_URL || '';
  };

  const handleRunMerge = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      if (sourceFile) {
        formData.append('source_file', sourceFile);
      }
      if (fbdiFile) {
        formData.append('fbdi_file', fbdiFile);
      }

      const apiBase = getApiBase();
      let res: Response | null = null;

      // 1. Try direct backend call first
      if (apiBase) {
        try {
          res = await fetch(`${apiBase}/api/v1/source-fbdi/merge`, {
            method: 'POST',
            body: formData,
          });
        } catch (directErr) {
          console.warn('Direct backend call failed, trying Next.js fallback:', directErr);
          res = null;
        }
      }

      // 2. Fallback to Next.js route handler
      if (!res || !res.ok) {
        res = await fetch('/api/v1/source-fbdi/merge', {
          method: 'POST',
          body: formData,
        });
      }

      if (!res.ok) {
        let detailMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          detailMsg = errData.detail || detailMsg;
        } catch {
          const text = await res.text();
          if (text) detailMsg = text;
        }
        throw new Error(detailMsg);
      }

      const data: MergeResult = await res.json();
      setResult(data);
      toast('Source & FBDI merged successfully!', 'success');
    } catch (err: any) {
      console.error('Merge error:', err);
      const message = err.message || 'Error occurred while running merge';
      setErrorMsg(message);
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const apiBase = getApiBase();
    const downloadUrl = apiBase ? `${apiBase}/api/v1/source-fbdi/download` : '/api/v1/source-fbdi/download';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'merged_source_fbdi.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Downloading merged_source_fbdi.xlsx...', 'info');
  };

  const metaCols = new Set(['Reconciliation_Status', 'Mismatch_Details', 'Mismatched_Field_Count']);

  const allColumns: string[] = result?.columns ?? (
    result?.records && result.records.length > 0
      ? Object.keys(result.records[0])
      : []
  );

  const dataColumns = allColumns.filter((c) => !metaCols.has(c));

  const filteredRecords = (result?.records ?? []).filter((r) => {
    const status = String(r.Reconciliation_Status ?? '').toUpperCase();
    if (statusFilter !== 'ALL' && status !== statusFilter) return false;

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return Object.values(r).some(
      (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q)
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Merge Source & FBDI (Reconciliation)"
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500">
            {result ? (
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <CheckCircle2 size={13} className="text-emerald-500" />
                Merge complete • {result.total_merged.toLocaleString()} records processed
              </span>
            ) : (
              <span>Ready to run deterministic Left Join on Customer Name</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            {result && (
              <Button
                variant="primary"
                size="sm"
                icon={<Download size={14} />}
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                Download Merged Result (.xlsx)
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6 py-2">
        {/* Top Info Banner with Primary Key Detection Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
              <GitMerge size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-800">Deterministic Left Join</span>
                <Badge variant="outline" className="font-mono text-xs bg-white text-indigo-700 border-indigo-200">
                  <Key size={11} className="mr-1 inline text-indigo-500" />
                  Source PK: {result ? result.source_key : defaultSourceKey}
                </Badge>
                <Badge variant="outline" className="font-mono text-xs bg-white text-violet-700 border-violet-200">
                  <Key size={11} className="mr-1 inline text-violet-500" />
                  FBDI PK: {result ? result.fbdi_key : defaultTargetKey}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Source remains the main reference dataset. Merges matching FBDI records and classifies each into{' '}
                <strong className="text-emerald-700">MATCH</strong>,{' '}
                <strong className="text-amber-700">MISMATCH</strong>, or{' '}
                <strong className="text-rose-700">MISSING</strong>.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="primary"
            icon={loading ? <RefreshCw size={14} className="animate-spin" /> : <GitMerge size={14} />}
            disabled={loading}
            onClick={handleRunMerge}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 shadow-sm font-semibold"
          >
            {loading ? 'Merging...' : result ? 'Re-Run Merge' : 'Run Merge & Validate'}
          </Button>
        </div>

        {/* File Selection / Upload Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source File Picker */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-indigo-600" />
                Source File (.xlsx / .csv)
              </label>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                Reference Dataset
              </Badge>
            </div>

            <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-lg p-3 text-center transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.xlsm"
                onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center gap-1">
                <UploadCloud size={18} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-700 truncate max-w-full">
                  {sourceFile ? sourceFile.name : result?.source_file ? result.source_file : 'Auto-detect from project or Click to upload'}
                </span>
                <span className="text-[10px] text-slate-400">Default: source file.xlsx</span>
              </div>
            </div>
          </div>

          {/* FBDI File Picker */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-violet-600" />
                FBDI File (.xlsm / .xlsx / .csv)
              </label>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                Target Payload
              </Badge>
            </div>

            <div className="relative border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-lg p-3 text-center transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.xlsm"
                onChange={(e) => setFbdiFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center gap-1">
                <UploadCloud size={18} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-700 truncate max-w-full">
                  {fbdiFile ? fbdiFile.name : result?.fbdi_file ? result.fbdi_file : 'Auto-detect from project or Click to upload'}
                </span>
                <span className="text-[10px] text-slate-400">Default: UploadCustomersTemplateAiretech 1.xlsm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error message display if any */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
            <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Error:</strong> {errorMsg}
            </div>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total Merged */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Total Merged</span>
                  <Layers size={14} className="text-slate-400" />
                </div>
                <div className="text-xl font-bold text-slate-800 mt-1">
                  {result.total_merged.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Source: {result.total_source.toLocaleString()} | FBDI: {result.total_fbdi.toLocaleString()}
                </div>
              </div>

              {/* MATCH */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800">MATCH</span>
                  <CheckCircle2 size={14} className="text-emerald-600" />
                </div>
                <div className="text-xl font-bold text-emerald-900 mt-1">
                  {result.match_count.toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  {result.total_merged > 0 ? ((result.match_count / result.total_merged) * 100).toFixed(1) : 0}% concordance
                </div>
              </div>

              {/* MISMATCH */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">MISMATCH</span>
                  <AlertTriangle size={14} className="text-amber-600" />
                </div>
                <div className="text-xl font-bold text-amber-900 mt-1">
                  {result.mismatch_count.toLocaleString()}
                </div>
                <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                  {result.total_merged > 0 ? ((result.mismatch_count / result.total_merged) * 100).toFixed(1) : 0}% field differences
                </div>
              </div>

              {/* MISSING */}
              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-800">MISSING IN FBDI</span>
                  <XCircle size={14} className="text-rose-600" />
                </div>
                <div className="text-xl font-bold text-rose-900 mt-1">
                  {result.missing_count.toLocaleString()}
                </div>
                <div className="text-[11px] text-rose-700 font-medium mt-0.5">
                  {result.total_merged > 0 ? ((result.missing_count / result.total_merged) * 100).toFixed(1) : 0}% no target record
                </div>
              </div>
            </div>

            {/* Unmapped / Missing Source Columns Disclosure */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setShowMissingCols(!showMissingCols)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <Columns size={14} className="text-slate-500" />
                  <span>Source Columns Missing / Unmapped in FBDI</span>
                  <Badge variant="outline" className="bg-white text-slate-600">
                    {result.missing_columns.length} columns
                  </Badge>
                </div>
                {showMissingCols ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showMissingCols && (
                <div className="p-4 border-t border-slate-200 bg-white">
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    These Source legacy fields have no corresponding attribute in the FBDI customer payload:
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {result.missing_columns.map((col) => (
                      <span
                        key={col}
                        className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono border border-slate-200"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Merged Reconciliation Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {/* Table Toolbar */}
              <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['ALL', 'MATCH', 'MISMATCH', 'MISSING'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                        statusFilter === st
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      )}
                    >
                      {st === 'ALL' ? `All (${result.total_merged})` : null}
                      {st === 'MATCH' ? `Match (${result.match_count})` : null}
                      {st === 'MISMATCH' ? `Mismatch (${result.mismatch_count})` : null}
                      {st === 'MISSING' ? `Missing (${result.missing_count})` : null}
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="relative max-w-xs w-full">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search customer, city, details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>

              {/* Scrollable Records Table */}
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold sticky left-0 z-20 bg-slate-100 min-w-[90px] border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                        Status
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[200px] border-r border-slate-200">
                        Mismatch Details
                      </th>
                      {dataColumns.map((col) => (
                        <th
                          key={col}
                          className="py-2.5 px-3 font-semibold whitespace-nowrap min-w-[130px] border-r border-slate-200 last:border-r-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{col}</span>
                            {col.endsWith('_source') && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-indigo-100 text-indigo-700 rounded border border-indigo-200">
                                Source
                              </span>
                            )}
                            {col.endsWith('_fbdi') && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-violet-100 text-violet-700 rounded border border-violet-200">
                                FBDI
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={dataColumns.length + 2} className="py-8 text-center text-slate-400">
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((rec, i) => {
                        const status = String(rec.Reconciliation_Status ?? '');
                        const details = String(rec.Mismatch_Details ?? '');
                        const isSelected = selectedRecord === rec;

                        return (
                          <tr
                            key={i}
                            onClick={() => setSelectedRecord(rec)}
                            className={cn(
                              'hover:bg-indigo-50/50 cursor-pointer transition-colors group',
                              isSelected && 'bg-indigo-50/70 font-medium'
                            )}
                            title="Click to view full record"
                          >
                            <td className="py-2 px-3 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[1px_0_0_0_#f1f5f9]">
                              {status === 'MATCH' && (
                                <Badge variant="success" className="font-semibold text-[10px]">
                                  MATCH
                                </Badge>
                              )}
                              {status === 'MISMATCH' && (
                                <Badge variant="warning" className="font-semibold text-[10px]">
                                  MISMATCH
                                </Badge>
                              )}
                              {status === 'MISSING' && (
                                <Badge variant="error" className="font-semibold text-[10px]">
                                  MISSING
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 max-w-sm truncate border-r border-slate-100" title={details}>
                              {details ? (
                                <span className="text-amber-700 font-mono text-[11px]">{details}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            {dataColumns.map((col) => {
                              const val = rec[col];
                              const displayVal =
                                val !== null && val !== undefined && String(val).trim() !== ''
                                  ? String(val)
                                  : '—';
                              return (
                                <td
                                  key={col}
                                  className="py-2 px-3 whitespace-nowrap text-slate-700 font-mono text-[11px] max-w-xs truncate border-r border-slate-100 last:border-r-0"
                                  title={displayVal !== '—' ? displayVal : undefined}
                                >
                                  {displayVal}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Showing {filteredRecords.length} records in preview • Click any row to inspect all fields
                </span>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <Download size={12} /> Download Merged Result (.xlsx)
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Detailed Row Inspection Modal */}
        <AnimatePresence>
          {selectedRecord && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 font-mono">
                          {String(
                            selectedRecord[result?.source_key || 'Customer Name'] ??
                              selectedRecord['Customer Name'] ??
                              selectedRecord['customer Name'] ??
                              'Record Details'
                          )}
                        </h3>
                        {selectedRecord.Reconciliation_Status === 'MATCH' && (
                          <Badge variant="success" className="text-[10px]">
                            MATCH
                          </Badge>
                        )}
                        {selectedRecord.Reconciliation_Status === 'MISMATCH' && (
                          <Badge variant="warning" className="text-[10px]">
                            MISMATCH
                          </Badge>
                        )}
                        {selectedRecord.Reconciliation_Status === 'MISSING' && (
                          <Badge variant="error" className="text-[10px]">
                            MISSING
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Complete Merged Record: Source Attributes + FBDI Target Payload ({dataColumns.length} fields)
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Field Comparison Table */}
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2 px-3 font-semibold text-left w-2/5">Merged Field</th>
                          <th className="py-2 px-3 font-semibold text-left">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dataColumns.map((col) => {
                          const val = selectedRecord[col];
                          const displayVal =
                            val !== null && val !== undefined && String(val).trim() !== ''
                              ? String(val)
                              : '—';
                          const isSource = col.endsWith('_source');
                          const isFbdi = col.endsWith('_fbdi');
                          const isKey = col === result?.source_key || col === result?.fbdi_key;

                          return (
                            <tr key={col} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 px-3 font-medium text-slate-700 flex items-center gap-1.5">
                                <span>{col}</span>
                                {isKey && (
                                  <Badge variant="outline" className="text-[9px] text-indigo-600 bg-indigo-50 border-indigo-200">
                                    Primary Key
                                  </Badge>
                                )}
                                {isSource && (
                                  <Badge variant="outline" className="text-[9px] text-indigo-700 bg-indigo-50 border-indigo-200">
                                    Source
                                  </Badge>
                                )}
                                {isFbdi && (
                                  <Badge variant="outline" className="text-[9px] text-violet-700 bg-violet-50 border-violet-200">
                                    FBDI
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-800 break-all">
                                {displayVal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Status Banner */}
                  {selectedRecord.Reconciliation_Status === 'MATCH' && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong>Oracle Fusion Validation: PASSED</strong> — All mapped customer attributes are concordant with the Source reference dataset.
                      </div>
                    </div>
                  )}

                  {selectedRecord.Reconciliation_Status === 'MISMATCH' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <div>
                        <strong>Oracle Fusion Validation: DISCREPANCY DETECTED</strong> —{' '}
                        {selectedRecord.Mismatch_Details}
                      </div>
                    </div>
                  )}

                  {selectedRecord.Reconciliation_Status === 'MISSING' && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
                      <XCircle size={16} className="text-rose-600 shrink-0" />
                      <div>
                        <strong>Oracle Fusion Validation: RECORD ABSENT</strong> — Customer exists in Source master but has no record in the FBDI customer upload template.
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedRecord(null)}>
                    Done
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
