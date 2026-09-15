'use client';
import { cn } from '@/lib/utils';
import type { Batch, UploadedFile } from '@/lib/types';

// ── Shared StepProps ──────────────────────────────────────────────────────────
export interface WizardContext {
  sourceKey: string;
  targetKey: string;
  keyConfidence: number;
  folderPath?: string;
}

export interface StepProps {
  batch: Batch | null;
  onBatchCreated: (id: string) => void;
  onAdvance: (batchId?: string) => void;
  onBack: () => void;
  wizardCtx: WizardContext;
  onCtxChange: (patch: Partial<WizardContext>) => void;
}

// ── Sub-navigation bar ────────────────────────────────────────────────────────
interface SubTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface StepSubNavProps {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
}

export function StepSubNav({ tabs, active, onChange }: StepSubNavProps) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap',
            active === tab.id
              ? 'bg-white text-indigo-700 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Empty state card ──────────────────────────────────────────────────────────
export function EmptyCard({
  icon, title, message, action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-700 mb-1">{title}</p>
      <p className="text-xs text-slate-400 mb-4">{message}</p>
      {action}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
export function StatTile({
  label, value, sub, color = 'bg-slate-50 text-slate-700',
}: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className={cn('rounded-xl p-3 text-center', color)}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-xs mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
    </div>
  );
}

// ── Nav footer ────────────────────────────────────────────────────────────────
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function StepFooter({
  onBack,
  onNext,
  nextLabel = 'Continue',
  disableNext = false,
  loading = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  disableNext?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 pt-4 border-t border-slate-100 mt-4">
      <Button variant="secondary" icon={<ChevronLeft size={14} />} onClick={onBack}>
        Back
      </Button>
      <Button
        icon={<ChevronRight size={15} />}
        onClick={onNext}
        disabled={disableNext}
        loading={loading}
      >
        {nextLabel}
      </Button>
    </div>
  );
}

// ── Default column shapes (Empty until files uploaded) ─────────────────────────
export const DEMO_SOURCE_COLS: Array<{
  name: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
  isPrimaryKeyCandidate: boolean;
}> = [];

export const DEMO_TARGET_COLS: Array<{
  name: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
  isPrimaryKeyCandidate: boolean;
}> = [];

