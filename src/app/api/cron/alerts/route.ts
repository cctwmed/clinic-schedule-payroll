import { NextRequest, NextResponse } from "next/server";
import { runClockAlerts } from "@/lib/alerts/engine";

/** 預警排程入口：可由 Vercel Cron 或手動觸發 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runClockAlerts();
    return NextResponse.json({
      ok: true,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      linePushEnabled: process.env.ENABLE_LINE_MISSED_CLOCK_PUSH !== "false",
      policy: "Web-First；漏打卡超過 2.5h 可選 LINE Push（每類型每日 1 則）",
      alerts: result.alerts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alert job failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
