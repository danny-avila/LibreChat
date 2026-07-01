# New Features Implementation Plan — AI Workforce Pro

Implementation plan for the three features described in `docs/Requirements.md`:

1. **Local file access** — grant AIWP a scoped folder on the user's machine; the agent reads/writes inside it.
2. **Long-horizon work** — multi-step agent tasks that keep running on the backend even if the user closes the tab, checkpointing progress into the conversation.
3. **Browser control** — the agent navigates/clicks/reads/fills on the web via Claude in Chrome rather than custom automation code.

> This is a **feature addition** to the existing AIWP web app (LibreChat fork). No new repo, no Electron, no packaging pipeline.

---

## 1. Pre-work verification (grounded in the codebase)

The spec marks several assumptions as **[VERIFY]**. These were checked against the actual repo before planning — nothing below is guessed.

| Spec `[VERIFY]` | Reality in the repo | Source file |
|---|---|---|
| Is there async/job infrastructure? | **Yes, partial:** MongoDB poller with atomic claim + lock TTL | `api/server/services/Scheduler/index.js` |
| Headless (no-tab) run pattern | **Yes, proven:** `runScheduledTurn` reuses `buildEndpointOption → initializeClient → client.sendMessage` | `api/server/services/Scheduler/runScheduledTurn.js` |
| Tool-calling: frontend or backend? | **100% backend** via MCP (stdio/HTTP) | `librechat.yaml` `mcpServers` |
| Does the message schema support incremental / tool-call content? | **Yes:** `content: [Mixed]` array + `unfinished` flag | `packages/data-schemas/src/schema/message.ts` |
| How does the frontend get live updates? | **SSE only** (sse.js + EventSource), resumable, `activeJobs` cache. No WebSockets | `client/src/hooks/SSE/useResumableSSE.ts` |
| Browser-control integration surface | **MCP.** Puppeteer MCP present as a commented example; agents endpoint already exposes `tools` | `librechat.yaml` (~line 568), `endpoints.agents.capabilities` |
| Cross-instance resumable streams | **Yes:** `GenerationJobManager` (InMemory or Redis) | `packages/api/src/stream/GenerationJobManager.ts` |

**Key takeaway:** the skill scheduler is the exact template for Feature 2, but it runs **one turn** per schedule. The real gap is a **multi-step runner with checkpoints**.

### Message schema — no change required for checkpointing

`message.content` is a `[Mixed]` array that already holds structured parts (tool calls, reasoning, text), and `unfinished: Boolean` marks in-progress messages. Progress checkpoints can be written as normal messages/content parts. The new `agentJob` collection is additive and does **not** modify the `message` schema.

---

## 2. Build order

The spec's ordering is correct due to dependencies:

```
Feature 2 (Long-horizon job runner)   ← structural piece; everything else hangs off it
        │
        ├── Feature 1 (Local files)    ← a new "operation" type the job requests from the client
        │
        └── Feature 3 (Browser control) ← config/MCP once the runner exists
```

**Rationale:**
1. Feature 2 is useful on its own (long research/drafting against the skills server) and defines the checkpointing pattern.
2. Feature 1 plugs in as an operation the job requests from the client.
3. Feature 3 is mostly configuration (add an MCP server) once the "add a tool to the job" pattern exists.

---

## 3. Feature 2 — Long-horizon job runner (FIRST)

> **Implementation status:** M1 + M2 core shipped on branch `feature/long-horizon-jobs`. See **§6b** for what is built, **§6c** for what remains. The component list below is the original design spec; items marked ✅ are implemented, ⬜ are pending or deferred.

### Goal
A user starts a multi-step task; it runs on the backend even if the tab closes; progress is written into the conversation as messages/events; reopening shows everything that happened.

### Architecture decision
**Extend the scheduler pattern** — do not introduce a new queue. Add an `agentJob` collection + worker loop reusing the same atomic claim + lock TTL as `claimDueSchedule`. Reuse `runScheduledTurn` building blocks as the "execute one step" primitive.

Do **not** add Bull/BullMQ: it adds infrastructure (mandatory Redis, extra process), while the Mongo-poller pattern is already proven in production and resumes cleanly across restarts.

