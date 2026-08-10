---
date: 2026-08-10T11:06:38-04:00
reviewed_plan: thoughts/searchable/shared/plans/2026-08-10-10-34-baml-chat-path-tdd-plan.md
plan_sha256: dcc55a03563e3ce8de75a6113dc6163211a63b60b5cafeb6ad2c27ab6add6a64
git_commit: 8029eddfda11ade9dbc04747ebb7d2572da21f2a
branch: baml-setup
decision: needs-major-revision
review_issue: AF-0pd
follow_up_issues: [AF-vv8, AF-7tn]
---

# Review: BAML Chat-Path Wiring TDD Implementation Plan

## Decision

> **❌ Needs major revision before implementation.**

The plan identifies a plausible carrier from a named custom endpoint into
`ChatBAML`, and it correctly avoids adding a new public `EModelEndpoint`. It is not
implementation-ready, however. The proposed generated-client override fails at the
exact production function boundary, the static adapter import breaks the promised
lazy native-runtime boundary, the settings change does not reach the real custom
endpoint renderer, and several public contracts are either type-invalid or left
undefined.

This decision is based on the repository at the commit recorded above, direct code
inspection, six independent review lenses, and local no-network probes. The source
plan was not edited.

## Review summary

Counts are category-local; several findings intentionally overlap because one
defect violates more than one contract.

| Category    | Status | Critical | Other | Summary                                                                             |
| ----------- | -----: | -------: | ----: | ----------------------------------------------------------------------------------- |
| Contracts   |     ❌ |        5 |     3 | Lazy loading, built boundary, failure union, credentials, production routing oracle |
| Interfaces  |     ❌ |        7 |     3 | CJS/ESM load, build variants, settings reachability/types, test execution           |
| Promises    |     ❌ |        5 |     3 | Cancellation, retries/deadlines, fallback semantics, routing proof                  |
| Data models |     ❌ |        4 |     4 | Provider mirror/schema, serialization, client-name foreign key, token semantics     |
| APIs        |     ❌ |        5 |     2 | YAML/discovery, token config, route/SSE/persistence acceptance, documentation       |
| CodeCleanup |     ❌ |        3 |     5 | Wrong initialization boundary, throwing predicate, false-Red settings test          |

## Critical blockers

### 1. The proposed per-request client override is not executable at the production boundary

The generated `llm.Client` shape and its lenient resolver exist. A local no-network
probe confirms that an `OpenRouter` client resolves to the expected primitive
options, while an invalid name resolves to `baml.errors.DevOther`. That is not the
boundary used by production, though:

- `host.HostTurn$render_prompt_async(..., { client })` accepts the valid override.
- `host.HostTurn_async(..., { client })` panics for both valid and invalid names
  with `baml.panics.SdkPanic: VM internal error: type error: expected variant, got string`.
- `client.build_attempt_async()` exhibits the same panic.

Consequently, Behavior 6's `__debugResolveClient` oracle can be green while every
real turn fails. It also inspects `a.model`, although the resolved primitive stores
the value at `a.options.model`, and it never calls either public adapter method.

**Required amendment:** add a blocking Phase 0 that proves, without a network call,
that the exact generated `HostTurn_async` and streaming function boundaries accept
the runtime override. If this requires an upstream BAML fix or a different supported
override representation, resolve that first. A render-prompt/resolver preflight is
useful diagnostics but cannot be the acceptance oracle.

### 2. The import and build design violates the non-BAML boot promise

The plan adds a static import of `adapter.mjs` to `initialize.ts`. That adapter
statically imports the generated SDK, whose root immediately imports
`@boundaryml/baml-bridge` and initializes bytecode. `providers.ts` already imports
the custom initializer, so this graph is reached during ordinary API startup rather
than only when a BAML endpoint is selected.

This is also a module-format failure, not merely eager work. The API's tsdown config
bundles relative imports. A scratch build of the proposed graph emitted CJS that
calls `require("@boundaryml/baml-bridge")`; the bridge exposes an import-only package
path, and loading the bundle fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Recursively
copying `src/baml` to `dist/baml` does not help when the compiled consumer has already
bundled a separate adapter/generated-SDK graph.

