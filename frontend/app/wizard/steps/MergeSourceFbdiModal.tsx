'use client';
import { useState, useEffect, useCallback } from 'react';
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
  ShieldCheck,
  ArrowRight,
  Plus,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export interface ColumnMappingItem {
  source_column: string;
  fbdi_column: string;
  is_primary_key?: boolean;
}

interface MergeResult {
  status: string;
  source_file: string;
  fbdi_file: string;
  source_key: string;
  fbdi_key: string;
  total_source: number;
  total_fbdi: number;
  total_merged: number;
  fully_mapped_count?: number;
  partially_matched_count?: number;
  fully_unmapped_count?: number;
  match_count?: number;
  mismatch_count?: number;
  missing_count?: number;
  missing_columns: string[];
  columns?: string[];
  mappings?: ColumnMappingItem[];
  records: Record<string, any>[];
  download_url: string;
}

interface MergeSourceFbdiModalProps {
  open: boolean;
  onClose: () => void;
  defaultSourceKey?: string;
  defaultTargetKey?: string;
  initialMappings?: ColumnMappingItem[];
  sourceColumns?: string[];
  targetColumns?: string[];
  sourceFileName?: string;
  targetFileName?: string;
}

interface FieldDifference {
  fieldName: string;
  sourceCol: string;
  fbdiCol: string;
  sourceValue: string;
  fbdiValue: string;
  differenceReason: string;
  isMissing: boolean;
}

interface PartiallyMatchedInfo {
  sourceCustomerName: string;
  fbdiCustomerName: string;
  sourceRowNum?: number;
  fbdiRowNum?: number;
  fbdiMatchCount: number;
  hasMultipleFbdi: boolean;
  differences: FieldDifference[];
}

