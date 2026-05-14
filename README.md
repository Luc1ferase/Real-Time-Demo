# Realtime Voice Demo

> A small, opinionated portfolio project that ships two voice agents on top of OpenAI's May 2026 Realtime API and Google's Gemini Live API, with a runtime provider switch, function-call-driven interview flow, dedicated live-translation endpoint, and a localStorage-backed history page. Built end-to-end in roughly two days to learn the new APIs and to dogfood the engineering trade-offs around multi-provider voice agents.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLuc1ferase%2FReal-Time-Demo&env=OPENAI_API_KEY,GOOGLE_AI_STUDIO_KEY,DEMO_PASSWORD&envDescription=Server-only%20secrets%20%E2%80%94%20see%20.env.example&envLink=https%3A%2F%2Fgithub.com%2FLuc1ferase%2FReal-Time-Demo%2Fblob%2Fmain%2F.env.example)

---

## Demo

Drop a screenshot or GIF at `docs/screenshot.png` and it will render here:

![Realtime Voice Demo — interview screen with stage indicator and live transcript](docs/screenshot.png)

The same chrome works for `/translator` (paired transcript) and `/history` (past sessions list).

---

## Architecture

```mermaid
flowchart LR
  Browser["Browser<br/>(React + Web Audio + WebRTC)"]
  Proxy["Edge proxy<br/>password gate"]
  TokenAPI["Route Handlers<br/>token / translate / env-check"]
  OpenAI["OpenAI Realtime API<br/>gpt-realtime-2<br/>gpt-realtime-translate"]
  Gemini["Google Gemini Live<br/>gemini-3.1-flash-live-preview"]
  LS[("localStorage<br/>history + settings")]

  Browser -->|gate cookie| Proxy
  Proxy -->|app routes| Browser
  Browser -->|POST /api/realtime/token/openai| TokenAPI
  Browser -->|POST /api/realtime/token/gemini| TokenAPI
  Browser -->|POST /api/translate| TokenAPI
  TokenAPI -->|mint ephemeral / forward chat| OpenAI
  Browser -.->|WebRTC SDP + media| OpenAI
  Browser -.->|WebSocket bidi PCM<br/>(raw AI Studio key)| Gemini
  Browser <--> LS
```

Server-side surface area is intentionally minimal: ephemeral-token mint, translation forward, password gate. All voice traffic flows browser-to-provider once a session is established.

---

## Tech stack

| Layer            | Choice                                                                                        | Why                                                            |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + React 19 + TypeScript strict                                        | Server-mintable secrets, edge proxy, route handlers in one repo |
| Styling          | Tailwind v4 + shadcn/ui (Radix primitives)                                                    | Minimal hand-written CSS, accessible components out of the box |
| Realtime (OpenAI)| `@openai/agents` (Realtime helpers) over WebRTC                                               | Built-in semantic VAD, barge-in, transcript stream             |
| Realtime (Gemini)| `@google/genai` over native WebSocket bidi (`bidiGenerateContent`)                            | The only transport Gemini Live currently supports              |
| Audio            | Web Audio API + `AudioWorklet` for 16 kHz / 24 kHz capture and playback                       | Lossless resample, low-latency PCM16 streaming                 |
| Validation       | Zod 4                                                                                          | Token route bodies + persisted localStorage schemas            |
| Deployment       | Vercel (edge proxy + node route handlers)                                                     | Zero infra; region pinned via `vercel.json` for OpenAI latency |

---

## What's inside

- **Multi-provider voice agent.** Runtime switch between OpenAI Realtime (`gpt-realtime-2`) and Google Gemini Live (`gemini-3.1-flash-live-preview`) without page reload — the settings drawer rebuilds the session.
- **AI Mock Interviewer (`/interview`).** Structured warm-up → technical → behavioral → feedback flow. The model calls `advance_stage` to progress and `generate_scorecard` to finish with three numeric dimensions plus a written summary.
- **Live Translator (`/translator`).** Streaming speech-to-speech translation using OpenAI's dedicated `gpt-realtime-translate` endpoint (`/v1/realtime/translations/calls`), with paired source/target transcripts.
- **Live caption overlay.** Optional in-interview overlay translates the interviewer's turns into your chosen language via a chat-completion side-channel — zero interference with the live Realtime session.
- **localStorage interview history.** Each interview is persisted on terminal transitions (completion / ended-early / timeout / error). `/history` lists past sessions with a slide-in detail view, individual delete, and a clear-all confirm.
- **60-min hard cap + 10-min idle watchdog.** Friendly warnings before either fires; the idle timeout always disconnects, the hard cap surfaces a heads-up at the 59-minute mark.

---

## Provider comparison

A condensed view of the facts that drove this project's design decisions. Source: `.trellis/tasks/05-14-realtime-voice-demo-interview-project/research/realtime-api-overview.md` and `.../research/gemini-live-api.md`.

