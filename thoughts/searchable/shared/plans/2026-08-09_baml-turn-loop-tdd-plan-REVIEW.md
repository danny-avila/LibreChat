# Review: BAML Owns the Chat Turn Loop TDD Plan

**Plan reviewed:** `2026-08-09_baml-turn-loop-tdd-plan.md`  
**Review date:** 2026-08-09  
**Repository state:** `baml-setup` at `a577fd2c5` plus the existing uncommitted BAML spike  
**Decision:** **Needs major revision before production implementation**

## Executive summary

The plan has a good migration shape: it identifies the `createRun` / `processStream`
seam, keeps the existing runner as the default, separates host-owned tool execution
from BAML control flow, and builds on an unusually strong offline spike. The current
spike also passes its advertised offline gates: 20 BAML tests and 35 JavaScript probe
assertions.

The production boundary is not yet specified precisely enough to implement safely.
The proposed `TurnMessage { role, content: string }` loses real message state; the
generated BAML wrapper does not expose the collector/call-context path on which the
billing and cancellation design depends; event names are listed without the payload,
metadata, graph, identity, and ordering invariants required by the installed handlers;
and the plan assigns abort/final-event behavior to the adapter even though the existing
controller and job manager own terminalization. One required event is also incorrect:
ordinary text completion does not emit `on_run_step_completed` in the existing runner.

Phases 0–2 may continue as explicitly non-production boundary research after the
small Phase 0 corrections below. Phases 3–4 are not approved until the contracts and
tests in this review are incorporated. Phase 5 is a sketch and should become a separate
TDD plan after Stage 1 equivalence is proven.

| Review dimension | Result | Main issue |
| --- | --- | --- |
| Contracts | Blocked | Event, usage, abort, and input contracts do not match their current owners/consumers. |
| Interfaces | Blocked | A `processStream`-shaped object is not a substitute for the full `Run` surface or handler/graph interface. |
| Promises / async | Blocked | Async-only invocation, cancellation, serialized dispatch, deadlines, and terminal races are unspecified. |
| Data model | Blocked | The DTO is lossy for tool, multimodal, reasoning, summary, IDs, and LangChain message instances. |
| API / rollout | Blocked | Factory scope, eligible callers, flag authority, provider support, and generated import surface remain open. |
| Code quality | Revision required | The plan needs one typed adapter port and explicit control-flow/limit rules to avoid a compatibility shim becoming a second runtime. |
| Offline spike | Pass, with caveats | All local checks pass; they do not prove live progressive streaming, billing, cancellation, or production module loading. |

## Critical findings

### C1. The event compatibility contract is name-only and contains a wrong event

Plan lines 35–58 and 316–325 say that emitting the listed events in order makes the
runner compatible. The consumers require substantially more:

- `on_run_step` must carry a `RunStep` with an `id`, numeric `index`, and typed
  `stepDetails`; the aggregator stores it in a step map
  (`node_modules/@librechat/agents/src/types/stream.ts:52-92`,
  `node_modules/@librechat/agents/src/stream.ts:2450-2483`).
- Message, reasoning, and step deltas must carry the same ID as an already-created
  step or the aggregator drops them
  (`node_modules/@librechat/agents/src/stream.ts:2515-2527,2546-2563`).
- Default handlers branch on payload details and visibility metadata, await durable
  emission, and sometimes require the graph
  (`api/server/controllers/agents/callbacks.js:219-233,393-523`).
- `on_run_step_completed` is associated with tool/run-step completion. The normal
  text path dispatches message creation and message deltas without that completion
  event (`node_modules/@librechat/agents/src/stream.ts:1814-1881`; tool completion
  occurs at `:895-915`). Requiring it for every text turn is observably different.

**Required amendment:** define a typed adapter transcript for each supported path.
For every event, name its `data` schema, `metadata` schema, graph requirement,
`runId`/`threadId`/`agentId`, step/message IDs, index allocation, visibility, and
predecessor. State that ordinary Stage 1 text emits message creation plus ordered
message deltas and does **not** invent a tool-step completion. Test the transcript
against the real aggregator and default handler registry, not a mock that only records
event names.

### C2. Handler injection and graph context are not connected to the proposed runner

