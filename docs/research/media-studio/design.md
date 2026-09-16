# Media Studio technical design

**Status:** proposed implementation design, 2026-09-15; no runtime code or migrations implemented.
This document turns the [studio experience](studio.md) into module, API and lifecycle contracts.
Paths marked proposed do not exist yet. The accompanying implementation details are
[persistence](persistence.md), [provider/configuration integration](integrations.md), and
[client architecture](client.md). The [delivery plan](delivery.md) defines implementation slices.

## Decisions to implement against

| Area              | Proposed decision                                                                                                                                           | Reason                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package layout    | Stay in existing workspaces; add focused `media/` modules                                                                                                   | The existing dependency direction already separates public types, storage, behavior and UI. A new workspace is not needed to enforce those boundaries. |
| Backend           | Construct `createMediaServices(dependencies)` in the application host                                                                                       | Config, database methods, credentials, clients, storage and timing are supplied; feature code does not import app singletons.                          |
| Persistence       | Mongo-backed `MediaThread`, `MediaTurn` with immutable creative content, and `MediaJob`; job owns generation acceptance, import turn owns import acceptance | The default deployment is standalone Mongo. Recoverable single-document operations must be the baseline.                                               |
| Execution         | A worker owned by the application lifecycle; durable claims permit multiple replicas                                                                        | No new mandatory broker or Redis dependency. Moving execution to a separate process later preserves the same contracts.                                |
| Browser updates   | Poll bounded LibreChat snapshots in v1                                                                                                                      | Browser tabs never poll vendors independently. SSE remains an optional presentation transport, not the durable queue.                                  |
| Provider coverage | OpenRouter media adapters and native providers use the same service ports                                                                                   | Gateway reach must not limit native conversation or editing capability.                                                                                |
| Native chat       | Attach a recording/ingestion sink to the existing provider invocation                                                                                       | Preserve mixed content without invoking generation again or double-charging usage.                                                                     |
| Files             | Existing File/storage system owns bytes; originals and derivatives are distinct                                                                             | Reuse authorization and storage strategies without the current generated-image resize loss.                                                            |
| State             | React Query owns server snapshots; Media-owned Jotai owns drafts/selections                                                                                 | No new Recoil state and no feature imports of app-global `~/store` preferences.                                                                        |
| Rollout           | Schema-backed, disabled by default; additive data/protocol changes                                                                                          | Existing model presets, tools, credentials, chat data and deployment defaults remain usable.                                                           |

These are recommendations, not claims that the existing infrastructure already provides the
required guarantees. Acceptance recovery, durable credit holds/settlement and reference-aware file
retirement require new tested behavior in data-schemas.

## Module map and dependency direction

All leaf modules below are proposed; existing entry files are called out afterward.

```text
packages/data-provider/src/media/
  config.ts            deployment schema fragments and inferred types
  capabilities.ts      operation and endpoint capability schemas
  requests.ts          submit/import/action schemas
  responses.ts         public thread/turn/job/asset DTO schemas
  index.ts             public exports

packages/data-schemas/src/
  schema/media/        thread, turn, job, settlement and file-reference schemas
  models/media/        model factories using the caller's mongoose connection
  methods/media/       plain repository contracts, CAS/claims, projections, retirement
  types/media/         internal persistence types; storage-specific types stay here

packages/api/src/media/
  service.ts           createMediaServices and dependency composition
  commands.ts          acceptance, import, retry, cancellation, metadata changes
  queries.ts           authorized catalog and bounded read models
  http.ts              request parsing, status/error mapping and route factory
  catalog.ts           discovery, endpoint constraints, effective offerings
  credentials.ts       injected credential-reference resolution and expiry rules
  worker.ts            claim, dispatch, poll, reconcile, settle and shutdown
  ingestion.ts         original publication and derivative orchestration
  recording.ts         native chat ingress, ordered parts and accounting correlation
  adapters/            openrouter, google, openai; split only where behavior warrants it
  index.ts             host-facing exports

client/src/components/Media/
  host.tsx             narrow host capabilities/preferences/actions
  state.ts             per-draft/thread Jotai state
  controls/            model, operation, references and typed parameters
  display/             thread tile, job status, image/video results
  studio/              grid, thread detail and refinement
client/src/data-provider/Media/
  queries.ts           React Query hooks and bounded polling
  mutations.ts         idempotent commands and cache reconciliation
  index.ts
```

