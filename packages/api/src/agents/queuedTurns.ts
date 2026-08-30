import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  AGENT_TRIGGER_WORKER_CAPABILITY_QUEUED_TURN_V1,
  logger,
  runAsSystem,
} from '@librechat/data-schemas';
import type {
  AgentQueuedTurnClaim,
  AgentQueuedTurnMethods,
  AgentQueuedTurnRecord,
  ConversationMethods,
  IMessage,
  MessageMethods,
} from '@librechat/data-schemas';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import type { AgentTriggerEnqueueOptions } from './triggers/delivery';
import type { AgentTriggerExecutionHostDeps } from './triggers/host';
import { createAgentTriggerEnvelope } from './triggers/envelope';
import { AgentTriggerExecutionError } from './triggers/host';

export const AGENT_QUEUED_TURN_SOURCE = 'agent-queued-turn';
const AGENT_QUEUED_TURN_EVENT = 'agent.queued-turn';
const MESSAGE_SELECT = 'messageId parentMessageId isCreatedByUser createdAt';
const CLAIM_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RECOVERY_INTERVAL_MS = 30_000;
const DEFAULT_RECOVERY_LIMIT = 100;

interface GenerationState {
  status?: unknown;
  metadata?: {
    idempotencyClientRequestId?: unknown;
    terminalPersistencePending?: unknown;
  };
}

type QueuedTurnResolverMethods = AgentQueuedTurnMethods &
  Pick<ConversationMethods, 'getConvo'> &
  Pick<MessageMethods, 'getMessages'>;

export interface AgentQueuedTurnResolverDeps {
  methods: QueuedTurnResolverMethods;
  getGenerationJob: (conversationId: string) => Promise<GenerationState | null>;
  now?: () => number;
  claimBy?: string;
}

export type EnqueueAgentQueuedTurnDelivery = (
  envelope: unknown,
  options?: AgentTriggerEnqueueOptions,
) => Promise<{ deliveryKey: string }>;

export interface AgentQueuedTurnSchedulerDeps {
  methods: AgentQueuedTurnMethods;
  enqueue: EnqueueAgentQueuedTurnDelivery;
  recoveryIntervalMs?: number;
  recoveryLimit?: number;
}

export interface AgentQueuedTurnScheduler {
  initialize: () => Promise<void>;
  stop: () => Promise<void>;
  schedule: (turn: AgentQueuedTurnRecord) => Promise<string>;
  recover: () => Promise<number>;
}

function executionError(
  message: string,
  options: {
    code: string;
    retryable: boolean;
    deferWithoutAttempt?: boolean;
    status?: number;
    retryAfter?: string;
  },
): AgentTriggerExecutionError {
  return new AgentTriggerExecutionError(message, {
    mode: 'continue',
    certainty: 'definite',
    ...options,
  });
}

function isGenerationActive(job: GenerationState | null): boolean {
  return (
    job?.status === 'running' ||
    job?.status === 'requires_action' ||
    job?.metadata?.terminalPersistencePending === true
  );
}

function sameTenant(actual: unknown, expected: string | undefined): boolean {
  return expected == null ? actual == null : actual === expected;
}

