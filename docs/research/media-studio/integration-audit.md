**Media Studio integration audit — 2026-09-19**

**2026-09-19 remediation:** [Implemented fixes and verification](remediation.md) records the subsequent work across both branches. This audit preserves the baseline findings and diagnostic evidence.

The [deeper audit and reproducible remediation backlog](audit/README.md) supplements this first pass with additional specialist reviews, failure-injection experiments, and explicit corrections below.

The branch has substantial foundations worth keeping, but I would not merge it yet. The largest risks are incomplete connections to existing lifecycle and policy boundaries, and a deployed SDK patch that differs from the SDK branch being reviewed. Several passing suites exercise each side independently and miss the transition between them.

This audit used three parallel reviewers plus a coordinating review: SDK/providers/credentials; frontend and shared components; persistence/accounting/storage; and cross-cutting policy, observability, analytics, configuration, packaging, and verification. Findings trace producers, consumers, existing alternatives, and failure paths. This is a broad integration audit, not a claim that every possible provider or deployment has been exercised.

| Repository | Audited branch/head                                                  | Comparison base                                                          |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| LibreChat  | `feat/media-studio`, `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`      | Merge base with `origin/dev`: `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45` |
| agents SDK | `feat/native-media-port`, `554e38f21e483e014c78a022fa7c9c13728dcfac` | `origin/main` / 3.8.7, `afc97c8c502637f8645b4d35a58dbc312666fcf5`        |

LibreChat's diff contains 313 files, 59,968 insertions, and 764 deletions, including tests, research, fixtures, and generated dependency patches. The target `origin/dev` tip is `c7665ab1aebb925921b5e51ed76a2ba6496ba3e1`; it is newer than the merge base. The branch audit uses the triple-dot diff, so changes present only on newer `dev` are not treated as branch removals. The SDK diff contains 13 files. LibreChat's remote branch head matched the audited head. No associated LibreChat PR was found in either repository, and the fork returned no workflow runs for this branch. This audit did not push commits or request an external review.

**What is already integrated well**

| Boundary      | Existing reuse to preserve                                                                                                        | Remaining work                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Money         | Shared Balance/Transaction collections, reservation-aware chat balance checks, durable media settlement, existing credit currency | Complete uncertain-outcome resolution and operator visibility                       |
| Files         | Canonical File records, immutable originals, owner/tenant checks, existing initialized cloud strategies                           | Unify deletion, expiry, listing, sharing, and client cache ingress                  |
| Providers     | Existing saved key identities, expiry records, key dialog, custom endpoint references                                             | Preserve the full endpoint header/auth/proxy contract, and consume one SDK artifact |
| Client        | Jotai feature state, host-supplied shell preferences, React Query, shared controls, semantic theme roles                          | One authoritative paginated thread state and shared capability validation           |
| Configuration | Opt-in feature, schema-backed limits, sanitized startup projection, explicit role grants                                          | Exercise all surface combinations and inherited operator policies                   |
| Protection    | `assertModelBoundContent`, upload content preflight, SSRF protections, redacted provider failures                                 | Connect admission to existing bans, rate limits, and moderation                     |
| Reliability   | Durable permits, leases, publication receipts, original/rendition separation, real Mongo tests                                    | Isolate failed maintenance items and complete retirement/recovery                   |

**Confirmed defects and missing completion paths**

P1 findings should block merging the feature. P2 findings are concrete correctness or integration work to complete before claiming the supported experience is finished. Items explicitly called integration gaps do not imply an existing dashboard or subsystem regressed.

**01 · P1 · LibreChat ships a different native-media SDK implementation from the associated SDK head.**

