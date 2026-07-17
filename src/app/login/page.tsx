import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">診所後台</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">晴川排班支薪系統</h1>
          <p className="mt-2 text-sm text-slate-500">請使用管理員帳號登入</p>
        </div>

        <Suspense fallback={<p className="text-center text-sm text-slate-400">載入中…</p>}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-slate-400">
          同仁 LINE 打卡無需由此登入，請使用 LINE 開啟打卡頁。
        </p>
      </div>
    </div>
  );
}
