import { createServiceClient } from "@/lib/supabase/service";

/** 是否尚未建立任何管理員（Auth 使用者為 0） */
export async function needsAdminSetup(): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return (data.users?.length ?? 0) === 0;
  } catch {
    // service role 未設定時無法判斷，不開放網頁設定以免誤導
    return false;
  }
}

export async function createFirstAdmin(email: string, password: string) {
  if (!(await needsAdminSetup())) {
    return { success: false as const, error: "管理員帳號已存在，請至登入頁使用帳密登入" };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { success: false as const, error: "請填寫 Email" };
  }
  if (password.length < 8) {
    return { success: false as const, error: "密碼至少 8 字元" };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
  });

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, email: data.user?.email ?? trimmedEmail };
}
