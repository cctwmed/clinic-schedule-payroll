/**
 * 建立 Rich Menu 圖片並上傳（Windows 可用）
 * 執行：node scripts/upload-rich-menu.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
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

const liffBase = `https://liff.line.me/${liffId}`;

// 用 PowerShell 產生 2500×843 藍色 JPG
if (!existsSync(imgPath)) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 2500,843
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(37,99,235))
$font = New-Object System.Drawing.Font('Arial',48,[System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.DrawString('晴川診所 打卡選單', $font, $brush, 800, 380)
$bmp.Save('${imgPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $bmp.Dispose()
`;
  execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, "; ")}"`, {
    stdio: "inherit",
  });
}

const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "晴川診所打卡選單",
  chatBarText: "📍 打卡選單",
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

// LINE 要求 raw binary + Content-Type，不能用 multipart/form-data
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
console.log(linkRes.ok ? "✅ 已設為預設 Rich Menu（聊天室底部會出現選單）" : "⚠️ 設為預設失敗");

console.log("\n請在 LINE 重新開啟「晴川診所-人事打卡專區」，底部應出現「📍 打卡選單」");
