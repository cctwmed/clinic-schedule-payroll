"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";

const navItems = [
  { href: "/", label: "總覽", icon: "🏠" },
  { href: "/employees", label: "員工管理", icon: "👥" },
  { href: "/schedules", label: "排班管理", icon: "📅" },
  { href: "/leave", label: "特休管理", icon: "🏖️" },
  { href: "/clock-records", label: "打卡紀錄", icon: "📍" },
  { href: "/payroll", label: "薪資結算", icon: "💰" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          診所後台
        </p>
        <h1 className="mt-1 text-base font-semibold text-slate-900">排班支薪系統</h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <LogoutButton />
    </aside>
  );
}

export function DashboardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
