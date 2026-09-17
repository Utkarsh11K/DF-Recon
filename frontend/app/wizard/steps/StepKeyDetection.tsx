'use client';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key, Zap, CheckCircle2, XCircle, AlertTriangle, Search, Info,
  ChevronRight, FileSearch, ArrowRight, ShieldCheck, ChevronDown,
  ChevronUp, Layers, RefreshCw, Upload, Sparkles, Check
} from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { StepFooter, EmptyCard } from './shared';
import type { StepProps } from './shared';
import { parseFileDirectly } from './StepDiscovery';

type ColShape = {
  name: string;
  dataType: string;
  isPrimaryKeyCandidate: boolean;
  nullCount?: number;
  uniqueCount?: number;
};

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

export function normalizeKeyValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && isNaN(v)) return null;
  let s = String(v).trim();
  if (s.endsWith('.0') && /^\d+\.0$/.test(s)) {
    s = s.slice(0, -2);
  }
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s || ['nan', 'none', 'null', 'n/a', '<na>', 'undefined', '', 'nil'].includes(s)) {
    return null;
  }
  return s;
}

function cleanSetFromRows(rows: Record<string, unknown>[] | undefined, colName: string): Set<string> {
  const set = new Set<string>();
  if (!rows) return set;
  for (const r of rows) {
    const norm = normalizeKeyValue(r[colName]);
    if (norm !== null) {
      set.add(norm);
    }
  }
  return set;
}

function getColumnStatsFromRows(rows: Record<string, unknown>[] | undefined, colName: string) {
  if (!rows || rows.length === 0) {
    return { totalRows: 0, nullCount: 0, nonNullCount: 0, nullPct: 0, uniqueValues: new Set<string>(), uniqueRatio: 0 };
  }
  const totalRows = rows.length;
  let nullCount = 0;
  const uniqueValues = new Set<string>();
  for (const r of rows) {
    const norm = normalizeKeyValue(r[colName]);
    if (norm === null) {
      nullCount++;
    } else {
      uniqueValues.add(norm);
    }
  }
  const nonNullCount = totalRows - nullCount;
  const nullPct = totalRows > 0 ? (nullCount / totalRows) * 100 : 0;
  const uniqueRatio = nonNullCount > 0 ? (uniqueValues.size / nonNullCount) * 100 : 0;
  return { totalRows, nullCount, nonNullCount, nullPct, uniqueValues, uniqueRatio };
}

const NON_KEY_TERMS = new Set([
  'CITY', 'STATE', 'COUNTRY', 'PROVINCE', 'COUNTY', 'REGION',
  'ZIP', 'POSTAL', 'POSTALCODE', 'POSTALZIP',
  'STATUS', 'FLAG', 'INDICATOR', 'PURPOSE', 'TYPE',
  'ADDRESS', 'ADDRESS1', 'ADDRESS2', 'LINE1', 'LINE2', 'STREET', 'SUITE',
  'PRINT', 'STMT', 'STATEMENT', 'TERMS', 'CURRENCY', 'PHONE', 'FAX', 'GENDER'
]);

const KEY_TERMS = new Set([
  'ID', 'KEY', 'NUM', 'NUMBER', 'CODE', 'REF', 'REFERENCE',
  'CUST', 'CUSTOMER', 'CLIENT', 'ACCOUNT', 'PARTY', 'NAME'
]);

function cleanColName(name: string): string {
  return name.replace(/^\*/, '').trim().toUpperCase().replace(/[\s_]+/g, '_');
}

function isNonKeyAttr(name: string): boolean {
  const parts = cleanColName(name).split(/[^A-Z0-9]+/);
  return parts.some(p => p && NON_KEY_TERMS.has(p));
}

function hasKeyTerm(name: string): boolean {
  const parts = cleanColName(name).split(/[^A-Z0-9]+/);
  return parts.some(p => p && KEY_TERMS.has(p));
}

const ERP_SYNONYM_MAP: Record<string, string[]> = {
  'ORIG_SYSTEM_REFERENCE': ['LEGACY_CUST_ID', 'CUSTOMER_ID', 'PARTY_ID', 'RECORD_ID', 'SOURCE_ID', 'ID', 'CUST_ID', 'CLIENT_ID', 'CLIENT_CODE', 'ACCOUNT_ID'],
  'PARTY_ORIG_SYSTEM_REFERENCE': ['LEGACY_CUST_ID', 'CUSTOMER_ID', 'PARTY_ID', 'RECORD_ID', 'SOURCE_ID', 'ID', 'CUST_ID', 'CLIENT_ID'],
  'CUSTOMER_NAME': ['CLIENT_NAME', 'CUST_NAME', 'PARTY_NAME', 'ACCOUNT_NAME', 'NAME'],
  'PARTY_NAME': ['CUSTOMER_NAME', 'CLIENT_NAME', 'CUST_NAME', 'ACCOUNT_NAME', 'NAME'],
  'ACCOUNT_NUMBER': ['CUSTOMER_NUMBER', 'CUST_NUM', 'ACCT_NUM', 'CLIENT_NUM', 'ACCOUNT_NO', 'CUSTOMER_NO'],
  'PARTY_NUMBER': ['CUSTOMER_NUMBER', 'CUST_NUM', 'CLIENT_NUM', 'PARTY_NO'],
  'PARTY_ID': ['CUSTOMER_ID', 'CUST_ID', 'CLIENT_ID'],
};

