import { NextRequest, NextResponse } from "next/server";
import { createFirstAdmin } from "@/lib/auth/setup";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    const result = await createFirstAdmin(email, password);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, email: result.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "建立失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
