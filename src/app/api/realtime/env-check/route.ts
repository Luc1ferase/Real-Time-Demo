import { NextResponse } from "next/server";

/**
 * Cheap "is the server configured" probe used by the settings drawer.
 * Reads `process.env` directly — never touches the real env schema (so
 * it can't throw) and never makes an upstream call. Returns which
 * provider API keys are present without ever exposing the values.
 *
 * The drawer's provider selector calls this on mount to decide whether
 * to render a "needs API key" badge next to each provider.
 */
export async function GET() {
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const gemini = Boolean(process.env.GOOGLE_AI_STUDIO_KEY);
  return NextResponse.json({ openai, gemini });
}
