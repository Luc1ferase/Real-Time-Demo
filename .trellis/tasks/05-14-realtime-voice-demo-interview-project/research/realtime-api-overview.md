# Research: OpenAI Realtime API — Current State

- **Query**: Current state of OpenAI Realtime API for a frontend voice demo (models, transport, ephemeral tokens, events, function calling, voices, limits, SDKs)
- **Scope**: External (live OpenAI docs + npm + GitHub)
- **Date**: 2026-05-14
- **Confidence**: HIGH — facts pulled from `platform.openai.com/docs`, `developers.openai.com/api`, the official `openai-realtime-agents` / `openai-realtime-console` repos, and `npmjs.com/package/@openai/agents-realtime`. Inline citations below.

> **CHANGED FROM EARLIER (training-data drift)**: As of **May 7, 2026**, the Realtime API exited beta. The flagship is now **`gpt-realtime-2`** (GPT-5-class reasoning, 128K context). All `gpt-4o-realtime-preview*` model IDs are scheduled to shut down on **2026-05-07** (today's nearest prior milestone) — anything written against `gpt-4o-realtime-preview-2024-12-17` is dead code. The official `openai-realtime-console` repo still references that old ID on its `main` branch (last push 2025-08-28) — treat that sample as outdated.

---

## 1. Model Lineup (verified 2026-05-14)

### Realtime voice-agent models (`/v1/realtime`)

| Model ID | Status | Released | Audio I/O | Func calling | Audio in $/M | Cached in $/M | Audio out $/M | Text in $/M | Text out $/M | Context | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **`gpt-realtime-2`** | GA | 2026-05-07 | Yes | Yes (parallel + preambles) | $32 | $0.40 | $64 | (text: standard) | (text: standard) | **128K** | Flagship. GPT-5-class reasoning, 5 effort levels (`minimal`/`low`/`medium`/`high`/`xhigh`). Big Bench Audio 96.6%. **Recommended for the demo.** [1][2][3] |
| `gpt-realtime-1.5` | GA | late 2025 | Yes | Yes | $32 | $0.40 | $64 | $4 | $16 | 32K | Non-reasoning speech-to-speech. Cheaper-to-reason workloads, same audio price. Recommended replacement for retired `gpt-4o-realtime-preview*`. [4][5] |
| `gpt-realtime` (alias → `gpt-realtime-2025-08-28`) | GA | 2025-08-28 | Yes | Yes | $32 | $0.40 | $64 | $4 | $16 | 32K | First GA Realtime model. Now superseded by 1.5 / 2 but the bare alias still resolves. [6] |
| **`gpt-realtime-mini`** (alias → `gpt-realtime-mini-2025-12-15`) | GA | 2025-12-15 | Yes | Yes | **$10** | $0.30 | **$20** | $0.60 | $2.40 | 32K (some sources say 128K — verify before relying) | ~3x cheaper, intelligence/tool-use degraded vs. flagship. Good for high-volume / cost-sensitive. [7][8] |

### Specialized realtime endpoints

| Model ID | Endpoint | Purpose | Pricing |
|---|---|---|---|
| `gpt-realtime-translate` | `/v1/realtime/translations` | Live speech translation, 70+ input → 13 output languages | **$0.034 / minute** (flat) [1] |
| `gpt-realtime-whisper` | `/v1/realtime/transcription_sessions` (or as `audio.input.transcription.model`) | Streaming STT with tunable latency knob | **$0.017 / minute** (flat) [1] |

### Deprecated / sunset (do NOT use)

| Model | Shutdown | Replacement |
|---|---|---|
| `gpt-4o-realtime-preview` | **2026-05-07** (already past) | `gpt-realtime-1.5` |
| `gpt-4o-realtime-preview-2024-12-17` | **2026-05-07** | `gpt-realtime-1.5` |
| `gpt-4o-realtime-preview-2025-06-03` | **2026-05-07** | `gpt-realtime-1.5` |
| `gpt-4o-mini-realtime-preview` | **2026-05-07** | `gpt-realtime-mini` |
| `gpt-4o-realtime-preview-2024-10-01` | 2025-10-10 | `gpt-realtime-1.5` |

Source: <https://platform.openai.com/docs/deprecations> [9]

### Recommendation for this demo

Use **`gpt-realtime-2`** as the primary model. Drop to `gpt-realtime-mini` if cost during dev testing matters; the function-calling reliability gap will probably bite a demo that shows tool use.

---

## 2. Connection Options — WebRTC vs WebSocket

OpenAI's explicit current guidance [10][11]:

| Client type | Recommended transport | Reason |
|---|---|---|
| **Browser / mobile (direct audio)** | **WebRTC** | SDK handles mic capture, playback, codec negotiation, NAT traversal. No raw PCM munging. |
| Server-side voice loop | WebSocket (`wss://api.openai.com/v1/realtime`) | You already control audio I/O. Direct event access. |
| Telephony (Twilio, SIP) | SIP via `OpenAIRealtimeSIP` | OpenAI bridges the SIP leg. |
| Cloudflare Workers / workerd | Cloudflare extension transport | Workers cannot open outbound WS via global `WebSocket`. |
| Server-to-active-call control | WebSocket *sideband* using `call_id` | Lets server attach to a browser WebRTC call to keep tools/business logic server-side. [12] |

### WebRTC (browser) — minimal flow

```js
// 1) Mint ephemeral token from your server
const { value: EPHEMERAL_KEY } = await (await fetch("/token")).json();

// 2) Set up peer connection + local mic
const pc = new RTCPeerConnection();
const audioEl = document.createElement("audio");
audioEl.autoplay = true;
pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
pc.addTrack(ms.getTracks()[0]);

// 3) Data channel for events
const dc = pc.createDataChannel("oai-events");
dc.addEventListener("message", (e) => handleServerEvent(JSON.parse(e.data)));

// 4) SDP exchange
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
  method: "POST",
  body: offer.sdp,
  headers: {
    Authorization: `Bearer ${EPHEMERAL_KEY}`,
    "Content-Type": "application/sdp",
  },
});
await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
```

> **CHANGED FROM EARLIER**: The endpoint is now **`/v1/realtime/calls`** (not `/v1/realtime?model=...`). The model is no longer passed as a query string — it is set inside the session config sent to `/v1/realtime/client_secrets`. The legacy `?model=` form still appears in the older `openai-realtime-console` sample but is deprecated. [10][12]

### WebSocket (server) — minimal flow

```js
import WebSocket from "ws";

const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2", {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1", // still honored, not required post-GA
  },
});

ws.on("open", () => ws.send(JSON.stringify({ type: "session.update", session: {/* ... */} })));
ws.on("message", (raw) => handleServerEvent(JSON.parse(raw.toString())));
```

For server-side mid-call control of a *browser-WebRTC* session, attach by `call_id` returned in the `Location` header of the SDP POST: `wss://api.openai.com/v1/realtime?call_id=rtc_xxxxx`. [12]

---

## 3. Ephemeral Token Flow

### Endpoint

`POST https://api.openai.com/v1/realtime/client_secrets` [13]

> **CHANGED FROM EARLIER**: The older `POST /v1/realtime/sessions` endpoint is still documented but the canonical name is now `/v1/realtime/client_secrets`. Both return a `client_secret.value` shaped like `ek_...`. [13][14]

### Request

```http
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer sk-...                  # standard API key, server-side ONLY
Content-Type: application/json
OpenAI-Safety-Identifier: <hashed-user-id>    # recommended; binds identifier to token

{
  "expires_after": { "anchor": "created_at", "seconds": 600 },   // up to 10 min typical
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2",
    "instructions": "You are a friendly interview assistant.",
    "audio": {
      "input":  { "format": { "type": "audio/pcm", "rate": 24000 },
                  "turn_detection": { "type": "semantic_vad" } },
      "output": { "format": { "type": "audio/pcm" }, "voice": "marin" }
    }
  }
}
```

### Response (shape)

```json
{
  "value": "ek_abc123...",
  "expires_at": 1747200000,
  "session": { "id": "sess_001", "model": "gpt-realtime-2", ... }
}
```

### Expiry semantics

- Tokens are **short-lived** — historical default 60 s, configurable via `expires_after` up to ~10 min. [14]
- Expiry applies to the **token's usability to *open* a connection**, not the session lifetime. Once SDP/WS handshake completes, the session continues until either side closes it or the **60-minute max session duration** is hit. [15]
- There is **no documented way to enforce a server-side hard cap < 60 min** on an active session — you must close it from your own server (issue still open in `openai-realtime-agents#119`). [16]

### Browser usage

Browser fetches the ephemeral token from your `/token` endpoint, then POSTs SDP to `/v1/realtime/calls` with `Authorization: Bearer ek_...` (see WebRTC sample above).

### Safety identifier rule

Set `OpenAI-Safety-Identifier` on the **server-side** call to `/client_secrets`. The identifier is bound to the token. The browser does NOT resend it. [13][17]

---

## 4. Event Protocol Essentials

Channel: WebRTC data channel `oai-events` OR WebSocket frames. All events are JSON with a `type` field. [18][19]

### Client → Server events we need

| Event | Use |
|---|---|
| `session.update` | Configure instructions, voice, tools, VAD, modalities. Send right after `session.created`. |
| `conversation.item.create` | Inject a text user message, history, or `function_call_output`. |
| `input_audio_buffer.append` | (WebSocket path only) push base64 PCM chunks. WebRTC handles this implicitly. |
| `input_audio_buffer.commit` | (WebSocket path, push-to-talk) commit the buffer as a user turn. |
| `response.create` | Trigger a model response. Auto-sent by server when `turn_detection` is `server_vad`/`semantic_vad`. |
| `response.cancel` | Stop in-flight response (used for barge-in). |

### Server → Client events we need

| Event | When it fires |
|---|---|
| `session.created` | Initial. Echoes effective session config. |
| `session.updated` | Ack of `session.update`. SDK waits for this before resolving `connect()`. |
| `conversation.item.input_audio_transcription.completed` | User's final ASR transcript. **Requires `audio.input.transcription.model` set** (e.g. `gpt-4o-mini-transcribe` or `gpt-realtime-whisper`). |
| `input_audio_buffer.speech_started` | VAD detected user speech onset. **This is your barge-in trigger.** |
| `input_audio_buffer.speech_stopped` | VAD detected end of user turn. |
| `response.created` | Model started generating. |
| `response.audio_transcript.delta` | Streaming assistant transcript chunks (use for live captions). |
| `response.audio_transcript.done` | Final assistant transcript for that response. |
| `response.audio.delta` | Base64 PCM chunks (WebSocket only — WebRTC plays them via the audio track). |
| `response.audio.done` | Audio output finished. |
| `response.function_call_arguments.delta` | Streaming JSON args for a tool call. |
| `response.function_call_arguments.done` | Tool call args complete → time to execute. |
| `response.output_item.added` | A new output item (message or function_call) was added. |
| `response.done` | Response complete; contains full final state incl. all function calls. |
| `rate_limits.updated` | Per-response token/request budget. |
| `error` | Anything went wrong. |

### Sample `session.update` for this demo

```js
dc.send(JSON.stringify({
  type: "session.update",
  session: {
    type: "realtime",
    model: "gpt-realtime-2",
    output_modalities: ["audio"],          // omit "text" if you only want voice
    instructions: "You are an interview assistant...",
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        turn_detection: { type: "semantic_vad", create_response: true, interrupt_response: true },
        transcription: { model: "gpt-4o-mini-transcribe" }   // surfaces user transcripts
      },
      output: {
        format: { type: "audio/pcm" },
        voice: "marin"                     // or "cedar"
      }
    },
    tools: [/* see §5 */],
    tool_choice: "auto"
  }
}));
```

### When client sends `response.create` vs. when server auto-triggers

- With `turn_detection.create_response: true` (default for `server_vad` / `semantic_vad`): server auto-fires `response.create` after `speech_stopped`. You typically **don't** send it yourself for voice turns.
- For **text** turns injected via `conversation.item.create` (e.g. greeting, "ask the next interview question"): you DO send `response.create` manually.
- After returning a `function_call_output`: you DO send `response.create` to make the model speak the result. [20]

---

## 5. Function Calling on Realtime

### Declare tools in `session.update` (or per-turn in `response.create`)

```js
session.update -> session.tools: [
  {
    type: "function",
    name: "lookup_candidate",
    description: "Fetch a candidate profile by ID",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    }
  }
]
```

### Flow

1. Model decides to call. Server streams `response.function_call_arguments.delta` then `.done`. `response.done` also contains the full `function_call` item with `call_id`, `name`, `arguments` (JSON string).
2. Client parses args, runs business logic.
3. Client returns the result:

```js
// 1) append function_call_output
dc.send(JSON.stringify({
  type: "conversation.item.create",
  item: {
    type: "function_call_output",
    call_id: "<call_id from response.done>",
    output: JSON.stringify({ name: "Alex", score: 87 })   // string, format up to you
  }
}));

// 2) tell model to keep talking
dc.send(JSON.stringify({ type: "response.create" }));
```

`gpt-realtime-2` supports **parallel function calls** (multiple tools in flight) and **preambles** ("Let me check that...") so the user hears something while async tools resolve. [20][21]

MCP servers can also be declared with `type: "mcp"` — the API itself executes the remote tool; you only handle approval events. Probably overkill for this demo. [20]

---

## 6. Barge-in / Interruption

### With WebRTC + VAD (recommended path)

When `turn_detection.interrupt_response: true` is set, the **server handles barge-in automatically** when it detects the user speaking over the AI:

1. Server detects voice → emits `input_audio_buffer.speech_started`.
2. Server cancels the in-flight response (truncates assistant audio at the actual playback position).
3. WebRTC audio stream stops playing the assistant.
4. New user turn begins.

The Agents SDK (`@openai/agents-realtime`) wraps this with "automatic interruption handling and local conversation history updates." [22]

### Manual barge-in (WebSocket path or custom logic)

On `input_audio_buffer.speech_started`:

```js
ws.send(JSON.stringify({ type: "response.cancel" }));
// Also: truncate the spoken portion so context reflects what user actually heard
ws.send(JSON.stringify({
  type: "conversation.item.truncate",
  item_id: "<assistant_item_id>",
  content_index: 0,
  audio_end_ms: <ms_of_audio_actually_played>
}));
```

`response.cancel` halts generation but does not by itself rewrite history — `conversation.item.truncate` is what keeps the model's context consistent with what the user actually heard. [18]

---

## 7. Voice Options (current)

Verified against the Realtime sessions reference [23][24]:

| Voice | Notes |
|---|---|
| `alloy` | Original. |
| `ash` | Original. |
| `ballad` | Original. |
| `coral` | Original. |
| `echo` | Original. |
| `sage` | Original. |
| `shimmer` | Original. |
| `verse` | Original. |
| **`marin`** | New (Aug 2025). **Recommended for best quality** by OpenAI. |
| **`cedar`** | New (Aug 2025). **Recommended for best quality** by OpenAI. |

> **CHANGED FROM EARLIER**: `marin` and `cedar` are the current OpenAI-recommended defaults — not `alloy`. The eight original voices were also re-recorded for higher quality in late 2025.

You can also supply **custom voices** via `{ id: "voice_1234" }` (gated — contact OpenAI). [23]

Constraint: **voice cannot be changed mid-session once the model has produced audio at least once.** Lock it in `session.update` before first audio. [23]

`fable`, `nova`, `onyx` exist in the standard TTS endpoint but are **NOT** available in the Realtime API. [24]

---

## 8. Known Limitations (as of 2026-05-14)

| Limit | Value | Source |
|---|---|---|
| Max session duration | **60 minutes** (hard cap, no extension) | [15] |
| Ephemeral token TTL default | 60 s; configurable via `expires_after.seconds` | [13][14] |
| Context window | `gpt-realtime-2`: **128K**. `gpt-realtime-1.5` / `gpt-realtime` / `gpt-realtime-mini`: 32K | [3][6][7] |
| Max output tokens per response | 4,096 (mini); higher on flagship — configurable via `max_response_output_tokens` | [25] |
| Audio sample rate | **24 kHz PCM only** for output; PCM/G.711/Opus for input | [23] |
| Tier 1 RPM / TPM | 200 RPM / 40,000 TPM / 1,000 RPD | [25] |
| Tier 2 | 400 RPM / 200,000 TPM | [25] |
| Tier 3 | 5,000 RPM / 800,000 TPM | [25] |
| Tier 4 | 10,000 RPM / 4M TPM | [25] |
| Tier 5 | 20,000 RPM / 15M TPM | [25] |
| Free tier | **Not supported** on Realtime | [25] |
| Truncation behavior | Server drops oldest items when context exceeded; configurable via `token_limits` | [25] |
| Audio token cost reality | ~800–1,200 audio input tokens / min, ~1,500–2,000 output / min — so ~$0.30/min uncached on `gpt-realtime-2`, ~$0.06/min cached | [26] |
| Cost-saving lever | Prompt-cache discount is **~80x** on audio inputs ($32 → $0.40 / 1M). Wire system prompts + tool schemas correctly. | [26] |
| Live translation viability | Use dedicated `gpt-realtime-translate` (`/v1/realtime/translations`) — NOT the voice-agent endpoint. Don't call `response.create` on translation sessions. | [10][27] |

---

## 9. Recommended npm Packages

### Official (use these for a demo)

| Package | Latest | Weekly DLs | Notes |
|---|---|---|---|
| **`@openai/agents`** (umbrella) | tracks `agents-core` (v0.11.x as of May 2026) | very high | Bundles `@openai/agents/realtime`. **Recommended starting point** per OpenAI docs. [22] |
| **`@openai/agents-realtime`** | **0.11.1** (published 2026-05-09) | 706.7K | Standalone realtime package. `RealtimeAgent`, `RealtimeSession`, `OpenAIRealtimeWebRTC`, `OpenAIRealtimeWebSocket`, `OpenAIRealtimeSIP`. [28][29] |
| `@openai/agents-core` | 0.11.1 | n/a | Underlying agent runtime. Pulled in transitively. |
| `openai` (main SDK) | latest | n/a | Has `client.realtime` resource for raw event control. Useful when you want to bypass the agents abstraction. |

Install for our case:

```bash
npm install @openai/agents zod
# or, for narrower scope:
npm install @openai/agents-realtime
```

### Minimal browser quickstart with the SDK [30]

```ts
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

const agent = new RealtimeAgent({
  name: 'Interviewer',
  instructions: 'You conduct friendly, structured technical interviews.',
});

const session = new RealtimeSession(agent, { model: 'gpt-realtime-2' });

// Browser auto-picks WebRTC, attaches mic + speaker
await session.connect({ apiKey: ephemeralKey });  // ek_... from your /token endpoint
```

In Node.js the same SDK auto-falls back to WebSocket. [30]

### Reference implementations to crib from

- **`openai/openai-realtime-agents`** — Next.js + Agents SDK, multi-agent handoffs, chat-supervisor pattern. Active. [31]
- **`openai/openai-realtime-console`** — React + Express + WebRTC. Simpler. **Caveat: main branch last pushed 2025-08-28, still references `gpt-4o-realtime-preview-2024-12-17`. Useful for transport patterns, NOT for current model IDs.** [32]
- `openai/realtime-voice-component` — drop-in React component with `sessionEndpoint` pattern; uses unified-interface auth flow (server proxies SDP). [17]

---

## 10. Quick Architecture Recommendation for the Demo

Based on the above, the lowest-risk shape for this interview demo:

1. **Frontend**: React + `@openai/agents-realtime` over WebRTC. `RealtimeAgent` + `RealtimeSession` give automatic VAD/interruption/history.
2. **Backend**: Tiny Node/Express endpoint `POST /token` that calls `POST /v1/realtime/client_secrets` with `OpenAI-Safety-Identifier` header and returns `{ value, expires_at }` to the browser.
3. **Model**: `gpt-realtime-2`, voice `marin` or `cedar`, `turn_detection: { type: "semantic_vad", interrupt_response: true }`.
4. **Captions**: Hook `response.audio_transcript.delta` + `conversation.item.input_audio_transcription.completed` for live transcript UI.
5. **Tools**: Declare 1–2 function tools in `session.update` to demo tool use; return results via `conversation.item.create` (`type: function_call_output`) + `response.create`.
6. **Budget guard**: Session auto-caps at 60 min, but enforce your own `setTimeout` to close after, say, 10 min in case the candidate doesn't.

---

## Caveats / Not Found

- `gpt-realtime-mini` context window — one OpenAI page says 32K, third-party listing says 128K. Treat as 32K unless you re-verify on the model page right before relying on long history.
- Exact text-token rates for `gpt-realtime-2` aren't published as a discrete line item (the announcement focused on audio token pricing). The realtime-cost guide implies text falls back to standard GPT pricing tiers; check the model page once the demo's prompt-cache strategy matters.
- The `expires_after.seconds` upper bound isn't documented explicitly — historical reports say 600 s works; longer values may be rejected. Test before relying on >10 min tokens.
- The unified-interface flow (browser POSTs to your server, your server proxies SDP to OpenAI) is OpenAI's newer "simpler" path but puts your server in the audio bootstrap critical path. For the demo, the classic ephemeral-token flow is fine and gives the browser a direct link to OpenAI.

---

## Sources

[1] OpenAI — "Advancing voice intelligence with new models in the API" (2026-05-07). <https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/>
[2] AwesomeAgents — GPT-Realtime-2 spec sheet. <https://awesomeagents.ai/models/gpt-realtime-2/>
[3] OpenAI Docs — "Using realtime models". <https://developers.openai.com/api/docs/guides/realtime-models-prompting>
[4] OpenAI Docs — "Realtime and audio". <https://platform.openai.com/docs/guides/realtime>
[5] OpenAI Pricing — gpt-realtime-1.5. <https://openai.com/api/pricing>
[6] OpenAI Docs — gpt-realtime model page. <https://platform.openai.com/docs/models/gpt-realtime>
[7] OpenAI Docs — gpt-realtime-mini model page. <https://developers.openai.com/api/docs/models/gpt-realtime-mini>
[8] modelavailability.com — GPT Realtime Pricing Calculator. <https://modelavailability.com/tools/gpt-realtime-calculator>
[9] OpenAI Docs — Deprecations. <https://platform.openai.com/docs/deprecations>
[10] OpenAI Docs — "Realtime API with WebRTC". <https://platform.openai.com/docs/guides/realtime-webrtc>
[11] OpenAI Agents SDK — "Realtime Transport Layer". <https://openai.github.io/openai-agents-js/guides/voice-agents/transport>
[12] OpenAI Docs — "Webhooks and server-side controls". <https://developers.openai.com/api/docs/guides/realtime-server-controls>
[13] OpenAI API Reference — Client Secrets. <https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/>
[14] OpenAI API Reference — Create session (legacy). <https://developers.openai.com/api/reference/resources/realtime/subresources/sessions/methods/create>
[15] OpenAI Docs — "Realtime conversations" (max 60 min). <https://developers.openai.com/api/docs/guides/realtime-conversations>
[16] GitHub — openai/openai-realtime-agents issue #119 (session duration enforcement). <https://github.com/openai/openai-realtime-agents/issues/119>
[17] GitHub — openai/realtime-voice-component authentication.md. <https://github.com/openai/realtime-voice-component/blob/main/docs/authentication.md>
[18] OpenAI API Reference — Realtime client & server events. <https://platform.openai.com/docs/api-reference/realtime-client-events/session/update>
[19] OpenAI Python SDK — Realtime Events. <https://mintlify.com/openai/openai-python/api/realtime/events>
[20] OpenAI Docs — "Realtime with tools" (function calls, MCP). <https://developers.openai.com/api/docs/guides/realtime-mcp>
[21] OpenAI Docs — Realtime function calling. <https://platform.openai.com/docs/guides/realtime-function-calling>
[22] OpenAI Agents SDK — Voice Agents overview. <https://openai.github.io/openai-agents-js/guides/voice-agents/>
[23] OpenAI API Reference — Realtime Sessions (voice list). <https://developers.openai.com/api/reference/resources/realtime/subresources/sessions/>
[24] OpenAI Docs — Text to speech (voice list contrast). <https://developers.openai.com/api/docs/guides/text-to-speech>
[25] OpenAI Docs — Rate limits + gpt-realtime model rate-limit table. <https://developers.openai.com/api/docs/models/gpt-realtime>
[26] Fora Soft — "OpenAI Realtime API: Production Voice Agents (2026)". <https://www.forasoft.com/blog/article/openai-realtime-api-voice-agent-production-guide-2026>
[27] OpenAI Docs — Managing Realtime costs. <https://developers.openai.com/api/docs/guides/realtime-costs>
[28] npm — `@openai/agents-realtime` (0.11.1, May 9 2026). <https://www.npmjs.com/package/@openai/agents-realtime>
[29] GitHub — openai/openai-agents-js. <https://github.com/openai/openai-agents-js>
[30] OpenAI Agents SDK — Voice Agents Quickstart. <https://openai.github.io/openai-agents-js/guides/voice-agents/quickstart>
[31] GitHub — openai/openai-realtime-agents. <https://github.com/openai/openai-realtime-agents>
[32] GitHub — openai/openai-realtime-console. <https://github.com/openai/openai-realtime-console>
