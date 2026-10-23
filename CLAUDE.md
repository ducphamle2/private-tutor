# CLAUDE.md — private-tutor

Voice-first private tutor. The user studies and practices out loud with GPT-Live; a local agent reads/edits/writes their study notes and searches the web, then feeds results back to the voice model as context. Derived from OpenAI's `openai-live-console` sample (MIT, see `THIRD_PARTY_NOTICES.md`). Original build plan: `PLAN.md`.

## Functional requirements

1. **Voice conversation** with GPT-Live (`gpt-live-1`): full-duplex speech, interruptions, live transcript in the UI.
2. **Personas**: user picks one before starting (`socratic-coach`, `strict-examiner`, `mock-interviewer`) — defined in `server/personas.ts`.
3. **Topic preload**: user optionally picks one study file; its text is injected into Live's `instructions` at session start so quizzing on it needs no round trip.
4. **Agent handoff ("delegation")**: when Live needs more, it delegates; the server runs a Responses agent loop with tools and streams the answer back to Live as commentary, which stays in Live's context for the rest of the session.
5. **Agent tools** (`server/study-tools.ts`):
   - `list_study_files`, `read_study_file`, `write_study_file`, `edit_study_file` (exact unique match, or empty `old_text` = append)
   - `web_search` (OpenAI built-in hosted tool)
6. **Activity panel**: shows each delegation, tool call, arguments and result.
7. **Conversation history** (`server/conversations.ts`):
   - Every session belongs to a conversation `conversations/<uuid>/` (gitignored). `log.jsonl` is append-only, with one `{ at, sessionId, event }` per line: `session_start` (persona, topic, studyDir, resumed) plus every emitted event except `usage` (transcripts, delegations, full tool arguments/results, agent answers, close).
   - When a session ends, the backend model writes `snapshot.json` (structured output): `title`, `summary`, `topicsDiscussed`, `keyPoints`, `userStrengths`, `mistakesAndMisconceptions`, `openQuestions`, `quizResults {asked, correct, notes}`, `nextSteps`. It is merged with facts derived from the log: `sessionCount`, `persona`, `topicFile`, `studyDir`, `filesRead`, `filesWritten`, `webSearches`, `processedRecords`.
   - **Continue**: the UI picks a conversation, replays its log into the transcript/activity panes, and locks persona/topic. A new Live session is primed with the snapshot (in Live instructions and agent context) and appends to the same log. A stale or missing snapshot is rebuilt before resuming. A deleted topic file is skipped on resume.
   - API: `GET /api/conversations` (list), `GET /api/conversations/<uuid>` (log records). `POST /api/sessions` takes `conversationId` (`''` = new).

## Non-functional requirements

- **MVP, personal use, local only.** Works for one user on their own machine first.
- **Minimal code**; clear naming over comments. No containerization, no test suites, no production hardening beyond what's already there.
- **Security that must not be simplified away:**
  - Server binds `127.0.0.1` only; Host/Origin checks, session cookie, CSRF header (`http.ts`). Never expose via tunnel/reverse proxy.
  - API keys stay server-side (`.env`); never in client code or `VITE_` vars.
  - File tools are confined to the session's study folder (`STUDY_DIR`, or a folder the user picks in the native OS dialog; the check defeats `..` and symlink escapes) and to `.md`/`.txt`. Only the user picks the folder; it is fixed at session start.
  - Every overwrite/edit saves `<file>.bak` first.
  - Agent instructions treat file and web content as data, not instructions.
- **Cost guards**: session auto-ends after `MAX_SESSION_SECONDS`; caps on delegations, tool calls, tool rounds and output sizes. No automatic reconnects or hidden retries (each would be billed).

## Coding style

- TypeScript, ESM, strict mode. Node runs `.ts` directly (type stripping) — no build step for the server.
- Keep code short; reuse existing helpers (`record`, `event`, `commentaryAppends`, `boundFunctionOutputs`, `TranscriptLedger` in `protocol.ts`).
- No unneeded abstractions, interfaces or templates. Comments only for business context.
- **All magic numbers / tunables live in `server/config.ts`**, read from env with validated ranges, and are reused via `Settings`.
- All imports at top of file. Clear, descriptive names (`executeStudyTool`, `resolveStudyPath`, `topicMaxChars`).
- New dependencies go in `package.json` (pinned versions). Format with Prettier (`npm run format`).
- Credentials only in `.env` (gitignored, along with `node_modules/`, `dist/`, `conversations/`).

## Configuration (`.env`, parsed in `server/config.ts`)

