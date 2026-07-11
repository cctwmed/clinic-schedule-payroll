"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDistanceMeters } from "@/lib/geo/haversine";

declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      closeWindow: () => void;
      isInClient: () => boolean;
    };
  }
}

type ClockType = "clock_in" | "clock_out";
type NextAction = "clock_in" | "clock_out" | "done";

interface WorkAssignment {
  id: string;
  expected_clock_in: string;
  expected_clock_out: string;
  shift_code: string;
  shift_name: string;
}

interface ClockRecord {
  id: string;
  clock_type: string;
  clocked_at: string;
  validation: string;
  is_late?: boolean;
  late_minutes?: number;
  is_manually_corrected?: boolean;
  note?: string | null;
}

interface ClockStatus {
  clinic: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusM: number;
  };
  binding: { employeeId: string; employeeName: string } | null;
  employees: { id: string; name: string; employee_no: string }[];
  assignments: WorkAssignment[];
  todayClocks: ClockRecord[];
  nextAction: NextAction;
  today: string;
}

export default function LiffClockPage() {
  const [ready, setReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadStatus = useCallback(async (userId: string) => {
    const res = await fetch(`/api/clock?lineUserId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "載入失敗");
    setStatus(data);
    if (data.binding) setSelectedEmployeeId(data.binding.employeeId);
  }, []);

  const initLiff = useCallback(async () => {
    try {
      if (liffId && window.liff) {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return;
        }
        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        setDisplayName(profile.displayName);
        await loadStatus(profile.userId);
      } else {
        const demoId = "demo-user-local";
        setLineUserId(demoId);
        setDisplayName("測試使用者");
        await loadStatus(demoId);
      }
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LIFF 初始化失敗");
    }
  }, [liffId, loadStatus]);

  useEffect(() => {
    if (typeof window !== "undefined" && (window.liff || !liffId)) {
      initLiff();
    }
  }, [initLiff, liffId]);

  const getLocation = useCallback(() => {
    setGpsError(null);
    setGpsLoading(true);
    if (!navigator.geolocation) {
      setGpsError("此裝置不支援 GPS 定位");
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
        setGpsError(`定位失敗：${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (ready && status?.binding) {
      getLocation();
    }
  }, [ready, status?.binding, getLocation]);

  const distanceM = useMemo(() => {
    if (!gps || status?.clinic.latitude == null || status?.clinic.longitude == null) {
      return null;
    }
    return Math.round(
      getDistanceMeters(gps.lat, gps.lng, status.clinic.latitude, status.clinic.longitude)
    );
  }, [gps, status?.clinic.latitude, status?.clinic.longitude]);

  const withinRange =
    distanceM != null && status?.clinic.radiusM != null
      ? distanceM <= status.clinic.radiusM
      : false;

  const primaryAction: ClockType | null =
    status?.nextAction === "clock_in" || status?.nextAction === "clock_out"
      ? status.nextAction
      : null;

  async function handleBind() {
    if (!lineUserId || !selectedEmployeeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/line/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, employeeId: selectedEmployeeId, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadStatus(lineUserId);
      setMessage("身份綁定成功！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "綁定失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleClock(clockType: ClockType) {
    if (!lineUserId) return;
    if (!gps) {
      setError("請先取得 GPS 定位");
      getLocation();
      return;
    }
    if (!withinRange) {
      setError("您目前不在診所範圍內，無法打卡");
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
      await loadStatus(lineUserId);
      getLocation();
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

  return (
    <>
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={() => initLiff()}
        />
      )}

      <main className="mx-auto min-h-screen max-w-md bg-gradient-to-b from-blue-50 to-slate-100 px-4 pb-10 pt-6">
        <header className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-200">
            📍
          </div>
          <h1 className="text-2xl font-bold text-slate-900">今日打卡</h1>
          <p className="mt-1 text-sm text-slate-600">{status?.clinic.name ?? "診所"}</p>
          <p className="mt-2 font-mono text-lg font-semibold text-blue-700">{taipeiTime}</p>
          <p className="text-xs text-slate-400">{status?.today}</p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {!status?.binding ? (
          <section className="mb-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-amber-900">首次使用：綁定身份</h2>
            <p className="mt-1 text-xs text-amber-700">請選擇您的姓名，之後打卡會自動帶入</p>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="">選擇您的姓名</option>
              {status?.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}（{emp.employee_no}）
                </option>
              ))}
            </select>
            <button
              onClick={handleBind}
              disabled={!selectedEmployeeId || loading}
              className="mt-3 w-full rounded-xl bg-amber-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              確認綁定
            </button>
          </section>
        ) : (
          <>
            <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-800">👤 {status.binding.employeeName}</p>
              {status.assignments.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {status.assignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-700">{a.shift_name}</span>
                      <span className="text-slate-500">
                        {a.expected_clock_in.slice(0, 5)} – {a.expected_clock_out.slice(0, 5)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-400">今日無出勤班別</p>
              )}
            </section>

            <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">GPS 定位</h2>
                <button
                  onClick={getLocation}
                  disabled={gpsLoading}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {gpsLoading ? "定位中…" : "重新定位"}
                </button>
              </div>

              {gps ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-slate-500">
                    📍 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                  </p>
                  <p className="text-xs text-slate-400">精度 ±{Math.round(gps.accuracy)} 公尺</p>
                  {distanceM != null && (
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        withinRange ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {withinRange
                        ? `✓ 距離診所 ${distanceM} 公尺（可打卡）`
                        : `✗ 距離診所 ${distanceM} 公尺，超出 ${status.clinic.radiusM} 公尺範圍`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">正在取得 GPS…</p>
              )}
              {gpsError && <p className="mt-2 text-xs text-red-600">{gpsError}</p>}
            </section>

            {status.nextAction === "done" ? (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
                <p className="text-lg font-semibold text-emerald-800">今日打卡已完成 ✓</p>
                <p className="mt-1 text-sm text-emerald-600">辛苦了！</p>
              </div>
            ) : (
              <section className="mb-5 space-y-3">
                {primaryAction && (
                  <button
                    onClick={() => handleClock(primaryAction)}
                    disabled={loading || !withinRange || !gps}
                    className="w-full rounded-2xl bg-blue-600 py-5 text-lg font-bold text-white shadow-lg shadow-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {loading
                      ? "處理中…"
                      : primaryAction === "clock_in"
                        ? "確認上班打卡"
                        : "確認下班打卡"}
                  </button>
                )}
                {!withinRange && gps && (
                  <p className="text-center text-xs text-red-600">
                    您目前不在診所範圍內，無法打卡
                  </p>
                )}
              </section>
            )}
          </>
        )}

        {status?.todayClocks && status.todayClocks.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">今日紀錄</h2>
            <ul className="mt-3 space-y-2">
              {status.todayClocks.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-slate-700">{clockLabel(c.clock_type)}</span>
                    {c.is_late && (
                      <span className="ml-2 text-xs text-amber-600">
                        遲到 {c.late_minutes} 分
                      </span>
                    )}
                    {c.is_manually_corrected && (
                      <span className="ml-2 text-xs text-violet-600">已修正</span>
                    )}
                  </div>
                  <span className="text-slate-500">
                    {new Date(c.clocked_at).toLocaleTimeString("zh-TW", {
                      timeZone: "Asia/Taipei",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!liffId && (
          <p className="mt-6 text-center text-xs text-slate-400">
            開發模式：未設定 LIFF ID
          </p>
        )}

        {!ready && !error && (
          <p className="mt-6 text-center text-sm text-slate-400">載入中…</p>
        )}
      </main>
    </>
  );
}

function clockLabel(type: string): string {
  const map: Record<string, string> = {
    clock_in: "上班",
    clock_out: "下班",
    break_start: "休息開始",
    break_end: "休息結束",
  };
  return map[type] ?? type;
}
