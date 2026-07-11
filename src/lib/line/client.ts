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

export function getLiffClockUrl(): string {
  const { liffId, appUrl } = getLineConfig();
  if (liffId) return `https://liff.line.me/${liffId}`;
  return `${appUrl}/liff/clock`;
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

/** 帶 LIFF 打卡按鈕的 Flex 訊息 */
export function buildClockInFlexMessage(liffUrl: string, employeeName?: string): LineFlexMessage {
  const greeting = employeeName ? `${employeeName}，請完成 GPS 打卡` : "請完成 GPS 打卡";

  return {
    type: "flex",
    altText: "今日打卡 — 開啟 LIFF 定位打卡",
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
            text: "需在診所 200 公尺內，系統會自動比對 GPS 與班表時間（早診 08:20、晚診 16:00）。",
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
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2563EB",
            action: {
              type: "uri",
              label: "開啟打卡頁面",
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
      text: "請選擇操作：",
      actions: [
        {
          type: "uri",
          label: "今日打卡",
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
