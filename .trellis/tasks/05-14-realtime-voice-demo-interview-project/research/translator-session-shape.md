# Research: OpenAI Realtime Translation session shape

- **Query**: What is the exact `POST /v1/realtime/client_secrets` payload, the SDP endpoint, the event-stream shape, and the language config for OpenAI's dedicated `gpt-realtime-translate` realtime translation session?
- **Scope**: External (developers.openai.com + openai-node SDK types)
- **Date**: 2026-05-14
- **Confidence**: HIGH — pulled from OpenAI's published reference, the
  cookbook example for `gpt-realtime-translate`, and the official
  `openai@latest` TypeScript declarations in this repo's `node_modules`
  (`resources/realtime/realtime.d.ts`). Cross-checked across all three.
- **Author note**: We did NOT need to experiment against the live API
  for PR5 — the SDK's TS types and the cookbook between them are
  authoritative on every field this PR exercises.

---

## 1. Ephemeral-token mint (server → OpenAI)

### Endpoint

`POST https://api.openai.com/v1/realtime/client_secrets` — **same endpoint
as voice-agent sessions.** The session SHAPE (not the URL) tells OpenAI
this is a translation session vs a chat session.

### Request body — canonical

```json
{
  "session": {
    "type": "translation",
    "model": "gpt-realtime-translate",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-realtime-whisper" },
        "noise_reduction": { "type": "near_field" }
      },
      "output": { "language": "en" }
    }
  },
  "expires_after": { "anchor": "created_at", "seconds": 600 }
}
```

### Key fields

| Field | Required? | Effect |
|---|---|---|
| `session.type` | **YES** — must be `"translation"`. This is the discriminator that makes the rest of the schema a `RealtimeTranslationSessionCreateRequest` rather than a `RealtimeSessionCreateRequest`. | Tags the session as continuous-translation; disables the response/turn lifecycle. |
| `session.model` | **YES** — `"gpt-realtime-translate"` (only). | Locks in the translation model. |
| `session.audio.input.transcription.model` | Optional. Use `"gpt-realtime-whisper"`. | When set, server emits `session.input_transcript.delta` events with the source-language transcript. **Without this you do NOT get source transcripts** — you'd only see the translated transcript and translated audio. |
| `session.audio.input.transcription.language` | Optional. ISO-639-1 code (`"zh"`, `"en"`, `"ja"`, …). | Hint to the whisper transcription model. Omit for auto-detect on the source. |
| `session.audio.input.noise_reduction.type` | Optional. `"near_field"` or `"far_field"`. | Mic preprocessing. `near_field` for laptop / headset; `far_field` for room-distance mics. |
| `session.audio.output.language` | Optional but effectively required. ISO-639-1 (`"en"`, `"zh"`, …). | Target language for translated audio and translated transcript. Currently 13 output languages supported. |
| `expires_after.seconds` | Optional. 10–7200, default 600. | TTL for the ephemeral secret. We use 600 s like the chat token route. |

### Response

```json
{
  "value": "ek_...",
  "expires_at": 1747200000,
  "session": {
    "id": "sess_...",
    "type": "translation",
    "model": "gpt-realtime-translate",
    "audio": { "input": { ... }, "output": { "language": "en" } },
    "expires_at": 1747200000
  }
}
```

The `value` is the ephemeral `ek_...` secret the browser uses to POST
its SDP offer. **Same shape as the chat-session client-secret response**;
only `session.type` differs (`"translation"` vs `"realtime"`).

### Source-language story (important — read carefully)

There is **NO `session.audio.input.language`** in the translation
schema. Source-language auto-detect is the model's default and cannot
be turned off. The closest thing to "user picks a source language" is
to put a `language` hint on `audio.input.transcription` — but that hint
only narrows the WHISPER source-transcript model, not the translation
model itself. The translation model auto-detects regardless.

Practical consequence for UI: a source-language picker on /translator
maps to `audio.input.transcription.language`, NOT to a top-level source
language. "Auto" means we omit the hint and let whisper detect.

---

## 2. WebRTC SDP exchange (browser → OpenAI)

### Endpoint

`POST https://api.openai.com/v1/realtime/translations/calls`

**DIFFERENT from chat.** Chat posts to `/v1/realtime/calls`; translation
posts to `/v1/realtime/translations/calls`. If you reuse the chat URL
you'll get a 400/404 — the server routes by URL on this leg.

### Request

```http
POST /v1/realtime/translations/calls
Authorization: Bearer ek_...                  # ephemeral token from §1
Content-Type: application/sdp

<SDP offer text>
```

### Response

```http
200 OK
Location: /v1/realtime/calls/rtc_xxxxxx
Content-Type: application/sdp

<SDP answer text>
```

### Data channel

Same name as chat: `"oai-events"`. JSON-encoded events in both directions.

---

## 3. Event protocol — what we actually consume

### Server → Client events (data channel)

