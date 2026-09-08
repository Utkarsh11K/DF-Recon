'use client';

import {
  Folder, PlayCircle, Plus, LayoutGrid,
  Layers3, CheckCircle2, TriangleAlert, ShieldOff, ChevronDown,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import MigrationProjectsTable from '@/components/dashboard/MigrationProjectsTable';
import QuickStartPanel from '@/components/dashboard/QuickStartPanel';

export default function DashboardPage() {
  return (
    <div className="p-4 lg:p-6 animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Batch: Batch 001 - Customer Accounts{' '}
            <span className="font-medium text-slate-700">[DRAFT]</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            <Folder size={15} className="text-blue-500" />
            TEST (TEST)
            <ChevronDown size={14} className="text-slate-300" />
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50">
            <PlayCircle size={15} />
            Load Demo Sample
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} />
            New Project
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <StatCard label="Active Projects"       value={9}  icon={LayoutGrid}    tone="brand"  />
        <StatCard label="Conversion Batches"    value={10} icon={Layers3}       tone="violet" />
        <StatCard label="Loaded in Fusion"      value={0}  icon={CheckCircle2}  tone="green"  />
        <StatCard label="Differences / Missing" value={0}  icon={TriangleAlert} tone="amber"  />
        <StatCard label="Source Excluded"       value={0}  icon={ShieldOff}     tone="slate"  />
      </div>

      <div className="flex items-start gap-5">
        <MigrationProjectsTable />
        <QuickStartPanel />
      </div>
    </div>
  );
}
