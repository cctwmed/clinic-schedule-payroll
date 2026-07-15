/**
 * 設定「葉昱麟」為護理師兼診所管理員
 * 執行：node scripts/setup-yyl-admin.mjs [LINE_USER_ID]
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
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const lineUserId = process.argv[2]?.trim();

if (!url || !key) {
  console.error("❌ 請設定 .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: clinic } = await supabase
  .from("clinics")
  .select("id, name")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (!clinic) {
  console.error("❌ 找不到診所");
  process.exit(1);
}

let { data: emp } = await supabase
  .from("employees")
  .select("id, name, employee_no, role")
  .eq("clinic_id", clinic.id)
  .ilike("name", "%葉昱麟%")
  .maybeSingle();

if (!emp) {
  const { data: created, error } = await supabase
    .from("employees")
    .insert({
      clinic_id: clinic.id,
      employee_no: "N-YYL",
      name: "葉昱麟",
      role: "nurse",
      job_title: "nurse_fulltime",
      employment_type: "full_time",
      status: "active",
      hire_date: "2024-01-01",
      hourly_wage: 220,
    })
    .select("id, name, employee_no, role")
    .single();
  if (error) {
    console.error("❌ 建立員工失敗：", error.message);
    process.exit(1);
  }
  emp = created;
  console.log("✅ 已建立員工：葉昱麟");
}

const adminPayload = { role: "nurse" };
let { error: updErr } = await supabase
  .from("employees")
  .update({ ...adminPayload, is_clinic_admin: true })
  .eq("id", emp.id);

if (updErr?.message.includes("is_clinic_admin")) {
  ({ error: updErr } = await supabase.from("employees").update(adminPayload).eq("id", emp.id));
}

if (updErr) {
  console.error("❌ 更新員工失敗：", updErr.message);
  process.exit(1);
}

console.log(`👤 員工：${emp.name} (${emp.employee_no}) — 護理師 + 管理員`);

if (lineUserId) {
  await supabase
    .from("employee_line_bindings")
    .update({ is_active: false })
    .eq("line_user_id", lineUserId)
    .neq("employee_id", emp.id);

  const { error: bindErr } = await supabase.from("employee_line_bindings").upsert(
    {
      employee_id: emp.id,
      line_user_id: lineUserId,
      line_display_name: "葉昱麟",
      is_active: true,
    },
    { onConflict: "line_user_id" }
  );

  if (bindErr) {
    console.error("❌ LINE 綁定失敗：", bindErr.message);
    process.exit(1);
  }
  console.log(`🔗 已綁定 LINE：${lineUserId}`);
} else {
  console.log("ℹ️  未提供 LINE User ID，略過綁定");
  console.log("   用法：node scripts/setup-yyl-admin.mjs Uxxxxxxxx...");
  console.log("   綁定後 LIFF 會顯示「管理員」分頁");
}

console.log("\n完成。請在 LINE 重新開啟打卡頁測試。");
