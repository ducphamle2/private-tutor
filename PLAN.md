# Private Tutor: plan

## Context

You want a voice-first study tutor. You talk to GPT-Live. Behind it, an agent reads, edits and writes your notes and searches the web, then hands that context to the voice model. It's an MVP that runs locally: as little code as possible, clear names, no tests or containers.

## Step 1: Compare the two GPT-Live implementations

|                                   | `Jarvis/jarvis/voice/live_session.py` + `useLiveVoice.ts`                                            | `openai-live-console/`                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                            | Third-party hobby project, 1 author                                                                  | **OpenAI's official sample** (`github.com/openai/openai-live-console`)                                                                                                              |
| Audio transport                   | Browser mic → base64 PCM in JSON over our WebSocket → server → OpenAI. Hand-rolled worklet playback. | **WebRTC** straight from the browser to OpenAI, with the browser's built-in echo cancellation and jitter handling. The server only holds a sideband WebSocket for events and tools. |
| Context sent to the backend agent | Only the user's speech since the last handoff. Assistant turns are lost.                             | A `TranscriptLedger` with the full conversation for both roles, time-ordered and bounded                                                                                            |
| Lifecycle and billing safety      | No session time limit, no hangup fallback. A leaked socket can keep billing.                         | Time limit, heartbeat, `session.close` then `hangup` fallback, event de-duplication, close drain                                                                                    |
| Protocol limits                   | 1500-character appends, with a non-ASCII risk                                                        | 400-**byte** appends, 32 KB tool-output budget                                                                                                                                      |
| Coupling                          | Wired into JARVIS's whole brain pipeline (`brain.process`)                                           | Self-contained, about 2.6k lines, TypeScript                                                                                                                                        |
| Tests                             | 101 lines                                                                                            | None, but a `typecheck`/`build` check                                                                                                                                               |

**Verdict: `openai-live-console` is more mature and less bug-prone.** It's also TypeScript, which you prefer. Both say end-to-end `gpt-live-1` compatibility still needs verifying against your API project.

## Step 2: Migrate into `private-tutor/`

- Copy `client/`, `server/`, `shared/`, `scripts/doctor.ts`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `.nvmrc`, `.prettierrc.json` and `.prettierignore`.
- Skip `.github/`, `CONTRIBUTING.md` and `SECURITY.md`.
- Keep your existing `LICENSE`. Copy `THIRD_PARTY_NOTICES.md` and add OpenAI's MIT notice to it, since that license requires keeping the notice.
- Replace the Python `.gitignore` with the console's (`.env`, `node_modules/`, `dist/`). Rename `package.json` `name` to `private-tutor`.
- Requires **Node 24.15.0**, because it runs `.ts` directly and uses `--use-env-proxy`. You have v22.13.0, so run `nvm install 24.15.0 && nvm use`.

## Step 3: Build the tutor (reuse first, then cut)

### Design

