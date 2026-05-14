import { NextResponse } from "next/server";
import { z } from "zod";
import { getGateEnv } from "@/lib/env";
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
  // The gate must work even when provider keys are missing — it's the
  // entry point users hit before any provider is selected. Validate only
  // DEMO_PASSWORD here, surface a 503 with a helpful detail on misconfig
  // (previously this bubbled as an opaque 500 when any other key was
  // unset).
  let env: ReturnType<typeof getGateEnv>;
  try {
    env = getGateEnv();
  } catch (err) {
    return NextResponse.json(
      {
        error: "missing_env",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

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
