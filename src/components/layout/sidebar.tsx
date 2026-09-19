"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";

const navItems = [
  { href: "/", label: "總覽", icon: "🏠" },
  { href: "/employees", label: "員工管理", icon: "👥" },
  { href: "/schedules", label: "排班管理", icon: "📅" },
  { href: "/leave", label: "請假管理", icon: "🏖️" },
  { href: "/clock-records", label: "打卡審核", icon: "📍" },
  { href: "/payroll", label: "薪資結算", icon: "💰" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-blue-50 text-blue-700"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-600">
        診所後台
      </p>
      <h1 className="mt-1 text-base font-semibold text-slate-900">排班支薪系統</h1>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* 手機頂欄 */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
        <button
          type="button"
          aria-label="開啟選單"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-800 px-2.5 py-1.5 text-sm font-semibold text-black"
        >
          選單
        </button>
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {navItems.find((item) => isActivePath(pathname, item.href))?.label ?? "診所後台"}
        </p>
      </header>

      {/* 手機滑出選單 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="關閉選單"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[min(18rem,85vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">診所後台</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-700"
              >
                關閉
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <LogoutButton />
          </aside>
        </div>
      )}

      {/* 電腦側欄 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <Brand />
        <NavLinks pathname={pathname} />
        <LogoutButton />
      </aside>
    </>
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-700">{description}</p>}
      </div>
      {action}
    </div>
  );
}
