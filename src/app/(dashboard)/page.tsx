import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DashboardHeader } from "@/components/layout/sidebar";
import { LegalWarningBanner } from "@/components/compliance/legal-warning-banner";

async function testSupabaseConnection() {
  const { data, error, count } = await supabase
    .from("compliance_rules")
    .select("rule_code, name", { count: "exact" })
    .limit(3);

  if (error) {
    return {
      ok: false as const,
      message: error.message,
      rules: [] as { rule_code: string; name: string }[],
      total: 0,
    };
  }

  const { count: employeeCount } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .neq("status", "resigned");

  return {
    ok: true as const,
    message:
      (count ?? 0) > 0
        ? "已成功連線並讀取資料"
        : "已成功連線，但資料表尚無資料（若尚未執行 seed.sql 屬正常）",
    rules: data ?? [],
    total: count ?? data?.length ?? 0,
    employeeCount: employeeCount ?? 0,
  };
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

        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">電腦快速入口</h2>
          <p className="mt-1 text-sm text-slate-600">
            不需記 localhost。點下方大按鈕即可進入；也可執行專案內「建立桌面捷徑.bat」在桌面放一鍵圖示。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <LaunchButton
              href="https://clinic-schedule-payroll.vercel.app/liff/clock"
              title="LINE 打卡（手機／電腦）"
              subtitle="同仁打卡、請假、管理員分頁"
              accent="emerald"
            />
            <LaunchButton
              href="/"
              title="管理後台總覽"
              subtitle="排班、薪資、員工、打卡紀錄"
              accent="blue"
            />
            <LaunchButton
              href="/schedules"
              title="排班管理"
              subtitle="編輯班表、發布"
              accent="violet"
            />
            <LaunchButton
              href="/payroll"
              title="薪資結算"
              subtitle="月薪、規費、合規預警"
              accent="amber"
            />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <QuickLink
            href="/employees"
            title="員工管理"
            description="新增、編輯護理師與行政人員，設定時薪與勞健保"
          />
          <QuickLink
            href="/schedules"
            title="排班管理"
            description="安排早診、午診、晚診，發布後 LINE 通知員工"
          />
          <QuickLink
            href="/clock-records"
            title="打卡紀錄"
            description="檢視 GPS 打卡、遲到註記，主管可修正忘記打卡"
          />
          <QuickLink
            href="/payroll"
            title="薪資結算"
            description="四週變形工時自動結算、勞健保扣款與合規預警"
          />
        </div>
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

function QuickLink({
  href,
  title,
  description,
  disabled,
}: {
  href: string;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 opacity-60">
        <p className="font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Link>
  );
}
