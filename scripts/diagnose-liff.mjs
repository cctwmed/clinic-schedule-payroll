/**
 * LINE LIFF 診斷：執行 node scripts/diagnose-liff.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const token = env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = env.NEXT_PUBLIC_LIFF_ID ?? "";
const liffChannelId = liffId.split("-")[0] ?? "";

console.log("\n=== LINE LIFF 問題診斷 ===\n");

const vercelOk = await fetch("https://clinic-schedule-payroll.vercel.app/liff/clock", {
  signal: AbortSignal.timeout(20000),
})
  .then((r) => r.ok)
  .catch(() => false);

console.log(vercelOk ? "✅ Vercel 網站正常" : "❌ Vercel 網站無法連線");
console.log(`   https://clinic-schedule-payroll.vercel.app/liff/clock\n`);

if (token) {
  const bot = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  console.log(`✅ 官方帳號：${bot.displayName}（${bot.basicId}）`);

  const liffOnBot = await fetch("https://api.line.me/liff/v1/apps", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const liffBody = await liffOnBot.text();
  if (liffOnBot.status === 404) {
    console.log("⚠️  LIFF 不在 Messaging API Channel 上（此為正常架構）");
    console.log(`   目前 LIFF 綁定 Channel：${liffChannelId}`);
    console.log("   Messaging API Channel：2010673703（約略，依 Token 而定）\n");
  }
}

console.log("❌ 若手機顯示 400 / developer role：");
console.log("   → LIFF 所屬 Channel 仍為「開發中」，只有開發者能開啟\n");
console.log("【修復步驟】請管理員操作：");
console.log(`1. 開啟 https://developers.line.biz/console/channel/${liffChannelId}/`);
console.log("2. 左側選「Basic settings」→ 將 Channel 狀態改為 Published（已發布）");
console.log(`   或到 https://developers.line.biz/console/channel/${liffChannelId}/roles`);
console.log("   將同仁 LINE 帳號加為 Tester（測試者）");
console.log(`3. 左側選「LIFF」→ 確認 Endpoint URL 為：`);
console.log("   https://clinic-schedule-payroll.vercel.app/liff/clock");
console.log("4. 儲存後，手機重新開啟：");
console.log(`   https://liff.line.me/${liffId}\n`);