The third `processStream` argument is `EventStreamOptions`; its `callbacks` are client
tool callbacks, not the custom event-handler registry
(`node_modules/@librechat/agents/src/types/run.ts:405-408`,
`node_modules/@librechat/agents/src/types/graph.ts:56-65`). The registry is constructed
in `api/server/services/Endpoints/agents/initialize.js:358-375`, passed through the
client, and installed on `Run` by `createRun`
(`packages/api/src/agents/run.ts:1552-1557`). Its handler interface receives event,
data, metadata, and optional graph (`node_modules/@librechat/agents/src/types/graph.ts:122-143`).
`ModelEndHandler`, in particular, returns if graph or metadata is absent and calls
`graph.getAgentContext(metadata)` (`api/server/controllers/agents/callbacks.js:81-115`).

**Required amendment:** introduce one explicit, typed adapter port that receives the
real handler registry and the minimum valid dispatch context. Decide whether the
existing `Run`/graph remains the outer lifecycle owner or whether a smaller supported
handler facade replaces graph-dependent behavior. Do not pass a lookalike through
`{ callbacks }` or construct a duck-typed fake graph inside the adapter.

### C3. Collector access and request cancellation are assumptions, not callable interfaces

The low-level bridge declares `Collector`, collector-aware `callFunction`, and
`BamlCallContext.abort()` (`node_modules/@boundaryml/baml-bridge/dist/index.d.ts:53-66`,
`dist/native.d.ts:33-39`). The generated wrappers, however, invoke the runtime with
null collectors and expose no typed collector/call-context option
(`node_modules/@boundaryml/baml-bridge/dist/define_function.js:167-210`,
`baml_ts/baml_sdk/toolloop/index.ts:53-57,124-145`). The bridge package is ESM-import
only while the API path is CommonJS (`node_modules/@boundaryml/baml-bridge/package.json:14-18`).
The plan itself says the bridge cannot currently be `require()`-ed, then makes direct
collector access the billing strategy.

The existing request signal is threaded into the current graph
(`packages/api/src/agents/run.ts:1067-1094,1430-1434`), and the job manager aborts
the exact runtime before terminal cleanup
(`packages/api/src/stream/GenerationJobManager.ts:3174-3190`). No equivalent
signal-to-`BamlCallContext` bridge is specified.

**Required amendment:** make Phase 0 prove one production-loadable public entrypoint
that can:

1. invoke the exact `RunTurn` function asynchronously with the selected runtime client;
2. attach a per-call collector;
3. create and abort a per-call context from `config.signal`;
4. detach the abort listener and release call/stream resources in `finally`; and
5. return a normalized final result and usage record.

If the generated public API cannot support this, change the generator/export boundary
before designing Phase 3. Do not reach through generated private fields.

### C4. The proposed input boundary silently loses valid conversation history

`TurnMessage { role: string, content: string }` (plan lines 247–260) does not model
what reaches the seam. `formatAgentMessages` produces Human/AI/System/Tool message
instances and can carry content arrays, tool calls and results, tool-call IDs,
reasoning/signatures, summaries, skills, media, arbitrary provider metadata, and
message IDs (`api/server/controllers/agents/client.js:2320-2331`;
`node_modules/@librechat/agents/src/types/stream.ts:388-431`). Existing API tests use
AI tool calls, ToolMessages, and non-string tool content
(`packages/api/src/agents/run.spec.ts:57-60,161-165`).

Serialization is also unsafe unless it is owned: the formatter installs `role` as a
non-enumerable property (`node_modules/@librechat/agents/src/messages/format.ts:119-139`),
so naïve `JSON.stringify` of the LangChain instances can omit the role and other
canonical fields.

The phrase “text-only turn” does not solve prior structured history. Stage 1 must not
silently flatten or discard an earlier tool result, image, summary, or reasoning block.

**Required amendment:** choose one of these contracts and test it with real
`formatAgentMessages` output:

- a versioned canonical structured envelope that intentionally preserves supported
  roles, ordered content parts, IDs, tool/reasoning fields, summaries, and metadata; or
- a versioned, strictly text-only envelope plus a preflight eligibility predicate that
  routes every unsupported history/configuration to the existing runner before the
  generation job begins.

