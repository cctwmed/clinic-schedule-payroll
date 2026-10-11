"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequestInit, readStoredLiffAdminToken } from "@/lib/liff/admin-session";
import { friendlyLiffError, readApiJson } from "@/lib/liff/read-api-json";
import { cellStaffIds, formatWorkDate, weekdayLabel } from "@/types/schedule";
import { MAX_NURSES_PER_SESSION } from "@/lib/schedules/golden-config";

interface AdminScheduleTabProps {
  lineUserId: string;
}

interface ShiftCol {
  id: string;
  code: string;
  name: string;
  clockIn: string | null;
  clockOut: string | null;
}

type AssignmentMap = Record<string, Record<string, string[]>>;

interface ScheduleData {
  year: number;
  month: number;
  scheduleId: string;
  sessionPattern: "two" | "three";
  staffingPerSession: number;
  daysInMonth: number;
  employees: { id: string; name: string }[];
  shifts: ShiftCol[];
  assignmentMap: AssignmentMap;
}

const WORK_SHIFT_CODES = new Set(["MORNING", "AFTERNOON", "EVENING"]);

function cloneMap(map: AssignmentMap): AssignmentMap {
  const next: AssignmentMap = {};
  for (const [date, shifts] of Object.entries(map ?? {})) {
    next[date] = {};
    for (const [shiftId, ids] of Object.entries(shifts ?? {})) {
      next[date][shiftId] = [...cellStaffIds(ids)];
    }
  }
  return next;
}

function idsKey(ids: string[]): string {
  return cellStaffIds(ids).join(",");
}

function todayInMonth(year: number, month: number, daysInMonth: number): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  if (get("year") === year && get("month") === month) {
    return Math.min(daysInMonth, Math.max(1, get("day")));
  }
  return 1;
}

