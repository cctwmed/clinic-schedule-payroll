"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { leaveTypeLabel, type LeaveRecordType } from "@/lib/leave/leave-types";
import type { ReactNode } from "react";
import { formatDurationZh } from "@/lib/time-24";
import { readStoredLiffAdminToken } from "@/lib/liff/admin-session";

interface AdminInboxTabProps {
  lineUserId: string;
}

type Kind = "leave" | "correction" | "overtime" | "early";

interface InboxData {
  leaves: {
    id: string;
    employeeName: string;
    workDate: string;
    leaveType: string;
    hours: number;
    reason: string | null;
  }[];
  corrections: {
    id: string;
    employee_name: string;
    work_date: string;
    clock_type: string;
    requested_time: string;
    reason: string | null;
  }[];
  overtime: {
    id: string;
    employee_name?: string;
    work_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    reason: string | null;
  }[];
  early: {
    id: string;
    employee_name: string;
    clocked_at: string;
    early_minutes: number;
  }[];
}

const CLOCK_TYPE_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
};

export function AdminInboxTab({ lineUserId }: AdminInboxTabProps) {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = readStoredLiffAdminToken();
      const params = new URLSearchParams({ lineUserId });
      if (token) params.set("liff_admin", token);
      const res = await fetch(`/api/mobile/admin/inbox?${params.toString()}`, {
        credentials: "include",
        headers: token ? { "x-liff-admin": token } : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "載入待審失敗");
      setData(json as InboxData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入待審失敗");
    } finally {
      setLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  function review(kind: Kind, id: string, approved: boolean) {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/mobile/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lineUserId,
          kind,
          id,
          approved,
          token: readStoredLiffAdminToken(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "審核失敗");
        return;
      }
      setMessage(json.message ?? "已完成");
      await load();
    });
  }

  if (loading && !data) {
    return <p className="py-12 text-center text-sm text-slate-600">載入待審項目…</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  const leaveCount = data?.leaves.length ?? 0;
  const correctionCount = data?.corrections.length ?? 0;
  const otCount = data?.overtime.length ?? 0;
  const earlyCount = data?.early.length ?? 0;
  const total = leaveCount + correctionCount + otCount + earlyCount;

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm font-semibold text-slate-900">
        待審共 {total} 筆（請假 {leaveCount}／補打卡 {correctionCount}／加班 {otCount}／提早{" "}
        {earlyCount}）
      </p>
      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <InboxSection title="請假" empty="目前沒有待審請假">
        {data?.leaves.map((item) => (
          <InboxCard
            key={item.id}
            title={`${item.employeeName} · ${leaveTypeLabel(item.leaveType as LeaveRecordType)} · ${item.workDate}`}
            detail={`${item.hours} 小時${item.reason ? ` · ${item.reason}` : ""}`}
            disabled={isPending}
            onReject={() => review("leave", item.id, false)}
            onApprove={() => review("leave", item.id, true)}
            approveLabel="核准請假"
          />
        ))}
      </InboxSection>

      <InboxSection title="忘記／修正打卡" empty="目前沒有待審補打卡">
        {data?.corrections.map((item) => (
          <InboxCard
            key={item.id}
            title={`${item.employee_name} · ${item.work_date} · ${CLOCK_TYPE_LABELS[item.clock_type] ?? item.clock_type} ${item.requested_time}`}
            detail={item.reason ?? "未填原因"}
            disabled={isPending}
            onReject={() => review("correction", item.id, false)}
            onApprove={() => review("correction", item.id, true)}
            approveLabel="核准補登"
          />
        ))}
      </InboxSection>

      <InboxSection title="加班" empty="目前沒有待審加班">
        {data?.overtime.map((item) => (
          <InboxCard
            key={item.id}
            title={`${item.employee_name ?? "同仁"} · ${item.work_date} · ${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}`}
            detail={`${formatDurationZh(item.duration_minutes)}${item.reason ? ` · ${item.reason}` : ""}`}
            disabled={isPending}
            onReject={() => review("overtime", item.id, false)}
            onApprove={() => review("overtime", item.id, true)}
            approveLabel="核准加班"
          />
        ))}
      </InboxSection>

      <InboxSection title="異常提早打卡" empty="目前沒有待審提早打卡">
        {data?.early.map((item) => (
          <InboxCard
            key={item.id}
            title={`${item.employee_name} · 提早 ${item.early_minutes} 分`}
            detail={new Date(item.clocked_at).toLocaleString("zh-TW", {
              timeZone: "Asia/Taipei",
            })}
            disabled={isPending}
            onReject={() => review("early", item.id, false)}
            onApprove={() => review("early", item.id, true)}
            approveLabel="核可提早工時"
            rejectLabel="對齊班表"
          />
        ))}
      </InboxSection>
    </div>
  );
}

function InboxSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {hasItems ? children : <p className="text-sm text-slate-600">{empty}</p>}
      </div>
    </section>
  );
}

function InboxCard({
  title,
  detail,
  disabled,
  onReject,
  onApprove,
  approveLabel,
  rejectLabel = "駁回",
}: {
  title: string;
  detail: string;
  disabled: boolean;
  onReject: () => void;
  onApprove: () => void;
  approveLabel: string;
  rejectLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-700">{detail}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onReject}
          className="min-h-11 rounded-xl border border-slate-400 bg-white text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {rejectLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onApprove}
          className="min-h-11 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
        >
          {approveLabel}
        </button>
      </div>
    </div>
  );
}
