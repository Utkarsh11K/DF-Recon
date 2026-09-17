'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Zap, CheckCircle2, XCircle, AlertTriangle, Search, Info, ChevronRight, FileSearch, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { StepSubNav, StepFooter, EmptyCard, StatTile } from './shared';
import type { StepProps } from './shared';

type ColShape = {
  name: string;
  dataType: string;
  isPrimaryKeyCandidate: boolean;
  nullCount?: number;
  uniqueCount?: number;
};

const TABS = [
  { id: 'candidates', label: 'Candidate Keys', icon: <Search size={14} /> },
  { id: 'selection',  label: 'Key Selection',  icon: <Key size={14} /> },
  { id: 'validation', label: 'Key Validation',  icon: <ShieldCheck size={14} /> },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Candidate Keys tab ────────────────────────────────────────────────────────
function TabCandidateKeys({ sCols, tCols, rowCount, selectedSrc, onSelect }: {
  sCols: ColShape[]; tCols: ColShape[];
  rowCount: number;
  selectedSrc: string;
  onSelect: (src: string, tgt: string) => void;
}) {
  if (!sCols.length) return (
    <EmptyCard icon={<FileSearch size={22} className="text-slate-400" />}
      title="No files uploaded"
      message="Upload source and target files in the Discovery step first." />
  );

  const candidates = sCols
    .map(sc => {
      const score = keyScore(sc, rowCount);
      const nullPct = rowCount > 0 ? Math.round(((sc.nullCount ?? 0) / rowCount) * 100) : 0;
      const uniqueRatio = rowCount > 0 ? ((sc.uniqueCount ?? 0) / rowCount) * 100 : 0;
      const tMatch = tCols.find(tc =>
        tc.name === sc.name ||
        tc.name.toLowerCase() === sc.name.toLowerCase() ||
        tc.name.replace(/[_\s]/g, '').toLowerCase() === sc.name.replace(/[_\s]/g, '').toLowerCase()
      ) ?? tCols.find(tc => keyScore(tc, rowCount) >= 30);
      return {
        source: sc.name,
        target: tMatch?.name ?? '—',
        score,
        confidence: confidenceFromScore(score),
        nullPct,
        uniqueRatio: uniqueRatio.toFixed(1),
      };
    })
    .filter(c => c.score >= 5)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return (
    <EmptyCard icon={<Key size={22} className="text-slate-400" />}
      title="No key candidates detected"
      message="No columns with sufficient uniqueness found. Use the Key Selection tab to pick keys manually." />
  );

  return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)] space-y-6">
      
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
          <Search size={20} className="text-indigo-600" /> Discovered Candidate Keys
        </h3>
      </div>

      <div className="flex items-center gap-3 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
        <div className="bg-indigo-100 p-2 rounded-lg shrink-0">
          <Info size={18} className="text-indigo-600" />
        </div>
        <p className="text-sm text-indigo-800">
          We have ranked the potential keys by uniqueness ratio, null percentage, and column name patterns. Click <strong>Select</strong> to link a pair.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Source Column', 'Target Match', 'Confidence', 'Nulls', 'Unique', 'Action'].map(h => (
                  <th key={h} className="text-left py-3 px-5 font-semibold text-slate-600 text-xs tracking-wider uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c, i) => {
                const isSelected = c.source === selectedSrc;
                return (
                  <motion.tr key={c.source}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                    className={cn('transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md relative', 
                      isSelected ? 'bg-indigo-50/60 z-10' : 'bg-white hover:bg-slate-50 z-0')}
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-indigo-500" : "bg-slate-300")} />
                        <span className="font-semibold text-slate-800">{c.source}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      {c.target !== '—'
                        ? <span className="font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{c.target}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/50">
                          <div className={cn("h-full rounded-full transition-all duration-1000", c.confidence >= 85 ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${c.confidence}%` }} />
                        </div>
                        <span className={cn('font-bold text-xs', c.confidence >= 85 ? 'text-emerald-600' : 'text-indigo-600')}>
                          {c.confidence.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <Badge variant={c.nullPct > 5 ? 'error' : 'default'} className="px-2 py-0.5 rounded-full text-[11px]">
                        {c.nullPct}% null
                      </Badge>
                    </td>
                    <td className="py-3 px-5">
                      <Badge variant={parseFloat(c.uniqueRatio) >= 95 ? 'success' : 'warning'} className="px-2 py-0.5 rounded-full text-[11px]">
                        {c.uniqueRatio}% uniq
                      </Badge>
                    </td>
                    <td className="py-3 px-5">
                      <Button size="sm" variant={isSelected ? 'primary' : 'outline'}
                        className={cn("w-28 shadow-sm", isSelected ? "ring-2 ring-indigo-200 ring-offset-1" : "")}
                        onClick={() => onSelect(c.source, c.target !== '—' ? c.target : tCols[0]?.name ?? '')}>
                        {isSelected ? <span className="flex items-center justify-center"><CheckCircle2 size={14} className="mr-1.5" /> Selected</span> : 'Select Pair'}
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

// ── Key Selection tab ─────────────────────────────────────────────────────────
function TabKeySelection({ sCols, tCols, sourceKey, targetKey, confidence,
  setSourceKey, setTargetKey, onDetect, detecting, batch }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string; confidence: number;
  setSourceKey: (s: string) => void; setTargetKey: (s: string) => void;
  onDetect: () => void; detecting: boolean;
  batch: StepProps['batch'];
}) {
  const rowCount = batch?.sourceFile?.rowCount ?? 0;

  return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)] space-y-8">
      
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
            <Key size={20} className="text-indigo-600" /> Manual Key Configuration
          </h3>
          <p className="text-sm text-slate-500 mt-1">Select the primary identifiers mapping the source to the target.</p>
        </div>
        <Button icon={<Zap size={16} />} onClick={onDetect} loading={detecting} variant="primary" className="shadow-md shadow-indigo-200 hover:shadow-lg transition-all">
          Auto-Detect Best Match
        </Button>
      </div>

      <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 shadow-inner relative overflow-hidden">
        {/* Decorative BG element */}
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Key size={120} className="text-indigo-900 rotate-12" />
        </div>

        <div className="flex items-center justify-between mb-6 relative z-10">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Configure Mapping</h4>
          {confidence > 0 && (
            <Badge variant={confidence >= 85 ? 'success' : confidence >= 65 ? 'warning' : 'error'} className="px-3 py-1 text-xs">
              {confidence.toFixed(1)}% confidence score
            </Badge>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center relative z-10">
          
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              <span className="w-2 h-2 inline-block bg-indigo-500 rounded-full mr-2"></span>Source Dataset Key
            </label>
            <div className="relative">
              <select value={sourceKey} onChange={e => setSourceKey(e.target.value)}
                className="w-full pl-4 pr-10 py-3 text-sm font-medium text-slate-800 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all appearance-none bg-white hover:border-indigo-300 shadow-sm cursor-pointer">
                <option value="">— Choose a source column —</option>
                {sCols.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} {c.isPrimaryKeyCandidate ? ' 🔑' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight size={16} className="text-slate-400 rotate-90" />
              </div>
            </div>
          </div>

          <div className="md:col-span-1 flex justify-center py-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
              <ArrowRight size={20} />
            </div>
          </div>

          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              <span className="w-2 h-2 inline-block bg-emerald-500 rounded-full mr-2"></span>Target Dataset Key
            </label>
            <div className="relative">
              <select value={targetKey} onChange={e => setTargetKey(e.target.value)}
                className="w-full pl-4 pr-10 py-3 text-sm font-medium text-slate-800 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all appearance-none bg-white hover:border-emerald-300 shadow-sm cursor-pointer">
                <option value="">— Choose a target column —</option>
                {tCols.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} {c.isPrimaryKeyCandidate ? ' 🔑' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight size={16} className="text-slate-400 rotate-90" />
              </div>
            </div>
          </div>
        </div>

        {sourceKey && targetKey && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 mt-4 border-t border-slate-200/60 relative z-10">
            <StatTile label="Source Dataset Size" value={batch?.sourceFile?.rowCount?.toLocaleString() ?? '—'} color="bg-indigo-50/80 text-indigo-700" />
            <StatTile label="Target Dataset Size" value={batch?.targetFile?.rowCount?.toLocaleString() ?? '—'} color="bg-emerald-50/80 text-emerald-700" />
            <StatTile label="Max Potential Matches"
              value={batch?.sourceFile && batch?.targetFile
                ? Math.min(batch.sourceFile.rowCount, batch.targetFile.rowCount).toLocaleString()
                : '—'}
              color="bg-violet-50/80 text-violet-700" />
          </motion.div>
        )}
      </div>

      {sCols.length > 0 && tCols.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-5 flex items-center gap-2">
            <Search size={16} className="text-slate-400" /> Column Uniqueness Profile (Top 8)
          </h3>
          <div className="space-y-3">
            {sCols.slice(0, 8).map((col, idx) => {
              const match = tCols.find(t =>
                t.name === col.name ||
                t.name.toLowerCase() === col.name.toLowerCase() ||
                t.name.replace(/[_\s]/g, '').toLowerCase() === col.name.replace(/[_\s]/g, '').toLowerCase()
              );
              const uniqueRatio = rowCount > 0 ? Math.min(100, Math.round(((col.uniqueCount ?? 0) / rowCount) * 100)) : 0;
              return (
                <motion.div key={col.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05 } }} className="flex items-center gap-4 group">
                  <span className="text-xs font-mono font-medium text-slate-700 w-36 truncate group-hover:text-indigo-600 transition-colors">{col.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 shadow-inner border border-slate-200/50">
                    <div className={cn("h-full rounded-full transition-all duration-1000", uniqueRatio > 90 ? 'bg-emerald-400' : 'bg-indigo-400')}
                      style={{ width: `${uniqueRatio}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-500 w-12 text-right">{uniqueRatio}%</span>
                  {match
                    ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 drop-shadow-sm" />
                    : <span className="text-xs text-slate-300 w-4 flex justify-center">—</span>}
                  <span className={cn("text-xs w-36 truncate font-medium", match ? "text-slate-600" : "text-slate-400 italic")}>{match?.name ?? 'no exact match'}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Key Validation tab ────────────────────────────────────────────────────────
function TabKeyValidation({ sCols, tCols, sourceKey, targetKey, rowCount }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string;
  rowCount: number;
}) {
  if (!sourceKey || !targetKey) return (
    <EmptyCard icon={<ShieldCheck size={28} className="text-slate-400" />}
      title="No keys selected for validation"
      message="Go back to the Key Selection tab to choose the primary keys." />
  );

  const sCol = sCols.find(c => c.name === sourceKey);
  const tCol = tCols.find(c => c.name === targetKey);

  const srcNulls = sCol?.nullCount ?? 0;
  const tgtNulls = tCol?.nullCount ?? 0;
  const srcUnique = sCol?.uniqueCount ?? 0;
  const tgtUnique = tCol?.uniqueCount ?? 0;
  const uniqueThreshold = rowCount > 0 ? rowCount * 0.8 : 1;
  const typeMatch = sCol?.dataType === tCol?.dataType;

  const checks = [
    {
      label: 'Source key has no nulls',
      pass: srcNulls === 0,
      detail: srcNulls === 0 ? 'No null values found' : `${srcNulls} null values detected`,
    },
    {
      label: 'Target key has no nulls',
      pass: tgtNulls === 0,
      detail: tgtNulls === 0 ? 'No null values found' : `${tgtNulls} null values detected`,
    },
    {
      label: 'Source key is unique (>80%)',
      pass: srcUnique >= uniqueThreshold,
      detail: `${srcUnique.toLocaleString()} unique values out of ${rowCount.toLocaleString()} rows`,
    },
    {
      label: 'Target key is unique (>80%)',
      pass: tgtUnique >= (rowCount > 0 ? rowCount * 0.8 : 1),
      detail: `${tgtUnique.toLocaleString()} unique values`,
    },
    {
      label: 'Data types match',
      pass: typeMatch,
      detail: typeMatch ? `Both are ${sCol?.dataType}` : `Source: ${sCol?.dataType}, Target: ${tCol?.dataType}`,
    },
    {
      label: 'Columns exist in both datasets',
      pass: !!sCol && !!tCol,
      detail: sCol && tCol ? 'Confirmed present' : 'Missing column',
    },
  ];

  const passing = checks.filter(c => c.pass).length;
  const allPass = passing === checks.length;

  return (
    <div className="bg-white p-8 rounded-b-2xl border border-slate-200 border-t-0 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)] space-y-8">
      
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
          <ShieldCheck size={22} className={allPass ? "text-emerald-600" : "text-amber-500"} /> Integrity Validation
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Checks Passed" value={`${passing} / ${checks.length}`}
          color={allPass ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'} />
        <StatTile label="Selected Source" value={sourceKey} color="bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" />
        <StatTile label="Selected Target"  value={targetKey}  color="bg-violet-50 text-violet-700 ring-1 ring-violet-200" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 border-b border-slate-100 last:border-b-0">
          {checks.map((check, i) => (
            <motion.div key={check.label}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.05 } }}
              className="flex items-start gap-4 p-5 hover:bg-slate-50/80 transition-colors border-b border-slate-100">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ring-1 ring-offset-2',
                check.pass ? 'bg-emerald-100 ring-emerald-100 text-emerald-600' : 'bg-red-100 ring-red-100 text-red-500')}>
                {check.pass ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm font-bold text-slate-800 leading-none">{check.label}</p>
                <p className="text-xs font-medium text-slate-500 mt-2">{check.detail}</p>
              </div>
              <div className="pt-0.5">
                <Badge variant={check.pass ? 'success' : 'error'} className="shadow-sm">
                  {check.pass ? 'Passed' : 'Failed'}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {allPass ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 p-5 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl shadow-sm">
          <div className="bg-emerald-500 p-2 rounded-full text-white shadow-md shadow-emerald-200">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h4 className="text-emerald-800 font-bold text-sm">Validation Successful</h4>
            <p className="text-emerald-600 text-xs font-medium mt-0.5">All integrity checks passed. Keys are ready for data reconciliation.</p>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 p-5 bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200 rounded-2xl shadow-sm">
          <div className="bg-amber-500 p-2 rounded-full text-white shadow-md shadow-amber-200">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h4 className="text-amber-800 font-bold text-sm">Validation Issues Detected</h4>
            <p className="text-amber-600 text-xs font-medium mt-0.5">
              {checks.length - passing} check{checks.length - passing > 1 ? 's' : ''} failed. Please review key selection or data quality.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepKeyDetection({ batch, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { addAudit, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState('candidates');
  const [detecting, setDetecting] = useState(false);
  const [sourceKey, setSourceKey] = useState(wizardCtx.sourceKey);
  const [targetKey, setTargetKey] = useState(wizardCtx.targetKey);
  const [confidence, setConfidence] = useState(wizardCtx.keyConfidence);

  const sCols: ColShape[] = batch?.sourceFile?.columns ?? [];
  const tCols: ColShape[] = batch?.targetFile?.columns ?? [];
  const rowCount = batch?.sourceFile?.rowCount ?? 0;

  useEffect(() => {
    if (!sCols.length || !tCols.length) return;
    const best = [...sCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    const tBest = tCols.find(tc =>
      tc.name === best?.name ||
      tc.name.toLowerCase() === best?.name.toLowerCase() ||
      tc.name.replace(/[_\s]/g, '').toLowerCase() === best?.name.replace(/[_\s]/g, '').toLowerCase()
    ) ?? [...tCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    if (best && tBest && !sourceKey) {
      setSourceKey(best.name);
      setTargetKey(tBest.name);
      setConfidence(confidenceFromScore(keyScore(best, rowCount)));
    }
  }, [batch?.sourceFile?.id, batch?.targetFile?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const autoDetect = () => {
    setDetecting(true);
    setTimeout(() => {
      const best = [...sCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
      const tBest = tCols.find(tc =>
        tc.name === best?.name ||
        tc.name.toLowerCase() === best?.name.toLowerCase() ||
        tc.name.replace(/[_\s]/g, '').toLowerCase() === best?.name.replace(/[_\s]/g, '').toLowerCase()
      ) ?? [...tCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
      const sk = best?.name ?? '';
      const tk = tBest?.name ?? '';
      setSourceKey(sk);
      setTargetKey(tk);
      setConfidence(confidenceFromScore(keyScore(best ?? sCols[0], rowCount)));
      setDetecting(false);
      setActiveTab('validation');
    }, 1200);
  };

  const handleSelect = (src: string, tgt: string) => {
    setSourceKey(src);
    setTargetKey(tgt);
    const col = sCols.find(c => c.name === src);
    setConfidence(confidenceFromScore(keyScore(col ?? { name: src, dataType: 'string', isPrimaryKeyCandidate: false }, rowCount)));
    setActiveTab('selection');
  };

  const handleAdvance = () => {
    if (!sourceKey || !targetKey) return;
    if (batch && sourceKey && targetKey) {
      dispatch({ type: 'UPDATE_BATCH', payload: { ...batch, sourceKey, targetKey, keyConfidence: confidence, updatedAt: new Date().toISOString() } });
      addAudit('KEY_DETECTED', 'Batch', batch.id, batch.name,
        `Keys: ${sourceKey} → ${targetKey} (confidence: ${formatPercent(confidence)})`);
    }
    onCtxChange({ sourceKey, targetKey, keyConfidence: confidence });
    onAdvance();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-5">
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Key Detection</h2>
          <p className="text-sm text-slate-500 mt-1">
            Detect and validate primary keys used to match source and target records.
            {!batch?.sourceFile && (
              <span className="text-amber-600 ml-1">(Upload files in Discovery to detect keys.)</span>
            )}
          </p>
        </div>
      </div>

      <div className="bg-white p-2 rounded-t-xl border border-slate-200 border-b-0">
        <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'candidates' && (
            <TabCandidateKeys
              sCols={sCols} tCols={tCols} rowCount={rowCount}
              selectedSrc={sourceKey} onSelect={handleSelect} />
          )}
          {activeTab === 'selection' && (
            <TabKeySelection
              sCols={sCols} tCols={tCols}
              sourceKey={sourceKey} targetKey={targetKey} confidence={confidence}
              setSourceKey={setSourceKey} setTargetKey={setTargetKey}
              onDetect={autoDetect} detecting={detecting} batch={batch} />
          )}
          {activeTab === 'validation' && (
            <TabKeyValidation
              sCols={sCols} tCols={tCols}
              sourceKey={sourceKey} targetKey={targetKey} rowCount={rowCount} />
          )}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Rules" />
    </div>
  );
}