Extend the existing shared [exports](../../../packages/data-provider/src/index.ts),
[api-endpoints](../../../packages/data-provider/src/api-endpoints.ts),
[data-service](../../../packages/data-provider/src/data-service.ts),
[query/mutation keys](../../../packages/data-provider/src/keys.ts), and
[configSchema](../../../packages/data-provider/src/config.ts). Define DTOs once from shared
schemas and infer their types; persistence records compose the shared request shape instead of
maintaining a parallel copy of media parameters.

Register model/method factories in the existing
[models](../../../packages/data-schemas/src/models/index.ts) and
[methods](../../../packages/data-schemas/src/methods/index.ts) composition, then export plain
contracts through the [package boundary](../../../packages/data-schemas/src/index.ts).
Add the host factory exports to [packages/api](../../../packages/api/src/index.ts).
Database filters, `ObjectId`, documents and sessions do not appear in the service's exported
signatures. Avoid importing a concrete provider SDK into public/shared media types.

`/api` changes are route registration and lifecycle/dependency wiring. A proposed
`api/server/routes/media.js` can re-export or call the TS router factory; validation, permission
decisions, storage selection and service orchestration remain under `packages/api`.
The [MCP request-context re-export](../../../api/server/services/MCPRequestContext.js) demonstrates
the intended small CJS boundary. Existing large CJS route handlers are extraction candidates,
not templates to copy.

## Application composition

`createMediaServices` receives these ports:

| Dependency          | Contract                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Config/policy       | Parsed media defaults plus effective actor/config resolution; request handlers reuse already-loaded user/config data                        |
| Repositories        | Plain owner-scoped operations for acceptance, jobs, threads, files/references and usage settlement                                          |
| Provider registry   | Injected adapters, selected by configured integration/API family; no provider-name switch in shared execution logic                         |
| Credential resolver | Resolve a stored binding to a currently authorized client/credential; return expiry and binding revision without persisting secrets in jobs |
| Storage/publication | Bounded stream ingestion, original/derivative metadata, authorized file delivery and cleanup                                                |
| Clock/IDs           | Time, scheduling and ID generation supplied for deterministic lifecycle tests                                                               |
| Observability       | Existing logger/metrics interfaces with bounded redacted fields                                                                             |

It returns `commands`, `queries`, `worker` and `nativeRecording`. HTTP, chat and compatibility tools
call these interfaces. Construct it once in the host after model/config setup, pass the same
instance to routers and chat callbacks, and register its stop/drain operation with the existing
[shutdown lifecycle](../../../api/server/index.js). Do not create another module-level `getInstance()`
registry or resolve a global singleton from feature code.

Start paid dispatch only when enabled and required indexes/storage/credential capabilities are ready.
Disabling admission must leave reconciliation available for previously submitted work, ingestion,
holds and cleanup. Record durable media activation before first admission so a later process can
discover that obligation even after configuration changes; perform this readiness check outside
the visible-conversation startup path. Clearing activation requires a proven drained state,
including retained media Files/retainers, unpublished asset writes, provider/credential cleanup and
settlement receipts. An empty job queue does not permit removing reconciliation or rolling back
the file/balance writers while those obligations remain.
Provider catalog outages do not block ordinary chat startup or browsing already stored media.
Shutdown stops new claims, records in-flight submission outcomes where possible, drains bounded
work and leaves recoverable claims for another process. Aborting a socket is not evidence that a
vendor cancelled work.

## Public domain contracts

Use `MediaJob` consistently for the execution entity. Thread and turn records describe creative
history; job records describe individual provider submissions and their recovery.

| Contract           | Essential fields and invariants                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thread summary     | `threadId`, `version`, title, optional cover asset, latest activity, ready/pending/attention counts, permitted actions; counts are presentation projections, not admission locks                                                           |
| Thread detail      | Summary plus bounded initial turns/job summaries/assets; separate cursors page turns and overflowing job/output collections without a per-row detail fetch                                                                                 |
| Turn               | `turnId`, `threadId`, kind (import/generation), stable ordering and immutable parent/output/input references; generation includes prompt, exact connection/model/operation and validated settings; import includes its publication receipt |
| Job                | `jobId`, `turnId`, `threadId`, `version`, execution owner, phase, optional progress, result references, typed failure/uncertain outcome, permitted actions and optional `retryOfJobId`                                                     |
| Asset              | Reuse `TFile` identity/ownership and add typed media provenance, original/derivative relationships and video metadata; no binary/base64 content in DTO history                                                                             |
| Acceptance receipt | `clientRequestId`, command kind, stable thread/turn IDs and job ID for generation, `preparing/accepted/rejected` phase and current safe snapshots; same command identity returns the same work                                             |

