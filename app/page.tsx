import {
  Folder,
  PlayCircle,
  Plus,
  LayoutGrid,
  Layers3,
  CheckCircle2,
  TriangleAlert,
  ShieldOff,
  ChevronDown,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import MigrationProjectsTable from "@/components/MigrationProjectsTable";
import QuickStartPanel from "@/components/QuickStartPanel";

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-[#F3F4F8]">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-8 py-7">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-ink-900">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                Batch: Batch 001 - Customer Accounts{" "}
                <span className="font-medium text-ink-700">[DRAFT]</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-ink-700">
                <Folder size={15} className="text-blue-500" />
                TEST (TEST)
                <ChevronDown size={14} className="text-ink-300" />
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-gray-50">
                <PlayCircle size={15} />
                Load Demo Sample
              </button>
              <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                <Plus size={15} />
                New Project
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="mb-6 flex gap-4">
            <StatCard
              label="Active Projects"
              value={9}
              icon={LayoutGrid}
              tone="brand"
            />
            <StatCard
              label="Conversion Batches"
              value={10}
              icon={Layers3}
              tone="violet"
            />
            <StatCard
              label="Loaded in Fusion"
              value={0}
              icon={CheckCircle2}
              tone="green"
            />
            <StatCard
              label="Differences / Missing"
              value={0}
              icon={TriangleAlert}
              tone="amber"
            />
            <StatCard
              label="Source Excluded"
              value={0}
              icon={ShieldOff}
              tone="slate"
            />
          </div>

          {/* Content grid */}
          <div className="flex items-start gap-5">
            <MigrationProjectsTable />
            <QuickStartPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
