'use client';
import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Badge } from '@/components/ui/Badge';
import {
  ClipboardList, Search, Filter, CheckCircle2, XCircle,
  Info, Clock, ArrowUpDown, FolderKanban, Layers,
  FileText, ShieldCheck, GitMerge, FilterX, Activity, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateTime, timeAgo, cn } from '@/lib/utils';
import type { AuditEntry } from '@/lib/types';

const ENTITY_ICONS: Record<string, React.ElementType> = {
  Project: FolderKanban,
  Batch: Layers,
  File: FileText,
  Rule: ShieldCheck,
  Mapping: GitMerge,
  Exclusion: FilterX,
  System: Activity,
};

const STATUS_STYLES: Record<string, { bg: string; icon: React.ElementType; iconColor: string }> = {
  success: { bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-500' },
  error:   { bg: 'bg-red-50 border-red-200',         icon: XCircle,      iconColor: 'text-red-500' },
  info:    { bg: 'bg-blue-50 border-blue-200',        icon: Info,         iconColor: 'text-blue-500' },
};

const ACTION_COLORS: Record<string, string> = {
  CREATED:  'text-emerald-600 bg-emerald-50',
  UPDATED:  'text-blue-600 bg-blue-50',
  DELETED:  'text-red-600 bg-red-50',
  UPLOADED: 'text-violet-600 bg-violet-50',
  RUN:      'text-indigo-600 bg-indigo-50',
  EXPORTED: 'text-amber-600 bg-amber-50',
  DETECTED: 'text-teal-600 bg-teal-50',
  MAPPING:  'text-pink-600 bg-pink-50',
};

function getActionColor(action: string): string {
  const key = Object.keys(ACTION_COLORS).find(k => action.includes(k));
  return key ? ACTION_COLORS[key] : 'text-slate-600 bg-slate-100';
}

function AuditRow({ entry, index }: { entry: AuditEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[entry.status] ?? STATUS_STYLES.info;
  const EntityIcon = ENTITY_ICONS[entry.entity] ?? Activity;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: index * 0.03 } }}>
      <div
        className={cn('border rounded-xl p-4 transition-all cursor-pointer hover:shadow-sm', style.bg, expanded && 'shadow-sm')}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            <style.icon size={16} className={style.iconColor} />
          </div>

          {/* Entity icon */}
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <EntityIcon size={14} className="text-slate-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', getActionColor(entry.action))}>
                {entry.action.replace(/_/g, ' ')}
              </span>
              <span className="text-sm font-medium text-slate-800 truncate">{entry.entityName}</span>
              <span className="text-xs text-slate-400">({entry.entity})</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{entry.details}</p>
          </div>

          {/* Meta */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-xs text-slate-400 justify-end">
              <Clock size={11} />
              {timeAgo(entry.timestamp)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{entry.user}</div>
          </div>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-black/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Entity ID</p>
                  <code className="font-mono text-slate-600 bg-white/80 px-1.5 py-0.5 rounded">{entry.entityId}</code>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Timestamp</p>
                  <p className="text-slate-600">{formatDateTime(entry.timestamp)}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">User</p>
                  <p className="text-slate-600">{entry.user}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Status</p>
                  <Badge variant={entry.status === 'success' ? 'success' : entry.status === 'error' ? 'error' : 'info'}>{entry.status}</Badge>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-slate-400 font-medium mb-0.5">Details</p>
                  <p className="text-slate-600">{entry.details}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function AuditPage() {
  const { state } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const entities = useMemo(() => Array.from(new Set(state.auditEntries.map(e => e.entity))), [state.auditEntries]);

  const filtered = useMemo(() => {
    let list = [...state.auditEntries];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.action.toLowerCase().includes(q) ||
        e.entityName.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(e => e.status === statusFilter);
    if (entityFilter !== 'all') list = list.filter(e => e.entity === entityFilter);
    list.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? -diff : diff;
    });
    return list;
  }, [state.auditEntries, search, statusFilter, entityFilter, sortOrder]);

  const exportAuditLog = () => {
    const csv = [
      ['Timestamp', 'Action', 'Entity', 'Name', 'User', 'Status', 'Details'].join(','),
      ...filtered.map(e => [
        formatDateTime(e.timestamp), e.action, e.entity, `"${e.entityName}"`, e.user, e.status, `"${e.details}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'df-recon-audit.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const successCount = state.auditEntries.filter(e => e.status === 'success').length;
  const errorCount = state.auditEntries.filter(e => e.status === 'error').length;
  const infoCount = state.auditEntries.filter(e => e.status === 'info').length;

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Success', count: successCount, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-500' },
          { label: 'Error', count: errorCount, color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, iconColor: 'text-red-500' },
          { label: 'Info', count: infoCount, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Info, iconColor: 'text-blue-500' },
        ].map(({ label, count, color, icon: Icon, iconColor }) => (
          <div key={label} className={cn('rounded-xl border p-3 sm:p-4 flex items-center gap-3', color)}>
            <Icon size={18} className={iconColor} />
            <div>
              <div className="text-xl sm:text-2xl font-bold">{count}</div>
              <div className="text-xs">{label} event{count !== 1 ? 's' : ''}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Search actions, entities, details…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="info">Info</option>
        </select>
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">All Entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">
          <ArrowUpDown size={14} /> {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
        </button>
        <button onClick={exportAuditLog}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Count */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Filter size={12} />
        Showing {filtered.length} of {state.auditEntries.length} events
      </div>

      {/* Empty state */}
      {state.auditEntries.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
            <ClipboardList size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">No audit events yet</p>
          <p className="text-xs text-slate-400">Events are logged automatically as you use the platform.</p>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.map((entry, i) => (
            <AuditRow key={entry.id} entry={entry} index={i} />
          ))}
        </AnimatePresence>
        {filtered.length === 0 && state.auditEntries.length > 0 && (
          <div className="py-12 text-center text-sm text-slate-400">
            No events match your filters. Try adjusting the search or filter.
          </div>
        )}
      </div>
    </div>
  );
}
