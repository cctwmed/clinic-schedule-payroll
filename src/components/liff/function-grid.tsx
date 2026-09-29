"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  Clock,
  Coins,
  FileCheck,
  LayoutGrid,
  MapPin,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import type { LiffMode } from "@/components/liff/mode-switcher";
import type { MobileTab } from "@/components/liff/bottom-nav";

export type { MobileTab };

/** 管理員待審頁要打開的區塊，避免四個按鈕都進同一頁 */
export type AdminInboxSection = "all" | "leave" | "abnormal" | "overtime";

export type GridAction =
  | { type: "tab"; tab: MobileTab; inboxSection?: AdminInboxSection }
  | { type: "clock" }
  | { type: "admin"; href: string }
  | { type: "settings" };

interface GridItem {
  id: string;
  label: string;
  icon: LucideIcon;
  action: GridAction;
  accent?: boolean;
  iconClass?: string;
  bgClass?: string;
}

const EMPLOYEE_ITEMS: GridItem[] = [
  {
    id: "forgot",
    label: "忘記/修正打卡",
    icon: MapPin,
    action: { type: "tab", tab: "forgot" },
    bgClass: "bg-amber-50",
    iconClass: "text-amber-600",
  },
  {
    id: "clock",
    label: "我要打卡",
    icon: Clock,
    action: { type: "clock" },
    accent: true,
    bgClass: "bg-emerald-50",
    iconClass: "text-emerald-600",
  },
  {
    id: "leave",
    label: "我要請假",
    icon: CalendarCheck,
    action: { type: "tab", tab: "leave" },
    bgClass: "bg-sky-50",
    iconClass: "text-sky-600",
  },
  {
    id: "overtime",
    label: "我要加班",
    icon: Timer,
    action: { type: "tab", tab: "overtime" },
    bgClass: "bg-violet-50",
    iconClass: "text-violet-600",
  },
  {
    id: "records",
    label: "出勤紀錄",
    icon: CalendarDays,
    action: { type: "tab", tab: "records" },
    bgClass: "bg-slate-50",
    iconClass: "text-slate-600",
  },
  {
    id: "schedule",
    label: "我的班表",
    icon: BarChart3,
    action: { type: "tab", tab: "schedule" },
    bgClass: "bg-indigo-50",
    iconClass: "text-indigo-600",
  },
  {
    id: "payslip",
    label: "我的薪資",
    icon: Wallet,
    action: { type: "tab", tab: "payslip" },
    bgClass: "bg-teal-50",
    iconClass: "text-teal-600",
  },
  {
    id: "more",
    label: "更多功能",
    icon: LayoutGrid,
    action: { type: "settings" },
    bgClass: "bg-slate-50",
    iconClass: "text-slate-500",
  },
];

function adminItems(): GridItem[] {
  return [
    {
      id: "review-inbox",
      label: "待審中心",
      icon: FileCheck,
      action: { type: "tab", tab: "admin-inbox", inboxSection: "all" },
      accent: true,
      bgClass: "bg-emerald-50",
      iconClass: "text-emerald-600",
    },
    {
      id: "review-leave",
      label: "審核請假",
      icon: CalendarCheck,
      action: { type: "tab", tab: "admin-inbox", inboxSection: "leave" },
      bgClass: "bg-sky-50",
      iconClass: "text-sky-600",
    },
    {
      id: "review-abnormal",
      label: "審核異常",
      icon: AlertTriangle,
      action: { type: "tab", tab: "admin-inbox", inboxSection: "abnormal" },
      bgClass: "bg-amber-50",
      iconClass: "text-amber-600",
    },
    {
      id: "review-ot",
      label: "審核加班",
      icon: AlarmClock,
      action: { type: "tab", tab: "admin-inbox", inboxSection: "overtime" },
      bgClass: "bg-violet-50",
      iconClass: "text-violet-600",
    },
    {
      id: "attendance",
      label: "出勤數據",
      icon: BarChart3,
      action: { type: "tab", tab: "admin-clocks" },
      bgClass: "bg-indigo-50",
      iconClass: "text-indigo-600",
    },
    {
      id: "schedules",
      label: "排班管理",
      icon: CalendarDays,
      action: { type: "tab", tab: "admin-schedule" },
      bgClass: "bg-violet-50",
      iconClass: "text-violet-600",
    },
    {
      id: "payroll",
      label: "薪資統計",
      icon: Coins,
      action: { type: "tab", tab: "admin-pay" },
      bgClass: "bg-teal-50",
      iconClass: "text-teal-600",
    },
    {
      id: "employees",
      label: "同仁管理",
      icon: Users,
      action: { type: "tab", tab: "admin-people" },
      bgClass: "bg-blue-50",
      iconClass: "text-blue-600",
    },
  ];
}

interface FunctionGridProps {
  mode: LiffMode;
  appUrl?: string;
  onAction: (action: GridAction) => void;
}

export function FunctionGrid({ mode, onAction }: FunctionGridProps) {
  const items = mode === "admin" ? adminItems() : EMPLOYEE_ITEMS;

  return (
    <section
      key={mode}
      className="grid grid-cols-4 gap-4 transition-opacity duration-200"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              try {
                onAction(item.action);
              } catch (err) {
                console.error("[LIFF grid]", err);
              }
            }}
            className={`group flex min-h-[5.5rem] touch-manipulation flex-col items-center gap-2 rounded-2xl p-2 transition-transform duration-150 active:scale-95 ${
              item.accent ? "ring-2 ring-emerald-200/80" : ""
            }`}
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-sm transition-shadow group-hover:shadow-md ${
                item.bgClass ?? "bg-slate-50"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${item.iconClass ?? "text-slate-600"}`}
                strokeWidth={2}
              />
            </span>
            <span className="text-center text-[11px] font-medium leading-tight text-slate-700">
              {item.label}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/** @deprecated use GridAction */
export type FunctionGridAction = GridAction;