| Variable                     | Required         | Default                | Range            | Meaning                                                                                                                             |
| ---------------------------- | ---------------- | ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`             | yes (to connect) | —                      | —                | OpenAI key with access to `gpt-live-1` (WebRTC + sideband) and the backend model. Server starts without it but can't open sessions. |
| `STUDY_DIR`                  | **yes**          | —                      | existing folder  | Folder of `.md`/`.txt` notes. The only place the agent can read/write. Server refuses to start without it.                          |
| `OPENAI_BACKEND_MODEL`       | no               | `gpt-5.4-mini`         | model ID         | Responses model that runs the agent loop; must support function tools and `web_search`.                                             |
| `PORT`                       | no               | `3000`                 | 1024–65535       | Local port. Open exactly `http://127.0.0.1:<PORT>`.                                                                                 |
| `HOST`                       | no               | `127.0.0.1`            | only `127.0.0.1` | Any other value is rejected.                                                                                                        |
| `MAX_SESSION_SECONDS`        | no               | `1800`                 | 60–3600          | Auto-end a voice session after this long (billing guard).                                                                           |
| `MAX_DELEGATIONS`            | no               | `100`                  | 1–1000           | Max agent handoffs per session; exceeding it ends the session.                                                                      |
| `MAX_TOOL_CALLS`             | no               | `300`                  | 1–3000           | Max unique tool calls per session.                                                                                                  |
| `MAX_TOOL_ROUNDS`            | no               | `6`                    | 1–20             | Max model→tool→model rounds per handoff.                                                                                            |
| `BACKEND_MAX_OUTPUT_TOKENS`  | no               | `2000`                 | 256–16000        | `max_output_tokens` for each agent Responses call.                                                                                  |
| `BACKEND_RESULT_MAX_CHARS`   | no               | `4000`                 | 400–20000        | Cap on the agent answer sent back to Live (streamed as 400-byte appends).                                                           |
| `TOPIC_MAX_CHARS`            | no               | `20000`                | 1000–200000      | Cap on topic-file text injected into Live instructions. Lower it if session start fails (Live instruction limit is undocumented).   |
| `CONVERSATIONS_DIR`          | no               | `<repo>/conversations` | path             | Where conversation folders are stored; created at startup.                                                                          |
| `SNAPSHOT_MAX_OUTPUT_TOKENS` | no               | `2000`                 | 256–16000        | `max_output_tokens` for the end-of-session snapshot call.                                                                           |
| `LOG_THROTTLE_MS`            | no               | `2000`                 | 2000–60000       | Min gap between `log.jsonl` writes; events in between are batched (flushed on read).                                                |
| `SNAPSHOT_THROTTLE_MS`       | no               | `5000`                 | 1000–600000      | Min gap between `snapshot.json` writes per conversation; later builds wait.                                                         |
| `USER_PROMPT_MAX_CHARS`      | no               | `2000`                 | 100–10000        | Cap on the user guidance prompt (Live-only; never sent to the agent). Over-length requests are rejected.                            |
| `READ_MAX_CHARS`             | no               | `20000`                | 1000–200000      | Cap on text returned by `read_study_file`.                                                                                          |

Hardcoded (not env): snapshot tool-result excerpt 2000 chars (`conversations.ts`), `closeTimeoutMs` 20 s, tool-output batch 30 KiB (`protocol.ts`), commentary append 400 bytes, request body 128 KiB, listed files 500.

## Core technologies

- **OpenAI GPT-Live** (`gpt-live-1`): `POST /v1/live/sessions` (WebRTC SDP exchange) + sideband WebSocket `wss://api.openai.com/v1/live/sessions/{id}/attach` for events and delegation. Client-mode delegation (`delegation: { type: 'client' }`).
- **OpenAI Responses API** via `openai` Node SDK 7.9.0: agent loop with function tools + hosted `web_search`; `store: false`.
- **Node.js 24.15.0** (`.nvmrc`): native `http` server, `ws` for WebSockets, TypeScript run directly.
- **React 19 + Vite 8**: browser UI; Vite runs as middleware in dev.
- **WebRTC** in the browser for mic/speaker audio straight to OpenAI.

## Use cases

- **Quiz on a topic**: pick `strict-examiner` + `aws/s3.md` → "Quiz me" → instant questions from the preloaded file, scored.
- **Explain-back practice**: `socratic-coach` → user explains a concept; tutor probes gaps.
- **Mock interview**: `mock-interviewer` + a system-design note → open questions with follow-ups.
- **Pull other notes into the session**: "What do my notes in `networking/vpc.md` say about NAT?" → agent reads the file → tutor answers and keeps it in context.
- **Fact-check / fill gaps**: "Search the web for the current S3 storage classes" → agent `web_search` → answer with sources.
- **Pick up where you left off**: choose a past conversation → transcript replays → "Continue conversation" → tutor revisits mistakes and open questions from the snapshot.
- **Capture learning**: "Add a note that I confuse X and Y" / "Create a flashcards file for today's mistakes" → agent edits or writes files (`.bak` kept).

## Commands

```sh
nvm use && npm ci
cp .env.example .env     # set OPENAI_API_KEY, STUDY_DIR
npm run doctor           # model-metadata access check only
npm run dev              # http://127.0.0.1:3000
npm run typecheck        # tsc --noEmit
npm run check            # prettier check + typecheck + vite build
```

## Known limits / open questions

- Live `instructions` size limit is undocumented → tune `TOPIC_MAX_CHARS`. Resumed sessions also carry the snapshot JSON.
- Resume primes Live with the snapshot only, not the raw old transcript. The UI replay shows only the tail of long histories (about 100 turns / 20k chars); the full log stays on disk.
- Each session end costs one backend-model call for the snapshot.
- Agent sees the spoken transcript but not its own earlier tool results; it re-reads files when needed.
- Voice requires a direct OpenAI key; the agent could optionally run via OpenRouter (Responses API beta, `openrouter:web_search`) — not implemented.
