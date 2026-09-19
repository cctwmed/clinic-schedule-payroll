"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { ComplianceAlertList } from "@/components/compliance/compliance-alert-list";
import {
  applyClinicGoldenTemplate,
  applySessionPattern,
  confirmPublishedAmendments,
  fetchScheduleComplianceIssues,
  generateGoldenSchedule,
  markClinicClosureDay,
  markHalfDaySchedule,
  publishSchedule,
  saveScheduleAssignment,
  updateSessionTimes,
  updateStaffingPerSession,
} from "@/app/(dashboard)/schedules/actions";
import type { PublicHoliday } from "@/lib/holidays/taiwan-public-holidays";
import type { ComplianceIssue } from "@/lib/compliance/types";
import type { Clinic } from "@/lib/clinic";
import { GOLDEN_SCHEDULE } from "@/lib/shift-templates";
import { getRotationLegend } from "@/lib/schedules/golden-rotation";
import type {
  GoldenScheduleConfig,
  ClosureRecord,
  ClosureReason,
  ScheduleRotationMode,
  ClinicSessionPattern,
  SessionTimesConfig,
} from "@/lib/schedules/golden-config";
import {
  CLOSURE_REASON_LABELS,
  CLOSURE_REASON_PAY_HINTS,
  SCHEDULE_MODE_OPTIONS,
  SESSION_PATTERN_OPTIONS,
  MAX_NURSES_PER_SESSION,
  normalizeClosureReason,
  normalizeScheduleMode,
  normalizeSessionPattern,
  isPublishedAmendment,
  type PublishedAssignmentSnapshot,
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
  cellStaffIds,
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
  sessionPattern: ClinicSessionPattern;
  staffingPerSession: number;
  sessionTimes: SessionTimesConfig | null;
  closures: ClosureRecord[];
  publicHolidays: PublicHoliday[];
  publishedSnapshot?: PublishedAssignmentSnapshot | null;
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
  sessionPattern: initialPattern,
  staffingPerSession: initialStaffing,
  sessionTimes: initialTimes,
  closures: initialClosures,
  publicHolidays,
  publishedSnapshot = null,
}: SchedulePageClientProps) {
  const router = useRouter();
  // 直接用 props，避免軟導覽後 useState 初始值卡住
  const year = initialYear;
  const month = initialMonth;

  const [assignmentMap, setAssignmentMap] = useState(initialMap);
  const [closures, setClosures] = useState(initialClosures);
  const [complianceIssues, setComplianceIssues] = useState(initialCompliance);
  const [message, setMessage] = useState<string | null>(null);
  const [rotationMode, setRotationMode] = useState<ScheduleRotationMode>(
    normalizeScheduleMode(goldenConfig?.mode)
  );
  const [employeeAId, setEmployeeAId] = useState(goldenConfig?.employeeAId ?? "");
  const [employeeBId, setEmployeeBId] = useState(goldenConfig?.employeeBId ?? "");
  const [employeeCId, setEmployeeCId] = useState(goldenConfig?.employeeCId ?? "");
  const [oddWeekTrackForA, setOddWeekTrackForA] = useState<1 | 2>(
    goldenConfig?.oddWeekTrackForA ?? 1
  );
  const [sessionPattern, setSessionPattern] = useState<ClinicSessionPattern>(
    normalizeSessionPattern(initialPattern)
  );
  const [staffingPerSession, setStaffingPerSession] = useState(initialStaffing);
  const [morningIn, setMorningIn] = useState(
    initialTimes?.MORNING?.clockIn ?? GOLDEN_SCHEDULE.MORNING_IN
  );
  const [morningOut, setMorningOut] = useState(
    initialTimes?.MORNING?.clockOut ?? GOLDEN_SCHEDULE.MORNING_OUT
  );
  const [afternoonIn, setAfternoonIn] = useState(
    initialTimes?.AFTERNOON?.clockIn ?? GOLDEN_SCHEDULE.AFTERNOON_IN
  );
  const [afternoonOut, setAfternoonOut] = useState(
    initialTimes?.AFTERNOON?.clockOut ?? GOLDEN_SCHEDULE.AFTERNOON_OUT
  );
  const [eveningIn, setEveningIn] = useState(
    initialTimes?.EVENING?.clockIn ?? GOLDEN_SCHEDULE.EVENING_IN
  );
  const [eveningOut, setEveningOut] = useState(
    initialTimes?.EVENING?.clockOut ?? GOLDEN_SCHEDULE.EVENING_OUT
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
    setRotationMode(normalizeScheduleMode(goldenConfig?.mode));
    setEmployeeAId(goldenConfig?.employeeAId ?? "");
    setEmployeeBId(goldenConfig?.employeeBId ?? "");
    setEmployeeCId(goldenConfig?.employeeCId ?? "");
    setOddWeekTrackForA(goldenConfig?.oddWeekTrackForA ?? 1);
    setSessionPattern(normalizeSessionPattern(initialPattern));
    setStaffingPerSession(initialStaffing);
    setMorningIn(initialTimes?.MORNING?.clockIn ?? GOLDEN_SCHEDULE.MORNING_IN);
    setMorningOut(initialTimes?.MORNING?.clockOut ?? GOLDEN_SCHEDULE.MORNING_OUT);
    setAfternoonIn(initialTimes?.AFTERNOON?.clockIn ?? GOLDEN_SCHEDULE.AFTERNOON_IN);
    setAfternoonOut(initialTimes?.AFTERNOON?.clockOut ?? GOLDEN_SCHEDULE.AFTERNOON_OUT);
    setEveningIn(initialTimes?.EVENING?.clockIn ?? GOLDEN_SCHEDULE.EVENING_IN);
    setEveningOut(initialTimes?.EVENING?.clockOut ?? GOLDEN_SCHEDULE.EVENING_OUT);
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
  const amendmentCount = useMemo(() => {
    if (!isPublished || !publishedSnapshot) return 0;
    let count = 0;
    const seen = new Set<string>();
    for (const [workDate, shifts] of Object.entries(assignmentMap)) {
      for (const [shiftId, employeeId] of Object.entries(shifts)) {
        const key = `${workDate}:${shiftId}`;
        seen.add(key);
        if (isPublishedAmendment(publishedSnapshot, workDate, shiftId, employeeId)) {
          count += 1;
        }
      }
    }
    for (const key of Object.keys(publishedSnapshot)) {
      if (seen.has(key)) continue;
      const [workDate, shiftId] = key.split(":");
      if (workDate && shiftId) count += 1;
    }
    return count;
  }, [assignmentMap, isPublished, publishedSnapshot]);

  function handleConfirmAmendments() {
    startTransition(async () => {
      const result = await confirmPublishedAmendments(schedule.id);
      setMessage(result.success ? "已將目前班表視為確認版本，紅字已清除" : result.error);
      if (result.success) router.refresh();
    });
  }

  const allColumns = useMemo(
    () => [
      ...shiftTypes.filter(
        (shift) => sessionPattern === "three" || shift.code !== "AFTERNOON"
      ),
      ...offDayShiftTypes,
    ],
    [shiftTypes, offDayShiftTypes, sessionPattern]
  );
  const legend = getRotationLegend(oddWeekTrackForA, rotationMode);
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

  async function handleAssign(workDate: string, shift: ShiftType, employeeIds: string[]) {
    const cellKey = `${workDate}:${shift.id}`;
    const prevValue = cellStaffIds(assignmentMap[workDate]?.[shift.id]);
    const value = cellStaffIds(employeeIds);

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
          [workDate]: { ...prev[workDate], [shift.id]: prevValue },
        }));
        setMessage(result.error ?? "儲存失敗");
      }
    } catch (err) {
      setAssignmentMap((prev) => ({
        ...prev,
        [workDate]: { ...prev[workDate], [shift.id]: prevValue },
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
    if (!eveningShiftId) {
      setMessage("找不到晚診班別");
      return;
    }
    if (!confirm(`確定 ${workDate} 改為只看早診？\n將清除該日所有晚診排班。`)) return;

    const prevEvening = cellStaffIds(
      eveningShiftId ? assignmentMap[workDate]?.[eveningShiftId] : []
    );

    setAssignmentMap((prev) => ({
      ...prev,
      [workDate]: { ...prev[workDate], [eveningShiftId]: [] },
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
    if (rotationMode === "triple") {
      if (!employeeCId) {
        setMessage("三人制請再選擇員工 C");
        return;
      }
      if (employeeCId === employeeAId || employeeCId === employeeBId) {
        setMessage("員工 A／B／C 必須為不同人");
        return;
      }
      if (employees.length < 3) {
        setMessage("三人制至少需要 3 位在職護理師");
        return;
      }
    }
    const modeLabel =
      SCHEDULE_MODE_OPTIONS.find((o) => o.id === rotationMode)?.label ?? rotationMode;
    const patternLabel =
      SESSION_PATTERN_OPTIONS.find((o) => o.id === sessionPattern)?.shortLabel ?? "兩段班";
    const publishedHint = isPublished
      ? "\n此月已發布，產生後會整月覆蓋，打卡改依新班表。"
      : "";
    if (
      !confirm(
        `確定為 ${year} 年 ${month} 月一鍵產生班表？\n開診：${patternLabel}\n輪替：${modeLabel}\n現有排班將被覆蓋。${publishedHint}`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await generateGoldenSchedule(
          schedule.id,
          {
            mode: rotationMode,
            employeeAId,
            employeeBId,
            employeeCId: rotationMode === "triple" ? employeeCId : undefined,
            oddWeekTrackForA,
            sessionPattern,
            staffingPerSession,
            sessionTimes: {
              MORNING: { clockIn: morningIn, clockOut: morningOut },
              AFTERNOON: { clockIn: afternoonIn, clockOut: afternoonOut },
              EVENING: { clockIn: eveningIn, clockOut: eveningOut },
            },
          },
          { allowPublished: isPublished }
        );
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        if (result.assignmentMap) {
          setAssignmentMap(result.assignmentMap);
        }
        setMessage(
          `已產生 ${result.count} 筆排班（${patternLabel} · ${modeLabel}）`
        );
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

  function handleApplySessionPattern(next: ClinicSessionPattern) {
    const pattern = normalizeSessionPattern(next);
    if (pattern === sessionPattern) return;
    const label =
      SESSION_PATTERN_OPTIONS.find((o) => o.id === pattern)?.label ?? pattern;
    const extra =
      pattern === "two"
        ? "\n將清除本月所有午診排班，打卡改為早／晚兩組。"
        : "\n會顯示午診欄，該診人員需另外排入；打卡改為早／午／晚三組。";
    if (!confirm(`確定將 ${year} 年 ${month} 月改為${label}？${extra}`)) {
      return;
    }
    startTransition(async () => {
      const result = await applySessionPattern(schedule.id, pattern);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setSessionPattern(pattern);
      setMessage(`本月已改為${label}`);
      router.refresh();
    });
  }

  function handleStaffingChange(next: number) {
    startTransition(async () => {
      const result = await updateStaffingPerSession(schedule.id, next);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setStaffingPerSession(result.staffingPerSession);
      setMessage(`每診最多可排 ${result.staffingPerSession} 人`);
    });
  }

  function handleSaveSessionTimes() {
    startTransition(async () => {
      const times: SessionTimesConfig = {
        MORNING: { clockIn: morningIn, clockOut: morningOut },
        AFTERNOON: { clockIn: afternoonIn, clockOut: afternoonOut },
        EVENING: { clockIn: eveningIn, clockOut: eveningOut },
      };
      const result = await updateSessionTimes(schedule.id, times);
      setMessage(result.success ? "診別時間已更新，本月打卡窗口會跟著改" : result.error);
      if (result.success) router.refresh();
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
        description={`${clinic.name} — 目前暫定兩段班，可改三段班；每診可排 1～6 人`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-60"
            >
              ← 上個月
            </button>
            <span className="min-w-28 text-center text-sm font-semibold text-black">
              {year} 年 {month} 月
              {isNavigating ? "…" : ""}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-60"
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
            {isPublished && amendmentCount > 0 && (
              <button
                type="button"
                onClick={handleConfirmAmendments}
                disabled={busy}
                className="rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                確認變更（清除紅字）
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4 p-6">
        {isPublished && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            已發布班表仍可修改；<span className="font-semibold">紅字格子</span>
            代表「發布後有改過」。打卡與計薪以目前班表為準。
            {amendmentCount > 0 ? ` 目前有 ${amendmentCount} 格變更。` : " 目前沒有發布後變更。"}
          </div>
        )}
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="text-base font-bold text-black">一診可排多人（1～6 位護理師）</p>
          <p className="mt-1 text-sm leading-relaxed text-black">
            目前暫定兩段班（早＋晚）。之後若改三段班，這裡一鍵切換；午診時間可改。
            每個診別格子可加第 2～6 人：先把「一診可排幾人」調高，再按格子裡的「＋ 加入護理師」。
            打卡會跟著班表：兩段兩組上下班、三段三組。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-black">開診結構</label>
              <select
                value={sessionPattern}
                onChange={(e) =>
                  handleApplySessionPattern(e.target.value as ClinicSessionPattern)
                }
                disabled={busy}
                className="min-w-56 rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm text-black"
              >
                {SESSION_PATTERN_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-black">
                一診可排幾人（1～6）
              </label>
              <select
                value={staffingPerSession}
                onChange={(e) => handleStaffingChange(Number(e.target.value))}
                disabled={busy}
                className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black"
              >
                {Array.from({ length: MAX_NURSES_PER_SESSION }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </div>
            {staffingPerSession < MAX_NURSES_PER_SESSION && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStaffingChange(MAX_NURSES_PER_SESSION)}
                className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-60"
              >
                改為最多 6 人
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <TimeRangeField
              label="早診"
              start={morningIn}
              end={morningOut}
              onStart={setMorningIn}
              onEnd={setMorningOut}
            />
            {sessionPattern === "three" && (
              <TimeRangeField
                label="午診"
                start={afternoonIn}
                end={afternoonOut}
                onStart={setAfternoonIn}
                onEnd={setAfternoonOut}
              />
            )}
            <TimeRangeField
              label="晚診"
              start={eveningIn}
              end={eveningOut}
              onStart={setEveningIn}
              onEnd={setEveningOut}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSaveSessionTimes}
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                儲存診別時間
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="font-semibold">快速排班模式</p>
          <p className="mt-1 text-amber-800">
            {rotationMode === "triple"
              ? "模式 B 三人制：依 ISO 週 % 3 輪替完美週末／週三充電／全勤支援；週三開早午診；平日早午晚各 2 人。"
              : "模式 A 雙人制：依 ISO 週 % 2 對調週三班／週末班；週三僅早診；週五早午或午晚；六日大休或早診。"}
            {" "}薪資仍依四週變形：休假不足自動核算休息日加班（855／半天診），加班費免稅不入 50 格式。
          </p>
        </div>

        <div
          className={`grid gap-4 ${
            rotationMode === "triple" ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">{legend.track1.title}</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
              {legend.track1.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">{legend.track2.title}</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
              {legend.track2.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {rotationMode === "dual" && (
              <p className="mt-3 text-xs text-slate-700">{legend.swapNote}</p>
            )}
          </div>
          {rotationMode === "triple" && "track3" in legend && legend.track3 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">{legend.track3.title}</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                {legend.track3.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-700">{legend.swapNote}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              快速排班模式
            </label>
            <select
              value={rotationMode}
              onChange={(e) =>
                setRotationMode(normalizeScheduleMode(e.target.value as ScheduleRotationMode))
              }
              disabled={isPending}
              className="min-w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            >
              {SCHEDULE_MODE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              員工 A（護理師）
            </label>
            <select
              value={employeeAId}
              onChange={(e) => setEmployeeAId(e.target.value)}
              disabled={isPending}
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
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
            <label className="mb-1 block text-xs font-medium text-slate-700">
              員工 B（護理師）
            </label>
            <select
              value={employeeBId}
              onChange={(e) => setEmployeeBId(e.target.value)}
              disabled={isPending}
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            >
              <option value="">— 請選擇 —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {employeeLabel(emp)}
                </option>
              ))}
            </select>
          </div>
          {rotationMode === "triple" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                員工 C（護理師）
              </label>
              <select
                value={employeeCId}
                onChange={(e) => setEmployeeCId(e.target.value)}
                disabled={isPending}
                className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              >
                <option value="">— 請選擇 —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {employeeLabel(emp)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {rotationMode === "dual" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                奇數週員工 A 走
              </label>
              <select
                value={oddWeekTrackForA}
                onChange={(e) => setOddWeekTrackForA(Number(e.target.value) as 1 | 2)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              >
                <option value={1}>軌道一（週三班：週三早診、週五早午、六日大休）</option>
                <option value={2}>軌道二（週末班：週三例假、週五午晚、六日早診）</option>
              </select>
            </div>
          )}
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
                disabled={
                  isPending ||
                  employees.length < (rotationMode === "triple" ? 3 : 2)
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPending ? "產生中…" : "一鍵產生黃金班表"}
              </button>
            </>
          <StatusBadge
            label={SCHEDULE_STATUS_LABELS[schedule.status]}
            tone={schedule.status === "published" ? "green" : "amber"}
          />
        </div>

        <ComplianceAlertList issues={complianceIssues} />

        <section className="rounded-xl border border-slate-300 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-800">休診日設定</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-700">
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-700">休診原因</span>
              <select
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value as ClosureReason)}
                className="min-w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
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
                className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
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

          <p className="mt-2 text-xs text-slate-700">
            {CLOSURE_REASON_PAY_HINTS[closureReason]}
          </p>

          {closures.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-700">
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

        {employees.length < (rotationMode === "triple" ? 3 : 2) ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-700">
            {rotationMode === "triple"
              ? "請先到「員工管理」新增至少 3 位護理師，才能產生三人制班表"
              : "請先到「員工管理」新增 2 位護理師，才能產生雙人制班表"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <p className="border-b border-slate-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-black">
              一診可多人：每個診別格子點「＋ 加入護理師」即可加第 2～6 人。手機請左右滑動表格。
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
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
                          <span className="mt-0.5 block font-normal normal-case text-slate-700">
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
                        publishedSnapshot={publishedSnapshot}
                        isClosureDay={closureDateSet.has(workDate)}
                        holidayName={holidayMap.get(workDate)}
                        pendingCell={pendingCell}
                        rowBusy={isPending}
                        staffingLimit={staffingPerSession}
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
  publishedSnapshot,
  isClosureDay,
  holidayName,
  pendingCell,
  rowBusy,
  staffingLimit,
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
  publishedSnapshot: PublishedAssignmentSnapshot | null;
  isClosureDay: boolean;
  holidayName?: string;
  pendingCell: string | null;
  rowBusy: boolean;
  staffingLimit: number;
  onAssign: (workDate: string, shift: ShiftType, employeeIds: string[]) => void;
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
        </div>
      </td>
      <td className="px-3 py-2 text-slate-700">{weekdayLabel(workDate)}</td>
      <td className="px-3 py-2 text-xs text-slate-700">{sessionLabel}</td>
      {columns.map((shift) => {
        const cellKey = `${workDate}:${shift.id}`;
        const selected = cellStaffIds(dayAssignments?.[shift.id]);
        const cellPending = pendingCell === cellKey;
        const amended =
          isPublished &&
          isPublishedAmendment(publishedSnapshot, workDate, shift.id, selected);
        const maxStaff =
          shift.code === "MORNING" ||
          shift.code === "AFTERNOON" ||
          shift.code === "EVENING"
            ? staffingLimit
            : employeeOptions.length;
        return (
          <td key={shift.id} className="px-2 py-2">
            <div className="relative">
              <SessionStaffCell
                selectedIds={selected}
                options={employeeOptions}
                disabled={cellPending}
                maxStaff={Math.max(1, maxStaff)}
                amended={amended}
                onChange={(ids) => onAssign(workDate, shift, ids)}
              />
              {amended && (
                <span className="absolute -right-1 -top-1 rounded bg-red-600 px-1 text-[9px] font-bold text-white">
                  改
                </span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
});

function SessionStaffCell({
  selectedIds,
  options,
  disabled,
  maxStaff,
  amended,
  onChange,
}: {
  selectedIds: string[];
  options: { id: string; label: string }[];
  disabled: boolean;
  maxStaff: number;
  amended: boolean;
  onChange: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const addable = options.filter((emp) => !selectedSet.has(emp.id));
  const canAdd = selectedIds.length < maxStaff && addable.length > 0;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {selectedIds.length === 0 && (
          <span className="text-xs font-semibold text-black">尚未排人 · 可加到 {maxStaff} 人</span>
        )}
        {selectedIds.map((id) => {
          const emp = options.find((item) => item.id === id);
          return (
            <span
              key={id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                amended
                  ? "bg-red-100 text-red-800"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {emp?.label ?? "未知"}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(selectedIds.filter((item) => item !== id))}
                className="text-slate-500 hover:text-red-600 disabled:opacity-40"
                aria-label={`移除 ${emp?.label ?? ""}`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      {canAdd && (
        <select
          disabled={disabled}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onChange([...selectedIds, e.target.value]);
          }}
          className={`w-full rounded-lg border bg-white px-2 py-2 text-xs font-semibold outline-none focus:border-blue-400 disabled:bg-slate-100 ${
            amended ? "border-red-400 text-red-700" : "border-slate-800 text-black"
          }`}
        >
          <option value="">
            {selectedIds.length === 0
              ? "＋ 加入護理師（一診可多人）"
              : `＋ 再加一位（${selectedIds.length}／${maxStaff}）`}
          </option>
          {addable.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.label}
            </option>
          ))}
        </select>
      )}
      {!canAdd && selectedIds.length >= maxStaff && (
        <p className="text-[11px] font-semibold text-black">
          已滿 {maxStaff} 人。要再加人請先把上方「一診可排幾人」調高（最多 6）。
        </p>
      )}
    </div>
  );
}

function TimeRangeField({
  label,
  start,
  end,
  onStart,
  onEnd,
}: {
  label: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="time"
          value={start.slice(0, 5)}
          onChange={(e) => onStart(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />
        <span className="text-xs text-slate-400">–</span>
        <input
          type="time"
          value={end.slice(0, 5)}
          onChange={(e) => onEnd(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />
      </div>
    </div>
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
