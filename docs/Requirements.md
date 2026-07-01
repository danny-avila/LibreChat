Three features. I'm most interested in feature 1, and these can be worked as different feature requests.

## AIWP Local Workspace + Long-Horizon Agent — Feature Spec (main repo)

Paste this into a Claude Code session opened in the existing AIWP repo (the LibreChat fork). This is a feature addition, not a new app — no new repo, no packaging pipeline, no Electron. Sections marked **[VERIFY]** need confirmation against the actual repo before Claude Code builds on them — don't let it guess schema/API shapes.

### What this is
Three capabilities added to the existing AIWP web app, in priority order:

*   **Local file access** — a user can grant AIWP a scoped folder on their own machine and the agent can read/write inside it, entirely in-browser.
*   **Long-horizon work** — multi-step agent tasks that keep running on the backend even if the user closes the tab, checkpointing progress into the conversation.
*   **Browser control** — the agent can navigate/click/read/fill on the web on the user's behalf, via Claude in Chrome rather than custom automation code.

No desktop app. Everything lives in the browser + your existing backend. The only new infra is a background job runner attached to your existing job/queue setup (or a new lightweight one if you don't have one yet — **[VERIFY]** what AIWP already uses for any async work, if anything, before adding a new mechanism).

---

### Feature 1: Local file access (File System Access API)
Chromium (Chrome/Edge) supports `window.showDirectoryPicker()` — a real OS folder picker that grants the page persistent, revocable, scoped read/write access to a directory. No install. Safari does not support this — confirm your user base is Chrome/Edge-only for this feature, or gate it behind a feature-detect with a fallback message.

**Frontend work:**
*   A "Connect a folder" action in the composer or a settings panel. Calls `showDirectoryPicker()`, stores the resulting `FileSystemDirectoryHandle` (IndexedDB, since handles aren't serializable to localStorage) so permission persists across sessions without re-prompting every time.
*   A thin file-tool layer exposed to whatever calls the model: list directory, read file, write file, all scoped to the granted handle — reject anything outside it.
*   Permission re-request flow: Chrome requires a user gesture to re-verify permission after browser restart (`handle.requestPermission()`), so the UI needs a "reconnect folder" state, not just a silent failure.

**[VERIFY]:** How tool-calling is currently wired in your fork's frontend — does the model already call client-side tools for anything, or has everything so far been server-side? This determines whether the file tool lives in the browser (model output triggers a client-side read/write, result sent back up) or whether files get uploaded/downloaded through the backend per-call (simpler, more roundtrips, more compatible with your existing architecture if all tool execution is currently server-side). Recommend the latter to start — less new architecture — and only move file I/O client-side if the roundtrip cost is actually a problem in practice.

---

### Feature 2: Long-horizon work
The task itself should not live in the browser tab. Pattern:

*   User kicks off a task ("go do X across these files/skills"). The frontend hands off to the backend, which starts a job — not a synchronous request/response.
*   The job runs server-side using the Claude Agent SDK or your existing model-calling path, with access to the MCP skills server exactly as today, plus (if Feature 1 is built) requests back to the client for any local file read/write it needs mid-task.
*   Progress gets written into the existing conversation as it happens — each meaningful step becomes a message/event in the same conversation document, using whatever structured-content mechanism your schema already supports. **[VERIFY]** whether your message schema currently supports incremental/streaming tool-call content, or whether this needs a small schema addition.
*   The frontend just subscribes to the conversation (however it already gets live updates — socket, polling, SSE — **[VERIFY]** which) and renders progress as it arrives. Closing the tab doesn't kill the job; reopening the conversation shows everything that happened while it was closed.

**Client-side file access (Feature 1)** only comes into play at specific checkpoints where the job needs to touch the local folder — the frontend needs a way to notice "the job wants a local file operation" and service it while open, and queue/retry if the tab isn't open when the job needs it.

**[VERIFY]:** Does AIWP have any existing background job infrastructure (a queue, a worker process, cron-style tasks)? If yes, build on it. If not, this is the one place genuinely new infrastructure shows up — a simple job table + worker loop — but it's an addition to the backend service you already run, not a new service.

---

### Feature 3: Browser control
Don't build this. Claude in Chrome is Anthropic's existing browser-automation extension — navigate, click, read page content, fill forms, on the user's real logged-in session. Two ways to plug it in:

1.  **Simplest:** point users at installing Claude in Chrome directly for browser tasks, separate from the AIWP chat surface.
2.  **Tighter integration:** if AIWP's agent tasks are structured as tool calls, add Claude in Chrome's tools to the set available during a task (same shape as adding another MCP server) so a long-horizon job can hand off "go check this website" steps to it without you writing any navigate/click/scrape code.

**[VERIFY]** current integration surface for Claude in Chrome (MCP-compatible tool interface vs. extension-only) before committing to the tighter-integration path — confirm via current docs at build time.

---

### Suggested build order
1.  **Long-horizon job runner + checkpointing into existing conversations (Feature 2)** — this is the structural piece everything else hangs off, and it's useful on its own even before local files are wired in (e.g., long research/drafting tasks against the skills server today).
2.  **Local file access (Feature 1)** — bolt onto the job runner as a new tool type once the checkpointing pattern exists.
3.  **Claude in Chrome integration (Feature 3)** — mostly configuration once 1 and 2 are working, since it's the same "add another tool to the job" pattern.

---

### First message to send Claude Code
> "Before writing any code: read through the current conversation/message schema and any existing job or async-task infrastructure in this repo, and tell me what's actually there before we design the long-horizon job runner in the spec above I just gave you. I want to build on what exists, not assume."

---

## Implementation status (as of branch `feature/long-horizon-jobs`)

| Feature | Spec section | Status |
|---|---|---|
| **Long-horizon work** | Feature 2 above | **Core shipped** — backend worker, API, composer UI, SSE reconnection, user-friendly status banner. Manual testing: `docs/manual-testing-guide.md` (tests A1–A4). Remaining backlog: `docs/new-features-plan.md` §6c. |
| **Local file access** | Feature 1 above | **Not started** (M3/M4 in delivery plan). |
| **Browser control** | Feature 3 above | **Not started** (M5 in delivery plan). |

### Feature 2 — user-facing behavior (implemented)

- **Start:** list-checks icon in the composer → new sidebar conversation + background job on the server.
- **Progress:** status banner with plain-language copy (not internal step caps); messages checkpoint into the conversation as the worker runs.
- **Reopen:** SSE snapshot + persisted messages show work that happened while the tab was closed.
- **Cancel:** banner Cancel button stops further steps (see manual guide for known limitation on in-flight steps).

### Feature 2 — internal model (for developers)

Each job runs up to **`maxSteps` agent turns** (default **25**), one headless agent call per turn. The planner stops early when the model returns `STATUS: DONE`. This cap is **not exposed in the UI** — users see "In progress" and update counts instead.

Full plan, UX fix log, file map, and milestones: `docs/new-features-plan.md` (§6b–§6c).