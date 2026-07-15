"use client";

export type LiffMode = "employee" | "admin";

interface ModeSwitcherProps {
  mode: LiffMode;
  onChange: (mode: LiffMode) => void;
}

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className="mx-4 mt-3 flex overflow-hidden rounded-xl border border-emerald-600 bg-emerald-600 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("employee")}
        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
          mode === "employee"
            ? "bg-white text-emerald-700"
            : "bg-emerald-600 text-white"
        }`}
      >
        我要打卡
      </button>
      <button
        type="button"
        onClick={() => onChange("admin")}
        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
          mode === "admin"
            ? "bg-white text-emerald-700"
            : "bg-emerald-600 text-white"
        }`}
      >
        管理員
      </button>
    </div>
  );
}
