"use client";

import { ChevronLeft } from "lucide-react";

interface SubPageHeaderProps {
  title: string;
  onBack: () => void;
}

export function SubPageHeader({ title, onBack }: SubPageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-sm font-medium text-emerald-700"
      >
        <ChevronLeft className="h-5 w-5" />
        返回
      </button>
      <h1 className="flex-1 text-center text-base font-bold text-slate-900">{title}</h1>
      <span className="w-14" />
    </header>
  );
}
