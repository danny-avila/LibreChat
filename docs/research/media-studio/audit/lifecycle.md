# Media lifecycle: failure and transition probes

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`. This second pass exercises the installed, built `@librechat/api`, `@librechat/data-schemas`, and `librechat-data-provider` packages against a new standalone MongoDB and temporary local files. It does not re-run an existing suite. Production source was not edited.

Reproduction from the repository root:

```powershell
node docs/research/media-studio/audit/probes/lifecycle.cjs
```

Final run: **exit 0**, four probes with assertions, approximately **8.7 seconds**. The script creates and closes its own MongoDB, removes its temporary files, and uses synthetic provider output. It disables inherited Meilisearch configuration before importing the application packages. An initial run before that isolation setting produced failed Meilisearch initialization/index warnings; the final run was clean. No live inference or cloud object operations were performed.

## New finding: recovery publishes a temporary creation permanently

**P1 — retention changes after a crash between staging and first publication.**

The request declares `temporary: true`. Normal `publishMediaSubmission` receives `temporaryRetentionMs` and sets the thread deadline. The worker passes the same option into `recoverMediaPublications`, but that method destructures only `scope`, `limit`, `maxRetainers`, and `maxTitleChars`, and forwards only the latter two publication options. `temporaryExpiry` returns `undefined` when the retention interval is absent.

Sources:

- [Recovery drops the option](../../../../packages/data-schemas/src/methods/media.ts#L1626).
- [Missing interval means no deadline](../../../../packages/data-schemas/src/methods/media.ts#L209).
- [Ordinary publication uses the option](../../../../packages/data-schemas/src/methods/media.ts#L657).
- [Worker supplies the option](../../../../packages/api/src/media/worker.ts#L636).
- [Runtime derives the host retention interval](../../../../packages/api/src/media/runtime.ts#L170).

Fixture: stage two new temporary submissions with distinct request IDs. Publish the first normally with a 60-second retention interval. Simulate process interruption by leaving the second at its durable `preparing` receipt, then run the real recovery method with that same interval. Advance the retirement sweep's clock by 120 seconds; no database clock mocking is needed.

| Invariant | Normal publication | Recovered publication |
| --- | --- | --- |
| New temporary thread has a deadline | `createdAt + 60 seconds` | **No `expiresAt`** |
| Thread is retired by a sweep after its deadline | `retired` | **Still publicly active** |

The fixture passed a valid retention interval to recovery; this is not caused by an omitted fixture setting. The recovery contract permits that option, and its caller supplies it. A crash in the durable submission path can therefore convert a temporary creation into permanent visible history.

Reuse the existing `MediaPublicationOptions` contract end to end. For stronger replay semantics, persist the resolved deadline with the staged creation so recovery does not depend on whichever tenant/host configuration a later worker happens to load. Preserve any already-created deadline rather than resetting it on retries. Add a regression covering direct publication, interrupted publication, and duplicate recovery using the same request identity.

## Confirmations of first-pass findings

### Findings 13 and 14: Files deletion leaks derivatives and exposes tombstones

Fixture: use the real reservation/commit methods to create an unretained canonical original with one planned/published thumbnail, backed by two temporary physical files. Invoke the built `deleteMediaAwareFile` wrapper with the real local object store as the legacy delete callback. Then query canonical content, the expiry sweep, and the same `getFiles` plus `toPublicFiles` sequence used by `/api/files`.

| Observation | Result |
| --- | --- |
| Legacy byte delete invocations | 1 |
| Original physically exists | false |
| Thumbnail physically exists | **true** |
| Canonical lifecycle after acknowledgment | `retired` |
| Asset returned by expiry sweep | **false** |
| Deleted File returned by public file projection | **true** |
| Canonical media content available | false |

Control: an equivalent second asset deleted with the built `MediaStorage.remove` loses its original **and** its thumbnail. This demonstrates a divergent deletion entry point, not a broken local object store.

Sources: [legacy wrapper](../../../../packages/api/src/media/deletion.ts#L40), [correct shared location enumeration](../../../../packages/api/src/media/storage.ts#L424), [retired acknowledgment](../../../../packages/data-schemas/src/methods/media.ts#L2178), [expiry selection](../../../../packages/data-schemas/src/methods/media.ts#L2796), [unfiltered Files query](../../../../packages/data-schemas/src/methods/file.ts#L369), [public projection](../../../../packages/api/src/files/public.ts#L35), and [actual Files route](../../../../api/server/routes/files/files.js#L70).

Reuse `MediaStorage.remove` for all media-aware byte deletion and acknowledge only after every planned/committed location has been removed. Keep internal tombstones, but make the public query exclude unavailable media rather than stripping away the only lifecycle signal. These fixtures exercise the underlying Files route query/projection, not a browser UI or HTTP request.

### Finding 06: retirement hides rows but retains content

The temporary direct-publication fixture above is swept to `retired`. Its public thread getter returns null, but raw storage still contains the full thread title, turn prompt, and job request prompt.

A separate native fixture records a generated text part with a private thought signature, completes normally, retires the thread, and runs retirement reconciliation twice. Raw `MediaJob.outputs[0].text` still contains the generated text, and `MediaNativePart.part.thoughtSignature` still contains the signature. Repetition does not purge either record.

Sources: [retirement only unlinks/marks status](../../../../packages/data-schemas/src/methods/media.ts#L2479), [native materialization at completion](../../../../packages/data-schemas/src/methods/mediaNative.ts#L323), and [account deletion has the separate content-deletion phase](../../../../packages/data-schemas/src/methods/media.ts#L2741).

Implement a shared, idempotent payload-purge phase after the thread's provider/accounting obligations are resolved. Preserve only necessary replay/financial/storage identities. Do not equate a public 404 with erasure, and do not create a second retention system that cleans only the native part while leaving duplicated job/turn text behind.

### Finding 03: interrupted native work blocks deletion without holding capacity

Fixture: start a native recording through the real persistence method and abandon it without completion/failure acknowledgment. Run stale-native reconciliation, retire its thread, reconcile retirement, then attempt `prepareMediaAccountDeletion`.

Observed: job phase `requires_attention`; thread status `retiring`; account deletion preparation `false`; **zero MediaPermit records**. This supports the native deletion-blocking part of finding 03. It does **not** support claiming that native recording acquired paid worker permits or a second accounting owner.

Sources: [native reconciliation creates attention state](../../../../packages/data-schemas/src/methods/mediaNative.ts#L409), [retirement waits for terminal jobs](../../../../packages/data-schemas/src/methods/media.ts#L2504), and [account deletion waits for active jobs](../../../../packages/data-schemas/src/methods/media.ts#L2614).

Recovery should distinguish chat-owned invocation accounting from media worker liability. Native content lifecycle still needs a supported resolution after a host crash; the financial reservation flow is not a substitute for that resolution.

### Finding 04: a failed cleanup item prevents unrelated execution

Fixture: owner A has one expired original. Owner B has one accepted queued generation. Run the actual worker and real repository/storage methods, substituting only the local store's remove boundary to throw for A's object and a synthetic adapter/accounting observer for B. The adapter returns text only; no inference or cloud calls occur.

After three independently scheduled ticks: the same delete has failed three times; B is still `queued`; provider submission count is zero; settlement count is zero; worker scan-error count is three. Toggle only A's delete boundary to succeed. The same worker and the same queued B job then submit once, settle once, and reach `succeeded`.

| State | Delete attempts | B phase | Provider submissions | Settlements |
| --- | --- | --- | --- | --- |
| Persistent A delete failure | 3 | `queued` | 0 | 0 |
| Same worker after A delete succeeds | at least 4 | `succeeded` | 1 | 1 |

Sources: [maintenance loop](../../../../packages/api/src/media/worker.ts#L590), [throwing removal before dispatch](../../../../packages/api/src/media/worker.ts#L627), [dispatch loop](../../../../packages/api/src/media/worker.ts#L632). Reuse [the existing file sweep's per-item failure recording and deferral](../../../../packages/api/src/files/sweep.ts#L268) plus [the existing poison-item scheduling rationale](../../../../packages/data-schemas/src/methods/file.ts#L392).

Separate dispatch scheduling from cleanup and isolate maintenance items/scopes. This experiment establishes cross-owner starvation from a storage failure. It does not independently prove the other proposed accounting-failure variants or measure fairness under a large paginated population.

## Correction: native parts do have an optional TTL

The first audit's blanket “no later retirement purge/TTL” wording needs qualification. `MediaNativePart` has an `expiresAt` TTL index, and recording populates it when `nativeSource.expiresAt` exists. The fixture starts and completes a native recording with a 500 ms source deadline, using a disposable MongoDB configured to run its TTL monitor every second. The native part is physically removed by MongoDB.

However, the completed generated text remains available through the public media job view after that TTL deletion. The job outputs and active thread have no corresponding expiry in this fixture. The current host native factory also supplies only conversation/message/run identity to `startMediaNativeRecording`, omitting source expiry entirely.

Sources: [working native-part TTL](../../../../packages/data-schemas/src/schema/mediaNativePart.ts#L26), [part deadline propagation](../../../../packages/data-schemas/src/methods/mediaNative.ts#L240), [native thread publication](../../../../packages/data-schemas/src/methods/mediaNative.ts#L89), and [host omits source deadline](../../../../packages/api/src/media/native.ts#L170).

Retain the original retention findings, but say exactly which payload and entry point lacks cleanup. “There is no TTL anywhere” would be incorrect. The optional native-part TTL is useful existing infrastructure to preserve and connect to the full retained presentation.

## Scope and limits

The diagnostic validates storage transitions, raw payload lifetime, expiry recovery, and one worker failure-isolation path. It does not validate live provider cancellation, cloud credentials, browser rendering, financial amounts, or frontend cache behavior. Worker accounting is an injected observer so the probe can establish that dispatch and settlement are reached; the separate financial audit owns ledger correctness. Existing test suites and workspace typechecks were not re-run because this pass changes only the diagnostic/report and executes the built packages directly.
