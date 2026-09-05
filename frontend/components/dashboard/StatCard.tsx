import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const toneMap: Record<string, string> = {
  brand:  'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green:  'bg-emerald-50 text-emerald-600',
  amber:  'bg-amber-50 text-amber-600',
  slate:  'bg-slate-100 text-slate-600',
};

export default function StatCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: 'brand' | 'violet' | 'green' | 'amber' | 'slate';
}) {
  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneMap[tone])}>
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
