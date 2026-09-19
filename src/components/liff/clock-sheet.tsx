"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import {
  CLOCK_EARLY_MINUTES,
  evaluateClockWindow,
  expectedAtOnWorkDate,
  formatTaipeiClockHm,
} from "@/lib/clock/clock-window";
import { DEFAULT_CLOCK_IN_TIME } from "@/lib/clock/session";
import {
  formatShiftClockActionLabel,
  formatShiftClockConfirmedLabel,
  getShiftDisplayName,
} from "@/lib/clock/shift-labels";
import {
  formatClockTime,
  formatTimeRange,
  type ShiftClockStatusDetail,
} from "@/lib/clock/shift-status";
import type { WorkDutyStatus } from "@/lib/clock/work-status";

interface ClockSheetProps {
  open: boolean;
  onClose: () => void;
  clinicName: string;
  employeeName: string;
  duty: WorkDutyStatus;
  workDate: string;
  shiftStatuses: ShiftClockStatusDetail[];
  gpsLoading: boolean;
  gpsError: string | null;
  hasGpsFix: boolean;
  clinicHasCoords: boolean;
  distanceM: number | null;
  radiusM: number | null;
  withinRange: boolean;
  loading: boolean;
  loadingTarget: string | null;
  onRefreshGps: () => void;
  onOpenInChrome?: () => void;
  showChromeFallback?: boolean;
  unscheduledClockInAt?: string | null;
  unscheduledClockOutAt?: string | null;
  onClock: (clockType: "clock_in" | "clock_out", assignmentId: string) => void;
}

