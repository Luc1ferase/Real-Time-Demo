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
}

export interface AssistantTranscriptEvent {
  text: string;
  /** True when this is the final transcript for the turn. */
  done: boolean;
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
