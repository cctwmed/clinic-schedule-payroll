"use client";

interface StatusCardProps {
  hasClocked: boolean;
  headline: string;
  dateLabel: string;
  location: string;
  note: string;
  loading?: boolean;
  onOpenClock: () => void;
  onViewRecords: () => void;
  onLeave: () => void;
}

export function StatusCard({
  hasClocked,
  headline,
  dateLabel,
  location,
  note,
  loading,
  onOpenClock,
  onViewRecords,
  onLeave,
}: StatusCardProps) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-md">
      <p
        className={`flex items-center gap-1.5 text-xs font-medium ${
          hasClocked ? "text-emerald-600" : "text-slate-400"
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            hasClocked ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
        {hasClocked ? "您今日已打卡成功" : "今日尚未打卡"}
      </p>

      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {loading ? "載入中…" : headline}
      </h2>

      <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">日期</dt>
          <dd className="text-right font-medium text-slate-800">{dateLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">打卡地點</dt>
          <dd className="text-right font-medium text-slate-800">{location}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">備註</dt>
          <dd className="text-right font-medium text-slate-800">{note}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-1 border-t border-slate-100 pt-4 text-xs">
        <button type="button" onClick={onOpenClock} className="text-blue-600 hover:underline">
          開啟打卡首頁
        </button>
        <span className="text-slate-300">｜</span>
        <button type="button" onClick={onViewRecords} className="text-blue-600 hover:underline">
          查看出勤紀錄
        </button>
        <span className="text-slate-300">｜</span>
        <button type="button" onClick={onLeave} className="text-blue-600 hover:underline">
          我要請假
        </button>
      </div>
    </section>
  );
}
