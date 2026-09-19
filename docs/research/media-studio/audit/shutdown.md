# Worker shutdown audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`. This review exercises the actual built worker and compares its lifecycle with the existing application shutdown coordinator. No production code changed.

## S1 · P1 · A provider submission can start after worker shutdown has completed

The worker checks `stopped` before entering a scope, then awaits publication recovery and a database claim. It does not check again after those awaits. Meanwhile, `stop()` snapshots only the currently active execution promises. An outstanding scan/claim is absent from that snapshot, so shutdown can return before the claim completes. The scan subsequently starts a new execution with a new, un-aborted controller.

Sources: [pre-claim stop check](../../../../packages/api/src/media/worker.ts#L632), [awaited claim and unconditional execution](../../../../packages/api/src/media/worker.ts#L644), [snapshot and abort in stop](../../../../packages/api/src/media/worker.ts#L691), [application registration](../../../../api/server/index.js#L259), and [existing shutdown phases](../../../../packages/api/src/app/shutdown.ts#L78).

The retained [probe](probes/shutdown.cjs) runs the real `createMediaWorker` with a deliberately delayed repository claim and a synthetic adapter. It waits until the claim starts, awaits `stop()`, verifies the worker reports unavailable, and only then completes the claim. It separately exercises an already-running job and a queued job, including the queued job's permission check, preparation, credit-admission boundary, and submission transition.

| Job at claim | Provider operations beginning after `stop()` returned | Signal aborted |
| --- | ---: | --- |
| Running | 1 poll | false |
| Queued | 1 new submission | false |

Both scenarios complete without worker errors. No real provider requests or database writes occur in this probe; substituted boundaries isolate the scheduling race rather than model database semantics. A process that keeps running after the premature return can start paid work during shutdown. If process exit or database closure wins instead, that execution may be interrupted across its durable submission boundary and require reconciliation. The probe establishes the late operation; it does not claim a duplicate provider charge or lost funds in every shutdown.

Retain and await the scan promise as part of shutdown, recheck admission after awaited recovery/claim operations, and prevent new executions once stopping begins. Release or safely leave the claimed lease according to the repository protocol. Drain admitted executions within the host's remaining shutdown budget, then abort and await their cancellation cleanup. Reuse the existing pre-drain/post-drain coordinator; avoid adding an independent process signal handler. Test shutdown during recovery, claim, preparation, provider submission, and ingestion, including timeout and idempotent repeated stops.

```powershell
node docs/research/media-studio/audit/probes/shutdown.cjs
```

Result: exit 0; both scenarios reproduce one provider operation after stop. A successful diagnostic run means the defect was reproduced in the audited branch. It is not a regression test expecting the corrected invariant.

## Deployment assumptions checked

The branch's implementation documentation already calls for a coordinated writer upgrade before enabling media. Older File/Balance writers lack media retainer/hold protections. That is a real rollout constraint to preserve and test, not evidence that a supported current-version rollout silently promises compatibility. No mixed-version destructive probe was needed to reclassify this documented restriction as a new defect.

The current-version accounting race is independently reproduced in [accounting.md](accounting.md). It must be fixed even when every process runs the new version. The deployed SDK artifact mismatch and patch cache invalidation are separate findings in the [first audit](../integration-audit.md).
