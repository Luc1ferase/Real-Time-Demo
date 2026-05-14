import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAIEnv } from "@/lib/env";

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

const REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

// `gpt-realtime-2` is the only realtime model that accepts
// `reasoning.effort` at session config time — sending the field on any
// other model returns 400 from `/v1/realtime/client_secrets`. We
// enforce that constraint at the route handler so a misconfigured
// client can't burn an upstream round-trip.
const REASONING_EFFORT_MODELS: ReadonlySet<string> = new Set([
  "gpt-realtime-2",
]);

const bodySchema = z
  .object({
    model: z.enum(REALTIME_MODELS).default("gpt-realtime-2"),
    voice: z.enum(REALTIME_VOICES).default("marin"),
    instructions: z.string().max(8000).optional(),
    reasoning_effort: z.enum(REASONING_EFFORTS).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.reasoning_effort !== undefined &&
      !REASONING_EFFORT_MODELS.has(val.model)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reasoning_effort"],
        message: `reasoning_effort is only supported by gpt-realtime-2, not ${val.model}`,
      });
    }
  });

const TOKEN_TTL_SEC = 600;
const CLIENT_SECRETS_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  // Only OPENAI_API_KEY is required for this route. Surface a 503 on
  // misconfig so the UI can render a "missing env" notice rather than a
  // generic 500.
  let env: ReturnType<typeof getOpenAIEnv>;
  try {
    env = getOpenAIEnv();
  } catch (err) {
    return NextResponse.json(
      {
        error: "missing_env",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { model, voice, instructions, reasoning_effort } = parsed.data;

  const sessionConfig: Record<string, unknown> = {
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
  };
  // Only forward `reasoning.effort` for the flagship model. The schema
  // already rejects mismatched (model, effort) pairs with a 400, but
  // defense-in-depth here means a future regression on the schema can't
  // silently send the field to the upstream.
  if (reasoning_effort && REASONING_EFFORT_MODELS.has(model)) {
    sessionConfig.reasoning = { effort: reasoning_effort };
  }

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
    model: data.session?.model ?? model,
  });
}
