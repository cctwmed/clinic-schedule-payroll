"use client";

import { MapPin, X } from "lucide-react";
import {
  formatShiftClockActionLabel,
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
  shiftStatuses: ShiftClockStatusDetail[];
  gpsLoading: boolean;
  gpsError: string | null;
  distanceM: number | null;
  radiusM: number | null;
  withinRange: boolean;
  loading: boolean;
  loadingTarget: string | null;
  onRefreshGps: () => void;
  onClock: (clockType: "clock_in" | "clock_out", assignmentId: string) => void;
}

export function ClockSheet({
  open,
  onClose,
  clinicName,
  employeeName,
  duty,
  shiftStatuses,
  gpsLoading,
  gpsError,
  distanceM,
  radiusM,
  withinRange,
  loading,
  loadingTarget,
  onRefreshGps,
  onClock,
}: ClockSheetProps) {
  if (!open) return null;

  const clockReady = withinRange && !gpsLoading;

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
              className={`mt-2 text-sm font-medium ${withinRange ? "text-emerald-600" : "text-red-600"}`}
            >
              {withinRange
                ? `✓ 距離 ${distanceM}m（${radiusM}m 範圍內）`
                : `✗ 距離 ${distanceM}m，超出 ${radiusM}m 範圍`}
            </p>
          )}
          {gpsError && <p className="mt-1 text-xs text-red-600">{gpsError}</p>}
        </section>

        {shiftStatuses.length === 0 ? (
          <p className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            今日無排班，無法依診別打卡
          </p>
        ) : (
          <ul className="mb-4 space-y-3">
            {shiftStatuses.map((shift) => {
              const label = getShiftDisplayName(shift.shiftCode, shift.shiftName);
              const range = formatTimeRange(shift.expectedClockIn, shift.expectedClockOut);
              const canIn = shift.nextAction === "clock_in" && clockReady;
              const canOut = shift.nextAction === "clock_out" && clockReady;
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
                        建議
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>
                      上班 {formatClockTime(shift.clockInAt)}
                      {!shift.clockInAt && shift.nextAction === "clock_in" && (
                        <span className="text-blue-600"> · 待打</span>
                      )}
                    </p>
                    <p>
                      下班 {formatClockTime(shift.clockOutAt)}
                      {!shift.clockOutAt && shift.nextAction === "clock_out" && (
                        <span className="text-blue-600"> · 待打</span>
                      )}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onClock("clock_in", shift.assignmentId)}
                      disabled={!canIn || loading}
                      className={`rounded-xl py-3 text-xs font-bold transition-all ${
                        canIn
                          ? "bg-emerald-600 text-white shadow-md"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {loading && loadingTarget === inKey
                        ? "處理中…"
                        : formatShiftClockActionLabel(shift.shiftCode, shift.shiftName, "clock_in")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onClock("clock_out", shift.assignmentId)}
                      disabled={!canOut || loading}
                      className={`rounded-xl py-3 text-xs font-bold transition-all ${
                        canOut
                          ? "bg-orange-500 text-white shadow-md"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {loading && loadingTarget === outKey
                        ? "處理中…"
                        : formatShiftClockActionLabel(shift.shiftCode, shift.shiftName, "clock_out")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!clockReady && shiftStatuses.length > 0 && (
          <p className="mb-3 text-center text-xs text-amber-700">
            請先完成 GPS 定位並進入診所範圍後，再選擇診別打卡
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
