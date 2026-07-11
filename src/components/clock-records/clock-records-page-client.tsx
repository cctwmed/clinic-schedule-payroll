"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import {
  correctClockRecord,
  type ClockRecordRow,
} from "@/app/(dashboard)/clock-records/actions";

interface ClockRecordsPageClientProps {
  clinicName: string;
  date: string;
  records: ClockRecordRow[];
}

const CLOCK_TYPE_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
  break_start: "休息開始",
  break_end: "休息結束",
};

export function ClockRecordsPageClient({
  clinicName,
  date,
  records,
}: ClockRecordsPageClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClockRecordRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeDate(delta: number) {
    const d = new Date(`${date}T12:00:00+08:00`);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    router.push(`/clock-records?date=${next}`);
  }

  return (
    <>
      <DashboardHeader
        title="打卡紀錄"
        description={`${clinicName} — 主管檢視與修正（遲到／忘記打卡）`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeDate(-1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              ← 前一天
            </button>
            <span className="min-w-28 text-center text-sm font-semibold">{date}</span>
            <button
              onClick={() => changeDate(1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              後一天 →
            </button>
          </div>
        }
      />

      <div className="space-y-4 p-6">
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="今日紀錄" value={`${records.length} 筆`} />
          <StatCard
            label="遲到"
            value={`${records.filter((r) => r.is_late).length} 筆`}
            tone="amber"
          />
          <StatCard
            label="主管修正"
            value={`${records.filter((r) => r.is_manually_corrected).length} 筆`}
            tone="violet"
          />
        </div>

        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            此日期尚無打卡紀錄
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">員工</th>
                    <th className="px-4 py-3">類型</th>
                    <th className="px-4 py-3">時間</th>
                    <th className="px-4 py-3">班別</th>
                    <th className="px-4 py-3">狀態</th>
                    <th className="px-4 py-3">距離</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.employee_name}</p>
                        <p className="text-xs text-slate-400">{r.employee_no}</p>
                      </td>
                      <td className="px-4 py-3">{CLOCK_TYPE_LABELS[r.clock_type] ?? r.clock_type}</td>
                      <td className="px-4 py-3">
                        {new Date(r.clocked_at).toLocaleString("zh-TW", {
                          timeZone: "Asia/Taipei",
                        })}
                        {r.is_manually_corrected && r.original_clocked_at && (
                          <p className="text-xs text-violet-600">
                            原：{new Date(r.original_clocked_at).toLocaleTimeString("zh-TW", {
                              timeZone: "Asia/Taipei",
                            })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.shift_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.is_late && (
                            <Badge tone="amber">遲到 {r.late_minutes} 分</Badge>
                          )}
                          {r.is_manually_corrected && (
                            <Badge tone="violet">已修正</Badge>
                          )}
                          {r.validation === "valid" && !r.is_late && !r.is_manually_corrected && (
                            <Badge tone="green">正常</Badge>
                          )}
                        </div>
                        {r.note && (
                          <p className="mt-1 max-w-xs truncate text-xs text-slate-400" title={r.note}>
                            {r.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {r.distance_from_clinic_m != null
                          ? `${Math.round(r.distance_from_clinic_m)}m`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditing(r)}
                          className="rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                        >
                          修正
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <CorrectModal
          record={editing}
          loading={isPending}
          onClose={() => setEditing(null)}
          onSave={(form) => {
            startTransition(async () => {
              const result = await correctClockRecord({
                recordId: editing.id,
                ...form,
              });
              if (!result.success) {
                setMessage(result.error ?? "修正失敗");
                return;
              }
              setMessage("打卡紀錄已修正並註記");
              setEditing(null);
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}

function CorrectModal({
  record,
  loading,
  onClose,
  onSave,
}: {
  record: ClockRecordRow;
  loading: boolean;
  onClose: () => void;
  onSave: (form: {
    clockedAt: string;
    clockType: string;
    note: string;
    correctedBy: string;
  }) => void;
}) {
  const localTime = new Date(record.clocked_at).toLocaleString("sv-SE", {
    timeZone: "Asia/Taipei",
  }).replace(" ", "T").slice(0, 16);

  const [clockedAt, setClockedAt] = useState(localTime);
  const [clockType, setClockType] = useState(record.clock_type);
  const [note, setNote] = useState("");
  const [correctedBy, setCorrectedBy] = useState("主管");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">修正打卡紀錄</h3>
        <p className="mt-1 text-sm text-slate-500">
          {record.employee_name} — 修正後會標記「主管修正」
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">打卡時間</span>
            <input
              type="datetime-local"
              value={clockedAt}
              onChange={(e) => setClockedAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">打卡類型</span>
            <select
              value={clockType}
              onChange={(e) => setClockType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="clock_in">上班</option>
              <option value="clock_out">下班</option>
              <option value="break_start">休息開始</option>
              <option value="break_end">休息結束</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">修正原因</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：忘記打卡，經主管確認補登"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">修正人</span>
            <input
              value={correctedBy}
              onChange={(e) => setCorrectedBy(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            onClick={() =>
              onSave({
                clockedAt: new Date(`${clockedAt}:00+08:00`).toISOString(),
                clockType,
                note,
                correctedBy,
              })
            }
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "儲存中…" : "確認修正"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "violet";
}) {
  const styles =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border px-4 py-5 shadow-sm ${styles}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const styles = {
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}