**Backend — data (`packages/data-schemas`):** ✅
- `src/schema/agentJob.ts` — schema (see §6b for fields).
- `src/methods/agentJob.ts` — ✅ `createAgentJob`, `getAgentJobById`, `listAgentJobs` (incl. `conversationId` filter), `claimDueJob`, `recordJobStep`, `cancelAgentJob`. ⬜ separate `markJobStep` / `completeJob` / `failJob` / `requestClientOp` / `resolveClientOp` (consolidated or deferred to Feature 1).
- `src/types/agentJob.ts` — types.

**Backend — worker (`api/server/services/Jobs/`):** ✅ (with notes)
- `index.js` — ✅ poller + multi-step loop.
- `runJobStep.js` — ✅ headless turn + message persistence. ⬜ integration test with mocked LLM.
- `planner.js` + `prompt.js` — ✅ continue/finish logic + step prompts.
- `events.js` — ✅ in-process pub/sub after each step (used instead of `GenerationJobManager.emitChunk`).

**Backend — API (`api/server/routes/jobs.js`):** ✅ (JS routes; ⬜ TS handlers in `packages/api/src/jobs/`)
- `POST /api/jobs` — ✅ create job + ensure conversation exists in sidebar.
- `GET /api/jobs/:id` — ✅ status + steps.
- `GET /api/jobs` — ✅ list (`?status=`, `?conversationId=`).
- `POST /api/jobs/:id/cancel` — ✅ cancel + SSE notify.
- `GET /api/jobs/:id/events` — ✅ SSE snapshot + live updates.

**Frontend (`client/src`):** ✅ minimal UI (⬜ polish — see §6c)
- `data-provider/Jobs/` — ✅ `useJobsQuery`, `useJobQuery`, `useCreateJobMutation`, `useCancelJobMutation`.
- `hooks/Jobs/` — ✅ `useJobEvents`, `useConversationJob`, `useStartLongTask`, `cache.ts` (dedicated job SSE + list cache patching; not `useResumableSSE`).
- UI — ✅ `StartLongTaskButton` (composer), `JobStatusBanner` (user-friendly status + Cancel). ⬜ terminal-state badge (Done/Error), active-jobs panel.

**Shared contracts (`packages/data-provider`):** ✅
- `src/types/jobs.ts`, endpoints, `QueryKeys.jobs` / `job`, `data-service` functions.

### Original design spec (for reference)

<details>
<summary>Planned components before implementation (click to expand)</summary>

**Backend — data (`packages/data-schemas`):**
- `src/schema/agentJob.ts` — new schema:
  ```
  agentJob {
    user, tenantId,
    conversationId,            // conversation where progress is checkpointed
    status: 'queued'|'running'|'waiting_client'|'paused'|'done'|'error'|'canceled',
    goal: string,              // original instruction
    steps: [{ index, status, summary, messageId, startedAt, endedAt }],
    currentStep, maxSteps,
    checkpoint: Mixed,         // serializable state between steps (job memory)
    pendingClientOp?: {...},   // Feature 1: pending local file operation
    lockedAt, lockedBy,        // atomic claim (identical to skillSchedule)
    lastError, createdAt, updatedAt
  }
  ```
- `src/methods/agentJob.ts` — `claimDueJob`, `markJobStep`, `completeJob`, `failJob`, `requestClientOp`, `resolveClientOp`.
- `src/types/agentJob.ts` — types.

**Backend — worker (`api/server/services/Jobs/`):**
- `index.js` — poller structurally identical to `Scheduler/index.js` (tick, claim, lock TTL, `MAX_PER_TICK`). Reuse the lock logic.
- `runJobStep.js` — one step of the job: reuses `buildHeadlessReq/Res` + `initializeClient` + `client.sendMessage` from `Scheduler/headlessRequest.js`. After each step:
  - Persist a progress message (`saveMessage`) with `unfinished: false` and structured `content`.
  - Update `agentJob.steps` + `checkpoint`.
  - Emit an event via `GenerationJobManager.emitChunk` for connected clients.
  - Decide whether to continue (planning loop) or finish.
- `planner.js` — "next step or done?" logic (model returns a completion signal, or `maxSteps` cap).

**Backend — API (`api/server/routes/jobs.js` + `packages/api/src/jobs/`):**
- `POST /api/jobs` — create job (status `queued`), returns `jobId` + `conversationId`.
- `GET /api/jobs/:id` — status + steps.
- `GET /api/jobs` — active jobs for the user (for reconnection).
- `POST /api/jobs/:id/cancel` — set abort flag.
- Handlers live in `packages/api/src/jobs/` (TypeScript, per `CLAUDE.md`).