| Capability               | OpenAI Realtime                                              | Gemini Live                                                  |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Endpoint                 | `POST /v1/realtime/client_secrets` → WebRTC SDP `/v1/realtime/calls` | WebSocket `wss://generativelanguage.googleapis.com/.../bidiGenerateContent` |
| Auth model               | Server mints **ephemeral `ek_…`**, browser uses that         | Raw AI Studio API key passed via `?key=…` (no ephemeral concept) |
| Input audio              | 24 kHz mono PCM16 (WebRTC handles encoding)                  | **16 kHz** mono PCM16 (`realtimeInput.mediaChunks`)          |
| Output audio             | 24 kHz on the WebRTC media track                             | 24 kHz PCM16 streamed in `serverContent.modelTurn` parts     |
| Voices                   | 10 (`marin`, `cedar`, `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`) | 5 (`Puck`, `Charon`, `Kore`, `Fenrir`, `Aoede`)              |
| Function calling         | Yes — `tools` + `tool_choice` on session config              | Yes — `toolCall` / `toolResponse` messages on the WS         |
| Native translation       | **Yes** — dedicated `gpt-realtime-translate` + `/v1/realtime/translations/calls` (flat $0.034/min) | No — must prompt the generic live model                      |
| Default model used here  | `gpt-realtime-2`                                             | `gemini-3.1-flash-live-preview`                              |
| Per-minute audio cost\*  | ~$32 in / $64 out per 1M tokens (~$0.30–0.40 /min)            | ~$3 in / $12 out per 1M tokens (~$0.03–0.04 /min, ≈10× cheaper) |

\* Approximate as of May 2026. Always confirm against the providers' live pricing pages before deploying.

---

## Security model

Three independent layers, deliberately scoped at "demo behind a shared password" rather than "production multi-tenant":

