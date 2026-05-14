import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  type FunctionTool,
} from "@openai/agents/realtime";

import type {
  RealtimeConnectConfig,
  RealtimeProvider,
  RealtimeSessionHandle,
} from "./provider";
import type { ReasoningEffort, ToolDefinition } from "./types";

const TOKEN_ENDPOINT = "/api/realtime/token/openai";

/** Only `gpt-realtime-2` accepts `reasoning.effort`. */
const REASONING_EFFORT_MODELS: ReadonlySet<string> = new Set([
  "gpt-realtime-2",
]);

interface OpenAITokenResponse {
  value: string;
  expires_at: number;
  session_id?: string;
  model?: string;
  error?: string;
}

async function mintEphemeralToken(
  model: string,
  voice: string,
  instructions: string,
  reasoningEffort?: ReasoningEffort,
): Promise<string> {
  // Strip reasoning_effort for non-flagship models. The token route also
  // enforces this, but a client-side guard means we never pollute the
  // wire body with a field the server will reject.
  const allowEffort =
    reasoningEffort && REASONING_EFFORT_MODELS.has(model);
  const body: Record<string, unknown> = { model, voice, instructions };
  if (allowEffort) body.reasoning_effort = reasoningEffort;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI token endpoint failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as OpenAITokenResponse;
  if (!data.value) {
    throw new Error("OpenAI token endpoint returned no ephemeral key");
  }
  return data.value;
}

/**
 * Build SDK FunctionTool objects from our provider-agnostic definitions.
 *
 * The SDK's `tool()` requires an `execute` function that returns a string the
 * model will read back. We wire each tool to a per-call Promise that the
 * caller resolves via `returnFunctionResult(callId)`. PR3 wires real
 * business logic; PR2's smoke test just calls back with a stub value.
 */
function buildTools(
  definitions: ToolDefinition[],
  pending: Map<string, (output: string) => void>,
  lastCallIdByName: Map<string, string>,
): FunctionTool[] {
  return definitions.map((def) =>
    tool({
      name: def.name,
      description: def.description,
      // The SDK accepts a JSON-Schema dialect when strict is false. We keep
      // strict=false so callers don't need to provide Zod schemas.
      parameters: def.parameters as never,
      strict: false,
      execute: (_input, _ctx, details) => {
        // `details.toolCall.callId` may be undefined on some transports; fall
        // back to a synthetic id so the consumer can still match. We also
        // remember the most recent call id per tool name so out-of-band
        // resolution by name keeps working in single-call scenarios.
        const rawCallId = details?.toolCall?.callId;
        const callId =
          rawCallId && rawCallId.length > 0
            ? rawCallId
            : `${def.name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        lastCallIdByName.set(def.name, callId);
        return new Promise<string>((resolve) => {
          pending.set(callId, resolve);
        });
      },
    }),
  );
}

export const openaiProvider: RealtimeProvider = {
  id: "openai",
  async connect(
    config: RealtimeConnectConfig,
  ): Promise<RealtimeSessionHandle> {
    const apiKey = await mintEphemeralToken(
      config.model,
      config.voice,
      config.instructions,
      config.reasoningEffort,
    );

    const pendingToolResults = new Map<string, (output: string) => void>();
    const lastCallIdByName = new Map<string, string>();

    const tools = buildTools(
      config.tools ?? [],
      pendingToolResults,
      lastCallIdByName,
    );

    const agent = new RealtimeAgent({
      name: "Realtime Voice Agent",
      instructions: config.instructions,
      voice: config.voice,
      tools,
    });

    // The SDK's `RealtimeSession` accepts a partial session config; the
    // typed surface (`clientMessages.d.ts`) exposes `reasoning.effort` as
    // a first-class field. Pass it in on construction so the session
    // config sent on connect matches what the ephemeral token was minted
    // with; otherwise the session-update wire event could drift.
    const allowEffort =
      config.reasoningEffort && REASONING_EFFORT_MODELS.has(config.model);
    const session = new RealtimeSession(agent, {
      apiKey,
      model: config.model,
      transport: typeof window === "undefined" ? "websocket" : "webrtc",
      ...(allowEffort
        ? {
            config: {
              reasoning: { effort: config.reasoningEffort },
            },
          }
        : {}),
    });

    session.on("error", (e) => {
      const err =
        e.error instanceof Error ? e.error : new Error(String(e.error));
      config.onError?.(err);
    });

    // Transport-level events: streaming assistant transcript + audio done.
    session.transport.on("audio_transcript_delta", (deltaEvent) => {
      if (!deltaEvent.delta) return;
      config.onAssistantTranscript?.({ text: deltaEvent.delta, done: false });
    });

    session.transport.on("audio_done", () => {
      config.onAssistantTranscript?.({ text: "", done: true });
    });

    // User transcript arrives as a raw transport event with type
    // `conversation.item.input_audio_transcription.completed`. Listen on
    // the wildcard channel and dispatch. OpenAI only emits the final
    // transcript for a turn, so we always pass `done: true`.
    session.transport.on("*", (event) => {
      if (
        event.type ===
        "conversation.item.input_audio_transcription.completed"
      ) {
        const typed = event as { transcript?: string };
        if (typed.transcript) {
          config.onUserTranscript?.({ text: typed.transcript, done: true });
        }
      }
    });

    // The SDK fires `function_call` on the transport for every model tool
    // call. Forward it to the consumer so they can resolve via
    // `returnFunctionResult`. The tool's `execute()` promise (set up in
    // buildTools) keeps awaiting until the consumer resolves it.
    session.transport.on("function_call", (event) => {
      const callId = event.callId || lastCallIdByName.get(event.name) || "";
      let parsedArgs: Record<string, unknown> = {};
      if (event.arguments && event.arguments.length > 0) {
        try {
          parsedArgs = JSON.parse(event.arguments) as Record<string, unknown>;
        } catch {
          parsedArgs = { _raw: event.arguments };
        }
      }
      config.onFunctionCall?.({ callId, name: event.name, arguments: parsedArgs });
    });

    let closedHandled = false;
    const handleClose = () => {
      if (closedHandled) return;
      closedHandled = true;
      config.onClose?.();
    };
    session.transport.on("connection_change", (status) => {
      if (status === "disconnected") handleClose();
    });

    try {
      await session.connect({ apiKey });
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    return {
      providerId: "openai",
      sendUserText(text) {
        session.sendMessage(text);
      },
      sendUserAudio(pcmChunk) {
        // PR3 wires real audio capture. For PR2 we expose the path for
        // completeness — the SDK accepts an ArrayBuffer of 16-bit PCM.
        const buf = pcmChunk.buffer.slice(
          pcmChunk.byteOffset,
          pcmChunk.byteOffset + pcmChunk.byteLength,
        ) as ArrayBuffer;
        session.sendAudio(buf);
      },
      returnFunctionResult(callId, output) {
        const resolver = pendingToolResults.get(callId);
        if (!resolver) return;
        pendingToolResults.delete(callId);
        resolver(typeof output === "string" ? output : JSON.stringify(output));
      },
      updateInstructions(instructions) {
        // The transport merges the partial config with the running session
        // config and emits a `session.update` wire event. We intentionally do
        // NOT touch `tools` — the agent's tool list is configured at connect
        // time and shouldn't drift between stage swaps.
        session.transport.updateSessionConfig({ instructions });
      },
      interrupt() {
        session.interrupt();
      },
      close() {
        session.close();
        handleClose();
      },
    };
  },
};
