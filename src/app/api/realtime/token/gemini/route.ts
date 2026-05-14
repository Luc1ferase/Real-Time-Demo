import { NextResponse } from "next/server";
import { getGeminiEnv } from "@/lib/env";

/**
 * Gemini Live has no ephemeral-token concept (research/gemini-live-api.md
 * section "Auth model"). This endpoint returns the raw API key for browser
 * consumption. It is acceptable only because the demo gate proxy gates the
 * entire app — a production deployment must proxy the WebSocket instead.
 */

const TTL_SEC = 60 * 60; // 1h — Gemini sessions don't outlive this window.

export async function POST() {
  // Only GOOGLE_AI_STUDIO_KEY is required for this route. Surface a 503
  // on misconfig so the UI can render a "missing env" notice rather than
  // a generic 500.
  let env: ReturnType<typeof getGeminiEnv>;
  try {
    env = getGeminiEnv();
  } catch (err) {
    return NextResponse.json(
      {
        error: "missing_env",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    key: env.GOOGLE_AI_STUDIO_KEY,
    expires_at: Math.floor(Date.now() / 1000) + TTL_SEC,
  });
}
