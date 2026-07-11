/**
 * Supabase 連線測試腳本
 * 執行：node scripts/test-supabase.mjs
 * （需先設定 .env.local）
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key] = rest.join("=");
  }

  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ 找不到 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error, count } = await supabase
  .from("compliance_rules")
  .select("rule_code, name", { count: "exact" })
  .limit(3);

if (error) {
  console.error("❌ Supabase 連線失敗：", error.message);
  process.exit(1);
}

console.log("✅ Supabase 連線成功！");
console.log(`   勞基法規則共 ${count} 筆，範例：`);
for (const rule of data ?? []) {
  console.log(`   - ${rule.rule_code}: ${rule.name}`);
}
