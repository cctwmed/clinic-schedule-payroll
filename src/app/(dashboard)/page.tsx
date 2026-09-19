import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DashboardHeader } from "@/components/layout/sidebar";
import { LegalWarningBanner } from "@/components/compliance/legal-warning-banner";
import { withTimeout } from "@/lib/async/with-timeout";

// 強制每次請求即時渲染，避免被卡在陳舊的靜態快取狀態。
export const dynamic = "force-dynamic";

// 連線逾時上限（毫秒）。超過就快速失敗顯示錯誤，而非讓整頁無限轉圈。
const CONNECTION_TIMEOUT_MS = 8000;

async function testSupabaseConnection() {
  try {
    // 兩個查詢彼此獨立，並行執行以縮短載入時間；並加上逾時保護。
    const [rulesResult, employeeResult] = await Promise.all([
      withTimeout(
        supabase
          .from("compliance_rules")
          .select("rule_code, name", { count: "exact" })
          .limit(3),
        CONNECTION_TIMEOUT_MS,
        "Supabase 連線"
      ),
      withTimeout(
        supabase
          .from("employees")
          .select("*", { count: "exact", head: true })
          .neq("status", "resigned"),
        CONNECTION_TIMEOUT_MS,
        "員工資料查詢"
      ),
    ]);

    const { data, error, count } = rulesResult;

    if (error) {
      return {
        ok: false as const,
        message: error.message,
        rules: [] as { rule_code: string; name: string }[],
        total: 0,
        employeeCount: 0,
      };
    }

    return {
      ok: true as const,
      message:
        (count ?? 0) > 0
          ? "已成功連線並讀取資料"
          : "已成功連線，但資料表尚無資料（若尚未執行 seed.sql 屬正常）",
      rules: data ?? [],
      total: count ?? data?.length ?? 0,
      employeeCount: employeeResult.count ?? 0,
    };
  } catch (err) {
    return {
      ok: false as const,
      message:
        (err instanceof Error ? err.message : "連線失敗") +
        "（若持續發生，多為 Supabase 資料庫休眠或網路不穩，稍候重新整理即可）",
      rules: [] as { rule_code: string; name: string }[],
      total: 0,
      employeeCount: 0,
    };
  }
}

export default async function HomePage() {
  const connection = await testSupabaseConnection();

  return (
    <>
      <LegalWarningBanner />
      <DashboardHeader
        title="系統總覽"
        description="診所排班、打卡、薪資與勞基法合規管理"
      />

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Supabase 連線" value={connection.ok ? "正常" : "異常"} />
          <StatCard label="勞基法規則" value={`${connection.total} 筆`} />
          <StatCard label="在職員工" value={`${connection.employeeCount} 位`} />
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            connection.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {connection.message}
        </div>

        <section className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-sky-50 p-5 shadow-sm">
          <h2 className="text-lg font-bold text-black">請只用這一個入口</h2>
          <p className="mt-2 text-sm leading-relaxed text-black">
            這台電腦請雙擊專案資料夾裡的「啟動系統.bat」，瀏覽器會開啟
            <span className="font-semibold"> http://localhost:3001</span>
            。排班、請假審核、異常打卡、薪資都走左上選單，不要再開第二個網址或舊的 Vercel 分頁。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-black">
            員工打卡、請假申請只用 LINE 官方帳號。管理員葉昱麟在 LINE 切到「管理員」後，請假與異常打卡可直接在 App 內審核。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <LaunchButton
              href="/schedules"
              title="排班管理"
              subtitle="早／晚診，一診可排 1～6 人"
              accent="violet"
            />
            <LaunchButton
              href="/leave"
              title="請假審核"
              subtitle="待審請假核准／駁回"
              accent="emerald"
            />
            <LaunchButton
              href="/clock-records"
              title="異常打卡審核"
              subtitle="補打卡、提早、加班"
              accent="blue"
            />
            <LaunchButton
              href="/payroll"
              title="薪資結算"
              subtitle="月薪、規費、合規預警"
              accent="amber"
            />
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function LaunchButton({
  href,
  title,
  subtitle,
  accent,
}: {
  href: string;
  title: string;
  subtitle: string;
  accent: "emerald" | "blue" | "violet" | "amber";
}) {
  const styles = {
    emerald: "border-emerald-300 bg-white hover:border-emerald-400 hover:bg-emerald-50",
    blue: "border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50",
    violet: "border-violet-300 bg-white hover:border-violet-400 hover:bg-violet-50",
    amber: "border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50",
  }[accent];

  const isExternal = href.startsWith("http");

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-xl border-2 px-5 py-4 shadow-sm transition ${styles}`}
      >
        <p className="text-base font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-2 text-xs font-medium text-emerald-700">點一下開啟 →</p>
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={`block rounded-xl border-2 px-5 py-4 shadow-sm transition ${styles}`}
    >
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <p className="mt-2 text-xs font-medium text-emerald-700">點一下進入 →</p>
    </Link>
  );
}
