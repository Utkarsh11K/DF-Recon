'use client';
import {
  Plus, LayoutGrid,
  Layers3, CheckCircle2, TriangleAlert, ShieldOff, Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import StatCard from '@/components/dashboard/StatCard';
import MigrationProjectsTable from '@/components/dashboard/MigrationProjectsTable';
import QuickStartPanel from '@/components/dashboard/QuickStartPanel';

export default function DashboardPage() {
  const { state } = useStore();

  const activeProjects  = state.projects.filter(p => p.status === 'active').length;
  const totalBatches    = state.batches.length;
  const completedBatches = state.batches.filter(b => b.status === 'completed').length;
  const inProgressBatches = state.batches.filter(b => b.status === 'in_progress').length;
  const failedBatches   = state.batches.filter(b => b.status === 'failed').length;

  return (
    <div className="p-4 lg:p-6 animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {totalBatches === 0
              ? 'No batches yet — create one to get started'
              : `${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} · ${completedBatches} completed · ${inProgressBatches} in progress`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/wizard">
            <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50">
              <Wand2 size={15} className="text-indigo-500" />
              New Batch
            </button>
          </Link>
          <Link href="/projects">
            <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} />
              New Project
            </button>
          </Link>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <StatCard label="Active Projects"       value={activeProjects}    icon={LayoutGrid}    tone="brand"  />
        <StatCard label="Conversion Batches"    value={totalBatches}      icon={Layers3}       tone="violet" />
        <StatCard label="Completed"             value={completedBatches}  icon={CheckCircle2}  tone="green"  />
        <StatCard label="In Progress"           value={inProgressBatches} icon={TriangleAlert} tone="amber"  />
        <StatCard label="Failed"                value={failedBatches}     icon={ShieldOff}     tone="slate"  />
      </div>

      <div className="flex items-start gap-5">
        <MigrationProjectsTable />
        <QuickStartPanel />
      </div>
    </div>
  );
}
