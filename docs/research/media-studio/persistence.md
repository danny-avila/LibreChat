# Media persistence, recovery and retirement

Technical design, 2026-09-15; no implementation/runtime validation. The [model](studio.md) is
thread → turn with immutable creative content → jobs → immutable assets.
One job is one provider submission attempt; polling and ingestion retries retain its identity.

## Baseline and decisions

- Support standalone MongoDB. [Default Compose](../../../docker-compose.yml) starts `mongod --noauth`
  with no replica set; [connection setup](../../../api/db/connect.js) does not require one.
  [Transaction probing](../../../packages/data-schemas/src/utils/transactions.ts) explicitly detects
  unsupported transactions. A transaction-only design would exclude a standard deployment.
- Use single-document conditional updates and durable publication barriers. Critical pre-provider,
  debit and publication writes need acknowledged journal durability (majority on replica sets).
  An ambiguous write acknowledgement is reconciled before any paid dispatch; never silently weaken it.
- Make `MediaJob` authoritative for generation submissions, embedding its immutable turn snapshot.
  Generation turns and thread summaries are projections; import turns own their receipt without a job.
  Do not embed unlimited turns/jobs in a thread.
- Run a small database-backed worker in the API process initially, with the same injected service
  usable in a separate worker. Browser polling reads snapshots; neither Redis nor an event log is required.
- Reuse existing factories, tenant enforcement, storage and balance concepts; do not directly reuse
  the conversation-specific queued-turn lifecycle or claim that the existing charge method is idempotent.

