export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function isLineWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && window.liff?.isInClient?.()) return true;
  return /Line\//i.test(navigator.userAgent);
}

function toDeviceLocation(pos: GeolocationPosition): DeviceLocation {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/**
 * LINE Android WebView 有時成功／失敗回呼都不會來，單靠瀏覽器 timeout 會一直「定位中」。
 * 加上自己的逾時保險。
 */
function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const limit = (options.timeout ?? 15_000) + 2_000;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({ code: 3, message: "Timeout" });
    }, limit);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(pos);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      },
      options
    );
  });
}

/** Android WebView 上 watchPosition 有時比 getCurrentPosition 穩 */
function watchFirstFix(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchId = 0;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject({ code: 3, message: "Timeout" }));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => finish(() => resolve(pos)),
      (err) => finish(() => reject(err)),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** 將瀏覽器／LINE WebView 的定位錯誤轉成可操作的中文說明 */
export function explainGeolocationError(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? Number((err as { code?: number }).code)
      : NaN;
  const android = isAndroid();

  if (code === 1) {
    return android
      ? "定位權限被拒絕。請到手機「設定 → 應用程式 → LINE → 權限 → 位置」改為「允許」，並開啟「使用精確位置」。回到打卡頁再按「重新定位」。若仍不行，請改用下方「用 Chrome 開啟」。"
      : "定位權限被拒絕。請到手機「設定 → LINE → 位置」改為「使用 App 期間」，再按「重新定位」。";
  }
  if (code === 2) {
    return android
      ? "目前無法取得位置。請開啟「設定 → 位置資訊」，並打開 Google「提升定位精確度」，再到診所現場按「重新定位」。"
      : "目前無法取得位置（訊號不足）。請打開手機定位、走到室外或窗邊後再按「重新定位」。";
  }
  if (code === 3) {
    return android
      ? "定位逾時。LINE 內建瀏覽器在 Android 上常抓不到 GPS。請再按「重新定位」，或改用「用 Chrome 開啟」。"
      : "定位逾時。請確認已開啟定位，並在診所現場再按「重新定位」。";
  }
  if (typeof navigator !== "undefined" && !navigator.geolocation) {
    return "此裝置或瀏覽器不支援定位。請用手機 LINE App 開啟打卡頁。";
  }
  return err instanceof Error ? err.message : "定位失敗，請再按「重新定位」。";
}

export function shouldOfferExternalBrowser(): boolean {
  return isAndroid() && isLineWebView();
}

/**
 * 向裝置要目前位置。
 * Android／LINE：先高精度，再一般定位，最後用 watchPosition（WebView 較常見能成功）。
 */
export async function requestCurrentPosition(): Promise<DeviceLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw { code: 0, message: "此裝置或瀏覽器不支援定位" };
  }

  const attempts: PositionOptions[] = isAndroid()
    ? [
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 },
      ]
    : [
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
        { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
      ];

  let lastError: unknown = null;
  for (const options of attempts) {
    try {
      return toDeviceLocation(await getPosition(options));
    } catch (err) {
      lastError = err;
      const code =
        err && typeof err === "object" && "code" in err
          ? Number((err as { code?: number }).code)
          : NaN;
      if (code === 1) throw err;
    }
  }

  if (isAndroid()) {
    try {
      return toDeviceLocation(await watchFirstFix(25_000));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? { code: 3, message: "Timeout" };
}

/** 用系統瀏覽器（Chrome）開啟打卡頁，避開 LINE Android 內建瀏覽器定位限制 */
export function openClockInExternalBrowser(liffId?: string, appUrl?: string): void {
  if (typeof window === "undefined") return;
  const url = liffId
    ? `https://liff.line.me/${liffId}`
    : `${(appUrl ?? window.location.origin).replace(/\/$/, "")}/liff/clock`;

  try {
    if (window.liff && typeof window.liff.openWindow === "function") {
      window.liff.openWindow({ url, external: true });
      return;
    }
  } catch {
    // fall through
  }
  window.open(url, "_blank", "noopener,noreferrer") ?? window.location.assign(url);
}
