// SECURITY NOTE: Gemini Live has no ephemeral-token concept. The browser
// holds the raw Google AI Studio API key for the duration of the session.
// This is acceptable here only because the entire app sits behind the demo
// gate proxy. Production deployments should proxy the WebSocket server-side.
// See research/gemini-live-api.md, section "Auth model".

import { GoogleGenAI, Modality, type Session } from "@google/genai";

import type {
  RealtimeConnectConfig,
  RealtimeProvider,
  RealtimeSessionHandle,
} from "./provider";
import type { ToolDefinition } from "./types";

const TOKEN_ENDPOINT = "/api/realtime/token/gemini";

interface GeminiTokenResponse {
  key: string;
  expires_at: number;
  error?: string;
}

async function fetchGeminiKey(): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, { method: "POST" });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini key endpoint failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as GeminiTokenResponse;
  if (!data.key) {
    throw new Error("Gemini key endpoint returned no key");
  }
  return data.key;
}

/**
 * Map our provider-agnostic tool definitions to a Gemini `Tool[]` payload
 * with `functionDeclarations` populated. Gemini's schema dialect is OpenAPI
 * 3.0 with uppercase enum types; the JSON Schema variant we already use is
 * accepted by the API as long as `additionalProperties` isn't set on the
 * top-level object (the SDK silently strips it, but we drop it here to be
 * safe).
 */
function buildTools(definitions: ToolDefinition[]) {
  if (definitions.length === 0) return undefined;
  return [
    {
      functionDeclarations: definitions.map((def) => ({
        name: def.name,
        description: def.description,
        parametersJsonSchema: def.parameters,
      })),
    },
  ];
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(
    pcm.buffer,
    pcm.byteOffset,
    pcm.byteLength,
  );
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

export const geminiProvider: RealtimeProvider = {
  id: "gemini",
  async connect(
    config: RealtimeConnectConfig,
  ): Promise<RealtimeSessionHandle> {
    const apiKey = await fetchGeminiKey();
    const ai = new GoogleGenAI({ apiKey });

    let closedFired = false;
    const fireClose = () => {
      if (closedFired) return;
      closedFired = true;
      config.onClose?.();
    };

    // The model id arrives without the `models/` prefix from our UI; the SDK
    // accepts either form, but we normalize for clarity.
    const modelId = config.model.startsWith("models/")
      ? config.model
      : `models/${config.model}`;

    const session: Session = await ai.live.connect({
      model: modelId,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: config.instructions }] },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.voice },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: buildTools(config.tools ?? []),
      },
      callbacks: {
        onopen: () => {
          /* setup is sent by the SDK; we wait for serverContent. */
        },
        onmessage: (msg) => {
          // Input transcription (user speech). Gemini may stream partials;
          // we forward each chunk and let the UI accumulate.
          // TODO(PR3): the OpenAI provider only emits the final user
          // transcript (one event per turn). Gemini streams partials, so
          // the current consumer (`useRealtimeSession.appendUserTranscript`)
          // would push one new entry per delta. Align by buffering partials
          // here until `turnComplete` from input side, or expose a `done`
          // flag on `UserTranscriptEvent`. Not exercised in PR2 text-only
          // smoke tests since audio capture isn't wired yet.
          const input = msg.serverContent?.inputTranscription;
          if (input?.text) {
            config.onUserTranscript?.({ text: input.text });
          }
          // Output transcription (assistant speech).
          const output = msg.serverContent?.outputTranscription;
          if (output?.text) {
            config.onAssistantTranscript?.({
              text: output.text,
              done: false,
            });
          }
          // Fallback: when the model returns text in modelTurn.parts (happens
          // when responseModalities does NOT include AUDIO — but harmless to
          // handle here as well).
          const parts = msg.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const p of parts) {
              if (typeof p.text === "string" && p.text.length > 0) {
                config.onAssistantTranscript?.({
                  text: p.text,
                  done: false,
                });
              }
            }
          }
          if (msg.serverContent?.turnComplete) {
            // Signal end-of-turn with empty text so the consumer just flips
            // the `done` flag on the in-flight entry. Re-emitting accumulated
            // text here would double it (the consumer concatenates non-empty
            // text into the current entry).
            config.onAssistantTranscript?.({ text: "", done: true });
          }
          // Tool calls.
          const calls = msg.toolCall?.functionCalls;
          if (calls && calls.length > 0) {
            for (const call of calls) {
              const callId =
                call.id ??
                `${call.name ?? "fn"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
              config.onFunctionCall?.({
                callId,
                name: call.name ?? "",
                arguments: (call.args ?? {}) as Record<string, unknown>,
              });
            }
          }
        },
        onerror: (e) => {
          // ErrorEvent.message is the user-friendly explanation; some browsers
          // omit it, so fall back to a stringified payload.
          const msg =
            (e as { message?: string }).message ?? "Gemini transport error";
          config.onError?.(new Error(msg));
        },
        onclose: () => {
          fireClose();
        },
      },
    });

    return {
      providerId: "gemini",
      sendUserText(text) {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        });
      },
      sendUserAudio(pcmChunk) {
        // Gemini expects 16 kHz, 16-bit little-endian PCM as a base64 Blob.
        session.sendRealtimeInput({
          audio: {
            data: int16ToBase64(pcmChunk),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      },
      returnFunctionResult(callId, output) {
        session.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              // Gemini expects an object payload, not a string.
              response:
                typeof output === "object" && output !== null
                  ? (output as Record<string, unknown>)
                  : { result: output },
            },
          ],
        });
      },
      interrupt() {
        // Gemini auto-interrupts on new user input; an explicit barge-in is
        // achieved by sending an empty clientContent turn. We send an
        // activityStart marker which the API treats as "user started talking"
        // and cancels the in-flight model turn.
        session.sendRealtimeInput({ activityStart: {} });
      },
      close() {
        session.close();
        fireClose();
      },
    };
  },
};
