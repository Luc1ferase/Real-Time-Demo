import { z } from "zod";

/**
 * Per-concern env validation. Each accessor parses ONLY the variables its
 * caller actually uses, so a route handler can't crash on an unrelated
 * missing key (e.g. the password gate must never depend on
 * OPENAI_API_KEY or GOOGLE_AI_STUDIO_KEY being set).
 *
 * Callers should wrap these in try/catch and return 503 + a friendly
 * error body on parse failure — see any of the route handlers under
 * `src/app/api/` for the canonical pattern.
 */

const gateEnvSchema = z.object({
  DEMO_PASSWORD: z.string().min(1, "DEMO_PASSWORD is required"),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});

const geminiEnvSchema = z.object({
  GOOGLE_AI_STUDIO_KEY: z.string().min(1, "GOOGLE_AI_STUDIO_KEY is required"),
});

export function getGateEnv() {
  return gateEnvSchema.parse({ DEMO_PASSWORD: process.env.DEMO_PASSWORD });
}

export function getOpenAIEnv() {
  return openAIEnvSchema.parse({ OPENAI_API_KEY: process.env.OPENAI_API_KEY });
}

export function getGeminiEnv() {
  return geminiEnvSchema.parse({
    GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
  });
}