**Frontend (`client/src`):**
- `data-provider/Jobs/queries.ts` + `mutations.ts` — React Query (`useCreateJobMutation`, `useJobQuery`, `useActiveJobsQuery`).
- Reuse `useResumableSSE` to subscribe to job progress (same SSE channel that already exists).
- UI:
  - "Start long task" action in the composer (or a mode toggle).
  - Render steps as messages in the conversation (checkpointing into `message.content` means existing renderers work).
  - Job status badge in the conversation header (e.g. "In progress — working in the background").
- Endpoints/keys in `packages/data-provider` (`api-endpoints.ts`, `keys.ts`, `types/queries.ts`).

</details>

### Integration with existing code
- **Tenant:** wrap each step in `tenantStorage.run(...)` exactly like `runScheduledTurn`.
- **Streaming:** `GenerationJobManager` already supports reconnection and late subscribers (early-event buffer), so a client that reopens the tab receives current state. Steps already completed with no active stream are read from MongoDB (as today).
- **Abort:** the `AbortController` pattern already used in `runScheduledTurn`.

### How to test

| Layer | Status | Notes |
|---|---|---|
| Unit — `agentJob` methods | ✅ | 14 tests in `agentJob.spec.ts` |
| Unit — planner / prompt | ✅ | 16 tests in `planner.spec.js`, `prompt.spec.js` |
| Unit — `runJobStep` | ⬜ | Mock LLM only; verify message + step persistence |
| Integration — N-step job | ⬜ | Create → ticks → N messages in order |
| Integration — cancel / worker restart | ⬜ | |
| Manual — composer + banner | ✅ | See `docs/manual-testing-guide.md` tests A1–A3; UX fixes applied (§6b) |
| E2E Playwright — tab close/reopen | ⬜ | Acceptance criteria not automated yet |

**Acceptance criteria (from spec):**
- A ≥5-step job completes without the tab open; on reopen, the conversation shows the full thread; two backend instances do not duplicate work. — **⬜ not formally verified yet** (manual test A2 covers the tab-close path).

---

## 4. Feature 1 — Local file access (SECOND)

### Goal
The user grants a folder on their machine; the agent reads/writes inside it, scoped and revocable.

### Architecture decision (per the spec's own recommendation)
**Start with the backend path that already exists** (upload/download via the `filesystem` MCP), and only move to the File System Access API on the client if the roundtrip cost is actually a problem.

#### Phase 1A — Backend files (low risk, nearly exists)
- A `filesystem` MCP scoped to `/app/uploads` already exists, plus `/api/files` upload. Formalize a per-conversation/job "workspace": one folder per conversation under the MCP path.
- The Feature 2 job can request list/read/write inside that workspace via the existing MCP tools.
- **Real repo warning (`librechat.yaml` ~line 511):** on Cloud Run the filesystem is ephemeral. For persistence, mount GCS/a volume. Document and decide.

#### Phase 1B — File System Access API (browser, Chrome/Edge only)
- Only if a **real user folder** (not the server's) is needed.
- New frontend components:
  - `client/src/hooks/LocalFiles/useDirectoryHandle.ts` — `window.showDirectoryPicker()`, persist the `FileSystemDirectoryHandle` in **IndexedDB** (not localStorage; handles are not serializable).
  - `useReconnectFolder` — re-request permission after browser restart (`handle.requestPermission()` requires a user gesture). Provide a "reconnect folder" state, not a silent failure.
  - Client tool layer: `listDir`, `readFile`, `writeFile` — **reject any path outside the handle** (security).
  - Feature-detect + fallback: Safari is unsupported → clear message.
- Job ↔ client bridge:
  - The job sets `agentJob.pendingClientOp` (e.g. `{ op: 'writeFile', path, contentRef }`).
  - While open, the frontend detects the pending op (via SSE or job polling), executes it against the local handle, and replies with `POST /api/jobs/:id/client-op-result`.
  - If the tab is closed when the job needs the file → the job moves to `waiting_client` and is serviced on reopen (queue/retry).

### Integration
- The `agentJob.pendingClientOp` scoping fits cleanly on top of the Feature 2 runner (which is why this comes second).
- Reuse the existing `file` schema for metadata if files are uploaded to the backend.

### How to test
**Unit (frontend, Jest):**
- Mock `showDirectoryPicker` / `FileSystemDirectoryHandle`: verify IndexedDB persistence (use `fake-indexeddb`).
- The tool layer rejects paths containing `..` or outside the handle.
- Denied `requestPermission` → reconnect state.

**Integration:**
- Job requests `writeFile` → with tab open it executes and confirms; with tab closed → job `waiting_client`, completes on reconnect.

**Manual (Chrome/Edge):**
- Connect a real folder → ask the agent to create/read a file → verify in the OS file explorer.
- Restart the browser → "reconnect folder" state → reconnect without re-picking the folder.

**Acceptance criteria:**
- Scoped read/write works; nothing outside the handle is reachable; permission persists across sessions (with reconnect gesture); correct fallback on Safari.

---

## 5. Feature 3 — Browser control (THIRD)

### Goal
The agent navigates/clicks/reads/fills on the web on the user's behalf — **without writing automation code** (use Anthropic's existing solution).

