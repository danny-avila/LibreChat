# Scheduled chats: deferred scope

v1 ships an **autonomous, single-process** scheduler, experimental and default-off
(`interface.schedules`). Two capabilities were deliberately cut to get a correct core;
both were fully built and are recoverable from git history rather than greenfield.

## Why they were cut

Both existed to reconcile **two independent durable state machines** — `GenerationJob`
(`running → requires_action → running → terminal`) and `ScheduleRun` (`started →
requires_action → started → terminal`). Every lifecycle event had to project onto both
with the right fence token, and the token lived on the row while the producer lived in
the controller. That impedance mismatch, not any single bug, is what kept generating
drift: three review rounds, and the worst finding in each was resume-related.

## 1. HITL resume of scheduled runs

**v1 behavior:** a scheduled run that pauses for approval frees its capacity slot and is
handed off. It becomes an ordinary paused conversation the user resumes in the chat UI;
the scheduler observes the outcome but does not reserve, lease, or fence the resume.
Abandoned pauses are reaped by the reconciler.

**What the fast-follow restores** (see `c188a0f92` for the exact removal):

- `resumeSeq` epoch + the pause CAS
- the durable resume lease: `acquireResumeLease` / `markResumeClaimed` /
  `commitResumeLease` / `releaseResumeLease`, with `resumeHolder` / `resumeExpiresAt` /
  `resumeClaimedAt` / `resumeAdopted`
- adopt-vs-promote discrimination (a committed run must never be demoted by a late
  duplicate attempt)
- the lease-recovery reconciler branch (post-claim rolls forward, pre-claim rolls back)
- the resume-side capacity reservation

**Build it differently this time:**

1. Apply the single-seam pattern from `6c2f4c1d9` FIRST. Derive the pause epoch inside
   `recordRunOutcome` from the row, exactly as the config fence now is. Do not add
   `expectResumeSeq` back as a caller-supplied parameter — that is what went inert.
2. Integration-test through real entry points (initial pause vs fast resume; duplicate
   submit after commit; approval-claim failure; crash mid-reconstruction). Leaf tests
   that hand-supply tokens pass for a broken system.
3. Watch the epoch-0 trap: a never-resumed row has NO `resumeSeq`, and Mongo equality on
   `0` does not match a missing field (`$in: [0, null]`).

## 2. Clustered / multi-worker scheduling

**v1 behavior:** single-process only. `experimental.js` does not arm the engine and
refuses schedule writes with `501 SCHEDULES_NOT_SUPPORTED` (reads stay open).

**What the fast-follow restores** (see `f1c3f1d06`):

- `isJobStoreShared` and the `clustered` plumbing
- cross-worker abort delivery for delete / account-deletion quiescing
- the `jobStoreShared` gates around orphan and abandoned-pause reaping

**Prerequisite:** a *confirmed* shared stream store, not an assumed one. `USE_REDIS`
is the wrong signal; the check must be the live `GenerationJobManager.isRedis` read
AFTER `configureGenerationStreams` (a Redis config can fall back to in-memory).

**Note:** the shared stream-service initialization (`86255b8c7`) was KEPT in v1. It fixed
a real bug — clustered workers never configured their stream services at all — and is
correct independent of scheduling.

## Account deletion: deferred completion

If the quiesce drain cannot be CONFIRMED, `deleteUserController` responds 202 and leaves
the deletion barrier up instead of destroying data a still-live generation might rewrite.

This leaves **no scheduler debt** — quiesce marks every one of the user's schedules
`deleting`, and the reconciler already erases those and their runs once drained. Only the
account document remains, with `deletionRequestedAt` set, so nothing new can be
scheduled. `markUserDeleting` is idempotent, so re-issuing DELETE completes the cascade.

A platform-level worker that automatically finishes such accounts (query:
`getUsersPendingDeletion`) is out of scope for the scheduler and left to follow-up.

## Also deferred (tracked separately)

- Client active-job discovery. There is no per-schedule run-status surface today, and
  `ScheduleCard`'s `STATUS_CHIPS.started` is dead code: `lastRun` is only written on
  terminal/pause/skip, so its status can never be `started`.
- `minIntervalMinutes` in the wire type + dialog gating; the server enforces a floor the
  client neither surfaces nor explains.
