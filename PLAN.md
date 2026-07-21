# Scheduled Chats: Planning Doc

Agent-centric scheduled tasks for LibreChat. A schedule binds a prompt to an agent and a cadence; each fire produces a real conversation (new chat per run, or appended turns in an existing chat) that the user opens like any other.

Reference points: Codex scheduled tasks (title + prompt + schedule + "next run" list, runs land as chats) and Claude Cowork (run target, model, approval policy). LibreChat's differentiator: the agent IS the unit of configuration (model, instructions, tools come from the agent), plus a per-schedule tool allowlist (tighten-only), and later an auth story for unattended runs.

---

## 1. What already exists (leverage map)

The headless-run problem is essentially solved by the resumable-streams work:

- `ResumableAgentController` (api/server/controllers/agents/request.js:214) responds `res.json({ streamId })` immediately and runs the generation detached from HTTP. `progressOptions.res` is already a stub. Persistence of user message + response happens regardless of subscribers; partial saves on `allSubscribersLeft`.
- Client-side join machinery exists end to end: `GET /chat/status/:conversationId`, `GET /chat/stream/:streamId` (subscribeWithResume), `useResumeOnLoad`, `useActiveJobs` polling (`GET /chat/active`) for sidebar spinners.
- Title generation is fully server-side (`addTitle`, api/server/services/Endpoints/agents/title.js), Meili indexing is a Mongoose plugin on save, so scheduled convos index and title themselves.
- Proven headless invocation shape (LiveKit voice branch): internal HTTP POST to `/api/agents/chat/:endpoint` with a server-minted short-lived JWT. `generateShortLivedToken(userId)` (packages/api/src/crypto/jwt.ts:9) exists on this branch and is accepted by the normal `requireJwtAuth` strategy. Second precedent: openai-compat controller builds `endpointOption` manually in-process.
- Out-of-request execution template: approval-expiry handler at api/server/index.js:92-100 (`tenantStorage.run({ tenantId, userId })` + `getAppConfig`). `GenerationJobManager.createJob` reads tenant from ALS, so any in-process fire must enter tenant context.
- Idempotency: `claimGeneration(userId, clientRequestId, ...)` (the #14344 dedup). A deterministic `clientRequestId` per fire gives cross-replica double-fire protection at the chat layer for free.
- HITL without a client already works: run pauses into the Mongo checkpointer (24h TTL default), resume is a separate POST on any worker, `expireStaleApprovals` sweeps abandoned approvals.
- MCP auth: user credentials in PluginAuth (`getUserMCPAuthMap`); OAuth tokens refresh headlessly from stored refresh tokens. Only net-new interactive OAuth fails (flow goes stale after ~10 min, tool call errors into the run).
- Scheduler idiom: no cron/queue library anywhere. The template is the GitHub skill-sync scheduler (packages/api/src/skills/sync/scheduler.ts): self-rescheduling `setTimeout` chain, `unref()`, `registerShutdownTask`, runs on every instance with Mongo lease CAS for dedup (`tryAcquireSkillSyncLock` shape). `LeaderElection.isLeader()` exists but returns true without Redis; per-document Mongo CAS is the safer default.

Net-new work: the Schedule schema/model, the tick engine, the fire path glue, CRUD API + permissions, and the UI.

---

## 2. Data model (packages/data-schemas)

New `schema/schedule.ts` + `methods/schedule.ts` (+ types), following the skillSyncStatus template.

```ts
Schedule {
  id: string            // `sched_${nanoid}`
  user: ObjectId        // owner; runs execute as this user
  tenantId?: string
  name: string
  prompt: string        // message text sent each fire
  agent_id: string      // required: agent-centric by design
  tools?: string[]      // per-schedule allowlist; undefined = all agent tools (tighten-only)
  cadence: {            // canonical, structured (UI edits this natively)
    frequency: 'hourly'|'daily'|'weekdays'|'weekly'
    hour: number; minute: number; daysOfWeek?: number[]
  }
  timezone: string      // IANA tz, captured from browser at save
  cron?: string         // P2 power-user escape hatch (croner already at runtime; P2 is pure surface)
  enabled: boolean
  target: 'new' | 'existing'
  targetConversationId?: string   // when target === 'existing'
  nextRunAt: Date       // indexed; the claim key
  lastRunAt?: Date
  lastRun?: { conversationId: string; status: 'success'|'error'|'requires_action'; error?: string }
  runCount: number
  failureCount: number  // consecutive; auto-pause at threshold
}
```

Indexes: `{ nextRunAt: 1, enabled: 1 }` for the tick query; `{ user: 1 }`; unique `{ id: 1, tenantId: 1 }` per the agent-schema convention.

`ScheduleRun` collection: `{ scheduleId, user, tenantId, scheduledFor, firedAt, conversationId, status: 'started'|'success'|'error'|'interrupted'|'skipped_overlap', error?, durationMs }`, unique index `{ scheduleId: 1, scheduledFor: 1 }`, TTL index on `firedAt`. Phase 1, not optional: the insert-before-fire IS the durable idempotency claim (works without Redis, survives restarts), the `started` row is the overlap check, and the collection doubles as run history.

Schedule representation and dependency posture (P1 = ONE runtime dependency: `croner`):
- Canonical cadence is a structured object, not a cron string: `{ frequency: 'hourly'|'daily'|'weekdays'|'weekly', hour, minute, daysOfWeek?, timezone }`. This is what the UI edits natively (no cron→picker round-trip parsing; claude.ai's client does exactly that conversion gymnastics because they stored cron), and human descriptions come free from client i18n keys (no cronstrue, no 31-locale bundle).
- All next-occurrence math goes through `croner` (zero transitive deps, ISC, Node >=18, used by pm2/Uptime Kuma/ZWave JS/TrueNAS, post-v10 DST fixes). At write time the cadence object maps to a cron string + IANA tz (trivial encodings: hourly `M * * * *`, daily `M H * * *`, weekdays `M H * * 1-5`, weekly `M H * * D`) and croner materializes `nextRunAt`. One engine for presets AND the P2 custom-cron field: no drift, no double test surface. Rationale: croner was going to be the correctness oracle anyway; ship the ground truth instead of a bespoke reimplementation of it (rejected earlier zero-dep DIY Intl computeNext: reimplementing your own oracle is added risk for a badge).
- DST policy = croner's behavior, empirically verified and locked by cadence.spec.ts (croner 10.0.1): spring-forward gap occurrences fire SHIFTED to the first valid instant (daily 02:30 America/New_York fires 03:30 EDT on the gap day, no run lost); fall-back ambiguity fires the first occurrence only. Note: croner's docs claim gap-skip; actual behavior is gap-shift, which matches the user intent better anyway. The hourly floor eliminates the sub-hourly transition bug class.
- Jitter is applied compositionally to croner's output (`nextRunAt = croner.nextRun() + hash(scheduleId) % window`), not inside the cadence math.
- Tests: DST boundary fixtures (gap/ambiguity dates across representative zones) through the preset→cron mapping + croner; mapping unit tests; no property-oracle harness needed since the oracle ships.
- Custom cron strings remain the P2 escape hatch: schema reserves optional `cron`; croner is already at runtime so P2 is pure API/UI surface.
- Loopback fire uses native `fetch` (undici, keep-alive pooled): no HTTP client dependency.

Library landscape note (2026-07): there is no maintained Mongo job-scheduler library to adopt. Agenda is unmaintained and its successor fork Pulse was archived Oct 2025. BullMQ (the Node default) hard-requires Redis; pg-boss/graphile-worker are Postgres-only. Zero cron/queue packages exist anywhere in LibreChat's lockfile today. Current ecosystem best practice is Solid-Queue-style: a thin scheduler on the database you already run. Our ~200-line engine is that best practice, not a compromise.

Claude.ai reference notes (from network + bundle inspection, 2026-07-21): wire format uses `cron_expression` (UTC, 5-field) XOR `run_once_at`, `enabled`, `next_run_at`, `ended_reason: 'run_once_fired'` for one-shots; server auto-disables on invalid cron and on sub-hourly cadence with user-facing reasons; fire-time jitter is default-on (`disableJitter` opt-out); the agent itself gets `list_scheduled_tasks`/`update_scheduled_task`/`send_later` tools (schedule-from-conversation). Adopt: sub-hourly floor, jitter, typed disabled reasons, `runOnceAt` one-shots (P2), agent-managed schedules tool (P2). Improve on: store cron + IANA tz instead of UTC-only (their client does UTC/local conversion gymnastics).

Testing for robustness: mongodb-memory-server contention test (N parallel claim loops, zero double-claims incl. lease-expiry path), idempotency double-fire test (one generation per clientRequestId), DST transition tests for computeNext, misfire skip-forward, 100k-due-same-minute scale test (tick query single-digit ms; cap + jitter drain smoothly).

---

## 3. Scheduler engine (packages/api/src/schedules/)

Files (single-word convention): `schedules/engine.ts`, `schedules/service.ts`, `schedules/handlers.ts`, `schedules/types.ts`.

Efficiency model: the only O(schedules) cost is one covered Mongo query per tick. No per-schedule timers, no in-memory schedule cache, no queue library, no leader election. `nextRunAt` is materialized at write time (create/update/enable, and after each fire) via cron-parser; steady-state engine footprint per replica = one `setTimeout` + a few KB.

- `startScheduleEngine()` per the skill-sync idiom: self-rescheduling `setTimeout` tick (~30s), re-reads config each tick, `unref()`, `registerShutdownTask`, thin JS call in api/server/index.js. All replicas run it (optional `schedules.runners` knob later to dedicate workers).
- Dispatch = two-phase lease-claim, per-doc CAS, exactly-once effect:
  1. Claim: `findOneAndUpdate({ enabled, nextRunAt <= now, leaseUntil < now }, { $set: { leaseUntil: now+5m, leaseBy } })` sorted by `nextRunAt`, looped with a per-instance claim cap. Use `$expr` + `$$NOW` so time comparison uses DB server time (clock-skew immunity).
  2. Record: insert the `ScheduleRun` doc BEFORE firing, with a unique index on `{ scheduleId: 1, scheduledFor: 1 }`. The insert is the durable idempotency claim: E11000 means this fire already happened (or is in flight) regardless of which replica, restart, or Redis availability. Redis-free, restart-proof, and it doubles as the run-history row.
  3. Fire: loopback POST with deterministic `clientRequestId = sched:{id}:{scheduledFireTimeISO}` (second-layer dedup when the Redis job store is present). Only after the POST is accepted (streamId returned) advance `nextRunAt` and clear the lease.
  4. Crash recovery free: die before the run-doc insert → lease expires, any replica re-claims; die after → the re-claimer hits the unique index, marks the stale `started` run `interrupted`, and skips to the next occurrence (no duplicate generation).
- Backpressure without a queue: claim only what can start immediately (per-instance fire-concurrency cap ~5); unclaimed due schedules stay due in Mongo and the next tick (any replica) drains them. Overflow lives in the DB, not process memory.
- Herd shaping: deterministic jitter (`hash(scheduleId) % jitterWindow`) applied inside `computeNext`; stable displayed next-run, opt-out flag (Anthropic ships `disableJitter` the same way). Additionally jitter the tick sleep itself (`interval + rand(0..2s)`) so replica polls de-synchronize (OpenWebUI does exactly this; Sidekiq staggers pollers fleet-wide for the same reason).
- Misfire policy: if `nextRunAt` is older than a grace window (downtime), skip forward without firing.
- Boot-time reconciliation: on engine start, mark orphaned `started` runs as `interrupted` (AnythingLLM does this at boot; we also do it lazily on tick).
- Clock leniency at validation: don't reject near-future schedules just because the app server clock is slightly ahead (OpenWebUI hit this in production).
- Sub-daily cadences (if ever below the hourly floor): snap occurrences to clock boundaries (:00/:05/:10) rather than anchoring to creation time.
- Failure taxonomy: transient (loopback 5xx/timeout) retries within the lease then counts toward `failureCount`; permanent (agent deleted, invalid schedule, permission revoked) disables immediately. Auto-disable always sets a typed `disabled_reason` enum ('too_many_failures'|'agent_deleted'|'invalid_schedule'|'permission_revoked') that the client localizes: never silent, never free text.
- Overlap policy `skip`: don't fire while the schedule's previous run is still `started` in ScheduleRun (Mongo, deployment-independent). DECIDED: `requires_action` (paused into HITL checkpoint, up to 24h) does NOT count as running for overlap purposes; a paused-for-approval run must not starve a daily schedule. The completion hook moves the run doc `started → requires_action` on pause and to a terminal state when the resume path finalizes (same hook, resume flows through the same finalize code).
- Rate limiters, DECIDED: scheduled fires are EXEMPT from the interactive message limiters (`LIMIT_MESSAGE_USER`/`LIMIT_MESSAGE_IP`), via a server-verified scope claim on the internal short-lived JWT checked in the limiter skip callback. Two independent throttles interact badly: legitimate fires silently rate-limited would record as errors and trip auto-disable. Scheduled load is governed solely by the scheduler's own caps (hourly floor, maxPerUser, per-instance fire concurrency).
- Balance pre-check (P1 must-have): when the balance feature is enabled, check the owner's balance before firing; insufficient → record `skipped_balance` (does NOT count toward failure auto-disable; not the schedule's fault), and after 5 consecutive balance skips auto-disable with `disabled_reason: 'insufficient_balance'` so schedules never skip silently forever.
- No-Redis operation: fully supported, zero behavior change in dispatch. Claims, idempotency (run-doc unique index), overlap checks, completion tracking, and history all arbitrate through Mongo. Without Redis the platform already assumes single instance (in-memory job store/event transport, `isLeader()` hardcoded true); the scheduler is safe even in the unsupported multi-instance-no-Redis config because Mongo CAS still prevents double-fires. What degrades without Redis is inherited platform behavior, not scheduler behavior: SSE resume and active-job visibility are per-process.
- Completion tracking: hook, don't poll. `scheduleId` rides in job metadata; the controller's existing finalize paths (`emitDone`/`completeJob`/error) update the run doc + schedule `lastRun`/failure counter inline (one extra Mongo update per scheduled run). Engine-tick reconciliation finalizes run docs orphaned by process death (O(orphans), normally zero).
- Indexes: `{ enabled: 1, nextRunAt: 1 }` (claim), `{ user: 1 }` (list), ScheduleRun `{ scheduleId: 1, firedAt: -1 }` + TTL index on `firedAt` (Mongo self-purges history, zero app code).
- Client ships zero cron code: debounced `POST /api/schedules/validate` → `{ valid, description, nextOccurrences[] }`. One cron implementation server-side; no client/server parser drift, no cronstrue-style bundle weight (Anthropic ships 31 locale copies of it).

## 4. Fire path

Recommended: loopback HTTP POST (the LiveKit-proven shape).

1. Load the owning user doc; enter `tenantStorage.run({ tenantId, userId })`.
2. Mint `generateShortLivedToken(userId)` (60s is plenty).
3. `POST {selfUrl}/api/agents/chat/agents` with `{ text: prompt, conversationId, parentMessageId, agent_id, scheduleId, clientRequestId }`.
   - target 'new': `conversationId: undefined`, `parentMessageId: NO_PARENT`.
   - target 'existing': fetch the conversation's latest message id as `parentMessageId` at fire time.
4. Record `{ streamId, conversationId }` from the immediate JSON response onto the schedule/run doc.
5. Outcome tracking: subscribe to the job emitter in-process when same-process, else poll job status from the (Redis-backed) job store; a small completion sweep updates `lastRun`.

Why loopback wins: the full middleware chain runs unchanged (PII filter, moderation, AGENTS.USE check, agent ACL VIEW, convo ownership, buildEndpointOption, rate limiters), so scheduled runs are behaviorally identical to user-initiated ones, including idempotency, active-jobs visibility, resume, title gen, Meili. The alternative (in-process synthetic req, openai.js-style) avoids needing a self-URL but re-implements middleware and fights req-identity-keyed cleanup (requestDataMap, MCP request context). Keep it documented as fallback if `DOMAIN_SERVER`/loopback proves awkward in some deployments (self URL default `http://127.0.0.1:${PORT}`).

## 5. Per-schedule tool restriction

- Request carries `scheduleId`. Server loads the schedule, verifies `schedule.user === req.user.id`, and intersects `agent.tools` with `schedule.tools` during agent load (same seam where `loadEphemeralAgent` composes per-request tools). Tighten-only: intersection can never add tools, so a spoofed scheduleId cannot escalate; worst case a user narrows their own run.
- Validate `tools ⊆ agent.tools` at schedule save; also re-intersect at run time (agent may have changed since save; `mcpServerNames` on the agent schema helps flag MCP-server-wide removals).
- Deliberately NOT using the HITL policy hook for this: the hook is only active when `toolApproval` is enabled and the run is hitlCapable. The intersection is always-on and cheaper. The `resolveToolApprovalPolicy` reserved-layer seam remains the right place for a Phase 2 per-schedule approval policy.

## 6. HITL and auth for unattended runs

Phase 1: change nothing. If a tool requires approval, the run pauses into the checkpoint (24h TTL), the schedule card shows "needs approval" (job status `requires_action`), and the user resumes from the conversation like any paused run. Abandoned approvals expire via the existing sweeper.

Phase 2: per-schedule approval policy knob mirroring Cowork's three modes:
- `pause` (default): current behavior.
- `deny`: unattended-safe; ask-tools are denied and the run continues/completes with the denial recorded.
- `allow`: auto-approve (admin-gateable).
Implemented through the reserved policy layer in `hitl/policy.ts`.

Phase 3 (auth story): scheduled runs execute as the owning user, so PluginAuth customUserVars and stored OAuth tokens just work; headless refresh covers expiry. The gaps to close:
- Pre-flight check at save + fire: does the agent's tool set include MCP servers whose auth is missing/expired-beyond-refresh? Surface "connect X first" in the editor, and a `reauth_needed` status on the card when a fire hits `ReauthenticationRequiredError`.
- Possibly scheduled-scoped credentials later (service-account style), but no current substrate demands it.

## 7. API surface + permissions

TS handlers in packages/api (`schedules/handlers.ts`), thin JS router `api/server/routes/schedules.js`, mounted at `/api/schedules` (Skills layering).

- `GET /` list (user-scoped), `POST /` create, `GET /:id`, `PATCH /:id` (includes enable/disable), `DELETE /:id`
- `POST /:id/run` manual fire (shares the fire path; `clientRequestId = sched:{id}:manual:{uuid}`)
- `GET /:id/runs` history (Phase 2 with ScheduleRun)

Validation: cron parse + min-interval clamp server-side; name/prompt required; agent VIEW permission on create/update; tools-subset check.

Permissions and config (full existing recipe):
- `PermissionTypes.SCHEDULES` + `Permissions.USE/CREATE` + zod schema + `roleDefaults` + `PERMISSION_TYPE_INTERFACE_FIELDS` row + interface schema field + `hasExplicitConfig` case + `updateInterfacePermissions`.
- Route guard via `generateCheckAccess`; client gate via `useHasAccess` + interface flag.
- Admin knobs in librechat.yaml: `schedules: { maxPerUser, minInterval, autoDisableAfterFailures }` (or nested under interface; decide at impl).

Data-provider: endpoints in `api-endpoints.ts`, `data-service.ts` methods, types in `types/`, `QueryKeys.schedules` (+ `scheduleRuns`) in keys.ts. Rebuild with `npm run build:data-provider`.

## 8. Client UI/UX

Entry point: new UnifiedSidebar panel (`id: 'scheduled'`) registered in `useSideNavLinks`, gated by `useHasAccess(SCHEDULES, USE)` + interface flag. Panel-first (Memories/MCPBuilder pattern); a full-page `/scheduled` route (Skills-style) can come later if history/detail outgrows the panel.

Panel (SchedulePanel):
- Header: title + "New schedule" button + search filter (FilterInput, match-sorter).
- Schedule cards: name, agent (avatar + name via agentsMap/`useGetAgentByIdQuery`), human cadence summary ("Weekdays at 8:00 AM"), next run relative time, last run status chip (success / error / needs approval) linking to the run's conversation, enable/disable Switch, kebab: Run now / Edit / Delete.
- Empty state: 2-3 tappable templates (Codex/Cowork-style suggestions): "Daily brief", "Weekly summary", "Monitor a topic". Prefill the dialog.

Create/edit dialog (OGDialog + react-hook-form, MCPServerDialog sectioning):
- Name.
- Prompt (textarea): "what should the agent do each run".
- Agent: `ControlCombobox` over `useListAgentsQuery` (AgentSelect recipe).
- Tools (collapsed "Advanced" by default): MultiSelect populated from the selected agent's tools; default all selected; deselecting narrows the run.
- Frequency: preset Dropdown (Hourly / Daily / Weekdays / Weekly / Custom cron) + hour/minute Dropdowns + weekday picker for Weekly. No date-picker dependency exists or is needed; this mirrors the ApiKeys duration-preset pattern and matches the Codex/Cowork UIs. Timezone auto-captured, echoed in the summary line ("Runs weekdays at 8:00 AM, America/New_York").
- Target: radio "Start a new chat each run" (default) / "Continue an existing chat" + conversation picker.
- Footer: cadence summary sentence + Save.

Surfacing runs:
- Conversations from runs are ordinary conversations: they appear in the sidebar on the next refetch (react-query window-focus refetch covers returning users). If the user is online when a fire happens, `useActiveJobs` already shows the generating spinner and clicking the convo attaches to the live stream via the existing resume path.
- Phase 2 polish: completed-while-away badge on the schedule card (from lastRun), toast on completion when online, deterministic titles option (title = schedule name + date instead of gen-title, for scannability).

Localization: all strings via `useLocalize`, `com_ui_` keys in en/translation.json.

## 9. Phasing

Phase 1 (first passing version, scope settled 2026-07-21): "a schedule fires a real chat as the owning user, multi-user safe, admin-capped." One runtime dep (croner).
1. Schemas: `Schedule` (cadence object + tz, agent_id, name, prompt, enabled, target, nextRunAt, lastRun, failureCount, disabled_reason) + `ScheduleRun` (unique `{scheduleId, scheduledFor}` = idempotency, TTL'd). Schema RESERVES `tools?` and `cron?` fields, no P1 behavior.
2. CRUD API (`/api/schedules`: list/create/get/patch/delete + `POST /:id/run`) + SCHEDULES permission type + interface flag + admin caps, P1 must-haves with PICKED defaults (admin-overridable via librechat.yaml): `minInterval: 1h` (enforced structurally by the preset set), `maxPerUser: 10`, `autoDisableAfterFailures: 5`, per-instance fire concurrency `5`, balance pre-check on (when balance feature enabled). Timezone is a REQUIRED field: the client auto-fills from the browser; API callers must pass a valid IANA zone; missing/invalid → 400 with a clear error. No silent UTC fallback (a silent-UTC "8 AM brief" firing at midnight is worse than a validation error).
3. Engine: tick + lease claim + run-doc insert + jitter + misfire skip + auto-disable w/ typed reason + boot/tick reconciliation + completion hook.
4. Fire: run-as-owner loopback POST (short-lived JWT, native fetch, deterministic clientRequestId).
5. Target: `new` ONLY (the cross-app convention). The seam for later expansion is explicit: fire goes through a single `resolveTarget(schedule) → { conversationId?, parentMessageId }` helper (P1 implementation: `{ parentMessageId: NO_PARENT }`), and the schema's `target` enum ships with only `'new'`. Adding `thread` (rolling own-conversation) or arbitrary-existing later touches resolveTarget + one dialog control, nothing else. Rationale for deferring even `thread`: racing live user activity, preliminary-parent 409s, and append-forever context growth are all real and all avoidable in the first pass.
6. Client: sidebar panel (cards: name, agent, cadence sentence from i18n, next run, lastRun status chip → links to convo, enable Switch, kebab Run now/Edit/Delete) + create/edit dialog (name, prompt, agent ControlCombobox, frequency preset + hour/minute dropdowns, target toggle). No history view, no live next-run preview in dialog (cadence sentence is client-derivable; stored nextRunAt shows after save).
7. Tests: claim contention + idempotency (mongodb-memory-server), DST fixtures through preset→cron→croner, engine fake-timer tests, handler tests.

Explicitly cut from P1 (all have reserved seams): tool allowlist (P2: MultiSelect + run-time intersection), custom cron (P2: surface only), run history UI + `GET /:id/runs` (collection already exists), approval-policy knobs (default pause-into-checkpoint behavior stands), notifications, agent-managed schedule tools, auth pre-flight (P3).

Phase 2:
- ScheduleRun history + `GET /:id/runs` + panel history view.
- Per-schedule approval policy (pause / deny / allow).
- Badges/toasts, deterministic titles, needs-approval surfacing from job status.
- Admin quotas UI, run-overlap policy refinement.

Phase 3:
- Auth story: pre-flight MCP credential validation, reauth-needed status + prompts.
- Notifications (email/push) on completion/failure: needs a notification substrate, none exists today.
- Sharing/team schedules (ResourceType.SCHEDULE + ACL) if demanded; project grouping for run convos.

## 10. Research validation (2026-07-21)

Mechanism survey: every mature system converges on materialized-next-run + indexed poll + atomic claim, regardless of datastore.
- Agenda (Mongo): findAndModify per-job lock with `lockedAt` + `lockLifetime` (10m default), polls every 5s. Identical to our lease-claim.
- Solid Queue (Rails 8 default, built to drop Redis): DB polling with `FOR UPDATE SKIP LOCKED`; dispatcher polls scheduled executions at 1s; only two query shapes so a covering index is always used. Mongo has no SKIP LOCKED; per-doc `findOneAndUpdate` is the standard analog.
- Oban (Postgres): LISTEN/NOTIFY is only a wake-up nudge; the substrate is poll + SKIP LOCKED because push notifications are lossy (disconnected listeners miss them, PgBouncer transaction pooling breaks LISTEN). Lesson: push can optimize latency, never replace the poll.
- Sidekiq (pure Redis): still polls its scheduled ZSET; staggers pollers so fleet-wide average poll rate stays constant regardless of process count. Redis does not remove polling; it just relocates the sorted set.

Conclusion: Redis adds nothing to scheduling correctness or meaningful efficiency at our fire rates. Mongo-arbitrated claims are the right substrate in both deployment modes; optional Redis pub/sub could later shave tick latency as a wake nudge, never as the mechanism.

AI-app landscape:
- OpenWebUI "Automations": closest comparable (multi-user), and independently converged on our exact engine: `scheduler_worker_loop` runs on every instance, `claim_due(now, limit=10)` batch atomic claim, jittered poll sleep, materialized `next_run_ns` computed at create/update/toggle, run-history rows, manual run endpoint. RRULE-based (not cron) with per-user tz, min-interval + max-count admin env caps (`AUTOMATION_MIN_INTERVAL`, `AUTOMATION_MAX_COUNT`, `ENABLE_AUTOMATIONS`), each run creates a chat through the normal completion pipeline, natural-language management from within a conversation, calendar view of upcoming occurrences.
- AnythingLLM "Scheduled Jobs": name + prompt + cron (visual builder) + per-job tool allowlist (`toolOverrides`, empty = none) — same tighten-only tool model we chose. Forked worker per run with timeout + SIGTERM kill, p-queue concurrency, queued→running→terminal run rows, boot-time orphan cleanup, web-push completion notifications, results in an auto-created workspace with "Continue in Thread". Single-user mode only: per-job in-process timers don't generalize to multi-user/multi-replica, which is exactly why we rejected that shape.
- Dify: schedule is a workflow trigger node (visual picker + cron), workflow-centric not chat-centric.
- Hermes Agent: NL-scheduled cron + one-shot delays, results delivered to messaging platforms (Telegram/Slack/etc.), jobs created from chat deliver back to that chat.

Positioning: nobody has agent-centric + multi-user + ACL'd scheduled chats (AnythingLLM literally can't in multi-user; OpenWebUI schedules prompts against models, not persistent agents). Our resume/HITL machinery (pause-into-checkpoint for approvals) is unique; everyone else auto-approves or has no tools at all.

## 11. Defined semantics (decided 2026-07-21)

- Rate limiting: scheduled fires exempt from interactive message limiters; scheduler caps govern (see engine section).
- Spend guardrails are P1 must-haves with picked defaults: minInterval 1h, maxPerUser 10, autoDisableAfterFailures 5, fire concurrency 5, balance pre-check with `skipped_balance` → `insufficient_balance` disable after 5 consecutive.
- Overlap: only `started` runs block; `requires_action` (HITL pause) does not.
- Target: new-conversation only in P1, expansion isolated behind `resolveTarget()`.
- Timezone: required IANA field, client-filled from browser, 400 on missing/invalid, never silent UTC.
- Agent drift: schedules run the agent AS IT EXISTS at fire time, same as interactive chat. Removing a tool the prompt depends on does not error or disable; the run simply behaves per the agent's current tool set. Only agent DELETION disables (`agent_deleted`). This is the agent-centric contract, named explicitly so it's not re-litigated per bug report.

## 12. Remaining open decisions

- Self-URL for loopback POST in exotic deployments; fallback is the in-process shape.
- Naming: "Scheduled chats" vs "Scheduled tasks" (UI copy + interface flag name).
- Default enablement: recommend interface flag ON by default with the conservative caps above; admin can disable.
