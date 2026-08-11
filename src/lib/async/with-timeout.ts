/**
 * 為任意 Promise / Supabase 查詢加上逾時保護。
 *
 * Supabase 免費方案閒置後會休眠，冷啟動或網路異常時查詢可能長時間不回應，
 * 導致伺服器端頁面「永遠轉圈打不開」。用逾時把「卡住」轉成「快速失敗」，
 * 讓頁面能改為顯示錯誤訊息而不是無限等待。
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = "資料庫查詢"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}逾時（超過 ${Math.round(ms / 1000)} 秒未回應）`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 與 withTimeout 相同，但逾時或錯誤時回傳預設值而非拋出例外。
 * 適合「拿不到就當空值、頁面仍要正常渲染」的情境。
 */
export async function withTimeoutFallback<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: T,
  label = "資料庫查詢"
): Promise<T> {
  try {
    return await withTimeout(promise, ms, label);
  } catch {
    return fallback;
  }
}
