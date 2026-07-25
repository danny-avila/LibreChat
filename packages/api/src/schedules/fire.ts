import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { ScheduleEngineDeps, ScheduleLimits, FireResult, FireableSchedule } from './types';
import { computeNextRunAt, cadenceIntervalMinutes } from './cadence';

export const SCHEDULE_FIRE_TOKEN_TTL = '60s';
const FIRE_REQUEST_TIMEOUT_MS = 30_000;
const BALANCE_SKIP_DISABLE_THRESHOLD = 5;

export function buildFireClientRequestId(scheduleId: string, scheduledFor: Date): string {
  return `sched:${scheduleId}:${scheduledFor.toISOString()}`;
}

/**
 * `ambiguous` = the request may already have been accepted and started a billed
 * generation (network error / timeout after send). Those must NOT be recorded as
 * a definite failure. `ambiguous: false` = the server returned an error response,
 * a genuine rejection safe to count.
 */
class ScheduleFireError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
  ) {
    super(message);
  }
}

/** Node/undici error codes for failures that occur BEFORE any request byte is sent
 *  (DNS, connection refused/unreachable, connect timeout). Nothing could have started,
 *  so these are DEFINITE fire failures, not ambiguous mid-flight ones. */
const PRE_CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Extract a Node error `code` from a thrown fetch error or its undici `cause`. */
function fetchErrorCode(error: unknown): string | undefined {
  const read = (value: unknown): string | undefined => {
    if (value != null && typeof value === 'object' && 'code' in value) {
      const code = (value as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  };
  if (error != null && typeof error === 'object') {
    return read((error as { cause?: unknown }).cause) ?? read(error);
  }
  return undefined;
}

/** Whether a thrown fetch error definitely means nothing was sent/started: a
 *  pre-connect failure or a TLS handshake failure (both precede any request bytes). */
function isDefiniteConnectFailure(error: unknown): boolean {
  const code = fetchErrorCode(error);
  if (code == null) {
    return false;
  }
  return PRE_CONNECT_ERROR_CODES.has(code) || code.startsWith('ERR_TLS') || code.includes('CERT');
}

async function postChatMessage(
  deps: ScheduleEngineDeps,
  schedule: FireableSchedule,
  userId: string,
  scheduledFor: Date,
  files: Awaited<ReturnType<ScheduleEngineDeps['resolveFiles']>>,
  conversationId: string,
): Promise<{ conversationId: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRE_REQUEST_TIMEOUT_MS);
  // The timeout must cover the BODY reads below, not just the headers: a server
  // that sends headers then stalls the body would otherwise hang this tick forever
  // (the abort signal is passed to fetch, so firing it aborts an in-flight read).
  try {
    return await postChatMessageInner(deps, schedule, userId, scheduledFor, files, conversationId, {
      controller,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postChatMessageInner(
  deps: ScheduleEngineDeps,
  schedule: FireableSchedule,
  userId: string,
  scheduledFor: Date,
  files: Awaited<ReturnType<ScheduleEngineDeps['resolveFiles']>>,
  conversationId: string,
  { controller }: { controller: AbortController },
): Promise<{ conversationId: string }> {
  let response: Response;
  try {
    response = await fetch(`${deps.getSelfUrl()}/api/agents/chat/${EModelEndpoint.agents}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deps.mintFireToken(userId)}`,
        'x-lc-scheduled': '1',
        // The agents router runs uaParser (rejects non-browser requests as
        // "Illegal request") before the scheduled-fire exemption, and Node/undici
        // fetch sends no User-Agent — so a loopback fire would be rejected before
        // it starts. Present a browser-like UA so uaParser recognizes it.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        text: schedule.prompt,
        endpoint: EModelEndpoint.agents,
        agent_id: schedule.agent_id,
        parentMessageId: Constants.NO_PARENT,
        isContinued: false,
        isRegenerate: false,
        // The agent resolves {{current_date}}/{{current_datetime}} from req.body.timezone;
        // without this it falls back to the server tz, wrong for a schedule whose
        // timezone differs even though the fire lands at the right local wall-clock time.
        timezone: schedule.timezone,
        scheduleId: schedule.id,
        scheduledFor: scheduledFor.toISOString(),
        // A durable, pre-generated new-conversation id (kept isNewConvo so the
        // chat still auto-titles): the run row records it BEFORE the POST, so even
        // if the post-accept detail write fails the reconciler can still locate the
        // conversation's job by this id instead of mislabeling the run an orphan.
        newConversationId: conversationId,
        clientRequestId: buildFireClientRequestId(schedule.id, scheduledFor),
        // The owner-config generation this fire was CLAIMED under. The admission
        // boundary revalidates it before persisting anything, so an owner edit landing
        // in the claim -> persistence window cannot have its old prompt/agent written
        // into the edited schedule's history.
        ...(typeof schedule.configRevision === 'number'
          ? { scheduleConfigRevision: schedule.configRevision }
          : {}),
        ...(files.length > 0 ? { files } : {}),
      }),
    });
  } catch (error) {
    // fetch threw before a response. A PRE-CONNECT failure (bad SCHEDULES_SELF_URL:
    // DNS/connection refused/connect-timeout/TLS) means the request never reached this
    // server, so nothing could have started — a DEFINITE rejection that terminalizes as
    // `error` (countable, can auto-disable the broken schedule). A mid-flight failure
    // (reset after send, request timeout) is genuinely ambiguous: the generation may
    // already be running, so leave the run reconcilable.
    const message = error instanceof Error ? error.message : String(error);
    throw new ScheduleFireError(
      `Fire POST network failure: ${message}`,
      !isDefiniteConnectFailure(error),
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // A received error response is a definite rejection (nothing started).
    throw new ScheduleFireError(
      `Fire POST failed (${response.status}): ${body.slice(0, 300)}`,
      false,
    );
  }
  // The accept path always answers with JSON ({ streamId, conversationId, status }).
  // A 200 whose body is NOT JSON is a pre-controller denial streamed via denyRequest
  // (OPENAI_MODERATION / BAN_VIOLATIONS): a DEFINITE rejection with nothing billed or
  // started, so classify it non-ambiguous — the run terminalizes as `error` and can
  // auto-disable, instead of lingering until the orphan sweep and recording `interrupted`.
  const raw = await response.text().catch(() => '');
  let payload: { conversationId?: string };
  try {
    payload = raw ? (JSON.parse(raw) as { conversationId?: string }) : {};
  } catch {
    throw new ScheduleFireError(`Fire denied before start: ${raw.slice(0, 300)}`, false);
  }
  if (!payload.conversationId) {
    throw new ScheduleFireError('Fire POST returned no conversationId', true);
  }
  return { conversationId: payload.conversationId };
}

/**
 * Fires one claimed occurrence. The caller owns the lease; this function owns
 * the run-doc idempotency insert, the skip checks, the loopback POST, and
 * advancing `nextRunAt` (every path advances so a schedule can never wedge).
 */
export async function fireSchedule(
  deps: ScheduleEngineDeps,
  schedule: FireableSchedule,
  limits: ScheduleLimits,
  scheduledFor: Date,
  options?: { manual?: boolean; dbNow?: Date },
): Promise<FireResult> {
  const { methods } = deps;
  // Compute the NEXT occurrence relative to DB time (the engine passes the claim
  // time derived from leaseUntil), not this worker's clock: a clock-ahead worker
  // would otherwise advance past valid future occurrences. Falls back to the
  // process clock when no DB time is provided (e.g. manual run-now, which never
  // reschedules and so ignores the result anyway).
  const now = options?.dbNow ?? new Date();
  const nextRunAt = computeNextRunAt({
    cadence: schedule.cadence,
    timezone: schedule.timezone,
    scheduleId: schedule.id,
    after: new Date(Math.max(now.getTime(), scheduledFor.getTime())),
  });
  // Every worker-side schedule write is fenced on the claim token so a stale
  // worker (lease expired + re-claimed, or the schedule edited/re-enabled/deleted
  // — all of which rotate the token) cannot clobber the newer authoritative state.
  const claimToken = schedule.claimToken;
  // A manual run-now must never reschedule the next automatic occurrence; it
  // only releases the lease it acquired for serialization.
  const advance = options?.manual
    ? () => methods.releaseLease(schedule.id, claimToken)
    : // Predicate the advance on the claimed occurrence AND the claim token so a
      // concurrent owner edit or a lease-expiry re-claim isn't clobbered.
      () => methods.advanceSchedule(schedule.id, nextRunAt, scheduledFor, claimToken);

  // Rolls back a reserved `started` run row — but ONLY if we still OWN the lease.
  // Fenced on the lease HOLDER (`leaseBy`), not the claim token: a lease takeover by
  // another worker changes `leaseBy` (that worker may have advanced past this
  // occurrence, so deleting the row would erase the only evidence — leave it for the
  // reconciler); an owner edit only rotates the token and keeps `leaseBy`, so this
  // worker still owns the lease and must delete its own unposted reservation (else a
  // ghost `started` row consumes capacity/overlap until the orphan sweep).
  const rollbackReservation = async () => {
    if (schedule.leaseBy != null && (await methods.holdsLease(schedule.id, schedule.leaseBy))) {
      await methods.deleteScheduleRun(schedule.id, scheduledFor, 'started');
      return;
    }
    // The schedule was HARD-deleted out from under this fire (account deletion racing
    // the claim -> reserve window): holdsLease is false because the schedule is GONE,
    // not because the lease was taken over. The reserved row is now an orphan no
    // reconciler will own (its schedule no longer exists), so delete it. Guarded on
    // actual absence so a lease TAKEOVER (schedule still present, different holder)
    // still leaves the row for whoever now holds the lease.
    if (!(await methods.scheduleExists(schedule.id))) {
      await methods.deleteScheduleRun(schedule.id, scheduledFor, 'started');
    }
  };

  if (nextRunAt == null) {
    await methods.disableSchedule(schedule.id, 'invalid_schedule', claimToken);
    await advance();
    return { fired: false, error: 'No next occurrence computable' };
  }

  const user = await deps.getUserContext(schedule.user);
  if (user == null) {
    await methods.disableSchedule(schedule.id, 'permission_revoked', claimToken);
    await advance();
    return { fired: false, skipped: 'user_missing' };
  }

  return deps.runInTenantContext(user, async () => {
    // Re-resolve limits for the OWNER (per-principal role/user + tenant config):
    // a tenant- or role-specific config (disabled schedules, different
    // auto-disable threshold) must win over the base config the engine read.
    const ownerLimits = await deps.getLimits(user);
    if (!ownerLimits.enabled) {
      await advance();
      return { fired: false, skipped: 'disabled' as const };
    }

    // Enforce a raised interval floor at fire time: create/update reject too-frequent
    // cadences, but an admin raising the floor later must also stop an already-enabled
    // schedule that now runs more often than policy allows.
    if (cadenceIntervalMinutes(schedule.cadence) < ownerLimits.minIntervalMinutes) {
      await methods.disableSchedule(schedule.id, 'invalid_schedule', claimToken);
      await advance();
      return { fired: false, skipped: 'disabled' as const };
    }

    // Account-deletion barrier, re-checked at the DISPATCH boundary. Admission (the
    // create/update/run-now handlers) is the primary gate, but there is always a window
    // between admission and persistence, so the owner is re-checked immediately before a
    // billed generation is dispatched. Skips silently: the deletion cascade owns the row.
    if (await deps.isOwnerDeleting(user.id)) {
      await advance();
      return { fired: false, skipped: 'user_deleting' as const };
    }

    // Re-check the owner's live schedule permission: a role that lost
    // SCHEDULES access after the schedule was created must stop firing.
    if (!(await deps.hasScheduleAccess(user))) {
      await methods.disableSchedule(schedule.id, 'permission_revoked', claimToken);
      await advance();
      return { fired: false, skipped: 'permission_revoked' as const };
    }

    const baseRun = {
      scheduleId: schedule.id,
      user: schedule.user,
      tenantId: schedule.tenantId,
      scheduledFor,
    };

    const agentAccess = await deps.agentAccess(schedule.agent_id, user);
    if (agentAccess !== 'ok') {
      // 'missing' → deleted; 'forbidden' → the owner's VIEW access was revoked.
      // Disable immediately instead of letting the loopback chat reject the run
      // and burn attempts toward the failure threshold.
      const reason = agentAccess === 'missing' ? 'agent_deleted' : 'permission_revoked';
      await methods.disableSchedule(schedule.id, reason, claimToken);
      await advance();
      return { fired: false, skipped: reason };
    }

    if (await deps.isOutOfBalance(user)) {
      await methods.recordSkippedRun(
        { ...baseRun, status: 'skipped_balance' },
        BALANCE_SKIP_DISABLE_THRESHOLD,
      );
      await advance();
      return { fired: false, skipped: 'balance' as const };
    }

    // Resolve attachments BEFORE claiming the run row: a transient file-query
    // failure here must not orphan a `started` run that consumes capacity.
    const requestedFileIds = schedule.file_ids ?? [];
    let files: Awaited<ReturnType<ScheduleEngineDeps['resolveFiles']>>;
    try {
      files = requestedFileIds.length ? await deps.resolveFiles(requestedFileIds, user) : [];
    } catch (fileError) {
      logger.error(
        `[schedules] file resolution failed for ${schedule.id} (will retry):`,
        fileError,
      );
      // nextRunAt is untouched so the occurrence retries. Automatic claims keep the
      // lease as a backoff (releasing it would let the nextRunAt-sorted claimer
      // re-pick this failing row every tick and starve others / hammer the file
      // lookup); manual run-now releases so the user can retry immediately.
      if (options?.manual) {
        await methods.releaseLease(schedule.id, claimToken);
      }
      return { fired: false, error: 'File resolution failed' };
    }
    const droppedFileIds = requestedFileIds.filter(
      (id) => !files.some((file) => file.file_id === id),
    );

    // Pre-generate the conversation id and reserve the run row up front. The
    // loopback POST reuses it (streamId === conversationId), so reconciliation can
    // ALWAYS locate this occurrence's job — even if the post-accept detail write
    // fails — instead of mislabeling an accepted (or preserved) run as an orphan.
    // reserveStartedRun is the atomic overlap guard: the single-active partial index
    // rejects a second `started` run for the schedule, so a concurrent occurrence
    // surfaces as 'overlap' with no read-then-insert race.
    const conversationId = randomUUID();
    // The GLOBAL fireConcurrency cap is enforced by claiming a unique capacity slot in
    // the SAME insert that reserves the run, so it is decided by the DB rather than by
    // a count read before the write. The allocator advances to the next free slot when
    // another admission wins one, and reports 'capacity' only when genuinely saturated.
    // Occupancy is read system-scoped so the cap stays global across tenants.
    const allocation = await deps.withGlobalCapacitySlot(
      ownerLimits.fireConcurrency,
      async (capacitySlot) => {
        const attempt = await methods.reserveStartedRun({
          ...baseRun,
          conversationId,
          firedAt: new Date(),
          capacitySlot,
          ...(typeof schedule.configRevision === 'number'
            ? { configRevision: schedule.configRevision }
            : {}),
        });
        return 'conflict' in attempt && attempt.conflict === 'slot-taken'
          ? 'slot-taken'
          : { claimed: attempt };
      },
    );
    if (allocation === 'capacity') {
      // Automatic claims keep the claim's lease as a backoff so the nextRunAt-sorted
      // claimer doesn't immediately re-pick this row and starve others; nextRunAt is
      // untouched, so the occurrence retries once the lease expires. A manual run-now
      // MUST release its lease, or repeated Run-now clicks hit a misleading "already
      // in progress" 409 for the full manual-lease TTL even after capacity frees.
      if (options?.manual) {
        await methods.releaseLease(schedule.id, claimToken);
      }
      return { fired: false, skipped: 'capacity' as const };
    }
    const reservation = allocation.claimed;
    if ('conflict' in reservation) {
      if (reservation.conflict === 'overlap') {
        // Another occurrence of this schedule is already active. Record the skip
        // (its own occurrence row) and advance past this one.
        await methods.recordSkippedRun({ ...baseRun, status: 'skipped_overlap' });
        await advance();
        return { fired: false, skipped: 'overlap' as const };
      }
      await advance();
      return { fired: false, skipped: 'duplicate' as const };
    }

    // Last check before the point of no return: re-verify this fire still holds an
    // authoritative claim (same claim token, lease unexpired, not deleting; and for
    // an automatic fire, still enabled). An owner delete/edit or a lease-expiry
    // re-claim landing AFTER the lease was taken but before here supersedes this
    // fire — roll the reservation back (status-fenced) and skip WITHOUT dispatching
    // a billed generation. Manual run-now still revalidates (a delete/edit can land
    // after acquireManualRunLease); it only relaxes the `enabled` check since the
    // user explicitly triggered it.
    if (
      claimToken != null &&
      !(await methods.revalidateClaim(schedule.id, claimToken, !options?.manual))
    ) {
      await rollbackReservation();
      // This fire is superseded (owner edit/delete). advance() is fenced on the OLD
      // claim token, which the edit rotated, so it no-ops and would leave this
      // worker's lease held until its TTL — reporting the edited schedule / Run now
      // as "already in progress" though no run was dispatched. Release our own lease
      // by holder (leaseBy) so it's immediately re-claimable; a takeover changed
      // leaseBy, so this correctly no-ops there and never strips the new holder's lease.
      if (schedule.leaseBy != null) {
        await methods.releaseLeaseByHolder(schedule.id, schedule.leaseBy);
      }
      await advance();
      return { fired: false, skipped: 'superseded' as const };
    }

    try {
      await postChatMessage(deps, schedule, user.id, scheduledFor, files, conversationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const ambiguous = error instanceof ScheduleFireError && error.ambiguous;
      if (ambiguous) {
        // The request may have been accepted and started a billed generation that
        // will later call recordScheduleOutcome. Leave the run `started` (a
        // reconcilable, non-terminal state) so that completion can finalize it and
        // overlap/capacity keep seeing it; the orphan sweep settles it otherwise.
        // Do NOT terminalize here — `interrupted` would block the real outcome.
        logger.warn(
          `[schedules] fire ambiguously failed for ${schedule.id} (left reconcilable):`,
          error,
        );
        await advance();
        return { fired: false, error: message };
      }
      // Definite rejection (an error response was received): nothing started.
      logger.error(`[schedules] fire rejected for ${schedule.id}:`, error);
      await methods.recordRunOutcome({
        scheduleId: schedule.id,
        scheduledFor,
        status: 'error',
        error: message,
        autoDisableAfterFailures: ownerLimits.autoDisableAfterFailures,
      });
      await advance();
      return { fired: false, error: message };
    }

    // Chat accepted: it will report its own terminal outcome via the completion
    // hook. Post-accept bookkeeping failures must NOT flip the run to `error`
    // (that would block the real completion, which only matches started/paused).
    try {
      await advance();
      await methods.setRunFireDetails(schedule.id, scheduledFor, {
        conversationId,
        ...(droppedFileIds.length > 0 ? { droppedFileIds } : {}),
      });
      if (droppedFileIds.length > 0) {
        logger.warn(
          `[schedules] ${schedule.id} fired without ${droppedFileIds.length} missing attachment(s)`,
        );
      }
    } catch (bookkeepingError) {
      logger.error(
        `[schedules] post-accept bookkeeping failed for ${schedule.id} (run continues):`,
        bookkeepingError,
      );
    }
    return { fired: true, conversationId };
  });
}
