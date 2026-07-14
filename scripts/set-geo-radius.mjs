/**
 * 更新 Supabase 診所打卡半徑
 * 執行：node scripts/set-geo-radius.mjs [公尺，預設 300]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return env;
}

const radiusM = Number(process.argv[2] ?? 300);
if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 5000) {
  console.error("❌ 半徑需為 50–5000 公尺之間的數字");
  process.exit(1);
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("❌ 缺少 Supabase 環境變數");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: before } = await supabase
  .from("clinics")
  .select("id, name, geo_radius_m, latitude, longitude");

if (!before?.length) {
  console.error("❌ 找不到診所資料");
  process.exit(1);
}

console.log("更新前：");
for (const c of before) {
  console.log(`  ${c.name}: ${c.geo_radius_m}m (${c.latitude}, ${c.longitude})`);
}

for (const c of before) {
  const { error } = await supabase
    .from("clinics")
    .update({ geo_radius_m: radiusM })
    .eq("id", c.id);

  if (error) {
    console.error(`❌ 更新 ${c.name} 失敗:`, error.message);
    process.exit(1);
  }
}

const { data: updated, error: readError } = await supabase
  .from("clinics")
  .select("id, name, geo_radius_m");

if (readError) {
  console.error("❌ 讀取失敗:", readError.message);
  process.exit(1);
}

console.log(`\n✅ 已將打卡半徑設為 ${radiusM} 公尺：`);
for (const c of updated ?? []) {
  console.log(`  ${c.name}: ${c.geo_radius_m}m`);
}
