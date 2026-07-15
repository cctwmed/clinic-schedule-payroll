"use client";

import { useEffect, useState } from "react";

interface RecordsTabProps {
  lineUserId: string;
  onGoBind?: () => void;
  onBack?: () => void;
}

interface RecordRow {
  id: string;
  clockType: string;
  clockTypeLabel: string;
  clockedAt: string;
  isLate: boolean;
  lateMinutes: number;
  isManuallyCorrected: boolean;
}

export function RecordsTab({ lineUserId, onGoBind, onBack }: RecordsTabProps) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsBind, setNeedsBind] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mobile/records?lineUserId=${encodeURIComponent(lineUserId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 400 && data.error?.includes("綁定")) {
            setNeedsBind(true);
            return;
          }
          throw new Error(data.error);
        }
        setRecords(data.records ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [lineUserId]);

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm text-blue-600">
            ← 返回
          </button>
        )}
        <h1 className="flex-1 text-center text-lg font-bold">出勤紀錄</h1>
        <span className="w-10" />
      </header>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
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
      ) : records.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">近 14 天尚無打卡紀錄</p>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{r.clockTypeLabel}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(r.clockedAt).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                    })}
                  </p>
                </div>
                <div className="text-right text-xs">
                  {r.isLate && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                      遲到 {r.lateMinutes} 分
                    </span>
                  )}
                  {r.isManuallyCorrected && (
                    <span className="mt-1 block rounded bg-violet-100 px-2 py-0.5 text-violet-800">
                      主管修正
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
