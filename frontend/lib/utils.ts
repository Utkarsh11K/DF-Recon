// ── Utility helpers ───────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function fileExtension(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? '';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'text-emerald-600 bg-emerald-50',
    completed: 'text-blue-600 bg-blue-50',
    paused: 'text-yellow-600 bg-yellow-50',
    archived: 'text-gray-500 bg-gray-100',
    pending: 'text-yellow-600 bg-yellow-50',
    in_progress: 'text-indigo-600 bg-indigo-50',
    failed: 'text-red-600 bg-red-50',
  };
  return map[status] ?? 'text-gray-600 bg-gray-100';
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    error: 'text-red-600 bg-red-50 border-red-200',
    warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200',
    success: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  };
  return map[severity] ?? 'text-gray-600 bg-gray-50 border-gray-200';
}