Define unknown-version/unknown-field behavior, absent and malformed fields, UTF-8 byte
and nesting/part limits, system/instruction/summary precedence, and stable rejection or
fallback categories. Add an owned serializer; do not serialize dependency instances
directly.

### C5. Usage collection, token billing, and context usage are conflated

`CHAT_MODEL_END` is an internal `GraphEvents` event, not a value from
`packages/data-provider/src/types/runs.ts`. Its installed handler does not itself bill.
It requires graph/metadata, reads `usage_metadata`, enriches it with model/provider/
agent/cache/type fields, appends it to `collectedUsage`, and emits `on_token_usage`
(`api/server/controllers/agents/callbacks.js:73-167`). Spending occurs later through
the AgentClient finalizer (`api/server/controllers/agents/client.js:1903-1929,2727-2735`).
The abort middleware owns the corresponding abort-path spend, so exactly-once drain
ordering matters (`api/server/middleware/abortMiddleware.js:63-95,152-167`).

The current handler skips collection when usage is unavailable
(`api/server/controllers/agents/callbacks.js:105-107`); that is not the plan's proposed
“explicit zero.” The plan must distinguish provider-reported zero from unavailable
usage and select a compatibility policy.

`on_context_usage` is different again. `TContextUsageEvent` requires a pre-call context
breakdown and budget, not just input/output token counts
(`packages/data-provider/src/types/runs.ts:163-201`). BAML's final collector cannot
retroactively supply this structural snapshot.

**Required amendment:** document three separate paths:

1. provider model-end data to a complete normalized usage record;
2. token-usage SSE and exactly-once collected-usage spending on success/error/abort; and
3. pre-invocation context-usage calculation, or an explicit Stage 1 decision to omit it
   with the resulting UI/telemetry compatibility gap.

Use the same pricing/spend boundary as the existing client, and test cache fields,
provider-reported zero, unavailable usage, partial-error usage, abort, and a late
collector result racing abort cleanup.

### C6. Terminal error and abort ownership is assigned to the wrong layer

Plan lines 324–325 say the adapter emits an error/final-aborted event and ends the job.
Today `processStream` rejects; the surrounding controller classifies the failure, and
the request controller/job manager owns durable terminal state and final publication
(`api/server/controllers/agents/request.js:1524-1674,1739-1803`;
`packages/api/src/stream/GenerationJobManager.ts:3700-3837`). Controller cleanup also
settles memory/subagent work, performs billing, and clears references
(`api/server/controllers/agents/client.js:2697-2763`).

**Required amendment:** state that the Stage 1 adapter:

- propagates provider failures through rejection;
- preserves abort classification when its request signal fires;
- stops dispatching after disposal; and
- never publishes the job's terminal/final frame or mutates terminal job status.

Add controller/job-manager integration tests asserting exactly one terminal result for
success, provider error, abort-before-call, abort during handshake, abort after partial
content, abort after the last delta, reconnect, and generation replacement.

### C7. A `processStream` lookalike does not cover the controller's `Run` interface

`createRun` returns a concrete `Run`, and the controller also uses activity-label
generation, calibration ratio, title generation, `resume`, and `getInterrupt`
(`api/server/controllers/agents/client.js:612-715,2075-2087,2700-2703,2963-2974,3250-3270`).
A BAML object with only `processStream` cannot be substituted structurally without
losing these lifecycle operations.

The factory also has more consumers than the named AgentClient path, including OpenAI
and Responses controllers/services. Selecting at the shared factory can alter routes
and resume paths that Stage 1 does not support.

**Required amendment:** pick and document one architecture:

- keep the existing `Run` as the lifecycle object and delegate only an eligible
  single-turn generation operation to a `TurnExecutor`; or
- define a complete `TurnRunner` facade and explicitly delegate every retained `Run`
  method.

Put selection behind one named predicate at the AgentClient streaming call site (or
prove every factory caller). Enumerate ineligible cases, including tools, tool history
if unsupported, multimodal/reasoning history if unsupported, HITL/resume, subagents,
OpenAI/Responses routes, and auxiliary title/activity operations.