### Architecture decision
The spec says: don't build it. Two paths — and the repo already supports the second one trivially because **MCP is the integration surface**:

- **Option A (simplest):** point users to install **Claude in Chrome** separately, outside the AIWP surface.
- **Option B (tighter integration, recommended if jobs are tool-calls):** add browser tools as **another MCP server** available during a job. Architecturally identical to adding `smbteam-mcp`.

### Components
- `librechat.yaml` → `mcpServers`: add a browser MCP server (Puppeteer MCP is already a commented example ~line 568, or whatever "Claude in Chrome" exposes if it offers MCP).
- `endpoints.agents.capabilities`: already includes `tools`, so MCP tools are automatically available to the job.
- `$` popover scoping: reuse `client/src/utils/mcpToolsForPopover.ts` (which already filters infrastructure MCPs) to decide whether browser tools surface to the user.
- **[VERIFY at build time]:** confirm in current Anthropic docs whether "Claude in Chrome" exposes an MCP interface or is extension-only. If extension-only → Option A.

### How to test
- With a browser MCP configured: start a job "review this site and summarize" → verify the job invokes navigation tools and checkpoints the result.
- Verify isolation: the browser MCP is only available inside authorized jobs, not in normal chat (if that is the decision).
- Manual: real logged-in session (if using Claude in Chrome) → navigation task → result in the conversation.

**Acceptance criteria:**
- A job step can delegate "go to this URL and extract X" without custom scraping code; the result lands in the thread.

---

## 6. Cross-cutting risks & mitigations

| Risk | Mitigation |
|---|---|
| Ephemeral filesystem on Cloud Run (verified, ~line 511) | Mount GCS/a volume, or limit to "generate-then-download" |
| Two backend layers (legacy JS + TS) | New logic in `packages/api` (TS); `api/` only thin wrappers (per `CLAUDE.md`) |
| Skills depend on the agents endpoint capabilities | The job runs through the agents pipeline (as the scheduler already does), so skills work |
| File System Access security | Strict rejection outside the handle; never accept model-provided paths without validation |
| Multi-instance job duplication | Atomic claim + lock TTL (pattern already proven in `claimDueSchedule`) |
| SSRF via browser MCP | Reuse the existing `mcpSettings.allowedDomains` / `allowedAddresses` in the yaml |

---

## 6b. Implementation status — Feature 2 (M1 + M2 shipped)

Feature 2 milestones **M1** and **M2** are implemented on branch `feature/long-horizon-jobs`.

### What was built

**Data layer (`packages/data-schemas`)**
- `src/types/agentJob.ts` — `IAgentJob`, `AgentJobStatus`, `IAgentJobStep`, `IAgentJobClientOp` (the client-op type pre-wires Feature 1).
- `src/schema/agentJob.ts` — schema with embedded steps, `checkpoint`, `maxSteps`, atomic-claim fields (`lockedAt`/`lockedBy`), and scan indexes.
- `src/models/agentJob.ts` — model with tenant isolation.
- `src/methods/agentJob.ts` — `createAgentJob`, `getAgentJobById`, `listAgentJobs`, `claimDueJob` (atomic claim + stale-lock TTL), `recordJobStep`, `cancelAgentJob`.
- Registered in the `types` / `models` / `methods` index files.

