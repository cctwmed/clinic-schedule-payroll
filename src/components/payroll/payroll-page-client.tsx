"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { ComplianceAlertList } from "@/components/compliance/compliance-alert-list";
import { savePayrollRun } from "@/app/(dashboard)/payroll/actions";
import type { ComplianceIssue } from "@/lib/compliance/types";
import type { LeavePayoutDue } from "@/lib/leave/service";
import type { AnnualPayrollSummary } from "@/lib/payroll/annual-summary";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import {
  clampFlexibleBonus,
  clampQuarterlyBonus,
  formatMoney,
  recalcPayrollTotals,
  type PayrollLineItem,
} from "@/lib/payroll/calculator";
import { summarizeMonthlyPayroll } from "@/lib/payroll/payroll-summary";
import { EARLY_PUNCH_BUFFER_MINUTES } from "@/lib/clock/early-punch";
import { calculateYearEndBonus } from "@/lib/payroll/year-end-bonus";
import Link from "next/link";

interface PayrollPageClientProps {
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  lineItems: PayrollLineItem[];
  complianceIssues: ComplianceIssue[];
  dbAlerts: {
    id: string;
    alert_date: string;
    rule_code: string;
    message: string;
    severity: string;
    status: string;
  }[];
  existingRun: { id: string; status: string; calculated_at: string | null } | null;
  isQuarterlyMonth: boolean;
  isYearEndMonth: boolean;
  quarterLabel: string | null;
  annualSummary: AnnualPayrollSummary | null;
  leavePayoutsDue: LeavePayoutDue[];
  pendingEarlyPunchReview?: number;
}

