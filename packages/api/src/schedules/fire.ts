import { logger } from '@librechat/data-schemas';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { ScheduleEngineDeps, ScheduleLimits, FireResult, FireableSchedule } from './types';
import { computeNextRunAt } from './cadence';

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

async function postChatMessage(
  deps: ScheduleEngineDeps,
  schedule: FireableSchedule,
  userId: string,
  scheduledFor: Date,
  files: Awaited<ReturnType<ScheduleEngineDeps['resolveFiles']>>,
): Promise<{ conversationId: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${deps.getSelfUrl()}/api/agents/chat/${EModelEndpoint.agents}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deps.mintFireToken(userId)}`,
        'x-lc-scheduled': '1',
      },
      body: JSON.stringify({
        text: schedule.prompt,
        endpoint: EModelEndpoint.agents,
        agent_id: schedule.agent_id,
        parentMessageId: Constants.NO_PARENT,
        isContinued: false,
        isRegenerate: false,
        scheduleId: schedule.id,
        scheduledFor: scheduledFor.toISOString(),
        clientRequestId: buildFireClientRequestId(schedule.id, scheduledFor),
        ...(files.length > 0 ? { files } : {}),
      }),
    });
  } catch (error) {
    // fetch threw: no response was received. The request may or may not have
    // been processed — ambiguous, so don't terminalize as a definite error.
    const message = error instanceof Error ? error.message : String(error);
    throw new ScheduleFireError(`Fire POST network failure: ${message}`, true);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // A received error response is a definite rejection (nothing started).
    throw new ScheduleFireError(
      `Fire POST failed (${response.status}): ${body.slice(0, 300)}`,
      false,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as { conversationId?: string };
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
  options?: { manual?: boolean },
): Promise<FireResult> {
  const { methods } = deps;
  const nextRunAt = computeNextRunAt({
    cadence: schedule.cadence,
    timezone: schedule.timezone,
    scheduleId: schedule.id,
    after: new Date(Math.max(Date.now(), scheduledFor.getTime())),
  });
  // A manual run-now must never reschedule the next automatic occurrence; it
  // only releases the lease it acquired for serialization.
  const advance = options?.manual
    ? () => methods.releaseLease(schedule.id)
    : () => methods.advanceSchedule(schedule.id, nextRunAt);

  if (nextRunAt == null) {
    await methods.disableSchedule(schedule.id, 'invalid_schedule');
    await advance();
    return { fired: false, error: 'No next occurrence computable' };
  }

  const user = await deps.getUserContext(schedule.user);
  if (user == null) {
    await methods.disableSchedule(schedule.id, 'permission_revoked');
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

    // Re-check the owner's live schedule permission: a role that lost
    // SCHEDULES access after the schedule was created must stop firing.
    if (!(await deps.hasScheduleAccess(user))) {
      await methods.disableSchedule(schedule.id, 'permission_revoked');
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
      await methods.disableSchedule(schedule.id, reason);
      await advance();
      return { fired: false, skipped: reason };
    }

    if (await methods.hasActiveRun(schedule.id)) {
      await methods.recordSkippedRun({ ...baseRun, status: 'skipped_overlap' });
      await advance();
      return { fired: false, skipped: 'overlap' as const };
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
      // Leave nextRunAt/lease so the next tick retries; no run row was created.
      await methods.releaseLease(schedule.id);
      return { fired: false, error: 'File resolution failed' };
    }
    const droppedFileIds = requestedFileIds.filter(
      (id) => !files.some((file) => file.file_id === id),
    );

    const run = await methods.insertScheduleRun({
      ...baseRun,
      status: 'started',
      firedAt: new Date(),
    });
    if (run == null) {
      await advance();
      return { fired: false, skipped: 'duplicate' as const };
    }

    // Reserve-then-verify capacity: the insert above is the atomic reservation.
    // The count is GLOBAL (system tenant) — under the owner's tenant context it
    // would only see this tenant's runs and multiple tenants could collectively
    // exceed the cap. Roll back and retry next tick if over. Never over-admits.
    const active = await deps.countActiveRunsGlobal();
    if (active > limits.fireConcurrency) {
      await methods.deleteScheduleRun(schedule.id, scheduledFor);
      await methods.releaseLease(schedule.id);
      return { fired: false, skipped: 'capacity' as const };
    }

    let conversationId: string;
    try {
      ({ conversationId } = await postChatMessage(deps, schedule, user.id, scheduledFor, files));
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
