# CLAUDE.md — onboarding for AI-assisted contributors

This file is for future AI agents (Claude Code, Cursor, Codex, etc.) and human
contributors who want a fast orientation before suggesting changes.

## Where to start

- **Requirements + decision log**: `.trellis/tasks/05-14-realtime-voice-demo-interview-project/prd.md`. The PRD is the canonical source for "why this exists" and every architectural decision (ADRs 1–7 at the bottom).
- **Trellis workflow**: `.trellis/workflow.md`. PRs are planned, implemented, and checked through this state machine. Don't bypass.
- **External API state (May 2026)**: `.trellis/tasks/05-14-realtime-voice-demo-interview-project/research/realtime-api-overview.md` and `.../gemini-live-api.md`. Provider docs change quickly — **these files override your training data** for endpoints, model IDs, event names, voice names.

## Repo map

- `src/proxy.ts` — edge gate. Blocks everything except `/gate` + `/api/auth/gate`.
- `src/app/(gated)/` — every authenticated route lives under this layout.
  - `interview/`, `translator/`, `history/` — three feature surfaces.
  - `layout.tsx` + `header-actions.tsx` — shared chrome.
- `src/app/api/` — route handlers. Ephemeral tokens, translate, env-check, gate.
- `src/lib/realtime/` — provider abstraction. `provider.ts` is the interface; `openai-provider.ts` and `gemini-provider.ts` are the two impls; `use-realtime-session.ts` is the React hook everything uses.
- `src/lib/history/` — localStorage history (types, storage, hook).
- `src/lib/settings/` — global settings drawer state (provider/model/voice/effort/translation).
- `src/components/` — feature UI grouped by route: `interview/`, `translator/`, `settings/`, `ui/` (shadcn primitives).

## Run quality gates before suggesting changes

```bash
npm run typecheck
npm run lint
npm run build
```

All three must be clean. The lint config enables the React Compiler rules — `Date.now()` inside render, setState directly inside an effect, etc. all fail. Defer those through `queueMicrotask` or `useEffect` if you hit them.

## Don't commit secrets

- Server-only secrets live in `.env.local` (gitignored). Never write them into `.env.example`, source files, or test fixtures.
- `OPENAI_API_KEY` is server-side only — verify it never appears in client code or response bodies before suggesting a change to the realtime token routes.
- `GOOGLE_AI_STUDIO_KEY` is intentionally shipped to the browser after the gate check. README documents the trade-off; don't try to "fix" it without replacing the transport with a server-side WS proxy.

## Provider details change fast

- Model IDs: `gpt-realtime-2` (flagship, supports `reasoning.effort`), `gpt-realtime-1.5`, `gpt-realtime`, `gpt-realtime-mini`, `gpt-realtime-translate` (translation-only). Gemini: `gemini-3.1-flash-live-preview` (default), `gemini-2.5-flash-native-audio-latest`, `gemini-2.5-flash-native-audio-preview-12-2025`.
- Endpoints differ for translation vs chat — `/v1/realtime/translations/calls` is **not** the same URL as `/v1/realtime/calls`.
- Always re-check `research/realtime-api-overview.md` and `research/gemini-live-api.md` before touching token routes or provider impls.

## PR map

PRs are tagged `feat(prN):` in git history:

- **PR1** — gate proxy + OpenAI token route scaffold.
- **PR2** — multi-provider Realtime abstraction (`provider.ts`, OpenAI + Gemini impls, `useRealtimeSession`).
- **PR3** — `/interview` — audio capture/playback, stage tools, scorecard.
- **PR4** — settings drawer + translation overlay.
- **PR5** — `/translator` route (OpenAI-only `gpt-realtime-translate`).
- **PR6** — localStorage history, README rewrite, Vercel deploy polish (this file).

For any non-trivial work, create a new task under `.trellis/tasks/` rather than amending an old PRD.
