/**
 * 建立 Rich Menu 圖片並上傳（Windows 可用）
 * 執行：node scripts/upload-rich-menu.mjs
 *
 * 使用 2500×168 緊湊選單：聊天室底部一點即開 LIFF 打卡首頁
 */
import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

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
const liffId = env.NEXT_PUBLIC_LIFF_ID;
const imgPath = resolve(process.cwd(), "scripts", "richmenu-temp.jpg");

if (!token || !liffId) {
  console.error("❌ 缺少 LINE token 或 LIFF ID");
  process.exit(1);
}

const liffClockUrl = `https://liff.line.me/${liffId}`;

/** 每次重跑都重繪，避免沿用舊的小字圖 */
if (existsSync(imgPath)) {
  unlinkSync(imgPath);
}

// 2500×843 全幅選單：整列可點，直接開 LIFF 打卡首頁
const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 2500,843
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(37,99,235))
$titleFont = New-Object System.Drawing.Font('Microsoft JhengHei',120,[System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font('Microsoft JhengHei',64,[System.Drawing.FontStyle]::Regular)
$hintFont = New-Object System.Drawing.Font('Microsoft JhengHei',48,[System.Drawing.FontStyle]::Regular)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$title = '晴川診所'
$sub = '打卡首頁'
$hint = '點此進入 · 班表／薪資請進入後切換'
$titleSize = $g.MeasureString($title, $titleFont)
$subSize = $g.MeasureString($sub, $subFont)
$hintSize = $g.MeasureString($hint, $hintFont)
$g.DrawString($title, $titleFont, $brush, (2500 - $titleSize.Width) / 2, 180)
$g.DrawString($sub, $subFont, $brush, (2500 - $subSize.Width) / 2, 360)
$g.DrawString($hint, $hintFont, $brush, (2500 - $hintSize.Width) / 2, 520)
$bmp.Save('${imgPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $bmp.Dispose()
`;
execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, "; ")}"`, {
  stdio: "inherit",
});

const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "晴川診所打卡首頁",
  chatBarText: "📍 晴川診所 · 打卡首頁",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: "uri", label: "打卡首頁", uri: liffClockUrl },
    },
  ],
};

async function deleteOldDefaultMenus() {
  const listRes = await fetch("https://api.line.me/v2/bot/richmenu/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return;
  const { richmenus } = await listRes.json();
  for (const menu of richmenus ?? []) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

console.log("清除舊 Rich Menu…");
await deleteOldDefaultMenus();

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

const imageBuffer = readFileSync(imgPath);
const uploadRes = await fetch(
  `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
      "Content-Length": String(imageBuffer.length),
    },
    body: imageBuffer,
  }
);
if (!uploadRes.ok) {
  console.error("❌ 圖片上傳失敗:", await uploadRes.text());
  process.exit(1);
}
console.log("✅ 圖片上傳成功");

const linkRes = await fetch(
  `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
  { method: "POST", headers: { Authorization: `Bearer ${token}` } }
);
console.log(
  linkRes.ok
    ? "✅ 已設為預設 Rich Menu（底部一點即開打卡首頁）"
    : "⚠️ 設為預設失敗"
);

console.log("\n請重新開啟「晴川診所-人事打卡專區」，底部應顯示「📍 晴川診所 · 打卡首頁」");
