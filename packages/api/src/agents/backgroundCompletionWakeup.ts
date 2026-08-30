import { randomUUID } from 'node:crypto';
import { isEphemeralAgentId } from 'librechat-data-provider';
import { AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1 } from '@librechat/data-schemas';
import type {
  AgentTriggerProducerLeaseStatus,
  BackgroundToolResultClaim,
  ConversationMethods,
  IMessage,
  MessageMethods,
} from '@librechat/data-schemas';
import type {
  BackgroundToolDeadClaimRecovery,
  BackgroundToolWakeupAdmission,
  BackgroundToolWakeupRegistration,
  BackgroundToolWakeupRetireOptions,
} from './backgroundCompletion';
import type {
  AgentTriggerContinuePreparation,
  AgentTriggerExecutionHostDeps,
} from './triggers/host';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import type { AgentTriggerDispatchContext } from './triggers/dispatch';
import type { AgentTriggerEnqueueOptions } from './triggers/delivery';
import { BACKGROUND_TOOL_PRODUCER_LEASE_MS } from './backgroundCompletion';
import { createAgentTriggerEnvelope } from './triggers/envelope';
import { AgentTriggerExecutionError } from './triggers/host';
import { truncateMiddle } from '~/utils';

const WAKEUP_ADMISSION_DELAY_MS = 250;
const MAX_WAKEUP_RESULT_CHARS = 24 * 1024;
export const BACKGROUND_TOOL_WAKEUP_INPUT_MAX_CHARS: number = 16 * 1024;
const MESSAGE_SELECT = 'messageId parentMessageId isCreatedByUser createdAt';
export const BACKGROUND_TOOL_COMPLETION_SOURCE = 'background-tool-completion';
const EVENT_TYPE = 'background-tool.completion';

export type EnqueueBackgroundToolCompletion = (
  envelope: unknown,
  options?: AgentTriggerEnqueueOptions,
) => Promise<{ deliveryKey: string }>;

export type RetireBackgroundToolCompletion = (
  deliveryKey: string,
  sourceId: string,
  reason: string,
  options?: BackgroundToolWakeupRetireOptions,
) => Promise<boolean>;

export type RenewBackgroundToolCompletionProducerLease = (
  deliveryKey: string,
  sourceId: string,
  leaseUntil: Date,
) => Promise<boolean>;

type WakeupMethods = Pick<ConversationMethods, 'getConvo'> &
  Pick<MessageMethods, 'getMessages'> & {
    claimBackgroundToolResults(params: {
      userId: string;
      conversationId: string;
      messageId: string;
      taskId: string;
      agentId?: string;
      kind: 'manual' | 'wakeup';
      claimId: string;
      limit?: number;
    }): Promise<BackgroundToolResultClaim>;
    releaseBackgroundToolResultClaims(params: {
      userId: string;
      conversationId: string;
      messageId: string;
      taskIds?: string[];
      kind: 'manual' | 'wakeup';
      claimId: string;
    }): Promise<boolean>;
    getAgentTriggerDeliveryProducerLease(params: {
      deliveryKey: string;
      sourceId: string;
      now: Date;
    }): Promise<AgentTriggerProducerLeaseStatus>;
  };

interface GenerationState {
  status?: unknown;
  metadata?: {
    idempotencyClientRequestId?: unknown;
    terminalPersistencePending?: unknown;
  };
}