**Required amendment:** keep registration eager only if it remains lightweight, and
put generated runtime loading behind a cached, BAML-only loader at an explicit
ESM/CJS boundary. If a dynamic import is the necessary exception to repository
style, document the module-boundary reason. Configure and test the actual compiled
consumer graph; do not infer it from the presence of a copied file.

### 3. The BAML settings entry would neither type-check nor control the real UI

`SettingsConfiguration` is an array, but the plan assigns `{ col1, col2 }` to it.
Only `presetSettings` uses that column object; `paramSettings` and
`agentParamSettings` use arrays. The plan tests the display name `BAML`, while the
backend emits a custom endpoint with `customParams.defaultParamsEndpoint: 'baml'`.
The side panels honor that override, but the custom preset/settings renderer maps
the endpoint to `OpenAISettings` and uses `conversation.endpointType ?? endpoint`,
so it can still render OpenAI fields.

The proposed negative test is also green before implementation: a missing map entry
becomes an empty key list. It omits `max_output_tokens` from the unsupported set.

**Required amendment:** add `Providers.BAML = 'baml'` to the data-provider mirror,
use correctly typed empty values in all three maps, make the custom renderer use the
same resolved settings key, and test two arbitrarily named endpoints through the
real `defaultParamsEndpoint` pipeline. The Red test must fail because BAML currently
resolves to OpenAI controls, not pass because a made-up key is absent.

### 4. The public YAML, credential, and discovery contract is unsafe and ambiguous

The generic custom schema and visibility filters require `apiKey` and `baseURL`.
Initialization may read and validate user-provided credentials before provider
dispatch, yet the proposed BAML branch discards them and executes with credentials
compiled into or referenced by the BAML client. `models.fetch: true` would likewise
invoke OpenAI-style discovery against the configured base URL even though BAML model
values are compiled, case-sensitive client names.

This can store or fetch a user's secret while silently using a server credential—a
tenant/authentication boundary violation.

**Required amendment:** define a provider-discriminated BAML schema. Prefer making
the irrelevant OpenAI fields optional for BAML, rejecting `user_provided` and
`models.fetch: true`, requiring a non-empty explicit model list, and stating which
environment variables are authoritative. If compatibility sentinels are retained,
standardize and document them and prove that user-key lookup and OpenAI model fetch
are skipped.

### 5. The proposed failure result is outside the published port contract

`BamlFailureCode` is the closed union `unbound | schema_mismatch | model_error |
parse_error`; `unknown_client` is not assignable. The plan rules out an agents
contract change, so its result cannot compile against the current port. The shared
catch snippet also says `return failureOf(...)`; the streaming branch must `yield`
the failure or it silently ends without emitting it. The proposed error test omits
required `BamlPromptInput` fields.

The classifier itself constructs a `RegExp` from the request-selected client name.
A name such as `[` can throw a new `SyntaxError` while handling the original error.

**Required amendment:** retain the friendly message but classify it as
`model_error`, unless the agents package and every exhaustive consumer are explicitly
versioned together. Validate the client identifier at initialization, use a
non-throwing exact error marker, centralize pure error classification, and keep the
take-turn `return` and stream-turn `yield` statements separate. Preserve precedence:
abort, unresolved-client configuration, transport, then model/parse failure.

### 6. Cancellation, retry, and completion promises are not established

The plan says mid-stream cancellation is already covered by
`scripts/baml-host/run.mjs`, but that script tests only a signal aborted before
invocation. On early iterator return, the adapter's `finally` removes its listener
without aborting the upstream context; `nextAsync()` and `finalAsync()` have no
deadline. The runtime client is constructed with `retry: null`, losing or leaving
undefined the declared `FreePoolBackoff` behavior of the static client.

**Required amendment:** define retry inheritance explicitly; add bounded deadlines;
and test abort before start, while `nextAsync()` is pending, after partial deltas,
and during finalization. The test must prove upstream cancellation, listener
cleanup, one terminal outcome, no duplicate persistence, and no late chunks.

### 7. The plan does not test the public chat API contract it claims to deliver

Direct initializer and adapter tests do not exercise endpoint discovery, exact model
allow-list validation, `POST /api/agents/chat/:endpoint`, SSE framing, `ChatBAML`'s
error conversion, controller error content, or persistence. The plan names the raw
`/api/agents/chat` path, while the browser uses the encoded named-endpoint route.

