"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  buildClockExportCsv,
  CLOCK_SOURCE_LABELS,
  CLOCK_TYPE_EXPORT_LABELS,
  formatClockTimeTaipei,
  type ClockExportRow,
} from "@/lib/clock/export-report";

interface ClockExportDocumentProps {
  clinicName: string;
  clinicAddress?: string | null;
  fromDate: string;
  toDate: string;
  employeeFilter: string | null;
  rows: ClockExportRow[];
}

export function ClockExportDocument({
  clinicName,
  clinicAddress,
  fromDate,
  toDate,
  employeeFilter,
  rows,
}: ClockExportDocumentProps) {
  const exportedAt = useMemo(
    () =>
      new Date().toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    []
  );

  const csv = useMemo(
    () => buildClockExportCsv(clinicName, rows),
    [clinicName, rows]
  );

  const fileName = `打卡紀錄_${clinicName}_${fromDate}_${toDate}.csv`;

  function handlePrint() {
    window.print();
  }

  function handleDownloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <Link href="/clock-records" className="text-sm text-blue-600 hover:underline">
            ← 返回打卡紀錄
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              下載 CSV 檔
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              列印 / 另存 PDF
            </button>
          </div>
        </div>
      </div>

      <article className="print-document mx-auto max-w-5xl px-4 py-8 text-slate-900">
        <header className="border-b-2 border-slate-800 pb-4">
          <h1 className="text-xl font-bold tracking-tight">出勤打卡紀錄證明（LIFF GPS 打卡）</h1>
          <p className="mt-2 text-sm text-slate-600">供勞保局／健保署查核僱用事實及實際出勤參考</p>
          <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold">投保單位／診所：</dt>
              <dd className="inline">{clinicName}</dd>
            </div>
            {clinicAddress && (
              <div>
                <dt className="inline font-semibold">地址：</dt>
                <dd className="inline">{clinicAddress}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-semibold">紀錄期間：</dt>
              <dd className="inline">
                {fromDate} ～ {toDate}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">匯出時間：</dt>
              <dd className="inline">{exportedAt}</dd>
            </div>
            {employeeFilter && (
              <div className="sm:col-span-2">
                <dt className="inline font-semibold">篩選員工：</dt>
                <dd className="inline">{employeeFilter}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-semibold">總筆數：</dt>
              <dd className="inline">{rows.length} 筆</dd>
            </div>
          </dl>
        </header>

        {rows.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">此期間無打卡紀錄</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-400 px-2 py-2 text-left">序號</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">員工編號</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">姓名</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">工作日期</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">類型</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">打卡時間</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">班別</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">GPS距離</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">來源</th>
                  <th className="border border-slate-400 px-2 py-2 text-left">備註</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className="border border-slate-300 px-2 py-1.5">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{r.employee_no}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{r.employee_name}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{r.clock_date}</td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {CLOCK_TYPE_EXPORT_LABELS[r.clock_type] ?? r.clock_type}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 whitespace-nowrap">
                      {formatClockTimeTaipei(r.clocked_at)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">{r.shift_name ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {r.distance_from_clinic_m != null
                        ? `${Math.round(r.distance_from_clinic_m)}m`
                        : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {CLOCK_SOURCE_LABELS[r.source] ?? r.source}
                      {r.is_manually_corrected ? "（修正）" : ""}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 max-w-[8rem] truncate">
                      {r.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-8 border-t border-slate-300 pt-4 text-xs leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-800">聲明與說明</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              本表資料來自診所 LINE LIFF 行動打卡系統，含 GPS 定位距離，作為實際出勤之輔助證明。
            </li>
            <li>建議併同薪資轉帳紀錄、勞健保加保資料一併提供勞保局查核。</li>
            <li>列印後可請負責人簽章；或使用瀏覽器「另存為 PDF」留存電子檔。</li>
          </ul>
          <p className="mt-4">負責人簽章：＿＿＿＿＿＿＿＿＿＿　　日期：＿＿＿＿年＿＿月＿＿日</p>
        </footer>
      </article>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .print-document {
            max-width: none;
            padding: 0;
          }
          @page {
            margin: 12mm;
            size: A4 landscape;
          }
        }
      `}</style>
    </>
  );
}