export interface BackgroundToolCompletionWakeupResolverDeps {
  methods: WakeupMethods;
  getGenerationJob: (conversationId: string) => Promise<GenerationState | null>;
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

function payloadRegistration(
  envelope: AgentContinueTriggerEnvelope,
): Pick<BackgroundToolWakeupRegistration, 'taskId' | 'toolCallId' | 'toolName'> | null | undefined {
  if (
    envelope.event.source.type !== 'internal' ||
    envelope.event.source.id !== BACKGROUND_TOOL_COMPLETION_SOURCE ||
    envelope.event.type !== EVENT_TYPE
  ) {
    return;
  }
  const payload = envelope.event.payload;
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const { taskId, toolCallId, toolName } = payload;
  if (
    typeof taskId !== 'string' ||
    taskId.length === 0 ||
    taskId.length > 256 ||
    typeof toolCallId !== 'string' ||
    toolCallId.length === 0 ||
    toolCallId.length > 256 ||
    typeof toolName !== 'string' ||
    toolName.length === 0 ||
    toolName.length > 256
  ) {
    return null;
  }
  return { taskId, toolCallId, toolName };
}

function isParentActive(job: GenerationState | null): boolean {
  return (
    job?.status === 'running' ||
    job?.status === 'requires_action' ||
    job?.metadata?.terminalPersistencePending === true
  );
}

function timestamp(message: Pick<IMessage, 'createdAt'>): number {
  const value = message.createdAt;
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = value == null ? Number.NaN : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function fitWakeupResult(output: string, serializedBudget: number): string {
  if (serializedBudget <= 0 || output.length === 0) {
    return '';
  }
  let low = 0;
  let high = Math.min(output.length, MAX_WAKEUP_RESULT_CHARS);
  let fitted = '';
  while (low <= high) {
    const limit = Math.floor((low + high) / 2);
    const candidate = truncateMiddle(output, limit);
    /** The aggregate limit applies after JSON escaping, not just to raw tool
     * text. Subtract the empty string's two quote characters because the
     * fixed payload budget below already includes `result: ""`. */
    const cost = JSON.stringify(candidate).length - 2;
    if (cost <= serializedBudget) {
      fitted = candidate;
      low = limit + 1;
    } else {
      high = limit - 1;
    }
  }
  return fitted;
}

function buildWakeupInput(
  results: Array<{
    taskId: string;
    toolCallId: string;
    toolName: string;
    status: 'completed' | 'error';
    output: string;
  }>,
): string {
  const header =
    results.length === 1
      ? 'A background tool task has finished. Continue using its durable result below.'
      : `${results.length} background tool tasks have finished. Continue using their durable results below.`;
  const payload = results.map((result) => ({
    background_task_id: result.taskId,
    tool_call_id: result.toolCallId,
    tool: result.toolName,
    status: result.status,
    result: '',
  }));
  let remaining = Math.max(
    0,
    BACKGROUND_TOOL_WAKEUP_INPUT_MAX_CHARS - header.length - 1 - JSON.stringify(payload).length,
  );
  for (let index = 0; index < results.length; index++) {
    const slots = results.length - index;
    const share = Math.floor(remaining / slots);
    const fitted = fitWakeupResult(results[index]?.output ?? '', share);
    payload[index]!.result = fitted;
    remaining -= JSON.stringify(fitted).length - 2;
  }
  return `${header}\n${JSON.stringify(payload)}`;
}

/** Resolves a pre-registered delivery only after its result is durably
 * readable. The message claim elects automatic delivery against manual polls
 * and returns a bounded sibling batch for the continuation input. */
export function createBackgroundToolCompletionWakeupResolver({
  methods,
  getGenerationJob,
}: BackgroundToolCompletionWakeupResolverDeps): NonNullable<
  AgentTriggerExecutionHostDeps['prepareContinue']
> {
  return async (
    envelope: AgentContinueTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ): Promise<AgentTriggerContinuePreparation | undefined> => {
    const registration = payloadRegistration(envelope);
    if (registration === undefined) {
      return;
    }
    if (registration === null) {
      throw executionError('The background tool completion payload is invalid.', {
        code: 'INVALID_BACKGROUND_TOOL_WAKEUP',
        retryable: false,
      });
    }
    let parentJob: GenerationState | null;
    try {
      parentJob = await getGenerationJob(envelope.target.conversationId);
    } catch (error) {
      throw executionError(
        `Parent generation state is temporarily unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { code: 'PARENT_STATE_UNAVAILABLE', retryable: true },
      );
    }
    if (
      isParentActive(parentJob) &&
      parentJob?.metadata?.idempotencyClientRequestId !== context.idempotencyKey
    ) {
      throw executionError('The parent generation has not settled yet.', {
        code: 'PARENT_NOT_READY',
        retryable: true,
        status: 409,
        retryAfter: '1',
        deferWithoutAttempt: true,
      });
    }
    const userId = envelope.principal.userId;
    const parent = await methods.getConvo(userId, envelope.target.conversationId);
    if (parent == null || parent.tenantId !== envelope.principal.tenantId) {
      throw executionError('The parent conversation is no longer available.', {
        code: 'PARENT_NOT_FOUND',
        retryable: false,
        status: 404,
      });
    }
    const parentMessages = await methods.getMessages(
      { user: userId, conversationId: envelope.target.conversationId },
      MESSAGE_SELECT,
      { sort: { createdAt: 1, _id: 1 } },
    );
    const parentMessageId = latestAssistantDescendant(
      parentMessages,
      envelope.target.parentMessageId,
    );
    if (parentMessageId == null) {
      throw executionError('The parent conversation branch is no longer available.', {
        code: 'PARENT_NOT_FOUND',
        retryable: false,
        status: 404,
      });
    }
    const claim = await methods.claimBackgroundToolResults({
      userId,
      conversationId: envelope.target.conversationId,
      messageId: envelope.target.parentMessageId,
      taskId: registration.taskId,
      agentId: envelope.target.agentId,
      kind: 'wakeup',
      claimId: context.idempotencyKey,
    });
    if (claim.status === 'claimed') {
      return { status: 'settled' };
    }
    if (claim.status !== 'acquired') {
      let producerLease: AgentTriggerProducerLeaseStatus;
      try {
        producerLease = await methods.getAgentTriggerDeliveryProducerLease({
          deliveryKey: context.idempotencyKey,
          sourceId: BACKGROUND_TOOL_COMPLETION_SOURCE,
          now: new Date(),
        });
      } catch (error) {
        throw executionError(
          `Background tool producer liveness is temporarily unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { code: 'BACKGROUND_TOOL_PRODUCER_STATE_UNAVAILABLE', retryable: true },
        );
      }
      if (producerLease.status === 'expired') {
        throw executionError('The process-local background tool executor was lost.', {
          code: 'BACKGROUND_TOOL_PRODUCER_LOST',
          retryable: false,
        });
      }
      /** A live lease proves the invocation or its durable persistence retry
       * still has an owner. Missing remains defer-only for compatibility with
       * completion rows admitted before producer leases existed. */
      throw executionError('The background tool result is not durable yet.', {
        code: 'BACKGROUND_TOOL_RESULT_NOT_READY',
        retryable: true,
        status: 409,
        retryAfter: '1',
        deferWithoutAttempt: true,
      });
    }
    const taskIds = claim.results.map((result) => result.taskId);
    const input = buildWakeupInput(claim.results);
    return {
      status: 'ready',
      parentMessageId,
      input,
      releaseOnDefiniteFailure: async () => {
        await methods.releaseBackgroundToolResultClaims({
          userId,
          conversationId: envelope.target.conversationId,
          messageId: envelope.target.parentMessageId,
          taskIds,
          kind: 'wakeup',
          claimId: context.idempotencyKey,
        });
      },
    };
  };
}

/** Pre-registers the ordered completion delivery before external tool work starts. */
export function createBackgroundToolCompletionWakeupHandler(
  enqueue: EnqueueBackgroundToolCompletion,
  retire: RetireBackgroundToolCompletion,
  renewProducerLease: RenewBackgroundToolCompletionProducerLease,
): (
  registration: BackgroundToolWakeupRegistration,
) => Promise<BackgroundToolWakeupAdmission | false> {
  return async (registration) => {
    const parentAgentId = registration.parentAgentId?.trim();
    if (parentAgentId == null || parentAgentId === '' || isEphemeralAgentId(parentAgentId)) {
      return false;
    }
    const envelope = createAgentTriggerEnvelope({
      mode: 'continue',
      requestId: randomUUID(),
      deliveryId: registration.taskId,
      receivedAt: Date.now(),
      principal: {
        id: registration.userId,
        ...(registration.tenantId == null ? {} : { tenantId: registration.tenantId }),
      },
      event: {
        id: registration.taskId,
        type: EVENT_TYPE,
        occurredAt: registration.createdAt,
        source: { id: BACKGROUND_TOOL_COMPLETION_SOURCE, type: 'internal' },
        payload: {
          taskId: registration.taskId,
          toolCallId: registration.toolCallId,
          toolName: registration.toolName,
        },
      },
      target: {
        agentId: parentAgentId,
        conversationId: registration.conversationId,
        parentMessageId: registration.parentMessageId,
      },
      input: 'A background tool task is waiting to complete.',
    });
    const admitted = await enqueue(envelope, {
      /** Pending work gets a task-local lane so a slow tool cannot block an
       * independently completed sibling. The generation admission fence and
       * atomic result claim serialize the actual continuations. */
      orderingKey: `background-tool-completion:${registration.conversationId}:${registration.taskId}`,
      availableAt: new Date(
        Math.max(Date.now(), registration.createdAt) + WAKEUP_ADMISSION_DELAY_MS,
      ),
      requiredWorkerCapability: AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1,
      producerLeaseUntil: new Date(Date.now() + BACKGROUND_TOOL_PRODUCER_LEASE_MS),
    });
    return {
      renew: () =>
        renewProducerLease(
          admitted.deliveryKey,
          BACKGROUND_TOOL_COMPLETION_SOURCE,
          new Date(Date.now() + BACKGROUND_TOOL_PRODUCER_LEASE_MS),
        ),
      retire: (reason, options) =>
        options == null
          ? retire(admitted.deliveryKey, BACKGROUND_TOOL_COMPLETION_SOURCE, reason)
          : retire(admitted.deliveryKey, BACKGROUND_TOOL_COMPLETION_SOURCE, reason, options),
    };
  };
}

/** Reopens every result owned by one dead automatic batch. Generation state
 * first fences an admitted continuation that is still running/finalizing;
 * delivery retirement then proves no retry remains, and releasing by the
 * batch-root claim identity makes sibling recovery independent of which task
 * originally admitted that delivery. */
export function createBackgroundToolDeadClaimRecovery(
  retire: RetireBackgroundToolCompletion,
  releaseClaims: WakeupMethods['releaseBackgroundToolResultClaims'],
  getGenerationJob: (conversationId: string) => Promise<GenerationState | null | undefined>,
  fenceGenerationClaim: (input: {
    userId: string;
    conversationId: string;
    claimId: string;
  }) => Promise<'fenced' | 'started' | 'unavailable'>,
): BackgroundToolDeadClaimRecovery {
  return async ({ userId, conversationId, messageId, claimId }) => {
    const claimGenerationIsActive = async (): Promise<boolean> => {
      const generation = await getGenerationJob(conversationId);
      return (
        generation?.metadata?.idempotencyClientRequestId === claimId && isParentActive(generation)
      );
    };
    if (await claimGenerationIsActive()) {
      return false;
    }
    const retired = await retire(
      claimId,
      BACKGROUND_TOOL_COMPLETION_SOURCE,
      'dead background completion batch recovered by manual poll',
      { onlyIfDead: true },
    );
    if (!retired) {
      return false;
    }
    /** Retirement closes further delivery retries. The idempotency-claim CAS
     * closes the remaining claim-to-job-publication window: recovery either
     * installs a started tombstone that invalidates a delayed creator's token,
     * or observes that job creation already won. */
    const generationFence = await fenceGenerationClaim({ userId, conversationId, claimId });
    if (generationFence === 'unavailable') {
      return false;
    }
    if (await claimGenerationIsActive()) {
      return false;
    }
    return releaseClaims({
      userId,
      conversationId,
      messageId,
      kind: 'wakeup',
      claimId,
    });
  };
}
