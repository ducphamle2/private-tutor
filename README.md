# private-tutor

Your voice-first private tutor. Talk to it like a real human, pick a persona, and it reads your notes, edits them, searches the web, and tests your knowledge.

Built on [openai-live-console](https://github.com/openai/openai-live-console) (MIT). See `THIRD_PARTY_NOTICES.md`.

## How it works

- **Voice:** GPT-Live (`gpt-live-1`) over WebRTC. The browser talks to OpenAI directly; the API key stays on the local server.
- **Topic preload:** the topic file you pick is put into the tutor's instructions at start, so quizzing on it is instant.
- **Agent handoff:** for anything else, the tutor delegates to a local Responses agent with these tools:
  - `list_study_files`, `read_study_file`, `write_study_file`, `edit_study_file`: `.md`/`.txt` inside `STUDY_DIR` only. A `.bak` copy is kept before each overwrite.
  - `web_search`: OpenAI's built-in web search.

  The agent's answer is streamed back to the tutor and stays in its context for the rest of the session.

- **Personas:** Socratic coach, strict examiner, mock interviewer (`server/personas.ts`).
- **Conversation history:** every session is logged to `conversations/<id>/log.jsonl` (voice transcript plus everything the agent did). When a session ends, a `snapshot.json` summary is written (topics, key points, mistakes, quiz results, next steps). Pick a past conversation in the UI to see it and click **Continue conversation**; the tutor is primed with the snapshot. `conversations/` is gitignored.

## Run

Needs Node **24.15.0** and an OpenAI API project with GPT-Live access.

```sh
nvm install && nvm use
npm ci
cp .env.example .env   # set OPENAI_API_KEY and STUDY_DIR
npm run doctor         # checks model access
npm run dev
```

Open **http://127.0.0.1:3000** (exact host), pick a persona and topic, click **Start conversation**, and use headphones.

Try:

- "Quiz me on this topic."
- "What do my notes in aws/s3.md say about lifecycle rules?"
- "Search the web for the latest S3 storage classes."
- "Add a note that I keep mixing up Glacier Instant and Flexible Retrieval."

## Costs

Live audio minutes and agent tokens (plus web searches and one snapshot call per session) are billed separately. Sessions auto-end after `MAX_SESSION_SECONDS` (default 30 min). Click **End conversation** when you're done; muting does not stop billing.

## Safety

Server is loopback-only with Host/Origin and CSRF checks. Don't expose it through a tunnel. Treat the study folder as the agent's only writable area, and keep it under git if you want history.
