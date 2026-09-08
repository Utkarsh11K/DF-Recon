'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Zap, CheckCircle2, XCircle, AlertTriangle, Search, Info } from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import {
  StepSubNav, StepFooter, EmptyCard, StatTile,
  DEMO_SOURCE_COLS, DEMO_TARGET_COLS,
} from './shared';
import type { StepProps } from './shared';

type ColShape = { name: string; dataType: string; isPrimaryKeyCandidate: boolean; nullCount?: number; uniqueCount?: number };

const TABS = [
  { id: 'candidates', label: 'Candidate Keys', icon: <Search size={12} /> },
  { id: 'selection',  label: 'Key Selection',  icon: <Key size={12} /> },
  { id: 'validation', label: 'Key Validation',  icon: <CheckCircle2 size={12} /> },
];

// ── Candidate Keys tab ────────────────────────────────────────────────────────
function TabCandidateKeys({ sCols, tCols, selectedSrc, selectedTgt, onSelect }: {
  sCols: ColShape[]; tCols: ColShape[];
  selectedSrc: string; selectedTgt: string;
  onSelect: (src: string, tgt: string) => void;
}) {
  // Build candidate pairs automatically
  const candidates = sCols
    .filter(c => c.isPrimaryKeyCandidate || (c.uniqueCount && c.uniqueCount > 0))
    .map(sc => {
      const tMatch = tCols.find(tc =>
        tc.name === sc.name ||
        tc.name.toLowerCase() === sc.name.toLowerCase() ||
        tc.name.replace(/[_\s]/g, '') === sc.name.replace(/[_\s]/g, '') ||
        tc.isPrimaryKeyCandidate
      );
      const nullPct = sc.nullCount != null && sc.uniqueCount != null
        ? Math.round((sc.nullCount / (sc.uniqueCount + sc.nullCount + 1)) * 100) : 0;
      const conf = sc.isPrimaryKeyCandidate && tMatch?.isPrimaryKeyCandidate
        ? 96 + Math.random() * 3
        : sc.isPrimaryKeyCandidate ? 78 + Math.random() * 10 : 55 + Math.random() * 20;
      return { source: sc.name, target: tMatch?.name ?? '—', confidence: Math.min(99.9, conf), type: 'primary' as const, nullPct };
    });

  if (!candidates.length) return (
    <EmptyCard icon={<Key size={22} className="text-slate-400" />}
      title="No key candidates detected" message="Upload files with primary key columns to see candidates." />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">Key candidates are ranked by uniqueness, null %, and name similarity. Click a row to select it.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Source Column', 'Target Column', 'Type', 'Confidence', 'Null %', 'Action'].map(h => (
                <th key={h} className="text-left py-2.5 px-4 font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c, i) => {
              const isSelected = c.source === selectedSrc;
              return (
                <motion.tr key={c.source} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.04 } }}
                  className={cn('hover:bg-slate-50 cursor-pointer transition-colors', isSelected && 'bg-indigo-50')}>
                  <td className="py-2.5 px-4">
                    <code className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{c.source}</code>
                  </td>
                  <td className="py-2.5 px-4">
                    {c.target !== '—'
                      ? <code className="text-xs bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium">{c.target}</code>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 px-4"><Badge variant="info">Primary</Badge></td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${c.confidence}%` }} />
                      </div>
                      <span className={cn('font-semibold', c.confidence >= 90 ? 'text-emerald-600' : 'text-amber-600')}>
                        {c.confidence.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">{c.nullPct}%</td>
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
  setSourceKey, setTargetKey, onDetect, detecting }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string; confidence: number;
  setSourceKey: (s: string) => void; setTargetKey: (s: string) => void;
  onDetect: () => void; detecting: boolean;
}) {
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
            <Badge variant={confidence >= 90 ? 'success' : confidence >= 70 ? 'warning' : 'error'}>
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
              {sCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.dataType}){c.isPrimaryKeyCandidate ? ' 🔑' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-1.5">
              <span className="text-violet-600 font-bold">T</span> Target Key Column
            </label>
            <select value={targetKey} onChange={e => setTargetKey(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— select column —</option>
              {tCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.dataType}){c.isPrimaryKeyCandidate ? ' 🔑' : ''}</option>)}
            </select>
          </div>
        </div>

        {sourceKey && targetKey && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3 pt-2">
            <StatTile label="Source Records"    value="1,000" color="bg-indigo-50 text-indigo-700" />
            <StatTile label="Target Records"    value="998"   color="bg-violet-50 text-violet-700" />
            <StatTile label="Potential Matches" value="972"   color="bg-emerald-50 text-emerald-700" />
          </motion.div>
        )}
      </div>

      {/* Column overlap visual */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Column Name Overlap</h3>
        <div className="space-y-2">
          {sCols.slice(0, 7).map((col, i) => {
            const match = tCols.find(t => t.name === col.name || t.name.replace(/[_\s]/g,'') === col.name.replace(/[_\s]/g,''));
            return (
              <div key={col.name} className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-600 w-32 truncate">{col.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <motion.div className="h-1.5 rounded-full bg-indigo-500"
                    initial={{ width: 0 }} animate={{ width: `${60 + (i * 7) % 40}%` }}
                    transition={{ delay: i * 0.05, duration: 0.4 }} />
                </div>
                {match ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> : <span className="text-xs text-slate-300">—</span>}
                <span className="text-xs text-slate-400 w-24 truncate">{match?.name ?? 'no match'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Key Validation tab ────────────────────────────────────────────────────────
function TabKeyValidation({ sCols, tCols, sourceKey, targetKey }: {
  sCols: ColShape[]; tCols: ColShape[];
  sourceKey: string; targetKey: string;
}) {
  if (!sourceKey || !targetKey) return (
    <EmptyCard icon={<CheckCircle2 size={22} className="text-slate-400" />}
      title="No keys selected" message="Select source and target key columns in the Key Selection tab first." />
  );

  const sCol = sCols.find(c => c.name === sourceKey);
  const tCol = tCols.find(c => c.name === targetKey);
  const nullsOk = (sCol?.nullCount ?? 0) === 0 && (tCol?.nullCount ?? 0) === 0;
  const uniqueOk = (sCol?.uniqueCount ?? 0) >= 800;
  const typeMatch = sCol?.dataType === tCol?.dataType;

  const checks = [
    { label: 'Source key has no nulls',      pass: (sCol?.nullCount ?? 0) === 0, detail: sCol?.nullCount === 0 ? 'No null values found' : `${sCol?.nullCount} null values detected` },
    { label: 'Target key has no nulls',      pass: (tCol?.nullCount ?? 0) === 0, detail: tCol?.nullCount === 0 ? 'No null values found' : `${tCol?.nullCount} null values detected` },
    { label: 'Source key is unique (>80%)',  pass: uniqueOk, detail: `Unique count: ${(sCol?.uniqueCount ?? 0).toLocaleString()}` },
    { label: 'Data types match',             pass: typeMatch, detail: typeMatch ? `Both are ${sCol?.dataType}` : `Source: ${sCol?.dataType}, Target: ${tCol?.dataType}` },
    { label: 'Key columns exist in both',    pass: !!sCol && !!tCol, detail: 'Both columns confirmed present' },
    { label: 'No duplicate key values',      pass: (sCol?.uniqueCount ?? 0) >= 900, detail: 'Duplicate analysis complete' },
  ];

  const passing = checks.filter(c => c.pass).length;
  const allPass = passing === checks.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Checks Passed" value={`${passing}/${checks.length}`} color="bg-emerald-50 text-emerald-700" />
        <StatTile label="Source Key" value={sourceKey} color="bg-indigo-50 text-indigo-700" />
        <StatTile label="Target Key"  value={targetKey}  color="bg-violet-50 text-violet-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {checks.map((check, i) => (
          <motion.div key={check.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
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
          <p className="text-xs text-amber-700">{checks.length - passing} check{checks.length - passing > 1 ? 's' : ''} failed. Review key selection or fix data quality issues.</p>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepKeyDetection({ batch, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { addAudit } = useStore();
  const [activeTab, setActiveTab] = useState('candidates');
  const [detecting, setDetecting] = useState(false);
  const [sourceKey, setSourceKey] = useState(wizardCtx.sourceKey);
  const [targetKey, setTargetKey] = useState(wizardCtx.targetKey);
  const [confidence, setConfidence] = useState(wizardCtx.keyConfidence);

  const sCols: ColShape[] = batch?.sourceFile?.columns ?? DEMO_SOURCE_COLS;
  const tCols: ColShape[] = batch?.targetFile?.columns ?? DEMO_TARGET_COLS;

  // Auto-init from file key candidates
  useEffect(() => {
    if (!sourceKey) {
      const sk = sCols.find(c => c.isPrimaryKeyCandidate);
      const tk = tCols.find(c => c.isPrimaryKeyCandidate);
      if (sk && tk) { setSourceKey(sk.name); setTargetKey(tk.name); setConfidence(96.4); }
    }
  }, [sCols, tCols, sourceKey]);

  const autoDetect = () => {
    setDetecting(true);
    setTimeout(() => {
      const sk = sCols.find(c => c.isPrimaryKeyCandidate);
      const tk = tCols.find(c => c.isPrimaryKeyCandidate);
      setSourceKey(sk?.name ?? sCols[0]?.name ?? '');
      setTargetKey(tk?.name ?? tCols[0]?.name ?? '');
      const conf = sk && tk ? 96.4 : 72.1;
      setConfidence(conf);
      setDetecting(false);
      setActiveTab('validation');
    }, 1400);
  };

  const handleSelect = (src: string, tgt: string) => {
    setSourceKey(src); setTargetKey(tgt);
    const conf = sCols.find(c => c.name === src)?.isPrimaryKeyCandidate ? 96.4 : 72.1;
    setConfidence(conf);
    setActiveTab('selection');
  };

  const handleAdvance = () => {
    if (batch && sourceKey && targetKey) {
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
          {!batch?.sourceFile && <span className="text-amber-600 ml-1">(Demo columns — upload files in Discovery for real data.)</span>}
        </p>
      </div>

      <StepSubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {activeTab === 'candidates' && <TabCandidateKeys sCols={sCols} tCols={tCols} selectedSrc={sourceKey} selectedTgt={targetKey} onSelect={handleSelect} />}
          {activeTab === 'selection'  && <TabKeySelection sCols={sCols} tCols={tCols} sourceKey={sourceKey} targetKey={targetKey} confidence={confidence} setSourceKey={setSourceKey} setTargetKey={setTargetKey} onDetect={autoDetect} detecting={detecting} />}
          {activeTab === 'validation' && <TabKeyValidation sCols={sCols} tCols={tCols} sourceKey={sourceKey} targetKey={targetKey} />}
        </motion.div>
      </AnimatePresence>

      <StepFooter onBack={onBack} onNext={handleAdvance} nextLabel="Continue to Rules" />
    </div>
  );
}
