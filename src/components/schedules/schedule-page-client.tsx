"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { ComplianceAlertList } from "@/components/compliance/compliance-alert-list";
import {
  applyClinicGoldenTemplate,
  generateGoldenSchedule,
  publishSchedule,
  saveScheduleAssignment,
} from "@/app/(dashboard)/schedules/actions";
import type { ComplianceIssue } from "@/lib/compliance/types";
import type { Clinic } from "@/lib/clinic";
import { GOLDEN_SCHEDULE } from "@/lib/shift-templates";
import { getRotationLegend } from "@/lib/schedules/golden-rotation";
import type { GoldenScheduleConfig } from "@/lib/schedules/golden-config";
import type {
  DayAssignmentMap,
  Schedule,
  ScheduleEmployee,
  ShiftType,
} from "@/types/schedule";
import {
  SCHEDULE_STATUS_LABELS,
  formatWorkDate,
  weekdayLabel,
} from "@/types/schedule";
import { getDayOfWeekTaipei, isDualClinicDay } from "@/lib/shift-templates";

interface SchedulePageClientProps {
  initialYear: number;
  initialMonth: number;
  clinic: Clinic;
  schedule: Schedule;
  shiftTypes: ShiftType[];
  offDayShiftTypes: ShiftType[];
  employees: ScheduleEmployee[];
  assignmentMap: DayAssignmentMap;
  daysInMonth: number;
  complianceIssues: ComplianceIssue[];
  goldenConfig: GoldenScheduleConfig | null;
}

