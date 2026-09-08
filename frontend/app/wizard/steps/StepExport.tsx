'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, FileText, FileSpreadsheet, FileJson, CheckCircle2,
  Trophy, BarChart3, AlertTriangle, Info, Clock, History
} from 'lucide-react';
import { cn, formatNumber, formatPercent, formatDateTime } from '@/lib/utils';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
} from './shared';
import type { StepProps } from './shared';

const TABS = [
  { id: 'summary', label: 'Report Summary', icon: <BarChart3 size={12} /> },
  { id: 'export',  label: 'Export Reports', icon: <Download size={12} /> },
  { id: 'history', label: 'Export History', icon: <History size={12} /> },
];

const REPORT_TYPES = [
  { id: 'summary',        label: 'Summary Report',             description: 'High-level match statistics and KPIs',           icon: BarChart3,      format: 'PDF' },
  { id: 'discrepancies',  label: 'Discrepancy Report',         description: 'Full list of mismatches and missing records',     icon: AlertTriangle,  format: 'XLSX' },
  { id: 'full',           label: 'Full Reconciliation Export',  description: 'All matched and unmatched records',               icon: FileSpreadsheet,format: 'XLSX' },
  { id: 'json',           label: 'Machine-Readable Export',    description: 'JSON format for integration with other systems',  icon: FileJson,       format: 'JSON' },
  { id: 'audit',          label: 'Audit Report',               description: 'Complete trail of wizard steps, rules, changes',  icon: FileText,       format: 'PDF' },
] as const;
type ReportId = typeof REPORT_TYPES[number]['id'];

interface HistoryEntry { id: string; reportId: ReportId; label: string; format: string; exportedAt: string; size: string; }

function simulateDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Report Summary tab ────────────────────────────────────────────────────────
function TabReportSummary({ batch, result }: { batch: StepProps['batch']; result: ReturnType<typeof useStore>['state']['reconciliations'][0] | null }) {
  if (!result) return (
    <EmptyCard icon={<BarChart3 size={22} className="text-slate-400" />}
      title="No reconciliation results" message="Complete the Reconciliation step first to generate reports." />
  );

  const qualityGrade = result.matchRate >= 99 ? 'A+' : result.matchRate >= 97 ? 'A' : result.matchRate >= 95 ? 'B' : 'C';
  const gradeColor = qualityGrade.startsWith('A') ? 'bg-emerald-500' : qualityGrade === 'B' ? 'bg-blue-500' : 'bg-amber-500';

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Trophy size={24} />
            </div>
            <div>
              <p className="font-bold text-lg">Reconciliation Complete</p>
              <p className="text-sm opacity-90">{batch?.name}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black">{formatPercent(result.matchRate, 0)}</div>
            <div className="text-xs opacity-70">match rate</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Source Records"  value={formatNumber(result.totalSource)}  color="bg-indigo-50 text-indigo-700" />
        <StatTile label="Matched"         value={formatNumber(result.matched)}       color="bg-emerald-50 text-emerald-700" />
        <StatTile label="Unmatched"       value={formatNumber(result.unmatchedSource + result.unmatchedTarget)} color="bg-amber-50 text-amber-700" />
        <StatTile label="Discrepancies"   value={result.discrepancies.length}        color="bg-red-50 text-red-700" />
      </div>

      {/* Match rate bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Overall Match Rate</p>
          <div className={cn('text-sm font-bold text-white px-3 py-1 rounded-lg', gradeColor)}>Grade {qualityGrade}</div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <motion.div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            initial={{ width: 0 }} animate={{ width: `${result.matchRate}%` }} transition={{ duration: 1.2, ease: 'easeOut' }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>0%</span>
          <span className="font-semibold text-indigo-600">{formatPercent(result.matchRate)}</span>
          <span>100%</span>
        </div>
      </div>

      {/* Column breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Column Breakdown</p>
        <div className="space-y-2">
          {result.summary.map(col => {
            const total = col.matched + col.mismatched + col.missingSource + col.missingTarget;
            const pct = total > 0 ? (col.matched / total) * 100 : 100;
            return (
              <div key={col.column} className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-600 w-36 truncate">{col.column}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-12 text-right">{formatPercent(pct, 0)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Export Reports tab ────────────────────────────────────────────────────────
function TabExportReports({ batch, result, onDownloaded }: {
  batch: StepProps['batch']; result: ReturnType<typeof useStore>['state']['reconciliations'][0] | null;
  onDownloaded: (entry: HistoryEntry) => void;
}) {
  const { addAudit } = useStore();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<ReportId>>(new Set(['summary', 'discrepancies']));
  const [downloading, setDownloading] = useState<ReportId | null>(null);
  const [downloaded, setDownloaded] = useState<Set<ReportId>>(new Set());

  if (!result) return (
    <EmptyCard icon={<Download size={22} className="text-slate-400" />}
      title="No results to export" message="Complete the Reconciliation step to unlock export." />
  );

  const downloadReport = (reportId: ReportId) => {
    if (!batch || !result) return;
    setDownloading(reportId);
    setTimeout(() => {
      const type = REPORT_TYPES.find(r => r.id === reportId)!;
      const content = reportId === 'json'
        ? JSON.stringify({ batch: batch.name, matchRate: result.matchRate, matched: result.matched, discrepancies: result.discrepancies }, null, 2)
        : `DF-Recon ${type.label}\nBatch: ${batch.name}\nDate: ${formatDateTime(result.runAt)}\nMatch Rate: ${formatPercent(result.matchRate)}\nMatched: ${formatNumber(result.matched)} records\nDiscrepancies: ${result.discrepancies.length}`;
      simulateDownload(`df-recon_${batch.id}_${reportId}.${type.format.toLowerCase()}`, content);
      addAudit('REPORT_EXPORTED', 'Batch', batch.id, batch.name, `Exported ${type.label} (${type.format})`);
      setDownloading(null);
      setDownloaded(prev => new Set([...prev, reportId]));
      onDownloaded({ id: Math.random().toString(36).slice(2), reportId, label: type.label, format: type.format, exportedAt: new Date().toISOString(), size: `${Math.floor(Math.random() * 200 + 50)} KB` });
      toast(`${type.label} downloaded`, 'success');
    }, 1000);
  };

  const downloadSelected = () => Array.from(selected).forEach((id, i) => setTimeout(() => downloadReport(id), i * 700));

  const toggleSelect = (id: ReportId) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">{selected.size} report{selected.size !== 1 ? 's' : ''} selected</p>
        <Button size="sm" icon={<Download size={14} />} onClick={downloadSelected} disabled={selected.size === 0}>
          Download Selected ({selected.size})
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {REPORT_TYPES.map(report => (
          <div key={report.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
            <input type="checkbox" checked={selected.has(report.id)} onChange={() => toggleSelect(report.id)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <report.icon size={16} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800">{report.label}</span>
                <Badge variant="outline">{report.format}</Badge>
                {downloaded.has(report.id) && <CheckCircle2 size={13} className="text-emerald-500" />}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{report.description}</p>
            </div>
            <Button size="sm" variant={downloaded.has(report.id) ? 'secondary' : 'ghost'}
              loading={downloading === report.id}
              icon={downloaded.has(report.id) ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Download size={13} />}
              onClick={() => downloadReport(report.id)}>
              {downloaded.has(report.id) ? 'Done' : 'Download'}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">All exports are logged in the Audit Trail. Files download directly to your browser.</p>
      </div>
    </div>
  );
}

// ── Export History tab ────────────────────────────────────────────────────────
function TabExportHistory({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return (
    <EmptyCard icon={<History size={22} className="text-slate-400" />}
      title="No exports yet" message="Download reports from the Export Reports tab to see them here." />
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{history.length} export{history.length !== 1 ? 's' : ''} in this session</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[...history].reverse().map((entry, i) => {
          const report = REPORT_TYPES.find(r => r.id === entry.reportId);
          return (
            <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
              className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{entry.label}</span>
                  <Badge variant="outline">{entry.format}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1"><Clock size={10} />{formatDateTime(entry.exportedAt)}</span>
                  <span>{entry.size}</span>
                </div>
              </div>
              <Badge variant="success">Downloaded</Badge>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepExport({ batch, onAdvance, onBack }: StepProps) {
  const { state } = useStore();
  const [activeTab, setActiveTab] = useState('summary');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const result = batch ? state.reconciliations.find(r => r.batchId === batch.id) ?? null : null;

  const handleDownloaded = (entry: HistoryEntry) => setHistory(prev => [...prev, entry]);

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Report Export</h2>
        <p className="text-sm text-slate-500 mt-1">Review the reconciliation summary and download reports in multiple formats.</p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'summary' && <TabReportSummary batch={batch} result={result} />}
          {activeTab === 'export'  && <TabExportReports batch={batch} result={result} onDownloaded={handleDownloaded} />}
          {activeTab === 'history' && <TabExportHistory history={history} />}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between pt-4 border-t border-slate-100 mt-4">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        {result && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={14} />
            Wizard complete — batch marked as done
          </div>
        )}
      </div>
    </div>
  );
}
