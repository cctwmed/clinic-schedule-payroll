"use client";

import { MapPin, X } from "lucide-react";
import { ShiftSessionCards, buildActiveShiftHint } from "@/components/clock/shift-session-cards";
import type { ShiftClockStatusDetail } from "@/lib/clock/shift-status";
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
  canClockIn: boolean;
  canClockOut: boolean;
  onRefreshGps: () => void;
  onClockIn: () => void;
  onClockOut: () => void;
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
  canClockIn,
  canClockOut,
  onRefreshGps,
  onClockIn,
  onClockOut,
}: ClockSheetProps) {
  if (!open) return null;

  const activeHint = shiftStatuses.length > 0 ? buildActiveShiftHint(shiftStatuses) : null;

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
            <p className={`mt-2 text-sm font-medium ${withinRange ? "text-emerald-600" : "text-red-600"}`}>
              {withinRange
                ? `✓ 距離 ${distanceM}m（${radiusM}m 範圍內）`
                : `✗ 距離 ${distanceM}m，超出 ${radiusM}m 範圍`}
            </p>
          )}
          {gpsError && <p className="mt-1 text-xs text-red-600">{gpsError}</p>}
        </section>

        {shiftStatuses.length > 0 && (
          <div className="mb-4">
            <ShiftSessionCards shifts={shiftStatuses} />
          </div>
        )}

        {duty !== "all_done" && (
          <p className="mb-3 text-center text-xs text-slate-500">
            {activeHint ?? (duty === "on_duty" ? "請點選下班打卡" : "請點選上班打卡")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClockIn}
            disabled={!canClockIn || loading}
            className={`rounded-2xl py-4 text-base font-bold shadow-lg transition-all ${
              canClockIn
                ? "bg-emerald-600 text-white shadow-emerald-200"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {loading && canClockIn ? "處理中…" : "上班打卡"}
          </button>
          <button
            type="button"
            onClick={onClockOut}
            disabled={!canClockOut || loading}
            className={`rounded-2xl py-4 text-base font-bold shadow-lg transition-all ${
              canClockOut
                ? "bg-orange-500 text-white shadow-orange-200"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {loading && canClockOut ? "處理中…" : "下班打卡"}
          </button>
        </div>

        {duty === "all_done" && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-center text-sm font-medium text-emerald-800">
            今日所有班別打卡已完成 ✓
          </div>
        )}
      </div>
    </div>
  );
}
