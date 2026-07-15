import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line/signature";
import {
  buildClockInFlexMessage,
  buildWelcomeTextMessage,
  getLineConfig,
  getLiffClockUrl,
  replyLineMessage,
} from "@/lib/line/client";
import { supabase } from "@/lib/supabase";
import {
  buildShiftClockStatuses,
  buildShiftStatusSummaryLine,
} from "@/lib/clock/shift-status";
import type { ExistingClock, WorkAssignment } from "@/lib/clock/session";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
}

const CLOCK_OUT_KEYWORDS = ["下班打卡", "下班"];
const CLOCK_IN_KEYWORDS = ["上班打卡", "上班"];
const CLOCK_GENERIC_KEYWORDS = ["打卡", "今日打卡"];

function resolveClockKeyword(text: string): "clock_in" | "clock_out" | undefined {
  if (CLOCK_OUT_KEYWORDS.some((k) => text.includes(k))) return "clock_out";
  if (CLOCK_IN_KEYWORDS.some((k) => text.includes(k))) return "clock_in";
  return undefined;
}

function isClockKeyword(text: string): boolean {
  return (
    CLOCK_OUT_KEYWORDS.some((k) => text.includes(k)) ||
    CLOCK_IN_KEYWORDS.some((k) => text.includes(k)) ||
    CLOCK_GENERIC_KEYWORDS.some((k) => text.includes(k))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  const { channelSecret } = getLineConfig();

  if (channelSecret && !verifyLineSignature(body, signature, channelSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { events: LineEvent[] };
  const liffUrl = getLiffClockUrl();

  for (const event of payload.events ?? []) {
    if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
      const text = event.message.text?.trim() ?? "";
      const userId = event.source?.userId;

      if (isClockKeyword(text)) {
        const employeeName = userId ? await getBoundEmployeeName(userId) : undefined;
        const preferredAction = resolveClockKeyword(text);
        await replyWithClockGuide(event.replyToken, liffUrl, employeeName, preferredAction);
      } else if (text === "我的班表") {
        await handleScheduleQuery(event.replyToken, userId);
      } else if (text.includes("請假") || text === "我要請假") {
        await replyLineMessage(event.replyToken, [
          {
            type: "text",
            text: `請點連結申請特休：\n${getLiffClockUrl(undefined, "leave")}`,
          },
        ]);
      } else if (text.includes("忘記打卡") || text.includes("補登")) {
        await replyLineMessage(event.replyToken, [
          {
            type: "text",
            text: `請點連結送出補登申請，管理員審核後補登：\n${getLiffClockUrl(undefined, "forgot")}`,
          },
        ]);
      } else if (text === "選單" || text === "help" || text === "說明") {
        await replyWithClockGuide(event.replyToken, liffUrl);
      } else if (text.length > 0) {
        // 任意文字皆回覆指引，避免聊天室看起來「完全沒反應」
        await replyLineMessage(event.replyToken, [
          buildWelcomeTextMessage(liffUrl),
        ]);
      }
    }

    if (event.type === "postback" && event.replyToken) {
      const data = event.postback?.data ?? "";
      if (data === "action=clock" || data.startsWith("clock")) {
        const userId = event.source?.userId;
        const employeeName = userId ? await getBoundEmployeeName(userId) : undefined;
        await replyLineMessage(event.replyToken, [
          buildClockInFlexMessage(liffUrl, employeeName),
        ]);
      }
    }

    if (event.type === "follow" && event.replyToken) {
      await replyLineMessage(event.replyToken, [buildWelcomeTextMessage(liffUrl)]);
    }
  }

  return NextResponse.json({ ok: true });
}

/** 先送純文字（必達）；Flex 按鈕需 Channel 已發布才穩定 */
async function replyWithClockGuide(
  replyToken: string,
  liffUrl: string,
  employeeName?: string,
  preferredAction?: "clock_in" | "clock_out"
) {
  const result = await replyLineMessage(replyToken, [
    buildWelcomeTextMessage(liffUrl, employeeName, preferredAction),
  ]);
  if (!result.ok) {
    console.error("[LINE webhook] reply failed:", result.error);
  }
}

async function getBoundEmployeeName(lineUserId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("employee_line_bindings")
    .select("employees(name)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  return getEmployeeName(data?.employees);
}

async function handleScheduleQuery(replyToken: string, lineUserId?: string) {
  if (!lineUserId) return;

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(name)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!binding) {
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: `您尚未綁定員工身份，請先開啟打卡頁面完成綁定：\n${getLiffClockUrl()}`,
      },
    ]);
    return;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: assignments } = await supabase
    .from("shift_assignments")
    .select("id, expected_clock_in, expected_clock_out, shift_types(name, code)")
    .eq("employee_id", binding.employee_id)
    .eq("work_date", today)
    .neq("status", "cancelled")
    .order("expected_clock_in");

  const name = getEmployeeName(binding.employees) ?? "同仁";
  const mapped: WorkAssignment[] = (assignments ?? [])
    .map((a) => {
      const st = a.shift_types as unknown;
      const item = Array.isArray(st) ? st[0] : st;
      const code = (item as { code?: string } | null)?.code ?? "";
      const shiftName = (item as { name?: string } | null)?.name ?? "班別";
      if (["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(code)) return null;
      return {
        id: String(a.id),
        expected_clock_in: String(a.expected_clock_in),
        expected_clock_out: String(a.expected_clock_out),
        shift_code: code,
        shift_name: shiftName,
      };
    })
    .filter((a): a is WorkAssignment => a != null);

  if (!mapped.length) {
    await replyLineMessage(replyToken, [
      { type: "text", text: `${name}，今日（${today}）沒有出勤班別。` },
    ]);
    return;
  }

  const { data: clocks } = await supabase
    .from("clock_records")
    .select("id, assignment_id, clock_type, clocked_at, is_late, late_minutes")
    .eq("employee_id", binding.employee_id)
    .eq("clock_date", today)
    .order("clocked_at");

  const shiftStatuses = buildShiftClockStatuses(
    mapped,
    (clocks ?? []) as ExistingClock[]
  );

  const lines = shiftStatuses.map((s) => buildShiftStatusSummaryLine(s, shiftStatuses.length));
  const doneCount = shiftStatuses.filter((s) => s.phase === "done").length;

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: [
        `${name}，今日（${today}）共 ${shiftStatuses.length} 診 · 已完成 ${doneCount}`,
        "",
        ...lines,
        "",
        "輸入「上班」或「下班」可快速打卡",
      ].join("\n"),
    },
  ]);
}

export async function GET() {
  return NextResponse.json({
    status: "LINE Webhook is running",
    liffUrl: getLiffClockUrl(),
    endpoints: {
      webhook: "/api/line/webhook",
      clock: "/api/clock",
      liff: "/liff/clock",
    },
  });
}

function getEmployeeName(employees: unknown): string | undefined {
  if (Array.isArray(employees)) {
    return (employees[0] as { name?: string })?.name;
  }
  return (employees as { name?: string } | null)?.name;
}
