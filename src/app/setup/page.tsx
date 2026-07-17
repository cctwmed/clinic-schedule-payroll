import { redirect } from "next/navigation";
import { needsAdminSetup } from "@/lib/auth/setup";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  const needsSetup = await needsAdminSetup();

  if (!needsSetup) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">首次設定</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">建立管理員帳號</h1>
          <p className="mt-2 text-sm text-slate-500">
            系統尚未建立後台登入帳號，請設定院長或管理員的 Email 與密碼。
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  );
}
