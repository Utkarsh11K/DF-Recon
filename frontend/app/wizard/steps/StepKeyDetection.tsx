'use client';
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key, Zap, CheckCircle2, XCircle, AlertTriangle, Search,
  Info, ArrowRight, ShieldCheck, Database,
  Cpu, AlertCircle, FileSearch, Layers,
  BarChart3, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepSubNav, StepFooter, EmptyCard, StatTile } from './shared';
import type { StepProps } from './shared';
import { detectKeys, type KeyDetectionResponse } from '@/lib/api';
import { retrieveBrowserFile } from '@/lib/project-files';
import { useToast } from '@/components/ui/Toast';


type ColShape = {
  name: string;
  dataType: string;
  isPrimaryKeyCandidate: boolean;
  nullCount?: number;
  uniqueCount?: number;
  sampleValues?: string[];
};

const TABS = [
  { id: 'entity',     label: 'Entity & FBDI Keys', icon: <Database size={14} /> },
  { id: 'candidates', label: 'Source Candidates',  icon: <Search size={14} /> },
  { id: 'selection',  label: 'Key Selection',       icon: <Key size={14} /> },
  { id: 'validation', label: 'Validation',          icon: <ShieldCheck size={14} /> },
];

function keyScore(col: ColShape, rowCount: number): number {
  const n = col.name.toLowerCase();
  let score = 0;
  if (col.isPrimaryKeyCandidate) score += 40;
  if (n === 'id' || n.endsWith('_id') || n.startsWith('id_')) score += 30;
  if (n.includes('key') || n.includes('code') || n.includes('num') || n.includes('no')) score += 15;
  if (n.includes('email')) score += 10;
  const nullPct = rowCount > 0 ? (col.nullCount ?? 0) / rowCount : 0;
  if (nullPct === 0) score += 15;
  else if (nullPct < 0.01) score += 8;
  const uniqueRatio = rowCount > 0 ? (col.uniqueCount ?? 0) / rowCount : 0;
  if (uniqueRatio >= 0.99) score += 20;
  else if (uniqueRatio >= 0.95) score += 12;
  else if (uniqueRatio >= 0.80) score += 5;
  return score;
}

function confidenceFromScore(score: number): number {
  return Math.min(99.5, 40 + score * 0.9);
}

function RecBadge({ rec }: { rec: 'Strong' | 'Possible' | 'Weak' }) {
  if (rec === 'Strong') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={10} /> Strong
    </span>
  );
  if (rec === 'Possible') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
      <AlertCircle size={10} /> Possible
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600 border border-red-200">
      <XCircle size={10} /> Weak
    </span>
  );
}

function OverlapBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-400' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
        <div className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-[11px] font-bold text-slate-600 w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
    </div>
  );
}
function TabEntityFBDI({ result, onRunDetection, detecting, hasFbdiFile }: {
  result: KeyDetectionResponse | null;
  onRunDetection: () => void;
  detecting: boolean;
  hasFbdiFile: boolean;
}) {
  if (!hasFbdiFile) return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm">
      <EmptyCard icon={<Database size={28} className="text-slate-400" />}
        title="FBDI / HDL File Required"
        message="Upload a target FBDI or HDL file in the Discovery step to enable entity detection and value-overlap analysis." />
    </div>
  );
  return (
    <div className="bg-white p-6 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-slate-800 font-bold text-lg flex items-center gap-2">
            <Cpu size={20} className="text-indigo-600" /> Oracle Entity Detection
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Backend detects Oracle entity type from FBDI columns, assigns known primary key columns, then computes value-level overlap.
          </p>
        </div>
        <Button icon={detecting ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
          onClick={onRunDetection} loading={detecting} variant="primary"
          className="shadow-md shadow-indigo-200 hover:shadow-lg transition-all">
          {detecting ? 'Analysing Files...' : 'Run Key Detection Engine'}
        </Button>
      </div>
      {result ? (
        <>
          <div className={cn('rounded-2xl p-5 border flex items-start gap-4',
            result.entity_type ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200' : 'bg-amber-50 border-amber-200')}>
            <div className={cn('p-3 rounded-xl shrink-0', result.entity_type ? 'bg-indigo-100' : 'bg-amber-100')}>
              <Database size={22} className={result.entity_type ? 'text-indigo-600' : 'text-amber-600'} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Detected Oracle Entity</p>
              <p className="text-xl font-bold text-slate-900">{result.entity_label ?? 'Unknown Entity'}</p>
              {result.entity_type && (
                <p className="text-xs text-slate-500 mt-1">Key: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono">{result.entity_type}</code></p>
              )}
              {!result.entity_type && (
                <p className="text-sm text-amber-700 mt-1">Entity not recognised — using name-pattern fallback.</p>
              )}
            </div>
            <div className="shrink-0 text-right space-y-1">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] font-bold text-indigo-500 uppercase">Source Rows</p>
                <p className="text-base font-black text-indigo-700">{result.analysis_summary.source_rows?.toLocaleString() ?? '-'}</p>
              </div>
            </div>
          </div>
          {result.fbdi_keys_found.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Layers size={15} className="text-slate-400" />
                Oracle FBDI Primary Key Columns ({result.fbdi_keys_found.length} detected)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.fbdi_keys_found.map((fk, i) => (
                  <motion.div key={fk.col_name}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07 } }}
                    className="bg-white border border-emerald-200 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-emerald-100 p-2 rounded-lg shrink-0"><Key size={16} className="text-emerald-600" /></div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate" title={fk.col_name}>{fk.col_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono truncate">{fk.role}</p>
                      <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{fk.unique_count.toLocaleString()} unique values</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">No Oracle key columns found in FBDI. Running name-pattern ranking only.</p>
            </div>
          )}
          {(result.suggested_source_key || result.suggested_fbdi_key) && (
            <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-3">Auto-Suggested Key Pair</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="bg-white border border-indigo-200 rounded-xl px-4 py-2 text-sm font-bold text-indigo-700">
                  Source: {result.suggested_source_key ?? 'None'}
                </div>
                <ArrowRight size={18} className="text-slate-400 shrink-0" />
                <div className="bg-white border border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold text-emerald-700">
                  FBDI: {result.suggested_fbdi_key ?? 'None'}
                </div>
              </div>
            </div>
          )}
          {result.errors.length > 0 && result.errors.map((e, i) => (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{e}</p>
          ))}
        </>
      ) : (
        <div className="flex items-center gap-4 p-5 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
          <Info size={20} className="text-indigo-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">Ready to run detection</p>
            <p className="text-xs text-indigo-600 mt-0.5">Click the button above to send both files to the backend engine for entity-aware key detection and FBDI value-overlap analysis.</p>
          </div>
        </div>
      )}
    </div>
  );
}
function TabCandidates({ result, sCols, rowCount, selectedSrc, onSelect }: {
  result: KeyDetectionResponse | null; sCols: ColShape[]; rowCount: number;
  selectedSrc: string; onSelect: (src: string, fbdiKey: string | null) => void;
}) {
  if (result && result.candidates.length > 0) {
    return (
      <div className="bg-white p-6 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-800 font-bold text-lg flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" /> Backend Ranked Candidates
          </h3>
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
            {result.candidates.length} candidates · sorted by FBDI overlap
          </span>
        </div>
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
          <Info size={16} className="text-indigo-600 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-800">
            Ranked by: Oracle entity priority → FBDI value overlap % → uniqueness → nulls.
            <strong> FBDI Overlap</strong> = % of FBDI key values that appear in this source column.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[850px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Source Column','Recommendation','FBDI Overlap','FBDI Match','Unique %','Null %','Samples','Action'].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.candidates.map((c, i) => {
                  const isSel = c.column_name === selectedSrc;
                  return (
                    <motion.tr key={c.column_name}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                      className={cn('transition-all', isSel ? 'bg-indigo-50/70' : 'bg-white hover:bg-slate-50')}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full shrink-0', isSel ? 'bg-indigo-500' : 'bg-slate-200')} />
                          <span className="font-bold text-slate-800">{c.column_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4"><RecBadge rec={c.recommendation} /></td>
                      <td className="py-3 px-4 w-36"><OverlapBar pct={c.fbdi_overlap_pct} /></td>
                      <td className="py-3 px-4">
                        {c.fbdi_matched_col
                          ? <span className="text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">{c.fbdi_matched_col}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn('text-xs font-bold', c.uniqueness_pct >= 95 ? 'text-emerald-600' : c.uniqueness_pct >= 80 ? 'text-amber-600' : 'text-red-500')}>
                          {c.uniqueness_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn('text-xs font-bold', c.null_pct === 0 ? 'text-emerald-600' : c.null_pct <= 5 ? 'text-amber-600' : 'text-red-500')}>
                          {c.null_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[150px]">
                        <div className="flex flex-wrap gap-1">
                          {c.sample_values.slice(0, 2).map((v, vi) => (
                            <span key={vi} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono truncate max-w-[68px]" title={v}>{v}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant={isSel ? 'primary' : 'outline'}
                          className={cn('w-24', isSel ? 'ring-2 ring-indigo-200 ring-offset-1' : '')}
                          onClick={() => onSelect(c.column_name, c.fbdi_matched_col)}>
                          {isSel ? <span className="flex items-center gap-1"><CheckCircle2 size={12} />Selected</span> : 'Select'}
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  if (!sCols.length) return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm">
      <EmptyCard icon={<FileSearch size={24} className="text-slate-400" />}
        title="No files uploaded"
        message="Upload source and FBDI files in Discovery, then run the Key Detection Engine in the Entity tab." />
    </div>
  );
  const candidates = sCols.map(sc => {
    const score = keyScore(sc, rowCount);
    const nullPct = rowCount > 0 ? Math.round(((sc.nullCount ?? 0) / rowCount) * 100) : 0;
    const uniqueRatio = rowCount > 0 ? ((sc.uniqueCount ?? 0) / rowCount) * 100 : 0;
    return { source: sc.name, score, confidence: confidenceFromScore(score), nullPct, uniqueRatio: uniqueRatio.toFixed(1) };
  }).filter(c => c.score >= 5).sort((a, b) => b.score - a.score);
  return (
    <div className="bg-white p-6 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm space-y-5">
      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800">Showing <strong>frontend name-pattern analysis only</strong> — run the Key Detection Engine in the Entity tab for FBDI value-overlap analysis.</p>
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[550px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Source Column','Confidence','Nulls','Unique %','Action'].map(h => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c, i) => {
                const isSel = c.source === selectedSrc;
                return (
                  <motion.tr key={c.source}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                    className={cn('transition-all', isSel ? 'bg-indigo-50/60' : 'bg-white hover:bg-slate-50')}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', isSel ? 'bg-indigo-500' : 'bg-slate-200')} />
                        <span className="font-bold text-slate-800">{c.source}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className={cn('h-full rounded-full', c.confidence >= 85 ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${c.confidence}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{c.confidence.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4"><span className={cn('text-xs font-bold', c.nullPct === 0 ? 'text-emerald-600' : 'text-amber-600')}>{c.nullPct}%</span></td>
                    <td className="py-3 px-4"><span className={cn('text-xs font-bold', parseFloat(c.uniqueRatio) >= 95 ? 'text-emerald-600' : 'text-amber-600')}>{c.uniqueRatio}%</span></td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant={isSel ? 'primary' : 'outline'} className="w-24"
                        onClick={() => onSelect(c.source, null)}>
                        {isSel ? <span className="flex items-center gap-1"><CheckCircle2 size={12} />Selected</span> : 'Select'}
                      </Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function TabKeySelection({ sCols, tCols, sourceKey, targetKey, fbdiKey,
  confidence, setSourceKey, setTargetKey, setFbdiKey, onDetect, detecting, batch, result }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string; fbdiKey: string; confidence: number;
  setSourceKey: (s: string) => void; setTargetKey: (s: string) => void; setFbdiKey: (s: string) => void;
  onDetect: () => void; detecting: boolean;
  batch: StepProps['batch']; result: KeyDetectionResponse | null;
}) {
  const fbdiCols = result?.fbdi_keys_found ?? [];
  const activeFbdi = fbdiKey || targetKey;
  const cand = result?.candidates.find(c => c.column_name === sourceKey);
  return (
    <div className="bg-white p-6 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-slate-800 font-bold text-lg flex items-center gap-2">
            <Key size={20} className="text-indigo-600" /> Manual Key Configuration
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">Override auto-detected keys or confirm the suggested pair.</p>
        </div>
        <Button icon={<Zap size={16} />} onClick={onDetect} loading={detecting} variant="outline">Re-run Detection</Button>
      </div>
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 shadow-inner">
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Key Pair Configuration</p>
          {confidence > 0 && (
            <span className={cn('text-xs font-bold px-3 py-1 rounded-full border',
              confidence >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              confidence >= 65 ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-red-50 text-red-600 border-red-200')}>
              {confidence.toFixed(1)}% confidence
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-end">
          <div className="md:col-span-4 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Source Key Column
            </label>
            <select value={sourceKey} onChange={e => setSourceKey(e.target.value)}
              className="w-full px-4 py-3 text-sm font-medium text-slate-800 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all bg-white appearance-none cursor-pointer">
              <option value="">— Select source column —</option>
              {sCols.map(c => <option key={c.name} value={c.name}>{c.name}{c.isPrimaryKeyCandidate ? ' 🔑' : ''}</option>)}
            </select>
          </div>
          <div className="md:col-span-1 flex justify-center pb-1">
            <div className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center">
              <ArrowRight size={18} className="text-indigo-500" />
            </div>
          </div>
          <div className="md:col-span-4 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> FBDI / Target Key Column
            </label>
            <select value={activeFbdi} onChange={e => { setFbdiKey(e.target.value); setTargetKey(e.target.value); }}
              className="w-full px-4 py-3 text-sm font-medium text-slate-800 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all bg-white appearance-none cursor-pointer">
              <option value="">— Select FBDI column —</option>
              {fbdiCols.length > 0 && (
                <optgroup label="Oracle FBDI Primary Keys (Auto-Detected)">
                  {fbdiCols.map(fk => <option key={fk.col_name} value={fk.col_name}>🔑 {fk.col_name} ({fk.unique_count.toLocaleString()} unique)</option>)}
                </optgroup>
              )}
              {tCols.length > 0 && (
                <optgroup label="All Target Columns">
                  {tCols.map(c => <option key={c.name} value={c.name}>{c.name}{c.isPrimaryKeyCandidate ? ' 🔑' : ''}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="md:col-span-2">
            {cand && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">FBDI Overlap</p>
                <p className="text-2xl font-black text-emerald-700">{cand.fbdi_overlap_pct.toFixed(0)}%</p>
              </div>
            )}
          </div>
        </div>
        {sourceKey && activeFbdi && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 mt-4 border-t border-slate-200">
            <StatTile label="Source Rows" value={batch?.sourceFile?.rowCount?.toLocaleString() ?? '—'} color="bg-indigo-50 text-indigo-700" />
            <StatTile label="FBDI Rows" value={batch?.targetFile?.rowCount?.toLocaleString() ?? '—'} color="bg-emerald-50 text-emerald-700" />
            <StatTile label="Value Overlap"
              value={cand ? `${cand.fbdi_overlap_pct.toFixed(1)}%` : '—'}
              color={cand && cand.fbdi_overlap_pct >= 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
          </motion.div>
        )}
      </div>
      {cand && (
        <div className={cn('rounded-xl p-4 border flex items-start gap-3',
          cand.recommendation === 'Strong' ? 'bg-emerald-50 border-emerald-200' :
          cand.recommendation === 'Possible' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200')}>
          <Info size={16} className={cn('mt-0.5 shrink-0',
            cand.recommendation === 'Strong' ? 'text-emerald-600' :
            cand.recommendation === 'Possible' ? 'text-amber-600' : 'text-red-500')} />
          <div>
            <p className="text-xs font-bold text-slate-700 mb-0.5">{cand.recommendation} Recommendation</p>
            <p className="text-xs text-slate-600">{cand.reason}</p>
          </div>
        </div>
      )}
    </div>
  );
}
function TabValidation({ sCols, tCols, sourceKey, targetKey, rowCount, result }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string; rowCount: number;
  result: KeyDetectionResponse | null;
}) {
  if (!sourceKey || !targetKey) return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm">
      <EmptyCard icon={<ShieldCheck size={28} className="text-slate-400" />}
        title="No keys selected"
        message="Select keys in the Key Selection tab first." />
    </div>
  );
  const sCol = sCols.find(c => c.name === sourceKey);
  const tCol = tCols.find(c => c.name === targetKey);
  const cand = result?.candidates.find(c => c.column_name === sourceKey);
  const srcNulls = sCol?.nullCount ?? 0;
  const tgtNulls = tCol?.nullCount ?? 0;
  const srcUnique = sCol?.uniqueCount ?? 0;
  const uniqueThreshold = rowCount > 0 ? rowCount * 0.8 : 1;
  const typeMatch = !tCol || sCol?.dataType === tCol?.dataType;
  const checks = [
    { label: 'Source key has no nulls', pass: srcNulls === 0, detail: srcNulls === 0 ? 'No null values' : `${srcNulls} nulls detected`, skip: false },
    { label: 'FBDI key has no nulls', pass: tgtNulls === 0, detail: tgtNulls === 0 ? 'No null values' : `${tgtNulls} nulls detected`, skip: false },
    { label: 'Source key uniqueness >= 80%', pass: srcUnique >= uniqueThreshold, detail: `${srcUnique.toLocaleString()} unique out of ${rowCount.toLocaleString()} rows`, skip: false },
    { label: 'Data types compatible', pass: typeMatch, detail: typeMatch ? `Both: ${sCol?.dataType}` : `Source: ${sCol?.dataType} | FBDI: ${tCol?.dataType}`, skip: false },
    { label: 'FBDI value overlap >= 50%', pass: (cand?.fbdi_overlap_pct ?? 0) >= 50, detail: cand ? `${cand.fbdi_overlap_pct.toFixed(1)}% match against '${cand.fbdi_matched_col}'` : 'Run Detection Engine first', skip: !cand },
    { label: 'Backend recommendation: Strong', pass: cand?.recommendation === 'Strong', detail: cand?.recommendation ?? 'Run Detection Engine in Entity tab', skip: !cand },
  ];
  const passing = checks.filter(c => c.pass).length;
  const allPass = passing === checks.length;
  return (
    <div className="bg-white p-6 rounded-b-2xl border border-slate-200 border-t-0 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-bold text-lg flex items-center gap-2">
          <ShieldCheck size={22} className={allPass ? 'text-emerald-600' : 'text-amber-500'} />
          Key Integrity Validation
        </h3>
        <span className={cn('text-sm font-bold px-4 py-1.5 rounded-full border',
          allPass ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-amber-100 text-amber-700 border-amber-300')}>
          {passing} / {checks.length} passed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Selected Source Key" value={sourceKey} color="bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" />
        <StatTile label="Selected FBDI Key" value={targetKey} color="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" />
        {cand && <StatTile label="FBDI Overlap"
          value={`${cand.fbdi_overlap_pct.toFixed(1)}%`}
          color={cand.fbdi_overlap_pct >= 50 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'} />}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {checks.map((check, i) => (
            <motion.div key={check.label}
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.05 } }}
              className="flex items-start gap-4 p-5 border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm',
                check.pass ? 'bg-emerald-100 text-emerald-600' : check.skip ? 'bg-slate-100 text-slate-400' : 'bg-red-100 text-red-500')}>
                {check.pass ? <CheckCircle2 size={20} /> : check.skip ? <AlertCircle size={20} /> : <XCircle size={20} />}
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm font-bold text-slate-800 leading-none">{check.label}</p>
                <p className="text-xs text-slate-500 mt-1.5">{check.detail}</p>
              </div>
              <div className="pt-1 shrink-0">
                <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full border',
                  check.pass ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                  check.skip ? 'bg-slate-100 text-slate-500 border-slate-200' :
                  'bg-red-100 text-red-600 border-red-200')}>
                  {check.pass ? 'PASS' : check.skip ? 'N/A' : 'FAIL'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={cn('flex items-center gap-4 p-5 rounded-2xl border',
          allPass ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-emerald-200'
                  : 'bg-gradient-to-r from-amber-50 to-amber-100/50 border-amber-200')}>
        <div className={cn('p-2.5 rounded-full text-white shadow-md',
          allPass ? 'bg-emerald-500 shadow-emerald-200' : 'bg-amber-500 shadow-amber-200')}>
          {allPass ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div>
          <h4 className={cn('font-bold text-sm', allPass ? 'text-emerald-800' : 'text-amber-800')}>
            {allPass ? 'All Checks Passed — Keys Ready for Reconciliation' : `${checks.length - passing} Check(s) Failed — Review Key Selection`}
          </h4>
          <p className={cn('text-xs font-medium mt-0.5', allPass ? 'text-emerald-600' : 'text-amber-600')}>
            {allPass ? 'Proceed to the Rules & Quality step.' : 'Change key selection or run the Detection Engine for better analysis.'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
export function StepKeyDetection({ batch, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { addAudit, dispatch } = useStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('entity');
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<KeyDetectionResponse | null>(null);
  const [sourceKey, setSourceKey] = useState(wizardCtx.sourceKey);
  const [targetKey, setTargetKey] = useState(wizardCtx.targetKey);
  const [fbdiKey, setFbdiKey] = useState('');
  const [confidence, setConfidence] = useState(wizardCtx.keyConfidence);

  const sCols: ColShape[] = batch?.sourceFile?.columns ?? [];
  const tCols: ColShape[] = batch?.targetFile?.columns ?? [];
  const rowCount = batch?.sourceFile?.rowCount ?? 0;
  const hasFbdiFile = !!(batch?.targetFile);

  useEffect(() => {
    if (result?.suggested_source_key && !sourceKey) setSourceKey(result.suggested_source_key);
    if (result?.suggested_fbdi_key && !fbdiKey) { setFbdiKey(result.suggested_fbdi_key); setTargetKey(result.suggested_fbdi_key); }
  }, [result]); // eslint-disable-line

  useEffect(() => {
    if (!sCols.length || !tCols.length || sourceKey) return;
    const best = [...sCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    const tBest = tCols.find(tc => tc.name.toLowerCase() === best?.name.toLowerCase())
      ?? [...tCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    if (best && tBest) {
      setSourceKey(best.name); setTargetKey(tBest.name); setFbdiKey(tBest.name);
      setConfidence(confidenceFromScore(keyScore(best, rowCount)));
    }
  }, [batch?.sourceFile?.id, batch?.targetFile?.id]); // eslint-disable-line

  const runDetection = useCallback(async () => {
    if (!batch?.sourceFile || !batch?.targetFile) {
      toast('Upload both source and FBDI files in the Discovery step first.', 'error');
      return;
    }
    setDetecting(true);
    try {
      let srcBlob: Blob | null = null;
      let fbdiBlob: Blob | null = null;
      if (batch.sourceFile.storagePath) srcBlob = await retrieveBrowserFile(batch.sourceFile.storagePath);
      if (batch.targetFile.storagePath) fbdiBlob = await retrieveBrowserFile(batch.targetFile.storagePath);
      if (!srcBlob || !fbdiBlob) {
        toast('Could not retrieve files. Please re-upload in Discovery step.', 'error');
        setDetecting(false);
        return;
      }
      const srcFile = new File([srcBlob], batch.sourceFile.name, { type: srcBlob.type });
      const fbdiFile = new File([fbdiBlob], batch.targetFile.name, { type: fbdiBlob.type });
      const detection = await detectKeys(srcFile, fbdiFile);
      setResult(detection);
      if (detection.status === 'success') {
        toast(`Entity: ${detection.entity_label} | ${detection.candidates.length} candidates found`, 'success');
        setActiveTab('candidates');
        if (detection.suggested_source_key) setSourceKey(detection.suggested_source_key);
        if (detection.suggested_fbdi_key) { setFbdiKey(detection.suggested_fbdi_key); setTargetKey(detection.suggested_fbdi_key); }
        const cand = detection.candidates.find(c => c.column_name === detection.suggested_source_key);
        if (cand) setConfidence(Math.min(99.5, 40 + cand.fbdi_overlap_pct * 0.6 + cand.uniqueness_pct * 0.4));
      } else {
        toast(`Detection error: ${detection.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      toast(`Backend error: ${err.message}`, 'error');
    } finally {
      setDetecting(false);
    }
  }, [batch, toast]);

  const handleSelect = (src: string, fbdiMatchedCol: string | null) => {
    setSourceKey(src);
    if (fbdiMatchedCol) { setFbdiKey(fbdiMatchedCol); setTargetKey(fbdiMatchedCol); }
    const cand = result?.candidates.find(c => c.column_name === src);
    const col = sCols.find(c => c.name === src);
    if (cand) setConfidence(Math.min(99.5, 40 + cand.fbdi_overlap_pct * 0.6 + cand.uniqueness_pct * 0.4));
    else if (col) setConfidence(confidenceFromScore(keyScore(col, rowCount)));
    setActiveTab('selection');
  };

  const handleAdvance = () => {
    if (!sourceKey) return;
    const finalTarget = fbdiKey || targetKey;
    if (batch) {
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, sourceKey, targetKey: finalTarget, keyConfidence: confidence, updatedAt: new Date().toISOString() } });
      addAudit('KEY_DETECTED', 'Batch', batch.id, batch.name, `Keys: ${sourceKey} -> ${finalTarget} (${confidence.toFixed(1)}% confidence)`);
    }
    onCtxChange({ sourceKey, targetKey: finalTarget, keyConfidence: confidence });
    onAdvance();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-0">
      <div className="bg-white p-2 rounded-t-xl border border-slate-200 border-b-0">
        <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'entity' && (
            <TabEntityFBDI result={result} onRunDetection={runDetection} detecting={detecting} hasFbdiFile={hasFbdiFile} />
          )}
          {activeTab === 'candidates' && (
            <TabCandidates result={result} sCols={sCols} rowCount={rowCount} selectedSrc={sourceKey} onSelect={handleSelect} />
          )}
          {activeTab === 'selection' && (
            <TabKeySelection sCols={sCols} tCols={tCols} sourceKey={sourceKey} targetKey={targetKey}
              fbdiKey={fbdiKey} confidence={confidence}
              setSourceKey={setSourceKey} setTargetKey={setTargetKey} setFbdiKey={setFbdiKey}
              onDetect={runDetection} detecting={detecting} batch={batch} result={result} />
          )}
          {activeTab === 'validation' && (
            <TabValidation sCols={sCols} tCols={tCols} sourceKey={sourceKey}
              targetKey={fbdiKey || targetKey} rowCount={rowCount} result={result} />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="mt-5">
        <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Rules" nextDisabled={!sourceKey} />
      </div>
    </div>
  );
}