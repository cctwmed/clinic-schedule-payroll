import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line/signature";
import {
  buildClockInFlexMessage,
  buildClockQuickReply,
  getLineConfig,
  getLiffClockUrl,
  replyLineMessage,
} from "@/lib/line/client";
import { supabase } from "@/lib/supabase";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
}

const CLOCK_KEYWORDS = ["打卡", "今日打卡", "上班打卡", "下班打卡", "上班", "下班"];

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

      if (CLOCK_KEYWORDS.some((k) => text.includes(k))) {
        const employeeName = userId ? await getBoundEmployeeName(userId) : undefined;
        await replyLineMessage(event.replyToken, [
          buildClockInFlexMessage(liffUrl, employeeName),
        ]);
      } else if (text === "我的班表") {
        await handleScheduleQuery(event.replyToken, userId);
      } else if (text === "選單" || text === "help" || text === "說明") {
        await replyLineMessage(event.replyToken, [
          buildClockQuickReply(liffUrl),
          {
            type: "text",
            text: [
              "可用指令：",
              "・今日打卡 — GPS 定位打卡（需在診所 200m 內）",
              "・我的班表 — 查詢今日排班",
              "",
              `LIFF 打卡頁：${liffUrl}`,
            ].join("\n"),
          },
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
      await replyLineMessage(event.replyToken, [
        {
          type: "text",
          text: [
            "歡迎加入診所排班支薪系統！",
            "",
            "📍 輸入「今日打卡」即可開啟 GPS 定位打卡",
            "📅 輸入「我的班表」查詢今日排班",
            "",
            `或直接開啟：${liffUrl}`,
          ].join("\n"),
        },
        buildClockQuickReply(liffUrl),
      ]);
    }
  }

  return NextResponse.json({ ok: true });
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
    .select("expected_clock_in, expected_clock_out, shift_types(name, code)")
    .eq("employee_id", binding.employee_id)
    .eq("work_date", today)
    .neq("status", "cancelled")
    .order("expected_clock_in");

  const name = getEmployeeName(binding.employees) ?? "同仁";
  const workShifts = (assignments ?? []).filter((a) => {
    const st = a.shift_types as unknown;
    const code = Array.isArray(st)
      ? (st[0] as { code?: string })?.code
      : (st as { code?: string } | null)?.code;
    return code && !["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(code);
  });

  if (!workShifts.length) {
    await replyLineMessage(replyToken, [
      { type: "text", text: `${name}，今日（${today}）沒有出勤班別。` },
    ]);
    return;
  }

  const lines = workShifts.map((a) => {
    const st = a.shift_types as unknown;
    const shiftName = Array.isArray(st)
      ? (st[0] as { name?: string })?.name
      : (st as { name?: string } | null)?.name;
    return `${shiftName ?? "班別"} ${String(a.expected_clock_in).slice(0, 5)}–${String(a.expected_clock_out).slice(0, 5)}`;
  });

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: [`${name}，今日（${today}）班表：`, ...lines, "", "打卡請輸入「今日打卡」"].join("\n"),
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