**Worker (`api/server/services/Jobs/`)**
- `index.js` — poller mirroring `Scheduler/index.js` (tick, atomic claim as system, lock TTL, `MAX_PER_TICK`). Runs **one step per tick** and re-queues (`running`) until terminal, giving multi-step execution that survives restarts.
- `runJobStep.js` — one headless agent turn inside the owner's tenant, chaining turns via `parentMessageId` and persisting messages into the job's conversation (checkpointing).
- `planner.js` — pure decision logic (`decideNextStep`, `canRunStep`): continue vs. finish, respecting the `maxSteps` cap and the model's `STATUS:` signal.
- `prompt.js` — step-prompt construction + `STATUS: CONTINUE/DONE` parsing + step summarization.
- `events.js` — in-process pub/sub the worker publishes to after each step (latency optimization on top of durable Mongo state).

**API (`api/server/routes/jobs.js`)**
- `GET /api/jobs` — list (`?status=`, `?conversationId=` filters), `POST /api/jobs` (create + sidebar convo), `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`.
- `GET /api/jobs/:id/events` — **SSE stream**: replays a `snapshot` on connect (so a reopened tab shows everything that happened while closed) then relays live `update` events; auto-closes on terminal status; heartbeat keeps proxies open. Gated by the agents `USE` permission.

**Shared contracts (`packages/data-provider`)**
- `src/types/jobs.ts`, endpoints (`jobs`, `job`, `cancelJob`, `jobEvents`), `QueryKeys.jobs`/`job`, and `data-service` functions (`getJobs`, `getJob`, `createJob`, `cancelJob`).

**Frontend (`client/src`)**
- `data-provider/Jobs/` — React Query `useJobsQuery`, `useJobQuery`, `useCreateJobMutation`, `useCancelJobMutation`.
- `hooks/Jobs/cache.ts` — patches the per-conversation jobs list cache so the banner updates immediately after create/SSE.
- `hooks/Jobs/useJobEvents.ts` — subscribes to the job SSE stream and writes `snapshot`/`update` payloads into the React Query cache for live re-render + reconnection.
- `hooks/Jobs/useConversationJob.ts` — resolves the active job for a conversation (list query + single-job cache + optional `bootstrapJobId` from navigation state); polls while active.
- `hooks/Jobs/useStartLongTask.ts` — creates a job from the composer text, seeds React Query cache, navigates to a **new** conversation (one job per conversation).
- `components/Chat/Input/StartLongTaskButton.tsx` — composer action to kick off a long task (ListChecks icon, next to Send).
- `components/Chat/JobStatusBanner.tsx` — two-line status banner with **user-friendly copy** and **terminal states** (Done / Error / Canceled) plus **Cancel** while the job is active.
- `components/Nav/Jobs/ActiveJobsList.tsx` — sidebar section listing in-flight background tasks with quick navigation to each conversation.
- `components/Chat/ChatView.tsx` — empty job conversations skip the loading spinner and "Nothing found" placeholder while a job is active.

**User-facing banner copy (English i18n keys)**

The UI intentionally **does not** expose internal `maxSteps` (default 25 agent turns per job). Testers see plain language instead:

| Job status | Title (`com_ui_job_status_*`) | Subtitle (examples) |
|---|---|---|
| `queued` | Waiting to start | Your task is in line and will begin shortly |
| `running` (first turn) | In progress | Getting started — you can leave this tab and come back anytime |
| `running` (later) | In progress | N updates so far — still working in the background |
| `waiting_client` | Needs your input | This task needs something from you before it can continue |
| `paused` | Paused | Paused — resume when you're ready |

When multiple jobs are active, a secondary line shows: *"N other background tasks are also running"*.

**Internal model (for developers):** each "step" is one headless agent turn. The worker stops when the model replies `STATUS: DONE` or when `maxSteps` is reached (`packages/data-schemas/src/schema/agentJob.ts`, default 25). This cap is a safety bound, not a user-visible task list.

**UX fixes applied during manual testing**

