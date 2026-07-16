/**
 * 設定超級管理員「葉昱麟」（員工編號 H123146963）
 * 執行：node scripts/setup-super-admin.mjs [LINE_USER_ID]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const SUPER_ADMIN_NO = "H123146963";
const SUPER_ADMIN_NAME = "葉昱麟";

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
  .or(`employee_no.eq.${SUPER_ADMIN_NO},name.ilike.%${SUPER_ADMIN_NAME}%`)
  .limit(1)
  .maybeSingle();

if (!emp) {
  const { data: created, error } = await supabase
    .from("employees")
    .insert({
      clinic_id: clinic.id,
      employee_no: SUPER_ADMIN_NO,
      name: SUPER_ADMIN_NAME,
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
  console.log(`✅ 已建立員工：${SUPER_ADMIN_NAME}`);
}

const adminPayload = {
  employee_no: SUPER_ADMIN_NO,
  name: SUPER_ADMIN_NAME,
  role: "nurse",
  is_clinic_admin: true,
};

let { error: updErr } = await supabase.from("employees").update(adminPayload).eq("id", emp.id);

if (updErr?.message.includes("is_clinic_admin")) {
  ({ error: updErr } = await supabase
    .from("employees")
    .update({
      employee_no: SUPER_ADMIN_NO,
      name: SUPER_ADMIN_NAME,
      role: "nurse",
    })
    .eq("id", emp.id));
}

if (updErr) {
  console.error("❌ 更新員工失敗：", updErr.message);
  process.exit(1);
}

console.log(`👤 超級管理員：${SUPER_ADMIN_NAME}（${SUPER_ADMIN_NO}）— LIFF 管理員已啟用`);

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
      line_display_name: SUPER_ADMIN_NAME,
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
  console.log("   用法：node scripts/setup-super-admin.mjs Uxxxxxxxx...");
  console.log("   或在 LIFF 打卡首頁綁定身份時選擇「葉昱麟 (H123146963)」");
}

console.log("\n完成。請完全關閉 LINE 後重新開啟打卡頁，即可使用「管理員」分頁。");
