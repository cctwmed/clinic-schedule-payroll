import { NextRequest, NextResponse } from "next/server";
import { applyClockRecordCorrection } from "@/lib/clock/correct-record";
import type { ClockType } from "@/lib/clock/session";

/** 主管手動修正打卡紀錄 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  const { clockedAt, clockType, note, correctedBy } = body as {
    clockedAt?: string;
    clockType?: ClockType;
    note?: string;
    correctedBy?: string;
  };

  if (!clockedAt || !clockType) {
    return NextResponse.json({ error: "請提供打卡時間與類型" }, { status: 400 });
  }

  const result = await applyClockRecordCorrection({
    recordId: id,
    clockedAt,
    clockType,
    note,
    correctedBy,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, record: result.record });
}
