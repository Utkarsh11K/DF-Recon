'use client';

import { RefreshCcw, CheckCircle2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { Badge } from '@/components/ui/Badge';
import type { BatchStatus } from '@/lib/types';

const STATUS_VARIANT: Record<BatchStatus, 'success' | 'info' | 'warning' | 'error' | 'outline'> = {
  completed:   'success',
  in_progress: 'info',
  pending:     'outline',
  failed:      'error',
};

export default function MigrationProjectsTable() {
  const { state } = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  // Show batches with their project names
  const rows = state.batches.map(batch => ({
    batch,
    project: state.projects.find(p => p.id === batch.projectId),
  }));

  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-[15px] font-semibold text-slate-900">
          Migration Batches
          <span className="ml-2 text-xs font-normal text-slate-400">({rows.length})</span>
        </h2>
        <Link
          href="/batches"
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <RefreshCcw size={13} />
          View All
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center px-5">
          <p className="text-sm font-medium text-slate-600 mb-1">No batches yet</p>
          <p className="text-xs text-slate-400 mb-4">Create a batch in the Conversion Wizard to get started.</p>
          <Link
            href="/wizard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <Wand2 size={13} />
            Open Wizard
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Batch Name</th>
                <th className="px-3 py-3 font-medium">Project</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Records</th>
                <th className="px-3 py-3 font-medium">Step</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map(({ batch, project }) => {
                const isSelected = selected === batch.id;
                return (
                  <tr key={batch.id} className="border-t border-gray-100 hover:bg-gray-50/70">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{batch.name}</td>
                    <td className="px-3 py-3.5">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {project?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge variant={STATUS_VARIANT[batch.status]}>
                        {batch.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">
                      {batch.sourceFile?.rowCount?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-3 py-3.5 text-slate-500 text-xs capitalize">
                      {batch.wizardStep.replace(/-/g, ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelected(batch.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-gray-200 text-slate-700 hover:bg-gray-50'
                          )}
                        >
                          <CheckCircle2 size={13} />
                          Select
                        </button>
                        <Link href={`/wizard?batchId=${batch.id}`}>
                          <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-gray-50">
                            <Wand2 size={13} />
                            Open
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
