"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequestInit, readStoredLiffAdminToken } from "@/lib/liff/admin-session";
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

interface ScheduleData {
  year: number;
  month: number;
  scheduleId: string;
  sessionPattern: "two" | "three";
  staffingPerSession: number;
  daysInMonth: number;
  employees: { id: string; name: string }[];
  shifts: ShiftCol[];
  assignmentMap: Record<string, Record<string, string[]>>;
}

export function AdminScheduleTab({ lineUserId }: AdminScheduleTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const req = adminRequestInit(lineUserId);
      const res = await fetch(
        `/api/mobile/admin/schedule?${req.query}&year=${year}&month=${month}`,
        { credentials: "include", headers: req.headers }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "載入排班失敗");
      setData(json as ScheduleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入排班失敗");
    } finally {
      setLoading(false);
    }
  }, [lineUserId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    setYear(y);
    setMonth(m);
  }

  async function saveCell(shift: ShiftCol, workDate: string, employeeIds: string[]) {
    if (!data) return;
    setMessage(null);
    const req = adminRequestInit(lineUserId);
    const res = await fetch("/api/mobile/admin/schedule", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...req.headers },
      body: JSON.stringify({
        lineUserId,
        token: readStoredLiffAdminToken(),
        kind: "assign",
        scheduleId: data.scheduleId,
        workDate,
        shiftTypeId: shift.id,
        employeeIds,
        clockIn: (shift.clockIn ?? "08:00").slice(0, 5),
        clockOut: (shift.clockOut ?? "12:00").slice(0, 5),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "儲存失敗");
      return;
    }
    setMessage(json.message ?? "已儲存");
    await load();
  }

  async function saveMeta(kind: "pattern" | "staffing", value: string | number) {
    if (!data) return;
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
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "更新失敗");
      return;
    }
    setMessage(json.message ?? "已更新");
    await load();
  }

  if (loading && !data) {
    return <p className="py-12 text-center text-sm text-black">載入排班…</p>;
  }
  if (error && !data) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }
  if (!data) return null;

  const days = Array.from({ length: data.daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-3 pb-8">
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

      <div className="rounded-2xl border border-emerald-300 bg-white p-3">
        <p className="text-sm font-bold text-black">一診可排多人</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
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

      {days.map((day) => {
        const workDate = formatWorkDate(data.year, data.month, day);
        return (
          <section key={workDate} className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-bold text-black">
              {workDate} 週{weekdayLabel(workDate)}
            </p>
            <div className="mt-2 space-y-2">
              {data.shifts.map((shift) => {
                const selected = cellStaffIds(data.assignmentMap[workDate]?.[shift.id]);
                const addable = data.employees.filter((emp) => !selected.includes(emp.id));
                const canAdd = selected.length < data.staffingPerSession && addable.length > 0;
                return (
                  <div key={shift.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs font-semibold text-black">
                      {shift.name} {shift.clockIn?.slice(0, 5)}–{shift.clockOut?.slice(0, 5)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selected.length === 0 && (
                        <span className="text-xs font-semibold text-black">尚未排人</span>
                      )}
                      {selected.map((id) => {
                        const emp = data.employees.find((item) => item.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              void saveCell(
                                shift,
                                workDate,
                                selected.filter((item) => item !== id)
                              )
                            }
                            className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-black"
                          >
                            {emp?.name ?? "未知"} ×
                          </button>
                        );
                      })}
                    </div>
                    {canAdd && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          void saveCell(shift, workDate, [...selected, e.target.value]);
                        }}
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-800 bg-white px-2 text-sm font-semibold text-black"
                      >
                        <option value="">
                          {selected.length === 0
                            ? "＋ 加入護理師（一診可多人）"
                            : `＋ 再加一位（${selected.length}／${data.staffingPerSession}）`}
                        </option>
                        {addable.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
