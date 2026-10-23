# User guidance prompt

## Context and problem statement

Personas are fixed, so the user cannot say what they study or how the tutor should teach and quiz (e.g. "AWS SAA prep, scenario questions, no hints").

## Considered options

1. **Extend existing plumbing:** add a `userPrompt` field next to `topicFile` (request, log, resume).
2. **`startOptions` object:** bundle persona, topic and prompt. Cleaner later, but refactors working code.
3. **Separate `prompt.txt` per conversation:** editable later, but a second source of truth next to the log.

## Decision outcome

Option 1.

- Free-text UI textarea, capped by `USER_PROMPT_MAX_CHARS` (default 2000). Over-length requests are rejected with 400, not truncated.
- Scope is per conversation. It is stored in the `session_start` log record and read back on resume, where the textarea is locked.
- Appended to the Live instructions after persona and topic, in a `--- user guidance ---` block. The persona wins on conflicts.
- **Live only.** The delegation agent never receives it, because it has web search and its instructions must stay fixed. Live is told not to repeat the guidance in delegation requests (a model-level guard, not a hard boundary).
- The snapshot model reads it from the log, so resumes remember the user's preferences. It has no tools.

## Consequences

- Good: about 40 changed lines, no new files, same pattern as persona and topic.
- Good: a prompt-injected web page cannot reach the guidance through the agent's context.
- Bad: the prompt cannot be edited after a conversation starts. Start a new conversation to change it.
- Bad: Live could still paraphrase the guidance into a delegation request.

## Status

Accepted. Implemented: config, API, log and resume, Live instructions, UI textarea. `npm run check` passes and the instruction builder was checked. Remaining: a manual browser smoke test (new session, resume, over-length prompt rejected with 400).