function getPartiallyMatchedInfo(
  rec: Record<string, any>,
  result: MergeResult | null
): PartiallyMatchedInfo {
  const sKey = result?.source_key || 'Customer Name';
  const fKey = result?.fbdi_key || '*Customer Name';

  const sourceCustomerName = String(
    rec[sKey] ??
      rec[`${sKey}_source`] ??
      rec['Customer Name'] ??
      rec['customer Name'] ??
      '—'
  ).trim();

  const fbdiCustomerName = String(
    rec[fKey] ??
      rec[`${fKey}_fbdi`] ??
      rec['*Customer Name'] ??
      rec['Party Name'] ??
      rec['PARTY_NAME'] ??
      sourceCustomerName
  ).trim();

  const sourceRowNum = rec._source_row_num ? Number(rec._source_row_num) : undefined;
  const fbdiRowNum = rec._fbdi_row_num ? Number(rec._fbdi_row_num) : undefined;
  const fbdiMatchCount = rec._fbdi_match_count ? Number(rec._fbdi_match_count) : 1;
  const hasMultipleFbdi = fbdiMatchCount > 1;

  const differences: FieldDifference[] = [];
  const seenCols = new Set<string>();

  const isBlank = (val: any) =>
    val === null ||
    val === undefined ||
    String(val).trim() === '' ||
    String(val).trim().toLowerCase() === 'nan' ||
    String(val).trim().toLowerCase() === 'none' ||
    String(val).trim().toLowerCase() === 'null';

  const valuesAreEquivalent = (valA: any, valB: any) => {
    const sA = String(valA ?? '').trim().toLowerCase();
    const sB = String(valB ?? '').trim().toLowerCase();
    if (sA === sB) return true;
    const numA = parseFloat(sA.replace(/[$,]/g, ''));
    const numB = parseFloat(sB.replace(/[$,]/g, ''));
    if (!isNaN(numA) && !isNaN(numB) && numA === numB) return true;
    return false;
  };

  // 1. Check mapped columns from result.mappings
  const mappings = result?.mappings || [];
  for (const m of mappings) {
    const sCol = m.source_column;
    const fCol = m.fbdi_column;
    if (!sCol || !fCol || fCol === '__none__') continue;
    if (m.is_primary_key || sCol === sKey) continue;

    const valS = rec[`${sCol}_source`] !== undefined ? rec[`${sCol}_source`] : rec[sCol];
    const valF = rec[`${fCol}_fbdi`] !== undefined ? rec[`${fCol}_fbdi`] : rec[fCol];

    const sEmpty = isBlank(valS);
    const fEmpty = isBlank(valF);

    if (!sEmpty && fEmpty) {
      seenCols.add(sCol.toLowerCase());
      seenCols.add(fCol.toLowerCase());
      differences.push({
        fieldName: sCol === fCol ? sCol : `${sCol}`,
        sourceCol: sCol,
        fbdiCol: fCol,
        sourceValue: String(valS).trim(),
        fbdiValue: '(Missing in FBDI)',
        differenceReason: `${sCol} is missing in FBDI`,
        isMissing: true,
      });
    } else if (!sEmpty && !fEmpty && !valuesAreEquivalent(valS, valF)) {
      seenCols.add(sCol.toLowerCase());
      seenCols.add(fCol.toLowerCase());
      differences.push({
        fieldName: sCol === fCol ? sCol : `${sCol}`,
        sourceCol: sCol,
        fbdiCol: fCol,
        sourceValue: String(valS).trim(),
        fbdiValue: String(valF).trim(),
        differenceReason: `${sCol} does not match`,
        isMissing: false,
      });
    }
  }

  // 2. Parse rec.Mismatch_Details to capture any additional issues
  const detailsStr = String(rec.Mismatch_Details ?? '').trim();
  if (
    detailsStr &&
    detailsStr !== '—' &&
    detailsStr !== 'All mapped data available' &&
    detailsStr !== 'No corresponding FBDI record found'
  ) {
    const parts = detailsStr.split(';').map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const matchNeq = p.match(/^([^:]+):\s*'([^']*)'\s*!=\s*'([^']*)'$/);
      if (matchNeq) {
        const colName = matchNeq[1].trim();
        if (!seenCols.has(colName.toLowerCase())) {
          seenCols.add(colName.toLowerCase());
          differences.push({
            fieldName: colName,
            sourceCol: colName,
            fbdiCol: colName,
            sourceValue: matchNeq[2],
            fbdiValue: matchNeq[3],
            differenceReason: `${colName} does not match`,
            isMissing: false,
          });
        }
        continue;
      }
      const matchMiss = p.match(/^([^:]+):\s*missing in FBDI$/i);
      if (matchMiss) {
        const colName = matchMiss[1].trim();
        if (!seenCols.has(colName.toLowerCase())) {
          seenCols.add(colName.toLowerCase());
          const valS = rec[`${colName}_source`] ?? rec[colName] ?? '—';
          differences.push({
            fieldName: colName,
            sourceCol: colName,
            fbdiCol: colName,
            sourceValue: isBlank(valS) ? '—' : String(valS).trim(),
            fbdiValue: '(Missing in FBDI)',
            differenceReason: `${colName} is missing in FBDI`,
            isMissing: true,
          });
        }
        continue;
      }
    }
  }

  return {
    sourceCustomerName,
    fbdiCustomerName,
    sourceRowNum,
    fbdiRowNum,
    fbdiMatchCount,
    hasMultipleFbdi,
    differences,
  };
}

