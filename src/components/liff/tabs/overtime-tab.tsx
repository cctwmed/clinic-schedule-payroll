"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Time24Input,
  formatDurationZh,
  minutesBetweenHhMm,
} from "@/components/liff/time-24-input";

interface OvertimeTabProps {
  lineUserId: string;
  onGoBind?: () => void;
}

export function OvertimeTab({ lineUserId, onGoBind }: OvertimeTabProps) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsBind, setNeedsBind] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  const durationMinutes = useMemo(
    () => minutesBetweenHhMm(startTime, endTime),
    [startTime, endTime]
  );
  const durationLabel = formatDurationZh(durationMinutes);
  const crossesMidnight = endTime <= startTime;

  useEffect(() => {
    fetch(`/api/mobile/overtime?lineUserId=${encodeURIComponent(lineUserId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 400 && data.error?.includes("綁定")) {
          setNeedsBind(true);
          return;
        }
        if (res.ok) setPendingCount(data.pendingCount ?? 0);
      })
      .catch(() => {});
  }, [lineUserId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (durationMinutes < 15) {
      setError("加班時數至少需 15 分鐘");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/mobile/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          workDate,
          startTime,
          endTime,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送出失敗");
        return;
      }
      setMessage(
        `加班申請已送出（${formatDurationZh(data.durationMinutes ?? durationMinutes)}），請等候管理員審核`
      );
      setPendingCount((c) => c + 1);
      setReason("");
    });
  }

  return (
    <div className="px-4 pt-4">
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
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-violet-100 bg-violet-50/80 p-4 text-sm text-violet-900">
            <p className="font-medium">臨時加班／支援申請</p>
            <p className="mt-1 text-xs leading-relaxed">
              請填寫加班起迄時間（24 小時制）。系統會自動計算加班時數，送出後由管理員於後台審核。
              {pendingCount > 0 && (
                <span className="mt-1 block font-medium">目前有 {pendingCount} 筆待審核</span>
              )}
            </p>
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">加班日期</label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700">
              加班開始時間
            </label>
            <Time24Input
              className="mt-1"
              value={startTime}
              onChange={setStartTime}
              required
            />

            <label className="mt-4 block text-sm font-medium text-slate-700">
              加班結束時間
            </label>
            <Time24Input className="mt-1" value={endTime} onChange={setEndTime} required />

            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="text-xs font-medium text-violet-700">加班時數（自動計算）</p>
              <p className="mt-1 text-2xl font-bold text-violet-900">{durationLabel}</p>
              <p className="mt-1 text-xs text-violet-600">
                {startTime} → {endTime}
                {crossesMidnight ? "（跨日）" : ""}
              </p>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              原因（選填）
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="例如：臨時支援晚診／協助清點"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={isPending || durationMinutes < 15}
              className="mt-4 w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "送出中…" : "送出加班申請"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
