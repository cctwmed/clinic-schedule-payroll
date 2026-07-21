"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import {
  approveLeaveRequest,
  submitLeaveRequest,
} from "@/app/(dashboard)/leave/actions";
import type { LeaveRecordRow } from "@/lib/leave/leave-records-service";
import type { EmployeeLeaveBalanceRow } from "@/lib/leave/leave-records-service";
import {
  HOURS_PER_LEAVE_DAY,
  LEAVE_TYPE_DEFINITIONS,
  LEAVE_TYPE_OPTIONS,
  leavePayLabel,
  leaveTypeLabel,
  type LeaveRecordType,
} from "@/lib/leave/leave-types";
import type { EmployeeLeaveSummary } from "@/types/leave";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

interface LeavePageClientProps {
  clinicName: string;
  summaries: EmployeeLeaveSummary[];
  pendingRequests: LeaveRecordRow[];
  monthlyApproved: LeaveRecordRow[];
  balances: EmployeeLeaveBalanceRow[];
  year: number;
  month: number;
}

const STATUS_LABELS = {
  pending: "待審",
  approved: "已核准",
  rejected: "已駁回",
} as const;

export function LeavePageClient({
  clinicName,
  summaries,
  pendingRequests,
  monthlyApproved,
  balances,
  year,
  month,
}: LeavePageClientProps) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(summaries[0]?.employeeId ?? "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [leaveType, setLeaveType] = useState<LeaveRecordType>("special");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    router.push(`/leave?year=${y}&month=${m}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await submitLeaveRequest({
        employeeId,
        startDate,
        endDate,
        leaveType,
        reason: reason.trim() || undefined,
        autoApprove: true,
      });
      if (!result.success) {
        setMessage(result.error ?? "登記失敗");
        return;
      }
      setMessage("已登記請假（管理員直接核准）");
      router.refresh();
    });
  }

  function handleReview(recordId: string, approved: boolean) {
    startTransition(async () => {
      const result = await approveLeaveRequest({ recordId, approved });
      setMessage(
        result.success
          ? approved
            ? "已核准請假"
            : "已駁回請假"
          : result.error ?? "操作失敗"
      );
      if (result.success) router.refresh();
    });
  }

  const monthlyStats = LEAVE_TYPE_OPTIONS.map((def) => ({
    ...def,
    count: monthlyApproved.filter((r) => r.leave_type === def.code).length,
    hours: monthlyApproved
      .filter((r) => r.leave_type === def.code)
      .reduce((s, r) => s + r.total_hours, 0),
  }));

  return (
    <>
      <DashboardHeader
        title="請假管理"
        description={`${clinicName} — 五大假別（特休／婚／喪／病／事假）`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              ← 上個月
            </button>
            <span className="min-w-28 text-center text-sm font-semibold">
              {year} 年 {month} 月
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              下個月 →
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LEAVE_TYPE_OPTIONS.map((def) => {
            const stat = monthlyStats.find((s) => s.code === def.code);
            return (
              <div
                key={def.code}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-semibold text-slate-500">{def.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {stat?.count ?? 0} 筆
                </p>
                <p className="text-xs text-slate-500">{stat?.hours ?? 0} 小時</p>
                <p className="mt-1 text-[11px] text-slate-400">{def.payLabel}</p>
              </div>
            );
          })}
        </div>

        {pendingRequests.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <h3 className="font-semibold text-amber-900">
              待審核請假（{pendingRequests.length} 筆）
            </h3>
            <ul className="mt-3 space-y-2">
              {pendingRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {r.employee_name} · {leaveTypeLabel(r.leave_type)} · {r.work_date}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.total_hours} 小時{r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleReview(r.id, false)}
                      className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
                    >
                      駁回
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleReview(r.id, true)}
                      className="rounded-md px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      核准
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">員工</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            >
              {summaries.map((s) => (
                <option key={s.employeeId} value={s.employeeId}>
                  {s.employeeName}（{s.employeeNo}）
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">假別</span>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveRecordType)}
              className="min-w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {LEAVE_TYPE_OPTIONS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">起始日</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">結束日</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block min-w-48 flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-700">原因（選填）</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：家庭事務"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={isPending || summaries.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "登記中…" : "登記並核准"}
          </button>
        </form>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
          <p className="font-medium">計薪原則（依當日班表時數）</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-emerald-800">
            <li>特休／婚假／喪假：全薪（不扣款）</li>
            <li>病假：半薪扣款 = 時數 × {CLINIC_PAYROLL.OT_HOURLY_RATE} × 50%</li>
            <li>事假：不給薪扣款 = 時數 × {CLINIC_PAYROLL.OT_HOURLY_RATE}</li>
            <li>僅「已核准」請假納入當月薪資結算</li>
          </ul>
        </div>

        <section>
          <h3 className="mb-3 text-base font-semibold text-slate-900">員工剩餘特休額度</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">員工</th>
                  <th className="px-4 py-3">剩餘特休</th>
                  <th className="px-4 py-3">今年病假已用</th>
                  <th className="px-4 py-3">今年事假已用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => (
                  <tr key={b.employeeId}>
                    <td className="px-4 py-3 font-medium">{b.employeeName}</td>
                    <td className="px-4 py-3 text-emerald-700">
                      {b.specialLeaveBalanceDays} 天（{b.specialLeaveBalanceHours}h）
                    </td>
                    <td className="px-4 py-3">
                      {(b.sickLeaveUsedHours / HOURS_PER_LEAVE_DAY).toFixed(1)} 天
                    </td>
                    <td className="px-4 py-3">
                      {(b.personalLeaveUsedHours / HOURS_PER_LEAVE_DAY).toFixed(1)} 天
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-base font-semibold text-slate-900">
            {year} 年 {month} 月已核准請假明細
          </h3>
          {monthlyApproved.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
              本月尚無已核准請假
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">員工</th>
                    <th className="px-4 py-3">假別</th>
                    <th className="px-4 py-3">日期</th>
                    <th className="px-4 py-3">時數</th>
                    <th className="px-4 py-3">計薪</th>
                    <th className="px-4 py-3">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyApproved.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{r.employee_name}</td>
                      <td className="px-4 py-3">{leaveTypeLabel(r.leave_type)}</td>
                      <td className="px-4 py-3">{r.work_date}</td>
                      <td className="px-4 py-3">{r.total_hours}h</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {r.leave_type === "maternity"
                          ? leavePayLabel(r.leave_type)
                          : r.leave_type === "pregnancy_rest"
                            ? "不給薪（在職／勞健保持續）"
                            : r.leave_type === "menstrual"
                              ? "全薪（不扣全勤）"
                            : LEAVE_TYPE_DEFINITIONS[r.leave_type].payRatio === 1
                              ? "全薪（不扣全勤）"
                              : r.leave_type === "sick"
                                ? "半薪扣款（可扣全勤）"
                                : "不給薪扣款（可扣全勤）"}
                      </td>
                      <td className="px-4 py-3">{STATUS_LABELS[r.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
