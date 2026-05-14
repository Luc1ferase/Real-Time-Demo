import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { getGeminiEnv, getOpenAIEnv } from "@/lib/env";

/**
 * POST /api/translate
 *
 * Body: { text, targetLang, sourceLang?, provider }
 * Response: { translation, cached }
 *
 * The interview subtitle overlay calls this once per finalized assistant
 * transcript. We route to whichever flash-lite model matches the active
 * provider (OpenAI gpt-4o-mini, Gemini gemini-2.5-flash-lite) so each
 * provider's billing stays self-contained.
 *
 * Eviction policy for the in-memory cache:
 *   - 5-minute TTL on every entry, keyed by sha256(provider|text|targetLang)
 *   - Bounded at MAX_CACHE_ENTRIES via FIFO insertion-order eviction
 *   - Process restarts (cold start on Vercel) wipe the cache — this is
 *     fine because the overlay only re-translates on re-renders within a
 *     single browser session, and a cold-start request was going to miss
 *     the cache anyway.
 */

const SUPPORTED_LANGS = ["zh", "en", "ja", "es", "fr"] as const;

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  targetLang: z.enum(SUPPORTED_LANGS),
  sourceLang: z.string().min(1).max(16).optional(),
  provider: z.enum(["openai", "gemini"]),
});

const LANG_LABELS: Record<(typeof SUPPORTED_LANGS)[number], string> = {
  zh: "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
};

const SYSTEM_PROMPT =
  "You are a precise translator. Output the translation only. Do not include quotes, do not include commentary, do not preface with phrases like 'Sure' or 'The translation is'. If the source already matches the target language, repeat it verbatim.";

const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;

interface CacheEntry {
  translation: string;
  expiresAt: number;
}

// Module-scope Map persists across requests on the same warm Lambda/Edge
// process. Cold starts wipe it. Insertion order is iteration order on
// Maps in V8, which lets us evict the oldest entry in O(1) once we hit
// MAX_CACHE_ENTRIES.
const cache = new Map<string, CacheEntry>();

function cacheKey(provider: string, text: string, target: string): string {
  return createHash("sha256")
    .update(`${provider}|${target}|${text}`)
    .digest("hex");
}

function readCache(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.translation;
}

function writeCache(key: string, translation: string): void {
  cache.set(key, { translation, expiresAt: Date.now() + TTL_MS });
  // FIFO eviction once over the limit.
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function buildUserPrompt(
  text: string,
  targetLang: (typeof SUPPORTED_LANGS)[number],
  sourceLang?: string,
): string {
  const targetLabel = LANG_LABELS[targetLang];
  if (sourceLang && sourceLang.length > 0) {
    return `Translate the following from ${sourceLang} into ${targetLabel}. Output only the translation.\n\n${text}`;
  }
  return `Translate the following into ${targetLabel}. Output only the translation.\n\n${text}`;
}

async function translateWithOpenAI(args: {
  apiKey: string;
  text: string;
  targetLang: (typeof SUPPORTED_LANGS)[number];
  sourceLang?: string;
}): Promise<{ translation: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(args.text, args.targetLang, args.sourceLang),
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error("OpenAI translate failed"), {
      status: res.status,
      detail,
    });
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const translation = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!translation) {
    throw Object.assign(new Error("OpenAI translate returned empty content"), {
      status: 502,
      detail: JSON.stringify(data),
    });
  }
  return { translation };
}

async function translateWithGemini(args: {
  apiKey: string;
  text: string;
  targetLang: (typeof SUPPORTED_LANGS)[number];
  sourceLang?: string;
}): Promise<{ translation: string }> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  // `gemini-2.5-flash-lite` is the current stable lite tier on Google AI
  // Studio's free quota (the live-API research doc lists 2.5-flash family
  // as accessible). The 3.1 family is realtime-audio only; the chat lite
  // tier still lives on 2.5.
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(
              args.text,
              args.targetLang,
              args.sourceLang,
            )}`,
          },
        ],
      },
    ],
    config: { temperature: 0 },
  });
  const translation = (response.text ?? "").trim();
  if (!translation) {
    throw Object.assign(new Error("Gemini translate returned empty content"), {
      status: 502,
      detail: response.modelVersion ?? "no-text",
    });
  }
  return { translation };
}

export async function POST(request: Request) {
  // Parse the body first so we know which provider's env to validate.
  // Validating only the requested provider's key means /api/translate
  // works on a half-configured deployment (e.g. Gemini-only dev).
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { text, targetLang, sourceLang, provider } = parsed.data;

  let apiKey: string;
  try {
    apiKey =
      provider === "openai"
        ? getOpenAIEnv().OPENAI_API_KEY
        : getGeminiEnv().GOOGLE_AI_STUDIO_KEY;
  } catch (err) {
    return NextResponse.json(
      {
        error: "missing_env",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  const key = cacheKey(provider, text, targetLang);
  const cached = readCache(key);
  if (cached !== null) {
    return NextResponse.json({ translation: cached, cached: true });
  }

  try {
    const { translation } =
      provider === "openai"
        ? await translateWithOpenAI({
            apiKey,
            text,
            targetLang,
            sourceLang,
          })
        : await translateWithGemini({
            apiKey,
            text,
            targetLang,
            sourceLang,
          });
    writeCache(key, translation);
    return NextResponse.json({ translation, cached: false });
  } catch (err) {
    // Surface the upstream HTTP status in the body even though our
    // response is uniformly 502 — the caller (translation overlay) can
    // distinguish upstream rate-limit vs. auth issues from the detail.
    const upstreamStatus =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof (err as { status: unknown }).status === "number"
        ? ((err as { status: number }).status as number)
        : null;
    const detail =
      err instanceof Error
        ? ((err as Error & { detail?: string }).detail ?? err.message)
        : String(err);
    return NextResponse.json(
      { error: "upstream_error", upstream_status: upstreamStatus, detail },
      { status: 502 },
    );
  }
}