### C8. Streaming, backpressure, and cleanup behavior need a real async contract

The repository's probe records that generated synchronous companions block Node's
event loop and can deadlock an in-process server
(`scripts/baml-toolloop/async-probe.mjs:5-12`). Generated streaming is pull-based and
returns partial typed values; the current probe does not establish progressive
network partials (`scripts/baml-toolloop/async-probe.mjs:124-155`). The plan does not
say whether partial values are prefixes, snapshots, or field updates. Forwarding every
snapshot as a delta can duplicate persisted text.

Handlers must also be awaited serially. Durable emission is deliberately awaited to
preserve ordering (`api/server/controllers/agents/callbacks.js:219-233`), and the job
manager fences/sequences appends (`packages/api/src/stream/GenerationJobManager.ts:5089-5204`).

**Required amendment:** require the generated `_async` API for every call and stream
operation; define snapshot-to-delta/deduplication and final reconciliation rules; await
each handler in source order; and add named call, first-byte, idle, input-byte, partial-
buffer, and callback-backpressure limits. Verify progressive partials against a
separate-process HTTP fixture, then test EOF without a typed final, invalid final,
provider hang, slow callback, and abort during each wait. Cleanup must detach listeners,
abort/close the call context and iterator where supported, release the collector, and
suppress late callbacks.

### C9. Phase 5 is not an implementation-ready plan

The document accurately labels Phase 5 “Sketched, not specified” (lines 361–381), but
the title and success criteria otherwise read as though BAML ownership of the full turn
loop is planned. Tool schemas/results, loop state, maximum iterations, parallel failure
isolation, cancellation, repeated-call IDs, context growth, and terminal selection are
not specified. The async probe also documents a nondeterministic spawned-task exception
escape (`scripts/baml-toolloop/async-probe.mjs:62-80`).

**Required amendment:** change this plan's deliverable to “Stage 1, single-shot text
generation through BAML” and move tool-loop ownership into a separate TDD plan after
Stage 1 production equivalence. Keep tool execution host-owned and forbid BAML `spawn`
for tool execution until a dedicated bounded-concurrency/error-isolation proof exists.

### C10. The production package and credential boundaries do not exist yet

The generated SDK lives under the ESM-marked `baml_ts` tree, outside the CommonJS
`@librechat/api` package and its public build entries
(`packages/api/tsdown.config.mjs:4-13`, `packages/api/package.json:4-20`). There is no
workspace export or API build dependency for it. More importantly, `Dockerfile.multi`
builds the API after copying package sources/dist trees but never copies `baml_ts`; the
final image copies only `packages/api/dist` (`Dockerfile.multi:64-70,109-116`). A local
Node `require()` probe therefore does not prove that the production image contains the
generated runner.

Provider setup is also more than model/key/base URL. `initializeAgent` resolves
provider options using the request and database, attaches resolved `llmConfig` and
configuration (`packages/api/src/agents/initialize.ts:1102-1122,1365-1368`), and
`createRun` resolves dynamic headers against safe user/request data
(`packages/api/src/agents/run.ts:1211-1268`). The proposed adapter input does not say
how it receives these already-authorized values. Reconstructing them from raw request
or environment data can break custom/Azure/Anthropic endpoints and tenant isolation;
serializing or logging them can expose secrets.

**Required amendment:** define a real package/export boundary that bundles or publishes
the generated SDK for the API, tracks BAML inputs in CI/build caches, and loads the
native bridge in the actual deployment image. Define an internal call-options DTO that
receives resolved provider/model/base URL/header configuration and safe tenant identity
from the existing initialization owner, redacts secrets from errors/logs, and is tested
for built-in, custom/reverse-proxy, user-key, Azure/Anthropic, missing-key, and tenant-
isolated cases.

## API and rollout decisions that must move out of “open questions”

Before Phase 3, the plan must name:

1. the production import/export boundary between the CommonJS API and generated ESM
   SDK, including build ordering, CI cache inputs, `Dockerfile.multi`, and native-package
   smoke tests against the actual exported runner;
2. the exact supported endpoint/provider/model set for Stage 1 and the behavior for
   unsupported runtime-client options;
