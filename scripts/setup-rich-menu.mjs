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

if (!token) {
  console.error("❌ 缺少 LINE_CHANNEL_ACCESS_TOKEN");
  process.exit(1);
}
if (!liffId) {
  console.error("❌ 缺少 NEXT_PUBLIC_LIFF_ID");
  process.exit(1);
}

const liffBase = `https://liff.line.me/${liffId}`;

const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "晴川診所打卡選單",
  chatBarText: "打卡選單",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "uri", label: "打卡首頁", uri: liffBase },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: "uri", label: "我的班表", uri: `${liffBase}?tab=schedule` },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "uri", label: "薪水報表", uri: `${liffBase}?tab=payslip` },
    },
  ],
};

async function main() {
  console.log("建立 Rich Menu…");
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(richMenu),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    console.error("❌ 建立失敗:", createData);
    process.exit(1);
  }

  const richMenuId = createData.richMenuId;
  console.log("Rich Menu ID:", richMenuId);

  // 建立簡單色塊圖（2500x843 JPEG）— LINE 要求必須上傳圖片
  // 使用 1x1 不行，需要實際尺寸。改用 API 上傳最小 PNG 較複雜，改為提示手動上傳或跳過

  console.log("\n⚠️  Rich Menu 已建立，但需上傳圖片才會顯示。");
  console.log("請到 LINE Official Account Manager → Rich menus → 上傳 2500×843 圖片");
  console.log("或執行：node scripts/upload-rich-menu-image.mjs", richMenuId);

  const linkRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (linkRes.ok) {
    console.log("\n✅ 已設為預設 Rich Menu（所有好友可見，需有圖片）");
  } else {
    const linkErr = await linkRes.text();
    console.log("\n⚠️  設為預設選單:", linkRes.status, linkErr);
  }

  console.log("\n📱 同仁也可直接開啟 LIFF：");
  console.log("  打卡：", liffBase);
  console.log("  班表：", `${liffBase}?tab=schedule`);
  console.log("  薪資：", `${liffBase}?tab=payslip`);
}

main().catch(console.error);