A turn may produce several assets. A job represents one external submission attempt; status polls,
asset-download retries and database projection repair do not create another job. Explicit safe
retry creates a new job under the same immutable turn and links `retryOfJobId`. A changed prompt,
model, settings or selected reference creates a new turn. The UI never overwrites a completed
result to make a retry look like the original request.

Initial operation discriminants are `image.generate`, `image.edit` and `video.generate`.
Use a discriminated union with operation-specific inputs and parameter schemas, not an untyped
provider options bag. Image edits require authorized reference files. Masks, first/last frames,
audio, counts and parameter combinations are accepted only when the selected endpoint descriptor
explicitly supports and validates them. Catalog version is a freshness hint, not authorization.

For initial queueing, inputs must already be usable immutable assets. Independent variants from
the same asset may run concurrently. A future job-dependency graph is a separate addition; do not
implicitly queue a dependent turn against “whatever image finishes next.”

## HTTP surface

All paths below are proposed under `/api/media`, authenticated and owner/tenant scoped. The server
derives identity from the request context; client-supplied user/tenant IDs are not accepted.
Dynamic URL segments use `encodeURIComponent` through the shared endpoint helpers.

| Method/path                                            | Behavior                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /catalog`                                         | Effective connections, operation offerings, typed controls, availability reasons and catalog version; demand-loaded                               |
| `GET /threads?cursor=...&filter=...`                   | Cursor page of tile summaries with bounded cover metadata and active counts; pending/completed filters can overlap                                |
| `GET /threads/:threadId`                               | Authorized thread summary and bounded initial detail                                                                                              |
| `GET /threads/:threadId/turns?cursor=...`              | Ordered turns with bounded job/output summaries, including status and allowed actions                                                             |
| `GET /threads/:threadId/turns/:turnId/jobs?cursor=...` | Additional job summaries when a turn's attempts exceed its initial page                                                                           |
| `GET /jobs/:jobId/outputs?cursor=...`                  | Additional output summaries beyond a job's initial page                                                                                           |
| `GET /jobs/:jobId`                                     | Current authoritative job view, including server-allowed actions                                                                                  |
| `POST /submissions`                                    | Validate and durably stage thread/turn/job identities; return `202` with preparing or accepted receipt; only published accepted work can dispatch |
| `GET /submissions/:clientRequestId`                    | Reconcile an uncertain acceptance response without submitting paid work again                                                                     |
| `POST /jobs/:jobId/cancel`                             | Record idempotent cancellation intent; return actual supported/current state                                                                      |
| `POST /jobs/:jobId/retry`                              | Fresh client request ID; create a new job only when the original outcome makes another submission safe                                            |
| `PATCH /threads/:threadId`                             | Rename/select cover using expected thread version; conflict returns current version                                                               |
| `DELETE /threads/:threadId`                            | Retire the thread and start reference/job cleanup; `202` while cleanup remains                                                                    |
| `POST /uploads`                                        | Multipart source upload through shared file policy/storage ports; return authorized `TFile` reference                                             |
| `POST /imports`                                        | Link existing owned/authorized files into a new/existing thread import turn; idempotent, no generation/job required                               |
| `GET /imports/:clientRequestId`                        | Resolve the import turn's durable preparing/accepted/rejected receipt after a lost response                                                       |

Uploads intentionally have a media entry point to avoid pretending that a studio source is an
agent attachment or triggering OCR/vector/provider provisioning just to store the original.
Reuse the existing [file preflight](../../../packages/api/src/files/preflight.ts), configured
limits, source validation and storage ports; extract reusable behavior from legacy `/api` code
into TS where necessary. Do not fork the file authorization/retention system. Importing a file
and saving it beyond its original retention are separate policy decisions. Import receipts use a
separate command namespace from generation and live on the import turn. Capture an immutable
copy/version of mutable source content before publishing the import; do not create a fake job.

A representative **proposed** edit submission shape is:

```json
{
  "clientRequestId": "request-unique-to-this-submission",
  "threadId": "existing-thread-id",
  "parentTurnId": "selected-turn-id",
  "selection": {
    "connectionId": "configured-openrouter-connection",
    "modelId": "configured-model-id",
    "catalogVersion": "observed-version"
  },
  "operation": "image.edit",
  "prompt": "Keep the subject and make the background darker",
  "inputs": [{ "role": "reference", "file_id": "authorized-original-file-id" }],
  "parameters": { "count": 1 }
}
```

Omitting `threadId` creates a new top-level tile through the same receipt protocol. The shared
schema defines actual ID formats before implementation. Hash the canonical validated request
under the authenticated owner scope. Reusing its ID with changed content is `409`, not an update
to queued work. A missing receipt after a transport failure permits resending the same identity;
it does not justify generating a fresh request ID automatically.

Return typed machine-readable failure codes and field issues, mapped to localized text in the
client. Distinguish malformed request, inaccessible resource, unsupported settings, stale catalog,
version conflict, quota/budget denial, expired credentials, provider rejection, uncertain outcome
and storage failure. Do not send provider traces or secrets to the browser. Use `401` for missing
authentication, `403` for capability denial, resource-safe `404`, `409` for identity/version
conflicts, `422` for unsupported operation/settings and `429` for bounded admission limits.

If a durable receipt is still preparing its projections, return `phase: preparing`; the worker
cannot execute it until the publication barrier is complete. The client pins the stable
receipt-backed tile through stale lists or a temporary detail `404` while receipt recovery still
confirms preparation. It retains the submitted draft/input references and labels preparation
separately from queue admission. Publish `accepted` only after linkage succeeds; a terminal
`rejected` receipt preserves the draft and prevents automatic resubmission. Explicit access
revocation or deletion takes precedence over provisional UI state.

## Acceptance, dispatch and reconciliation

The [persistence design](persistence.md) specifies fields, indexes and CAS methods. The sequence is:

```mermaid
sequenceDiagram
  participant UI as Chat or Studio
  participant API as Media commands
  participant DB as Data-schemas methods
  participant Worker as Media worker
  participant Provider
  UI->>API: Submit with stable request ID and selected inputs
  API->>API: Parse, authorize, resolve offering and validate settings
  API->>DB: Stage job receipt with immutable turn and chosen identities
  API->>DB: Link thread, turn and inputs; publish ready barrier
  API-->>UI: 202 receipt and stable tile/job IDs
  Worker->>DB: Claim due media-owned work with a fence
  Worker->>Worker: Revalidate current policy and credentials
  Worker->>DB: Obtain admission/credit hold and record submit intent
  Worker->>Provider: One generation submission
  Provider-->>Worker: Result or remote operation identity
  Worker->>DB: Persist operation/result receipt
  Worker->>Provider: Poll/download if required
  Worker->>DB: Publish assets and reconcile settlement
  UI->>API: Read bounded snapshots
  API-->>UI: Current job and thread state