3. the feature flag's schema, owner, authorization, default, propagation path, and
   whether it is an environment/admin capability plus an internal per-request decision
   rather than a user-controlled arbitrary request field;
4. the selection predicate and all callers/resume paths that cannot select BAML;
5. whether an eligible BAML failure falls back before any event is emitted or fails
   closed—fallback after partial content must be forbidden to avoid duplicate turns;
6. the stable return/rejection type of the adapter; and
7. a rollout/rollback signal set covering latency, provider errors, abort completion,
   malformed finals, missing usage, billing divergence, and event-transcript mismatch.

Leaving provider coverage and flag location open (plan lines 395–404) changes the
factory, data, and security boundary and is therefore a design blocker, not rollout
polish.

## Code-cleanup and maintainability constraints to add to the plan

The adapter is a compatibility boundary and should have one reason to change. Add these
structural rules to the implementation phases and reviews:

- Use one typed `TurnExecutor`/`TurnEventDispatcher` port. Keep input normalization,
  BAML invocation, event projection, and usage normalization in named units; do not
  duplicate controller persistence/SSE or build a fake graph through duck typing.
- Use guard clauses for eligibility, unsupported data, abort, and malformed-final paths.
  Avoid nesting provider selection, stream iteration, event translation, and cleanup
  inside one function.
- Keep control expressions pure. Do not hide `await handler.handle(...)`, iterator
  advancement, collector mutation, billing append, or abort calls inside `if`, ternary,
  logical short-circuit, `filter`, or `Promise.all` expressions.
- Dispatch awaited events in a straightforward serial loop. Do not use concurrent
  callback fan-out where order, persistence, or mutable aggregation is observable.
- Use existing event enums (`GraphEvents`, `StepEvents`, `UsageEvents`) and named
  constants for byte/depth/part/iteration/concurrency/call/idle limits. Do not scatter
  event strings, status strings, numeric thresholds, or model/provider literals.
- Model role/content/event variants with closed discriminated unions and exhaustive
  switches. Unknown data should take an explicit telemetry-and-fallback/reject path.
- Keep terminal job state and spending at their existing owners. A local shim that
  directly persists messages, emits final SSE, or calls spend functions would conceal
  the missing contract rather than repair it.
- Add the repository's post-implementation cleanup review before rollout, including
  dead imports, wrong-abstraction calls, generated/private API reach-through, nesting,
  side effects in control expressions, mutable control variables, magic literals, and
  LLM residue.

These requirements apply the repository cleanup criteria at the plan level:
side-effect-free conditionals/control expressions, no mutation in control expressions,
guard-clause-oriented nesting, named constants, explicit control flow, and root-cause
maintainability recovery.

## Phase-by-phase amendments

### Phase 0 — toolchain and module gate

Status: **Conditionally acceptable after corrections.**

- Fix the documented build command at plan line 222. It must invoke each script, for
  example `npm run build:data-provider && npm run build:data-schemas && npm run build:api`.
- Replace the unverified “pin in `baml.toml`” instruction with the exact supported BAML
  wrapper/toolchain selection mechanism and pin `@boundaryml/baml-bridge` exactly rather
  than with `^0.15.0`. Assert wrapper, toolchain, generated SDK, and bridge compatibility.
- Make Linux/native Docker loading and the production API module format a required gate.
- Add the public collector/call-context/runtime-client proof described in C3.

### Phase 1 — canonical boundary

Status: **Not acceptable as a production DTO.**

- Replace `role: string` with a closed role union and add a schema version.
- Define the canonical serializer, structured-content policy or preflight eligibility
  gate, system/instruction/summary merge order, unknown/malformed behavior, and named
  byte/depth/count limits.
- Test real formatted LangChain messages, legacy summaries, tool histories, reasoning,
  IDs, Unicode, empty content, absent fields, malformed tool arguments, multimodal
  parts, unknown versions, and exact size boundaries.

### Phase 2 — exact generated-call proof

Status: **Acceptable only as offline research until the concrete call path is proven.**

- The existing runtime-client spike constructs and inspects a request; it does not
  execute the exact `RunTurn` function with `PrimitiveClientOptions`. Add that test.
