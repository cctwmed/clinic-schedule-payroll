const COOKIE_NAME = "liff_admin_dash";
const encoder = new TextEncoder();

export const LIFF_ADMIN_COOKIE = COOKIE_NAME;
export const LIFF_ADMIN_QUERY = "liff_admin";

function getSecret(): string {
  return (
    process.env.LIFF_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "dev-liff-admin"
  );
}

function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(value: string): Uint8Array {
  const pad = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toB64Url(sig);
}

export async function createLiffAdminToken(
  lineUserId: string,
  ttlSec = 12 * 3600
): Promise<string> {
  const payload = JSON.stringify({
    u: lineUserId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  });
  const body = toB64Url(encoder.encode(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifyLiffAdminToken(
  token: string | null | undefined
): Promise<{ lineUserId: string } | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  if (expected !== sig) return null;
  try {
    const json = new TextDecoder().decode(fromB64Url(body));
    const parsed = JSON.parse(json) as { u?: string; exp?: number };
    if (!parsed.u || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { lineUserId: parsed.u };
  } catch {
    return null;
  }
}

export function liffAdminCookieOptions(maxAgeSec = 12 * 3600) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
    secure: process.env.NODE_ENV === "production",
  };
}
