"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MobileTab } from "@/components/liff/bottom-nav";
import type { LiffMode } from "@/components/liff/mode-switcher";
import { SubPageHeader } from "@/components/liff/sub-page-header";
import { ClockHomeTab } from "@/components/liff/tabs/clock-home-tab";

const ScheduleTab = dynamic(
  () => import("@/components/liff/tabs/schedule-tab").then((m) => m.ScheduleTab),
  { loading: () => <TabLoading label="班表" /> }
);
const PayslipTab = dynamic(
  () => import("@/components/liff/tabs/payslip-tab").then((m) => m.PayslipTab),
  { loading: () => <TabLoading label="薪資" /> }
);
const LeaveTab = dynamic(
  () => import("@/components/liff/tabs/leave-tab").then((m) => m.LeaveTab),
  { loading: () => <TabLoading label="請假" /> }
);
const RecordsTab = dynamic(
  () => import("@/components/liff/tabs/records-tab").then((m) => m.RecordsTab),
  { loading: () => <TabLoading label="紀錄" /> }
);
const ForgotClockTab = dynamic(
  () => import("@/components/liff/tabs/forgot-clock-tab").then((m) => m.ForgotClockTab),
  { loading: () => <TabLoading label="忘記打卡" /> }
);

function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      <p className="text-sm text-slate-500">載入{label}…</p>
    </div>
  );
}

declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (config?: { redirectUri?: string }) => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      closeWindow: () => void;
      isInClient: () => boolean;
      getOS: () => string;
    };
  }
}

interface MobileAppProps {
  liffId?: string;
  appUrl?: string;
}

type InitPhase = "loading-sdk" | "init-liff" | "login" | "ready" | "error";

const SUB_PAGE_TITLES: Partial<Record<MobileTab, string>> = {
  schedule: "我的班表",
  payslip: "我的薪資",
  leave: "我要請假",
  records: "出勤紀錄",
  forgot: "忘記打卡",
};

function readInitialTab(): MobileTab {
  if (typeof window === "undefined") return "clock";
  const tab = new URLSearchParams(window.location.search).get("tab");
  const allowed: MobileTab[] = [
    "clock",
    "schedule",
    "payslip",
    "leave",
    "records",
    "forgot",
  ];
  if (tab && allowed.includes(tab as MobileTab)) return tab as MobileTab;
  return "clock";
}

function buildLiffRedirectUri(): string {
  const url = new URL(`${window.location.origin}/liff/clock`);
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const tab = params.get("tab");
  if (action === "clock_in" || action === "clock_out") {
    url.searchParams.set("action", action);
  }
  if (tab && tab !== "clock") {
    url.searchParams.set("tab", tab);
  }
  return url.toString();
}

