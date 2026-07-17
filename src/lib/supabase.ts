import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 建立伺服器端 Supabase Client。
 * RLS 收緊後必須使用 service role；勿再回退 anon（否則會讀不到員工／診所）。
 */
export function createSupabaseClient(): SupabaseClient {
  return createServiceClient();
}

/**
 * 伺服器端共用 Client（延遲建立，避免模組載入時尚未讀到環境變數）。
 * 使用 Proxy，既有 `supabase.from(...)` 呼叫方式不變。
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = createServiceClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
