import type {
  AssistantAudioEvent,
  AssistantTranscriptEvent,
  FunctionCallRequest,
  ProviderId,
  ReasoningEffort,
  ToolDefinition,
  UserTranscriptEvent,
} from "./types";

export interface RealtimeConnectConfig {
  model: string;
  voice: string;
  instructions: string;
  tools?: ToolDefinition[];
  /**
   * Optional reasoning-effort knob. Only honored by OpenAI's
   * `gpt-realtime-2`; other models/providers ignore the field. The
   * provider impl is responsible for guarding against sending it on
   * unsupported models (would 400 from `/v1/realtime/client_secrets`).
   */
  reasoningEffort?: ReasoningEffort;
  onUserTranscript?(event: UserTranscriptEvent): void;
  onAssistantTranscript?(event: AssistantTranscriptEvent): void;
  /**
   * Fires for transports that surface raw assistant audio as a callback
   * (Gemini WebSocket). OpenAI's WebRTC transport plays audio on a media
   * track and never invokes this. Callers should wire a Web Audio sink only
   * for providers that supply this callback.
   */
  onAssistantAudio?(event: AssistantAudioEvent): void;
  onFunctionCall?(call: FunctionCallRequest): void;
  onError?(error: Error): void;
  onClose?(): void;
}

export interface RealtimeSessionHandle {
  readonly providerId: ProviderId;
  /** Inject a user text turn and trigger a model response. */
  sendUserText(text: string): void;
  /** Optional: stream raw 16-bit little-endian PCM. */
  sendUserAudio?(pcmChunk: Int16Array): void;
  /** Return a tool-call result and let the model continue. */
  returnFunctionResult(callId: string, output: unknown): void;
  /**
   * Swap the system instructions mid-session. Used by the interview stage
   * machine to change persona between warmup / technical / behavioral /
   * feedback without tearing down the connection. OpenAI maps this to
   * `transport.updateSessionConfig({ instructions })`; Gemini doesn't expose
   * a system-instruction patch wire event, so the provider injects a
   * user-role priming turn ("[SYSTEM UPDATE] ...") instead.
   */
  updateInstructions(instructions: string): void;
  /** Cancel the in-flight assistant response (manual barge-in). */
  interrupt(): void;
  /** Close the session and release transport resources. */
  close(): void;
}

export interface RealtimeProvider {
  readonly id: ProviderId;
  connect(config: RealtimeConnectConfig): Promise<RealtimeSessionHandle>;
}
