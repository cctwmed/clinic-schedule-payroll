"use client";

import { Lock } from "lucide-react";
import type { LiffMode } from "@/components/liff/mode-switcher";

interface ModeTabsProps {
  mode: LiffMode;
  isClinicAdmin: boolean;
  onChange: (mode: LiffMode) => void;
}

export function ModeTabs({ mode, isClinicAdmin, onChange }: ModeTabsProps) {
  function handleAdminClick() {
    if (!isClinicAdmin) {
      window.alert("您無管理員權限");
      return;
    }
    onChange("admin");
  }

  return (
    <div className="flex overflow-hidden rounded-2xl bg-white/60 p-1 shadow-sm ring-1 ring-slate-200/80">
      <button
        type="button"
        onClick={() => onChange("employee")}
        className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-all duration-200 ${
          mode === "employee"
            ? "bg-emerald-600 text-white shadow-md"
            : "text-slate-600 hover:bg-white/80"
        }`}
      >
        我要打卡
      </button>
      <button
        type="button"
        onClick={handleAdminClick}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold transition-all duration-200 ${
          mode === "admin"
            ? "bg-emerald-600 text-white shadow-md"
            : isClinicAdmin
              ? "text-slate-600 hover:bg-white/80"
              : "cursor-not-allowed text-slate-400"
        }`}
      >
        {!isClinicAdmin && <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />}
        管理員
      </button>
    </div>
  );
}