function timestamp(message: IMessage): number {
  const value = message.createdAt;
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return parsed != null && Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

/** Finds the current assistant leaf on the exact visible branch captured when
 * the turn was queued. Unrelated branch activity can never retarget the turn. */
function latestAssistantDescendant(messages: IMessage[], anchorId: string): string | undefined {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  if (!byId.has(anchorId)) {
    return;
  }
  const memo = new Map<string, boolean>([[anchorId, true]]);
  const reachesAnchor = (message: IMessage, visiting = new Set<string>()): boolean => {
    const known = memo.get(message.messageId);
    if (known != null) {
      return known;
    }
    if (visiting.has(message.messageId)) {
      memo.set(message.messageId, false);
      return false;
    }
    visiting.add(message.messageId);
    const parent =
      typeof message.parentMessageId === 'string' ? byId.get(message.parentMessageId) : undefined;
    const reachable = parent != null && reachesAnchor(parent, visiting);
    visiting.delete(message.messageId);
    memo.set(message.messageId, reachable);
    return reachable;
  };
  const descendants = messages
    .filter((message) => message.isCreatedByUser === false && reachesAnchor(message))
    .sort((left, right) => {
      const time = timestamp(left) - timestamp(right);
      return time === 0 ? left.messageId.localeCompare(right.messageId) : time;
    });
  return descendants[descendants.length - 1]?.messageId;
}

function payloadQueuedTurnId(envelope: AgentContinueTriggerEnvelope): string | null | undefined {
  if (
    envelope.event.source.type !== 'internal' ||
    envelope.event.source.id !== AGENT_QUEUED_TURN_SOURCE
  ) {
    return;
  }
  const payload = envelope.event.payload;
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).queuedTurnId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function releaseClaim(
  methods: AgentQueuedTurnMethods,
  envelope: AgentContinueTriggerEnvelope,
  claim: AgentQueuedTurnClaim,
): Promise<unknown> {
  return methods.releaseAgentQueuedTurn({
    user: claim.user,
    ...(claim.tenantId != null && { tenantId: claim.tenantId }),
    conversationId: envelope.target.conversationId,
    queuedTurnId: claim.queuedTurnId,
    claimId: claim.claimId,
    claimBy: claim.claimBy,
    disposition: 'retry',
    availableAt: new Date(),
  });
}

function deadClaim(
  methods: AgentQueuedTurnMethods,
  envelope: AgentContinueTriggerEnvelope,
  claim: AgentQueuedTurnClaim,
  code: string,
  message: string,
): Promise<unknown> {
  return methods.releaseAgentQueuedTurn({
    user: claim.user,
    ...(claim.tenantId != null && { tenantId: claim.tenantId }),
    conversationId: envelope.target.conversationId,
    queuedTurnId: claim.queuedTurnId,
    claimId: claim.claimId,
    claimBy: claim.claimBy,
    disposition: 'dead',
    settledAt: new Date(),
    failure: { code, message },
  });
}

/** Resolves one queued message into a fresh ordinary Agent turn. The durable
 * claim remains owned by the queue record until generation admission is known. */
export function createAgentQueuedTurnResolver({
  methods,
  getGenerationJob,
  now = Date.now,
  claimBy = `agent-queued-turn:${process.pid}`,
}: AgentQueuedTurnResolverDeps): NonNullable<AgentTriggerExecutionHostDeps['prepareContinue']> {
  return async (envelope, context) => {
    const queuedTurnId = payloadQueuedTurnId(envelope);
    if (queuedTurnId === undefined) {
      return;
    }
    if (queuedTurnId === null) {
      throw executionError('The queued turn payload is invalid.', {
        code: 'INVALID_QUEUED_TURN',
        retryable: false,
      });
    }

    let generation: GenerationState | null;
    try {
      generation = await getGenerationJob(envelope.target.conversationId);
    } catch (error) {
      throw executionError(
        `Parent generation state is temporarily unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { code: 'PARENT_STATE_UNAVAILABLE', retryable: true },
      );
    }
    if (
      isGenerationActive(generation) &&
      generation?.metadata?.idempotencyClientRequestId !== context.idempotencyKey
    ) {
      throw executionError('The preceding generation has not settled yet.', {
        code: 'PARENT_NOT_READY',
        retryable: true,
        status: 409,
        retryAfter: '1',
        deferWithoutAttempt: true,
      });
    }

    const userId = envelope.principal.userId;
    const conversation = await methods.getConvo(userId, envelope.target.conversationId);
    if (
      conversation == null ||
      !sameTenant(conversation.tenantId, envelope.principal.tenantId) ||
      conversation.agent_id !== envelope.target.agentId
    ) {
      throw executionError('The queued turn conversation is no longer available.', {
        code: 'PARENT_NOT_FOUND',
        retryable: false,
        status: 404,
      });
    }

    const claimNow = new Date(now());
    const claimed = await methods.claimNextAgentQueuedTurn({
      user: new Types.ObjectId(userId),
      ...(envelope.principal.tenantId != null && {
        tenantId: envelope.principal.tenantId,
      }),
      conversationId: envelope.target.conversationId,
      queuedTurnId,
      claimId: context.idempotencyKey,
      claimBy,
      now: claimNow,
      leaseUntil: new Date(claimNow.getTime() + CLAIM_LEASE_MS),
    });
    if (claimed.outcome === 'missing') {
      return { status: 'settled' };
    }
    if (claimed.outcome === 'blocked') {
      throw executionError('An earlier queued turn has not settled yet.', {
        code: 'QUEUED_TURN_BLOCKED',
        retryable: true,
        status: 409,
        retryAfter: '1',
        deferWithoutAttempt: true,
      });
    }

    const claim = claimed.claim;
    const messages = await methods.getMessages(
      { user: userId, conversationId: envelope.target.conversationId },
      MESSAGE_SELECT,
      { sort: { createdAt: 1, _id: 1 } },
    );
    const parentMessageId = latestAssistantDescendant(messages, claim.parentMessageId);
    if (parentMessageId == null) {
      await deadClaim(
        methods,
        envelope,
        claim,
        'PARENT_NOT_FOUND',
        'The queued turn branch is no longer available.',
      );
      throw executionError('The queued turn branch is no longer available.', {
        code: 'PARENT_NOT_FOUND',
        retryable: false,
        status: 404,
      });
    }

    return {
      status: 'ready',
      input: claim.text,
      parentMessageId,
      ...(claim.files != null && { files: claim.files }),
      ...(claim.quotes != null && { quotes: claim.quotes }),
      ...(claim.manualSkills != null && { manualSkills: claim.manualSkills }),
      releaseOnDefiniteFailure: async (error) => {
        if (
          error?.retryable === false ||
          (error?.status != null && error.status >= 400 && error.status < 500)
        ) {
          await deadClaim(
            methods,
            envelope,
            claim,
            error.code ?? 'ADMISSION_REJECTED',
            error.message,
          );
          return;
        }
        await releaseClaim(methods, envelope, claim);
      },
      settleOnAdmission: async (result) => {
        const settled = await methods.markAgentQueuedTurnAdmitted({
          user: claim.user,
          ...(claim.tenantId != null && { tenantId: claim.tenantId }),
          conversationId: claim.conversationId,
          queuedTurnId: claim.queuedTurnId,
          claimId: claim.claimId,
          claimBy: claim.claimBy,
          admissionId: context.idempotencyKey,
          admissionMode: 'ordinary',
          ...(result.streamId != null && { generationId: result.streamId }),
          ...(result.generationCreatedAt != null && {
            generationCreatedAt: result.generationCreatedAt,
          }),
          settledAt: new Date(now()),
        });
        if (settled.outcome === 'conflict') {
          throw new Error('The queued turn admission could not be committed');
        }
      },
    };
  };
}

function deliveryEnvelope(turn: AgentQueuedTurnRecord) {
  const occurredAt = turn.createdAt.getTime();
  return createAgentTriggerEnvelope({
    mode: 'continue',
    requestId: randomUUID(),
    deliveryId: turn.queuedTurnId,
    receivedAt: Date.now(),
    principal: {
      id: turn.user.toString(),
      ...(turn.tenantId != null && { tenantId: turn.tenantId }),
    },
    event: {
      id: turn.queuedTurnId,
      type: AGENT_QUEUED_TURN_EVENT,
      occurredAt,
      source: { id: AGENT_QUEUED_TURN_SOURCE, type: 'internal' },
      payload: { queuedTurnId: turn.queuedTurnId },
    },
    input: turn.text,
    target: {
      agentId: turn.agentId,
      conversationId: turn.conversationId,
      parentMessageId: turn.parentMessageId,
    },
  });
}

/** Repairs the intentional record-first outbox seam by replaying a stable
 * delivery identity until the queue row records the scheduling receipt. */
export function createAgentQueuedTurnScheduler({
  methods,
  enqueue,
  recoveryIntervalMs = DEFAULT_RECOVERY_INTERVAL_MS,
  recoveryLimit = DEFAULT_RECOVERY_LIMIT,
}: AgentQueuedTurnSchedulerDeps): AgentQueuedTurnScheduler {
  let timer: NodeJS.Timeout | undefined;
  let recovery: Promise<number> | undefined;

  const schedule = async (turn: AgentQueuedTurnRecord): Promise<string> => {
    const receipt = await enqueue(deliveryEnvelope(turn), {
      orderingKey: `agent-queued-turn:${turn.conversationId}`,
      requiredWorkerCapability: AGENT_TRIGGER_WORKER_CAPABILITY_QUEUED_TURN_V1,
    });
    const marked = await runAsSystem(() =>
      methods.markQueuedTurnScheduled({
        user: turn.user,
        ...(turn.tenantId != null && { tenantId: turn.tenantId }),
        conversationId: turn.conversationId,
        queuedTurnId: turn.queuedTurnId,
        deliveryKey: receipt.deliveryKey,
        scheduledAt: new Date(),
      }),
    );
    if (marked.outcome === 'conflict') {
      throw new Error('The queued turn scheduling receipt could not be committed');
    }
    return receipt.deliveryKey;
  };

  const recover = (): Promise<number> => {
    if (recovery != null) {
      return recovery;
    }
    const task = (async () => {
      const turns = await runAsSystem(() => methods.findQueuedTurnsNeedingDelivery(recoveryLimit));
      let repaired = 0;
      for (const turn of turns) {
        try {
          await schedule(turn);
          repaired += 1;
        } catch (error) {
          logger.warn(
            `[agentQueuedTurns] Failed to repair delivery ${turn.queuedTurnId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return repaired;
    })();
    recovery = task;
    void task.then(
      () => {
        if (recovery === task) {
          recovery = undefined;
        }
      },
      () => {
        if (recovery === task) {
          recovery = undefined;
        }
      },
    );
    return task;
  };

  return {
    schedule,
    recover,
    initialize: async () => {
      await runAsSystem(() => methods.ensureAgentQueuedTurnIndexes());
      timer = setInterval(() => {
        void recover().catch((error: unknown) => {
          logger.warn('[agentQueuedTurns] Delivery recovery pass failed', error);
        });
      }, recoveryIntervalMs);
      timer.unref?.();
      await recover().catch((error: unknown) => {
        logger.warn('[agentQueuedTurns] Initial delivery recovery pass failed', error);
      });
    },
    stop: async () => {
      if (timer != null) {
        clearInterval(timer);
        timer = undefined;
      }
      await recovery;
    },
  };
}
