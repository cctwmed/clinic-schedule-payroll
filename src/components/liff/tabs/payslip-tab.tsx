"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/payroll/calculator";

interface PayslipTabProps {
  lineUserId: string;
  onGoBind?: () => void;
}

interface PayslipData {
  year: number;
  month: number;
  employeeName: string;
  components: {
    baseSalary: number;
    jobAllowance: number;
    fullAttendanceBonus: number;
    fixedTotal: number;
    overtimePay: number;
    restDayOvertimePay?: number;
    restDayWorkDays?: number;
    holidayDoublePay: number;
    holidayOvertimePay: number;
    holidayPayTotal: number;
    laborInsurance: number;
    healthInsurance: number;
    personalLeaveDeduction?: number;
    sickLeaveDeduction?: number;
    leaveDeductionTotal?: number;
    grossPay: number;
    netPay: number;
  };
  leaveDeductions?: {
    personalLeaveHours: number;
    personalLeaveDeduction: number;
    sickLeaveHours: number;
    sickLeaveDeduction: number;
    total: number;
  };
  hours: { regular: number; overtime: number; overtimeTier2: number };
  overtimeDetail: { hourlyRate: number; tier1: string; tier2: string };
  holidayAttendance?: {
    days: number;
    doublePayTotal: number;
    overtimePayTotal: number;
    totalPay: number;
    doubleDaily: number;
    tier1Hourly: number;
    tier2Hourly: number;
    details: {
      date: string;
      holidayName: string | null;
      totalWorkHours: number;
      scenario: string;
      doublePay: number;
      overtimePay: number;
      summary: string;
    }[];
  };
  note: string;
}

export function PayslipTab({ lineUserId, onGoBind }: PayslipTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<PayslipData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBind, setNeedsBind] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/mobile/payslip?lineUserId=${encodeURIComponent(lineUserId)}&year=${year}&month=${month}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 400 && json.error?.includes("綁定")) {
            setNeedsBind(true);
            setData(null);
            setError(null);
            return;
          }
          throw new Error(json.error);
        }
        setNeedsBind(false);
        setData(json);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [lineUserId, year, month]);

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
    setYear(y);
    setMonth(m);
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-bold">薪水報表</h1>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={() => changeMonth(-1)} className="rounded-lg border px-3 py-1 text-sm">
            ←
          </button>
          <span className="font-semibold">
            {year} 年 {month} 月
          </span>
          <button onClick={() => changeMonth(1)} className="rounded-lg border px-3 py-1 text-sm">
            →
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {needsBind ? (
        <div className="rounded-2xl border border-amber-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-medium text-amber-900">請先完成身份綁定</p>
          <p className="mt-2 text-xs text-slate-500">
            到「打卡首頁」選擇您的姓名並綁定，即可查看薪水報表。
          </p>
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
        <div className="py-12 text-center text-sm text-slate-400">載入薪資中…</div>
      ) : null}

      {data && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{data.employeeName}</p>
            <p className="mt-1 text-xs text-slate-400">
              應領 {formatMoney(data.components.grossPay)}
            </p>
            <p className="mt-2 text-2xl font-bold text-blue-700">{formatMoney(data.components.netPay)}</p>
            <p className="text-xs text-slate-400">實領（已扣勞健保與請假扣款）</p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">固定薪資</h2>
            <Row label="底薪" value={data.components.baseSalary} />
            <Row label="職務加給" value={data.components.jobAllowance} />
            <Row label="全勤獎金" value={data.components.fullAttendanceBonus} />
            <Row label="小計" value={data.components.fixedTotal} bold />
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">加班費（時薪 142 元）</h2>
            <p className="text-xs text-slate-500">
              加班 {data.hours.overtime} 小時（第 3–4 段 {data.hours.overtimeTier2} 小時）
            </p>
            <Row label="平日加班合計" value={data.components.overtimePay} bold />
            {(data.components.restDayOvertimePay ?? 0) > 0 && (
              <Row
                label={`休息日加班費（短少 ${data.components.restDayWorkDays ?? 0} 日休）`}
                value={data.components.restDayOvertimePay!}
                bold
              />
            )}
            <p className="mt-2 text-[11px] text-slate-400">{data.overtimeDetail.tier1}</p>
            <p className="text-[11px] text-slate-400">{data.overtimeDetail.tier2}</p>
          </section>

          {data.holidayAttendance && data.holidayAttendance.days > 0 && (
            <section className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-rose-900">國定假日出勤加發</h2>
              <p className="mt-1 text-xs text-rose-700">
                共 {data.holidayAttendance.days} 天 · 合計{" "}
                {formatMoney(data.holidayAttendance.totalPay)}
              </p>
              <Row label="加倍薪資（142×8＝1136/天）" value={data.holidayAttendance.doublePayTotal} />
              <Row
                label="超過 8h 延長工時（190/237 元/h）"
                value={data.holidayAttendance.overtimePayTotal}
              />
              <ul className="mt-3 space-y-2 border-t border-rose-100 pt-3">
                {data.holidayAttendance.details.map((d) => (
                  <li key={d.date} className="text-xs text-rose-800">
                    <span className="font-medium">{d.date}</span>
                    {d.holidayName ? ` ${d.holidayName}` : ""} · {d.summary}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">扣款</h2>
            {(data.leaveDeductions?.personalLeaveDeduction ?? 0) > 0 && (
              <Row
                label={`事假扣款（${data.leaveDeductions?.personalLeaveHours ?? 0}h）`}
                value={-(data.leaveDeductions?.personalLeaveDeduction ?? 0)}
              />
            )}
            {(data.leaveDeductions?.sickLeaveDeduction ?? 0) > 0 && (
              <Row
                label={`病假扣款（${data.leaveDeductions?.sickLeaveHours ?? 0}h·半薪）`}
                value={-(data.leaveDeductions?.sickLeaveDeduction ?? 0)}
              />
            )}
            <Row label="勞保自付" value={-data.components.laborInsurance} />
            <Row label="健保自付" value={-data.components.healthInsurance} />
          </section>

          <p className="text-center text-[11px] text-slate-400">{data.note}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`mt-2 flex justify-between text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? "text-red-600" : "text-slate-900"}>
        {value < 0 ? "-" : ""}
        {formatMoney(Math.abs(value))}
      </span>
    </div>
  );
}
