import type {
  AssistantTranscriptEvent,
  FunctionCallRequest,
  ProviderId,
  ToolDefinition,
  UserTranscriptEvent,
} from "./types";

export interface RealtimeConnectConfig {
  model: string;
  voice: string;
  instructions: string;
  tools?: ToolDefinition[];
  onUserTranscript?(event: UserTranscriptEvent): void;
  onAssistantTranscript?(event: AssistantTranscriptEvent): void;
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
  /** Cancel the in-flight assistant response (manual barge-in). */
  interrupt(): void;
  /** Close the session and release transport resources. */
  close(): void;
}

export interface RealtimeProvider {
  readonly id: ProviderId;
  connect(config: RealtimeConnectConfig): Promise<RealtimeSessionHandle>;
}