export function PayrollPageClient({
  year,
  month,
  periodStart,
  periodEnd,
  lineItems: initialLineItems,
  complianceIssues,
  dbAlerts,
  existingRun,
  isQuarterlyMonth,
  isYearEndMonth,
  quarterLabel,
  annualSummary,
  leavePayoutsDue,
  pendingEarlyPunchReview = 0,
}: PayrollPageClientProps) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [yearEndOverrides, setYearEndOverrides] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of initialLineItems) {
      init[item.employeeId] = item.yearEndBonusOverridden;
    }
    return init;
  });

  const summary = summarizeMonthlyPayroll(lineItems);
  const totalNonRecurring = lineItems.reduce((s, i) => s + i.nonRecurringTotal, 0);
  const totalLeavePayout = lineItems.reduce((s, i) => s + i.annualLeavePayout, 0);
  const hasLeavePayout = totalLeavePayout > 0 || leavePayoutsDue.length > 0;

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
    router.push(`/payroll?year=${y}&month=${m}`);
  }

  function patchItem(employeeId: string, patch: Partial<PayrollLineItem>) {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.employeeId !== employeeId) return item;
        if (item.parentalLeaveSuspend) return item;
        return recalcPayrollTotals({ ...item, ...patch });
      })
    );
  }

  function updateManualOvertime(employeeId: string, raw: number) {
    const hours = Math.max(0, Math.round(raw * 100) / 100);
    patchItem(employeeId, { manualOvertimeHours: hours });
  }

  function updateFlexibleBonus(employeeId: string, raw: number) {
    patchItem(employeeId, {
      flexibleBonus: raw === 0 ? 0 : clampFlexibleBonus(raw),
    });
  }

  function updateQuarterlyBonus(employeeId: string, raw: number) {
    patchItem(employeeId, { quarterlyBonus: clampQuarterlyBonus(raw) });
  }

  function applyYearEndAuto(employeeId: string) {
    const item = lineItems.find((i) => i.employeeId === employeeId);
    if (!item) return;
    const calc = calculateYearEndBonus({
      hireDate: item.hireDate,
      payrollYear: year,
    });
    setYearEndOverrides((prev) => ({ ...prev, [employeeId]: false }));
    patchItem(employeeId, {
      yearEndBonus: calc.finalAmount,
      yearEndBonusCalculated: calc.calculatedAmount,
      yearEndBonusOverridden: false,
      yearEndServiceMonths: calc.serviceMonths,
    });
  }

  function updateYearEndManual(employeeId: string, raw: number) {
    const item = lineItems.find((i) => i.employeeId === employeeId);
    if (!item) return;
    const amount = Math.max(0, Math.round(raw));
    setYearEndOverrides((prev) => ({ ...prev, [employeeId]: true }));
    patchItem(employeeId, {
      yearEndBonus: amount,
      yearEndBonusOverridden: true,
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await savePayrollRun(year, month, lineItems, complianceIssues);
      if (!result.success) {
        setMessage(result.error ?? "儲存失敗");
        return;
      }
      setMessage("薪資結算已儲存至資料庫");
      router.refresh();
    });
  }

  return (
    <>
      <DashboardHeader
        title="薪資結算"
        description={`Phase 4 · ${periodStart} ～ ${periodEnd}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={handleSave}
              disabled={isPending || lineItems.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              儲存結算結果
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-6">
        <SalaryStructureBanner />

        <MonthlyFundsDashboard summary={summary} employeeCount={lineItems.length} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="應發薪資合計" value={formatMoney(summary.totalGross)} />
          <StatCard label="非經常性獎金" value={formatMoney(totalNonRecurring)} tone="violet" />
          <StatCard label="診所規費負擔" value={formatMoney(summary.totalClinicBurden)} tone="amber" />
          <StatCard
            label="本月預算總支出"
            value={formatMoney(summary.totalBudgetOutlay)}
            highlight
          />
        </div>

        {existingRun && (
          <p className="text-sm text-slate-500">
            上次結算：{existingRun.status}
            {existingRun.calculated_at &&
              ` · ${new Date(existingRun.calculated_at).toLocaleString("zh-TW")}`}
          </p>
        )}

        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {pendingEarlyPunchReview > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            <p className="font-semibold">
              有 {pendingEarlyPunchReview} 筆「異常提早打卡」待院長審核（超過{" "}
              {EARLY_PUNCH_BUFFER_MINUTES} 分鐘緩衝）
            </p>
            <p className="mt-1 text-xs text-orange-800">
              預設薪資工時對齊班表起算；若因公需計入提早時段，請至打卡紀錄核可提早工時。
            </p>
            <Link
              href="/clock-records"
              className="mt-2 inline-block text-sm font-medium text-orange-700 underline hover:text-orange-900"
            >
              前往打卡紀錄審核 →
            </Link>
          </div>
        )}

        {hasLeavePayout && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <h3 className="text-base font-semibold text-emerald-900">特休未休畢折現</h3>
            <p className="mt-1 text-sm text-emerald-800">
              依勞基法第 38 條，到期或離職時未休畢特休以日薪{" "}
              {formatMoney(CLINIC_PAYROLL.ANNUAL_LEAVE_DAILY_RATE)}（月薪 ÷ 30）折現，併入當月非經常性薪資。
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-emerald-50 text-left text-xs font-semibold text-emerald-800">
                  <tr>
                    <th className="px-4 py-2">員工</th>
                    <th className="px-4 py-2">未休天數</th>
                    <th className="px-4 py-2">折現金額</th>
                    <th className="px-4 py-2">原因</th>
                    <th className="px-4 py-2">到期日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {leavePayoutsDue.map((p) => (
                    <tr key={p.recordId}>
                      <td className="px-4 py-2 font-medium">{p.employeeName}</td>
                      <td className="px-4 py-2">{p.unusedDays} 天</td>
                      <td className="px-4 py-2 font-medium">{formatMoney(p.payoutAmount)}</td>
                      <td className="px-4 py-2">
                        {p.reason === "expiry" ? "週期到期" : "離職結算"}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{p.expiryDate}</td>
                    </tr>
                  ))}
                  {leavePayoutsDue.length === 0 &&
                    lineItems
                      .filter((i) => i.annualLeavePayout > 0)
                      .map((i) => (
                        <tr key={i.employeeId}>
                          <td className="px-4 py-2 font-medium">{i.employeeName}</td>
                          <td className="px-4 py-2">{i.annualLeavePayoutDays} 天</td>
                          <td className="px-4 py-2 font-medium">
                            {formatMoney(i.annualLeavePayout)}
                          </td>
                          <td className="px-4 py-2">已結算紀錄</td>
                          <td className="px-4 py-2">—</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isQuarterlyMonth && (
          <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-5">
            <h3 className="text-base font-semibold text-violet-900">
              季度獎金輸入區 · {quarterLabel}
            </h3>
            <p className="mt-1 text-sm text-violet-700">
              固定發放週期：每年 3、6、9、12 月底。金額區間{" "}
              {CLINIC_PAYROLL.QUARTERLY_BONUS_MIN.toLocaleString("zh-TW")}–
              {CLINIC_PAYROLL.QUARTERLY_BONUS_MAX.toLocaleString("zh-TW")} 元（非經常性薪資，不計勞健保基數）。
            </p>
            {lineItems.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-violet-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-violet-50 text-left text-xs font-semibold text-violet-800">
                    <tr>
                      <th className="px-4 py-2">員工</th>
                      <th className="px-4 py-2">季度績效紅利（元）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-100">
                    {lineItems.map((item) => (
                      <tr key={item.employeeId}>
                        <td className="px-4 py-2 font-medium">{item.employeeName}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={CLINIC_PAYROLL.QUARTERLY_BONUS_MIN}
                            max={CLINIC_PAYROLL.QUARTERLY_BONUS_MAX}
                            step={500}
                            value={item.quarterlyBonus || ""}
                            placeholder={`${CLINIC_PAYROLL.QUARTERLY_BONUS_MIN}–${CLINIC_PAYROLL.QUARTERLY_BONUS_MAX}`}
                            onChange={(e) =>
                              updateQuarterlyBonus(item.employeeId, Number(e.target.value))
                            }
                            className="w-36 rounded-lg border border-violet-200 px-2 py-1.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {isYearEndMonth && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <h3 className="text-base font-semibold text-amber-900">年終獎金計算模組</h3>
            <p className="mt-1 text-sm text-amber-800">
              預設 1 個月全薪（{formatMoney(CLINIC_PAYROLL.YEAR_END_FULL_AMOUNT)}），依入職日比例計算。
              院長可「覆核修改」調整最終金額。
            </p>
            {lineItems.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-amber-50 text-left text-xs font-semibold text-amber-900">
                    <tr>
                      <th className="px-3 py-2">員工</th>
                      <th className="px-3 py-2">到職日</th>
                      <th className="px-3 py-2">服務月數</th>
                      <th className="px-3 py-2">系統試算</th>
                      <th className="px-3 py-2">覆核金額</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {lineItems.map((item) => (
                      <tr key={item.employeeId}>
                        <td className="px-3 py-2 font-medium">{item.employeeName}</td>
                        <td className="px-3 py-2 text-slate-600">{item.hireDate}</td>
                        <td className="px-3 py-2">{item.yearEndServiceMonths} / 12</td>
                        <td className="px-3 py-2 text-slate-600">
                          {formatMoney(item.yearEndBonusCalculated)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={item.yearEndBonus || ""}
                            disabled={!yearEndOverrides[item.employeeId]}
                            onChange={(e) =>
                              updateYearEndManual(item.employeeId, Number(e.target.value))
                            }
                            className="w-28 rounded-lg border border-amber-200 px-2 py-1.5 disabled:bg-slate-100"
                          />
                          {item.yearEndBonusOverridden && (
                            <span className="ml-1 text-xs text-amber-700">已覆核</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => applyYearEndAuto(item.employeeId)}
                              className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                            >
                              套用試算
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setYearEndOverrides((p) => ({ ...p, [item.employeeId]: true }));
                                if (!yearEndOverrides[item.employeeId]) {
                                  updateYearEndManual(item.employeeId, item.yearEndBonus);
                                }
                              }}
                              className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50"
                            >
                              覆核修改
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {annualSummary && annualSummary.employees.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">
              {year} 年度所得彙總（50 格式參考）
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              經常性薪資 {formatMoney(annualSummary.clinicRecurring)} ＋ 非經常性獎金{" "}
              {formatMoney(annualSummary.clinicNonRecurring)} ＝ 年度應發{" "}
              {formatMoney(annualSummary.clinicTotalGross)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">員工</th>
                    <th className="px-3 py-2">經常性</th>
                    <th className="px-3 py-2">彈性獎金</th>
                    <th className="px-3 py-2">季獎金</th>
                    <th className="px-3 py-2">年終</th>
                    <th className="px-3 py-2">年度總所得</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {annualSummary.employees.map((e) => (
                    <tr key={e.employeeId}>
                      <td className="px-3 py-2 font-medium">{e.employeeName}</td>
                      <td className="px-3 py-2">{formatMoney(e.recurringGross)}</td>
                      <td className="px-3 py-2">{formatMoney(e.flexibleBonus)}</td>
                      <td className="px-3 py-2">{formatMoney(e.quarterlyBonus)}</td>
                      <td className="px-3 py-2">{formatMoney(e.yearEndBonus)}</td>
                      <td className="px-3 py-2 font-semibold">{formatMoney(e.totalGross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">勞基法合規預警</h3>
          <ComplianceAlertList issues={complianceIssues} maxItems={12} />
        </section>

        {dbAlerts.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">資料庫預警紀錄</h3>
            <ul className="space-y-2 text-sm">
              {dbAlerts.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-xs text-slate-400">{a.alert_date}</span> · {a.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">員工薪資單明細</h3>
          <p className="mb-3 text-xs text-slate-500">
            應領 = 固定薪 + 加班 + 津貼／獎金；實領 = 應領 − 勞健保 − 事假／病假扣款。
          </p>
          {lineItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
              尚無在職員工
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">員工</th>
                      <th className="px-3 py-3">固定底薪</th>
                      <th className="px-3 py-3">時數薪</th>
                      <th className="px-3 py-3">平日加班</th>
                      <th className="px-3 py-3">臨時加班(h)</th>
                      <th className="px-3 py-3">國定加倍</th>
                      <th className="px-3 py-3">國定延長</th>
                      {isQuarterlyMonth && <th className="px-3 py-3">彈性獎金</th>}
                      {isQuarterlyMonth && <th className="px-3 py-3">季獎金</th>}
                      {isYearEndMonth && <th className="px-3 py-3">年終</th>}
                      <th className="px-3 py-3">特休折現</th>
                      <th className="px-3 py-3">應領</th>
                      <th className="px-3 py-3">勞保扣</th>
                      <th className="px-3 py-3">健保扣</th>
                      <th className="px-3 py-3">請假扣款</th>
                      <th className="px-3 py-3">實領</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item) => (
                      <tr
                        key={item.employeeId}
                        className={`hover:bg-slate-50/80 ${
                          item.parentalLeaveSuspend ? "bg-amber-50/70" : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium">{item.employeeName}</p>
                          <p className="text-xs text-slate-400">{item.employeeNo}</p>
                          {item.parentalLeaveSuspend && (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              停職（育嬰／懷孕）· 薪資與診所負擔 0 元
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatMoney(item.monthlyBaseSalary)}
                        </td>
                        <td className="px-3 py-3">{formatMoney(item.basePay)}</td>
                        <td className="px-3 py-3">
                          <p>{formatMoney(item.overtimePay)}</p>
                          <p className="text-xs text-slate-400">
                            自動 {item.overtimeHours}h
                            {(item.manualOvertimeHours ?? 0) > 0 &&
                              ` + 臨時 ${item.manualOvertimeHours}h`}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            max={40}
                            step={0.5}
                            value={item.manualOvertimeHours || ""}
                            placeholder="0"
                            disabled={item.parentalLeaveSuspend}
                            onChange={(e) =>
                              updateManualOvertime(item.employeeId, Number(e.target.value))
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                            title="因公臨時延長工時，併入平日加班費"
                          />
                        </td>
                        <td className="px-3 py-3 text-rose-700">
                          {item.holidayDoublePay > 0
                            ? `${formatMoney(item.holidayDoublePay)}（${item.specialAttendanceDays}天）`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-rose-600">
                          {item.holidayOvertimePay > 0
                            ? formatMoney(item.holidayOvertimePay)
                            : "—"}
                        </td>
                        {isQuarterlyMonth && (
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={0}
                              max={CLINIC_PAYROLL.FLEXIBLE_BONUS_MAX}
                              step={100}
                              value={item.flexibleBonus || ""}
                              placeholder={`${CLINIC_PAYROLL.FLEXIBLE_BONUS_MIN}–${CLINIC_PAYROLL.FLEXIBLE_BONUS_MAX}`}
                              disabled={item.parentalLeaveSuspend}
                              onChange={(e) =>
                                updateFlexibleBonus(item.employeeId, Number(e.target.value))
                              }
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </td>
                        )}
                        {isQuarterlyMonth && (
                          <td className="px-3 py-3">{formatMoney(item.quarterlyBonus)}</td>
                        )}
                        {isYearEndMonth && (
                          <td className="px-3 py-3">
                            {formatMoney(item.yearEndBonus)}
                            {item.yearEndBonusOverridden && (
                              <span className="ml-1 text-xs text-amber-600">覆核</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3 text-emerald-700">
                          {item.annualLeavePayout > 0
                            ? `${formatMoney(item.annualLeavePayout)}（${item.annualLeavePayoutDays}天）`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">
                          {formatMoney(item.grossPay)}
                        </td>
                        <td className="px-3 py-3 text-orange-700">
                          {item.leaveDeductionTotal > 0
                            ? `-${formatMoney(item.leaveDeductionTotal)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-red-600">
                          -{formatMoney(item.laborInsurance)}
                        </td>
                        <td className="px-3 py-3 text-red-600">
                          -{formatMoney(item.healthInsurance)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-blue-700">
                          {formatMoney(item.netPay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MonthlyFundsDashboard({
  summary,
  employeeCount,
}: {
  summary: ReturnType<typeof summarizeMonthlyPayroll>;
  employeeCount: number;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">本月資金支出總覽</h3>
          <p className="mt-1 text-sm text-slate-500">
            {employeeCount} 位員工 · 含應匯薪資、診所規費與應繳政府項目
          </p>
        </div>
        <div className="rounded-lg bg-blue-600 px-4 py-2 text-right text-white">
          <p className="text-xs opacity-90">本月預算總支出</p>
          <p className="text-xl font-bold">{formatMoney(summary.totalBudgetOutlay)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <h4 className="text-sm font-semibold text-emerald-900">付給同仁（應匯員工總額）</h4>
          <p className="mt-2 text-2xl font-bold text-emerald-800">
            {formatMoney(summary.totalNetToEmployees)}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            應領薪資 {formatMoney(summary.totalGross)} − 個人勞健保自付
          </p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
          <h4 className="text-sm font-semibold text-indigo-900">付給政府（應繳國家總額）</h4>
          <p className="mt-2 text-2xl font-bold text-indigo-800">
            {formatMoney(summary.totalToState)}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-indigo-900">
            <li className="flex justify-between gap-4">
              <span>勞工保險費（個人+雇主）</span>
              <span className="font-medium">
                {formatMoney(summary.laborInsuranceGrandTotal)}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>全民健康保險費（個人+雇主）</span>
              <span className="font-medium">
                {formatMoney(summary.healthInsuranceGrandTotal)}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>勞工退休金提繳（雇主 6%）</span>
              <span className="font-medium">
                {formatMoney(summary.laborPensionGrandTotal)}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        預算總支出 = 應發薪資合計 {formatMoney(summary.totalGross)} ＋ 診所負擔規費{" "}
        {formatMoney(summary.totalClinicBurden)}（雇主勞健保 + 勞退提繳）
      </p>
    </section>
  );
}

function SalaryStructureBanner() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <p className="font-semibold text-slate-800">薪資架構（Phase 4）</p>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs sm:text-sm">
        <li>
          固定月薪底薪 {formatMoney(CLINIC_PAYROLL.MONTHLY_BASE_SALARY)}（勞健保、6% 勞退申報基數）
        </li>
        <li>
          勞健保個人自付於實領扣除；雇主負擔與 6% 勞退提繳列入「付給政府／診所規費」（請於員工管理設定各項金額）
        </li>
        <li>
          平日加班／特種出勤時薪基數 {CLINIC_PAYROLL.OT_HOURLY_RATE} 元；國定假日／颱風天{" "}
          {formatMoney(CLINIC_PAYROLL.SPECIAL_ATTENDANCE_DAILY)}/天
        </li>
        <li>
          特休未休畢折現：(月薪 ÷ 30) × 未休天數，到期或離職時併入當月非經常性薪資
        </li>
        <li>
          彈性獎金與季獎金固定於 3、6、9、12 月發放；彈性獎金{" "}
          {CLINIC_PAYROLL.FLEXIBLE_BONUS_MIN.toLocaleString("zh-TW")}–
          {CLINIC_PAYROLL.FLEXIBLE_BONUS_MAX.toLocaleString("zh-TW")} 元，季獎金{" "}
          {CLINIC_PAYROLL.QUARTERLY_BONUS_MIN.toLocaleString("zh-TW")}–
          {CLINIC_PAYROLL.QUARTERLY_BONUS_MAX.toLocaleString("zh-TW")}{" "}
          元；年終獎金為獨立欄位（皆為非經常性薪資）
        </li>
      </ul>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "violet" | "amber";
}) {
  const styles = highlight
    ? "border-blue-200 bg-blue-50"
    : tone === "violet"
      ? "border-violet-200 bg-violet-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border px-4 py-5 shadow-sm ${styles}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          highlight
            ? "text-blue-700"
            : tone === "violet"
              ? "text-violet-800"
              : tone === "amber"
                ? "text-amber-800"
                : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
