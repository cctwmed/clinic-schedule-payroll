const LINE_API = "https://api.line.me/v2/bot";

export interface LineTextMessage {
  type: "text";
  text: string;
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export interface LineTemplateMessage {
  type: "template";
  altText: string;
  template: Record<string, unknown>;
}

export type LineReplyMessage = LineTextMessage | LineFlexMessage | LineTemplateMessage;

export function getLineConfig() {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return { accessToken, channelSecret, liffId, appUrl };
}

export function getLiffClockUrl(action?: "clock_in" | "clock_out"): string {
  const { liffId, appUrl } = getLineConfig();
  const query = action ? `?action=${action}` : "";
  if (liffId) return `https://liff.line.me/${liffId}${query}`;
  return `${appUrl}/liff/clock${query}`;
}

export async function pushLineMessage(
  lineUserId: string,
  messages: LineReplyMessage[]
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken } = getLineConfig();
  if (!accessToken) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
  }

  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: body || res.statusText };
  }

  return { ok: true };
}

export async function replyLineMessage(
  replyToken: string,
  messages: LineReplyMessage[]
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken } = getLineConfig();
  if (!accessToken) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
  }

  const res = await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: body || res.statusText };
  }

  return { ok: true };
}

/** 帶 LIFF 打卡按鈕的 Flex 訊息（上班／下班分開） */
export function buildClockInFlexMessage(
  liffUrl: string,
  employeeName?: string,
  preferredAction?: "clock_in" | "clock_out"
): LineFlexMessage {
  const greeting = employeeName ? `${employeeName}，請完成 GPS 打卡` : "請完成 GPS 打卡";
  const clockInUrl = getLiffClockUrl("clock_in");
  const clockOutUrl = getLiffClockUrl("clock_out");
  const hint =
    preferredAction === "clock_out"
      ? "系統偵測您可能需要下班打卡，請點選下方按鈕。"
      : preferredAction === "clock_in"
        ? "系統偵測您可能需要上班打卡，請點選下方按鈕。"
        : "請選擇上班或下班，需在診所 200 公尺內完成 GPS 定位。";

  return {
    type: "flex",
    altText: "今日打卡 — 上班／下班 GPS 定位打卡",
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📍 今日打卡",
            weight: "bold",
            color: "#FFFFFF",
            size: "lg",
          },
        ],
        backgroundColor: "#2563EB",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: greeting,
            wrap: true,
            size: "sm",
            color: "#334155",
          },
          {
            type: "text",
            text: hint,
            wrap: true,
            size: "xs",
            color: "#64748B",
          },
          {
            type: "text",
            text: "早診 08:20、晚診 16:00 到班；雙診日需分別打上班／下班。",
            wrap: true,
            size: "xs",
            color: "#64748B",
          },
        ],
        paddingAll: "16px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2563EB",
            action: {
              type: "uri",
              label: "🟢 上班打卡",
              uri: clockInUrl,
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "🔴 下班打卡",
              uri: clockOutUrl,
            },
          },
          {
            type: "button",
            style: "link",
            action: {
              type: "uri",
              label: "開啟完整打卡頁",
              uri: liffUrl,
            },
          },
        ],
        paddingAll: "12px",
      },
    },
  };
}

/** 快速回覆按鈕（文字觸發用） */
export function buildClockQuickReply(liffUrl: string): LineTemplateMessage {
  return {
    type: "template",
    altText: "今日打卡",
    template: {
      type: "buttons",
      text: "請選擇打卡操作：",
      actions: [
        {
          type: "uri",
          label: "🟢 上班打卡",
          uri: getLiffClockUrl("clock_in"),
        },
        {
          type: "uri",
          label: "🔴 下班打卡",
          uri: getLiffClockUrl("clock_out"),
        },
        {
          type: "uri",
          label: "完整打卡頁",
          uri: liffUrl,
        },
        {
          type: "message",
          label: "我的班表",
          text: "我的班表",
        },
      ],
    },
  };
}

export function buildSchedulePublishedMessage(
  employeeName: string,
  year: number,
  month: number,
  shiftSummary: string
): LineTextMessage {
  const liffUrl = getLiffClockUrl();
  return {
    type: "text",
    text: [
      `📅 ${employeeName} 您好，${year} 年 ${month} 月班表已確認發布！`,
      "",
      shiftSummary || "（本月尚無排班紀錄）",
      "",
      "如需打卡請輸入「今日打卡」或點選：",
      liffUrl,
    ].join("\n"),
  };
}

export function buildClockReminderMessage(employeeName: string, reason: string): LineTextMessage {
  const liffUrl = getLiffClockUrl();
  return {
    type: "text",
    text: [`⏰ ${employeeName}，系統提醒：${reason}`, "", `立即打卡：${liffUrl}`].join("\n"),
  };
}
