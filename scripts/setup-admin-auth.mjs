/**
 * 建立管理後台 Supabase Auth 帳號（一次性）
 *
 * 用法：
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-secure-password node scripts/setup-admin-auth.mjs
 *
 * 需在 .env.local 或環境變數設定：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!email || !password) {
  console.error("請設定 ADMIN_EMAIL 與 ADMIN_PASSWORD 環境變數");
  console.error("例：ADMIN_EMAIL=admin@clinic.com ADMIN_PASSWORD=xxx node scripts/setup-admin-auth.mjs");
  process.exit(1);
}

if (password.length < 8) {
  console.error("密碼至少 8 字元");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  if (error.message.includes("already been registered")) {
    console.log(`帳號 ${email} 已存在，無需重複建立。`);
    process.exit(0);
  }
  console.error("建立失敗：", error.message);
  process.exit(1);
}

console.log("管理員帳號已建立：", data.user?.email);
console.log("請至 https://clinic-schedule-payroll.vercel.app/login 登入（或本機 /login）");