| Issue | Cause | Fix |
|---|---|---|
| Infinite loading spinner on new job conversation | Empty message list treated as "navigating" | `ChatView`: skip spinner when an active job exists for the conversation |
| "Nothing found" with no banner | `JobStatusBanner` used wrong `useHasAccess` prop (`permissions` vs `permission`) | Fixed prop; banner renders for users with Agents → USE |
| Banner/counter missing after create | Job list cache not ready; message invalidation loop | `patchJobInListCache` + `bootstrapJobId` in navigation state; removed aggressive message invalidation in `useConversationJob` |
| Second background task collided | Reused same `conversationId` | `useStartLongTask` always creates a new UUID conversation per job |
| React Query v4 API mismatch | `refetchInterval` used v5 `query.state.data` shape | Fixed to v4 callback `(data) => …` |

### Tests
- `packages/data-schemas/src/methods/agentJob.spec.ts` — 14 tests (CRUD, conversationId filter, atomic claim, stale-lock re-claim, terminal guards, step recording, owner-scoped cancel).
- `api/server/services/Jobs/planner.spec.js` + `prompt.spec.js` — 16 tests (continue/finish decisions, cap enforcement, status parsing, summarization).

### Not yet wired (optional follow-ups)

See **§6c** for the full Feature 2 backlog. Summary:

- Playwright E2E for tab-close/reopen acceptance criteria.
- Integration tests (`runJobStep`, N-step flow, worker restart, cancel mid-run).
- Handlers TypeScript in `packages/api/src/jobs/` (routes remain thin JS wrappers).
- `requestClientOp` / `resolveClientOp` bridge (**Feature 1** — local files; schema field exists).
- Abort in-flight step via `AbortController` on cancel.
- Terminal-state UI (Done / Error / Canceled badge after job finishes).
- Active-jobs list / sidebar panel.
- Agents permission fallback when `interface.agents.use: false` (Skills-only setups).

---

## 6c. Feature 2 — Remaining work (backlog)

Feature 2 is **usable end-to-end** via the composer UI, but not every item from the original spec or acceptance criteria is closed. Use this table to track what is left **within Feature 2** (not Feature 1/3).

| Priority | Item | Why it matters | Status |
|---|---|---|---|
| **P0 — acceptance** | Manual verification of ≥5-step job with tab closed (test A2) | Core spec promise | ⬜ Not signed off |
| **P0 — acceptance** | Two backend instances, same job — no duplicate steps | Multi-instance safety | ⬜ Not verified |
| **P1 — quality** | Playwright E2E: start task → close tab → reopen → full thread | Automates acceptance | ⬜ |
| **P1 — quality** | Integration test: create job → N worker ticks → N ordered messages | Regression guard | ⬜ |
| **P1 — quality** | Integration test: cancel mid-run → no further steps | Cancel correctness | ⬜ |
| **P1 — quality** | Integration test: worker restart → resumes from `currentStep` | Crash recovery | ⬜ |
| **P1 — quality** | Unit/integration test for `runJobStep` (mock LLM only) | Step persistence | ⬜ |
| **P2 — UX** | Show **Done / Error / Canceled** after job ends (banner currently hides) | User feedback | ✅ |
| **P2 — UX** | Active jobs panel or sidebar entry | Find background work | ✅ |
| **P2 — UX** | Toast on “Start long task” | Discoverability | ✅ Removed redundant success toast — in-chat banner is the feedback |
| **P2 — config** | Gate UI/API on Skills or a dedicated permission when agents disabled | AIWP Claude-only setups | ⬜ |
| **P3 — robustness** | Abort in-flight LLM step when user cancels | True stop, not just DB flag | ⬜ |
| **P3 — robustness** | Cross-instance live SSE (Redis pub/sub or poll-only doc) | Multi-node deployments | ⬜ Partial — Mongo is source of truth; SSE is best-effort per instance |
| **P3 — architecture** | Move handlers to `packages/api/src/jobs/` (TS) | `CLAUDE.md` convention | ⬜ |
| **Deferred → F1** | `waiting_client` / `paused` states + `pendingClientOp` bridge | Local file access | ⬜ Schema only |

### How to use Feature 2 today

1. Ensure the test user has **Agents → USE** permission (jobs run through the agents pipeline).
2. Open a chat, select a model, type a multi-step goal.
3. Click the **list-checks icon** next to Send (not Send itself). Each click starts a **new conversation** for that task.
4. Watch the **status banner** below the header — e.g. **In progress** with *Getting started…* or *N updates so far — still working in the background*. Use **Cancel** to stop.
5. Close the tab and reopen the same conversation from history — messages checkpointed while away should appear in the thread.

