import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/async/with-timeout";

// 每次即時執行，不快取。
export const dynamic = "force-dynamic";

/**
 * 健康檢查 / 保溫端點。
 *
 * 用途：讓外部定時器（例如 UptimeRobot、cron-job.org）每隔幾分鐘 GET 一次，
 * 藉由一筆極輕量的查詢喚醒並維持 Supabase 免費方案與 Vercel 函式的「熱」狀態，
 * 避免閒置休眠造成使用者第一次開啟時緩慢或卡住。
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await withTimeout(
      supabase.from("clinics").select("id", { head: true, count: "exact" }),
      8000,
      "健康檢查查詢"
    );

    const latencyMs = Date.now() - startedAt;

    if (error) {
      return NextResponse.json(
        { ok: false, db: "error", latencyMs, message: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      db: "up",
      latencyMs,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "timeout",
        latencyMs: Date.now() - startedAt,
        message: err instanceof Error ? err.message : "健康檢查失敗",
      },
      { status: 503 }
    );
  }
}
