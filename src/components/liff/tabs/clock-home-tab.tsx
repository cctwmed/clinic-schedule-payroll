"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDistanceMeters } from "@/lib/geo/haversine";
import {
  buildActiveShiftHint,
  ShiftSessionCards,
} from "@/components/clock/shift-session-cards";
import type { ShiftClockStatusDetail } from "@/lib/clock/shift-status";
import type { WorkDutyStatus } from "@/lib/clock/work-status";

type ClockType = "clock_in" | "clock_out";

interface ClockReminder {
  type: string;
  severity: "error" | "warning";
  message: string;
}

interface ClockStatus {
  clinic: { name: string; latitude: number | null; longitude: number | null; radiusM: number };
  binding: { employeeId: string; employeeName: string } | null;
  employees: { id: string; name: string; employee_no: string }[];
  shiftStatuses: ShiftClockStatusDetail[];
  todayClocks: { id: string; clock_type: string; clocked_at: string; assignment_id?: string | null }[];
  workDutyStatus: WorkDutyStatus;
  workDutyStatusLabel: string;
  reminders: ClockReminder[];
  today: string;
}

interface ClockHomeTabProps {
  lineUserId: string;
  displayName: string;
  liffId?: string;
}

export function ClockHomeTab({ lineUserId, displayName, liffId }: ClockHomeTabProps) {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [highlightAction, setHighlightAction] = useState<ClockType | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "clock_in" || action === "clock_out") setHighlightAction(action);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/clock?lineUserId=${encodeURIComponent(lineUserId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "載入失敗");
      setStatus(data);
      if (data.binding) setSelectedEmployeeId(data.binding.employeeId);
      setError(null);
    } finally {
      setStatusLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    loadStatus().catch((e) => setError(e instanceof Error ? e.message : "載入失敗"));
  }, [loadStatus]);

  const getLocation = useCallback(() => {
    setGpsError(null);
    setGpsLoading(true);
    if (!navigator.geolocation) {
      setGpsError("此裝置不支援 GPS");
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (status?.binding) getLocation();
  }, [status?.binding, getLocation]);

  const distanceM = useMemo(() => {
    if (!gps || status?.clinic.latitude == null || status?.clinic.longitude == null) return null;
    return Math.round(getDistanceMeters(gps.lat, gps.lng, status.clinic.latitude, status.clinic.longitude));
  }, [gps, status?.clinic.latitude, status?.clinic.longitude]);

  const withinRange = distanceM != null && status?.clinic.radiusM != null && distanceM <= status.clinic.radiusM;
  const clockReady = !!gps && withinRange && !loading;
  const duty = status?.workDutyStatus ?? "off_duty";

  const canClockIn = duty === "off_duty" && clockReady;
  const canClockOut = duty === "on_duty" && clockReady;

  const activeHint = status?.shiftStatuses ? buildActiveShiftHint(status.shiftStatuses) : null;

  async function handleBind() {
    if (!selectedEmployeeId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/line/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, employeeId: selectedEmployeeId, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadStatus();
      setMessage("身份綁定成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "綁定失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleClock(clockType: ClockType) {
    setHighlightAction(clockType);
    if (!gps) {
      setError("請先取得 GPS 定位");
      getLocation();
      return;
    }
    if (!withinRange) {
      setError("您目前不在診所範圍內");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          employeeId: status?.binding?.employeeId ?? selectedEmployeeId,
          clockType,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracy: gps.accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "打卡失敗");
      setMessage(data.message);
      setHighlightAction(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打卡失敗");
    } finally {
      setLoading(false);
    }
  }

  const taipeiTime = now.toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const inBtnClass =
    duty === "off_duty" && canClockIn
      ? "bg-emerald-600 text-white shadow-emerald-200 ring-2 ring-emerald-300"
      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none";

  const outBtnClass =
    duty === "on_duty" && canClockOut
      ? "bg-orange-500 text-white shadow-orange-200 ring-2 ring-orange-300"
      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none";

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-bold text-slate-900">打卡首頁</h1>
        <p className="text-sm text-slate-600">{status?.clinic.name ?? "診所"}</p>
        <p className="mt-1 font-mono text-lg font-semibold text-blue-700">{taipeiTime}</p>
        {status?.binding && (
          <p className="mt-1 inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-800">
            狀態：{status.workDutyStatusLabel}
          </p>
        )}
      </header>

      {status?.reminders?.map((r, i) => (
        <div
          key={i}
          className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            r.severity === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {r.message}
        </div>
      ))}

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {statusLoading && !status ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-500">載入打卡資料…</p>
        </div>
      ) : !status?.binding ? (
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-900">首次使用：綁定身份</h2>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="mt-3 w-full rounded-xl border px-3 py-3 text-sm"
          >
            <option value="">選擇姓名</option>
            {status?.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（{e.employee_no}）
              </option>
            ))}
          </select>
          <button
            onClick={handleBind}
            disabled={!selectedEmployeeId || loading}
            className="mt-3 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            確認綁定
          </button>
        </section>
      ) : (
        <>
          <p className="mb-3 text-center text-sm text-slate-600">👤 {status.binding.employeeName}</p>

          {status.shiftStatuses.length > 0 && <ShiftSessionCards shifts={status.shiftStatuses} />}

          <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">GPS</span>
              <button
                onClick={getLocation}
                disabled={gpsLoading}
                className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-white"
              >
                {gpsLoading ? "定位中" : "重新定位"}
              </button>
            </div>
            {gps && distanceM != null && (
              <p className={`mt-2 text-sm font-medium ${withinRange ? "text-emerald-600" : "text-red-600"}`}>
                {withinRange
                  ? `✓ 距離 ${distanceM}m（${status.clinic.radiusM}m 內可打卡）`
                  : `✗ 距離 ${distanceM}m，超出 ${status.clinic.radiusM}m 範圍`}
              </p>
            )}
            {gpsError && <p className="mt-1 text-xs text-red-600">{gpsError}</p>}
          </section>

          {duty !== "all_done" && (
            <p className="mb-2 text-center text-xs text-slate-500">
              {activeHint ? `建議：${activeHint}` : duty === "on_duty" ? "請點選下班打卡" : "請點選上班打卡"}
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleClock("clock_in")}
              disabled={!canClockIn}
              className={`rounded-2xl py-5 text-base font-bold shadow-lg transition-all ${inBtnClass}`}
            >
              {loading && highlightAction === "clock_in" ? "處理中…" : "上班打卡"}
            </button>
            <button
              type="button"
              onClick={() => handleClock("clock_out")}
              disabled={!canClockOut}
              className={`rounded-2xl py-5 text-base font-bold shadow-lg transition-all ${outBtnClass}`}
            >
              {loading && highlightAction === "clock_out" ? "處理中…" : "下班打卡"}
            </button>
          </div>

          {duty === "all_done" && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 py-4 text-center text-sm font-medium text-emerald-800">
              今日所有班別打卡已完成 ✓
            </div>
          )}
        </>
      )}

      {!liffId && (
        <p className="mt-4 text-center text-xs text-slate-400">開發模式：未設定 LIFF ID</p>
      )}
    </div>
  );
}
