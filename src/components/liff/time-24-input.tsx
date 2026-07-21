"use client";

import {
  formatDurationZh,
  minutesBetweenHhMm,
  normalizeHhMm,
  pad2,
  periodHintZh,
} from "@/lib/time-24";

export { formatDurationZh, minutesBetweenHhMm, normalizeHhMm };

/** 強制 24 小時制選時，避免 LINE／iOS 把 22:00 顯示成 10:00 */
export function Time24Input({
  value,
  onChange,
  id,
  required,
  className,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
}) {
  const normalized = normalizeHhMm(value);
  const [h, m] = normalized.split(":").map((x) => Number(x));

  function setHour(hour: number) {
    onChange(`${pad2(hour)}:${pad2(m)}`);
  }

  function setMinute(minute: number) {
    onChange(`${pad2(h)}:${pad2(minute)}`);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          id={id}
          aria-label="時（24小時）"
          required={required}
          value={pad2(h)}
          onChange={(e) => setHour(Number(e.target.value))}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={pad2(i)}>
              {pad2(i)} 時
            </option>
          ))}
        </select>
        <span className="text-lg font-semibold text-slate-400">:</span>
        <select
          aria-label="分"
          required={required}
          value={pad2(m)}
          onChange={(e) => setMinute(Number(e.target.value))}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium"
        >
          {Array.from({ length: 60 }, (_, i) => (
            <option key={i} value={pad2(i)}>
              {pad2(i)} 分
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        24 小時制：<span className="font-semibold text-slate-800">{normalized}</span>
        {periodHintZh(h)}
      </p>
    </div>
  );
}