```

There is no exactly-once external-call promise without provider support. If a process dies after
remote acceptance but before saving the operation ID, use a documented vendor idempotency/lookup
contract or mark the job uncertain and reconcile. Never restart its original request merely
because a lease expired. Duplicate webhooks/polls/results converge through stable job/output
identities and fenced writes.

Separate backlog capacity from concurrent execution. Limits must be enforced durably across
replicas, not with a count query followed by insertion or an in-process semaphore. Release compute
slots independently of outstanding billing/cleanup liability. A thread summary is never the
source of truth for those limits.

At dispatch, recheck current user/tenant access, enabled operation, credentials, input validity
and spend policy. Immutable queued settings do not preserve revoked permission. If revalidation
fails, require attention; do not replace the chosen model, connection, inputs or parameters.
Native provider state follows the captured branch, not a mutable global session cursor.

Remote completion and local result readiness are separate. Retry downloading a paid result after
storage failure; do not generate another one. Partial outputs retain their individual state and
successful originals. Unknown outcomes and long-held liabilities need configured deadlines and
an explicit resolution path, rather than perpetual spinners or silently released obligations.

## Provider and native-chat boundaries

An executable adapter accepts already-validated request/configuration plus scoped clients and
input streams. It returns a discriminated direct result or remote operation handle; remote
adapters expose polling/download and optional documented cancellation. Required adapter options
and capabilities are described in [integrations](integrations.md). Provider-specific errors map to
typed lifecycle outcomes at this boundary. Raw URLs, opaque continuation and credentials remain
private to the appropriate server contracts.

Native multimodal is a protocol choice, separate from who owns execution:

- `executionOwner: media`: a studio or explicit media action may call Gemini's native protocol
  directly, preserving thread continuation without a hidden chat conversation.
- `executionOwner: chat`: an existing chat invocation receives the recording sink. The media
  worker cannot submit it. It observes ordered text/image parts, ingests originals and records
  lineage against stable source message/branch/item IDs. Chat remains the accounting owner for
  that invocation, with linked media usage detail rather than another debit.

Extend `@librechat/agents` with a tested mixed-content event/aggregation contract before declaring
native Gemini complete. Persist opaque signatures by stable provider part identity, not current
UI array position. Preserve partial previews separately from final assets, and verify full replay
through reload, branches, reasoning/tool parts and the next edit. A type cast or `responseModalities`
setting cannot supply the missing path documented in the [backend audit](backend.md).

Existing custom image tools become compatibility adapters to media commands/ingestion only as
their behavior is migrated. Keep tool IDs, saved-agent settings and legacy result projections
working. Migrating a tool must not unexpectedly drop its supplied credentials or charge twice.

## Files, usage and retention are release gates

Store original bytes unchanged with validated metadata/checksum. Derivatives have their own file
references; previews never overwrite originals. Stream large videos and provider downloads with
configured byte/time bounds. Authenticate playback and test byte-range seeking; do not return a
vendor-key-bearing URL to a browser. Initial raster adapters must explicitly exclude unsupported
SVG-only outputs until a safe vector delivery path exists.

Use per-input references/holds and file retirement claims to coordinate queued work, library
saves and the existing expiry sweeper. Neither opening a temporary-chat asset nor linking it into
a tile extends its retention automatically. Explicit saves obey operator policy and a shared
reference-aware retirement method. Deletion hides/retire content promptly, stops new admission and
reconciles already admitted work and backing storage; minimal receipts prevent late resurrection.

Use the existing balance/transaction enablement settings. In balance-enabled deployments, a
durable media hold must remain visible to ordinary chat admission during worker downtime. The
existing transaction method's separate ledger/debit writes cannot be replayed safely as media
settlement. Implement the bounded, recoverable balance/ledger protocol in the persistence appendix
and test every crash boundary. In transaction-only or billing-disabled modes, preserve current
semantics rather than enabling balances as a side effect of media.

## Client, startup and compatibility

The [client blueprint](client.md) identifies exact sidebar, route, query and component seams.
The host supplies preferences and attachment/navigation actions. Feature state is Jotai; accepted
jobs/assets/catalog are React Query snapshots scoped to a non-secret account/session identity.
Old responses cannot repopulate another account's cache or resurrect a deleted tile.

Poll one bounded grid summary and the selected thread's detail as needed. Follow all active work
in the thread, including preparation and reconciliation, rather than only the selected job.
A projected zero pending count permits a slower configured foreground catch-up cadence; it must
not stop observation forever. Inactive views stop polling; foreground/reconnect refetches preserve
draft values and never resubmit a mutation. A future SSE feed needs an explicit snapshot/replay
cursor contract, but v1 does not
require building a new durable event log. Provider webhooks remain a server optimization with
verified signatures and polling recovery.

Startup advertises only effective feature availability; catalog/models/history are demand-loaded.
Keep visible-conversation loading independent of studio resources. A fresh disabled deployment
does not initialize provider clients, discover catalogs or scan media history; a previously active
deployment continues the reconciliation described above. The schema owns every new limit,
timeout and toggle; effective config parsing must also apply nested defaults. For v1, put `media`
in `BASE_ONLY_CONFIG_SECTIONS` so operator YAML controls integrations and deployment limits.
Expose only sanitized availability/configuration and the effective `MEDIA.USE`/`MEDIA.CREATE`
permissions to clients, preserving stored role denials.

Version public schemas and persisted protocols. Workers claim only supported versions. Enabling
the feature requires a coordinated upgrade of every file-deletion and balance writer: old workers
cannot honor new retainers/holds just by preserving unknown fields. Supported mixed versions must
pass explicit writer conformance tests. New message media links
must retain an old-reader image/file fallback and pinned revision identity. A video can remain a
downloadable file to an old client rather than breaking message rendering. Do not rewrite legacy
history or pretend old files have complete generation provenance.

## Decisions requiring executable proof before enablement

1. Standalone Mongo acceptance/claim/retirement and settlement behavior under failure injection,
   including multiple replicas and downtime past ordinary reservation expiry.
2. Original-preserving storage and private streaming/range delivery on the chosen supported
   backends; extension points for other storage strategies must remain explicit.
3. Exact OpenRouter/native account/API/model access and capability combinations, including credential
   rotation and native context replay. Public catalog discovery does not verify inference.
4. Upstream agent-runtime changes and legacy chat/tool projections, with one accounting owner.

These gates bound implementation uncertainty. They are not reasons to defer the complete user
journey: the first enabled slice must include the sidebar grid, upload/editing, multiple jobs,
thread iteration, chat handoff and lifecycle states described in the delivery plan.