**Required amendment:** add an authenticated route-level test using request-scoped
config. Success must assert discovered/authorized model, streamed completion, and
persisted provider/model/content. An allow-listed but uncompiled client must assert
the exact HTTP/SSE/error-content and persistence behavior with sanitized friendly
text. Keep one live-provider smoke as a manual gate, but not as the only end-to-end
acceptance test.

### 8. Build, serialization, and documentation scopes are incomplete

The proposed package script replaces `npm run clean && tsdown` with `tsdown && copy`,
does not cover all build/watch/bun variants, copies specs and future debug files
recursively, and resolves paths from the working directory. Its 15-second integration
test belongs in a bounded build acceptance suite, not ordinary unit discovery.
`.mjs` Jest specs are not executable under the current transform config; a local
probe fails with `Cannot use import statement outside a module`.

Separately, hiding controls does not strip stale OpenAI parameters. Conversation and
compact parsers currently fall back to the custom/OpenAI schema, so values such as
`temperature`, `max_tokens`, and `top_p` can remain serialized even if the controls
are hidden. Runtime function sets and generated clients must also be explicitly
excluded from stored agents, conversations, messages, and API payloads.

The plan promises endpoint documentation but names no deliverable. Its final two
historical references use nonexistent `thoughts/shared/...` paths; the repository
artifacts live under `thoughts/searchable/shared/...`.

**Required amendment:** preserve the clean step, use path-stable explicit runtime
artifacts, cover every supported build variant, and run a compiled-consumer load
test with the bridge installed exactly as production sees it. Configure executable
test extensions or use the repository's supported test format. Add BAML parser
schemas for conversation/compact serialization, a runtime-only persistence
invariant, a complete `librechat.example.yaml` example, and correct reference paths.

## Category details

### Contracts

**Well-defined:** the existing `BamlFunctionSet` carrier is concrete; custom
endpoint provider override is an additive precedent; registry construction is
idempotent by constructor identity; signal propagation and per-invocation tool
binding already have explicit shapes.

**Missing or contradictory:** lazy native loading, compiled artifact ownership,
failure-code compatibility, credential ownership, and production-equivalent routing
validation. `clientName` is optional in the proposed factory, so a missing selected
model silently falls back to the static OpenRouter client.

**Recommendation:** require and validate the selected client at the custom endpoint
boundary; keep it as the persisted logical model name; prove the exact public port
through the exact built module graph.

### Interfaces

**Well-defined:** `@librechat/agents/baml` is a real exported registration subpath,
and the current custom initializer can return `provider: Providers.BAML` plus a
runtime function set.

**Missing or contradictory:** the relative ESM adapter becomes CJS-bundled; copy
scope and build variants disagree; the real UI key is not used; the settings value
has the wrong type; `unknown_client` is outside the interface; the debug method is
undeclared; and the proposed Jest files cannot run.

**Recommendation:** make loader, settings-key, test-runner, and generated-client
preflight interfaces explicit and production-used rather than debug-only seams.

### Promises

**Well-defined:** the intended stream is append-only; abort signals are threaded to
the BAML context; listener release exists; existing message persistence owns the
normal successful path.

**Missing or contradictory:** native work is eager, cancellation coverage is
pre-abort only, upstream work can survive consumer return, retry semantics disappear,
operations have no deadline, and the routing test neither reads the right property
nor calls `takeTurn`/`streamTurn`. Transcript tool-result association also performs
a repeated scan and is quadratic in transcript size.

**Recommendation:** specify latency/resource bounds, exact retry/deadline policy,
stream delta ordering/deduplication, and a cancellation matrix. Either index tool
results once or set and test a transcript-size bound.

### Data models

**Well-defined:** no new endpoint kind or database migration is inherently needed;
custom `models.default` already normalizes string and `{ name, description }` forms;
the generated runtime client shape is concrete.

**Missing or contradictory:** the mirrored provider enum and endpoint schema cannot
represent BAML; settings and parser shapes disagree; the client name is an
unvalidated codegen-backed foreign key; token accounting currently treats that
logical client name as a provider model; executable runtime state has no explicit
non-serialization invariant.