export function ClockSheet({
  open,
  onClose,
  clinicName,
  employeeName,
  duty,
  workDate,
  shiftStatuses,
  gpsLoading,
  gpsError,
  hasGpsFix,
  clinicHasCoords,
  distanceM,
  radiusM,
  withinRange,
  loading,
  loadingTarget,
  onRefreshGps,
  onOpenInChrome,
  showChromeFallback,
  unscheduledClockInAt,
  unscheduledClockOutAt,
  onClock,
}: ClockSheetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const clockReady = withinRange && !gpsLoading;
  const unscheduledExpectedIn = expectedAtOnWorkDate(workDate, DEFAULT_CLOCK_IN_TIME);
  const unscheduledInWindow = evaluateClockWindow(now, unscheduledExpectedIn);
  const unscheduledEarliestIn = formatTaipeiClockHm(
    unscheduledInWindow.earliestAt ?? unscheduledExpectedIn
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative max-h-[85vh] translate-y-0 overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl transition-transform duration-300">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">GPS 打卡</h3>
            <p className="text-xs text-slate-500">{employeeName} · {clinicName}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              依當日班表打卡：兩段班早／晚各一組，三段班早／午／晚三組。
              上班最早可提前 {CLOCK_EARLY_MINUTES} 分鐘；下班須先打上班，且最早可於班表結束前{" "}
              {CLOCK_EARLY_MINUTES} 分鐘打卡。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="mb-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <MapPin className="h-4 w-4 text-emerald-600" />
              定位狀態
            </span>
            <button
              type="button"
              onClick={onRefreshGps}
              disabled={gpsLoading}
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {gpsLoading ? "定位中…" : "重新定位"}
            </button>
          </div>
          {distanceM != null && radiusM != null && (
            <p
              className={`mt-2 text-sm font-medium ${withinRange ? "text-emerald-700" : "text-red-700"}`}
            >
              {withinRange
                ? `✓ 距離 ${distanceM}m（${radiusM}m 範圍內）`
                : `✗ 距離 ${distanceM}m，超出 ${radiusM}m 範圍`}
            </p>
          )}
          {!gpsLoading && !hasGpsFix && !gpsError && (
            <p className="mt-2 text-sm text-amber-800">
              尚未定位。請按右上角「重新定位」（需允許 LINE 使用位置）。
            </p>
          )}
          {hasGpsFix && !clinicHasCoords && (
            <p className="mt-2 text-sm text-red-700">
              手機已定位，但診所尚未設定 GPS 座標，無法判斷是否在範圍內。請管理員確認後台診所座標。
            </p>
          )}
          {gpsError && <p className="mt-2 text-xs leading-relaxed text-red-700">{gpsError}</p>}
          {showChromeFallback && onOpenInChrome && (
            <button
              type="button"
              onClick={onOpenInChrome}
              className="mt-3 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white"
            >
              用 Chrome 開啟打卡（Android 較穩）
            </button>
          )}
        </section>

        {shiftStatuses.length === 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">今日尚無診班排程</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              可能是本月班表還沒套用／發布，或今天被排休。仍可先打卡；遲到以{" "}
              {DEFAULT_CLOCK_IN_TIME} 計算。上班最早 {unscheduledEarliestIn}；下班在上班打卡後即可打。
              有班表時：兩段班打早／晚兩組，三段班打早／午／晚三組。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
              <p>
                上班 {formatClockTime(unscheduledClockInAt ?? null)}
                {!unscheduledClockInAt && <span className="text-blue-700"> · 待打</span>}
              </p>
              <p>
                下班 {formatClockTime(unscheduledClockOutAt ?? null)}
                {unscheduledClockInAt && !unscheduledClockOutAt && (
                  <span className="text-blue-700"> · 待打</span>
                )}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onClock("clock_in", "")}
                disabled={
                  !clockReady ||
                  loading ||
                  !!unscheduledClockInAt ||
                  !unscheduledInWindow.allowed
                }
                className={`rounded-xl py-3 text-xs font-bold ${
                  unscheduledClockInAt
                    ? "cursor-default border border-emerald-300 bg-emerald-100 text-emerald-800"
                    : clockReady && unscheduledInWindow.allowed
                      ? "bg-emerald-600 text-white shadow-md"
                      : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {loading && loadingTarget === "-in"
                  ? "處理中…"
                  : unscheduledClockInAt
                    ? "已打卡"
                    : unscheduledInWindow.allowed
                      ? "上班打卡"
                      : `${unscheduledEarliestIn} 起可打`}
              </button>
              <button
                type="button"
                onClick={() => onClock("clock_out", "")}
                disabled={
                  !clockReady || loading || !unscheduledClockInAt || !!unscheduledClockOutAt
                }
                className={`rounded-xl py-3 text-xs font-bold ${
                  unscheduledClockOutAt
                    ? "cursor-default border border-orange-300 bg-orange-100 text-orange-800"
                    : clockReady && unscheduledClockInAt
                      ? "bg-orange-500 text-white shadow-md"
                      : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {loading && loadingTarget === "-out"
                  ? "處理中…"
                  : unscheduledClockOutAt
                    ? "已下班"
                    : "下班打卡"}
              </button>
            </div>
          </div>
        ) : (
          <ul className="mb-4 space-y-3">
            {shiftStatuses.map((shift) => {
              const label = getShiftDisplayName(shift.shiftCode, shift.shiftName);
              const range = formatTimeRange(shift.expectedClockIn, shift.expectedClockOut);
              const expectedIn = expectedAtOnWorkDate(workDate, shift.expectedClockIn);
              const expectedOut = expectedAtOnWorkDate(workDate, shift.expectedClockOut);
              const inWindow = evaluateClockWindow(now, expectedIn);
              const outWindow = evaluateClockWindow(now, expectedOut);
              const earliestIn = formatTaipeiClockHm(inWindow.earliestAt ?? expectedIn);
              const earliestOut = formatTaipeiClockHm(outWindow.earliestAt ?? expectedOut);
              const inDone = !!shift.clockInAt;
              const outDone = !!shift.clockOutAt;
              const canIn =
                shift.nextAction === "clock_in" &&
                clockReady &&
                !inDone &&
                inWindow.allowed;
              const canOut =
                shift.nextAction === "clock_out" &&
                clockReady &&
                !outDone &&
                outWindow.allowed;
              const inKey = `${shift.assignmentId}-in`;
              const outKey = `${shift.assignmentId}-out`;

              return (
                <li
                  key={shift.assignmentId}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    shift.isActive ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{label}</p>
                      <p className="text-xs text-slate-500">班表 {range}</p>
                    </div>
                    {shift.isActive && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        下一步
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>
                      上班 {formatClockTime(shift.clockInAt)}
                      {inDone && <span className="font-medium text-emerald-700"> · 已打卡</span>}
                      {!inDone && shift.nextAction === "clock_in" && (
                        <span className="text-blue-600"> · 待打</span>
                      )}
                    </p>
                    <p>
                      下班 {formatClockTime(shift.clockOutAt)}
                      {outDone && <span className="font-medium text-orange-700"> · 已下班</span>}
                      {!outDone && shift.nextAction === "clock_out" && (
                        <span className="text-blue-600"> · 待打</span>
                      )}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    上班最早 {earliestIn}
                    {inDone && !outDone
                      ? ` · 下班最早 ${earliestOut}${
                          outWindow.allowed ? "，現在可打" : "，尚未到時間"
                        }`
                      : ` · 下班最早 ${earliestOut}（須先打上班）`}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onClock("clock_in", shift.assignmentId)}
                      disabled={!canIn || loading}
                      className={`rounded-xl py-3 text-xs font-bold transition-all ${
                        inDone
                          ? "cursor-default border border-emerald-300 bg-emerald-100 text-emerald-800"
                          : canIn
                            ? "bg-emerald-600 text-white shadow-md"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {loading && loadingTarget === inKey
                        ? "處理中…"
                        : inDone
                          ? formatShiftClockConfirmedLabel(
                              shift.shiftCode,
                              shift.shiftName,
                              "clock_in"
                            )
                          : !inWindow.allowed && shift.nextAction === "clock_in"
                            ? `${earliestIn} 起可打`
                            : formatShiftClockActionLabel(
                                shift.shiftCode,
                                shift.shiftName,
                                "clock_in"
                              )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onClock("clock_out", shift.assignmentId)}
                      disabled={!canOut || loading}
                      className={`rounded-xl py-3 text-xs font-bold transition-all ${
                        outDone
                          ? "cursor-default border border-orange-300 bg-orange-100 text-orange-800"
                          : canOut
                            ? "bg-orange-500 text-white shadow-md"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {loading && loadingTarget === outKey
                        ? "處理中…"
                        : outDone
                          ? formatShiftClockConfirmedLabel(
                              shift.shiftCode,
                              shift.shiftName,
                              "clock_out"
                            )
                          : !outWindow.allowed && shift.nextAction === "clock_out"
                            ? `${earliestOut} 起可打`
                            : formatShiftClockActionLabel(
                                shift.shiftCode,
                                shift.shiftName,
                                "clock_out"
                              )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!clockReady && (
          <p className="mb-3 text-center text-xs text-amber-800">
            請先按「重新定位」並進入診所範圍後再打卡
          </p>
        )}

        {duty === "all_done" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-center text-sm font-medium text-emerald-800">
            今日各診別打卡均已完成 ✓
          </div>
        )}
      </div>
    </div>
  );
}