export function SchedulePageClient({
  initialYear,
  initialMonth,
  clinic,
  schedule,
  shiftTypes,
  offDayShiftTypes,
  employees,
  assignmentMap: initialMap,
  daysInMonth,
  complianceIssues,
  goldenConfig,
}: SchedulePageClientProps) {
  const router = useRouter();
  const [year] = useState(initialYear);
  const [month] = useState(initialMonth);
  const [assignmentMap, setAssignmentMap] = useState(initialMap);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeAId, setEmployeeAId] = useState(goldenConfig?.employeeAId ?? "");
  const [employeeBId, setEmployeeBId] = useState(goldenConfig?.employeeBId ?? "");
  const [oddWeekTrackForA, setOddWeekTrackForA] = useState<1 | 2>(
    goldenConfig?.oddWeekTrackForA ?? 1
  );
  const [isPending, startTransition] = useTransition();

  const isPublished = schedule.status === "published";
  const allColumns = [...shiftTypes, ...offDayShiftTypes];
  const legend = getRotationLegend(oddWeekTrackForA);
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  function changeMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    router.push(`/schedules?year=${newYear}&month=${newMonth}`);
  }

  function handleAssign(workDate: string, shift: ShiftType, employeeId: string) {
    if (isPublished) return;

    const value = employeeId || null;
    setAssignmentMap((prev) => ({
      ...prev,
      [workDate]: { ...prev[workDate], [shift.id]: value },
    }));

    startTransition(async () => {
      const result = await saveScheduleAssignment(
        schedule.id,
        workDate,
        shift.id,
        value,
        shift.default_clock_in ?? "00:00",
        shift.default_clock_out ?? "00:00"
      );
      setMessage(result.success ? null : result.error);
      if (result.success) router.refresh();
    });
  }

  function handleApplyGoldenTemplate() {
    startTransition(async () => {
      const result = await applyClinicGoldenTemplate();
      setMessage(`已套用「${result.template}」（早診 ${GOLDEN_SCHEDULE.MORNING_IN} 到）`);
      router.refresh();
    });
  }

  function handleGenerateGolden() {
    if (!employeeAId || !employeeBId) {
      setMessage("請先選擇員工 A（護理組長）與員工 B（正職護理師）");
      return;
    }
    if (employeeAId === employeeBId) {
      setMessage("員工 A 與 B 必須是不同人");
      return;
    }
    if (
      !confirm(
        `確定為 ${year} 年 ${month} 月一鍵產生黃金班表？\n現有草稿排班將被覆蓋。`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await generateGoldenSchedule(schedule.id, {
        employeeAId,
        employeeBId,
        oddWeekTrackForA,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage(`已產生 ${result.count} 筆排班（雙人全正職輪替）`);
      router.refresh();
    });
  }

  function handlePublish() {
    if (
      !confirm(
        `確定發布 ${year} 年 ${month} 月班表？\n發布後將透過 LINE 通知所有已綁定的護理師。`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await publishSchedule(schedule.id);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage(
        `班表已發布！已成功通知 ${result.notified} 位員工` +
          (result.notifyErrors?.length ? `（部分失敗：${result.notifyErrors.join("；")}）` : "")
      );
      router.refresh();
    });
  }

  function employeeLabel(emp: ScheduleEmployee) {
    const title = emp.job_title?.trim();
    return title ? `${emp.name}（${title}）` : emp.name;
  }

  return (
    <>
      <DashboardHeader
        title="排班管理"
        description={`${clinic.name} — 雙人全正職輪替黃金班表（每週 11 診 · 08:20 到 · 08:30 開診）`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              ← 上個月
            </button>
            <span className="min-w-28 text-center text-sm font-semibold text-slate-800">
              {year} 年 {month} 月
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              下個月 →
            </button>
            {!isPublished && (
              <button
                onClick={handlePublish}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                確認發布班表
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4 p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="font-semibold">雙週火車頭輪替規則</p>
          <p className="mt-1 text-amber-800">
            週一、二、四、五：兩位正職同時早晚診全勤（雙人戰力）。週三、六、日：半天診 08:20–12:00，依軌道輪替。
            隔週兩人的週三與六、日班表自動完全對調。輪班間隔約 12 小時 20 分（≥ 11 小時安全線）。
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">{legend.track1.title}</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
              {legend.track1.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">{legend.track2.title}</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
              {legend.track2.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{legend.swapNote}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              員工 A（護理組長）
            </label>
            <select
              value={employeeAId}
              onChange={(e) => setEmployeeAId(e.target.value)}
              disabled={isPublished || isPending}
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— 請選擇 —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {employeeLabel(emp)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              員工 B（正職護理師）
            </label>
            <select
              value={employeeBId}
              onChange={(e) => setEmployeeBId(e.target.value)}
              disabled={isPublished || isPending}
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— 請選擇 —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {employeeLabel(emp)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              奇數週員工 A 走
            </label>
            <select
              value={oddWeekTrackForA}
              onChange={(e) => setOddWeekTrackForA(Number(e.target.value) as 1 | 2)}
              disabled={isPublished || isPending}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={1}>軌道一（週三值班、六日大休）</option>
              <option value={2}>軌道二（週三例休、六日早班）</option>
            </select>
          </div>
          {!isPublished && (
            <>
              <button
                onClick={handleApplyGoldenTemplate}
                disabled={isPending}
                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
              >
                套用黃金班別
              </button>
              <button
                onClick={handleGenerateGolden}
                disabled={isPending || employees.length < 2}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                一鍵產生黃金班表
              </button>
            </>
          )}
          <StatusBadge
            label={SCHEDULE_STATUS_LABELS[schedule.status]}
            tone={schedule.status === "published" ? "green" : "amber"}
          />
        </div>

        <ComplianceAlertList issues={complianceIssues} />

        {message && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        )}

        {employees.length < 2 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            請先到「員工管理」新增 2 位全職正職（護理組長 + 正職護理師），才能產生黃金班表
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3">日期</th>
                    <th className="px-3 py-3">星期</th>
                    <th className="px-3 py-3">診別</th>
                    {allColumns.map((shift) => (
                      <th key={shift.id} className="min-w-32 px-3 py-3">
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: shift.color_hex ?? "#3B82F6" }}
                        />
                        {shift.name}
                        {shift.default_clock_in && (
                          <span className="mt-0.5 block font-normal normal-case text-slate-400">
                            {shift.default_clock_in.slice(0, 5)}–
                            {shift.default_clock_out?.slice(0, 5)}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.map((day) => {
                    const workDate = formatWorkDate(year, month, day);
                    const dow = getDayOfWeekTaipei(workDate);
                    const isWeekend = dow === 0 || dow === 6;
                    const sessionLabel = isDualClinicDay(dow)
                      ? "雙診 7.67h"
                      : "半日 3.67h";

                    return (
                      <tr
                        key={workDate}
                        className={isWeekend ? "bg-slate-50/60" : "hover:bg-slate-50/40"}
                      >
                        <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-medium text-slate-800">
                          {month}/{day}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{weekdayLabel(workDate)}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{sessionLabel}</td>
                        {allColumns.map((shift) => {
                          const selected = assignmentMap[workDate]?.[shift.id] ?? "";
                          return (
                            <td key={shift.id} className="px-2 py-2">
                              <select
                                disabled={isPublished || isPending}
                                value={selected}
                                onChange={(e) => handleAssign(workDate, shift, e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-slate-100"
                              >
                                <option value="">—</option>
                                {employees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "green" | "amber" }) {
  const styles =
    tone === "green" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
