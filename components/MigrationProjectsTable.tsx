"use client";

import { RefreshCcw, CheckCircle2 } from "lucide-react";
import { useState } from "react";

type Project = {
  name: string;
  object: string;
  source: string;
  method: string;
  batches: number;
};

const PROJECTS: Project[] = [
  { name: "TEST", object: "TEST", source: "CSV", method: "FBDI", batches: 0 },
  {
    name: "Customer Master Conversion Demo",
    object: "CUSTOMER",
    source: "Legacy EBS R12",
    method: "FBDI",
    batches: 1,
  },
  { name: "awdsad", object: "SFS", source: "asdasdas", method: "FBDI", batches: 1 },
  { name: "TEST", object: "CUSTOMER", source: "CSV", method: "FBDI", batches: 1 },
  { name: "qWQEQ", object: "DWDEWD", source: "EWDWED", method: "FBDI", batches: 1 },
  { name: "TEST001", object: "OK3ERK", source: "OK3WKR", method: "FBDI", batches: 3 },
  { name: "TEST", object: "CUSTOMER", source: "CSV", method: "FBDI", batches: 1 },
];

export default function MigrationProjectsTable() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink-900">
          Migration Projects
        </h2>
        <button className="flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-700">
          <RefreshCcw size={13} />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-ink-300">
              <th className="px-5 py-3 font-medium">Project Name</th>
              <th className="px-3 py-3 font-medium">Fusion Object</th>
              <th className="px-3 py-3 font-medium">Source System</th>
              <th className="px-3 py-3 font-medium">Method</th>
              <th className="px-3 py-3 font-medium">Batches</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {PROJECTS.map((p, i) => {
              const rowKey = `${p.name}-${i}`;
              const isSelected = selected === rowKey;
              return (
                <tr
                  key={rowKey}
                  className="border-t border-gray-100 hover:bg-gray-50/70"
                >
                  <td className="px-5 py-3.5 font-medium text-ink-900">
                    {p.name}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink-500">
                      {p.object}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-ink-700">{p.source}</td>
                  <td className="px-3 py-3.5">
                    <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs text-ink-500">
                      {p.method}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-ink-700">
                    {p.batches} Batches
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setSelected(rowKey)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-gray-200 text-ink-700 hover:bg-gray-50"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      Select
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
