import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

/**
 * 伺服器端專用 Supabase Client（service role，略過 RLS）。
 * 僅用於 API Routes、Server Actions；切勿暴露至瀏覽器。
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceKey) {
    throw new Error(
      "缺少 SUPABASE_SERVICE_ROLE_KEY。請至 Supabase 專案 Settings → API 複製 service_role 金鑰，並加入 Vercel / .env.local"
    );
  }

  if (!serviceClient) {
    serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return serviceClient;
}
