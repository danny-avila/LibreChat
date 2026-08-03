import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { ScheduleEngineDeps, ScheduleLimits, FireResult, FireableSchedule } from './types';
import { computeNextRunAt, cadenceIntervalMinutes } from './cadence';

export const SCHEDULE_FIRE_TOKEN_TTL = '60s';
const FIRE_REQUEST_TIMEOUT_MS = 30_000;
/** Consecutive balance skips (pre-fire or mid-generation) before auto-disable. */
export const BALANCE_SKIP_DISABLE_THRESHOLD: number = 5;

/**
 * Per-occurrence idempotency key for the loopback fire.
 *
 * Constrained to `[A-Za-z0-9:_-]` because the chat route validates
 * `clientRequestId` against exactly that charset (CLIENT_REQUEST_ID_PATTERN in
 * `api/server/controllers/agents/request.js`) — a raw ISO instant carries a `.`
 * in its milliseconds and every fire was rejected with 400
 * INVALID_CLIENT_REQUEST_ID. The instant is kept human-readable in logs with the
 * millisecond separator swapped for `-`; the value is generated here and never
 * parsed back, so the encoding only has to be deterministic per occurrence.
 */
export function buildFireClientRequestId(scheduleId: string, scheduledFor: Date): string {
  return `sched:${scheduleId}:${scheduledFor.toISOString().replace('.', '-')}`;
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
    /** The controller's own pre-start fence refused this fire (the schedule was deleted
     *  or edited between revalidateClaim and the POST landing). Nothing started, and the
     *  controller already recorded the occurrence's outcome — so this is a SKIP, not a
     *  fault, and must not count toward auto-disable. */
    readonly preStartAbort = false,
    /** The server's own message limiter refused the fire before it reached the
     *  controller. Reachable for a manual Run Now, which is deliberately NOT exempt from
     *  the interactive limiters. Nothing started and the schedule is not at fault, so
     *  this must not count toward auto-disable either. */
    readonly throttled = false,
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
  manual: boolean,
): Promise<{ conversationId: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRE_REQUEST_TIMEOUT_MS);
  // The timeout must cover the BODY reads below, not just the headers: a server
  // that sends headers then stalls the body would otherwise hang this tick forever
  // (the abort signal is passed to fetch, so firing it aborts an in-flight read).
  try {
    return await postChatMessageInner(deps, schedule, userId, scheduledFor, files, conversationId, {
      controller,
      manual,
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
  { controller, manual }: { controller: AbortController; manual: boolean },
): Promise<{ conversationId: string }> {
  let response: Response;
  try {
    response = await fetch(`${deps.getSelfUrl()}/api/agents/chat/${EModelEndpoint.agents}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deps.mintFireToken(userId, { manual })}`,
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
    // During shutdown a refused connection is the CLOSING listener, not a broken
    // SCHEDULES_SELF_URL: classify it ambiguous so the row stays reconcilable and
    // no failure is booked against the schedule for a restart.
    throw new ScheduleFireError(
      `Fire POST network failure: ${message}`,
      !isDefiniteConnectFailure(error) || deps.isShuttingDown?.() === true,
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // A received error response is a definite rejection (nothing started). 429 is the
    // exception: the server's OWN message limiter refused the request, which says
    // nothing about the schedule's health. Only a manual Run Now can reach it, since
    // automatic occurrences are exempt.
    throw new ScheduleFireError(
      `Fire POST failed (${response.status}): ${body.slice(0, 300)}`,
      false,
      false,
      response.status === 429,
    );
  }
  // The accept path always answers with JSON ({ streamId, conversationId, status }).
  // A 200 whose body is NOT JSON is a pre-controller denial streamed via denyRequest
  // (OPENAI_MODERATION / BAN_VIOLATIONS): a DEFINITE rejection with nothing billed or
  // started, so classify it non-ambiguous — the run terminalizes as `error` and can
  // auto-disable, instead of lingering until the orphan sweep and recording `interrupted`.
  const raw = await response.text().catch(() => '');
  let payload: { conversationId?: string; status?: string };
  try {
    payload = raw ? (JSON.parse(raw) as { conversationId?: string; status?: string }) : {};
  } catch {
    throw new ScheduleFireError(`Fire denied before start: ${raw.slice(0, 300)}`, false);
  }
  // The controller answers 200 with `status: 'aborted'` when its own pre-start fence
  // rejects the fire (e.g. the schedule was deleted or edited between revalidateClaim
  // and the POST landing). It carries a conversationId, so accepting the body on that
  // alone counted a never-started generation as a successful fire. Nothing was billed
  // and the controller already recorded the outcome, so treat it as a definite refusal.
  if (payload.status === 'aborted') {
    throw new ScheduleFireError('Fire aborted before start by the controller fence', false, true);
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
  // Compute the NEXT occurrence relative to the CLAIM's clock (the engine passes
  // the claim time derived from leaseUntil), keeping the advance self-consistent
  // with the claim that selected this occurrence. Falls back to the process clock
  // when no claim time is provided (e.g. manual run-now, which never reschedules
  // and so ignores the result anyway). Inter-replica skew shifts WHEN an occurrence
  // fires by at most the skew; it can never fire one twice (lease CAS + the unique
  // occurrence index) — see LEASE_SKEW_MARGIN_MS in data-schemas for the takeover
  // margin that protects the only cross-worker clock comparison.
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

  /**
   * Rolls back the `started` row this fire reserved. Fenced on the conversation id it
   * generated rather than on lease ownership: every call site here is a path where
   * NOTHING was dispatched, and the row can only carry this id if this fire inserted
   * it (the single-active partial index admits one). Lease state is the wrong fence —
   * the preflight and capacity allocator can outlast the 5-minute lease, and gating on
   * a takeover left the undispatched row (and its global capacity slot) stranded until
   * the 30-minute orphan sweep while the new holder saw `duplicate` and advanced past
   * the occurrence without firing it.
   */
  const rollbackReservation = (conversationId: string) =>
    methods.deleteScheduleRun(schedule.id, scheduledFor, 'started', conversationId);

  /**
   * Steps aside from a superseded fire (owner edit/delete, or a lease-expiry re-claim).
   * `advance()` is fenced on the OLD claim token, which the edit rotated, so it no-ops
   * and would leave this worker's lease held until its TTL — reporting the edited
   * schedule / Run now as "already in progress" though no run was dispatched. Releasing
   * by HOLDER makes it immediately re-claimable, and correctly no-ops after a takeover
   * (leaseBy changed) so the new holder's lease is never stripped.
   */
  const releaseSupersededLease = async () => {
    if (schedule.leaseBy != null) {
      await methods.releaseLeaseByHolder(schedule.id, schedule.leaseBy);
    }
  };

  /**
   * Steps aside after a failed revalidation WITHOUT advancing. `advance()` here is a
   * designed no-op in every true supersession (takeover, owner edit — both rotate the
   * claim token, so its token-fenced filter misses), which means the only case where it
   * actually LANDS is the one it must not: a PURE lease expiry with no takeover, where
   * the token never rotated. advanceSchedule checks no lease, so the advance moved
   * nextRunAt past an occurrence nothing had fired — a preflight outlasting the lease
   * silently dropped it instead of leaving it due for the next claim to retry.
   * Manual run-now still releases its serialization lease (release-only, no advance)
   * so a repeat click isn't met with a stale "already in progress".
   */
  const stepAsideSuperseded = async () => {
    await releaseSupersededLease();
    if (options?.manual) {
      await methods.releaseLease(schedule.id, claimToken);
    }
    return { fired: false, skipped: 'superseded' as const };
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

    // The owner-config generation this occurrence was CLAIMED under, stamped onto every
    // run row (fired or skipped) so bookkeeping can derive its fence from the row.
    const claimedRevision =
      typeof schedule.configRevision === 'number'
        ? { configRevision: schedule.configRevision }
        : {};

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
      // Revalidate BEFORE writing the skip. Everything above (user, config, permission
      // and balance lookups) can outlast the 5-minute lease, and a skip is not a no-op:
      // it stamps the card and walks the balance-skip streak toward auto-disable. Under
      // a dead claim — lease taken over, schedule deleted, account deletion begun — that
      // is a write on behalf of a fire that no longer owns this occurrence. The reserve
      // path below has its own revalidation for the same reason; this one guards the
      // branch that returns before ever reaching it.
      if (
        claimToken != null &&
        !(await methods.revalidateClaim(schedule.id, claimToken, !options?.manual))
      ) {
        return stepAsideSuperseded();
      }
      // Skip rows carry no `bookkept:false` marker, so the reconciler has no path to
      // repair a half-applied skip. If the schedule-side bookkeeping throws, do NOT
      // advance: leave the occurrence due so the next claim retries it (the insert is
      // duplicate-guarded and the same-skip retry path is idempotent).
      try {
        await methods.recordSkippedRun(
          { ...baseRun, status: 'skipped_balance', ...claimedRevision },
          BALANCE_SKIP_DISABLE_THRESHOLD,
        );
      } catch (skipError) {
        logger.error(`[schedules] balance-skip bookkeeping failed for ${schedule.id}:`, skipError);
        return { fired: false, skipped: 'balance' as const };
      }
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

    // Revalidate BEFORE reserving, not only before the POST below. The preflight above
    // (user, config, permission, balance, attachment queries) can outlast the 5-minute
    // lease, and a stale worker that reserves anyway wins the occurrence's unique row:
    // the fresh claimer then sees `duplicate` and advances without firing, while this
    // worker's own revalidation fails and rollbackReservation deliberately RETAINS the
    // row (the lease takeover changed leaseBy). The occurrence is lost and its global
    // capacity slot stays held until the 30-minute orphan sweep. Nothing is reserved yet
    // here, so a superseded fire simply steps aside.
    if (
      claimToken != null &&
      !(await methods.revalidateClaim(schedule.id, claimToken, !options?.manual))
    ) {
      return stepAsideSuperseded();
    }

    // SHUTDOWN gate at the dispatch boundary: the coordinator closes the listener
    // BEFORE the engine's pre-drain task runs, so a pass already past its preflight
    // would POST at a refusing socket — a definite connect failure that terminalizes
    // as `error` and walks a healthy schedule toward auto-disable for nothing more
    // than a restart. Nothing is reserved yet, so stepping aside leaves the
    // occurrence due for the restarted process (within the misfire grace).
    if (deps.isShuttingDown?.() === true) {
      logger.info(`[schedules] shutdown in progress; releasing claim on ${schedule.id}`);
      return stepAsideSuperseded();
    }

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
    // CLAMPED to the deployment-wide cap. The slots are global across every owner, so a
    // role/user/tenant override must never be able to WIDEN them: manual Run Now resolves
    // the owner's limits and bypasses the engine tick's base-config budget entirely, so
    // an override of 5 against a base of 1 would otherwise let concurrent clicks occupy
    // slots 0-4 and run five billed generations at once. Re-read without a principal for
    // the base value (the same read the tick budgets from); a STRICTER owner value still
    // applies, since only widening is the defect.
    const deploymentLimits = await deps.getLimits();
    const allocation = await deps.withGlobalCapacitySlot(
      Math.min(ownerLimits.fireConcurrency, deploymentLimits.fireConcurrency),
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
        try {
          await methods.recordSkippedRun({
            ...baseRun,
            status: 'skipped_overlap',
            ...claimedRevision,
          });
        } catch (skipError) {
          // Same reasoning as the balance skip: no reconciliation path repairs a
          // half-applied skip, so leave the occurrence due rather than advancing past it.
          logger.error(
            `[schedules] overlap-skip bookkeeping failed for ${schedule.id}:`,
            skipError,
          );
          return { fired: false, skipped: 'overlap' as const };
        }
        await advance();
        return { fired: false, skipped: 'overlap' as const };
      }
      // A duplicate means another fire already holds this occurrence's row — but
      // "still running it" and "already finished with it" need OPPOSITE handling.
      //
      // TERMINAL: the occurrence is done and merely never advanced past (its fire was
      // accepted but the post-accept advance failed). nextRunAt still points here, so
      // refusing to advance makes every future claim re-pick the same settled
      // occurrence — a permanent stall. Advance past it.
      //
      // ACTIVE: another worker owns it. Advancing hands the occurrence away — if that
      // worker is a stale lease holder whose own revalidation then fails, it rolls its
      // undispatched row back and nothing ever fires this occurrence. Leave nextRunAt
      // alone so it stays claimable; whichever worker actually dispatches is the one
      // that advances, and the claim's lease is the retry backoff (the same shape as
      // `capacity` above). A crashed holder's row is cleared by the orphan sweep, after
      // which the occurrence reserves cleanly.
      const settledAlready =
        reservation.existingStatus != null &&
        reservation.existingStatus !== 'started' &&
        reservation.existingStatus !== 'requires_action';
      if (settledAlready) {
        await advance();
        return { fired: false, skipped: 'duplicate' as const };
      }
      // Manual run-now still releases its lease so repeated clicks aren't met with a
      // stale "already in progress".
      if (options?.manual) {
        await methods.releaseLease(schedule.id, claimToken);
      }
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
      await rollbackReservation(conversationId);
      return stepAsideSuperseded();
    }

    // SHUTDOWN recheck immediately before dispatch: the gate before the reservation
    // is not the last dispatch-boundary operation — the deployment-limit read,
    // capacity allocation, and claim revalidation all run after it and can overlap
    // SIGTERM, leaving the listener closing by the time the POST goes out. Roll the
    // reservation back (status-fenced) and step aside without advancing: the
    // occurrence stays due for the restarted process within the misfire grace.
    if (deps.isShuttingDown?.() === true) {
      logger.info(
        `[schedules] shutdown in progress; rolling back reserved dispatch of ${schedule.id}`,
      );
      await rollbackReservation(conversationId);
      return stepAsideSuperseded();
    }

    try {
      await postChatMessage(
        deps,
        schedule,
        user.id,
        scheduledFor,
        files,
        conversationId,
        options?.manual === true,
      );
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
      if (error instanceof ScheduleFireError && error.preStartAbort) {
        // The controller refused this fire at its own liveness/revision fence and has
        // already recorded the occurrence's outcome. Recording `error` here would count
        // a delete/edit as a schedule FAULT and walk it toward auto-disable.
        // Release OUR lease explicitly: the fence tripping on an owner EDIT rotated the
        // claim token, so the token-fenced advance() below no-ops — but the edit never
        // touched the lease fields, and leaving them held blocks Run Now and the next
        // claim of the recomputed occurrence for the full 5-minute TTL.
        logger.info(`[schedules] fire aborted pre-start for ${schedule.id} (superseded)`);
        await releaseSupersededLease();
        await advance();
        return { fired: false, skipped: 'superseded' as const };
      }
      if (error instanceof ScheduleFireError && error.throttled) {
        // The server's own message limiter refused this before it reached the
        // controller, so nothing was billed and the SCHEDULE is not at fault. Counting
        // it as a failure would let an owner who is merely over their message quota
        // auto-disable a perfectly healthy schedule by clicking Run Now enough times.
        // Unlike the controller fence above, nothing recorded an outcome for this
        // occurrence, so the reservation has to be rolled back or it holds its capacity
        // slot and blocks overlap until the orphan sweep.
        logger.info(`[schedules] fire refused by the message limiter for ${schedule.id}`);
        await rollbackReservation(conversationId);
        await advance();
        return { fired: false, skipped: 'rate_limited' as const };
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
