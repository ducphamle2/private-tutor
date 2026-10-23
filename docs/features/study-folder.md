# Study folder override

## Context and problem statement

`STUDY_DIR` in `.env` is the only folder the agent can read and write. Changing it means editing `.env` and restarting.

## Considered options

1. **Per-session settings override with the native OS folder dialog.** Browsers cannot give a page an absolute path, so the local server opens the macOS dialog (`osascript choose folder`) and returns the real path.
2. **Typed path only.** Smaller, but error-prone.
3. **Change `settings.studyDir` globally at runtime.** Shared mutable state that breaks resume.

## Decision outcome

Option 1.

- No outer bound: the user may pick any existing folder. The chosen path is realpath'd, and the `.md`/`.txt` limit, the confinement to the chosen folder and the `.bak` saves still apply inside it. `STUDY_DIR` is the default.
- `POST /api/pick-folder` (CSRF-protected) opens the native dialog starting at `STUDY_DIR` and returns the chosen path, or `''` if cancelled. `GET /api/study-files?dir=` lists `.md`/`.txt` notes in an existing folder.
- `POST /api/sessions` takes `studyDir` (`''` = `STUDY_DIR`). The server builds `{ ...settings, studyDir }` for that session, so the tools, topic read and `.bak` logic are unchanged.
- The folder is fixed at session start and stored in `session_start`. It is locked on resume. If the logged folder is gone resume is refused (409).
- Only the user can choose the folder. The model and the agent cannot.
- The "no query strings on `/api/*`" rule is relaxed for `/api/study-files` only.

## Consequences

- Good: no change to the tools, a small diff, and the confinement checks still apply inside the chosen folder.
- Bad: the agent can reach any folder the user picks. A local process with the session cookie and CSRF token could also name any folder in `POST /api/sessions`. Accepted for a single-user local app.
- Bad: the dialog is macOS-only; other platforms get a 501 and must use `STUDY_DIR`.

## Status

Accepted. Implemented: config, API, resume, the native dialog button. `npm run check` passes and `study-files` rejects `/etc`. Remaining: a manual test of the dialog button and of resuming with a deleted folder.
