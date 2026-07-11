# 小型醫療診所排班支薪系統 — 架構設計

## 技術棧

| 層級 | 技術 | 用途 |
|------|------|------|
| 前端 / 後端 | Next.js 15 (App Router) | 管理後台、API Routes、Server Actions |
| UI | Tailwind CSS + shadcn/ui | 響應式管理介面 |
| 資料庫 | Supabase (PostgreSQL) | 主資料庫、RLS 權限 |
| 認證 | Supabase Auth | 管理員登入 |
| LINE | Messaging API + LIFF | 打卡、查班表、推播通知 |
| 部署 | Vercel + Supabase Cloud | 零維運、適合小型診所 |

## 檔案目錄結構

```
排班支薪系統/
├── docs/                              # 文件
│   ├── architecture.md                # 本文件
│   ├── database-schema.md             # Schema 說明（ER 圖、欄位說明）
│   └── labor-law-rules.md             # 勞基法合規規則詳細說明
│
├── supabase/
│   ├── migrations/                    # 資料庫 Migration
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql       # Row Level Security 政策
│   │   └── 003_seed_shift_types.sql   # 診所預設班別種子資料
│   ├── seed.sql                       # 開發用測試資料
│   └── config.toml
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── (auth)/                    # 登入相關（不需側欄）
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/               # 管理後台（需登入）
│   │   │   ├── layout.tsx             # 側欄 + 頂部導覽
│   │   │   ├── page.tsx               # Dashboard 總覽
│   │   │   ├── employees/             # 員工管理
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── schedules/             # 排班管理
│   │   │   │   ├── page.tsx           # 月曆班表
│   │   │   │   ├── [yearMonth]/page.tsx
│   │   │   │   └── swaps/page.tsx     # 換班審核
│   │   │   ├── clock-records/         # 打卡紀錄
│   │   │   │   └── page.tsx
│   │   │   ├── compliance/            # 勞基法合規
│   │   │   │   ├── page.tsx           # 違規列表
│   │   │   │   └── rules/page.tsx     # 規則設定
│   │   │   ├── payroll/               # 薪資管理
│   │   │   │   ├── page.tsx           # 薪資結算列表
│   │   │   │   ├── [runId]/page.tsx   # 單期薪資明細
│   │   │   │   └── settings/page.tsx  # 薪資設定
│   │   │   └── settings/              # 系統設定
│   │   │       ├── clinic/page.tsx    # 診所資訊、GPS 圍欄
│   │   │       ├── shifts/page.tsx    # 班別定義
│   │   │       └── line/page.tsx      # LINE Bot 設定
│   │   │
│   │   ├── liff/                      # LINE LIFF 頁面（員工端）
│   │   │   ├── clock/page.tsx         # 打卡頁（GPS + 時間）
│   │   │   ├── schedule/page.tsx      # 查詢個人班表
│   │   │   ├── swap/page.tsx          # 換班申請
│   │   │   └── layout.tsx
│   │   │
│   │   └── api/                       # API Routes
│   │       ├── line/
│   │       │   ├── webhook/route.ts   # LINE Webhook 接收
│   │       │   └── notify/route.ts    # 推播通知
│   │       ├── clock/route.ts         # 打卡 API
│   │       ├── schedules/route.ts
│   │       ├── compliance/
│   │       │   └── check/route.ts     # 手動觸發合規檢查
│   │       └── payroll/
│   │           └── calculate/route.ts # 薪資計算
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn/ui 基礎元件
│   │   ├── layout/                    # Sidebar, Header, Breadcrumb
│   │   ├── schedule/                  # 班表月曆、拖曳排班
│   │   ├── clock/                     # 打卡紀錄表格
│   │   ├── compliance/                # 違規警示 Badge、列表
│   │   └── payroll/                   # 薪資單預覽
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser client
│   │   │   ├── server.ts              # Server-side client
│   │   │   └── admin.ts               # Service role client
│   │   ├── line/
│   │   │   ├── client.ts              # LINE Messaging API
│   │   │   ├── liff.ts                # LIFF SDK 封裝
│   │   │   └── messages.ts            # Flex Message 模板
│   │   ├── compliance/                # 勞基法合規引擎 ★
│   │   │   ├── engine.ts              # 主檢查入口
│   │   │   ├── rules/
│   │   │   │   ├── daily-hours.ts
│   │   │   │   ├── weekly-hours.ts
│   │   │   │   ├── rest-between.ts
│   │   │   │   ├── weekly-rest.ts
│   │   │   │   ├── overtime-limit.ts
│   │   │   │   └── clock-anomaly.ts
│   │   │   └── types.ts
│   │   ├── payroll/                   # 薪資計算引擎 ★
│   │   │   ├── calculator.ts
│   │   │   ├── overtime.ts            # 加班費計算
│   │   │   ├── allowances.ts          # 津貼計算
│   │   │   └── types.ts
│   │   ├── geo/
│   │   │   └── haversine.ts           # GPS 距離計算
│   │   └── utils/
│   │       ├── date.ts                # 時區、日期工具
│   │       └── format.ts
│   │
│   ├── hooks/                         # React Hooks
│   │   ├── use-schedule.ts
│   │   ├── use-liff.ts
│   │   └── use-compliance-alerts.ts
│   │
│   └── types/                         # TypeScript 型別
│       ├── database.ts                # Supabase 自動生成型別
│       ├── schedule.ts
│       ├── clock.ts
│       ├── payroll.ts
│       └── compliance.ts
│
├── public/
│   └── liff/                          # LIFF 靜態資源
│
├── .env.local.example                 # 環境變數範本
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

## 模組關係圖

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  LINE LIFF  │────▶│  Clock API   │────▶│  clock_records  │
│  (員工打卡)  │     └──────────────┘     └────────┬────────┘
└─────────────┘                                    │
┌─────────────┐     ┌──────────────┐               │
│  管理後台    │────▶│  Schedule    │────▶ shift_assignments
│  (排班)     │     └──────┬───────┘               │
└─────────────┘            │                        │
                           ▼                        ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │  Compliance  │◀────│  合規引擎        │
                    │  Engine      │     │  (勞基法檢查)    │
                    └──────┬───────┘     └─────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     compliance_    LINE 推播     後台警示
     violations     通知         Dashboard
                           │
                           ▼
                    ┌──────────────┐
                    │  Payroll     │────▶ payroll_runs / items
                    │  Calculator  │
                    └──────────────┘
```

## 環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# LINE
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
NEXT_PUBLIC_LIFF_ID=

# App
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
CLINIC_GEO_LAT=25.0330
CLINIC_GEO_LNG=121.5654
CLINIC_GEO_RADIUS_M=200
```