Reuse evidence: [queued-turn methods](../../../packages/data-schemas/src/methods/queuedTurn.ts#L1080)
provide fingerprints, staged publication and admission fences; [File publication](../../../packages/data-schemas/src/methods/file.ts#L251)
has stable artifact identity; [auto-refill](../../../packages/data-schemas/src/methods/transaction.ts#L317)
combines a balance effect and pending ledger marker in one write.

## Records and indexes

Records have `schemaVersion`, opaque string ID, `tenantId`, `ownerId`, `createdAt` and `updatedAt`;
public dates are ISO strings. Normalize legacy no-tenant scope consistently inside data-schemas.
Never infer ownership from a UUID, source conversation, provider operation ID or storage path.

| Record                    | Fields beyond the common identity                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaThread`             | `status: active/retiring/retired`, `epoch`, title, cover asset/pin, source-chat branch, `nextTurnSequence`, one pending sequence allocation, bounded in-flight admission grants, advisory counts/activity and `projectionRevision`                                                                                                                 |
| `MediaTurn`               | `commandKind: generation/import`, `threadId`, `threadEpoch`, `sequence`, immutable parent/output/input/source snapshots and requested settings; generation source job ID, or import `clientRequestId/fingerprint/publicationReceipt`; no provider secrets                                                                                          |
| `MediaJob`                | `threadId`, `turnId`, embedded turn snapshot, `clientRequestId`, fingerprint, `retryOfJobId`, publication state, `executionOwner: media/chat`, source invocation identity, phase, `activeSlot`, due time, lease token/owner/expiry, cancellation intent, publication/accounting/cleanup statuses, retention deadline                               |
| MediaJob execution fields | Immutable route/capability/rate snapshots, credential/account reference, provider idempotency key, admission grant, remote operation/request identity, reported effective route, submission certainty, progress, bounded output descriptors, error category, raw usage, continuation reference and accounting owner; part of the same Job document |
| `MediaAssetWrite`         | Logical output identity, rendition role, file ID, ingest claim token, immutable staging object key/upload ID, checksum/size/MIME metadata, state `reserved/uploading/stored/published/abandoned`, cleanup due time; contains no base64 payload                                                                                                     |
| Existing `File`           | Add a media origin/output identity, content digest, immutable object identity, original/rendition relationship and retirement fields described below; retain existing canonical storage/owner/tenant semantics                                                                                                                                     |
| `MediaSettlement`         | Immutable settlement key, job or chat-accounting identity, raw usage revision, signed credit effect/rate snapshot, balance sequence once assigned, applied debit/debt/refund result, ledger publication and reconciliation state                                                                                                                   |

Retries create new jobs under the same immutable turn; writes have their own collection.
Bound prompts, input count, output count, opaque continuation bytes and error details by configured
schema limits. Large provider protocol envelopes belong in private managed storage with retention,
not public job DTOs. A thread may contain multiple models, connections and media kinds.

| Collection   | Required unique indexes                                                                                                                         | Required read/recovery indexes                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Threads      | `(tenant, owner, id)`                                                                                                                           | `(tenant, owner, status, activityAt desc, id)`                                                                                                                                      |
| Turns        | `(tenant, owner, id)`; `(tenant, owner, threadId, sequence)` once assigned; partial `(tenant, owner, commandKind, clientRequestId)` for imports | `(tenant, owner, threadId, sequence)`; `(commandKind, publicationReceipt.phase, updatedAt, id)`                                                                                     |
| Jobs         | `(tenant, owner, clientRequestId)`; `(tenant, owner, id)`; partial `(tenant, owner, activeSlot)` and scoped remote-operation identity           | `(executionOwner, phase, dueAt, leaseUntil, id)`; `(publicationState, updatedAt, id)`; `(tenant, owner, threadId, createdAt, id)`; `(submissionCertainty, reconciliationDueAt, id)` |
| Asset writes | `(tenant, owner, outputKey, rendition, ingestToken)`                                                                                            | `(state, cleanupDueAt, id)`                                                                                                                                                         |
| Files        | Partial unique `(tenant, owner, mediaOutputKey, rendition)` for media files                                                                     | `(mediaLifecycle, expiredAt, deletionRetryAt, file_id)`                                                                                                                             |
| Settlements  | `(tenant, owner, settlementKey)`; partial unique `(balanceId, sequence)`                                                                        | `(state, reconciliationDueAt, id)`                                                                                                                                                  |

`outputKey` includes job and stable provider item/part ID or recorded ordinal; UI indexes
and filenames never supply identity. For uploads it includes owner-scoped upload request identity.
Remote-operation uniqueness includes connection/account/API identity: two accounts may reuse an ID.
Verify correctness indexes before enabling writes; failures disable media admission. Other compatible
engines need their own index/CAS conformance run; standalone Mongo does not prove engine compatibility.

## Plain repository interface

Register `createMediaModels(mongoose)` in [createModels](../../../packages/data-schemas/src/models/index.ts)
and methods in [createMethods](../../../packages/data-schemas/src/methods/index.ts). Inject these methods
into `createMediaServices`; argument/result types are bounded plain DTOs, not arbitrary filters:

```ts
type OwnerScope = { tenantId: string | null; ownerId: string };
type JobFence = OwnerScope & { jobId: string; leaseToken: string; expectedRevision: number };
interface MediaRepository {
  stageSubmission(input: StageSubmission): Promise<SubmissionReceipt>;
  publishSubmission(input: PublishSubmission): Promise<PublicationResult>;
  getSubmission(scope: OwnerScope, clientRequestId: string): Promise<SubmissionReceipt | null>;
  stageImport(input: StageImport): Promise<ImportReceipt>;
  publishImport(input: PublishImport): Promise<ImportReceipt>;
  getImport(scope: OwnerScope, clientRequestId: string): Promise<ImportReceipt | null>;
  listThreadTurns(input: ThreadPage): Promise<TurnPage>;
  claimDueJob(input: ClaimDueJob): Promise<ClaimedJob | null>;
  renewJob(fence: JobFence, leaseUntil: string): Promise<boolean>;
  grantDispatch(input: DispatchAdmission): Promise<DispatchGrantResult>;
  recordProviderObservation(input: ProviderObservation): Promise<ObservationResult>;
  requestCancellation(input: CancelJob): Promise<CancelResult>;
  reserveAssetWrite(input: ReserveAssetWrite): Promise<AssetWriteReceipt>;
  commitAssetWrite(input: CommitAssetWrite): Promise<AssetCommitResult>;
  retainAsset(input: RetainAsset): Promise<AssetRetentionResult>;
  retireThread(input: RetireThread): Promise<RetirementReceipt>;
  claimAssetDeletion(input: ClaimAssetDeletion): Promise<AssetDeletionClaim | null>;
  completeAssetDeletion(input: CompleteAssetDeletion): Promise<boolean>;
  stageSettlement(input: StageSettlement): Promise<SettlementReceipt>;
  reconcileSettlement(input: ReconcileSettlement): Promise<SettlementResult>;
}
```

Commands carry expected epoch/revision/fence and return `applied/replayed/conflict/retired` outcomes.

## Accepting one submission without cross-document transactions

Public command receipts are `preparing | accepted | rejected`: insertion returns preparing until
the linked publication barrier succeeds. Replayed requests return their current receipt phase.
Internal job `staging/published` describes that same barrier, not provider completion.

1. Resolve current access/config, validate the request and authorize completed input assets. Compute
   a canonical request fingerprint including parent outputs and exact requested route/settings.
   Bound backlog with an `activeSlot` in the configured owner capacity: atomically insert against its
   partial unique index, trying alternate free slots on conflict. A count-then-insert is insufficient.
2. Insert one `MediaJob(publicationState=staging)` with a unique owner-scoped client submission key,
   stable thread/turn/job IDs and full immutable turn snapshot. Same key/same fingerprint returns the
   existing receipt; changed content returns conflict. Do not pay, schedule or publish success yet.
3. Create an absent new thread shell with an insert-only write tied to that receipt. Existing threads
   must be active at the expected epoch. A retired identity is never recreated by an upsert.
4. Allocate the turn sequence under a bounded thread mutation claim. As in queued-turn allocation,
   the thread's pending slot names the job owning the increment; recovery completes assignment before
   clearing it. Explicit job retries reuse the existing turn/sequence; variants allocate a new turn.
5. Pin input references under the File retirement protocol, then insert the immutable `MediaTurn`
   from the job snapshot. Record projection receipts back on the job. Never rely on a best-effort count.
6. CAS the job to `publicationState=published, phase=queued` only after links/pins are acknowledged.
   Return the linked receipt. A lost response is recovered by `clientRequestId`; the browser can
   show an optimistic pending tile but must not invent an accepted ID or auto-submit a restored draft.

A worker scans staging jobs and repeats these steps. Failure produces a rejected receipt and
compensating reference cleanup. Terminal/no-liability jobs release capacity in their terminal CAS.
After a staging deadline, retain the idempotency tombstone rather than silently allowing the same
client key to create a new paid request. Thread counts/covers are advisory projections repaired from
jobs/turns; thread detail can recover from canonical jobs when a view is behind.

Publication is recoverable, not globally atomic: retirement can intervene between reads/writes.
Every execution still needs the dispatch grant below; projection lag never grants paid authority.

### Imports have their own authoritative receipt

`POST /imports` stages an import MediaTurn with owner-scoped `commandKind=import`, `clientRequestId`,
fingerprint, deterministic thread/turn IDs and immutable authorized source snapshot. Only its receipt
and publication bookkeeping mutate. The unique import key is a separate namespace from job submissions;
`GET /imports/:clientRequestId` resolves preparing/accepted/rejected after a lost response.
Create the thread shell, assign the turn sequence once, pin authorized source content identities,
then CAS its receipt to accepted after the same linked publication barrier. Recovery repeats these
steps and compensates rejected pins; it never creates a provider job or makes a paid call. Keep
rejected idempotency tombstones. Existing mutable sources require an immutable captured copy/version.

## Claims, dispatch and remote uncertainty

Only `executionOwner=media` jobs enter the paid scheduler. Chat-owned native jobs are recording
projections of an existing invocation: asset-ingress recovery can run, but no worker reconstructs
and resubmits the original chat prompt or separately bills its already-accounted model output.

Use `findOneAndUpdate` on due published jobs, matching absent/expired lease, and mint a new lease
token. Every state mutation compares that token, job revision and expected phase. Lease renewal only
extends the same owner; a late worker cannot write a terminal state after takeover.

Before submission, revalidate permissions, credential/account identity, policy, inputs and route
capabilities; acquire capacity permits and a budget hold.
Acquire permits in one deterministic order (deployment, connection/provider, user), releasing partial
acquisitions on failure. Separate worker leases from outstanding provider-concurrency permits:
worker death does not prove a remotely running/unknown job stopped using provider capacity.

Thread grant and retirement CAS the same thread document. If retirement wins, no dispatch grant is
issued. If the grant wins, record an admitted in-flight intent that retirement must reconcile/cancel.
Persist its matching job as `submitting` before the provider call. There is no atomic operation
covering Mongo and the provider: a deletion following the winning grant cannot promise zero remote
submission. Grant/lease deadlines bound authority, and deletion suppresses publication of late results.

```text
staging → queued → submitting → running → ingesting → succeeded
                    ↘ reconciling → running / ingesting / requires_attention
queued → cancelled     terminal provider refusal/error → failed
```

Cancellation, available outputs, remote status and settlement are independent; a failed preview
does not fail an original. Poll with bounded backoff; verified webhooks wake the same reconciler.
Persist provider identity immediately when known. On takeover, `submitting` without a remote ID is
**unknown**, never automatically queued: lookup by provider idempotency/request key if supported,
otherwise require attention after a configured deadline. Only proven pre-submission failure or a
provider-supported idempotent replay can retry automatically using the same job/request identity.
An explicit retry of a safely failed/unsubmitted-cancelled job requires a new `clientRequestId`,
creates a new job with `retryOfJobId` under the same turn, and leaves the old terminal result intact.
Changed prompt/settings or an intentional variant creates a new turn. Preserve requested/reported
routes; an unknown submission is not permission for automatic retry or connection fallback.

## Originals and idempotent ingestion

Reserve `MediaAssetWrite` before storage I/O, including an immutable tenant/owner-scoped object key
unique to that ingest claim. Stream to that key; calculate digest/byte count and inspect bounded
metadata. Persist multipart upload identity when available. Do not resize originals or buffer videos.
After a lost upload acknowledgement, inspect the known key and verify content/digest; do not assume
that an absent DB `stored` flag means the object was never written.

Publish the File with insert-only logical output identity, then attach its ID to the correct job
and turn projection. Competing writers read the winning File; different bytes for the same logical
output are an integrity conflict. A staging key may become the final immutable original directly,
avoiding a second upload/copy. Losing claims retain their own cleanup receipt and delete only their
own keys, never the winner's object. A stale writer cannot overwrite an original because its key differs.
File metadata begins unpublished; readers hide it until the job/asset publication barrier is acknowledged.
Retired parent grants permit cleanup only, and current parent/asset access gates hide late publication.

An uploaded input uses the same publication protocol without a paid job. Each derivative has its
own rendition/version identity and immutable key.
Storage failure after provider success retries ingestion; it never re-enters generation. Expiring
provider URLs make ingestion urgent but cannot turn an unrecoverable download into free regeneration.
Existing [createFile](../../../packages/data-schemas/src/methods/file.ts#L812) upserts mutable fields and
[saveBase64Image](../../../api/server/services/Files/process.js#L1594) resizes; neither is this commit API.

## Retention and delete/save races

For media Files, add `mediaLifecycle: live/retiring/retired`, `mediaEpoch`, immutable object identity,
`hardExpiresAt`, bounded compact `mediaRetainers`, and a deletion claim/receipt. Retainers identify
thread, conversation, library pin or in-flight input grant, with an allowed retention deadline.
Use one retainer per containing thread/conversation, not per turn; reference rows for search are
projections. The authoritative retainer set and lifecycle live in the **same File document** so save
and retirement use one CAS. Bound retainer count/bytes in config; reject exceeding that limit rather
than allowing unbounded BSON growth. A future sharded reference registry requires its own protocol.

`retainAsset` matches live epoch and policy-valid expiry, then idempotently adds/updates its stable
retainer key. Recompute effective `expiredAt` from active retainers, bounded by hard policy expiry.
Removing a thread releases its retainer idempotently; per-turn references remain explanatory lineage.
`claimAssetDeletion` matches the epoch and due expiry/no valid retainers or grants; hard policy expiry
instead revokes grants. It changes live → retiring with a deletion token before any external DELETE.
Whichever mutation wins defines the result: a successful retain prevents that deletion claim;
a winning deletion claim makes later saves fail explicitly. Never revive a retiring object.
Provisional retainers have bounded deadlines and source epoch/submission identity. Source retirement
and reference insertion span documents: reconciliation also checks late provisional references from
terminal jobs; only a published, still-authorized source can promote a retainer to indefinite retention.

Explicit asset deletion overrides retainers and revokes new grants; already-admitted provider input
cannot be recalled. Reconcile its operation and suppress retired outputs. Account/thread retirement
retains cleanup/accounting tombstones while deleting content and private continuation on schedule.

Deletion uses the captured immutable storage key/version. On failure remain retiring and retry with
backoff; on success mark retired, clear binary references only after all original/derivative/provider
upload cleanup receipts settle. Missing storage is idempotent success. Never TTL-delete metadata
before storage cleanup. Abandoned uploads and late stale uploads remain discoverable through write
receipts; keep tombstones past the maximum upload lifetime and run orphan-key reconciliation.

This changes shared File consumers: [getExpiredFiles](../../../packages/data-schemas/src/methods/file.ts#L405)
currently selects only expiry/backoff, and [the sweeper](../../../packages/api/src/files/sweep.ts#L268)
deletes selected records. Both sweep and explicit-delete paths must acquire the retirement claim,
and legacy chat TTL promotion must not overwrite media lifecycle/retainers. Merely adding references
would not protect an original. Feature enablement requires all active writers/deleters to support
this protocol; older readers may display a compatible File projection, but old deletion workers cannot coexist.

## Standalone-safe settlement

Existing [reserve/renew/release](../../../packages/data-schemas/src/methods/transaction.ts#L477) are useful
but ordinary reservations expire; [createTransaction](../../../packages/data-schemas/src/methods/transaction.ts#L598)
saves a ledger row and then separately updates Balance. Retrying that method cannot guarantee one debit.
Choose the following protocol rather than treating a separate receipt as an atomicity substitute:

1. Persist an immutable `MediaSettlement(settlementKey, effect, fingerprint)`; usage corrections
   create new adjustment identities. Native chat with an existing accounting owner records linkage,
   not another effect. Explicit image/video jobs own their provider charge.
2. Add a bounded `mediaHolds` set to the canonical existing Balance. Acquiring a hold and increasing
   shared `reservedCredits` is one conditional write; repeated hold ID reads/replays the same hold.
   Ordinary reservation pruning never removes these holds. Acquire near dispatch, not for every
   queued idea. `reviewAt` schedules reconciliation, not automatic release of submitted liability.
3. Serialize media settlement effects through one Balance `mediaPendingSettlement` slot and monotonic
   `mediaSettlementSequence`. Slot allocation records settlement ID and the next sequence in one CAS.
   Assign that sequence insert-once to the immutable Settlement before allowing any balance effect.
   An already-assigned older sequence makes a duplicate allocation a no-op, never a second debit.
4. CAS the exact pending ID/sequence/phase and values used for arithmetic: apply credit debit/refund,
   remove/adjust the hold, adjust `reservedCredits`, and stamp `phase=applied` plus exact effect result
   **in that same Balance write**. Lost acknowledgement is resolved from this marker, not by charging again.
5. Idempotently project the applied marker to Settlement, a deterministic Transaction ledger ID and
   the job. Only after durable acknowledgements, clear the pending slot and advance the sequence.
   A stale worker's old sequence cannot reapply. Recovery helps an occupied slot; it never discards it
   on a lease timeout. Permanent ledger errors stop new media effects with an actionable billing state.

After slot cleanup, an old caller may allocate again; immutable sequence assignment makes that new
allocation a no-op. Keep assignment tombstones until all replays are rejected. Balance stays bounded
to active holds plus one outbox slot, rather than an endless receipt array.
Choose the current oldest Balance, then pin its ID on holds/settlements; retries never select another.
Missing Balance means reconciliation, not a new debit. Account deletion must project any applied
pending marker before deleting that row and retain minimal unresolved liability receipts.

Update all spendable-balance reads/admission paths to include media holds. If final usage exceeds the
hold/available funds, record the paid debit and separate outstanding media debt; existing code clamps
`tokenCredits` at zero, so a negative balance alone would lose debt on the next legacy update.
Outstanding debt reduces future admission until collected via another idempotent settlement adjustment.
The ledger projection records actual debit separately from provider cost/debt. Refill/credit writers
must preserve those fields. Media effects are mandatory bookkeeping when balance enforcement is on,
even if optional analytics transaction listing is disabled.

After a configured maximum uncertainty age, move to `requires_attention` with an explicit estimate or
operator resolution policy; never release a hold as proof of no charge. Downtime longer than ordinary
reservation TTL cannot erase `mediaHolds`. Bound holds/settlement backlog and refuse new media work
when reconciliation cannot safely progress. Schema/defaults preserve existing chat behavior when absent.

## Tenant scope, recovery and proof gates

Apply [tenant isolation](../../../packages/data-schemas/src/models/plugins/tenantIsolation.ts) to every model.
System due-work scans return minimal identities; operations run inside `tenantStorage.run(..., async () => ...)`
with stored tenant/owner ([context rules](../../../packages/data-schemas/src/config/tenantContext.ts)) and
explicit owner filters. Use [tenantSafeBulkWrite](../../../packages/data-schemas/src/utils/tenantBulkWrite.ts).
Resolve authorized credential references; never persist request objects or keys.

Before enabling paid execution, run failure-injection tests on real standalone Mongo and a replica
set: crash after every write/provider/storage boundary; lose acknowledgements; race duplicate
submissions, claims, cancellation, settlement, retain/delete and tenant deletion; finish jobs
out of order; restart beyond hold TTL; and prove missing indexes fail closed. Test legacy absence of
new fields, coordinated writer rollout, bounded records and paginated recovery under backlog.

Spike gates: provider recovery/idempotency; storage checksum/private range delivery; native replay;
balance-writer conformance; index/CAS on non-Mongo engines. Ownership, standalone support,
publication authority and delete/settlement linearization above are design decisions.
