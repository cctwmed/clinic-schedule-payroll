"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LEAVE_TYPE_OPTIONS,
  leavePayLabel,
  type LeaveRecordType,
} from "@/lib/leave/leave-types";

interface LeaveTabProps {
  lineUserId: string;
  onGoBind?: () => void;
  onBack?: () => void;
}

interface LeaveSummary {
  employeeName: string;
  remainingDays: number;
  totalDays: number;
  usedDays: number;
  periodLabel: string;
  sickLeaveUsedDays: number;
  personalLeaveUsedDays: number;
  pendingCount: number;
}

export function LeaveTab({ lineUserId, onGoBind, onBack }: LeaveTabProps) {
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [leaveType, setLeaveType] = useState<LeaveRecordType>("special");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsBind, setNeedsBind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  function loadSummary() {
    setLoading(true);
    fetch(`/api/mobile/leave?lineUserId=${encodeURIComponent(lineUserId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 400 && data.error?.includes("綁定")) {
            setNeedsBind(true);
            return;
          }
          throw new Error(data.error);
        }
        setSummary(data);
        setNeedsBind(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSummary();
  }, [lineUserId]);

  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (endDate < value) setEndDate(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (endDate < startDate) {
      setError("結束日不可早於起始日");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/mobile/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          startDate,
          endDate,
          leaveType,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "申請失敗");
        return;
      }
      setMessage(data.message ?? "請假申請已送出，待管理員核准");
      loadSummary();
      setReason("");
    });
  }

  const selectedPayLabel = leavePayLabel(leaveType);
  const isRange = endDate > startDate;

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm text-blue-600">
            ← 返回
          </button>
        )}
        <h1 className="flex-1 text-center text-lg font-bold">我要請假</h1>
        <span className="w-10" />
      </header>

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

      {needsBind ? (
        <div className="rounded-2xl border border-amber-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-medium text-amber-900">請先完成身份綁定</p>
          {onGoBind && (
            <button
              type="button"
              onClick={onGoBind}
              className="mt-4 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white"
            >
              前往打卡首頁綁定
            </button>
          )}
        </div>
      ) : loading ? (
        <p className="py-12 text-center text-sm text-slate-400">載入中…</p>
      ) : summary ? (
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{summary.employeeName}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              剩餘特休 {summary.remainingDays} 天
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.periodLabel} · 已休 {summary.usedDays} / {summary.totalDays} 天
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>今年病假已用：{summary.sickLeaveUsedDays.toFixed(1)} 天</p>
              <p>今年事假已用：{summary.personalLeaveUsedDays.toFixed(1)} 天</p>
            </div>
            {summary.pendingCount > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                有 {summary.pendingCount} 筆待審核
              </p>
            )}
          </section>

          <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">假別</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {LEAVE_TYPE_OPTIONS.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => setLeaveType(t.code)}
                  className={`flex flex-col items-center rounded-xl py-2.5 text-xs font-medium ${
                    leaveType === t.code
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`mt-0.5 text-[10px] ${
                      leaveType === t.code ? "text-emerald-100" : "text-slate-400"
                    }`}
                  >
                    {t.payLabel}
                  </span>
                </button>
              ))}
            </div>
            {selectedPayLabel && (
              <p className="mt-2 text-center text-xs text-slate-500">{selectedPayLabel}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">起始日</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">結束日</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                />
              </div>
            </div>
            {isRange && (
              <p className="mt-2 text-xs text-slate-500">
                區間請假：{startDate} ～ {endDate}，每日時數依班表自動計算
              </p>
            )}

            <label className="mt-4 block text-sm font-medium text-slate-700">原因（選填）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="簡述請假原因"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
            />

            <button
              type="submit"
              disabled={isPending}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "送出中…" : "送出請假申請"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
