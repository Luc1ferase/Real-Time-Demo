# Research: Gemini Live API — current state for multi-provider integration

- **Query**: Can we use Gemini Live API as a free-tier alternative / second provider alongside OpenAI Realtime?
- **Scope**: External (Google AI Studio docs + live probe)
- **Date**: 2026-05-14
- **Method**: Listed all models via `GET https://generativelanguage.googleapis.com/v1beta/models` with a real Google AI Studio key; opened a real WebSocket bidi session against `gemini-3.1-flash-live-preview` and observed `setupComplete: {}` within ~1.1 s.
- **Confidence**: HIGH for model availability and protocol shape; MEDIUM on exact free-tier quotas (Google publishes them only in the logged-in AI Studio dashboard).

---

## 1. Models verified accessible (free-tier API key)

| Model ID | `supportedGenerationMethods` | Use |
|---|---|---|
| `models/gemini-3.1-flash-live-preview` | `bidiGenerateContent` | **Primary target** — newest Live preview, GPT-3.1-class. |
| `models/gemini-2.5-flash-native-audio-latest` | `countTokens`, `bidiGenerateContent` | Alias to latest 2.5 native-audio. |
| `models/gemini-2.5-flash-native-audio-preview-12-2025` | `countTokens`, `bidiGenerateContent` | Latest 2.5 snapshot. |
| `models/gemini-2.5-flash-native-audio-preview-09-2025` | `countTokens`, `bidiGenerateContent` | Older 2.5 snapshot. |

Live family supports ONLY `bidiGenerateContent` — there is no REST `generateContent` for Live audio.

## 2. Pricing (per Google AI Studio pricing page, 2026-05-14)

| Model | Free tier? | Audio in (paid) | Audio out (paid) | Text in (paid) | Text out (paid) |
|---|---|---|---|---|---|
| `gemini-3.1-flash-live-preview` | **Yes** | $3.00/1M (~$0.005/min) | $12.00/1M (~$0.018/min) | $0.75/1M | $4.50/1M |
| `gemini-2.5-flash-native-audio-preview-12-2025` | **Yes** | $3.00/1M | $12.00/1M | $0.50/1M | $2.00/1M |

For comparison, OpenAI `gpt-realtime-2`: $32 / $64 per 1M audio in/out. **Gemini ≈ 10× cheaper** at paid tier.

**Free-tier quotas**: Google does NOT publish per-model RPM/TPM/RPD on public pages. Free-tier limits are only visible at <https://aistudio.google.com/rate-limit> while signed in. Historically: 5–15 RPM, a few hundred RPD, low TPM for preview models. **For this demo plan accordingly — verify in dashboard before relying.**

## 3. Connection / protocol

### Endpoint

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<API_KEY>
```

### Auth model — CRITICAL DIFFERENCE FROM OPENAI

- **OpenAI**: mint short-lived `ek_...` ephemeral token server-side, browser uses that. API key never leaves server.
- **Gemini**: API key passed directly as `?key=` query parameter. There is **no ephemeral token concept**. Anything connecting (server OR browser) must hold the real key.

Implications for our demo:
- Browser-side connection is simplest but exposes the key in network panel.
- Server-side WS proxy is more secure but adds latency and Vercel Edge functions don't support long-lived WS gracefully.
- For this gated demo we accept the exposure (gate cookie limits audience). README must call this out.

### Minimal handshake — verified live on 2026-05-14

```js
const ws = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`
);

ws.onopen = () => {
  ws.send(JSON.stringify({
    setup: {
      model: "models/gemini-3.1-flash-live-preview",
      generationConfig: { responseModalities: ["AUDIO"] },
    },
  }));
};
ws.onmessage = (ev) => { /* first message back: { setupComplete: {} } */ };
```

Observed: `OPEN` at ~830 ms, `{"setupComplete":{}}` at ~1120 ms. No errors.

### Event protocol (vs OpenAI Realtime)

