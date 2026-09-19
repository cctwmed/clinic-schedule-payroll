import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LIFF_ADMIN_COOKIE,
  LIFF_ADMIN_QUERY,
  liffAdminCookieOptions,
  verifyLiffAdminToken,
} from "@/lib/auth/liff-dashboard-session";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/setup") ||
    path.startsWith("/auth") ||
    path.startsWith("/liff") ||
    path.startsWith("/api");

  const queryToken = request.nextUrl.searchParams.get(LIFF_ADMIN_QUERY);
  const cookieToken = request.cookies.get(LIFF_ADMIN_COOKIE)?.value;
  const liffAdmin =
    (await verifyLiffAdminToken(queryToken)) ||
    (await verifyLiffAdminToken(cookieToken));

  if (queryToken && liffAdmin) {
    // Keep the token in the URL: LINE in-app browsers often drop cookies.
    supabaseResponse.cookies.set(
      LIFF_ADMIN_COOKIE,
      queryToken,
      liffAdminCookieOptions()
    );
  }

  if (!user && !liffAdmin && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") {
      url.searchParams.set("redirect", path);
    }
    return NextResponse.redirect(url);
  }

  if (user && (path.startsWith("/login") || path.startsWith("/setup"))) {
    const redirect = request.nextUrl.searchParams.get("redirect") || "/";
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  if (liffAdmin && !user && (path.startsWith("/login") || path.startsWith("/setup"))) {
    const redirect = request.nextUrl.searchParams.get("redirect") || "/schedules";
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