| Event | Emitted when | Use |
|---|---|---|
| `session.created` | Connection established. | Echoes effective session config. We log it. |
| `session.updated` | After we send `session.update`. | Ack only — we don't strictly need it. |
| `session.input_transcript.delta` | Source-language transcript fragment available. **Only emitted when `audio.input.transcription` is configured in session.** | Append to current source row. |
| `session.output_transcript.delta` | Translated-language transcript fragment available. | Append to current translation row. |
| `session.output_audio.delta` | 200 ms PCM16 chunk of translated audio. **WebRTC path: we DON'T consume this from the data channel** — translated audio arrives on the WebRTC media track instead. The delta event still fires for parity, but we ignore it in browser code. | (WebSocket only.) |
| `session.closed` | Server flushed and ended the session. | Move to "ended" phase. |
| `error` | Anything went wrong. | Surface in UI. |

### Pairing rule (the bit the docs don't spell out)

OpenAI's translation server does NOT emit explicit "turn boundary"
events around an utterance the way the voice-agent path does. Both
`session.input_transcript.delta` and `session.output_transcript.delta`
stream **continuously** — there is no per-utterance final event in this
schema. To build a paired UI we need to bucket deltas client-side.

Our heuristic for PR5: a new utterance row starts whenever an input
transcript delta arrives after a quiet gap of ≥ ~1.2 s OR whenever the
delta text begins after a sentence-terminator (`.`, `?`, `!`, `。`, `？`,
`！`). This is good enough for a demo paired view. The hook owns this
heuristic so the page just renders the resulting `entries[]`.

> If PR6 wants tighter pairing it should instead key on the
> `elapsed_ms` field on each delta (advances in 200 ms increments and
> resets visually at speech-stop). Out of scope here.

### Client → Server events we send

| Event | When |
|---|---|
| `session.update` | Right after the data channel opens — applies any post-mint changes (in our case, nothing critical; the mint already set everything). We send it idempotently for parity with the cookbook sample. |
| `session.close` | When the user clicks "End". Lets the server flush pending output. |

We **do NOT** send `response.create`, `conversation.item.create`,
`input_audio_buffer.append`, or `input_audio_buffer.commit`. The
WebRTC media track is the only audio input path.

---

## 4. Audio formats

| Direction | Format |
|---|---|
| Input  | 24 kHz mono PCM16. Same as chat. WebRTC handles encoding for us. |
| Output | 24 kHz mono PCM16. Arrives on the WebRTC remote audio track — we mount an `<audio>` element with `srcObject = remoteStream` and the browser plays it. |

PR3's `audio-capture.ts` is reusable as-is at `targetSampleRate: 24000`
— BUT: since we use WebRTC for translation, we don't need to push our
own PCM. WebRTC manages mic capture inside the peer connection. We
only call `pc.addTrack(micTrack)` like the chat path. So
`audio-capture.ts` is **not actually invoked on the translator route**;
PR5 doesn't import it.

---

## 5. Available languages (as of 2026-05-14)

- **Input** (source, auto-detected): 70+ languages — see model card.
- **Output** (translated, picked via `audio.output.language`): 13 — the
  set OpenAI has trained TTS for. Per the model docs, the safe subset
  we offer in the UI is `en, zh, es, ja, fr, de, ko, pt`. That's 8.

We deliberately cap at 8 in the picker to keep it scannable. PR6 can
expand if needed.

---

## 6. Worth knowing, not coded against

- Voice selection: translation sessions DON'T accept a `voice` field —
  the model picks a default TTS voice based on output language. So the
  voice selector that exists in the gear-drawer is correctly hidden
  from /translator.
- Instructions: translation sessions DON'T accept an `instructions`
  field either. The "no chatty preamble" behavior comes from the model
  itself, not from prompt engineering. This is exactly why we use the
  dedicated endpoint instead of prompt-hacking `gpt-realtime-2`.
- Tools / function calling: not supported on translation sessions.
- Session length: the same 60-minute hard cap applies (per the parent
  Realtime guide). Idle/hard-cap watchdog in PR5 mirrors /interview.

---

## 7. Canonical session config we send (final, for PR5)

```ts
// Inside src/app/api/realtime/translator-token/route.ts
const sessionConfig = {
  type: "translation",
  model: "gpt-realtime-translate",
  audio: {
    input: {
      transcription: {
        model: "gpt-realtime-whisper",
        // Only set when caller passes a source_language hint. Omit
        // entirely for auto-detect (the default UI state).
        ...(source_language ? { language: source_language } : {}),
      },
      noise_reduction: { type: "near_field" },
    },
    output: { language: target_language },
  },
} as const;
```

Wrapped in the same outer `{ session, expires_after }` envelope as the
chat-token route, with the `OpenAI-Safety-Identifier` header preserved.

---

## Sources

- OpenAI Realtime translation guide:
  <https://developers.openai.com/api/docs/guides/realtime-translation>
- OpenAI cookbook — Build Live Translation Apps with
  gpt-realtime-translate:
  <https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide>
- OpenAI Realtime translation server events reference:
  <https://developers.openai.com/api/reference/resources/realtime/translation-server-events>
- gpt-realtime-translate model card:
  <https://developers.openai.com/api/docs/models/gpt-realtime-translate>
- Local SDK types (authoritative for typed surface):
  `node_modules/openai/resources/realtime/realtime.d.ts` — search for
  `RealtimeTranslationSessionCreateRequest`,
  `RealtimeTranslationInputTranscriptDeltaEvent`,
  `RealtimeTranslationOutputTranscriptDeltaEvent`,
  `RealtimeTranslationClientSecretCreateResponse`.
