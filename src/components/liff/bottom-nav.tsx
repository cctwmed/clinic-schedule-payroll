"use client";

export type MobileTab = "clock" | "schedule" | "payslip";

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: "clock", label: "打卡首頁", icon: "📍" },
  { id: "schedule", label: "我的班表", icon: "📅" },
  { id: "payslip", label: "薪水報表", icon: "💰" },
];

interface BottomNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                isActive ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className={isActive ? "font-semibold" : "font-medium"}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
