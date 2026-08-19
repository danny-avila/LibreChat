import { randomUUID } from 'node:crypto';
import { isEphemeralAgentId } from 'librechat-data-provider';
import type { ConversationMethods, IMessage, MessageMethods } from '@librechat/data-schemas';
import type {
  AgentTriggerContinuePreparation,
  AgentTriggerExecutionHostDeps,
} from './triggers/host';
import type { SubagentTaskWakeupRegistration } from './subagentThreads';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import type { AgentTriggerDispatchContext } from './triggers/dispatch';
import type { AgentTriggerEnqueueOptions } from './triggers/delivery';
import { boundedSubagentTaskResult } from './subagentTaskRouting';
import { createAgentTriggerEnvelope } from './triggers/envelope';
import { AgentTriggerExecutionError } from './triggers/host';

const WAKEUP_ADMISSION_DELAY_MS = 250;
/** SDK tasks time out after 30 minutes; this grace covers terminal persistence. */
const CHILD_READY_WAIT_MS = 35 * 60_000;
const SOURCE_ID = 'subagent-completion';
const EVENT_TYPE = 'subagent.completion';
const MESSAGE_SELECT = 'messageId parentMessageId isCreatedByUser createdAt';
const TASK_SELECT =
  'messageId conversationId parentMessageId sender text error createdAt updatedAt +subagentTask';

export type EnqueueAgentTrigger = (
  envelope: unknown,
  options?: AgentTriggerEnqueueOptions,
) => Promise<unknown>;

type WakeupMethods = Pick<ConversationMethods, 'getConvo'> &
  Pick<
    MessageMethods,
    'claimSubagentTaskResult' | 'getMessages' | 'releaseSubagentTaskResultClaim'
  >;

interface GenerationState {
  status?: unknown;
  metadata?: {
    idempotencyClientRequestId?: unknown;
    terminalPersistencePending?: unknown;
  };
}

export interface SubagentCompletionWakeupResolverDeps {
  methods: WakeupMethods;
  getGenerationJob: (conversationId: string) => Promise<GenerationState | null>;
  now?: () => number;
}

