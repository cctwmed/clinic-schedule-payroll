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
import { getGoldenGeneratorLegend, splitPoolsFromPeople } from "@/lib/schedules/golden-generator";
import {
  ATTENDANT_KIND_LABELS,
  classifyAttendantKind,
  listManualGoldenRules,
  listOneClickGoldenRules,
} from "@/lib/schedules/golden-rulebook";
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
  snapshotCellKey,
  uniqueStaffIds,
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
  const [staffPoolIds, setStaffPoolIds] = useState<string[]>(() => {
    if (goldenConfig?.staffPoolIds?.length) return uniqueStaffIds(goldenConfig.staffPoolIds);
    const legacy = uniqueStaffIds([
      goldenConfig?.employeeAId,
      goldenConfig?.employeeBId,
      goldenConfig?.employeeCId,
    ]);
    return legacy.length > 0 ? legacy : employees
      .filter((emp) => classifyAttendantKind(emp) !== "family")
      .map((emp) => emp.id);
  });
  const [sessionPattern, setSessionPattern] = useState<ClinicSessionPattern>(
    normalizeSessionPattern(initialPattern)
  );
  const [staffingPerSession, setStaffingPerSession] = useState(initialStaffing);
  const [ruleId, setRuleId] = useState(goldenConfig?.ruleId ?? "");
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
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [history, setHistory] = useState<
    { workDate: string; shift: ShiftType; prev: string[] }[]
  >([]);

  useEffect(() => {
    setAssignmentMap(initialMap);
    setClosures(initialClosures);
    setRotationMode(normalizeScheduleMode(goldenConfig?.mode));
    const nextPool = uniqueStaffIds(
      goldenConfig?.staffPoolIds?.length
        ? goldenConfig.staffPoolIds
        : [goldenConfig?.employeeAId, goldenConfig?.employeeBId, goldenConfig?.employeeCId]
    ).filter((id) => {
      const emp = employees.find((row) => row.id === id);
      return emp ? classifyAttendantKind(emp) !== "family" : true;
    });
    setStaffPoolIds(
      nextPool.length > 0
        ? nextPool
        : employees
            .filter((emp) => classifyAttendantKind(emp) !== "family")
            .map((emp) => emp.id)
    );
    setSessionPattern(normalizeSessionPattern(initialPattern));
    setStaffingPerSession(initialStaffing);
    setRuleId(goldenConfig?.ruleId ?? "");
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
  const oneClickRules = useMemo(
    () => listOneClickGoldenRules(sessionPattern),
    [sessionPattern]
  );
  const manualRules = useMemo(
    () => listManualGoldenRules(sessionPattern).filter((rule) => rule.usage === "rare"),
    [sessionPattern]
  );
  const poolPeople = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.id,
        role: emp.role,
        job_title: emp.job_title,
        is_related_to_owner: emp.is_related_to_owner,
      })),
    [employees]
  );
  const selectedPools = useMemo(
    () => splitPoolsFromPeople(poolPeople, staffPoolIds),
    [poolPeople, staffPoolIds]
  );
  const selectedRule = oneClickRules.find((rule) => rule.id === ruleId) ?? null;
  const fairLegend = selectedRule
    ? getGoldenGeneratorLegend(
        selectedRule,
        selectedPools.nurseIds.length,
        selectedPools.adminIds.length
      )
    : {
        title: `依人力自動選常態規則 · 護理 ${selectedPools.nurseIds.length}、行政 ${selectedPools.adminIds.length}`,
        items: [
          "一鍵產生只套用護理／行政常態規則，不含家屬備用規則",
          "每人每週最多 8 診；達上限改行政跟診並提醒",
          "加開診給當週目前診數最少的人",
          "跨週接上週輪替；沒有上週狀態時依週次換起始順序",
        ],
      };
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

  function staffLabel(ids: string[]): string {
    const names = cellStaffIds(ids)
      .map((id) => employees.find((emp) => emp.id === id)?.name ?? "同仁")
      .filter(Boolean);
    return names.length > 0 ? names.join("、") : "未指定";
  }

  function publishedStaffIds(workDate: string, shiftId: string): string[] {
    const raw = publishedSnapshot?.[snapshotCellKey(workDate, shiftId)] ?? "";
    return raw ? raw.split(",").filter(Boolean) : [];
  }

  async function persistAssign(
    workDate: string,
    shift: ShiftType,
    employeeIds: string[],
    options?: { recordHistory?: boolean }
  ) {
    const cellKey = `${workDate}:${shift.id}`;
    const prevValue = cellStaffIds(assignmentMap[workDate]?.[shift.id]);
    const value = cellStaffIds(employeeIds);
    const recordHistory = options?.recordHistory !== false;

    setAssignmentMap((prev) => ({
      ...prev,
      [workDate]: { ...prev[workDate], [shift.id]: value },
    }));
    setMessage(null);
    setSaveOk(null);
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
        setSaveOk(false);
        setMessage(result.error ?? "儲存失敗，班表沒有改掉");
        return false;
      }
      if (recordHistory) {
        setHistory((prev) => [...prev, { workDate, shift, prev: prevValue }].slice(-30));
      }
      const notified = "notified" in result ? (result.notified ?? 0) : 0;
      setSaveOk(true);
      setMessage(
        `已儲存 ${workDate} ${shift.name}：${staffLabel(value)}` +
          (result && "amended" in result && result.amended
            ? `（發布後更正，格子已標紅${notified > 0 ? `，已 LINE 通知 ${notified} 人` : ""}）`
            : "")
      );
      return true;
    } catch (err) {
      setAssignmentMap((prev) => ({
        ...prev,
        [workDate]: { ...prev[workDate], [shift.id]: prevValue },
      }));
      setSaveOk(false);
      setMessage(err instanceof Error ? err.message : "儲存失敗，班表沒有改掉");
      return false;
    } finally {
      setPendingCell((cur) => (cur === cellKey ? null : cur));
    }
  }

  async function handleAssign(workDate: string, shift: ShiftType, employeeIds: string[]) {
    await persistAssign(workDate, shift, employeeIds);
  }

  async function handleUndoLast() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((prev) => prev.slice(0, -1));
    const ok = await persistAssign(last.workDate, last.shift, last.prev, {
      recordHistory: false,
    });
    if (ok) {
      setSaveOk(true);
      setMessage(
        `已回復上一步：${last.workDate} ${last.shift.name} 回到 ${staffLabel(last.prev)}`
      );
    }
  }

  async function handleRestorePublished(workDate: string, shift: ShiftType) {
    const published = publishedStaffIds(workDate, shift.id);
    const ok = await persistAssign(workDate, shift, published);
    if (ok) {
      setSaveOk(true);
      setMessage(
        `已還原 ${workDate} ${shift.name} 為發布時班表：${staffLabel(published)}`
      );
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
    const pool = uniqueStaffIds([
      ...selectedPools.nurseIds,
      ...selectedPools.adminIds,
    ]);
    if (pool.length === 0) {
      setMessage("請勾選本月要輪班的護理師或行政（家屬不列入一鍵產生）");
      return;
    }
    const patternLabel =
      SESSION_PATTERN_OPTIONS.find((o) => o.id === sessionPattern)?.shortLabel ?? "兩段班";
    const ruleLabel = selectedRule?.name ?? "依人力自動選常態規則";
    const publishedHint = isPublished
      ? "\n此月已發布，產生後會整月覆蓋，打卡改依新班表。"
      : "";
    const familyHint =
      selectedPools.familyIds.length > 0
        ? `\n已勾選的家屬不會自動排入，請產生後再手動排。`
        : "";
    if (
      !confirm(
        `確定為 ${year} 年 ${month} 月一鍵產生班表？\n開診：${patternLabel}\n規則：${ruleLabel}\n護理 ${selectedPools.nurseIds.length} 人、行政 ${selectedPools.adminIds.length} 人\n每人每週最多 8 診；加開診給當週診數最少的人。\n現有排班將被覆蓋。${familyHint}${publishedHint}`
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
            employeeAId: pool[0],
            employeeBId: pool[1] ?? pool[0],
            employeeCId: pool[2],
            staffPoolIds: pool,
            nursePoolIds: selectedPools.nurseIds,
            adminPoolIds: selectedPools.adminIds,
            oddWeekTrackForA: 1,
            sessionPattern,
            staffingPerSession,
            ruleId: selectedRule?.id,
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
        const reminderText =
          "reminders" in result && result.reminders.length > 0
            ? `\n提醒：${result.reminders.slice(0, 3).join("；")}`
            : "";
        setMessage(
          `已產生 ${result.count} 筆排班（${result.ruleId ?? ruleLabel} · 護理 ${selectedPools.nurseIds.length}、行政 ${selectedPools.adminIds.length}）${reminderText}`
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
      setRuleId("");
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
        description={`${clinic.name} — 快速排班依每診人數從輪班池補滿；格子可手動排 1～6 人`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-60"
              style={{ color: "#000000" }}
            >
              ← 上個月
            </button>
            <span
              className="min-w-28 text-center text-sm font-semibold text-black"
              style={{ color: "#000000" }}
            >
              {year} 年 {month} 月
              {isNavigating ? "…" : ""}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={isNavigating}
              className="rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-60"
              style={{ color: "#000000" }}
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
            <button
              type="button"
              onClick={() => void handleUndoLast()}
              disabled={busy || history.length === 0 || Boolean(pendingCell)}
              className="rounded-lg border border-slate-800 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-slate-100 disabled:opacity-40"
            >
              回復上一步
            </button>
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
        <div className="sticky top-0 z-20 space-y-3">
          <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-black shadow-sm">
            <p className="font-bold">更改班表流程</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>在下方格子改人，系統會立刻寫入。成功時上方會顯示「已儲存」。</li>
              <li>改錯按右上角「回復上一步」。已發布的紅字格子也可按「還原」，回到發布當時的人。</li>
              <li>尚未發布：改完後按「確認發布班表」，才會 LINE 通知全員。</li>
              <li>已經發布：一改就生效（打卡／計薪跟著變），格子變紅；確認無誤再按「確認變更」。</li>
            </ol>
          </div>
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${
              pendingCell
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : saveOk === false
                  ? "border-red-300 bg-red-50 text-red-900"
                  : saveOk === true || message
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {pendingCell
              ? "正在儲存這格，請稍候…"
              : message
                ? message
                : "還沒改班表。改任一格後，這裡會顯示有沒有存成功。"}
          </div>
        </div>
        {isPublished && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            已發布班表仍可修改；<span className="font-semibold">紅字格子</span>
            代表「發布後有改過」。打卡與計薪以目前班表為準。
            {amendmentCount > 0 ? ` 目前有 ${amendmentCount} 格變更。` : " 目前沒有發布後變更。"}
          </div>
        )}
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="text-base font-bold text-black">一診可排多人（格子固定顯示第 1、第 2 人）</p>
          <p className="mt-1 text-sm leading-relaxed text-black">
            每個診別都有「第 1 人／第 2 人」下拉，之後可加到第 6 人。上面「一診可排幾人」是給快速排班用的目標人數：現況 1 人就選 1，之後兩人互相支援就選 2。
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
                快速排班：一診要幾人
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

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-black">
          <p className="font-semibold text-black">一鍵產生怎麼排</p>
          <p className="mt-1 leading-relaxed text-black">
            勾選護理師與行政，選常態黃金規則（不含家屬備用）。週末／晚診輪流；每人每週最多 8 診，達上限改行政並提醒。加開診給當週診數最少的人。產生後仍可在格子改第 1～6 人。
          </p>
          <p className="mt-2 text-sm font-semibold text-black">{fairLegend.title}</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-black">
            {fairLegend.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-black">常態規則（一鍵產生）</label>
              <select
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
                disabled={isPending}
                className="min-w-64 rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm text-black"
              >
                <option value="">依人力自動選（不含家屬規則）</option>
                {oneClickRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.id} · {rule.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-black">
                {selectedRule?.summary ?? "家屬備用規則不會出現在這裡，只能手動排進格子。"}
              </p>
              {manualRules.length > 0 && (
                <p className="mt-1 text-xs text-slate-600">
                  手動備用：{manualRules.map((rule) => rule.id).join("、")}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-black">開診節奏</label>
              <select
                value={rotationMode}
                onChange={(e) =>
                  setRotationMode(normalizeScheduleMode(e.target.value as ScheduleRotationMode))
                }
                disabled={isPending}
                className="min-w-56 rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm text-black"
              >
                {SCHEDULE_MODE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-black">
                {SCHEDULE_MODE_OPTIONS.find((opt) => opt.id === rotationMode)?.hint}
              </p>
            </div>
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
              disabled={isPending || staffPoolIds.length === 0 || employees.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "產生中…" : "一鍵產生班表"}
            </button>
            <StatusBadge
              label={SCHEDULE_STATUS_LABELS[schedule.status]}
              tone={schedule.status === "published" ? "green" : "amber"}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-black">本月輪班人員（護理師／行政）</p>
            <div className="flex flex-wrap gap-2">
              {employees.map((emp) => {
                const checked = staffPoolIds.includes(emp.id);
                const kind = classifyAttendantKind(emp);
                const kindLabel = kind ? ATTENDANT_KIND_LABELS[kind] : "未分類（當護理師）";
                const isFamily = kind === "family";
                return (
                  <label
                    key={emp.id}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      isFamily
                        ? "border-slate-200 bg-slate-50 text-slate-500"
                        : checked
                          ? "border-emerald-600 bg-emerald-50 text-black"
                          : "border-slate-300 bg-white text-black"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPending || isFamily}
                      onChange={() => {
                        setStaffPoolIds((prev) =>
                          prev.includes(emp.id)
                            ? prev.filter((id) => id !== emp.id)
                            : [...prev, emp.id]
                        );
                      }}
                    />
                    {employeeLabel(emp)}
                    <span className="text-xs font-medium">{kindLabel}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  setStaffPoolIds(
                    employees
                      .filter((emp) => classifyAttendantKind(emp) !== "family")
                      .map((emp) => emp.id)
                  )
                }
                className="rounded border border-slate-800 px-2 py-1 text-xs font-semibold text-black"
              >
                全選護理／行政
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setStaffPoolIds([])}
                className="rounded border border-slate-800 px-2 py-1 text-xs font-semibold text-black"
              >
                清空
              </button>
              <span className="self-center text-xs font-semibold text-black">
                護理 {selectedPools.nurseIds.length} · 行政 {selectedPools.adminIds.length}
                {selectedPools.familyIds.length > 0
                  ? ` · 家屬 ${selectedPools.familyIds.length}（不自動排）`
                  : ""}
              </span>
            </div>
          </div>
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

        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-black">
            請先到「員工管理」新增護理師，才能排班與一鍵產生
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <p className="border-b border-slate-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-black">
              每個診別固定有第 1 人、第 2 人下拉，可加到第 6 人。手機請左右滑動表格。
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
                        onAssign={handleAssign}
                        onRestorePublished={handleRestorePublished}
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
  onAssign,
  onRestorePublished,
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
  onAssign: (workDate: string, shift: ShiftType, employeeIds: string[]) => void;
  onRestorePublished: (workDate: string, shift: ShiftType) => void;
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
            ? MAX_NURSES_PER_SESSION
            : 1;
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
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">
                    已改
                  </span>
                  <button
                    type="button"
                    disabled={cellPending}
                    onClick={() => onRestorePublished(workDate, shift)}
                    className="rounded border border-red-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    還原
                  </button>
                </div>
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
  const limit = Math.min(MAX_NURSES_PER_SESSION, Math.max(1, maxStaff));
  const visibleSlots = Math.min(
    limit,
    Math.max(limit === 1 ? 1 : 2, selectedIds.length + (selectedIds.length < limit ? 1 : 0))
  );
  const slots = Array.from({ length: visibleSlots }, (_, index) => selectedIds[index] ?? "");

  function setSlot(index: number, employeeId: string) {
    const next = selectedIds.slice();
    if (!employeeId) {
      if (index < next.length) next.splice(index, 1);
      onChange(next);
      return;
    }
    const existingAt = next.indexOf(employeeId);
    if (existingAt === index) return;
    if (existingAt >= 0) {
      if (index < next.length) {
        next[existingAt] = next[index];
        next[index] = employeeId;
      } else {
        next.splice(existingAt, 1);
        next.push(employeeId);
      }
    } else if (index < next.length) {
      next[index] = employeeId;
    } else {
      next.push(employeeId);
    }
    onChange(next.filter(Boolean));
  }

  return (
    <div className="space-y-1">
      {slots.map((id, index) => {
        const used = new Set(slots.filter((item, itemIndex) => item && itemIndex !== index));
        return (
          <label key={`slot-${index}`} className="block">
            <span className="mb-0.5 block text-[11px] font-semibold text-black">
              第 {index + 1} 人
            </span>
            <select
              disabled={disabled}
              value={id}
              onChange={(e) => setSlot(index, e.target.value)}
              className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-blue-400 disabled:bg-slate-100 ${
                amended ? "border-red-400 text-red-700" : "border-slate-800 text-black"
              }`}
              style={{ color: "#000000" }}
            >
              <option value="">未指定</option>
              {options
                .filter((emp) => !used.has(emp.id) || emp.id === id)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.label}
                  </option>
                ))}
            </select>
          </label>
        );
      })}
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
