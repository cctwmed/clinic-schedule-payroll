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
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      closeWindow: () => void;
      isInClient: () => boolean;
    };
  }
}

interface MobileAppProps {
  liffId?: string;
}

export function MobileApp({ liffId }: MobileAppProps) {
  const [tab, setTab] = useState<MobileTab>("clock");
  const [ready, setReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const initLiff = useCallback(async () => {
    try {
      if (liffId && window.liff) {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return;
        }
        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        setDisplayName(profile.displayName);
      } else {
        setLineUserId("demo-user-local");
        setDisplayName("測試使用者");
      }
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LIFF 初始化失敗");
    }
  }, [liffId]);

  useEffect(() => {
    if (!liffId) {
      initLiff();
      return;
    }
    if (window.liff) {
      initLiff();
      return;
    }
    const timer = setInterval(() => {
      if (window.liff) {
        clearInterval(timer);
        initLiff();
      }
    }, 150);
    return () => clearInterval(timer);
  }, [initLiff, liffId]);

  const content = useMemo(() => {
    if (!ready || !lineUserId) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          {error ?? "載入中…"}
        </div>
      );
    }

    switch (tab) {
      case "schedule":
        return <ScheduleTab lineUserId={lineUserId} />;
      case "payslip":
        return <PayslipTab lineUserId={lineUserId} />;
      default:
        return (
          <ClockHomeTab
            lineUserId={lineUserId}
            displayName={displayName}
            liffId={liffId}
          />
        );
    }
  }, [tab, ready, lineUserId, displayName, liffId, error]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-gradient-to-b from-blue-50 to-slate-100 pb-24">
      {content}
      {ready && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
