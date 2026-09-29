"use client";

import { openManagementPage } from "@/lib/liff/open-management";

const ADMIN_LINKS = [
  { href: "/schedules", label: "排班管理", icon: "🗓️", desc: "編輯班表、休診、發布" },
  { href: "/payroll", label: "薪資結算", icon: "💰", desc: "月薪資、規費總覽" },
  { href: "/employees", label: "員工管理", icon: "👥", desc: "時薪、勞健保設定" },
  { href: "/clock-records", label: "打卡紀錄", icon: "📋", desc: "審核、匯出列印" },
  { href: "/clock-records/export", label: "出勤證明", icon: "🖨️", desc: "LIFF 打卡列印（勞保局）" },
  { href: "/leave", label: "特休管理", icon: "🏖️", desc: "特休登記與折現" },
] as const;

interface AdminTabProps {
  appUrl?: string;
}

export function AdminTab({ appUrl }: AdminTabProps) {
  return (
    <div className="px-4 pt-4">
      <header className="mb-4 text-center">
        <h1 className="text-lg font-bold text-slate-900">管理員專區</h1>
        <p className="mt-1 text-xs text-slate-600">管理後台以電腦瀏覽器為主；手機可備用操作</p>
      </header>

      <section className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-900">
        <p className="font-medium">使用提醒</p>
        <p className="mt-1 text-xs leading-relaxed">
          電腦會開新分頁進入完整後台（左側選單）。手機則在目前畫面開啟，登入後用左上角「選單」切換功能。
        </p>
      </section>

      <ul className="space-y-3">
        {ADMIN_LINKS.map((link) => (
          <li key={link.href}>
            <button
              type="button"
              onClick={() => {
                void openManagementPage(link.href, appUrl).catch((err) => {
                  console.error("[LIFF admin link]", err);
                  window.alert(
                    err instanceof Error
                      ? err.message
                      : "無法開啟後台，請改用電腦瀏覽器"
                  );
                });
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50/30"
            >
              <span className="text-2xl">{link.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{link.label}</p>
                <p className="text-xs text-slate-600">{link.desc}</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