- Define the typed output/stream envelope, message identity, finish state, reasoning
  policy, partial snapshot semantics, and final reconciliation.
- Require `_async`; add a real progressive-network fixture and timeouts.

### Phase 3 — adapter

Status: **Blocked.**

- Implement only after C1–C8 are resolved in the plan.
- Test through the real handlers, aggregator, controller, and job manager with exact
  payload fixtures, not only a scripted fake registry.
- Prove success/error/abort/replacement terminal ownership, Redis and in-memory ordering,
  reconnect behavior, exactly-once usage drain, and no late callback after disposal.

### Phase 4 — rollout and equivalence

Status: **Blocked until Phase 3 passes.**

- Define the capability predicate, endpoint/provider matrix, flag authority, fallback
  boundary, observability, and rollback thresholds.
- Compare canonical event transcripts, persisted assistant content, terminal state,
  usage records, spend outcomes, and context-usage behavior—not just final text.

### Phase 5 — host-dispatched tool loop

Status: **Move to a separate plan.**

- Preserve the host-owned execution direction, but create a new TDD plan for typed tool
  protocols, state, iteration limits, parallelism, failure isolation, cancellation,
  billing per model call, and context growth after Stage 1 equivalence is demonstrated.

## Required acceptance checklist

The revised plan is ready for another review only when all of the following are true:

- [ ] Every supported event has an exact payload/metadata/identity/order contract and
      a fixture consumed by the real aggregator/default handlers.
- [ ] Ordinary text completion no longer invents `on_run_step_completed`.
- [ ] A production-loadable async BAML entrypoint exposes per-call runtime client,
      collector, and abort context without private API reach-through.
- [ ] Real formatted messages either round-trip through a versioned canonical envelope
      or fail the preflight capability predicate without silent loss.
- [ ] System instructions, additional instructions, summaries, and historical tool/
      reasoning/media content have documented precedence and support behavior.
- [ ] The adapter contract defines return value, rejection, cancellation, deadlines,
      backpressure, resource cleanup, and late-callback suppression.
- [ ] The existing controller/job manager remains the sole terminal owner and exactly
      one terminal result is proven for all success/error/abort/replacement races.
- [ ] Usage normalization, token-usage SSE, context usage, collected-usage ownership,
      and success/abort spending are separately specified and tested.
- [ ] Runner selection is scoped to named callers/configurations and the flag/provider/
      fallback decisions are closed.
- [ ] Equivalence compares event transcripts, persistence, terminal state, usage, and
      spend outcomes through in-memory and Redis/reconnect paths.
- [ ] Stage 2 tool-loop work is removed from this plan or specified in a separate,
      complete TDD plan.

## Evidence verified during review

The following offline commands passed in the current worktree:

```text
baml check                                             12 source files checked
baml test -x 'SelectDynTool::TypeBuilderBlock'         20 passed
node scripts/baml-toolloop/provider-pattern.mjs        11/11 passed
node scripts/baml-toolloop/bridge-loop.mjs              8/8 passed
node scripts/baml-toolloop/runtime-union.mjs             8/8 passed
node scripts/baml-toolloop/dynamic-probe.mjs             8/8 passed
```

The known-panic assertions printed by `runtime-union.mjs` are expected by that probe.
The tool-loop README still says 17 BAML tests while the current suite reports 20; update
that count or avoid duplicating volatile totals. None of these offline tests exercises
a live provider, progressive remote streaming, the production CommonJS import path,
real default handlers, durable job stores, cancellation, or spending.

## Tracking status

This review found critical issues, but no tracking bead was created or synchronized.
`bd context` fails with `cannot resolve repo context: no .beads directory found` in
this worktree. Initializing a repository tracker would be an additional persistent
project change outside this review request. Create the tracking issue after the project
selects or restores its Beads repository.

## Approval status

**Overall: Needs major revision.**

- Approved: continuing the existing offline spike and corrected Phase 0 boundary work.
- Not approved: treating the Phase 1 DTO as the production message contract.
- Not approved: implementing or enabling the Phase 3 BAML adapter.
- Not approved: Phase 4 rollout/equivalence claims until controller-level parity is
  demonstrated.
- Deferred: full BAML-owned tool loop; requires its own TDD plan.