| Concern | OpenAI Realtime | Gemini Live |
|---|---|---|
| Configure session | `session.update` (sent after `session.created`) | `setup` (sent first; server replies `setupComplete`) |
| Send user audio | WebRTC handles, or `input_audio_buffer.append` (WS) | `realtimeInput: { mediaChunks: [{ mimeType, data }] }` |
| Receive AI audio | WebRTC media track, or `response.audio.delta` | `serverContent: { modelTurn: { parts: [{ inlineData }] } }` |
| User transcript | `conversation.item.input_audio_transcription.completed` | `serverContent: { inputTranscription }` (when enabled in setup) |
| AI transcript | `response.audio_transcript.delta` / `.done` | `serverContent: { outputTranscription }` |
| AI turn ended | `response.done` | `serverContent: { turnComplete: true }` |
| User started talking (VAD) | `input_audio_buffer.speech_started` | server-side VAD; `serverContent: { interrupted: true }` on barge-in |
| Function call request | `response.function_call_arguments.done` then full call item in `response.done` | `toolCall: { functionCalls: [...] }` |
| Return function result | `conversation.item.create` (type `function_call_output`) + `response.create` | `toolResponse: { functionResponses: [...] }` |

Differences require a per-provider adapter — there is no clean superset.

### Audio formats

| | OpenAI | Gemini |
|---|---|---|
| Input | 24 kHz, 16-bit PCM, little-endian | **16 kHz**, 16-bit PCM, little-endian |
| Output | 24 kHz, 16-bit PCM | 24 kHz, 16-bit PCM |

Browser `getUserMedia` typically captures at 48 kHz. The Gemini path needs a downsample step (Web Audio API `OfflineAudioContext` resample, or capture with `audio: { sampleRate: 16000 }` constraint — but the constraint is best-effort, not all UAs honor it).

### Voices

`Puck` (default), `Charon`, `Kore`, `Fenrir`, `Aoede`. Set in `setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`.

## 4. Known gaps vs OpenAI

- **No dedicated translation endpoint**. Gemini Live can be prompted to translate, but expect "Sure, here's the translation..." style leakage that OpenAI's `gpt-realtime-translate` avoids by design. → /translator route stays OpenAI-only.
- **No WebRTC option**. WS-only. → Gemini provider impl can't reuse the OpenAI agents SDK at all.
- **No reasoning-effort knob** like OpenAI `gpt-realtime-2`'s `minimal..xhigh`. Gemini 3.1 has separate `gemini-3.1-flash-live-preview` (live, single-tier) and `gemini-3.1-pro-preview` (non-live, deeper reasoning).
- **Session length**: not explicitly published; informal reports say 15 min default with `sessionResumption` to extend up to ~2 hours. Less generous than OpenAI's 60-min hard cap with no extension.

## 5. Recommended npm package

`@google/genai` (Google's TS SDK). It exposes a `live` namespace with `client.live.connect()` returning a session object similar in shape to `RealtimeSession` from `@openai/agents-realtime`. Use it instead of hand-rolling the WebSocket where convenient — but be prepared to drop to raw WS if the SDK lags behind the latest preview model.

## 6. Recommendation for this demo

- Build a `RealtimeProvider` interface and ship two impls: OpenAI (existing) and Gemini.
- Default to Gemini `gemini-3.1-flash-live-preview` during dev (free); make OpenAI the default in production via env flag.
- Keep `/translator` OpenAI-only; mark it visually in the provider switcher.
- Treat the Gemini API key as semi-public during demo phase. Rotate weekly. Use a dedicated key (not your personal one) with usage caps once Google exposes them on the key.

## Sources

- Live probe transcript: this conversation, 2026-05-14, model `gemini-3.1-flash-live-preview`, response `{"setupComplete":{}}` in ~1.1 s.
- Pricing: <https://ai.google.dev/gemini-api/docs/pricing>
- Live API docs (audio formats, protocol shape): <https://ai.google.dev/gemini-api/docs/live>
- Rate-limits page (free-tier numbers behind login): <https://aistudio.google.com/rate-limit>
- Model listing: `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` (verified 2026-05-14)
