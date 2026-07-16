"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatShiftClockActionLabel } from "@/lib/clock/shift-labels";

interface ForgotClockTabProps {
  lineUserId: string;
  onGoBind?: () => void;
  onBack?: () => void;
}

interface DaySession {
  assignmentId: string;
  shiftCode: string;
  shiftName: string;
  label: string;
  expectedClockIn: string;
  expectedClockOut: string;
}

const CLOCK_TYPES = [
  { value: "clock_in" as const, label: "上班打卡" },
  { value: "clock_out" as const, label: "下班打卡" },
];

export function ForgotClockTab({ lineUserId, onGoBind, onBack }: ForgotClockTabProps) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [clockType, setClockType] = useState<"clock_in" | "clock_out">("clock_in");
  const [requestedTime, setRequestedTime] = useState("08:30");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsBind, setNeedsBind] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingCount, setPendingCount] = useState(0);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(
        `/api/mobile/forgot-clock?lineUserId=${encodeURIComponent(lineUserId)}&workDate=${workDate}`
      );
      const data = await res.json();
      if (res.status === 400 && data.error?.includes("綁定")) {
        setNeedsBind(true);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setPendingCount(data.pendingCount ?? 0);
      const list = (data.sessions ?? []) as DaySession[];
      setSessions(list);
      setAssignmentId((prev) =>
        list.some((s) => s.assignmentId === prev) ? prev : list[0]?.assignmentId ?? ""
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入班表失敗");
    } finally {
      setSessionsLoading(false);
    }
  }, [lineUserId, workDate]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const selectedSession = sessions.find((s) => s.assignmentId === assignmentId);

  useEffect(() => {
    if (!selectedSession) return;
    setRequestedTime(
      clockType === "clock_in"
        ? selectedSession.expectedClockIn
        : selectedSession.expectedClockOut
    );
  }, [selectedSession, clockType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentId) {
      setError("請選擇診別（早診／晚診）");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/mobile/forgot-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          workDate,
          assignmentId,
          clockType,
          requestedTime,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送出失敗");
        return;
      }
      setMessage("補登申請已送出，請等候管理員於後台審核");
      setPendingCount((c) => c + 1);
      setReason("");
    });
  }

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm text-blue-600">
            ← 返回
          </button>
        )}
        <h1 className="flex-1 text-center text-lg font-bold">忘記打卡</h1>
        <span className="w-10" />
      </header>

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
          <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
            <p className="font-medium">補登說明</p>
            <p className="mt-1 text-xs leading-relaxed">
              請先選擇「早診」或「晚診」，再填寫上班／下班與實際時間。管理員會在後台審核補登。
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
            <label className="block text-sm font-medium text-slate-700">日期</label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700">診別</label>
            {sessionsLoading ? (
              <p className="mt-2 text-sm text-slate-400">載入當日班表…</p>
            ) : sessions.length === 0 ? (
              <p className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                此日無早診／晚診排班，請確認日期或聯繫管理員
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.assignmentId}
                    type="button"
                    onClick={() => setAssignmentId(s.assignmentId)}
                    className={`rounded-xl px-2 py-3 text-center ${
                      assignmentId === s.assignmentId
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{s.label}</span>
                    <span
                      className={`mt-0.5 block text-[10px] ${
                        assignmentId === s.assignmentId ? "text-emerald-100" : "text-slate-400"
                      }`}
                    >
                      {s.expectedClockIn} – {s.expectedClockOut}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-slate-700">打卡類型</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CLOCK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setClockType(t.value)}
                  className={`rounded-xl py-2.5 text-sm font-medium ${
                    clockType === t.value
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {selectedSession
                    ? formatShiftClockActionLabel(
                        selectedSession.shiftCode,
                        selectedSession.shiftName,
                        t.value
                      )
                    : t.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">實際時間</label>
            <input
              type="time"
              value={requestedTime}
              onChange={(e) => setRequestedTime(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700">原因（選填）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="例如：忘記按晚診下班打卡"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={isPending || sessions.length === 0 || !assignmentId}
              className="mt-4 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "送出中…" : "送出補登申請"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