export function AdminScheduleTab({ lineUserId }: AdminScheduleTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [draft, setDraft] = useState<AssignmentMap>({});
  const [history, setHistory] = useState<AssignmentMap[]>([]);
  const [selectedDay, setSelectedDay] = useState(() =>
    todayInMonth(now.getFullYear(), now.getMonth() + 1, 31)
  );
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const req = adminRequestInit(lineUserId);
      const res = await fetch(
        `/api/mobile/admin/schedule?${req.query}&year=${year}&month=${month}`,
        { credentials: "include", headers: req.headers }
      );
      const json = await readApiJson<ScheduleData>(res, "載入排班失敗");
      setData(json);
      setDraft(cloneMap(json.assignmentMap ?? {}));
      setHistory([]);
      setSelectedDay((prev) =>
        prev >= 1 && prev <= json.daysInMonth
          ? prev
          : todayInMonth(json.year, json.month, json.daysInMonth)
      );
    } catch (err) {
      setError(friendlyLiffError(err, "載入排班失敗"));
    } finally {
      setLoading(false);
    }
  }, [lineUserId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyCells = useMemo(() => {
    if (!data) return [];
    const cells: { workDate: string; shift: ShiftCol; employeeIds: string[] }[] = [];
    const workShifts = data.shifts.filter((s) => WORK_SHIFT_CODES.has(s.code));
    for (let day = 1; day <= data.daysInMonth; day += 1) {
      const workDate = formatWorkDate(data.year, data.month, day);
      for (const shift of workShifts) {
        const current = cellStaffIds(draft[workDate]?.[shift.id]);
        const saved = cellStaffIds(data.assignmentMap[workDate]?.[shift.id]);
        if (idsKey(current) !== idsKey(saved)) {
          cells.push({ workDate, shift, employeeIds: current });
        }
      }
    }
    return cells;
  }, [data, draft]);

  const dirtyDays = useMemo(
    () => new Set(dirtyCells.map((cell) => Number(cell.workDate.slice(8, 10)))),
    [dirtyCells]
  );

  function changeMonth(delta: number) {
    if (dirtyCells.length > 0 && !window.confirm("這個月還有未儲存更正，確定要換月？")) {
      return;
    }
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function applyDraft(next: AssignmentMap) {
    setHistory((prev) => [...prev, cloneMap(draft)].slice(-40));
    setDraft(next);
    setMessage(null);
    setError(null);
  }

  function updateCell(workDate: string, shiftId: string, employeeIds: string[]) {
    const next = cloneMap(draft);
    if (!next[workDate]) next[workDate] = {};
    next[workDate][shiftId] = cellStaffIds(employeeIds);
    applyDraft(next);
  }

  function undoLast() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((items) => items.slice(0, -1));
    setDraft(cloneMap(prev));
    setMessage("已回復上一步");
    setError(null);
  }

  async function saveChanges() {
    if (!data || dirtyCells.length === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const req = adminRequestInit(lineUserId);
      const res = await fetch("/api/mobile/admin/schedule", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...req.headers },
        body: JSON.stringify({
          lineUserId,
          token: readStoredLiffAdminToken(),
          kind: "assign-batch",
          scheduleId: data.scheduleId,
          cells: dirtyCells.map((cell) => ({
            workDate: cell.workDate,
            shiftTypeId: cell.shift.id,
            employeeIds: cell.employeeIds,
            clockIn: (cell.shift.clockIn ?? "08:00").slice(0, 5),
            clockOut: (cell.shift.clockOut ?? "12:00").slice(0, 5),
          })),
        }),
      });
      const json = await readApiJson<{ message?: string }>(res, "儲存失敗");
      setMessage(json.message ?? "已儲存更正");
      await load();
    } catch (err) {
      setError(friendlyLiffError(err, "儲存失敗"));
    } finally {
      setSaving(false);
    }
  }

  async function saveMeta(kind: "pattern" | "staffing", value: string | number) {
    if (!data) return;
    if (dirtyCells.length > 0 && !window.confirm("還有未儲存更正，先放棄並改開診設定？")) {
      return;
    }
    try {
      const req = adminRequestInit(lineUserId);
      const res = await fetch("/api/mobile/admin/schedule", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...req.headers },
        body: JSON.stringify({
          lineUserId,
          token: readStoredLiffAdminToken(),
          kind,
          scheduleId: data.scheduleId,
          pattern: kind === "pattern" ? value : undefined,
          staffingPerSession: kind === "staffing" ? Number(value) : undefined,
        }),
      });
      const json = await readApiJson<{ message?: string }>(res, "更新失敗");
      setMessage(json.message ?? "已更新");
      await load();
    } catch (err) {
      setError(friendlyLiffError(err, "更新失敗"));
    }
  }

  if (loading && !data) {
    return <p className="py-12 text-center text-sm text-black">載入排班…</p>;
  }
  if (error && !data) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }
  if (!data) return null;

  const workShifts = data.shifts.filter((s) => WORK_SHIFT_CODES.has(s.code));
  const workDate = formatWorkDate(data.year, data.month, selectedDay);
  const nameById = Object.fromEntries(data.employees.map((emp) => [emp.id, emp.name]));
  const days = Array.from({ length: data.daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-3 pb-28">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 font-semibold text-black"
        >
          ← 上個月
        </button>
        <span className="font-semibold text-black">
          {data.year} 年 {data.month} 月
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 font-semibold text-black"
        >
          下個月 →
        </button>
      </div>

      <p className="text-center text-xs text-slate-600">
        臨時請假或換人：先改當天班表，確認後再按儲存
      </p>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const date = formatWorkDate(data.year, data.month, day);
          const active = day === selectedDay;
          const dirty = dirtyDays.has(day);
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`min-h-12 min-w-12 shrink-0 rounded-2xl border px-2 py-1 text-center ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : dirty
                    ? "border-amber-400 bg-amber-50 text-black"
                    : "border-slate-200 bg-white text-black"
              }`}
            >
              <span className="block text-[10px] leading-none">週{weekdayLabel(date)}</span>
              <span className="block text-sm font-bold leading-5">{day}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-bold text-black">
          {workDate} 週{weekdayLabel(workDate)}
          {dirtyDays.has(selectedDay) ? (
            <span className="ml-2 text-xs font-semibold text-amber-700">已更正，尚未儲存</span>
          ) : null}
        </p>
        <div className="mt-3 space-y-3">
          {workShifts.map((shift) => {
            const selected = cellStaffIds(draft[workDate]?.[shift.id]);
            const saved = cellStaffIds(data.assignmentMap[workDate]?.[shift.id]);
            const dirty = idsKey(selected) !== idsKey(saved);
            const limit = Math.max(1, data.staffingPerSession || 1);
            const visible = Math.min(limit, Math.max(selected.length + (selected.length < limit ? 1 : 0), 1));
            const slots = Array.from({ length: visible }, (_, index) => selected[index] ?? "");
            const names = selected.map((id) => nameById[id] ?? "同仁").join("、") || "尚未排人";
            return (
              <div
                key={shift.id}
                className={`rounded-xl border p-2.5 ${
                  dirty ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-black">
                    {shift.name} {shift.clockIn?.slice(0, 5)}–{shift.clockOut?.slice(0, 5)}
                  </p>
                  {dirty && <span className="text-[10px] font-semibold text-amber-800">更正中</span>}
                </div>
                <p className="mt-1 text-sm font-medium text-black">{names}</p>
                <div className="mt-2 space-y-1.5">
                  {slots.map((id, index) => {
                    const used = new Set(slots.filter((item, itemIndex) => item && itemIndex !== index));
                    return (
                      <select
                        key={`${shift.id}-${index}`}
                        value={id}
                        onChange={(e) => {
                          const next = selected.slice();
                          const value = e.target.value;
                          if (!value) {
                            if (index < next.length) next.splice(index, 1);
                          } else if (index < next.length) {
                            next[index] = value;
                          } else {
                            next.push(value);
                          }
                          updateCell(workDate, shift.id, next);
                        }}
                        className="min-h-11 w-full rounded-lg border border-slate-800 bg-white px-2 text-sm font-semibold text-black"
                      >
                        <option value="">{index === 0 ? "未指定／請假空出" : "不加其他人"}</option>
                        {data.employees
                          .filter((emp) => !used.has(emp.id) || emp.id === id)
                          .map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                      </select>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={() => setShowSettings((open) => !open)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600"
      >
        {showSettings ? "收合開診設定" : "開診設定（兩段／三段班、一診人數）"}
      </button>
      {showSettings && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={data.sessionPattern}
              onChange={(e) => void saveMeta("pattern", e.target.value)}
              className="min-h-11 rounded-lg border border-slate-800 bg-white px-2 text-sm text-black"
            >
              <option value="two">兩段班（早＋晚）</option>
              <option value="three">三段班（早午晚）</option>
            </select>
            <select
              value={data.staffingPerSession}
              onChange={(e) => void saveMeta("staffing", e.target.value)}
              className="min-h-11 rounded-lg border border-slate-800 bg-white px-2 text-sm text-black"
            >
              {Array.from({ length: MAX_NURSES_PER_SESSION }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  一診 {n} 人
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="sticky bottom-2 z-20 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <button
          type="button"
          disabled={history.length === 0 || saving}
          onClick={undoLast}
          className="min-h-12 rounded-xl border border-slate-400 bg-white text-sm font-semibold text-black disabled:opacity-40"
        >
          回復上一步
        </button>
        <button
          type="button"
          disabled={dirtyCells.length === 0 || saving}
          onClick={() => void saveChanges()}
          className="min-h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "儲存中…" : dirtyCells.length > 0 ? `儲存 ${dirtyCells.length} 處更正` : "儲存"}
        </button>
      </div>
    </div>
  );
}
