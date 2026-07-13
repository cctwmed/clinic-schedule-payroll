"use client";

import Script from "next/script";
import { MobileApp, onLiffSdkLoaded } from "@/components/liff/mobile-app";

export default function LiffClockPage() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  return (
    <>
      {liffId ? (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={onLiffSdkLoaded}
          onError={() => {
            console.error("LIFF SDK 載入失敗");
          }}
        />
      ) : null}
      <MobileApp liffId={liffId} />
    </>
  );
}
