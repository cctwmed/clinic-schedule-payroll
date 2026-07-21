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
  Settings,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import type { LiffMode } from "@/components/liff/mode-switcher";
import type { MobileTab } from "@/components/liff/bottom-nav";

export type { MobileTab };
export type GridAction =
  | { type: "tab"; tab: MobileTab }
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
    label: "忘記打卡",
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

function adminItems(base: string): GridItem[] {
  return [
    {
      id: "review-ot",
      label: "審核加班",
      icon: AlarmClock,
      action: { type: "admin", href: `${base}/clock-records` },
      bgClass: "bg-emerald-50",
      iconClass: "text-emerald-600",
    },
    {
      id: "review-leave",
      label: "審核請假",
      icon: FileCheck,
      action: { type: "admin", href: `${base}/leave` },
      bgClass: "bg-sky-50",
      iconClass: "text-sky-600",
    },
    {
      id: "review-abnormal",
      label: "異常審核",
      icon: AlertTriangle,
      action: { type: "admin", href: `${base}/clock-records` },
      bgClass: "bg-amber-50",
      iconClass: "text-amber-600",
    },
    {
      id: "attendance",
      label: "出勤數據",
      icon: BarChart3,
      action: { type: "admin", href: `${base}/clock-records` },
      bgClass: "bg-indigo-50",
      iconClass: "text-indigo-600",
    },
    {
      id: "schedules",
      label: "排班管理",
      icon: CalendarDays,
      action: { type: "admin", href: `${base}/schedules` },
      bgClass: "bg-violet-50",
      iconClass: "text-violet-600",
    },
    {
      id: "payroll",
      label: "薪資統計",
      icon: Coins,
      action: { type: "admin", href: `${base}/payroll` },
      bgClass: "bg-teal-50",
      iconClass: "text-teal-600",
    },
    {
      id: "employees",
      label: "同仁管理",
      icon: Users,
      action: { type: "admin", href: `${base}/employees` },
      bgClass: "bg-blue-50",
      iconClass: "text-blue-600",
    },
    {
      id: "settings",
      label: "系統設定",
      icon: Settings,
      action: { type: "admin", href: `${base}/` },
      bgClass: "bg-slate-50",
      iconClass: "text-slate-600",
    },
  ];
}

interface FunctionGridProps {
  mode: LiffMode;
  appUrl?: string;
  onAction: (action: GridAction) => void;
}

export function FunctionGrid({ mode, appUrl, onAction }: FunctionGridProps) {
  const base = appUrl?.replace(/\/$/, "") ?? "";
  const items = mode === "admin" ? adminItems(base) : EMPLOYEE_ITEMS;

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
            onClick={() => onAction(item.action)}
            className={`group flex flex-col items-center gap-2 rounded-2xl p-2 transition-transform duration-150 active:scale-95 ${
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
