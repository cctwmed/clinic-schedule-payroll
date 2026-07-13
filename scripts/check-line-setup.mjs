import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
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
const liffId = env.NEXT_PUBLIC_LIFF_ID;
const appUrl = env.NEXT_PUBLIC_APP_URL;

const checks = [];

checks.push({
  item: "Supabase URL",
  ok: !!env.NEXT_PUBLIC_SUPABASE_URL,
  detail: env.NEXT_PUBLIC_SUPABASE_URL ? "已設定" : "未設定",
});

checks.push({
  item: "LINE Access Token（本機）",
  ok: !!token,
  detail: token ? `已設定（${token.length} 字元）` : "未設定",
});

checks.push({
  item: "LINE Channel Secret（本機）",
  ok: !!env.LINE_CHANNEL_SECRET,
  detail: env.LINE_CHANNEL_SECRET ? "已設定" : "未設定",
});

checks.push({
  item: "LIFF ID（本機）",
  ok: !!liffId,
  detail: liffId || "【空白 — LINE 內無法開啟小程式】",
});

checks.push({
  item: "APP_URL（本機）",
  ok: !!appUrl && appUrl.startsWith("https://") && !appUrl.includes("localhost"),
  detail: appUrl || "未設定",
});

const vercelUrl = "https://clinic-schedule-payroll.vercel.app";
let vercelHasLiff = false;
let vercelWebhookSecret = false;

try {
  const html = await fetch(`${vercelUrl}/liff/clock`).then((r) => r.text());
  vercelHasLiff = html.includes("liff/edge/2/sdk");
} catch (e) {
  /* ignore */
}

try {
  const res = await fetch(`${vercelUrl}/api/line/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [] }),
  });
  const body = await res.text();
  vercelWebhookSecret = res.status === 401 && body.includes("Invalid signature");
} catch (e) {
  /* ignore */
}

checks.push({
  item: "Vercel 部署",
  ok: true,
  detail: vercelUrl,
});

checks.push({
  item: "LIFF ID（Vercel 線上）",
  ok: vercelHasLiff,
  detail: vercelHasLiff ? "已設定（頁面有載入 LIFF SDK）" : "【未設定 — 這是 LINE 看不到介面的主因】",
});

checks.push({
  item: "LINE Webhook Secret（Vercel 線上）",
  ok: vercelWebhookSecret,
  detail: vercelWebhookSecret
    ? "Channel Secret 已設定，Webhook 有驗簽"
    : "可能未設定 Secret 或 Webhook 未部署",
});

if (token) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    checks.push({
      item: "LINE Bot 連線",
      ok: res.ok,
      detail: res.ok ? `Bot：${data.displayName ?? data.basicId ?? "OK"}` : data.message ?? res.status,
    });
  } catch (e) {
    checks.push({ item: "LINE Bot 連線", ok: false, detail: String(e) });
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const endpoint = data.endpoint ?? "";
    const active = data.active === true;
    checks.push({
      item: "LINE Webhook URL（官方後台）",
      ok: active && endpoint.includes("clinic-schedule-payroll.vercel.app"),
      detail: active
        ? `已啟用：${endpoint}`
        : endpoint
          ? `已設定但未啟用：${endpoint}`
          : "尚未設定 Webhook URL",
    });
  } catch (e) {
    checks.push({ item: "LINE Webhook URL（官方後台）", ok: false, detail: String(e) });
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/quota/consumption", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      checks.push({
        item: "LINE 訊息配額",
        ok: true,
        detail: `本月已用 ${data.totalUsage ?? 0} 則`,
      });
    }
  } catch {
    /* optional */
  }
}

console.log("\n=== 排班支薪系統 · LINE 設定檢查 ===\n");
for (const c of checks) {
  console.log(`${c.ok ? "✅" : "❌"} ${c.item}`);
  console.log(`   ${c.detail}\n`);
}

const blockers = checks.filter((c) => !c.ok).map((c) => c.item);
if (blockers.length === 0) {
  console.log("🎉 必要項目皆已完成，可在 LINE 輸入「今日打卡」測試。\n");
} else {
  console.log("⚠️  尚未完成：" + blockers.join("、"));
  console.log("\n最優先：建立 LIFF → 填入 NEXT_PUBLIC_LIFF_ID → Vercel 重新部署\n");
}
