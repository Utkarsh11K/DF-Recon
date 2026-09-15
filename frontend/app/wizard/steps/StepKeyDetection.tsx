'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Zap, CheckCircle2, XCircle, AlertTriangle, Search, Info } from 'lucide-react';
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
  { id: 'candidates', label: 'Candidate Keys', icon: <Search size={12} /> },
  { id: 'selection',  label: 'Key Selection',  icon: <Key size={12} /> },
  { id: 'validation', label: 'Key Validation',  icon: <CheckCircle2 size={12} /> },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Score a column as a key candidate based on name + null/unique ratio
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
    <EmptyCard icon={<Key size={22} className="text-slate-400" />}
      title="No files uploaded"
      message="Upload source and target files in the Discovery step first." />
  );

  // Build scored candidates from ALL source columns
  const candidates = sCols
    .map(sc => {
      const score = keyScore(sc, rowCount);
      const nullPct = rowCount > 0 ? Math.round(((sc.nullCount ?? 0) / rowCount) * 100) : 0;
      const uniqueRatio = rowCount > 0 ? ((sc.uniqueCount ?? 0) / rowCount) * 100 : 0;
      // Find best matching target column
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">
          Candidates ranked by uniqueness ratio, null %, and column name patterns. Click <strong>Select</strong> to use a pair.
        </p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Source Column', 'Target Column', 'Confidence', 'Null %', 'Unique %', 'Action'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c, i) => {
              const isSelected = c.source === selectedSrc;
              return (
                <motion.tr key={c.source}
                  initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.04 } }}
                  className={cn('hover:bg-slate-50 transition-colors', isSelected && 'bg-indigo-50')}>
                  <td className="py-2.5 px-4">
                    <code className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{c.source}</code>
                  </td>
                  <td className="py-2.5 px-4">
                    {c.target !== '—'
                      ? <code className="text-xs bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium">{c.target}</code>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${c.confidence}%` }} />
                      </div>
                      <span className={cn('font-semibold', c.confidence >= 85 ? 'text-emerald-600' : 'text-amber-600')}>
                        {c.confidence.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={cn('font-medium', c.nullPct > 5 ? 'text-red-600' : 'text-slate-600')}>{c.nullPct}%</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={cn('font-medium', parseFloat(c.uniqueRatio) >= 95 ? 'text-emerald-600' : 'text-amber-600')}>{c.uniqueRatio}%</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Button size="sm" variant={isSelected ? 'primary' : 'outline'}
                      onClick={() => onSelect(c.source, c.target !== '—' ? c.target : tCols[0]?.name ?? '')}>
                      {isSelected ? '✓ Selected' : 'Select'}
                    </Button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
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
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-600">Manually select or auto-detect the primary key columns for matching records.</p>
        <Button icon={<Zap size={14} />} onClick={onDetect} loading={detecting} variant="secondary" size="sm">
          Auto-Detect Keys
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Key size={15} /> Key Column Configuration</h3>
          {confidence > 0 && (
            <Badge variant={confidence >= 85 ? 'success' : confidence >= 65 ? 'warning' : 'error'}>
              {confidence.toFixed(1)}% confidence
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-1.5">
              <span className="text-indigo-600 font-bold">S</span> Source Key Column
            </label>
            <select value={sourceKey} onChange={e => setSourceKey(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— select column —</option>
              {sCols.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.dataType}){c.isPrimaryKeyCandidate ? ' 🔑' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-1.5">
              <span className="text-violet-600 font-bold">T</span> Target Key Column
            </label>
            <select value={targetKey} onChange={e => setTargetKey(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— select column —</option>
              {tCols.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.dataType}){c.isPrimaryKeyCandidate ? ' 🔑' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourceKey && targetKey && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3 pt-2">
            <StatTile label="Source Records" value={batch?.sourceFile?.rowCount?.toLocaleString() ?? '—'} color="bg-indigo-50 text-indigo-700" />
            <StatTile label="Target Records" value={batch?.targetFile?.rowCount?.toLocaleString() ?? '—'} color="bg-violet-50 text-violet-700" />
            <StatTile label="Potential Matches"
              value={batch?.sourceFile && batch?.targetFile
                ? Math.min(batch.sourceFile.rowCount, batch.targetFile.rowCount).toLocaleString()
                : '—'}
              color="bg-emerald-50 text-emerald-700" />
          </motion.div>
        )}
      </div>

      {/* Column overlap — real match check */}
      {sCols.length > 0 && tCols.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Column Name Overlap</h3>
          <div className="space-y-2">
            {sCols.slice(0, 8).map(col => {
              const match = tCols.find(t =>
                t.name === col.name ||
                t.name.toLowerCase() === col.name.toLowerCase() ||
                t.name.replace(/[_\s]/g, '').toLowerCase() === col.name.replace(/[_\s]/g, '').toLowerCase()
              );
              const uniqueRatio = rowCount > 0 ? Math.min(100, Math.round(((col.uniqueCount ?? 0) / rowCount) * 100)) : 0;
              return (
                <div key={col.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-600 w-32 truncate">{col.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-indigo-400 transition-all duration-500"
                      style={{ width: `${uniqueRatio}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right">{uniqueRatio}%</span>
                  {match
                    ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    : <span className="text-xs text-slate-300 w-3">—</span>}
                  <span className="text-xs text-slate-400 w-28 truncate">{match?.name ?? 'no match'}</span>
                </div>
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
    <EmptyCard icon={<CheckCircle2 size={22} className="text-slate-400" />}
      title="No keys selected"
      message="Select source and target key columns in the Key Selection tab first." />
  );

  const sCol = sCols.find(c => c.name === sourceKey);
  const tCol = tCols.find(c => c.name === targetKey);

  const srcNulls = sCol?.nullCount ?? 0;
  const tgtNulls = tCol?.nullCount ?? 0;
  const srcUnique = sCol?.uniqueCount ?? 0;
  const tgtUnique = tCol?.uniqueCount ?? 0;
  // Use 80% of rowCount as uniqueness threshold (works for any file size)
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
      label: 'Key columns exist in both files',
      pass: !!sCol && !!tCol,
      detail: sCol && tCol ? 'Both columns confirmed present' : 'One or both columns missing',
    },
  ];

  const passing = checks.filter(c => c.pass).length;
  const allPass = passing === checks.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Checks Passed" value={`${passing}/${checks.length}`}
          color={allPass ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
        <StatTile label="Source Key" value={sourceKey} color="bg-indigo-50 text-indigo-700" />
        <StatTile label="Target Key"  value={targetKey}  color="bg-violet-50 text-violet-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {checks.map((check, i) => (
          <motion.div key={check.label}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
            className="flex items-center gap-3 px-4 py-3">
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0',
              check.pass ? 'bg-emerald-50' : 'bg-red-50')}>
              {check.pass
                ? <CheckCircle2 size={14} className="text-emerald-500" />
                : <XCircle size={14} className="text-red-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">{check.label}</p>
              <p className="text-xs text-slate-400">{check.detail}</p>
            </div>
            <Badge variant={check.pass ? 'success' : 'error'}>{check.pass ? 'Pass' : 'Fail'}</Badge>
          </motion.div>
        ))}
      </div>

      {allPass ? (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={15} className="text-emerald-500" />
          <p className="text-xs text-emerald-700 font-medium">All validation checks passed — keys are ready for reconciliation.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={15} className="text-amber-500" />
          <p className="text-xs text-amber-700">
            {checks.length - passing} check{checks.length - passing > 1 ? 's' : ''} failed. Review key selection or fix data quality issues.
          </p>
        </div>
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

  // Auto-init: pick best key candidate whenever files change
  useEffect(() => {
    if (!sCols.length || !tCols.length) return;
    const best = [...sCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    const tBest = tCols.find(tc =>
      tc.name === best?.name ||
      tc.name.toLowerCase() === best?.name.toLowerCase() ||
      tc.name.replace(/[_\s]/g, '').toLowerCase() === best?.name.replace(/[_\s]/g, '').toLowerCase()
    ) ?? [...tCols].sort((a, b) => keyScore(b, rowCount) - keyScore(a, rowCount))[0];
    if (best && tBest) {
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
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Key Detection</h2>
        <p className="text-sm text-slate-500 mt-1">
          Detect and validate primary keys used to match source and target records.
          {!batch?.sourceFile && (
            <span className="text-amber-600 ml-1">(Upload files in Discovery to detect keys.)</span>
          )}
        </p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

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