**Recommendation:** append the named provider value without altering existing
serialized values; test string/object/case-mismatch client forms; key `tokenConfig`
by the exact logical client name or introduce an explicit mapping; commit BAML source
and all regenerated artifacts together.

### APIs

**Well-defined:** authentication, agent-use authorization, request-scoped endpoint
resolution, and exact model allow-listing can be reused. Keeping BAML behind a named
custom endpoint is additive and version-safe.

**Missing or contradictory:** fake credentials, incompatible fetch behavior, lost
`endpointTokenConfig`, wrong settings lookup key, no route/SSE/persistence
acceptance, undefined raw unsupported-parameter behavior, and absent documentation.

**Recommendation:** define cross-field YAML rules, propagate or explicitly reject
`tokenConfig`, choose reject-versus-ignore semantics for raw unsupported fields, and
document that `allowedProviders` contains the exact custom endpoint name—not `baml`.

### CodeCleanup plan hygiene

**Passing gates:** the proposed branches are shallow, bad paths generally return
early, and no condition contains assignment or increment/decrement. Existing abort
and stream guard ordering is load-bearing and should be preserved.

**Failing gates:** the late BAML branch is a band-aid on an OpenAI-shaped credential,
cache, URL, and model-fetch pipeline; the error predicate can throw; and the settings
test is a false Red built from magic display-name strings and the wrong shape.

**Recommendation:** discriminate providers before provider-specific side effects;
keep shared post-processing explicit; replace short-circuit cache I/O with a named
pure gate plus a serial guarded read; centralize runtime-client construction and
error classification; use named externally observed provider/client values.

## Suggested plan amendments

The existing behaviors should be reordered and rewritten approximately as follows:

```diff
- Status: ready-for-implementation
+ Status: needs-revision

+ Phase 0 — Prove the generated runtime boundary
+ - Reproduce and resolve the Client override panic at HostTurn_async and stream.
+ - Accept only an oracle that calls the exact generated production functions.
+ - Block all downstream behaviors until valid, invalid, and missing clients have
+   defined outcomes without network access.

- Add a late BAML branch after generic custom credential/cache/model-fetch work.
+ Discriminate provider immediately after endpoint/model validation.
+ Give BAML an owned initializer; run only truly shared token/stream post-processing.
+ Define provider-discriminated YAML, credential ownership, fetch=false, and model rules.

- Statically import the adapter and recursively copy src/baml to dist/baml.
+ Define one lazy cached runtime loader and an explicit module-format boundary.
+ Preserve clean and every supported build variant; copy only named runtime artifacts.
+ Test the real dist consumer with non-BAML boot and BAML load cases.

- Add bamlConfig under the display-name settings key.
+ Add data-provider Providers.BAML and correctly typed settings/preset entries.
+ Resolve defaultParamsEndpoint in every renderer and parser path.
+ Strip or reject unsupported serialized/request parameters with focused tests.

- Add unknown_client and match it using a dynamic regular expression.
+ Require and validate a case-sensitive client name at initialization.
+ Use model_error unless the agents failure union is deliberately versioned.
+ Use a non-throwing classifier with separate takeTurn return / streamTurn yield.

- Compare offline resolver results through __debugResolveClient().model.
+ Use a production preflight helper only as diagnostics and inspect options.model.
+ Prove both takeTurn and streamTurn through the exact HostTurn functions.
+ Define the second client, credentials, provider model, retry policy, and generated files.

- Treat pre-abort smoke and a manual live call as cancellation/E2E coverage.
+ Add automated mid-stream abort, deadline, retry, SSE, and persistence acceptance tests.
+ Retain one live-provider picklist smoke as a manual release gate.

+ Propagate endpointTokenConfig and test context-budget resolution by client name.
+ Prove runtime functions/clients never enter persisted or serialized state.
+ Add a documented BAML custom-endpoint example to librechat.example.yaml.
+ Correct historical reference paths under thoughts/searchable/shared/.
```

## Approval checklist

- [ ] Approved for implementation
- [ ] Approved with minor amendments
- [x] Needs major revision and another plan review

Implementation should not begin from the current plan. The first follow-up should
resolve the generated runtime boundary and then revise the plan around the actual
supported override and module-loading contracts.
