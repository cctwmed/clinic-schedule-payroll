import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 建立伺服器端 Supabase Client。
 * RLS 收緊後必須使用 service role；勿再回退 anon（否則會讀不到員工／診所）。
 */
export function createSupabaseClient(): SupabaseClient {
  return createServiceClient();
}

/** 伺服器端共用 Client（API、Server Actions） */
export const supabase = createSupabaseClient();
