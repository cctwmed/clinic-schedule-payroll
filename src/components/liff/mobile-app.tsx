"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav, type MobileTab } from "@/components/liff/bottom-nav";
import { ClockHomeTab } from "@/components/liff/tabs/clock-home-tab";
import { ScheduleTab } from "@/components/liff/tabs/schedule-tab";
import { PayslipTab } from "@/components/liff/tabs/payslip-tab";

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
}

type InitPhase = "loading-sdk" | "init-liff" | "login" | "ready" | "error";

function readInitialTab(): MobileTab {
  if (typeof window === "undefined") return "clock";
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "schedule" || tab === "payslip" || tab === "clock") return tab;
  return "clock";
}

export function MobileApp({ liffId }: MobileAppProps) {
  const [tab, setTab] = useState<MobileTab>("clock");
  const [phase, setPhase] = useState<InitPhase>("loading-sdk");
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
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
          window.liff.login({ redirectUri: window.location.href });
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
      setError(err instanceof Error ? err.message : "LIFF 初始化失敗");
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
    if (window.liff) {
      setSdkReady(true);
      return;
    }
    const timer = setInterval(() => {
      if (window.liff) {
        clearInterval(timer);
        setSdkReady(true);
      }
    }, 100);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      if (!window.liff) {
        setPhase("error");
        setError("LIFF 載入逾時。請關閉視窗，從 LINE 官方帳號重新點連結開啟。");
      }
    }, 12000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [liffId, sdkReady]);

  const content = useMemo(() => {
    if (phase !== "ready" || !lineUserId) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          {phase === "error" ? (
            <>
              <p className="text-4xl">⚠️</p>
              <p className="text-sm font-medium text-red-600">{error}</p>
              <p className="text-xs text-slate-500">
                請確認是從「晴川診所-人事打卡專區」官方帳號內開啟連結，不要用外部瀏覽器。
              </p>
            </>
          ) : (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
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

    switch (tab) {
      case "schedule":
        return <ScheduleTab lineUserId={lineUserId} onGoBind={() => setTab("clock")} />;
      case "payslip":
        return <PayslipTab lineUserId={lineUserId} onGoBind={() => setTab("clock")} />;
      default:
        return (
          <ClockHomeTab
            lineUserId={lineUserId}
            displayName={displayName}
            liffId={liffId}
          />
        );
    }
  }, [tab, phase, lineUserId, displayName, liffId, error]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-gradient-to-b from-blue-50 to-slate-100 pb-24">
      {outsideLine && phase === "ready" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
          建議在 LINE App 內開啟，GPS 打卡較穩定
        </div>
      )}
      {content}
      {phase === "ready" && lineUserId && (
        <BottomNav active={tab} onChange={setTab} />
      )}
    </div>
  );
}

export function onLiffSdkLoaded() {
  if (typeof window !== "undefined" && window.liff) {
    window.dispatchEvent(new Event("liff-sdk-ready"));
  }
}