The tracked [3.8.7 patch](../../../patches/@librechat+agents+3.8.7.patch#L76) still changes `client.generationConfig`, lacks the current `prepareRequest` and typed event-stream implementations, and loses signed empty text in conversion. The SDK branch fixes these behaviors, but those fixes are absent from the installed LibreChat artifact. A synthetic HTTP-boundary probe reproduced: `invoke`, `stream`, and legacy `streamEvents(..., { version: 'v2' })` invoke port admission but send no image `responseModalities`; signed empty text becomes an empty model `parts` array. **Default typed `streamEvents` bypasses the port entirely**, including host admission. Its `ChatModelStream` is thenable, so awaiting it does consume it. The [retained probe](audit/probes/sdk-entrypoints.cjs) distinguishes both event APIs; the legacy mode must not be mistaken for proof that the default mode is safe. No inference requests were made. The [provider pass](audit/providers.md) also reproduces signed empty text loss in the separate direct Google Studio parser.

Consume a single versioned SDK artifact containing the reviewed fixes. If the temporary patch remains necessary, regenerate it from that exact source and verify CJS, ESM, declarations, and packaged source together. Run the native contract through the installed package's actual HTTP serialization and every invocation entry point. Mocking `client.generateContent` misses this failure. See [patch maintenance policy](../../../patches/README.md) and [host SDK tests](../../../packages/api/src/media/nativeSdk.spec.ts).

The [SDK release probe](audit/sdk-release.md) confirms that both consumed CJS and ESM make a provider request through the default typed API even when host admission would reject; both reviewed SDK formats correctly reject first. LibreChat's current graph uses legacy v2 events, so the typed bypass is an exported SDK contract defect, not a demonstrated route-level bypass in this application.

**02 · P1 · Native replay performs serial database reads for every content part.**

The SDK's native message conversion awaits `port.restore` separately for each part. [Host restore](../../../packages/api/src/media/native.ts#L291) calls [getMediaNativeContinuation](../../../packages/data-schemas/src/methods/mediaNative.ts#L516), which sequentially reads the part, its job, and its thread; images add asset lookups and byte reads. Native text chunks also carry continuation references. A [second-pass real-Mongo probe](audit/native-replay.md) measured **72 serial reads and 18,801 ms for 24 text chunks** with 250 ms injected query latency, versus 47 ms without it. A 100-part native reply therefore entails at least 300 serial query round trips before the next model call, approximately 75 seconds under that latency model; the 100-part figure is an extrapolation, not a measured benchmark.

Add a batch restore contract, fetch parts by reference in bounded groups, and reuse per-invocation job/thread authorization. Preserve part order, tenant/owner checks, model/credential binding, and signatures. Pass already-loaded request configuration into the native factory. Validate a multi-turn native conversation with many text chunks under injected database latency; the current Lighthouse scenario cannot catch this because media is disabled there.

**03 · P1 · Jobs requiring attention permanently consume capacity and can block deletion.**

[Attention jobs are neither terminal nor claimable](../../../packages/data-schemas/src/methods/media.ts#L53), expose [no retry/cancel action](../../../packages/data-schemas/src/methods/media.ts#L153), and [retain permits](../../../packages/data-schemas/src/methods/media.ts#L2313). The [worker](../../../packages/api/src/media/worker.ts#L531) sends uncertain outcomes and some credential/configuration failures there. Restoring a key does not resume them. Retirement and account deletion wait for terminal work. Defaults permit only two active jobs per user, four per integration, and eight overall, so a few failures can exhaust the service. Interrupted native recordings can also block retirement even though chat owns their accounting.

Finish the operator workflow using existing admin authorization and audit logging: inspect bounded private evidence, resume polling with verified credentials/operation identity, and record explicit terminal billing outcomes through the durable settlement methods. Preserve uncertain liability until resolved. Test attention → restored credentials/operator decision → settlement → released permits → successful retirement, including restart and duplicate resolution attempts.

**04 · P1 · One failed cleanup item can stop unrelated generation and polling.**

[Worker maintenance](../../../packages/api/src/media/worker.ts#L584) processes accounting and cleanup before dispatch, inside one outer catch. Persistent cloud DELETE failures, a removed storage strategy, or one accounting invariant failure can throw before [dispatch](../../../packages/api/src/media/worker.ts#L632) on every tick. With a small cleanup population the same owner is encountered every time, starving unrelated users and tenants. Media expiry selection also lacks per-item retry deferral.

Reuse the failure isolation and retry/backoff design in [files/sweep.ts](../../../packages/api/src/files/sweep.ts#L268) and the poison-item protections documented in [file methods](../../../packages/data-schemas/src/methods/file.ts#L392). Isolate scheduling from maintenance and isolate each maintenance scope/item. Inject a permanent delete failure for owner A and prove owner B can submit, poll, settle, and clean up while A backs off.

**05 · P1 · Native media does not inherit ordinary saved-chat retention.**

[Native publication](../../../packages/api/src/media/native.ts#L237) assigns an orphan deadline, without carrying the source conversation's retention deadline. [Retaining the asset](../../../packages/data-schemas/src/methods/media.ts#L2089) clears that deadline unless a hard expiry was supplied. Media thread publication handles temporary retention but not `RetentionMode.ALL`/`generalChatRetention`. A saved conversation can therefore expire while its separate media thread, native recording, prompt, and image remain indefinitely.

Carry the resolved source retention through native recording and asset hard deadlines, reusing [file retention](../../../packages/api/src/files/retention.ts#L111) and [createChatExpirationDate](../../../packages/data-schemas/src/utils/tempChatRetention.ts#L80). Define and enforce the corresponding inherited policy for saved Studio creations. Test raw records and original/rendition access after the conversation deadline, including the Studio projection of native output.

**06 · P1 · Thread deletion and temporary expiry do not purge content payloads.**

[reconcileMediaRetirements](../../../packages/data-schemas/src/methods/media.ts#L2479) releases file retainers and marks the thread retired, but does not remove its title, turn prompts/import snapshots, job requests/generated text, provider recovery data, or private native parts. [Account deletion](../../../packages/data-schemas/src/methods/media.ts#L2741) has a separate content deletion phase. Native parts do have a working optional TTL when their source supplies an expiry, but the current host omits that expiry, and duplicated thread/job text is not covered by it. There is no later retirement payload purge. A temporary creation thus disappears from view while its text/private payloads remain stored. The [second-pass lifecycle probes](audit/lifecycle.md) verify both the retained payloads and the working optional TTL.

Add an idempotent content-purge phase after provider/accounting obligations are resolved. Retain minimal replay, financial, and cleanup tombstones, with content preserved only where a surviving authorized presentation requires it. Inspect raw Thread/Turn/Job/NativePart records after ordinary deletion and temporary expiry; asserting only a `retiring` status is insufficient.

**07 · P1 · Admin user deletion bypasses the new media deletion protocol.**

[Self-delete](../../../api/server/controllers/UserController.js#L436) calls media prepare/completion hooks, while [admin deletion](../../../packages/api/src/admin/users.ts#L199) directly deletes the user without them. The next media execution cannot [load its owner](../../../packages/api/src/media/runtime.ts#L144), and media account recovery cannot discover an owner that was never marked deleting. This leaves media content and can strand jobs, holds, and shared permits. The older admin cascade was incomplete already; the new protocol widens that gap.

Move both entry points behind a shared account-deletion service with injected media/trigger/code-environment lifecycle participants. Keep recoverable identity after the User deletion commits. Exercise queued, running, completed, and uncertain media work through the admin endpoint, and verify dispatch fencing and eventual cleanup.

**08 · P1 · Studio admission bypasses existing ban, rate-limit, and moderation policies.**

The new [media mount](../../../api/server/index.js#L459) applies JWT authentication, but neither its router nor service applies `checkBan`, message/upload rate limiters, or `moderateText`. JWT authentication establishes identity and tenant context; it does not perform those policy checks. Existing [agent routes](../../../api/server/routes/agents/index.js#L148), [chat moderation](../../../api/server/routes/agents/chat.js#L97), and [file routes](../../../api/server/routes/files/index.js#L24) do. Studio's queue/concurrency limits bound outstanding work; they do not enforce existing request-rate or moderation policies. Local PII/content filtering is already present and does not substitute for configured OpenAI moderation.

Provide one injectable admission-policy boundary for generation/retry and uploads, using the host's existing bans, limiters, violation reporting, and moderation configuration. Extract reusable moderation behavior to TypeScript and pass `prompt` explicitly; the legacy middleware reads chat `text`/answers and cannot simply be mounted unchanged. Keep status/recovery reads appropriately accessible. Verify banned users, exhausted configured limits, flagged prompts, and normal successful admission without contacting a paid provider.

**09 · P1 · Long threads hide new results and automatically edit an older image.**

[Turn listing](../../../packages/data-schemas/src/methods/media.ts#L1094) sorts ascending, and [thread detail](../../../packages/api/src/media/service.ts#L648) returns the first page. [Workspace](../../../client/src/components/Media/Workspace.tsx#L105) derives its latest turn and automatic image input only from that page. Further pages are private to [Thread](../../../client/src/components/Media/Thread.tsx#L544), behind a control labeled “Load older revisions.” Beyond the default 24 turns, new work is off-page and automatic follow-up can keep using turn 24's image, even after more pages are loaded.

Use one authoritative thread query/state, initially representing the newest turns, with older pages merged without changing the current parent. Test a 25+ turn thread, new generation, reload, and older-page navigation; each follow-up must reference the true newest eligible output unless the user explicitly pinned an older one.

**10 · P1 · Native images bypass shared-link file inclusion and routing.**

[Native output](../../../packages/api/src/media/native.ts#L260) uses an `image_file` content part with a native continuation reference. [Share file discovery](../../../packages/data-schemas/src/methods/share.ts#L242) collects top-level files/attachments and steer files; [content anonymization](../../../packages/data-schemas/src/methods/share.ts#L553) handles only steer file parts. Native images keep owner-authenticated media URLs and native metadata. Anonymous recipients see broken images, and `includeFiles: false` does not strip the new content shape. This is an inclusion/anonymization defect, not a demonstrated anonymous bypass of asset authorization.

Generalize the existing content-file discovery and share projection helpers, including `applyShareFileRoute`, for canonical native file parts. Strip private continuation identity at the share boundary. Test anonymous shared conversations with file inclusion both enabled and disabled, with the owner logged out.

**11 · P2 · Reused endpoint credentials do not preserve the full provider configuration.**

[Credential configuration](../../../packages/api/src/media/credentialConfig.ts#L43) implements its own expansion/header selection. Synthetic probes confirm that builtin Google loses `endpoints.all`/Google headers and `GOOGLE_AUTH_HEADER`; custom endpoint identity placeholders are forwarded literally. [Media transport](../../../packages/api/src/media/transport.ts#L78) also bypasses LibreChat's `PROXY` configuration: the existing proxy helper produces a proxy agent, while the media transport receives a direct agent. Standard Axios HTTP(S) proxy variables are a separate case. A provider working in chat can therefore fail in Studio or lose configured gateway identity/routing.

Extract a shared, plain provider connection descriptor using existing endpoint resolution, safe-user header substitution, auth-header handling, and proxy policy. Inject it into media adapters rather than duplicating provider initialization. Preserve strict credential stripping and SSRF rules for public output downloads. Verify builtin and custom endpoints with tenant/user headers, custom auth headers, configured proxies/bypass rules, and user-provided URLs.

**12 · P2 · Enabling media can reject an otherwise valid ordinary Google text call.**

[Native factory construction](../../../packages/api/src/media/native.ts#L38) resolves media credentials before taking the text-only bypass. [Credential resolution](../../../packages/api/src/media/credentials.ts#L131) applies media's minimum remaining validity. A synthetic plain-text Google call with a key valid for another 30 seconds fails as `credentials_expired` because the media dispatch threshold defaults to 60 seconds. This affects ordinary Google text calls whenever the media native factory is active, even without a matching media integration: the factory synthesizes a `native-google-history` connection for an unlisted text model.

Separate ordinary text invocation, native history restoration, and new paid image admission. Apply media dispatch requirements only to work that needs them while preserving ownership and binding checks for restored native content. Test text-only calls with near-expiry keys, media disabled/enabled, and explicit image requests.

**13 · P2 · Deleting through Files removes the original but abandons its derivatives.**

[deleteMediaAwareFile](../../../packages/api/src/media/deletion.ts#L48) calls the legacy deletion function once and acknowledges the media asset deletion. Its claim includes rendition objects/planned locations, but the wrapper ignores them. The correct enumeration exists in [MediaStorage.remove](../../../packages/api/src/media/storage.ts#L426). After acknowledgment the asset is retired, so the sweeper will not revisit its thumbnails, posters, or playback objects.

Route every media deletion entry point through the same injected storage lifecycle. Verify ordinary Files deletion removes all locations before acknowledgment, and that a derivative failure survives for durable retry.

**14 · P2 · Retired media tombstones reappear in the Files interface.**

Media keeps a retired File tombstone for replay safety. The existing [file query](../../../packages/data-schemas/src/methods/file.ts#L376) does not exclude retired media, and [toPublicFiles](../../../packages/api/src/files/public.ts#L35) only maps rows, stripping the lifecycle marker. Refreshing Files after deletion/expiry can therefore show a deleted item with a content URL returning 404.

Add a shared public-file availability query/projection for ordinary and agent listings. Preserve tombstones for internal recovery. Verify deleted rows stay absent from `/api/files` while internal resurrection prevention still works.

**15 · P2 · Studio output does not enter the shared Files cache used for chat restoration.**

[Media invalidation](../../../client/src/data-provider/Media/queries.ts#L159) touches only media query keys; uploads similarly omit Files cache updates. [Chat attachment](../../../client/src/components/Chat/Media.tsx#L80) writes only composer state. Existing Files queries disable mount/focus/reconnect refetch, and [draft restoration](../../../client/src/hooks/Input/useAutoSave.ts#L115) depends on cached file metadata. Generate/upload, attach, switch chats, and return: the attachment cannot reliably restore, and My Files remains stale.

Reuse `addFileToCache` and the existing [upload cache-ingress pattern](../../../client/src/data-provider/Files/mutations.ts#L57), with invalidation for media lifecycle changes. Test actual ChatMedia and draft restoration with one QueryClient, then verify Files after generation and deletion.

**16 · P2 · Importing while “Temporary creation” is selected creates permanent history.**

Generation forwards `temporary`, but the [import action](../../../client/src/components/Media/Form.tsx#L1002) omits it, and the [import contract](../../../packages/data-provider/src/media/requests.ts#L230) has no such field. The same composer continues to advertise temporary behavior while creating a persistent thread.

Apply the selected retention policy to every new-thread write, including imports, or prevent this unsupported operation with a localized explanation. Test temporary mode → upload → import → stored expiry → payload retirement.

**17 · P2 · “Use in chat” silently fails when only Studio is enabled.**

[Studio](../../../client/src/routes/Studio.tsx#L43) always exposes the handoff, but its sole consumer, [ChatMedia](../../../client/src/components/Chat/Media.tsx#L37), returns null when `media.surfaces.chat` is false. The user navigates into chat without the expected attachment or an error.

Make attachment handoff independent of the optional embedded creation surface, or gate the action consistently. Test `studio: true, chat: false` for both new and existing chat destinations.

**18 · P2 · “Edit request” discards original generation parameters.**

[The editor](../../../client/src/components/Media/Thread.tsx#L418) restores prompt, model, and inputs but resets parameters to `{ count: 1 }`. [Public turn/job contracts](../../../packages/data-provider/src/media/responses.ts#L123) omit those settings even though the stored request has them. Seed, quality, dimensions, duration, negative prompt, and provider options can change while the user is only correcting a prompt. Retry already preserves the stored request; this finding concerns the separate edit action.

Expose a sanitized request/settings projection and initialize the editor from it. Test reload → edit a nondefault image/video request → change only the prompt → submit, preserving all compatible settings.

**19 · P2 · Frontend, shared catalog, and adapter validation diverge.**

[Primary validation](../../../client/src/components/Media/Form.tsx#L891) checks required input roles and hosted URLs. [Secondary comparison validation](../../../client/src/components/Media/Form.tsx#L921) checks only counts and allowed roles, and misses other required secondary workflow settings. The primary paid job can be enqueued before the secondary is rejected.

The [second-pass provider probe](audit/providers.md) also found four requests accepted by the actual schema and shared catalog validator but rejected locally by adapters: Runway text-to-video at 1:1, Hailuo 2.3 at 10 seconds/1080P, Veo reference images at the default 4 seconds, and HeyGen reference image without audio/voice. These cases can acquire a job and reservation before a known local constraint fails; the probe does not claim they reach a paid provider call.

Extract a pure capability/request validator into data-provider for primary, comparison, and preset use, sharing rules with backend `validateMediaOffering`. Validate both requests before either submission. Cover required audio, hosted video references, and required provider controls. The two existing implementations are concrete duplication already causing behavioral drift.

**20 · P2 · Preset mutation failures are swallowed.**

[Preset default/delete actions](../../../client/src/components/Media/Presets.tsx#L238) use `.catch(() => undefined)` without showing mutation errors. A failed delete closes its confirmation, and a failed default change provides no explanation or recovery feedback.

Reuse the localized notice handling already present for preset creation. Verify failures preserve the relevant selection, display an accessible localized error, and allow a successful retry.

**Integration and maintenance work**

**21 · P2 · Background media execution lacks the existing job observability contract.**

Media services/worker accept only an error logger; they expose no structured lifecycle observer for queue wait, dispatch, provider duration, cancellation, ingestion, uncertain outcomes, settlement, or cleanup. Generic HTTP/Mongo instrumentation still exists, but HTTP 202 ends before the paid work completes. The existing [Prometheus path normalization](../../../packages/api/src/app/metrics.ts#L12) also collapses media routes into `/api/#path`; a direct probe confirmed this for submissions, job reads, asset content, and uploads. It avoids unbounded labels, but cannot distinguish these operations or count them in existing upload metrics. Studio's direct provider calls/title invocations do not enter the normal chat Langfuse run configuration.

Inject a typed media lifecycle observer at host composition. Adapt it to the existing Prometheus registry, OpenTelemetry tracing, safe exception handling, and Langfuse destination/sampling/privacy policy where LLM traces apply. Carry correlation across durable retries using span links/attributes, never unbounded metric labels. Add normalized media routes and upload classification. Test success, uncertainty, cancellation, restart, settlement and cleanup events, disabled telemetry, tenant routing, and absence of prompts/keys/base64 in metrics/log payloads.

**22 · P2 · Studio activity has no Insights integration.**

Existing [Insights aggregation](../../../packages/data-schemas/src/methods/insights.ts#L290) reads conversations/messages scoped to authorized agents. Studio writes separate media threads/turns/jobs, so its use, outcomes, and spend are absent from this view. Writing the shared Transaction ledger does not make those records appear automatically. This is a missing product integration, not evidence that existing chat Insights are incorrect.

Extend the shared Insights contracts, data-schemas aggregation, access checks, and UI with explicit media activity dimensions and financial semantics. Preserve agent-scoped authorization; a Studio thread must not be made visible merely by assigning it a synthetic agent. Cover provider/model/operation, submitted/completed/failed/uncertain work, known versus estimated cost, and correct tenant/user visibility. Use existing financial receipts rather than a second analytics ledger.

**23 · P2 · CI does not prove that the packaged SDK and media browser journey stay current.**

The [dependency cache](../../../.github/workflows/agents-integration-tests.yml#L73), and equivalent backend/frontend/browser caches, is keyed by `package-lock.json`; cache hits skip `npm ci`/postinstall. A patch-only change can reuse old patched node_modules. Build keys and several workflow path filters likewise omit `patches/**`. The [media Playwright configuration](../../../e2e/playwright.config.media.ts#L9) selects a separate `e2e/media` suite, but no workflow invokes it. Existing tests pass while findings 01 and 09–19 remain uncovered.

Include patch contents in every relevant dependency/build cache key and workflow trigger while the patch exists. Run a pristine-install/package parity check and the SDK invocation contracts against the consumed artifact. Add the media fixture to CI with failure/recovery scenarios. Keep the ordinary Lighthouse gate, and add a separate media-enabled replay/pagination scenario instead of treating the default-chat result as media coverage.

**24 · P3 · Complete shared extraction where duplication has already appeared.**

The new [resolveNativeMediaFactory helper](../../../api/server/controllers/agents/client.js#L359) adds branching and request interpretation in legacy CJS despite the repository's wiring-only rule. Move that behavior into an injected TypeScript host adapter. Media [title client sanitization](../../../packages/api/src/media/title.ts#L134) duplicates the existing [chat title option handling](../../../api/server/controllers/agents/client.js#L6069); extract a common typed resolver/sanitizer and test both consumers. Keep title publication lifecycles specific to their owners.

Move Thread's embedded API hooks into `data-provider/Media` as part of fixing finding 09. Reuse active/catch-up polling for expanded terminal job history, which currently polls at the fast interval indefinitely. Centralize metadata-based attachment validation used by ChatMedia and ordinary file attachment. Avoid splitting the large Form or repository files merely to reduce line counts; extract around request validation, publication, retention, settlement, and query ownership so each invariant has one implementation.

The legacy Gemini image tool, the new Studio Google adapter, and the SDK Google adapter still maintain overlapping provider policy/protocol knowledge; OpenAI tools and Studio have a similar overlap. Share stable protocol/capability pieces and connection policy while keeping invocation ownership distinct. Document the supported credential matrix explicitly: builtin Azure credential reuse is rejected by the media schema, and Vertex currently requires its own declared service-account-file configuration. Treat these as scoped support gaps, not a claim that every existing tool/provider setup already works in Studio. Keep dynamic user/message headers out of credential-binding identity so ordinary request metadata changes do not invalidate native continuation.

**Suggested implementation order**

| Work package              | Findings                          | Completion evidence                                                                                                                |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| SDK and provider contract | 01, 02, 11, 12, SDK portion of 23 | One consumed artifact; real HTTP serialization; invoke/stream/streamEvents parity; bounded replay reads; endpoint/proxy parity     |
| Durable lifecycle         | 03–07, 13, 14                     | Failure isolation; operator recovery; shared deletion entry points; raw payload expiry; no stranded holds, permits, or derivatives |
| Admission and sharing     | 08, 10                            | Existing configured policy enforced; anonymous share inclusion/exclusion and private metadata projection                           |
| User-visible state        | 09, 15–20                         | Long-thread restore; correct attachment cache; temporary import; capability combinations; preserved edits; actionable failures     |
| Operational integration   | 21–24                             | Insights authorization and activity; bounded telemetry; CI artifact/cache correctness; common policy/validation helpers            |

Keep the durable media worker distinct from the transient chat stream manager: remote provider operations, uncertain submission, and financial settlement need durable state. Keep provider-specific image/video request codecs distinct where their protocols differ. Share connection policy, lifecycle services, typed validation, and observers. This gives future providers new adapters rather than new parallel policy systems.

**Verification for the audited heads**

All five affected LibreChat workspaces passed `npx tsc --noEmit`: `packages/api`, `packages/data-provider`, `packages/data-schemas`, `packages/client`, and `client`. The SDK workspace also passed its typecheck.

| Focused checks run                                   | Result                     |
| ---------------------------------------------------- | -------------------------- |
| API metrics, media config/startup, titles, transport | 5 suites / 90 tests passed |
| API worker, storage, account deletion                | 3 suites / 72 tests passed |
| API credentials and native SDK boundary              | 51 tests passed            |
| Shared media configuration/request contracts         | 1 suite / 66 tests passed  |
| Client Form, Thread, ChatMedia, Studio               | 4 suites / 75 tests passed |
| Shared ControlCombobox and PixelCard                 | 2 suites / 21 tests passed |
| SDK native media suites                              | 55 tests passed            |

That is 375 focused LibreChat tests and 55 SDK tests. These are existing suites, not new coverage for every finding. Read-only synthetic probes additionally reproduced the consumed SDK's HTTP serialization/admission failures, provider header/proxy mismatches, and plain-text credential-expiry regression. Retained scripts are [sdk-entrypoints.cjs](audit/probes/sdk-entrypoints.cjs) and [endpoint-credentials.cjs](audit/probes/endpoint-credentials.cjs); they use synthetic credentials and intercepted provider boundaries. The former explicitly distinguishes legacy and default typed `streamEvents`, as described in finding 01.

The fresh `npm run lighthouse` run passed all three cold navigations and the seeded-transcript assertion after rebuilding production artifacts. With the existing 250 ms MongoDB query delay, medians were **LCP 3,971.775 ms** (4,500 ms budget), **CLS 0.0168302** (0.1 budget), and **TBT 98.189 ms** (500 ms budget). On Windows this run selected Playwright Chromium headless shell with `CHROME_PATH`, a unique temporary profile through `LIGHTHOUSE_CHROME_FLAGS`, and the isolated server on port 3098. Reports are in `.lighthouse/`. The fixture leaves media disabled, so this pass covers ordinary conversation loading, not native replay or Studio interaction. The production build emitted dependency/chunk-size warnings; no compile failure occurred.

The fresh media browser fixture also passed: `E2E_BASE_URL=http://localhost:3099 npx playwright test --config=e2e/playwright.config.media.ts`, one test in 29.9 seconds. It exercises queueing, restoration, previews, refinement, mobile navigation, and original-to-chat handoff with local synthetic media. It does not cover the long-thread, policy-combination, retention, and native-sharing failures above. Both browser commands exited successfully; teardown logged interrupted background index builds while closing the disposable database.

No live inference/cloud uploads, full-suite run, or external review was performed during this audit. No runtime source was edited; this report is the deliverable. Build/test artifacts are local. Each specialist checked the consolidated wording and citations for their findings; those accuracy checks are not clean implementation reviews. The findings above still require implementation and regression coverage before a clean review can be claimed.

**Findings considered and rejected**

- An unconditional `releaseMediaPermits` call does not release live provider capacity: the data-schemas method enforces terminal certainty. The attention-state problem is the absence of a valid resolution path, not premature release.
- Media does not introduce a wholly separate money ledger: it integrates with existing Balance/Transaction records. The gaps are recovery and visibility.
- Cloud originals are projected through a canonical same-origin content route, so a suspected cross-origin download issue was not retained.
- Feature Jotai ownership, host-supplied preferences, theme roles, and shared primitives are largely aligned. No confirmed shared combobox/dialog/PixelCard regression was found.
- The pagination defect is oldest-first initial history and split state ownership, not a proven moving-cursor failure.
- Rename/delete/cancel access for users without create permission matches the server's ownership policy; missing `canCreate` guards there are not independently defects.
- Local content filtering, SSRF handling, redacted provider transport errors, and saved-key reuse are present. The policy/provider findings identify the remaining specific omissions rather than claiming those systems are absent.
