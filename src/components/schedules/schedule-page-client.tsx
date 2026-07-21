"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { ComplianceAlertList } from "@/components/compliance/compliance-alert-list";
import {
  applyClinicGoldenTemplate,
  fetchScheduleComplianceIssues,
  generateGoldenSchedule,
  markClinicClosureDay,
  markHalfDaySchedule,
  publishSchedule,
  saveScheduleAssignment,
} from "@/app/(dashboard)/schedules/actions";
import type { PublicHoliday } from "@/lib/holidays/taiwan-public-holidays";
import type { ComplianceIssue } from "@/lib/compliance/types";
import type { Clinic } from "@/lib/clinic";
import { GOLDEN_SCHEDULE } from "@/lib/shift-templates";
import { getRotationLegend } from "@/lib/schedules/golden-rotation";
import type { GoldenScheduleConfig, ClosureRecord, ClosureReason } from "@/lib/schedules/golden-config";
import {
  CLOSURE_REASON_LABELS,
  CLOSURE_REASON_PAY_HINTS,
  normalizeClosureReason,
} from "@/lib/schedules/golden-config";
import { isTaiwanPublicHoliday } from "@/lib/holidays/taiwan-public-holidays";
import { displayJobTitle } from "@/types/employee";
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
  closures: ClosureRecord[];
  publicHolidays: PublicHoliday[];
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
  complianceIssues: initialCompliance,
  goldenConfig,
  closures: initialClosures,
  publicHolidays,
}: SchedulePageClientProps) {
  const router = useRouter();
  // 直接用 props，避免軟導覽後 useState 初始值卡住
  const year = initialYear;
  const month = initialMonth;

  const [assignmentMap, setAssignmentMap] = useState(initialMap);
  const [closures, setClosures] = useState(initialClosures);
  const [complianceIssues, setComplianceIssues] = useState(initialCompliance);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeAId, setEmployeeAId] = useState(goldenConfig?.employeeAId ?? "");
  const [employeeBId, setEmployeeBId] = useState(goldenConfig?.employeeBId ?? "");
  const [oddWeekTrackForA, setOddWeekTrackForA] = useState<1 | 2>(
    goldenConfig?.oddWeekTrackForA ?? 1
  );
  const [closureDate, setClosureDate] = useState("");
  const [closureReason, setClosureReason] = useState<ClosureReason>("voluntary");
  const [closureReasonNote, setClosureReasonNote] = useState("");
  const [closureCreditHours, setClosureCreditHours] = useState<number>(
    GOLDEN_SCHEDULE.DUAL_DAY_HOURS
  );
  /** 僅鎖定正在儲存的格子，避免整張表 disabled 造成卡頓 */
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAssignmentMap(initialMap);
    setClosures(initialClosures);
    setEmployeeAId(goldenConfig?.employeeAId ?? "");
    setEmployeeBId(goldenConfig?.employeeBId ?? "");
    setOddWeekTrackForA(goldenConfig?.oddWeekTrackForA ?? 1);
    setIsNavigating(false);
    setPendingCell(null);
  }, [schedule.id, year, month]); // eslint-disable-line react-hooks/exhaustive-deps -- 僅在換月／換班表時同步伺服器資料

  useEffect(() => {
    let cancelled = false;
    setComplianceIssues([]);
    void fetchScheduleComplianceIssues(year, month)
      .then((issues) => {
        if (!cancelled) setComplianceIssues(issues);
      })
      .catch(() => {
        if (!cancelled) setComplianceIssues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, schedule.id]);

  const closureDateSet = useMemo(
    () => new Set(closures.map((c) => c.date)),
    [closures]
  );

  const holidayMap = useMemo(
    () => new Map(publicHolidays.map((h) => [h.date, h.name])),
    [publicHolidays]
  );

  const eveningShiftId = useMemo(
    () => shiftTypes.find((s) => s.code === "EVENING")?.id ?? null,
    [shiftTypes]
  );

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.id,
        label: emp.name,
      })),
    [employees]
  );

  const isPublished = schedule.status === "published";
  const allColumns = useMemo(
    () => [...shiftTypes, ...offDayShiftTypes],
    [shiftTypes, offDayShiftTypes]
  );
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
    setIsNavigating(true);
    setMessage(`正在載入 ${newYear} 年 ${newMonth} 月…`);
    router.push(`/schedules?year=${newYear}&month=${newMonth}`);
  }

  async function handleAssign(workDate: string, shift: ShiftType, employeeId: string) {
    if (isPublished) return;

    const cellKey = `${workDate}:${shift.id}`;
    const prevValue = assignmentMap[workDate]?.[shift.id] ?? "";
    const value = employeeId || null;

    setAssignmentMap((prev) => ({
      ...prev,
      [workDate]: { ...prev[workDate], [shift.id]: value },
    }));
    setMessage(null);
    setPendingCell(cellKey);

    try {
      const result = await saveScheduleAssignment(
        schedule.id,
        workDate,
        shift.id,
        value,
        shift.default_clock_in ?? "00:00",
        shift.default_clock_out ?? "00:00"
      );
      if (!result.success) {
        setAssignmentMap((prev) => ({
          ...prev,
          [workDate]: { ...prev[workDate], [shift.id]: prevValue || null },
        }));
        setMessage(result.error ?? "儲存失敗");
      }
    } catch (err) {
      setAssignmentMap((prev) => ({
        ...prev,
        [workDate]: { ...prev[workDate], [shift.id]: prevValue || null },
      }));
      setMessage(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setPendingCell((cur) => (cur === cellKey ? null : cur));
    }
  }

  function handleRowClosure(workDate: string) {
    if (isPublished) {
      setMessage("已發布班表請用下方休診區塊設定臨時休診");
      return;
    }
    const suggested: ClosureReason = isTaiwanPublicHoliday(workDate)
      ? "national"
      : "voluntary";
    const reasonLabel = CLOSURE_REASON_LABELS[suggested];
    if (
      !confirm(
        `確定將 ${workDate} 標記為全天休診？\n原因：${reasonLabel}\n${CLOSURE_REASON_PAY_HINTS[suggested]}\n\n若原因不同，請改用下方「休診日設定」選擇後再標記。`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await markClinicClosureDay(
          schedule.id,
          workDate,
          "planned",
          GOLDEN_SCHEDULE.DUAL_DAY_HOURS,
          suggested
        );
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        setClosures((prev) => [
          ...prev.filter((c) => c.date !== workDate),
          {
            date: workDate,
            mode: "planned",
            reason: suggested,
            creditHours: GOLDEN_SCHEDULE.DUAL_DAY_HOURS,
          },
        ]);
        setMessage(`已標記 ${workDate} 為休診（${CLOSURE_REASON_LABELS[suggested]}）`);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "休診標記失敗");
      }
    });
  }

  function handleRowHalfDay(workDate: string) {
    if (isPublished) {
      setMessage("已發布班表無法直接修改，請複製為新月份草稿");
      return;
    }
    if (!eveningShiftId) {
      setMessage("找不到晚診班別");
      return;
    }
    if (!confirm(`確定 ${workDate} 改為只看早診？\n將清除該日所有晚診排班。`)) return;

    const prevEvening = assignmentMap[workDate]?.[eveningShiftId] ?? null;

    setAssignmentMap((prev) => ({
      ...prev,
      [workDate]: { ...prev[workDate], [eveningShiftId]: null },
    }));

    startTransition(async () => {
      try {
        const result = await markHalfDaySchedule(schedule.id, workDate);
        if (!result.success) {
          setAssignmentMap((prev) => ({
            ...prev,
            [workDate]: { ...prev[workDate], [eveningShiftId]: prevEvening },
          }));
          setMessage(result.error);
          return;
        }
        setMessage(`已將 ${workDate} 設為半日診（僅早診）`);
      } catch (err) {
        setAssignmentMap((prev) => ({
          ...prev,
          [workDate]: { ...prev[workDate], [eveningShiftId]: prevEvening },
        }));
        setMessage(err instanceof Error ? err.message : "半日診設定失敗");
      }
    });
  }

  function handleApplyGoldenTemplate() {
    startTransition(async () => {
      try {
        const result = await applyClinicGoldenTemplate();
        setMessage(`已套用「${result.template}」（早診 ${GOLDEN_SCHEDULE.MORNING_IN} 到）`);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "套用黃金班別失敗");
      }
    });
  }

  function handleGenerateGolden() {
    if (!employeeAId || !employeeBId) {
      setMessage("請先選擇員工 A 與員工 B（皆為護理師）");
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
      try {
        const result = await generateGoldenSchedule(schedule.id, {
          employeeAId,
          employeeBId,
          oddWeekTrackForA,
        });
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        if (result.assignmentMap) {
          setAssignmentMap(result.assignmentMap);
        }
        setMessage(`已產生 ${result.count} 筆排班（雙人全正職輪替）`);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "產生黃金班表失敗");
      }
    });
  }

  function handleMarkClosure() {
    if (!closureDate) {
      setMessage("請選擇休診日期");
      return;
    }
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    if (!closureDate.startsWith(monthPrefix)) {
      setMessage("請選擇本月份內的日期");
      return;
    }

    const modeLabel = isPublished ? "臨時休診（已發布班表）" : "預告休診（公佈前）";
    const reason = normalizeClosureReason(closureReason);
    if (
      !confirm(
        `確定將 ${closureDate} 標記為休診日？\n模式：${modeLabel}\n原因：${CLOSURE_REASON_LABELS[reason]}\n工時折抵：${closureCreditHours} 小時\n\n${CLOSURE_REASON_PAY_HINTS[reason]}`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await markClinicClosureDay(
          schedule.id,
          closureDate,
          isPublished ? "temporary" : "planned",
          closureCreditHours,
          reason,
          closureReasonNote
        );
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        setClosures((prev) => [
          ...prev.filter((c) => c.date !== closureDate),
          {
            date: closureDate,
            mode: isPublished ? "temporary" : "planned",
            reason,
            creditHours: closureCreditHours,
            note: closureReasonNote.trim() || undefined,
          },
        ]);
        setMessage(
          `已標記 ${closureDate}（${CLOSURE_REASON_LABELS[reason]}）` +
            (isPublished ? `，工時折抵 ${closureCreditHours}h` : "")
        );
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "休診標記失敗");
      }
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
      try {
        const result = await publishSchedule(schedule.id);
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        setMessage(
          `班表已發布！已成功通知 ${result.notified} 位員工` +
            (result.notifyErrors?.length
              ? `（部分失敗：${result.notifyErrors.join("；")}）`
              : "")
        );
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "發布失敗");
      }
    });
  }

  function employeeLabel(emp: ScheduleEmployee) {
    const title = displayJobTitle(emp.job_title, "nurse");
    return title ? `${emp.name}（${title}）` : emp.name;
  }

  const busy = isPending || isNavigating;

  return (
    <>
      <DashboardHeader
        title="排班管理"
        description={`${clinic.name} — 雙人全正職輪替黃金班表（每週 11 診 · 08:20 到 · 08:30 開診）`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              ← 上個月
            </button>
            <span className="min-w-28 text-center text-sm font-semibold text-slate-800">
              {year} 年 {month} 月
              {isNavigating ? "…" : ""}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              下個月 →
            </button>
            {!isPublished && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={busy}
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
          <p className="font-semibold">雙週火車頭輪替規則（與一鍵產生班表一致）</p>
          <p className="mt-1 text-amber-800">
            週一、二、四：兩人早晚診全勤。週五：兩人早診，僅軌道二上晚診（軌道一休晚診）。
            週三：軌道一早診半天、軌道二例假。六、日：軌道一大休、軌道二早半班。
            隔週兩人軌道對調（週三／週五晚診／六日班表整組互換）。輪班間隔約 12 小時 20 分（≥ 11 小時安全線）。
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
              員工 A（護理師）
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
              員工 B（護理師）
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
              <option value={1}>軌道一（週三值班、周五休晚診、六日大休）</option>
              <option value={2}>軌道二（週三例假、周五晚診、六日早半班）</option>
            </select>
          </div>
          {!isPublished && (
            <>
              <button
                type="button"
                onClick={handleApplyGoldenTemplate}
                disabled={isPending}
                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
              >
                套用黃金班別
              </button>
              <button
                type="button"
                onClick={handleGenerateGolden}
                disabled={isPending || employees.length < 2}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPending ? "產生中…" : "一鍵產生黃金班表"}
              </button>
            </>
          )}
          <StatusBadge
            label={SCHEDULE_STATUS_LABELS[schedule.status]}
            tone={schedule.status === "published" ? "green" : "amber"}
          />
        </div>

        <ComplianceAlertList issues={complianceIssues} />

        <section className="rounded-xl border border-slate-300 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-800">休診日設定</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            請先選<strong>休診原因</strong>（會影響費用）：診所修假不發國定加倍；國定假／颱風停診若仍出勤則依 ≤8h 加發 1,136
            元，超過另計延長加班。日期列「休診」按鈕：若為行政院國定假日會自動帶「國定假日休診」。
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-700">休診日期</span>
              <input
                type="date"
                value={closureDate}
                onChange={(e) => {
                  const d = e.target.value;
                  setClosureDate(d);
                  if (d && isTaiwanPublicHoliday(d)) {
                    setClosureReason("national");
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-700">休診原因</span>
              <select
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value as ClosureReason)}
                className="min-w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(Object.keys(CLOSURE_REASON_LABELS) as ClosureReason[]).map((key) => (
                  <option key={key} value={key}>
                    {CLOSURE_REASON_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-700">備註（選填）</span>
              <input
                type="text"
                value={closureReasonNote}
                onChange={(e) => setClosureReasonNote(e.target.value)}
                placeholder="例如：凱米颱風"
                className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {isPublished && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-700">
                  臨時休診工時折抵
                </span>
                <select
                  value={closureCreditHours}
                  onChange={(e) => setClosureCreditHours(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value={GOLDEN_SCHEDULE.DUAL_DAY_HOURS}>
                    全天 {GOLDEN_SCHEDULE.DUAL_DAY_HOURS}h
                  </option>
                  <option value={GOLDEN_SCHEDULE.HALF_DAY_HOURS}>
                    半日 {GOLDEN_SCHEDULE.HALF_DAY_HOURS}h
                  </option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={handleMarkClosure}
              disabled={isPending}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              標記休診日
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {CLOSURE_REASON_PAY_HINTS[closureReason]}
          </p>

          {closures.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {closures.map((c) => {
                const reason = normalizeClosureReason(c.reason);
                return (
                  <li key={c.date}>
                    {c.date} · {CLOSURE_REASON_LABELS[reason]} ·{" "}
                    {c.mode === "planned" ? "預告" : "臨時"}
                    {c.mode === "temporary"
                      ? ` · 折抵 ${c.creditHours ?? GOLDEN_SCHEDULE.DUAL_DAY_HOURS}h`
                      : reason === "voluntary"
                        ? " · →休息日"
                        : ""}
                    {c.note ? ` · ${c.note}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {message && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        )}

        {employees.length < 2 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            請先到「員工管理」新增 2 位護理師，才能產生黃金班表
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
                    return (
                      <ScheduleDayRow
                        key={workDate}
                        workDate={workDate}
                        month={month}
                        day={day}
                        dayAssignments={assignmentMap[workDate]}
                        columns={allColumns}
                        employeeOptions={employeeOptions}
                        isPublished={isPublished}
                        isClosureDay={closureDateSet.has(workDate)}
                        holidayName={holidayMap.get(workDate)}
                        pendingCell={pendingCell}
                        rowBusy={isPending}
                        onAssign={handleAssign}
                        onClosure={handleRowClosure}
                        onHalfDay={handleRowHalfDay}
                      />
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

const ScheduleDayRow = memo(function ScheduleDayRow({
  workDate,
  month,
  day,
  dayAssignments,
  columns,
  employeeOptions,
  isPublished,
  isClosureDay,
  holidayName,
  pendingCell,
  rowBusy,
  onAssign,
  onClosure,
  onHalfDay,
}: {
  workDate: string;
  month: number;
  day: number;
  dayAssignments: DayAssignmentMap[string] | undefined;
  columns: ShiftType[];
  employeeOptions: { id: string; label: string }[];
  isPublished: boolean;
  isClosureDay: boolean;
  holidayName?: string;
  pendingCell: string | null;
  rowBusy: boolean;
  onAssign: (workDate: string, shift: ShiftType, employeeId: string) => void;
  onClosure: (workDate: string) => void;
  onHalfDay: (workDate: string) => void;
}) {
  const dow = getDayOfWeekTaipei(workDate);
  const isWeekend = dow === 0 || dow === 6;
  const sessionLabel = isDualClinicDay(dow) ? "雙診 7.67h" : "半日 3.67h";

  return (
    <tr
      className={
        isClosureDay
          ? "bg-slate-200/70"
          : holidayName
            ? "bg-rose-50/50"
            : isWeekend
              ? "bg-slate-50/60"
              : "hover:bg-slate-50/40"
      }
    >
      <td className="sticky left-0 z-10 bg-inherit px-2 py-2 font-medium text-slate-800">
        <div className="flex flex-col gap-1">
          <span>
            {month}/{day}
            {isClosureDay && (
              <span className="ml-1 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] text-white">
                休診
              </span>
            )}
            {holidayName && !isClosureDay && (
              <span className="ml-1 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                國定
              </span>
            )}
          </span>
          {holidayName && (
            <span className="text-[10px] font-normal text-rose-600">{holidayName}</span>
          )}
          {!isPublished && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onClosure(workDate)}
                disabled={rowBusy}
                className="rounded border border-slate-400 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                title="全天休診"
              >
                休診
              </button>
              <button
                type="button"
                onClick={() => onHalfDay(workDate)}
                disabled={rowBusy}
                className="rounded border border-blue-400 px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                title="只看早診，清除晚診"
              >
                半日
              </button>
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-500">{weekdayLabel(workDate)}</td>
      <td className="px-3 py-2 text-xs text-slate-400">{sessionLabel}</td>
      {columns.map((shift) => {
        const cellKey = `${workDate}:${shift.id}`;
        const selected = dayAssignments?.[shift.id] ?? "";
        const cellPending = pendingCell === cellKey;
        return (
          <td key={shift.id} className="px-2 py-2">
            <select
              disabled={isPublished || cellPending}
              value={selected ?? ""}
              onChange={(e) => onAssign(workDate, shift, e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-slate-100"
            >
              <option value="">—</option>
              {employeeOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
          </td>
        );
      })}
    </tr>
  );
});

function StatusBadge({ label, tone }: { label: string; tone: "green" | "amber" }) {
  const styles =
    tone === "green" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
