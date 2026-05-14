import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { LANGUAGE_CODES } from "@/lib/translator/languages";

/**
 * Mint an ephemeral client secret for a translation session.
 *
 * Note: this is structurally similar to
 * `/api/realtime/token/openai/route.ts`, but the upstream session
 * shape is materially different — `session.type` is "translation" (not
 * "realtime"), there is no voice/instructions/tools field, and the
 * model is hardcoded to `gpt-realtime-translate`. The translator runs
 * outside the multi-provider abstraction by design (see
 * `research/translator-session-shape.md`).
 */

const TARGET_LANGUAGES = LANGUAGE_CODES as readonly [string, ...string[]];

const bodySchema = z.object({
  /**
   * Optional ISO-639-1 hint forwarded to the whisper transcription
   * model. `undefined` means auto-detect (the default UI state).
   * Translation itself always auto-detects regardless of this hint —
   * see `research/translator-session-shape.md` §1.
   */
  source_language: z.enum(TARGET_LANGUAGES).optional(),
  /**
   * Required ISO-639-1 code for the translated output. Maps to
   * `session.audio.output.language` upstream.
   */
  target_language: z.enum(TARGET_LANGUAGES),
});

const TOKEN_TTL_SEC = 600;
const CLIENT_SECRETS_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  // Hard requirement: translator is OpenAI-only. If the key is missing
  // the page would otherwise dial into a 502 — short-circuit here so
  // the UI can render a friendly notice instead.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "openai_unavailable",
        detail: "OPENAI_API_KEY is not configured on the server",
      },
      { status: 503 },
    );
  }

  const env = getServerEnv();
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { source_language, target_language } = parsed.data;

  // See research/translator-session-shape.md §7 for the canonical
  // schema. `transcription.language` is the only knob that depends on
  // user input — everything else is constant.
  const transcription: Record<string, unknown> = {
    model: "gpt-realtime-whisper",
  };
  if (source_language) transcription.language = source_language;

  const sessionConfig = {
    type: "translation",
    model: "gpt-realtime-translate",
    audio: {
      input: {
        transcription,
        noise_reduction: { type: "near_field" },
      },
      output: { language: target_language },
    },
  };

  const upstream = await fetch(CLIENT_SECRETS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "rt-demo-user",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: TOKEN_TTL_SEC },
      session: sessionConfig,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      { error: "openai_error", status: upstream.status, detail },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as {
    value?: string;
    expires_at?: number;
    session?: { id?: string; model?: string };
  };

  return NextResponse.json({
    value: data.value,
    expires_at: data.expires_at,
    session_id: data.session?.id,
    model: data.session?.model ?? "gpt-realtime-translate",
  });
}