function PartiallyMatchedComparison({
  rec,
  result,
  compact = false,
}: {
  rec: Record<string, any>;
  result: MergeResult | null;
  compact?: boolean;
}) {
  const info = getPartiallyMatchedInfo(rec, result);

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-300 bg-amber-50/60 p-3 space-y-2.5 shadow-2xs text-left',
        compact ? 'text-xs' : 'text-xs'
      )}
    >
      {/* Header explanation & Multi-FBDI badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-amber-200/80">
        <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          <span>Customer matched, but some corresponding data is missing/different</span>
        </div>
        {info.hasMultipleFbdi && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-medium border border-amber-300 shrink-0">
            <Layers size={11} className="text-amber-700" />
            Multiple FBDI records ({info.fbdiMatchCount} found • Compared Row #{info.fbdiRowNum})
          </span>
        )}
      </div>

      {/* Side-by-Side Cards: SOURCE vs FBDI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* SOURCE */}
        <div className="bg-white rounded-lg border border-indigo-200 p-2.5 shadow-xs">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-indigo-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
              <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">SOURCE</span>
            </div>
            {info.sourceRowNum && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                Row #{info.sourceRowNum}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wide">Customer Name</span>
              <span className="text-xs font-bold text-slate-900 font-mono break-all">{info.sourceCustomerName}</span>
            </div>
            {info.differences.map((diff, idx) => (
              <div key={idx} className="pt-1.5 border-t border-slate-100">
                <span className="text-[10px] text-indigo-700 font-medium block">{diff.sourceCol}</span>
                <span className="text-xs font-mono font-semibold text-slate-900 bg-indigo-50/70 px-1.5 py-0.5 rounded border border-indigo-100 block break-all mt-0.5">
                  {diff.sourceValue || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* FBDI */}
        <div className="bg-white rounded-lg border border-violet-200 p-2.5 shadow-xs">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-violet-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-600 inline-block" />
              <span className="text-[11px] font-bold text-violet-900 uppercase tracking-wider">FBDI</span>
            </div>
            {info.fbdiRowNum && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                {info.hasMultipleFbdi
                  ? `Row #${info.fbdiRowNum} (1 of ${info.fbdiMatchCount})`
                  : `Row #${info.fbdiRowNum}`}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wide">Customer Name</span>
              <span className="text-xs font-bold text-slate-900 font-mono break-all">{info.fbdiCustomerName}</span>
            </div>
            {info.differences.map((diff, idx) => (
              <div key={idx} className="pt-1.5 border-t border-slate-100">
                <span className="text-[10px] text-violet-700 font-medium block">{diff.fbdiCol}</span>
                <span
                  className={cn(
                    'text-xs font-mono font-semibold px-1.5 py-0.5 rounded border block break-all mt-0.5',
                    diff.isMissing
                      ? 'text-rose-700 bg-rose-50 border-rose-200 italic'
                      : 'text-amber-950 bg-amber-50 border-amber-200'
                  )}
                >
                  {diff.fbdiValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Difference Summary Pills */}
      <div className="space-y-1 pt-1">
        {info.differences.map((diff, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-100/90 border border-amber-300 text-amber-950 text-[11px]"
          >
            <span className="font-bold text-amber-800 shrink-0">Difference →</span>
            <span className="font-medium">{diff.differenceReason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MergeSourceFbdiModal({
  open,
  onClose,
  defaultSourceKey = 'Customer Name',
  defaultTargetKey = '*Customer Name',
  initialMappings = [],
  sourceColumns: sourceColumnsProp = [],
  targetColumns: targetColumnsProp = [],
  sourceFileName,
  targetFileName,
}: MergeSourceFbdiModalProps) {
  const { toast } = useToast();

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fbdiFile, setFbdiFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dynamic Column Mapping States
  const [mappings, setMappings] = useState<ColumnMappingItem[]>(initialMappings);
  const [sourceColumns, setSourceColumns] = useState<string[]>(sourceColumnsProp);
  const [fbdiColumns, setFbdiColumns] = useState<string[]>(targetColumnsProp);
  const [sourceKey, setSourceKey] = useState<string>(defaultSourceKey);
  const [fbdiKey, setFbdiKey] = useState<string>(defaultTargetKey);
  const [detecting, setDetecting] = useState<boolean>(false);

  // Selected row for detail inspection
  const [selectedRecord, setSelectedRecord] = useState<Record<string, any> | null>(null);

  // Results View States - Only: Fully Mapped | Partially Matched | Fully Unmapped
  type StatusFilter = 'ALL' | 'Fully Mapped' | 'Partially Matched' | 'Fully Unmapped';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
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

  // Dynamically detect or refresh mappings when modal opens or files change
  const detectMappings = useCallback(async () => {
    setDetecting(true);
    try {
      const formData = new FormData();
      if (sourceFile) formData.append('source_file', sourceFile);
      if (fbdiFile) formData.append('fbdi_file', fbdiFile);
      if (sourceFileName) formData.append('source_file_name', sourceFileName);
      if (targetFileName) formData.append('fbdi_file_name', targetFileName);
      if (sourceKey) formData.append('source_key', sourceKey);
      if (fbdiKey) formData.append('fbdi_key', fbdiKey);

      const apiBase = getApiBase();
      let res: Response | null = null;
      if (apiBase) {
        try {
          res = await fetch(`${apiBase}/api/v1/source-fbdi/detect-mapping`, {
            method: 'POST',
            body: formData,
          });
        } catch {
          res = null;
        }
      }
      if (!res || !res.ok) {
        res = await fetch('/api/v1/source-fbdi/detect-mapping', {
          method: 'POST',
          body: formData,
        });
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          if (data.source_key) setSourceKey(data.source_key);
          if (data.fbdi_key) setFbdiKey(data.fbdi_key);
          if (data.source_columns && data.source_columns.length > 0) {
            setSourceColumns(data.source_columns);
          }
          if (data.fbdi_columns && data.fbdi_columns.length > 0) {
            setFbdiColumns(data.fbdi_columns);
          }
          if (data.mappings && data.mappings.length > 0) {
            setMappings(data.mappings);
          }
        }
      }
    } catch (err) {
      console.warn('Could not auto-detect mappings via API:', err);
    } finally {
      setDetecting(false);
    }
  }, [sourceFile, fbdiFile, sourceFileName, targetFileName, sourceKey, fbdiKey]);

  useEffect(() => {
    if (!open) return;
    if (initialMappings && initialMappings.length > 0 && mappings.length === 0) {
      setMappings(initialMappings);
    }
    if (sourceColumnsProp.length > 0 && sourceColumns.length === 0) {
      setSourceColumns(sourceColumnsProp);
    }
    if (targetColumnsProp.length > 0 && fbdiColumns.length === 0) {
      setFbdiColumns(targetColumnsProp);
    }
    detectMappings();
  }, [open, sourceFile, fbdiFile]);

  // Mapping edit handlers
  const handleUpdateFbdiColumn = (index: number, newFbdiCol: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], fbdi_column: newFbdiCol };
      updated[index] = item;
      if (item.is_primary_key) {
        setFbdiKey(newFbdiCol);
      }
      return updated;
    });
  };

  const handleUpdateSourceColumn = (index: number, newSrcCol: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], source_column: newSrcCol };
      updated[index] = item;
      if (item.is_primary_key) {
        setSourceKey(newSrcCol);
      }
      return updated;
    });
  };

  const handleRemoveMapping = (index: number) => {
    setMappings((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddMapping = () => {
    const unmappedSrc =
      sourceColumns.find((sc) => !mappings.some((m) => m.source_column === sc)) ||
      sourceColumns[0] ||
      'New Field';
    const unmappedFbdi =
      fbdiColumns.find((fc) => !mappings.some((m) => m.fbdi_column === fc)) ||
      fbdiColumns[0] ||
      '';
    setMappings((prev) => [
      ...prev,
      { source_column: unmappedSrc, fbdi_column: unmappedFbdi, is_primary_key: false },
    ]);
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
      if (sourceFileName) {
        formData.append('source_file_name', sourceFileName);
      }
      if (targetFileName) {
        formData.append('fbdi_file_name', targetFileName);
      }

      // Pass user-edited primary keys
      if (sourceKey) {
        formData.append('source_key', sourceKey);
      }
      if (fbdiKey) {
        formData.append('fbdi_key', fbdiKey);
      }

      // Pass user-reviewed/edited column mappings
      const colMapPayload: Record<string, string> = {};
      mappings.forEach((m) => {
        if (m.source_column && m.fbdi_column && m.fbdi_column !== '__none__') {
          colMapPayload[m.source_column] = m.fbdi_column;
        }
      });
      formData.append('column_mappings', JSON.stringify(colMapPayload));

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
      if (data.mappings && data.mappings.length > 0) {
        setMappings(data.mappings);
      }
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

  const metaCols = new Set([
    'Reconciliation_Status',
    'Mismatch_Details',
    'Mismatched_Field_Count',
    '_source_row_num',
    '_fbdi_row_num',
    '_fbdi_match_count',
  ]);

  const allColumns: string[] = result?.columns ?? (
    result?.records && result.records.length > 0
      ? Object.keys(result.records[0])
      : []
  );

  const dataColumns = allColumns.filter((c) => !metaCols.has(c));

  const filteredRecords = (result?.records ?? []).filter((r) => {
    const status = String(r.Reconciliation_Status ?? '').trim();
    if (statusFilter !== 'ALL' && status.toLowerCase() !== statusFilter.toLowerCase()) return false;

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
      size="xl"
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
                <strong className="text-emerald-700">Fully Mapped</strong>,{' '}
                <strong className="text-amber-700">Partially Matched</strong>, or{' '}
                <strong className="text-rose-700">Fully Unmapped</strong>.
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

        {/* Dynamic Column Mapping Review & Edit Section */}
        <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Columns size={14} className="text-indigo-600" />
                  Dynamic Column Mappings
                </span>
                <Badge variant="outline" className="text-[10px] text-indigo-700 bg-indigo-50 border-indigo-200">
                  {mappings.length} mapped
                </Badge>
                {detecting && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 animate-pulse">
                    <RefreshCw size={11} className="animate-spin" /> Detecting from files...
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Automatically mapped via dynamic <strong className="text-slate-700">&quot;Customer Name&quot;</strong> logic. Review or change target FBDI columns below before merging.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw size={12} className={cn(detecting && 'animate-spin')} />}
                onClick={() => detectMappings()}
                disabled={detecting}
                className="text-xs h-7 px-2"
              >
                Refresh Mappings
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={12} />}
                onClick={handleAddMapping}
                className="text-xs h-7 px-2"
              >
                Add Mapping
              </Button>
            </div>
          </div>

          {mappings.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              {detecting ? 'Detecting automatic mappings from files...' : 'No mappings available. Upload files or click "+ Add Mapping".'}
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
              {mappings.map((m, idx) => {
                const isPk = m.is_primary_key || m.source_column === sourceKey;
                return (
                  <div
                    key={`${m.source_column}-${idx}`}
                    className={cn(
                      'flex items-center justify-between gap-2 p-2 px-3 text-xs transition-colors',
                      isPk ? 'bg-amber-50/60 font-medium' : 'hover:bg-slate-50/80 bg-white'
                    )}
                  >
                    {/* Source Column */}
                    <div className="flex items-center gap-2 min-w-[180px] max-w-[240px] truncate">
                      {isPk ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[11px]">
                          <Key size={10} className="text-amber-700" />
                          {m.source_column}
                        </span>
                      ) : (
                        <span className="font-mono text-slate-700 truncate bg-slate-100 px-2 py-0.5 rounded">
                          {m.source_column}
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center text-slate-400 shrink-0">
                      <ArrowRight size={13} />
                    </div>

                    {/* Target FBDI Column Selector */}
                    <div className="flex-1 min-w-[200px]">
                      <select
                        value={m.fbdi_column}
                        onChange={(e) => handleUpdateFbdiColumn(idx, e.target.value)}
                        className={cn(
                          'w-full px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-mono',
                          isPk
                            ? 'border-amber-300 text-amber-900 font-semibold'
                            : 'border-slate-200 text-slate-800'
                        )}
                      >
                        <option value="">-- Ignore / Unmapped --</option>
                        {fbdiColumns.map((fc) => (
                          <option key={fc} value={fc}>
                            {fc}
                          </option>
                        ))}
                        {m.fbdi_column && !fbdiColumns.includes(m.fbdi_column) && (
                          <option value={m.fbdi_column}>{m.fbdi_column}</option>
                        )}
                      </select>
                    </div>

                    {/* Key badge or remove button */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isPk ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-100/80 text-amber-800 border-amber-300">
                          Primary Key
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveMapping(idx)}
                          className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors"
                          title="Remove mapping"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
            {/* Stat Cards - ONLY 3 Categories: Fully Mapped | Partially Matched | Fully Unmapped */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Fully Mapped */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800">Fully Mapped</span>
                  <CheckCircle2 size={14} className="text-emerald-600" />
                </div>
                <div className="text-xl font-bold text-emerald-900 mt-1">
                  {(result.fully_mapped_count ?? result.match_count ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  {result.total_merged > 0
                    ? (((result.fully_mapped_count ?? result.match_count ?? 0) / result.total_merged) * 100).toFixed(1)
                    : 0}
                  % concordance • All mapped data available
                </div>
              </div>

              {/* Partially Matched */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">Partially Matched</span>
                  <AlertTriangle size={14} className="text-amber-600" />
                </div>
                <div className="text-xl font-bold text-amber-900 mt-1">
                  {(result.partially_matched_count ?? result.mismatch_count ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                  {result.total_merged > 0
                    ? (((result.partially_matched_count ?? result.mismatch_count ?? 0) / result.total_merged) * 100).toFixed(1)
                    : 0}
                  % partial • Mapped key found, some data missing
                </div>
              </div>

              {/* Fully Unmapped */}
              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-800">Fully Unmapped</span>
                  <XCircle size={14} className="text-rose-600" />
                </div>
                <div className="text-xl font-bold text-rose-900 mt-1">
                  {(result.fully_unmapped_count ?? result.missing_count ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-rose-700 font-medium mt-0.5">
                  {result.total_merged > 0
                    ? (((result.fully_unmapped_count ?? result.missing_count ?? 0) / result.total_merged) * 100).toFixed(1)
                    : 0}
                  % unmapped • No corresponding FBDI record
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
                  {(['ALL', 'Fully Mapped', 'Partially Matched', 'Fully Unmapped'] as const).map((st) => (
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
                      {st === 'ALL' && `All (${result.total_merged})`}
                      {st === 'Fully Mapped' && `Fully Mapped (${result.fully_mapped_count ?? result.match_count ?? 0})`}
                      {st === 'Partially Matched' && `Partially Matched (${result.partially_matched_count ?? result.mismatch_count ?? 0})`}
                      {st === 'Fully Unmapped' && `Fully Unmapped (${result.fully_unmapped_count ?? result.missing_count ?? 0})`}
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
                      <th className="py-2.5 px-3 font-semibold min-w-[380px] sm:min-w-[480px] border-r border-slate-200">
                        Validation / Mapping Details
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
                            <td className="py-2 px-3 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[1px_0_0_0_#f1f5f9] align-top">
                              {(status === 'Fully Mapped' || status === 'MATCH') && (
                                <Badge variant="success" className="font-semibold text-[10px]">
                                  Fully Mapped
                                </Badge>
                              )}
                              {(status === 'Partially Matched' || status === 'MISMATCH') && (
                                <Badge variant="warning" className="font-semibold text-[10px]">
                                  Partially Matched
                                </Badge>
                              )}
                              {(status === 'Fully Unmapped' || status === 'MISSING') && (
                                <Badge variant="error" className="font-semibold text-[10px]">
                                  Fully Unmapped
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top min-w-[380px] sm:min-w-[480px]">
                              {(status === 'Fully Mapped' || status === 'MATCH') && (
                                <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-xs font-medium w-fit">
                                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  <span>All mapped data available</span>
                                </div>
                              )}
                              {(status === 'Fully Unmapped' || status === 'MISSING') && (
                                <div className="flex items-center gap-1.5 text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg text-xs font-medium w-fit">
                                  <XCircle size={13} className="text-rose-600 shrink-0" />
                                  <span>No corresponding FBDI record found</span>
                                </div>
                              )}
                              {(status === 'Partially Matched' || status === 'MISMATCH') && (
                                <PartiallyMatchedComparison rec={rec} result={result} compact={true} />
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
                  Showing {filteredRecords.length} records{statusFilter !== 'ALL' ? ` (${statusFilter})` : ''} • Click any row to inspect all fields
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
                        {(selectedRecord.Reconciliation_Status === 'Fully Mapped' ||
                          selectedRecord.Reconciliation_Status === 'MATCH') && (
                          <Badge variant="success" className="text-[10px]">
                            Fully Mapped
                          </Badge>
                        )}
                        {(selectedRecord.Reconciliation_Status === 'Partially Matched' ||
                          selectedRecord.Reconciliation_Status === 'MISMATCH') && (
                          <Badge variant="warning" className="text-[10px]">
                            Partially Matched
                          </Badge>
                        )}
                        {(selectedRecord.Reconciliation_Status === 'Fully Unmapped' ||
                          selectedRecord.Reconciliation_Status === 'MISSING') && (
                          <Badge variant="error" className="text-[10px]">
                            Fully Unmapped
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
                  {(selectedRecord.Reconciliation_Status === 'Partially Matched' ||
                    selectedRecord.Reconciliation_Status === 'MISMATCH') && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-amber-600" />
                        Partially Matched Side-by-Side Comparison
                      </h4>
                      <PartiallyMatchedComparison rec={selectedRecord} result={result} compact={false} />
                    </div>
                  )}

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
                  {(selectedRecord.Reconciliation_Status === 'Fully Mapped' ||
                    selectedRecord.Reconciliation_Status === 'MATCH') && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong>Validation: Fully Mapped</strong> — Source record has a corresponding FBDI record and all mapped/corresponding data is available.
                      </div>
                    </div>
                  )}

                  {(selectedRecord.Reconciliation_Status === 'Partially Matched' ||
                    selectedRecord.Reconciliation_Status === 'MISMATCH') && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <div>
                        <strong>Validation: Partially Matched</strong> — Source record has a corresponding FBDI record, but some mapped/corresponding data is missing.
                        {selectedRecord.Mismatch_Details && (
                          <span className="block mt-0.5 font-mono text-[11px] text-amber-900">
                            Details: {selectedRecord.Mismatch_Details}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {(selectedRecord.Reconciliation_Status === 'Fully Unmapped' ||
                    selectedRecord.Reconciliation_Status === 'MISSING') && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
                      <XCircle size={16} className="text-rose-600 shrink-0" />
                      <div>
                        <strong>Validation: Fully Unmapped</strong> — Source record has no corresponding FBDI record.
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