function calculateLocalCandidates(
  sCols: ColShape[],
  tCols: ColShape[],
  rowCount: number,
  sourceRows?: Record<string, unknown>[],
  fbdiRows?: Record<string, unknown>[]
) {
  if (!sCols.length || !tCols.length) return [];

  // ── PRIMARY: When sample rows are present, detect keys based on ACTUAL DATA VALUES & KEY QUALITY ──
  if (sourceRows && sourceRows.length > 0 && fbdiRows && fbdiRows.length > 0) {
    const sSets = new Map<string, Set<string>>();
    for (const sc of sCols) {
      sSets.set(sc.name, cleanSetFromRows(sourceRows, sc.name));
    }

    const tSets = new Map<string, Set<string>>();
    for (const tc of tCols) {
      tSets.set(tc.name, cleanSetFromRows(fbdiRows, tc.name));
    }

    const pairs: {
      source: string;
      target: string;
      score: number;
      confidence: number;
      nullPct: number;
      uniqueRatio: string;
      valueOverlap: number;
      commonCount: number;
      explanation: string;
    }[] = [];

    for (const sc of sCols) {
      const sVals = sSets.get(sc.name);
      if (!sVals || sVals.size === 0) continue;

      const srcUniqueRatio = sourceRows.length > 0 ? (sVals.size / sourceRows.length) * 100 : 0;
      // In database reconciliation, candidate keys MUST be unique identifiers.
      // Filter out non-key attributes with low uniqueness (e.g. Country 20%, State 40%).
      if (sourceRows.length >= 3 && srcUniqueRatio < 70) continue;

      const srcIsNonKey = isNonKeyAttr(sc.name);
      const srcHasKey = hasKeyTerm(sc.name);

      for (const tc of tCols) {
        const tVals = tSets.get(tc.name);
        if (!tVals || tVals.size === 0) continue;

        let commonCount = 0;
        for (const v of sVals) {
          if (tVals.has(v)) commonCount++;
        }

        if (commonCount === 0) continue;

        const tgtHasKey = hasKeyTerm(tc.name);
        if (sourceRows.length > 3 && commonCount < 2 && !(srcHasKey || tgtHasKey)) continue;

        const minSize = Math.min(sVals.size, tVals.size);
        const overlap = Math.round((commonCount / minSize) * 100);

        const tgtUniqueRatio = fbdiRows.length > 0 ? (tVals.size / fbdiRows.length) * 100 : 0;
        const tgtIsNonKey = isNonKeyAttr(tc.name);

        const scClean = cleanColName(sc.name);
        const tcClean = cleanColName(tc.name);
        const isSameName = scClean === tcClean || scClean.replace(/_/g, '') === tcClean.replace(/_/g, '');

        let isSynonym = false;
        for (const [fCol, sList] of Object.entries(ERP_SYNONYM_MAP)) {
          if (
            (tcClean === fCol && sList.some(s => s.replace(/_/g, '') === scClean.replace(/_/g, ''))) ||
            (scClean === fCol && sList.some(s => s.replace(/_/g, '') === tcClean.replace(/_/g, '')))
          ) {
            isSynonym = true;
            break;
          }
        }

        let confidence = 0;
        const explanationParts: string[] = [];

        // 1. Data overlap (max 40 pts)
        if (overlap >= 95) {
          confidence += 40;
          explanationParts.push(`${commonCount} common values (${overlap}% data overlap)`);
        } else if (overlap >= 75) {
          confidence += 30;
          explanationParts.push(`${commonCount} common values (${overlap}% data overlap)`);
        } else if (overlap >= 50) {
          confidence += 20;
          explanationParts.push(`${commonCount} common values (${overlap}% data overlap)`);
        } else {
          confidence += 10;
          explanationParts.push(`${commonCount} common values (${overlap}% data overlap)`);
        }

        // 2. Uniqueness (max 30 pts)
        // Primary keys must uniquely identify records!
        if (srcUniqueRatio >= 99) {
          confidence += 30;
          explanationParts.push('100% unique primary identifier');
        } else if (srcUniqueRatio >= 90) {
          confidence += 20;
          explanationParts.push('High uniqueness');
        } else if (srcUniqueRatio >= 75) {
          confidence += 10;
        }

        // 3. Key Identifier Bonus (max 20 pts)
        if (srcHasKey || tgtHasKey) {
          confidence += 20;
          explanationParts.push('Key entity identifier');
        }

        // 4. Non-key attribute penalty (-35 pts)
        if (srcIsNonKey || tgtIsNonKey) {
          confidence -= 35;
          explanationParts.push('Non-key attribute (demoted)');
        }

        // 5. Name / synonym bonus (max 10 pts)
        if (isSameName || isSynonym) {
          confidence += 10;
          explanationParts.push(isSynonym ? 'ERP synonym match' : 'Matching name');
        }

        confidence = Math.min(99.5, Math.max(10, confidence));
        const score = keyScore(sc, rowCount);
        const nullPct = rowCount > 0 ? Math.round(((sc.nullCount ?? 0) / rowCount) * 100) : 0;

        pairs.push({
          source: sc.name,
          target: tc.name,
          score,
          confidence,
          nullPct,
          uniqueRatio: srcUniqueRatio.toFixed(1),
          valueOverlap: overlap,
          commonCount,
          explanation: explanationParts.join(', ') || `${commonCount} matching values`,
        });
      }
    }

    pairs.sort((a, b) => (b.valueOverlap ?? 0) - (a.valueOverlap ?? 0) || b.confidence - a.confidence || b.commonCount - a.commonCount);

    // Deduplicate by source column and target column
    const seenSrc = new Set<string>();
    const seenTgt = new Set<string>();
    const deduped: typeof pairs = [];
    for (const p of pairs) {
      if (!seenSrc.has(p.source) && !seenTgt.has(p.target)) {
        deduped.push(p);
        seenSrc.add(p.source);
        seenTgt.add(p.target);
      }
    }
    if (deduped.length < 5) {
      for (const p of pairs) {
        if (!seenSrc.has(p.source)) {
          deduped.push(p);
          seenSrc.add(p.source);
        }
      }
    }
    return deduped;
  }

  // ── FALLBACK: Only when no rows are available, match by ERP synonyms & names ──
  return sCols
    .map(sc => {
      const scNorm = sc.name.toLowerCase().replace(/[_\s]/g, '');
      let tMatch = tCols.find(tc => tc.name.toLowerCase().replace(/[_\s]/g, '') === scNorm);
      if (!tMatch) {
        for (const [fCol, sList] of Object.entries(ERP_SYNONYM_MAP)) {
          if (sList.some(s => s.replace(/_/g, '').toLowerCase() === scNorm)) {
            tMatch = tCols.find(tc => tc.name.toUpperCase() === fCol);
            if (tMatch) break;
          }
        }
      }
      if (!tMatch) return null;

      const score = keyScore(sc, rowCount);
      const nullPct = rowCount > 0 ? Math.round(((sc.nullCount ?? 0) / rowCount) * 100) : 0;
      const uniqueRatio = rowCount > 0 ? ((sc.uniqueCount ?? 0) / rowCount) * 100 : 0;

      return {
        source: sc.name,
        target: tMatch.name,
        score,
        confidence: confidenceFromScore(score),
        nullPct,
        uniqueRatio: uniqueRatio.toFixed(1),
        valueOverlap: 0,
        commonCount: 0,
        explanation: 'Schema name match',
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.confidence - a.confidence);
}

// ── System Detected Columns Panel (Source & FBDI) ────────────────────────────
function SystemDetectedColumnsPanel({
  sCols,
  fbdiCols,
  sourceName,
  fbdiName,
  rowCount,
  fbdiRowCount,
  sourceRows,
  fbdiRows,
}: {
  sCols: ColShape[];
  fbdiCols: ColShape[];
  sourceName?: string;
  fbdiName?: string;
  rowCount: number;
  fbdiRowCount: number;
  sourceRows?: Record<string, unknown>[];
  fbdiRows?: Record<string, unknown>[]
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const fbdiColSet = new Set(fbdiCols.map(c => c.name.toLowerCase().replace(/[_\s]/g, '')));
  const sourceColSet = new Set(sCols.map(c => c.name.toLowerCase().replace(/[_\s]/g, '')));

  // Cross-match data values between Source & FBDI columns
  const { dataMatchMapSrc, dataMatchMapFbdi } = useMemo(() => {
    const srcMap = new Map<string, string>();
    const fbdiMap = new Map<string, string>();
    if (!sourceRows?.length || !fbdiRows?.length) return { dataMatchMapSrc: srcMap, dataMatchMapFbdi: fbdiMap };

    const sSets = new Map<string, Set<string>>();
    for (const sc of sCols) sSets.set(sc.name, cleanSetFromRows(sourceRows, sc.name));
    const tSets = new Map<string, Set<string>>();
    for (const tc of fbdiCols) tSets.set(tc.name, cleanSetFromRows(fbdiRows, tc.name));

    for (const sc of sCols) {
      const sVals = sSets.get(sc.name);
      if (!sVals || sVals.size === 0) continue;
      for (const tc of fbdiCols) {
        const tVals = tSets.get(tc.name);
        if (!tVals || tVals.size === 0) continue;
        let common = 0;
        for (const v of sVals) {
          if (tVals.has(v)) common++;
        }
        if (common > 0) {
          srcMap.set(sc.name, tc.name);
          fbdiMap.set(tc.name, sc.name);
          break;
        }
      }
    }
    return { dataMatchMapSrc: srcMap, dataMatchMapFbdi: fbdiMap };
  }, [sCols, fbdiCols, sourceRows, fbdiRows]);

  const commonCount = sCols.filter(c => dataMatchMapSrc.has(c.name) || fbdiColSet.has(c.name.toLowerCase().replace(/[_\s]/g, ''))).length;

  const filteredSource = sCols.filter(c => c.name.toLowerCase().includes(filterQuery.toLowerCase()));
  const filteredFbdi = fbdiCols.filter(c => c.name.toLowerCase().includes(filterQuery.toLowerCase()));

  return (
    <div className="bg-slate-50/70 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header Bar */}
      <div
        className="flex items-center justify-between p-4 bg-white border-b border-slate-200 cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-slate-800 tracking-tight">
                System Detected Columns — Source & FBDI Files
              </h4>
              <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                {sCols.length} Source Columns
              </span>
              <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                {fbdiCols.length} FBDI Columns
              </span>
              <span className="text-[11px] font-bold bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full">
                {commonCount} Common
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              All column names extracted from your files. Common columns and data-matching columns are highlighted with matching tags.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <input
              type="text"
              placeholder="Filter columns..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 w-36 sm:w-44 transition-all"
            />
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs py-1.5 h-8 gap-1.5 text-slate-600 font-medium"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {isExpanded ? 'Hide Columns' : 'Show All Columns'}
          </Button>
        </div>
      </div>

      {/* Expanded Column Overview */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 p-4 gap-4"
          >
            {/* Source Column List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 truncate max-w-[220px]" title={sourceName}>
                    Source: {sourceName || 'Source File'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {sCols.length} columns · {rowCount.toLocaleString()} records
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-inner">
                {filteredSource.length === 0 ? (
                  <span className="text-xs text-slate-400 italic p-2">No matching columns</span>
                ) : (
                  filteredSource.map(col => {
                    const dataMatchTgt = dataMatchMapSrc.get(col.name);
                    const isCommon = fbdiColSet.has(col.name.toLowerCase().replace(/[_\s]/g, ''));
                    return (
                      <div
                        key={col.name}
                        title={`${col.name} (${col.dataType || 'string'}) ${dataMatchTgt ? `— Matches data values with FBDI: ${dataMatchTgt}` : isCommon ? '— Found in both files by name' : '— Source only'}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all',
                          dataMatchTgt
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold shadow-xs'
                            : isCommon
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                            : 'bg-slate-50/80 border-slate-200 text-slate-600'
                        )}
                      >
                        <span className="truncate max-w-[140px]">{col.name}</span>
                        {col.isPrimaryKeyCandidate && <span title="Primary Key Candidate">🔑</span>}
                        {dataMatchTgt ? (
                          <span className="text-[9px] font-sans font-bold bg-emerald-200/90 text-emerald-950 px-1.5 py-0.5 rounded leading-none">
                            Data Match: {dataMatchTgt}
                          </span>
                        ) : isCommon ? (
                          <span className="text-[9px] font-sans font-bold bg-indigo-200/80 text-indigo-950 px-1 py-0.5 rounded leading-none">
                            In FBDI
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* FBDI Column List */}
            <div className="space-y-2.5 md:pl-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 truncate max-w-[220px]" title={fbdiName}>
                    FBDI / ADFdi: {fbdiName || 'FBDI Template'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {fbdiCols.length} columns · {fbdiRowCount.toLocaleString()} records
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-inner">
                {filteredFbdi.length === 0 ? (
                  <span className="text-xs text-slate-400 italic p-2">No matching columns</span>
                ) : (
                  filteredFbdi.map(col => {
                    const dataMatchSrc = dataMatchMapFbdi.get(col.name);
                    const isCommon = sourceColSet.has(col.name.toLowerCase().replace(/[_\s]/g, ''));
                    return (
                      <div
                        key={col.name}
                        title={`${col.name} (${col.dataType || 'string'}) ${dataMatchSrc ? `— Matches data values with Source: ${dataMatchSrc}` : isCommon ? '— Found in both files by name' : '— FBDI only'}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all',
                          dataMatchSrc
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-xs'
                            : isCommon
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-xs'
                            : 'bg-slate-50/80 border-slate-200 text-slate-600'
                        )}
                      >
                        <span className="truncate max-w-[140px]">{col.name}</span>
                        {col.isPrimaryKeyCandidate && <span title="Primary Key Candidate">🔑</span>}
                        {dataMatchSrc ? (
                          <span className="text-[9px] font-sans font-bold bg-indigo-200/90 text-indigo-950 px-1.5 py-0.5 rounded leading-none">
                            Data Match: {dataMatchSrc}
                          </span>
                        ) : isCommon ? (
                          <span className="text-[9px] font-sans font-bold bg-emerald-200/80 text-emerald-950 px-1 py-0.5 rounded leading-none">
                            In Source
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Best FBDI Match Finder for Any Source Column ─────────────────────────────
function findBestFbdiForSource(
  scName: string,
  tCols: ColShape[],
  sVals: Set<string>,
  tSets: Map<string, Set<string>>
): { target: string; commonCount: number; overlap: number; explanation: string } | null {
  if (!tCols.length) return null;

  let bestMatch: { target: string; commonCount: number; overlap: number; explanation: string; score: number } | null = null;

  const scClean = cleanColName(scName);
  const scNorm = scClean.replace(/_/g, '');

  for (const tc of tCols) {
    const tVals = tSets.get(tc.name) || new Set<string>();
    let commonCount = 0;
    if (sVals && sVals.size > 0 && tVals.size > 0) {
      for (const v of sVals) {
        if (tVals.has(v)) commonCount++;
      }
    }

    const tcClean = cleanColName(tc.name);
    const tcNorm = tcClean.replace(/_/g, '');
    const isSameName = scClean === tcClean || scNorm === tcNorm;

    let isSynonym = false;
    for (const [fCol, sList] of Object.entries(ERP_SYNONYM_MAP)) {
      if (
        (tcClean === fCol && sList.some(s => s.replace(/_/g, '') === scNorm)) ||
        (scClean === fCol && sList.some(s => s.replace(/_/g, '') === tcNorm))
      ) {
        isSynonym = true;
        break;
      }
    }

    const minSize = Math.min(sVals.size, tVals.size);
    const overlap = minSize > 0 && commonCount > 0 ? Math.round((commonCount / minSize) * 100) : 0;

    let score = 0;
    let explanation = '';

    if (commonCount > 0) {
      score += commonCount * 100 + overlap * 5;
      explanation = `${commonCount} common values (${overlap}% overlap)`;
    }

    if (isSameName) {
      score += 80;
      explanation = explanation ? `${explanation}, Name match` : 'Name match';
    } else if (isSynonym) {
      score += 75;
      explanation = explanation ? `${explanation}, ERP Synonym match` : 'ERP Synonym match';
    } else if (tcNorm.includes(scNorm) || scNorm.includes(tcNorm)) {
      score += 20;
      explanation = explanation ? `${explanation}, Partial name match` : 'Partial name match';
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { target: tc.name, commonCount, overlap, explanation, score };
    }
  }

  return bestMatch ? {
    target: bestMatch.target,
    commonCount: bestMatch.commonCount,
    overlap: bestMatch.overlap,
    explanation: bestMatch.explanation,
  } : null;
}

// ── Real-Time Evaluator for Source ↔ FBDI Pair ──────────────────────────────
function evaluatePair(
  sc: ColShape,
  tcName: string,
  sVals: Set<string>,
  tVals: Set<string>,
  sNullPct: number,
  sUniquePct: number
) {
  if (!tcName) {
    return {
      commonCount: 0,
      valueOverlap: 0,
      confidence: 0,
      nullPct: sNullPct,
      uniqueRatio: sUniquePct.toFixed(2),
      category: 'Invalid candidate',
    };
  }

  let commonCount = 0;
  if (sVals.size > 0 && tVals.size > 0) {
    for (const v of sVals) {
      if (tVals.has(v)) commonCount++;
    }
  }

  const overlap = sVals.size > 0 && commonCount > 0 ? (commonCount / sVals.size) * 100 : 0;
  const nullQuality = Math.max(0, 100 - sNullPct);
  const confidenceCalc = (0.50 * overlap) + (0.30 * sUniquePct) + (0.20 * nullQuality);
  const confidence = Math.min(100, Math.max(0, confidenceCalc));

  let category = 'Invalid candidate';
  if (overlap >= 75.0 && sUniquePct >= 90.0 && sNullPct <= 5.0) {
    category = 'Strong candidate key';
  } else if (overlap >= 50.0 && sUniquePct >= 60.0 && sNullPct <= 20.0) {
    category = 'Possible candidate';
  } else if (overlap > 0.0) {
    category = 'Weak candidate';
  }

  return {
    commonCount,
    valueOverlap: Math.round(overlap * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    nullPct: Math.round(sNullPct * 100) / 100,
    uniqueRatio: (Math.round(sUniquePct * 100) / 100).toFixed(2),
    category,
  };
}

// ── Candidate Keys tab ────────────────────────────────────────────────────────
function TabCandidateKeys({ sCols, fbdiCols, rowCount, selectedSrc, selectedTarget, onSelect, batch, onBack, fbdiFile }: {
  sCols: ColShape[]; fbdiCols: ColShape[];
  rowCount: number;
  selectedSrc: string;
  selectedTarget?: string;
  onSelect: (src: string, fbdi: string) => void;
  batch: StepProps['batch'];
  onBack?: () => void;
  fbdiFile?: any;
}) {
  const [loading, setLoading] = useState(false);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [apiCandidates, setApiCandidates] = useState<any[]>([]);
  const [backendPairs, setBackendPairs] = useState<Record<string, any>>({});

  const activeFbdi = fbdiFile ?? batch?.fbdiFile;
  const sRows = batch?.sourceFile?.sampleData;
  const fbdiRows = activeFbdi?.sampleData;

  // Precompute stats per source column from actual uploaded data
  const sStatsMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getColumnStatsFromRows>>();
    for (const sc of sCols) {
      const stats = getColumnStatsFromRows(sRows, sc.name);
      if (stats.totalRows === 0 && rowCount > 0) {
        const nullCount = sc.nullCount ?? 0;
        const nonNullCount = Math.max(0, rowCount - nullCount);
        const uniqueCount = sc.uniqueCount ?? 0;
        m.set(sc.name, {
          totalRows: rowCount,
          nullCount,
          nonNullCount,
          nullPct: rowCount > 0 ? (nullCount / rowCount) * 100 : 0,
          uniqueValues: new Set<string>(),
          uniqueRatio: nonNullCount > 0 ? (uniqueCount / nonNullCount) * 100 : 0,
        });
      } else {
        m.set(sc.name, stats);
      }
    }
    return m;
  }, [sCols, sRows, rowCount]);

  // Memoized value sets for fast real-time overlap checking
  const sSets = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const sc of sCols) {
      m.set(sc.name, sStatsMap.get(sc.name)?.uniqueValues || cleanSetFromRows(sRows, sc.name));
    }
    return m;
  }, [sCols, sRows, sStatsMap]);

  const tSets = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const tc of fbdiCols) {
      m.set(tc.name, cleanSetFromRows(fbdiRows, tc.name));
    }
    return m;
  }, [fbdiCols, fbdiRows]);

  // Auto-detect best FBDI column for each source column
  const autoDetectedMap = useMemo(() => {
    const map: Record<string, { target: string; commonCount: number; overlap: number; explanation: string; category?: string }> = {};

    // Incorporate backend API candidates if available
    for (const c of apiCandidates) {
      if (c.source && c.target) {
        map[c.source] = {
          target: c.target,
          commonCount: c.commonCount ?? 0,
          overlap: c.valueOverlap ?? 0,
          explanation: c.explanation ?? '',
          category: c.category,
        };
      }
    }

    // Auto-detect for each source column
    for (const sc of sCols) {
      if (!map[sc.name]) {
        const match = findBestFbdiForSource(sc.name, fbdiCols, sSets.get(sc.name) || new Set(), tSets);
        if (match) {
          map[sc.name] = match;
        }
      }
    }
    return map;
  }, [sCols, fbdiCols, sSets, tSets, apiCandidates]);

  const triggerDetection = () => {
    if (!sCols.length) return;

    if (!batch?.sourceFile || !activeFbdi) {
      const local = calculateLocalCandidates(sCols, fbdiCols, rowCount, sRows, fbdiRows);
      setApiCandidates(local);
      if (!selectedSrc && local.length > 0) {
        onSelect(local[0].source, local[0].target);
      }
      return;
    }

    setLoading(true);
    const sourcePath = batch.sourceFile.storagePath || batch.sourceFile.name;
    const fbdiPath  = activeFbdi.storagePath || activeFbdi.name;

    fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/v1/keys/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_file: sourcePath, target_file: fbdiPath, top_n: 15 })
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("API Error")))
    .then(data => {
       const pairsDict: Record<string, any> = {};

       if (data.all_source_columns && Array.isArray(data.all_source_columns)) {
         for (const pair of data.all_source_columns) {
           pairsDict[`${pair.source_column}:::${pair.target_column}`] = pair;
         }
       }

       if (data.candidates && data.candidates.length > 0) {
         for (const pair of data.candidates) {
           pairsDict[`${pair.source_column}:::${pair.target_column}`] = pair;
         }
         const mapped = data.candidates.map((c: any) => ({
           source: c.source_column,
           target: c.target_column,
           score: c.confidence,
           confidence: c.confidence,
           nullPct: c.nulls_percent ?? c.source_null_percent,
           uniqueRatio: (c.unique_percent ?? c.source_unique_percent).toFixed(2),
           explanation: c.explanation,
           valueOverlap: c.data_overlap ?? c.value_overlap_ratio,
           commonCount: c.common_values ?? c.common_value_count ?? 0,
           category: c.category,
         }));
         setApiCandidates(mapped);
         setBackendPairs(prev => ({ ...prev, ...pairsDict }));
         if (!selectedSrc && mapped.length > 0) {
           onSelect(mapped[0].source, mapped[0].target);
         }
       } else {
         setBackendPairs(prev => ({ ...prev, ...pairsDict }));
       }
    })
    .catch(() => {
       const local = calculateLocalCandidates(sCols, fbdiCols, rowCount, sRows, fbdiRows);
       setApiCandidates(local);
       if (!selectedSrc && local.length > 0) {
         onSelect(local[0].source, local[0].target);
       }
    })
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    triggerDetection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.sourceFile?.id, activeFbdi?.id]);

  // Handle manual change of FBDI column for a given source column
  const handleTargetChange = (sourceName: string, newTarget: string) => {
    setManualMappings(prev => ({ ...prev, [sourceName]: newTarget }));
    if (selectedSrc === sourceName && newTarget) {
      onSelect(sourceName, newTarget);
    }

    if (newTarget && (batch?.sourceFile?.storagePath || batch?.sourceFile?.name) && (activeFbdi?.storagePath || activeFbdi?.name)) {
      const sourcePath = batch.sourceFile.storagePath || batch.sourceFile.name;
      const fbdiPath = activeFbdi.storagePath || activeFbdi.name;

      fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/v1/keys/evaluate-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_file: sourcePath,
          target_file: fbdiPath,
          source_column: sourceName,
          target_column: newTarget,
        })
      })
      .then(res => res.ok ? res.json() : null)
      .then(pair => {
        if (pair) {
          setBackendPairs(prev => ({
            ...prev,
            [`${sourceName}:::${newTarget}`]: pair
          }));
        }
      })
      .catch(() => {});
    }
  };

  // Build row data for ALL source columns
  const allRows = useMemo(() => {
    return sCols.map(sc => {
      const isManual = manualMappings[sc.name] !== undefined;
      const effectiveTarget = isManual ? manualMappings[sc.name] : (autoDetectedMap[sc.name]?.target || '');
      const isAuto = !isManual && !!autoDetectedMap[sc.name]?.target;

      const pairKey = `${sc.name}:::${effectiveTarget}`;
      const backendData = backendPairs[pairKey];

      const stats = sStatsMap.get(sc.name);
      const sNullPct = stats ? stats.nullPct : (rowCount > 0 ? ((sc.nullCount ?? 0) / rowCount) * 100 : 0);
      const sUniquePct = stats ? stats.uniqueRatio : (rowCount > 0 ? (((sc.uniqueCount ?? 0) / Math.max(1, rowCount - (sc.nullCount ?? 0))) * 100) : 0);

      const evalResult = backendData ? {
        commonCount: backendData.common_values ?? backendData.common_value_count ?? 0,
        valueOverlap: backendData.data_overlap ?? backendData.value_overlap_ratio ?? 0,
        confidence: backendData.confidence ?? 0,
        nullPct: backendData.nulls_percent ?? backendData.source_null_percent ?? 0,
        uniqueRatio: (backendData.unique_percent ?? backendData.source_unique_percent ?? 0).toFixed(2),
        category: backendData.category,
      } : evaluatePair(
        sc,
        effectiveTarget,
        sSets.get(sc.name) || new Set(),
        effectiveTarget ? (tSets.get(effectiveTarget) || new Set()) : new Set(),
        sNullPct,
        sUniquePct
      );

      return {
        sc,
        sourceName: sc.name,
        targetName: effectiveTarget,
        isAuto,
        isManual,
        ...evalResult,
      };
    });
  }, [sCols, manualMappings, autoDetectedMap, backendPairs, sStatsMap, sSets, tSets, rowCount, activeFbdi?.rowCount]);

  // Sort rows: selected key first, then by data overlap desc, confidence desc, common count desc
  const sortedRows = useMemo(() => {
    const list = [...allRows];
    list.sort((a, b) => {
      if (a.sourceName === selectedSrc) return -1;
      if (b.sourceName === selectedSrc) return 1;
      if (b.valueOverlap !== a.valueOverlap) return b.valueOverlap - a.valueOverlap;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.commonCount !== a.commonCount) return b.commonCount - a.commonCount;
      if (a.targetName && !b.targetName) return -1;
      if (!a.targetName && b.targetName) return 1;
      return a.sourceName.localeCompare(b.sourceName);
    });
    return list;
  }, [allRows, selectedSrc]);

  // Filter rows by search and filterType
  const filteredRows = useMemo(() => {
    return sortedRows.filter(r => {
      if (filterType === 'mapped' && !r.targetName) return false;
      if (filterType === 'unmapped' && r.targetName) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return r.sourceName.toLowerCase().includes(q) || r.targetName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [sortedRows, filterType, searchQuery]);

  const mappedCount = allRows.filter(r => r.targetName).length;
  const unmappedCount = allRows.length - mappedCount;

  if (!sCols.length) return (
    <EmptyCard icon={<FileSearch size={22} className="text-slate-400" />}
      title="No Source file uploaded"
      message="Upload a Source file in the Discovery step first." />
  );

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_20px_-4px_rgba(6,81,237,0.05)] space-y-5">

      {/* System Detected Columns Panel — Always Shown */}
      <SystemDetectedColumnsPanel
        sCols={sCols}
        fbdiCols={fbdiCols}
        sourceName={batch?.sourceFile?.name}
        fbdiName={activeFbdi?.name || 'FBDI / ADFdi Output File'}
        rowCount={rowCount}
        fbdiRowCount={activeFbdi?.rowCount ?? 0}
        sourceRows={batch?.sourceFile?.sampleData}
        fbdiRows={activeFbdi?.sampleData}
      />

      {/* Header & Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div>
          <h3 className="text-slate-800 font-bold tracking-tight text-lg flex items-center gap-2">
            <Search size={20} className="text-indigo-600" /> Source Columns & FBDI Mappings
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Showing all <strong className="text-slate-700">{sCols.length}</strong> columns of source data with auto-detected FBDI columns and manual selection.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={triggerDetection}
            disabled={loading}
            icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
            className="text-xs"
          >
            Re-scan Overlap
          </Button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search source or FBDI columns..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              'px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors',
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            )}
          >
            All Columns ({allRows.length})
          </button>
          <button
            onClick={() => setFilterType('mapped')}
            className={cn(
              'px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors',
              filterType === 'mapped'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            )}
          >
            Mapped ({mappedCount})
          </button>
          <button
            onClick={() => setFilterType('unmapped')}
            className={cn(
              'px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors',
              filterType === 'unmapped'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            )}
          >
            Unmapped ({unmappedCount})
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
        <div className="bg-indigo-100 p-1.5 rounded-lg shrink-0"><Info size={15} className="text-indigo-600" /></div>
        <p className="text-xs text-indigo-800">
          All Source columns are listed below. The dynamically detected FBDI column is shown in front of each source column.
          Click <strong>Select Key</strong> to designate the primary key.
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-indigo-700 w-[230px]">
                  Source Column
                </th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-emerald-700 w-[270px]">
                  Detected FBDI Column
                </th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Data Overlap</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Confidence</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Nulls %</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Unique %</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">

              {/* Loading row */}
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                      <span className="text-sm font-semibold text-indigo-700">Scanning common values across Source ↔ FBDI...</span>
                      <p className="text-xs text-slate-400">Comparing column pairs by actual data overlap</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty state when filtered rows is empty */}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-1.5 text-slate-400">
                      <AlertTriangle size={20} className="text-amber-500" />
                      <span className="text-sm font-semibold text-slate-700">No columns match the current filter</span>
                      <p className="text-xs text-slate-400">Try clearing the search query or switching to All Columns</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading && filteredRows.map((r, i) => {
                const isSelected = r.sourceName === selectedSrc && (!selectedTarget || r.targetName === selectedTarget);
                const overlap = typeof r.valueOverlap === 'number' && !isNaN(r.valueOverlap) ? r.valueOverlap : 0.0;
                const overlapColor = overlap >= 75 ? 'bg-emerald-500' : overlap >= 40 ? 'bg-amber-500' : 'bg-red-400';
                const overlapTextColor = overlap >= 75 ? 'text-emerald-700 font-bold' : overlap >= 40 ? 'text-amber-700 font-bold' : 'text-red-600 font-bold';

                const conf = typeof r.confidence === 'number' && !isNaN(r.confidence) ? r.confidence : 0.0;
                const nulls = typeof r.nullPct === 'number' && !isNaN(r.nullPct) ? r.nullPct : (parseFloat(r.nullPct) || 0.0);
                const unique = !isNaN(parseFloat(r.uniqueRatio)) ? parseFloat(r.uniqueRatio) : 0.0;

                return (
                  <motion.tr
                    key={`${r.sourceName}-${i}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.02, 0.3) } }}
                    className={cn(
                      'transition-colors duration-150',
                      isSelected ? 'bg-indigo-50/70' : 'bg-white hover:bg-slate-50'
                    )}
                  >
                    {/* Source Column — FIRST, indigo */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div className={cn(
                          'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border font-mono font-semibold text-xs max-w-[210px]',
                          isSelected
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                            : 'bg-indigo-50/80 border-indigo-200 text-indigo-800'
                        )}>
                          <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="truncate" title={r.sourceName}>{r.sourceName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-sans uppercase">{r.sc.dataType}</span>
                          {r.sc.isPrimaryKeyCandidate && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded" title="Primary Key Candidate">
                              🔑 Candidate
                            </span>
                          )}
                          {r.category && (
                            <span className={cn(
                              'text-[9px] font-bold px-1.5 py-0.2 rounded',
                              r.category === 'Strong candidate key' ? 'bg-emerald-100 text-emerald-800' :
                              r.category === 'Possible candidate' ? 'bg-blue-100 text-blue-800' :
                              r.category === 'Weak candidate' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            )}>
                              {r.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* FBDI Column — SECOND, static text + badge */}
                    <td className="py-3 px-4">
                      <div className="space-y-1 min-w-[250px]">
                        <div className={cn(
                          'w-full text-xs font-mono font-semibold rounded-lg py-2 px-2.5 border',
                          r.targetName
                            ? isSelected
                              ? 'bg-emerald-100/90 border-emerald-400 text-emerald-950'
                              : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                            : 'bg-slate-50 border-dashed border-slate-300 text-slate-500'
                        )}>
                          {r.targetName || '— No match detected —'}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {r.isAuto && r.targetName ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-1.5 py-0.5 rounded leading-none inline-flex items-center gap-1">
                              <Sparkles size={9} /> Auto-detected
                            </span>
                          ) : !r.targetName ? (
                            <span className="text-[10px] text-amber-600 font-medium italic">
                              Unmapped
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Data Overlap — bar + % (2 decimal places) */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', overlapColor)}
                            style={{ width: `${Math.min(100, Math.max(0, overlap))}%` }}
                          />
                        </div>
                        <span className={cn('text-xs tabular-nums', overlapTextColor)}>{overlap.toFixed(2)}%</span>
                      </div>
                    </td>

                    {/* Confidence (2 decimal places) */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="w-14 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', conf >= 75 ? 'bg-indigo-500' : 'bg-slate-400')}
                            style={{ width: `${Math.min(100, Math.max(0, conf))}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 tabular-nums">{conf.toFixed(2)}%</span>
                      </div>
                    </td>

                    {/* Nulls % (2 decimal places) */}
                    <td className="py-3 px-4">
                      <Badge variant={nulls > 5 ? 'error' : 'default'} className="text-[11px] px-2 py-0.5 rounded-full tabular-nums font-mono">
                        {nulls.toFixed(2)}%
                      </Badge>
                    </td>

                    {/* Unique % (2 decimal places) */}
                    <td className="py-3 px-4">
                      <Badge variant={unique >= 90 ? 'success' : 'warning'} className="text-[11px] px-2 py-0.5 rounded-full tabular-nums font-mono">
                        {unique.toFixed(2)}%
                      </Badge>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <Button
                        size="sm"
                        variant={isSelected ? 'primary' : 'outline'}
                        disabled={!r.targetName}
                        className={cn(
                          'w-28 shadow-2xs text-xs font-semibold',
                          isSelected ? 'ring-2 ring-indigo-200 ring-offset-1 bg-indigo-600 hover:bg-indigo-700 text-white' : ''
                        )}
                        onClick={() => {
                          if (r.targetName) {
                            onSelect(r.sourceName, r.targetName);
                          }
                        }}
                      >
                        {isSelected ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <CheckCircle2 size={13} /> Selected
                          </span>
                        ) : (
                          'Select Key'
                        )}
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

// ── Main ──────────────────────────────────────────────────────────────────────
export function StepKeyDetection({ batch, onAdvance, onBack, wizardCtx, onCtxChange }: StepProps) {
  const { state, addAudit, dispatch } = useStore();
  const [sourceKey, setSourceKey] = useState(wizardCtx.sourceKey);
  const [targetKey, setTargetKey] = useState(wizardCtx.targetKey);
  const [confidence, setConfidence] = useState(wizardCtx.keyConfidence);

  // Directly resolve FBDI / ADFdi file from Discovery (batch.fbdiFile, batch.targetFile, or state.files)
  const effectiveFbdiFile = batch?.fbdiFile
    ?? (batch?.targetFile && (batch.targetFile.role === 'fbdi' || batch.targetFile.name.toLowerCase().includes('template') || batch.targetFile.name.toLowerCase().includes('fbdi') || batch.targetFile.name.toLowerCase().includes('customer') || batch.targetFile.name.toLowerCase().includes('upload')) ? batch.targetFile : undefined)
    ?? state.files.find(f => f.batchId === batch?.id && (f.role === 'fbdi' || f.name.toLowerCase().includes('template') || f.name.toLowerCase().includes('fbdi')))
    ?? state.files.find(f => f.role === 'fbdi' || f.name.toLowerCase().includes('template') || f.name.toLowerCase().includes('fbdi'))
    ?? batch?.targetFile;

  // Ensure batch has fbdiFile populated if it was detected in Discovery
  useEffect(() => {
    if (batch && !batch.fbdiFile && effectiveFbdiFile) {
      dispatch({
        type: 'UPDATE_BATCH',
        payload: { ...batch, fbdiFile: { ...effectiveFbdiFile, role: 'fbdi' } }
      });
    }
  }, [batch?.id, effectiveFbdiFile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sCols: ColShape[] = batch?.sourceFile?.columns ?? [];
  const activeFbdi = batch?.fbdiFile ?? effectiveFbdiFile;
  const fbdiCols: ColShape[] = activeFbdi?.columns ?? [];
  const rowCount = batch?.sourceFile?.rowCount ?? 0;

  useEffect(() => {
    if (!sCols.length || !fbdiCols.length) return;
    const candidates = calculateLocalCandidates(
      sCols,
      fbdiCols,
      rowCount,
      batch?.sourceFile?.sampleData,
      activeFbdi?.sampleData
    );
    if (candidates.length > 0 && !sourceKey) {
      setSourceKey(candidates[0].source);
      setTargetKey(candidates[0].target);
      setConfidence(candidates[0].confidence);
    }
  }, [batch?.sourceFile?.id, activeFbdi?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (src: string, tgt: string) => {
    setSourceKey(src);
    setTargetKey(tgt);
    const col = sCols.find(c => c.name === src);
    setConfidence(confidenceFromScore(keyScore(col ?? { name: src, dataType: 'string', isPrimaryKeyCandidate: false }, rowCount)));
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
            Detect and select primary keys used to match source and FBDI records based on common values.
            {!batch?.sourceFile && (
              <span className="text-amber-600 ml-1">(Upload files in Discovery to detect keys.)</span>
            )}
          </p>
        </div>
        {sourceKey && targetKey && (
          <div className="flex items-center gap-2.5 bg-indigo-50/80 border border-indigo-200 px-4 py-2 rounded-xl text-xs shadow-xs">
            <span className="text-slate-500 font-medium">Active Key:</span>
            <span className="font-mono font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded">{sourceKey}</span>
            <ArrowRight size={13} className="text-slate-400 shrink-0" />
            <span className="font-mono font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">{targetKey}</span>
            <Badge variant="success" className="text-[10px] px-2 py-0.5 ml-1 font-bold">
              Selected
            </Badge>
          </div>
        )}
      </div>

      <TabCandidateKeys
        sCols={sCols}
        fbdiCols={fbdiCols}
        rowCount={rowCount}
        selectedSrc={sourceKey}
        selectedTarget={targetKey}
        onSelect={handleSelect}
        batch={batch}
        onBack={onBack}
        fbdiFile={activeFbdi}
      />

      <StepFooter
        onBack={onBack}
        onNext={handleAdvance}
        disableNext={!sourceKey || !targetKey}
        nextLabel="Continue to Rules"
      />
    </div>
  );
}
