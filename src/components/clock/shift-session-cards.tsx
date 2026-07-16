"use client";

import {
  formatClockTime,
  formatSessionLabel,
  formatTimeRange,
  phaseLabel,
  type ShiftClockPhase,
  type ShiftClockStatusDetail,
} from "@/lib/clock/shift-status";
import { getShiftDisplayName } from "@/lib/clock/shift-labels";

interface ShiftSessionCardsProps {
  shifts: ShiftClockStatusDetail[];
}

export function ShiftSessionCards({ shifts }: ShiftSessionCardsProps) {
  if (shifts.length === 0) return null;

  const doneCount = shifts.filter((s) => s.phase === "done").length;
  const workingCount = shifts.filter((s) => s.phase === "working").length;

  return (
    <section className="mb-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-800">今日各診打卡進度</h2>
        <p className="text-xs text-slate-500">
          共 {shifts.length} 診 · 完成 {doneCount}
          {workingCount > 0 ? ` · 進行 ${workingCount}` : ""}
        </p>
      </div>
      <ul className="space-y-3">
        {shifts.map((shift) => (
          <ShiftSessionCard
            key={shift.assignmentId}
            shift={shift}
            totalSessions={shifts.length}
          />
        ))}
      </ul>
    </section>
  );
}

function ShiftSessionCard({
  shift,
  totalSessions,
}: {
  shift: ShiftClockStatusDetail;
  totalSessions: number;
}) {
  const label = formatSessionLabel(shift, totalSessions);
  const shortLabel = getShiftDisplayName(shift.shiftCode, shift.shiftName);
  const range = formatTimeRange(shift.expectedClockIn, shift.expectedClockOut);

  const borderStyle = shift.isActive
    ? "border-blue-400 ring-2 ring-blue-100"
    : shift.phase === "done"
      ? "border-emerald-200"
      : shift.phase === "working"
        ? "border-amber-200"
        : "border-slate-200";

  return (
    <li
      className={`rounded-2xl border bg-white p-4 shadow-sm ${borderStyle}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {totalSessions > 1 && (
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                {shift.sessionIndex}
              </span>
            )}
            <p className="font-semibold text-slate-800">{label}</p>
            {totalSessions > 1 && (
              <p className="text-[10px] text-slate-400">{shortLabel}</p>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">班表 {range}</p>
        </div>
        <PhaseBadge phase={shift.phase} isActive={shift.isActive} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ClockStep
          kind="in"
          expected={shift.expectedClockIn.slice(0, 5)}
          actual={shift.clockInAt}
          done={!!shift.clockInAt}
          late={shift.clockInLate}
          lateMinutes={shift.clockInLateMinutes}
          pending={shift.nextAction === "clock_in"}
        />
        <ClockStep
          kind="out"
          expected={shift.expectedClockOut.slice(0, 5)}
          actual={shift.clockOutAt}
          done={!!shift.clockOutAt}
          pending={shift.nextAction === "clock_out"}
        />
      </div>

      {shift.isActive && shift.nextAction && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-800">
          👉 建議下一步：{label} · {shift.nextAction === "clock_in" ? "上班" : "下班"}打卡
        </p>
      )}
    </li>
  );
}

function PhaseBadge({
  phase,
  isActive,
}: {
  phase: ShiftClockPhase;
  isActive: boolean;
}) {
  if (isActive) {
    return (
      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        目前
      </span>
    );
  }
  const styles: Record<ShiftClockPhase, string> = {
    done: "bg-emerald-100 text-emerald-700",
    working: "bg-amber-100 text-amber-700",
    pending: "bg-slate-100 text-slate-500",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles[phase]}`}
    >
      {phaseLabel(phase)}
    </span>
  );
}

function ClockStep({
  kind,
  expected,
  actual,
  done,
  late,
  lateMinutes,
  pending,
}: {
  kind: "in" | "out";
  expected: string;
  actual: string | null;
  done: boolean;
  late?: boolean;
  lateMinutes?: number;
  pending?: boolean;
}) {
  const title = kind === "in" ? "上班" : "下班";
  const icon = done ? "✓" : pending ? "◎" : "○";

  return (
    <div
      className={`rounded-xl px-3 py-2.5 ${
        pending
          ? "bg-blue-50 ring-1 ring-blue-200"
          : done
            ? "bg-emerald-50/80"
            : "bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        <span
          className={`text-sm font-bold ${
            done ? "text-emerald-600" : pending ? "text-blue-600" : "text-slate-300"
          }`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-1 font-mono text-base font-semibold text-slate-800">
        {formatClockTime(actual)}
      </p>
      <p className="text-[11px] text-slate-400">應 {kind === "in" ? "到" : "退"} {expected}</p>
      {late && lateMinutes != null && lateMinutes > 0 && (
        <p className="mt-0.5 text-[11px] font-medium text-amber-600">遲到 {lateMinutes} 分</p>
      )}
      {!done && pending && (
        <p className="mt-0.5 text-[11px] font-medium text-blue-600">待打卡</p>
      )}
    </div>
  );
}

export function buildActiveShiftHint(shifts: ShiftClockStatusDetail[]): string | null {
  const active = shifts.find((s) => s.isActive && s.nextAction);
  if (!active) return null;
  const label = formatSessionLabel(active, shifts.length);
  return `${label} · ${active.nextAction === "clock_in" ? "上班" : "下班"}打卡`;
}
