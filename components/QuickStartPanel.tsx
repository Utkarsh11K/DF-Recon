import {
  Zap,
  Users,
  Truck,
  UserSquare2,
  Briefcase,
  Receipt,
  ShoppingCart,
  Landmark,
  Boxes,
} from "lucide-react";

const OBJECTS = [
  { label: "Customer Master", icon: Users },
  { label: "Supplier Master", icon: Truck },
  { label: "Worker / HCM", icon: UserSquare2 },
  { label: "Project", icon: Briefcase },
  { label: "AR / AP Invoice", icon: Receipt },
  { label: "Purchase Order", icon: ShoppingCart },
  { label: "Cost & Asset", icon: Landmark },
  { label: "Custom Fusion Object", icon: Boxes },
];

export default function QuickStartPanel() {
  return (
    <div className="w-[300px] shrink-0 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <Zap size={16} className="text-amber-500" />
        <h2 className="text-[15px] font-semibold text-ink-900">
          Quick Start & Fusion Objects
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {OBJECTS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="flex flex-col items-start gap-2.5 rounded-lg border border-gray-200 p-3 text-left text-sm font-medium text-ink-900 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <Icon size={17} className="text-ink-500" strokeWidth={2} />
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
