"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockSheet } from "@/components/liff/clock-sheet";
import { FunctionGrid, type GridAction } from "@/components/liff/function-grid";
import type { MobileTab } from "@/components/liff/bottom-nav";
import { ModeTabs } from "@/components/liff/mode-tabs";
import type { LiffMode } from "@/components/liff/mode-switcher";
import { StatusCard } from "@/components/liff/status-card";
import { getDistanceMeters } from "@/lib/geo/haversine";
import { getShiftDisplayName } from "@/lib/clock/shift-labels";
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
  shiftStatuses: import("@/lib/clock/shift-status").ShiftClockStatusDetail[];
  todayClocks: {
    id: string;
    clock_type: string;
    clocked_at: string;
    is_late?: boolean;
    note?: string | null;
    assignment_id?: string | null;
  }[];
  workDutyStatus: WorkDutyStatus;
  workDutyStatusLabel: string;
  reminders: ClockReminder[];
  today: string;
}

interface ClockHomeTabProps {
  lineUserId: string;
  displayName: string;
  liffId?: string;
  appUrl?: string;
  isClinicAdmin: boolean;
  mode: LiffMode;
  onModeChange: (mode: LiffMode) => void;
  onNavigate?: (tab: MobileTab) => void;
}

function formatTaipeiDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  return d.toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deriveStatusNote(
  clocks: ClockStatus["todayClocks"],
  duty: WorkDutyStatus
): string {
  const clockIn = clocks.find((c) => c.clock_type === "clock_in");
  if (!clockIn) return duty === "all_done" ? "已完成" : "—";

  if (clockIn.note?.includes("提早") || clockIn.note?.includes("early")) {
    return "提早到班";
  }
  if (clockIn.is_late) return "遲到";
  return "正常";
}