**Do not confuse banner text with queued jobs:** the internal `maxSteps` cap (25 agent turns) is **not** shown in the UI. Multiple background tasks each get their own sidebar conversation; the banner may note *"N other background tasks are also running"* when applicable.

---

## 7. Delivery milestones

Each milestone is tagged with the feature it belongs to.

| Milestone | Feature | Scope | Verification | Status |
|---|---|---|---|---|
| **M1 — Minimal job runner** | **Feature 2** (Long-horizon job runner) | `agentJob` schema + worker + `POST /api/jobs` + single-step checkpoint | Jest | ✅ Done |
| **M2 — Multi-step + SSE reconnection** | **Feature 2** (Long-horizon job runner) | planner loop, step rendering, composer UI, SSE snapshot, tab reopen via messages | Jest + manual | ✅ Core done — see §6c for E2E/UX follow-ups |
| **M3 — Backend files (Phase 1A)** | **Feature 1** (Local file access) | per-conversation workspace via the filesystem MCP inside the job | Jest + integration | ⬜ Pending |
| **M4 — File System Access API (Phase 1B)** | **Feature 1** (Local file access) | picker + IndexedDB + `pendingClientOp` bridge. Optional, based on need | Jest (frontend) + manual (Chrome/Edge) | ⬜ Pending |
| **M5 — Browser control** | **Feature 3** (Browser control) | add browser MCP + scoping, after confirming Claude in Chrome's MCP surface | Manual + integration | ⬜ Pending |

**Summary by feature:**
- **Feature 2 (Long-horizon job runner):** M1 ✅, M2 ✅ core — §6c backlog before calling Feature 2 fully closed.
- **Feature 1 (Local file access):** M3, M4 — M3 (backend, low risk) before M4 (client-side, optional).
- **Feature 3 (Browser control):** M5 — mostly configuration once Feature 2 is stable.

---

## 8. Key file map

| Area | Files (implemented) |
|---|---|
| Job schema/methods | `packages/data-schemas/src/schema/agentJob.ts`, `src/methods/agentJob.ts`, `src/types/agentJob.ts`, `src/models/agentJob.ts` |
| Job worker | `api/server/services/Jobs/index.js`, `runJobStep.js`, `planner.js`, `prompt.js`, `events.js` |
| Job API | `api/server/routes/jobs.js` (registered in `api/server/routes/index.js`, worker started in `api/server/index.js`) |
| Job frontend — data | `client/src/data-provider/Jobs/queries.ts`, `mutations.ts`, `index.ts` |
| Job frontend — hooks | `client/src/hooks/Jobs/useJobEvents.ts`, `useConversationJob.ts`, `useStartLongTask.ts`, `cache.ts` |
| Job frontend — UI | `client/src/components/Chat/Input/StartLongTaskButton.tsx`, `JobStatusBanner.tsx`, `ChatView.tsx` (job-aware empty state), `Nav/Jobs/ActiveJobsList.tsx` |
| Shared types | `packages/data-provider/src/types/jobs.ts`, `api-endpoints.ts`, `keys.ts`, `data-service.ts` |
| Tests | `packages/data-schemas/src/methods/agentJob.spec.ts`, `api/server/services/Jobs/planner.spec.js`, `prompt.spec.js` |
| Local files (planned) | `client/src/hooks/LocalFiles/*`, `filesystem` MCP + `file` schema |
| Browser control (planned) | `librechat.yaml` `mcpServers`, `client/src/utils/mcpToolsForPopover.ts` |

### Reference building blocks (existing, reused)
- Scheduler poller + atomic claim: `api/server/services/Scheduler/index.js`
- Headless run: `api/server/services/Scheduler/runScheduledTurn.js`, `headlessRequest.js`
- Chat streaming (separate from job SSE): `packages/api/src/stream/GenerationJobManager.ts`, `client/src/hooks/SSE/useResumableSSE.ts`
- Job live updates: `api/server/services/Jobs/events.js`, `client/src/hooks/Jobs/useJobEvents.ts`
- Tenant context: `packages/data-schemas` `tenantStorage`, `packages/api/src/middleware/tenant.ts`
- Message schema: `packages/data-schemas/src/schema/message.ts` (`content: [Mixed]`, `unfinished`)
