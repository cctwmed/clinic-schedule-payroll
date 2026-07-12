"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { requestAnnualLeave } from "@/app/(dashboard)/leave/actions";
import type { EmployeeLeaveSummary } from "@/types/leave";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

interface LeavePageClientProps {
  clinicName: string;
  summaries: EmployeeLeaveSummary[];
}

export function LeavePageClient({ clinicName, summaries }: LeavePageClientProps) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(summaries[0]?.employeeId ?? "");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await requestAnnualLeave(employeeId, workDate);
      if (!result.success) {
        setMessage(result.error ?? "登記失敗");
        return;
      }
      setMessage("已登記特休並同步至排班與特休紀錄");
      router.refresh();
    });
  }

  return (
    <>
      <DashboardHeader
        title="特休管理"
        description={`${clinicName} — 勞基法第 38 條週年制特休（到職滿 6 個月起算）`}
      />

      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
          <p className="font-medium">週年制核給天數</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-emerald-800">
            <li>滿 6 個月～未滿 1 年：3 天</li>
            <li>滿 1 年：7 天｜滿 2 年：10 天｜滿 3～4 年：各 14 天</li>
            <li>滿 5～9 年：各 15 天｜滿 10 年起：每年加 1 天，上限 30 天</li>
            <li>
              到期未休畢折現：(月薪 {CLINIC_PAYROLL.MONTHLY_BASE_SALARY.toLocaleString("zh-TW")}{" "}
              ÷ 30) × 未休天數，併入當月薪資結算
            </li>
          </ul>
        </div>

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
            <span className="mb-1 block font-medium text-slate-700">特休日期</span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <button
            type="submit"
            disabled={isPending || summaries.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "登記中…" : "登記特休"}
          </button>
        </form>

        {summaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            尚無在職員工，請先到「員工管理」新增員工並填寫到職日
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">員工</th>
                  <th className="px-4 py-3">到職日</th>
                  <th className="px-4 py-3">年資區間</th>
                  <th className="px-4 py-3">本週期</th>
                  <th className="px-4 py-3">總天數</th>
                  <th className="px-4 py-3">已休</th>
                  <th className="px-4 py-3">剩餘</th>
                  <th className="px-4 py-3">到期日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((s) => (
                  <tr key={s.employeeId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium">{s.employeeName}</td>
                    <td className="px-4 py-3 text-slate-600">{s.arrivalDate}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.period?.seniorityLabel ?? "尚未滿 6 個月"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {s.period
                        ? `${s.period.periodStart} ～ ${s.period.periodEnd}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{s.record?.total_days ?? "—"}</td>
                    <td className="px-4 py-3">{s.record?.used_days ?? 0}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">
                      {s.remainingDays}
                    </td>
                    <td className="px-4 py-3">{s.record?.expiry_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