1. **Edge proxy gate.** `src/proxy.ts` rejects every request without a valid signed cookie and bounces the user to `/gate`. The cookie is an HMAC of `DEMO_PASSWORD` with a 24-hour TTL. Rotate `DEMO_PASSWORD` to invalidate every outstanding session.
2. **OpenAI ephemeral tokens.** `OPENAI_API_KEY` only exists in server route handlers (`/api/realtime/token/openai`, `/api/realtime/translator-token`, `/api/translate`). The browser receives a 10-minute `ek_…` secret derived from `POST /v1/realtime/client_secrets`. The raw key never crosses the network boundary.
3. **Gemini direct-key exposure (acknowledged trade-off).** Gemini Live has no ephemeral-token concept as of May 2026 (`bidiGenerateContent` is auth'd via `?key=…` on the URL). After the gate cookie check, the browser is handed the raw `GOOGLE_AI_STUDIO_KEY`. Hardening recommendations:
   - Use a dedicated low-quota key.
   - Rotate weekly.
   - For real production, replace this path with a server-side WebSocket proxy that holds the key and forwards frames to the browser; the demo's gemini-provider client already abstracts the transport, so the swap is contained.

No analytics, no third-party trackers, no PII written to disk on the server. Interview transcripts are stored in **browser localStorage** under the user's control (clear-all wipes the key in one click).

---

## Quickstart

```bash
git clone https://github.com/Luc1ferase/Real-Time-Demo.git
cd Real-Time-Demo
npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
# edit .env.local — fill in OPENAI_API_KEY (optional if Gemini-only),
# GOOGLE_AI_STUDIO_KEY (optional if OpenAI-only), and DEMO_PASSWORD.
npm run dev
# open http://localhost:3000 — enter DEMO_PASSWORD on the gate page.
```

Quality gates:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint with the Next.js + react-compiler ruleset
npm run build        # production build (matches what Vercel runs)
```

A single provider key is enough — the settings drawer shows which providers are configured (via `/api/realtime/env-check`).

---

## Deploy to Vercel

1. Click the **Deploy** button at the top of this README (or `vercel --prod` from a clone).
2. Set the three required environment variables in the Vercel project's "Environment Variables" panel:
   - `OPENAI_API_KEY` — server-only; must have Realtime API access.
   - `GOOGLE_AI_STUDIO_KEY` — leak-tolerant key with `gemini-3.1-flash-live-preview` access; see security note above.
   - `DEMO_PASSWORD` — anything; rotate to invalidate all gate cookies at once.
3. `vercel.json` pins the function region to `iad1` (US East) to keep WebRTC SDP latency to OpenAI's east-coast clusters low. Delete it if you'd rather let Vercel choose.

Custom domains: add via Vercel's domains panel. No `.well-known` proofs ship in this repo — add them under `public/.well-known/` if your domain provider needs them.

---

## Routes

| Route                              | Kind                | Purpose                                                                |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `/`                                | Page (gated)        | Landing — entry cards for `/interview` and `/translator`, link to `/history` |
| `/gate`                            | Page (public)       | Password form; sets the gate cookie on success                          |
| `/interview`                       | Page (gated)        | AI Mock Interviewer — start config + live transcript + scorecard        |
| `/translator`                      | Page (gated)        | OpenAI-only paired translation                                          |
| `/history`                         | Page (gated)        | Past interviews stored in localStorage; detail sheet + delete           |
| `/dev/realtime-test`               | Page (gated)        | Manual diagnostic for token mint + provider connect                     |
| `/api/auth/gate`                   | POST (public)       | Verifies `DEMO_PASSWORD`, sets the signed gate cookie                   |
| `/api/realtime/token/openai`       | POST                | Mints an OpenAI Realtime ephemeral token (`/v1/realtime/client_secrets`)|
| `/api/realtime/token/gemini`       | POST                | Returns the raw Gemini API key after the gate check                     |
| `/api/realtime/translator-token`   | POST                | Mints an OpenAI **translation** ephemeral token                         |
| `/api/realtime/env-check`          | GET                 | Returns `{ openai: bool, gemini: bool }` for the settings drawer        |
| `/api/translate`                   | POST                | Chat-completion translation (overlay) — routes to the active provider   |

---

## Key design decisions

Each decision links back to the full context in the task PRD. Short version here:

- **Two providers behind one hook (`useRealtimeSession`).** [PRD §Tech Stack]. Adding Gemini Live gave the demo a 10× cost-cheaper free-tier path *and* a stronger interview story — "I evaluated two realtime providers and built a transport-agnostic abstraction so the UI can swap mid-session". The provider interface lives in `src/lib/realtime/provider.ts`.
- **`/translator` is OpenAI-only on purpose.** [PRD §Technical Decisions, ADR-4]. OpenAI's `gpt-realtime-translate` is a dedicated endpoint with no chatty preamble. Gemini has no equivalent — a prompt-hack on the generic model gives unreliable, inconsistent "Sure, here's the translation…" output. Better to pick the right tool than fake provider parity.
- **Caption overlay is a chat side-channel, not a second Realtime session.** [PRD §Technical Decisions, ADR-5]. Mounting a second voice session would compete for the mic; piping the assistant transcript through a one-shot `gpt-4o-mini`/`gemini-2.5-flash-lite` translate keeps the live conversation untouched and adds only ~1–2 s overlay latency.
- **Edge proxy gate instead of NextAuth.** [PRD §Technical Decisions, ADR-7]. The demo only needs to block strangers from burning the API budget. A single env-var password + signed cookie is five minutes of code and zero new dependencies; swap to NextAuth on the day it actually needs multi-tenant auth.
- **Persist history client-side only.** [PRD §会话历史]. No backend storage means zero infra and zero data-handling questions. The trade-off is "one device" — listed under Limitations below.

Full ADR-style write-ups: see `.trellis/tasks/05-14-realtime-voice-demo-interview-project/prd.md`.

---

## Known limitations

- **Gemini API key reaches the browser.** Acceptable behind the gate cookie for a single-tenant demo; not acceptable for production. Future hardening = server-side WS proxy.
- **60-minute hard provider cap.** OpenAI and Gemini both enforce this server-side. The client warns at the 59-minute mark and gracefully tears down at provider close.
- **/translator pair-bucketing uses a 1.2 s gap heuristic.** Works well for typical conversation cadence; the `elapsed_ms` field on each delta would be a more precise upgrade (documented in `research/translator-session-shape.md`).
- **No multi-user / per-account history.** All transcripts live in a single shared localStorage key. Anyone on the same browser sees the same history. Clear-all wipes everything.
- **Reasoning effort knob is `gpt-realtime-2`-only.** Other OpenAI realtime models reject the field with a 400; the UI hides the picker when an incompatible model is selected.
- **Voice change requires session rebuild.** OpenAI locks voice on first emission; switching mid-session would 400 the next response.

---

## Roadmap

- WebSocket proxy in front of Gemini Live so the AI Studio key never crosses to the browser.
- Tighter `/translator` pairing via the `elapsed_ms` delta field.
- Add a second downstream gate for per-API-key quota (e.g. 60 min/day per session cookie) to make the demo safer to share.
- Optional persistence backend (Postgres + per-user history) — only when the project graduates past "single-user demo".
- Vercel Analytics + Speed Insights once a real deploy is up.

---

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 luciferase.

---

## Acknowledgments

- **[OpenAI Realtime API + `@openai/agents`](https://developers.openai.com/api/docs/guides/realtime)** — the May 2026 Realtime guide is excellent; the cookbook on `gpt-realtime-translate` made `/translator` a one-evening build.
- **[Google `@google/genai`](https://ai.google.dev/api/live)** — Gemini Live's WS protocol docs are thin in places, but the SDK types fill the gaps.
- **[shadcn/ui](https://ui.shadcn.com/) + [Radix Primitives](https://www.radix-ui.com/primitives)** — every accessibility-correct interaction in this repo came from these.
- **[Next.js](https://nextjs.org)** — App Router + edge proxy + route handlers in one repo is what makes "demo behind a gate" trivial.
- **[Trellis](.trellis/)** — the planning + spec workflow that lives inside `.trellis/` shaped every PR in this repo. The PRD, research docs, and decision log under `.trellis/tasks/05-14-realtime-voice-demo-interview-project/` are the artifact trail.