export function MobileApp({ liffId, appUrl }: MobileAppProps) {
  const [mode, setMode] = useState<LiffMode>("employee");
  const [tab, setTab] = useState<MobileTab>("clock");
  const [phase, setPhase] = useState<InitPhase>("loading-sdk");
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isClinicAdmin, setIsClinicAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outsideLine, setOutsideLine] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  const initLiff = useCallback(async () => {
    setPhase("init-liff");
    setError(null);

    try {
      if (liffId && window.liff) {
        await window.liff.init({ liffId });

        if (!window.liff.isInClient()) {
          setOutsideLine(true);
        }

        if (!window.liff.isLoggedIn()) {
          setPhase("login");
          window.liff.login({ redirectUri: buildLiffRedirectUri() });
          return;
        }

        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        setDisplayName(profile.displayName);
      } else if (!liffId) {
        setLineUserId("demo-user-local");
        setDisplayName("測試使用者");
      } else {
        throw new Error("LIFF SDK 尚未載入");
      }

      setPhase("ready");
    } catch (err) {
      setPhase("error");
      const msg = err instanceof Error ? err.message : "LIFF 初始化失敗";
      if (/developer|developing|400/i.test(msg)) {
        setError(
          "LINE Channel 仍為「開發中」，一般使用者無法開啟。請管理員到 LINE Developers 將 Channel 2010558215 改為「已發布」，或將您的 LINE 加為 Tester。"
        );
      } else {
        setError(msg);
      }
    }
  }, [liffId]);

  useEffect(() => {
    setTab(readInitialTab());
  }, []);

  useEffect(() => {
    if (!liffId) {
      initLiff();
      return;
    }
    if (!sdkReady) return;
    initLiff();
  }, [initLiff, liffId, sdkReady]);

  useEffect(() => {
    if (!liffId || sdkReady) return;
    const onSdkReady = () => setSdkReady(true);
    window.addEventListener("liff-sdk-ready", onSdkReady);
    if (window.liff) {
      setSdkReady(true);
      return () => window.removeEventListener("liff-sdk-ready", onSdkReady);
    }
    const timer = setInterval(() => {
      if (window.liff) {
        clearInterval(timer);
        setSdkReady(true);
      }
    }, 50);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      if (!window.liff) {
        setPhase("error");
        setError(
          "LIFF 載入逾時。請改在官方帳號聊天室輸入「今日打卡」，或點選回覆訊息中的連結。"
        );
      }
    }, 8000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener("liff-sdk-ready", onSdkReady);
    };
  }, [liffId, sdkReady]);

  useEffect(() => {
    if (phase !== "ready" || !lineUserId) return;
    fetch(`/api/mobile/me?lineUserId=${encodeURIComponent(lineUserId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setIsClinicAdmin(Boolean(data.isClinicAdmin));
      })
      .catch(() => {});
  }, [phase, lineUserId]);

  useEffect(() => {
    if (!isClinicAdmin && mode === "admin") setMode("employee");
  }, [isClinicAdmin, mode]);

  const goHome = () => setTab("clock");
  const goBind = () => setTab("clock");

  const content = useMemo(() => {
    if (phase !== "ready" || !lineUserId) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          {phase === "error" ? (
            <>
              <p className="text-4xl">⚠️</p>
              <p className="text-sm font-medium text-red-600">{error}</p>
              <p className="text-xs text-slate-500">
                請在「晴川診所-人事打卡專區」聊天室輸入「今日打卡」取得連結。
              </p>
              <a
                href={
                  liffId
                    ? `https://liff.line.me/${liffId}`
                    : "https://clinic-schedule-payroll.vercel.app/liff/clock"
                }
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white"
              >
                直接開啟打卡頁
              </a>
            </>
          ) : (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-slate-500">
                {phase === "login"
                  ? "正在登入 LINE…"
                  : phase === "init-liff"
                    ? "正在連線打卡系統…"
                    : "載入中…"}
              </p>
            </>
          )}
        </div>
      );
    }

    if (tab === "clock") {
      return (
        <ClockHomeTab
          lineUserId={lineUserId}
          displayName={displayName}
          liffId={liffId}
          appUrl={appUrl}
          isClinicAdmin={isClinicAdmin}
          mode={mode}
          onModeChange={setMode}
          onNavigate={setTab}
        />
      );
    }

    const subTitle = SUB_PAGE_TITLES[tab] ?? "功能";
    const subPage = (() => {
      switch (tab) {
        case "schedule":
          return <ScheduleTab lineUserId={lineUserId} onGoBind={goBind} />;
        case "payslip":
          return <PayslipTab lineUserId={lineUserId} onGoBind={goBind} />;
        case "leave":
          return <LeaveTab lineUserId={lineUserId} onGoBind={goBind} onBack={goHome} />;
        case "records":
          return <RecordsTab lineUserId={lineUserId} onGoBind={goBind} onBack={goHome} />;
        case "forgot":
          return <ForgotClockTab lineUserId={lineUserId} onGoBind={goBind} onBack={goHome} />;
        default:
          return null;
      }
    })();

    return (
      <div className="px-4 pb-8 pt-2">
        <SubPageHeader title={subTitle} onBack={goHome} />
        {subPage}
      </div>
    );
  }, [tab, mode, phase, lineUserId, displayName, liffId, error, appUrl, isClinicAdmin]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-gradient-to-b from-sky-50 via-slate-50 to-slate-100">
      {outsideLine && phase === "ready" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
          建議在 LINE App 內開啟，GPS 打卡較穩定
        </div>
      )}
      {content}
    </div>
  );
}

export function onLiffSdkLoaded() {
  if (typeof window !== "undefined" && window.liff) {
    window.dispatchEvent(new Event("liff-sdk-ready"));
  }
}
