import type { AgentTriggerDeliveryMethods } from '@librechat/data-schemas';
import type { EventActorInterrupt } from '@librechat/agents';
import type { EventActorDetachedActionLifecycle } from '../handlers';
import type { AgentTriggerExpectedAction } from './envelope';
import { matchesExpectedAction } from './outcome';

const MAX_TERMINAL_RESULT_LENGTH = 32_768;
export const EVENT_ACTOR_DETACHED_COMPLETION_TYPE = 'librechat.event_actor.detached_completion';
export const EVENT_ACTOR_DETACHED_COMPLETION_SOURCE = 'librechat-event-actor';

export interface AgentEventActorDetachedCompletionProjection {
  version: 1;
  invocationId: string;
  generationCreatedAt: number;
  taskId: string;
  idempotencyKey: string;
}

export function parseAgentEventActorDetachedCompletion(
  value: unknown,
): AgentEventActorDetachedCompletionProjection | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  if (
    input.version !== 1 ||
    typeof input.invocationId !== 'string' ||
    input.invocationId.length === 0 ||
    input.invocationId.length > 128 ||
    !Number.isSafeInteger(input.generationCreatedAt) ||
    (input.generationCreatedAt as number) < 0 ||
    typeof input.taskId !== 'string' ||
    input.taskId.length === 0 ||
    input.taskId.length > 128 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.idempotencyKey)
  ) {
    return undefined;
  }
  return {
    version: 1,
    invocationId: input.invocationId,
    generationCreatedAt: input.generationCreatedAt as number,
    taskId: input.taskId,
    idempotencyKey: input.idempotencyKey,
  };
}

interface DetachedActionOwner {
  user: string;
  tenantId?: string;
  bindingId: string;
  conversationId: string;
  generationCreatedAt: number;
  invocationId: string;
  expectedAction: AgentTriggerExpectedAction;
}

interface DetachedActionDependencies {
  reserveAgentEventActorDetachedAction: AgentTriggerDeliveryMethods['reserveAgentEventActorDetachedAction'];
  markAgentEventActorDetachedActionRunning: AgentTriggerDeliveryMethods['markAgentEventActorDetachedActionRunning'];
  settleAgentEventActorDetachedAction: AgentTriggerDeliveryMethods['settleAgentEventActorDetachedAction'];
  onTerminal(input: { taskId: string; idempotencyKey: string }): Promise<void>;
  now?(): Date;
}

export interface AgentEventActorInternalSuspension {
  kind: 'internal_completion';
  actionId: string;
  jobCreatedAt: number;
  interrupt: EventActorInterrupt;
}

export interface AgentEventActorDetachedActionLifecycle extends EventActorDetachedActionLifecycle {
  readSuspension(): AgentEventActorInternalSuspension | undefined;
}

function serializeTerminalResult(value: unknown): string {
  let serialized: string;
  if (typeof value === 'string') {
    serialized = value;
  } else {
    try {
      serialized = JSON.stringify(value) ?? String(value);
    } catch {
      serialized = String(value);
    }
  }
  return serialized.slice(0, MAX_TERMINAL_RESULT_LENGTH);
}

/**
 * Binds the generic background executor to one delivery-owned expected action.
 * The delivery row remains authoritative; request-local state only lets the
 * actor adapter discover the exact launch that this segment already persisted.
 */
export function createAgentEventActorDetachedActionLifecycle(
  owner: DetachedActionOwner,
  deps: DetachedActionDependencies,
): AgentEventActorDetachedActionLifecycle {
  const now = deps.now ?? (() => new Date());
  let current: { taskId: string; idempotencyKey: string; launchAcknowledged: boolean } | undefined;
  const scope = {
    deliveryKey: owner.invocationId,
    user: owner.user,
    ...(owner.tenantId == null ? {} : { tenantId: owner.tenantId }),
    bindingId: owner.bindingId,
    conversationId: owner.conversationId,
    generationCreatedAt: owner.generationCreatedAt,
  };
  const matchesCurrent = (input: { taskId: string; idempotencyKey: string }): boolean =>
    current?.taskId === input.taskId && current.idempotencyKey === input.idempotencyKey;

  return {
    async reserve(input) {
      if (
        !matchesExpectedAction(
          {
            toolName: input.toolName,
            toolCallId: input.toolCallId,
            arguments: input.arguments,
          },
          owner.expectedAction,
        )
      ) {
        return { status: 'ignored' };
      }
      const reservation = await deps.reserveAgentEventActorDetachedAction({
        ...scope,
        invocationId: owner.invocationId,
        expectedToolName: owner.expectedAction.toolName,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        reservedAt: now(),
      });
      if (reservation.status === 'conflict') {
        return {
          status: 'conflict',
          error: 'A different detached action already owns this Event Actor invocation',
        };
      }
      if (
        reservation.status === 'replay' &&
        ['succeeded', 'failed', 'cancelled'].includes(reservation.action.status)
      ) {
        return {
          status: 'terminal',
          taskId: reservation.action.taskId,
          idempotencyKey: reservation.action.idempotencyKey,
          outcome: reservation.action.status as 'succeeded' | 'failed' | 'cancelled',
          ...(reservation.action.result == null ? {} : { result: reservation.action.result }),
          ...(reservation.action.error == null ? {} : { error: reservation.action.error }),
        };
      }
      current = {
        taskId: reservation.action.taskId,
        idempotencyKey: reservation.action.idempotencyKey,
        launchAcknowledged: reservation.action.status !== 'reserved',
      };
      return {
        status: reservation.status,
        taskId: current.taskId,
        idempotencyKey: current.idempotencyKey,
      };
    },
    async markRunning(input) {
      if (!matchesCurrent(input)) {
        return false;
      }
      const marked = await deps.markAgentEventActorDetachedActionRunning({
        ...scope,
        ...input,
        observedAt: now(),
      });
      if (marked && current != null) {
        current.launchAcknowledged = true;
      }
      return marked;
    },
    async settle(input) {
      if (!matchesCurrent(input)) {
        return false;
      }
      return deps.settleAgentEventActorDetachedAction({
        ...scope,
        taskId: input.taskId,
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        ...(input.status === 'succeeded'
          ? { result: serializeTerminalResult(input.result) }
          : { error: String(input.error ?? 'Detached action failed').slice(0, 2_048) }),
        observedAt: now(),
      });
    },
    async wake(input) {
      if (matchesCurrent(input)) {
        await deps.onTerminal(input);
      }
    },
    readSuspension() {
      if (current?.launchAcknowledged !== true) {
        return undefined;
      }
      return {
        kind: 'internal_completion',
        actionId: current.taskId,
        jobCreatedAt: owner.generationCreatedAt,
        interrupt: {
          id: current.taskId,
          payload: {
            type: 'event_actor_detached_action',
            taskId: current.taskId,
            idempotencyKey: current.idempotencyKey,
          },
        },
      };
    },
  };
}