export function ClockHomeTab({
  lineUserId,
  displayName,
  liffId,
  appUrl,
  isClinicAdmin,
  mode,
  onModeChange,
  onNavigate,
}: ClockHomeTabProps) {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [clockSheetOpen, setClockSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/clock?lineUserId=${encodeURIComponent(lineUserId)}`);
      const raw = await res.text();
      let data: ClockStatus & { error?: string };
      try {
        data = raw ? JSON.parse(raw) : { error: "伺服器未回傳資料" };
      } catch {
        throw new Error(raw?.slice(0, 120) || "伺服器回應格式錯誤");
      }
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
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    );
  }, []);

  useEffect(() => {
    if (status?.binding) getLocation();
  }, [status?.binding, getLocation]);

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "clock_in" || action === "clock_out") {
      setClockSheetOpen(true);
      getLocation();
    }
  }, [getLocation]);

  const distanceM = useMemo(() => {
    if (!gps || status?.clinic.latitude == null || status?.clinic.longitude == null) return null;
    return Math.round(
      getDistanceMeters(gps.lat, gps.lng, status.clinic.latitude, status.clinic.longitude)
    );
  }, [gps, status?.clinic.latitude, status?.clinic.longitude]);

  const withinRange =
    distanceM != null && status?.clinic.radiusM != null && distanceM <= status.clinic.radiusM;
  const clockReady = !!gps && withinRange && !loading;
  const duty = status?.workDutyStatus ?? "off_duty";

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

  async function handleClock(
    clockType: ClockType,
    assignmentId: string
  ) {
    if (!gps) {
      setError("請先取得 GPS 定位");
      getLocation();
      return;
    }
    if (!withinRange) {
      setError("您目前不在診所範圍內");
      return;
    }
    const targetKey = `${assignmentId}-${clockType === "clock_in" ? "in" : "out"}`;
    setLoading(true);
    setLoadingTarget(targetKey);
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
          assignmentId,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracy: gps.accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "打卡失敗");
      setMessage(data.message);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打卡失敗");
    } finally {
      setLoading(false);
      setLoadingTarget(null);
    }
  }

  function handleGridAction(action: GridAction) {
    if (action.type === "tab") {
      onNavigate?.(action.tab);
      return;
    }
    if (action.type === "clock") {
      getLocation();
      setClockSheetOpen(true);
      return;
    }
    if (action.type === "admin") {
      window.open(action.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.type === "settings") {
      setSettingsOpen(true);
    }
  }

  const todayClocks = status?.todayClocks ?? [];
  const shiftStatuses = status?.shiftStatuses ?? [];
  const lastEvent = (() => {
    const events: { type: "in" | "out"; at: string; assignmentId?: string | null }[] = [];
    for (const c of todayClocks) {
      if (c.clock_type === "clock_in" || c.clock_type === "clock_out") {
        events.push({
          type: c.clock_type === "clock_in" ? "in" : "out",
          at: c.clocked_at,
          assignmentId: c.assignment_id,
        });
      }
    }
    return events.sort((a, b) => b.at.localeCompare(a.at))[0];
  })();

  const hasClocked = todayClocks.length > 0;

  let headline = "尚未打卡";
  if (lastEvent) {
    const shift = shiftStatuses.find((s) => s.assignmentId === lastEvent.assignmentId);
    const session = shift
      ? getShiftDisplayName(shift.shiftCode, shift.shiftName)
      : null;
    const action = lastEvent.type === "in" ? "上班打卡" : "下班打卡";
    headline = session
      ? `${session} ${action} ${formatClockTime(lastEvent.at)}`
      : `${action} ${formatClockTime(lastEvent.at)}`;
  }

  const dateLabel = status?.today ? formatTaipeiDate(status.today) : "—";
  const locationLabel = status?.clinic.name
    ? `${status.clinic.name} (GPS 定位)`
    : "晴川診所 (GPS 定位)";
  const noteLabel = deriveStatusNote(todayClocks, duty);

  return (
    <div className="space-y-5 px-4 pb-8 pt-5">
      {status?.reminders?.map((r, i) => (
        <div
          key={i}
          className={`rounded-2xl border px-4 py-3 text-sm ${
            r.severity === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {r.message}
        </div>
      ))}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {statusLoading && !status ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500">載入打卡資料…</p>
        </div>
      ) : !status?.binding ? (
        <section className="rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-sm font-semibold text-amber-900">首次使用：綁定身份</h2>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
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
            className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            確認綁定
          </button>
        </section>
      ) : (
        <>
          <StatusCard
            hasClocked={hasClocked}
            headline={headline}
            dateLabel={dateLabel}
            location={locationLabel}
            note={noteLabel}
            loading={statusLoading}
            onOpenClock={() => {
              getLocation();
              setClockSheetOpen(true);
            }}
            onViewRecords={() => onNavigate?.("records")}
            onLeave={() => onNavigate?.("leave")}
          />

          <ModeTabs mode={mode} isClinicAdmin={isClinicAdmin} onChange={onModeChange} />

          <FunctionGrid mode={mode} appUrl={appUrl} onAction={handleGridAction} />

          {settingsOpen && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-md">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">個人設定</p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="text-xs text-slate-500"
                >
                  關閉
                </button>
              </div>
              <p className="mt-2 text-slate-600">👤 {status.binding.employeeName}</p>
              <p className="mt-1 text-xs text-slate-500">LINE：{displayName}</p>
              <p className="mt-3 text-xs text-slate-400">
                如需變更綁定身份，請聯繫管理員。
              </p>
            </div>
          )}
        </>
      )}

      {status?.binding && (
        <ClockSheet
          open={clockSheetOpen}
          onClose={() => setClockSheetOpen(false)}
          clinicName={status.clinic.name}
          employeeName={status.binding.employeeName}
          duty={duty}
          shiftStatuses={status.shiftStatuses}
          gpsLoading={gpsLoading}
          gpsError={gpsError}
          distanceM={distanceM}
          radiusM={status.clinic.radiusM}
          withinRange={!!withinRange}
          loading={loading}
          loadingTarget={loadingTarget}
          onRefreshGps={getLocation}
          onClock={handleClock}
        />
      )}

      {!liffId && (
        <p className="text-center text-xs text-slate-400">開發模式：未設定 LIFF ID</p>
      )}
    </div>
  );
}
