/**
 * Provider-agnostic types for the Realtime abstraction. Both OpenAI and
 * Gemini implementations marshal their native events into these shapes so
 * callers (hooks, pages) never branch on provider identity.
 */

export type ProviderId = "openai" | "gemini";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

export interface ToolParameterSchema {
  /**
   * JSON Schema describing the function's argument object. The shape mirrors
   * an OpenAPI 3.0 Schema; both providers accept this dialect after light
   * normalization inside their respective providers.
   */
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface UserTranscriptEvent {
  text: string;
  /**
   * True when this is the final transcript for the user's turn. OpenAI only
   * emits final transcripts (one event per turn). Gemini streams partial
   * deltas; the provider sets `done` to `false` for partials and `true` once
   * the upstream `Transcription.finished` flag arrives.
   */
  done?: boolean;
}

export interface AssistantTranscriptEvent {
  text: string;
  /** True when this is the final transcript for the turn. */
  done: boolean;
}

/**
 * Raw 16-bit little-endian PCM at the provider's output sample rate. Only
 * fires for transports that surface audio as a callback (currently Gemini at
 * 24 kHz). The OpenAI WebRTC transport plays audio on a media track and
 * never invokes this callback.
 */
export interface AssistantAudioEvent {
  pcm: Int16Array;
  sampleRate: number;
}

export interface FunctionCallRequest {
  /**
   * Provider-issued call identifier. OpenAI uses string ids, Gemini's
   * `FunctionCall.id` can be undefined — provider impls synthesise one when
   * missing so callers always receive a non-empty string.
   */
  callId: string;
  name: string;
  /** Parsed JSON argument object. */
  arguments: Record<string, unknown>;
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** True if the assistant has finished speaking this entry. */
  done: boolean;
  createdAt: number;
}