function payloadRegistration(
  envelope: AgentContinueTriggerEnvelope,
): Pick<SubagentTaskWakeupRegistration, 'taskId' | 'threadId' | 'subagentType'> | null | undefined {
  if (
    envelope.event.source.type !== 'internal' ||
    envelope.event.source.id !== SOURCE_ID ||
    envelope.event.type !== EVENT_TYPE
  ) {
    return;
  }
  const payload = envelope.event.payload;
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const { taskId, threadId, subagentType } = payload;
  if (
    typeof taskId !== 'string' ||
    taskId.length === 0 ||
    taskId.length > 256 ||
    typeof threadId !== 'string' ||
    threadId.length === 0 ||
    threadId.length > 256 ||
    typeof subagentType !== 'string' ||
    subagentType.length === 0 ||
    subagentType.length > 256
  ) {
    return null;
  }
  return { taskId, threadId, subagentType };
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

function isParentActive(job: GenerationState | null): boolean {
  return (
    job?.status === 'running' ||
    job?.status === 'requires_action' ||
    job?.metadata?.terminalPersistencePending === true
  );
}

function sameTenant(actual: string | undefined, expected: string | undefined): boolean {
  return actual === expected;
}

function timestamp(message: Pick<IMessage, 'createdAt'>): number {
  const value = message.createdAt;
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = value == null ? Number.NaN : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Selects the newest persisted assistant on the branch below the original
 * parent. Re-resolving for every ordered delivery serializes sibling child
 * completions onto the branch produced by the preceding wakeup. */
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

function renderWakeupInput(
  registration: Pick<SubagentTaskWakeupRegistration, 'threadId' | 'subagentType'>,
  resultTaskId: string,
  terminal: IMessage,
): string {
  const status = terminal.subagentTask?.status ?? 'error';
  return [
    `A detached subagent task has ${status}. Continue the parent task using its durable result below.`,
    JSON.stringify({
      background_task_id: resultTaskId,
      subagent_thread_id: registration.threadId,
      subagent_type: registration.subagentType,
      status,
      result: boundedSubagentTaskResult(terminal.text ?? ''),
    }),
  ].join('\n');
}

/** Resolves a pre-registered completion delivery immediately before dispatch.
 * The durable result claim elects exactly one consumer (manual poll or this
 * delivery), while the branch lookup chains ordered sibling completions. */
export function createSubagentCompletionWakeupResolver({
  methods,
  getGenerationJob,
  now = Date.now,
}: SubagentCompletionWakeupResolverDeps): NonNullable<
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
      throw executionError('The subagent completion wakeup payload is invalid.', {
        code: 'INVALID_SUBAGENT_WAKEUP',
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
    const tenantId = envelope.principal.tenantId;
    const [parent, child, taskMessages] = await Promise.all([
      methods.getConvo(userId, envelope.target.conversationId),
      methods.getConvo(userId, registration.threadId),
      methods.getMessages(
        {
          user: userId,
          conversationId: registration.threadId,
          messageId: { $in: [`${registration.taskId}:user`, `${registration.taskId}:assistant`] },
        },
        TASK_SELECT,
        { sort: { createdAt: 1, _id: 1 } },
      ),
    ]);
    if (parent == null || !sameTenant(parent.tenantId, tenantId)) {
      throw executionError('The parent conversation is no longer available.', {
        code: 'PARENT_NOT_FOUND',
        retryable: false,
        status: 404,
      });
    }
    const lineage = child?.subagentThread;
    if (
      child == null ||
      !sameTenant(child.tenantId, tenantId) ||
      lineage?.parentConversationId !== envelope.target.conversationId ||
      lineage.parentAgentId !== envelope.target.agentId ||
      lineage.subagentType !== registration.subagentType
    ) {
      throw executionError('The child task lineage is no longer available.', {
        code: 'CHILD_TASK_MISSING',
        retryable: false,
        status: 404,
      });
    }
    let resultTaskId = registration.taskId;
    let terminal = taskMessages.find(
      (message) =>
        message.messageId === `${registration.taskId}:assistant` &&
        message.subagentTask?.status !== 'running',
    );
    const started = taskMessages.find(
      (message) => message.messageId === `${registration.taskId}:user`,
    );
    /** A worker can persist the input, lose its lease, and then have a retry
     * close the same logical attempt under the retry's runtime task id. Resolve
     * that terminal by the durable attempt identity so the earlier ordered
     * delivery cannot block the repaired delivery behind it for the full
     * abandonment grace period. */
    if (terminal == null && started?.subagentTask?.attemptKey != null) {
      const [supersedingTerminal] = await methods.getMessages(
        {
          user: userId,
          conversationId: registration.threadId,
          'subagentTask.attemptKey': started.subagentTask.attemptKey,
          'subagentTask.status': { $in: ['completed', 'error', 'cancelled'] },
        },
        TASK_SELECT,
        { sort: { createdAt: -1, _id: -1 }, limit: 1 },
      );
      if (supersedingTerminal?.messageId.endsWith(':assistant') === true) {
        terminal = supersedingTerminal;
        resultTaskId = supersedingTerminal.messageId.slice(0, -':assistant'.length);
      }
    }
    if (terminal == null) {
      if (started != null) {
        if (now() - envelope.event.occurredAt > CHILD_READY_WAIT_MS) {
          throw executionError('The child task owner disappeared before settlement.', {
            code: 'CHILD_TASK_ABANDONED',
            retryable: false,
            status: 410,
          });
        }
        throw executionError('The child task has not settled yet.', {
          code: 'CHILD_NOT_READY',
          retryable: true,
          status: 409,
          retryAfter: '1',
          deferWithoutAttempt: true,
        });
      }
      throw executionError('The child task no longer exists.', {
        code: 'CHILD_TASK_MISSING',
        retryable: false,
        status: 404,
      });
    }
    if (terminal.subagentTask?.parentRunId !== envelope.target.parentMessageId) {
      throw executionError('The child task lineage is no longer available.', {
        code: 'CHILD_TASK_MISSING',
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

    const claim = await methods.claimSubagentTaskResult({
      userId,
      conversationId: registration.threadId,
      taskId: resultTaskId,
      kind: 'wakeup',
      claimId: context.idempotencyKey,
    });
    if (claim.status !== 'acquired') {
      return { status: 'settled' };
    }
    if (claim.message.subagentTask?.status === 'cancelled') {
      const released = await methods.releaseSubagentTaskResultClaim({
        userId,
        conversationId: registration.threadId,
        taskId: resultTaskId,
        kind: 'wakeup',
        claimId: context.idempotencyKey,
      });
      if (!released) {
        throw executionError('The cancelled child result claim could not be released.', {
          code: 'RESULT_CLAIM_RELEASE_FAILED',
          retryable: true,
        });
      }
      return { status: 'settled' };
    }
    return {
      status: 'ready',
      parentMessageId,
      input: renderWakeupInput(registration, resultTaskId, claim.message),
      releaseOnDefiniteFailure: async () => {
        await methods.releaseSubagentTaskResultClaim({
          userId,
          conversationId: registration.threadId,
          taskId: resultTaskId,
          kind: 'wakeup',
          claimId: context.idempotencyKey,
        });
      },
    };
  };
}

/** Pre-registers the idempotent delivery before child provider work starts.
 * A process crash can therefore delay a wakeup but cannot lose it; dispatch
 * simply defers until the terminal child message exists. */
export function createSubagentCompletionWakeupHandler(
  enqueue: EnqueueAgentTrigger,
): (registration: SubagentTaskWakeupRegistration) => Promise<void> {
  return async (registration) => {
    const parentAgentId = registration.parentAgentId?.trim();
    if (parentAgentId == null || parentAgentId === '' || isEphemeralAgentId(parentAgentId)) {
      return;
    }
    const eventId = registration.taskId;
    const envelope = createAgentTriggerEnvelope({
      mode: 'continue',
      requestId: randomUUID(),
      deliveryId: eventId,
      receivedAt: Date.now(),
      principal: {
        id: registration.userId,
        ...(registration.tenantId == null ? {} : { tenantId: registration.tenantId }),
      },
      event: {
        id: eventId,
        type: EVENT_TYPE,
        occurredAt: registration.createdAt,
        source: { id: SOURCE_ID, type: 'internal' },
        payload: {
          taskId: registration.taskId,
          threadId: registration.threadId,
          subagentType: registration.subagentType,
        },
      },
      target: {
        agentId: parentAgentId,
        conversationId: registration.parentConversationId,
        parentMessageId: registration.parentMessageId,
      },
      input: 'A detached subagent task is waiting to complete.',
    });
    await enqueue(envelope, {
      orderingKey: `subagent-completion:${registration.parentConversationId}`,
      availableAt: new Date(
        Math.max(Date.now(), registration.createdAt) + WAKEUP_ADMISSION_DELAY_MS,
      ),
    });
  };
}