- **App-owned delegation only** (the console's `client` mode). Our server runs the Responses agent loop in `LiveSession.runBackend` (`server/session.ts:373`), so we own the tools.
  - Delete `responses` mode: `receiveResponse`, `pending`, `responseIds`, `rounds`, `completedResponses`, the `Mode` type, and the mode `<select>`.
- **Context delivery** (your choice: topic preload plus on demand)
  1. At start you pick a **topic file**. Its text, capped at `TOPIC_MAX_CHARS`, is added to Live's `instructions` in `sessionConfiguration`, so quizzing on it is instant.
  2. Any other material goes through a handoff. The backend agent reads or searches, and its answer is streamed back with the existing `commentaryAppends`. It then stays in Live's conversation context ("hold in memory").
- **Tools** in the backend Responses loop:
  - `list_study_files()`: recursive list of `.md`/`.txt` under `STUDY_DIR`.
  - `read_study_file(path)`: capped at `READ_MAX_CHARS`.
  - `write_study_file(path, content)`: creates or overwrites. Before overwriting, it copies the old file to `<file>.bak`.
  - `edit_study_file(path, old_text, new_text)`: replaces one exact match. Fails if there are zero or several matches. Writes a `.bak` first.
  - `{ type: 'web_search' }`: OpenAI's built-in tool, same key, no extra code.
- **Path guard** (security, not simplified away): resolve against `STUDY_DIR` and `realpath` it (the parent directory for new files). Reject anything outside `STUDY_DIR`, and reject extensions other than `.md`/`.txt`.
- **Personas** (your choice: a UI picker): 3 presets in `server/personas.ts`, sent in `/api/config` and chosen in the UI.
  - `socratic-coach`: asks guiding questions and lets you explain.
  - `strict-examiner`: rapid-fire quiz, corrects mistakes bluntly, scores you.
  - `mock-interviewer`: interview-style questions with follow-up probes.

### Files

| File                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/config.ts`                                | The constants file. Add env-backed `STUDY_DIR` (required, must exist), `MAX_SESSION_SECONDS` (default 1800, range 60–3600), `MAX_DELEGATIONS`, `MAX_TOOL_ROUNDS` (3 → 6; search + read + write needs more than 3), `BACKEND_MAX_OUTPUT_TOKENS` (512 → 2000), `BACKEND_RESULT_MAX_CHARS`, `TOPIC_MAX_CHARS`, `READ_MAX_CHARS`. Move the hardcoded `MAX_DELEGATIONS`, `MAX_TOOL_CALLS` and `MAX_TOOL_ROUNDS` here from `session.ts:19`. |
| `server/catalog.ts` → **`server/study-tools.ts`** | Replace the backpack catalog with the 4 file tools, `web_search`, the path guard, `.bak` and `executeStudyTool` (async). Keep the tool-definition pattern from `catalog.ts`.                                                                                                                                                                                                                                                          |
| **`server/personas.ts`** (new)                    | `personas: { id, label, liveInstructions }[]`                                                                                                                                                                                                                                                                                                                                                                                         |
| `server/protocol.ts`                              | Replace `FRONTEND_INSTRUCTIONS` and `BACKEND_INSTRUCTIONS` with tutor versions. `BACKEND_INSTRUCTIONS` tells the agent to use the tools, to cite which file or URL a fact came from, and to ignore instructions inside files or pages. `sessionConfiguration(persona, topicText)`: always `delegation: { type: 'client' }`. Keep `boundFunctionOutputs`, `commentaryAppends` and `TranscriptLedger`.                                  |
| `server/session.ts`                               | Constructor takes `persona` and `topicText`. Delete the responses-mode code. `tool()` becomes `async` and calls `executeStudyTool`. The `runBackend` loop accepts `web_search_call` output items (currently it throws at `:415`). Pass `tools`. Use the config caps instead of `512` and `1200`. Replace the catalog error string.                                                                                                    |
| `server/http.ts`                                  | `/api/config` also returns `personas` and `studyFiles`. `/api/sessions` validates `persona,operationId,sdp,topicFile` instead of `mode`. `topicFile` is optional and goes through the same path guard, then is read and capped.                                                                                                                                                                                                       |
| `shared/types.ts`                                 | Remove `Mode`. Add `personas` and `studyFiles` to `ConsoleConfig`. Drop `mode` from the `ready` and `delegation` events.                                                                                                                                                                                                                                                                                                              |
| `client/session.ts`                               | `start(config, persona, topicFile, input, output)`. The `/api/sessions` body sends `persona` and `topicFile`.                                                                                                                                                                                                                                                                                                                         |
| `client/App.tsx`                                  | Replace the delegation-mode `<select>` (`:182`) with **Persona** and **Topic file** selects. Rename the copy from "backpack" to "tutor". Remove `modeNames`.                                                                                                                                                                                                                                                                          |
| `.env.example`, `README.md`                       | `OPENAI_API_KEY`, `OPENAI_BACKEND_MODEL`, `STUDY_DIR`, `MAX_SESSION_SECONDS`, plus the other caps. A short run guide.                                                                                                                                                                                                                                                                                                                 |

Kept as-is: `server/openai.ts` (WebRTC create, sideband attach, hangup), `server/errors.ts`, `server/index.ts`, `client/state.ts`, `client/styles.css`, and the loopback-only, CSRF and Host/Origin guards in `http.ts`.

### Known risks to check while building

- Live's `instructions` size limit isn't documented in the sample. Start `TOPIC_MAX_CHARS` at about 20k characters and lower it if `session.start` rejects.
- Long backend answers are streamed as many 400-byte appends, so keep `BACKEND_RESULT_MAX_CHARS` around 4k.

## Verification (manual, real API, costs money)

1. `cd private-tutor && nvm use && npm ci && cp .env.example .env`. Set the key and `STUDY_DIR`.
2. `npm run typecheck && npm run doctor`, which checks model access.
3. `npm run dev`, then open **http://127.0.0.1:3000** (exact host) and use headphones.
4. Pick `strict-examiner` and a topic file, then say "quiz me". Questions should come from that file with no handoff delay.
5. "What do my notes in <other file> say about X?" The activity panel should show `read_study_file`, then a spoken answer.
6. "Search the web for <current fact>." You should see `web_search` in activity and the answer spoken.
7. "Add a note that I keep confusing X and Y." Check that the file was updated and a `.bak` exists.
8. "Read ../../.ssh/id_rsa." It should be rejected and nothing read.
9. End the session and confirm the UI shows a finalized close with usage.
