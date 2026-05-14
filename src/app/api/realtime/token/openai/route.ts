import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";

const REALTIME_MODELS = [
  "gpt-realtime-2",
  "gpt-realtime-1.5",
  "gpt-realtime",
  "gpt-realtime-mini",
] as const;

const REALTIME_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

const bodySchema = z.object({
  model: z.enum(REALTIME_MODELS).default("gpt-realtime-2"),
  voice: z.enum(REALTIME_VOICES).default("marin"),
  instructions: z.string().max(8000).optional(),
});

const TOKEN_TTL_SEC = 600;
const CLIENT_SECRETS_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  const env = getServerEnv();
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { model, voice, instructions } = parsed.data;

  const upstream = await fetch(CLIENT_SECRETS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // TODO(PR3+): derive a per-user identifier (e.g. hashed gate session id)
      // when the demo grows beyond a single tenant. Hardcoded for now.
      "OpenAI-Safety-Identifier": "rt-demo-user",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: TOKEN_TTL_SEC },
      session: {
        type: "realtime",
        model,
        instructions:
          instructions ??
          "You are a warm, structured interview assistant. Keep your turns short.",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            turn_detection: {
              type: "semantic_vad",
              create_response: true,
              interrupt_response: true,
            },
            transcription: { model: "gpt-4o-mini-transcribe" },
          },
          output: { format: { type: "audio/pcm" }, voice },
        },
      },
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
    model: data.session?.model ?? model,
  });
}
