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

async function postChatMessage(
  deps: ScheduleEngineDeps,
  schedule: FireableSchedule,
  userId: string,
  scheduledFor: Date,
  files: Awaited<ReturnType<ScheduleEngineDeps['resolveFiles']>>,
): Promise<{ conversationId: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${deps.getSelfUrl()}/api/agents/chat/${EModelEndpoint.agents}`, {
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
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Fire POST failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const payload = (await response.json()) as { conversationId?: string };
    if (!payload.conversationId) {
      throw new Error('Fire POST returned no conversationId');
    }
    return { conversationId: payload.conversationId };
  } finally {
    clearTimeout(timeout);
  }
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
    const baseRun = {
      scheduleId: schedule.id,
      user: schedule.user,
      tenantId: schedule.tenantId,
      scheduledFor,
    };

    if (!(await deps.agentExists(schedule.agent_id, user))) {
      await methods.disableSchedule(schedule.id, 'agent_deleted');
      await advance();
      return { fired: false, skipped: 'agent_deleted' as const };
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

    const run = await methods.insertScheduleRun({
      ...baseRun,
      status: 'started',
      firedAt: new Date(),
    });
    if (run == null) {
      await advance();
      return { fired: false, skipped: 'duplicate' as const };
    }

    const requestedFileIds = schedule.file_ids ?? [];
    const files = requestedFileIds.length ? await deps.resolveFiles(requestedFileIds, user) : [];
    const droppedFileIds = requestedFileIds.filter(
      (id) => !files.some((file) => file.file_id === id),
    );

    try {
      const { conversationId } = await postChatMessage(
        deps,
        schedule,
        user.id,
        scheduledFor,
        files,
      );
      await advance();
      if (droppedFileIds.length > 0) {
        await methods.setRunFireDetails(schedule.id, scheduledFor, {
          conversationId,
          droppedFileIds,
        });
        logger.warn(
          `[schedules] ${schedule.id} fired without ${droppedFileIds.length} missing attachment(s)`,
        );
      } else {
        await methods.setRunFireDetails(schedule.id, scheduledFor, { conversationId });
      }
      return { fired: true, conversationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[schedules] fire failed for ${schedule.id}:`, error);
      await methods.recordRunOutcome({
        scheduleId: schedule.id,
        scheduledFor,
        status: 'error',
        error: message,
        autoDisableAfterFailures: limits.autoDisableAfterFailures,
      });
      await advance();
      return { fired: false, error: message };
    }
  });
}
