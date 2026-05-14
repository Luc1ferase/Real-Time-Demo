import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import {
  GATE_COOKIE,
  GATE_COOKIE_MAX_AGE_SEC,
  deriveGateToken,
} from "@/lib/gate";

const bodySchema = z.object({
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const env = getServerEnv();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.data.password !== env.DEMO_PASSWORD) {
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  const token = await deriveGateToken(env.DEMO_PASSWORD);
  const next = parsed.data.next?.startsWith("/") ? parsed.data.next : "/";

  const res = NextResponse.json({ ok: true, next });
  res.cookies.set(GATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE_SEC,
  });
  return res;
}
