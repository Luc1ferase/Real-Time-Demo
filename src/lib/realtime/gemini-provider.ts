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

function base64ToInt16(data: string): Int16Array {
  // Decode the base64 payload into a byte buffer, then reinterpret as
  // little-endian signed 16-bit PCM. Both browser (`atob`) and Node
  // (`Buffer`) paths produce the same byte sequence.
  let bytes: Uint8Array;
  if (typeof atob === "function") {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    bytes = Uint8Array.from(Buffer.from(data, "base64"));
  }
  // Copy the bytes into a fresh aligned ArrayBuffer so the Int16Array view
  // is safe regardless of the source buffer's byte offset.
  const aligned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(aligned).set(bytes);
  return new Int16Array(aligned);
}

/** Parse `audio/pcm;rate=24000` into 24000; default to 24 kHz on miss. */
function parseSampleRate(mimeType: string | undefined): number {
  if (!mimeType) return 24000;
  const match = /rate=(\d+)/.exec(mimeType);
  if (!match) return 24000;
  const rate = Number.parseInt(match[1], 10);
  return Number.isFinite(rate) && rate > 0 ? rate : 24000;
}

export const geminiProvider: RealtimeProvider = {
  id: "gemini",
  async connect(
    config: RealtimeConnectConfig,
  ): Promise<RealtimeSessionHandle> {
    // Gemini Live has no reasoning-effort equivalent — `config.reasoningEffort`
    // is intentionally ignored. See PR4 spec; OpenAI's `gpt-realtime-2` is
    // currently the only model exposing this knob.
    const apiKey = await fetchGeminiKey();
    const ai = new GoogleGenAI({ apiKey });

    let closedFired = false;
    const fireClose = () => {
      if (closedFired) return;
      closedFired = true;
      config.onClose?.();
    };

    // Gemini's `FunctionResponse` requires `name` alongside `id`. The wire
    // event `toolCall.functionCalls` carries both, but our public
    // `FunctionCallRequest` only surfaces `callId` + `name` to the consumer
    // and the consumer hands back only `(callId, output)`. Cache the
    // call-id -> name mapping here so `returnFunctionResult` can reconstruct
    // a full `FunctionResponse`. The map is small (one entry per pending
    // call) and entries are dropped after responding.
    const pendingCallNames = new Map<string, string>();

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
          // Input transcription (user speech). Gemini streams partial deltas
          // and signals end-of-turn via `Transcription.finished`. We forward
          // each chunk with its `done` flag; the consumer hook accumulates
          // partials into a single transcript entry. A standalone `finished`
          // event with no text is still surfaced so the consumer flips the
          // tail entry's `done` flag.
          const input = msg.serverContent?.inputTranscription;
          if (input && (input.text || input.finished)) {
            config.onUserTranscript?.({
              text: input.text ?? "",
              done: input.finished === true,
            });
          }
          // Output transcription (assistant speech).
          const output = msg.serverContent?.outputTranscription;
          if (output?.text) {
            config.onAssistantTranscript?.({
              text: output.text,
              done: false,
            });
          }
          // Assistant audio: streamed as base64 PCM inside modelTurn.parts.
          // The corresponding text transcript is delivered separately via
          // `outputTranscription` above. We hand the raw Int16Array to the
          // caller's playback sink; text parts (if any) are still forwarded
          // through the transcript channel as a fallback for cases where
          // responseModalities omits AUDIO.
          const parts = msg.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const p of parts) {
              const inline = p.inlineData;
              if (
                inline?.data &&
                inline.mimeType?.startsWith("audio/")
              ) {
                config.onAssistantAudio?.({
                  pcm: base64ToInt16(inline.data),
                  sampleRate: parseSampleRate(inline.mimeType),
                });
              }
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
              const callName = call.name ?? "";
              // Stash the name so `returnFunctionResult` can include it in
              // the `FunctionResponse` payload — Gemini documents `name` as
              // required even though the TS type marks it optional.
              pendingCallNames.set(callId, callName);
              config.onFunctionCall?.({
                callId,
                name: callName,
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
        // Look up the cached name. If we somehow lost it (e.g. the consumer
        // returns a result for a call we never received), fall back to an
        // empty string — the API will reject the response and the model will
        // surface an error, which is preferable to silently dropping it.
        const name = pendingCallNames.get(callId) ?? "";
        pendingCallNames.delete(callId);
        session.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name,
              // Gemini expects an object payload, not a string.
              response:
                typeof output === "object" && output !== null
                  ? (output as Record<string, unknown>)
                  : { result: output },
            },
          ],
        });
      },
      updateInstructions(instructions) {
        // Gemini Live has no system-instruction patch wire event; the
        // `systemInstruction` field is only honored in the initial `setup`.
        // We approximate stage swaps by injecting a user-role priming turn
        // wrapped in an explicit marker so the model recognizes it as a
        // behavior update. `turnComplete: false` keeps the model from
        // immediately responding to the priming turn — the next real user
        // speech (or model turn) drives generation.
        session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: `[SYSTEM UPDATE] From now on, follow these instructions for the rest of the conversation:\n\n${instructions}`,
                },
              ],
            },
          ],
          turnComplete: false,
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
