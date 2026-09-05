"use client";

import {
  LayoutGrid,
  FolderKanban,
  Wand2,
  History,
  Sparkles,
  Sun,
  Moon,
  Layers,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutGrid },
  { label: "Projects & Batches", icon: FolderKanban },
  { label: "Conversion Wizard", icon: Wand2 },
  { label: "Audit Trail", icon: History },
];

export default function Sidebar() {
  const [active, setActive] = useState("Dashboard");
  const [dark, setDark] = useState(false);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <Layers size={18} strokeWidth={2.25} />
        </div>
        <div>
          <p className="text-[15px] font-semibold leading-tight text-ink-900">
            FusionConvert
          </p>
          <p className="text-xs leading-tight text-ink-500">
            Reconciliation Platform
          </p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-brand-50 font-medium text-brand-600"
                  : "text-ink-700 hover:bg-gray-50"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-gray-100 px-3 py-4">
        <button className="flex w-full items-center gap-2 rounded-lg bg-gradient-to-r from-brand-50 to-indigo-50 px-3 py-2.5 text-sm font-medium text-brand-600">
          <Sparkles size={16} />
          AI Assistant
          <span className="ml-auto rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            PRO
          </span>
        </button>

        <button
          onClick={() => setDark((d) => !d)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-500 hover:bg-gray-50"
        >
          {dark ? <Moon size={16} /> : <Sun size={16} />}
          {dark ? "Dark Mode" : "Light Mode"}
        </button>
      </div>
    </aside>
  );
}
