import { randomUUID } from 'node:crypto';
import { InMemorySubagentTaskStore } from '@librechat/agents';
import { logger, tenantStorage } from '@librechat/data-schemas';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@librechat/agents/langchain/messages';
import type {
  InMemorySubagentTaskStoreOptions,
  SubagentTaskClaim,
  SubagentTaskConfig,
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskRuntime,
  SubagentTaskSnapshot,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type {
  AllMethods,
  IActiveSubagentThreadLease,
  IConversation,
  IMessage,
  MessageMethods,
  ConversationMethods,
  SubagentTaskResultClaim,
} from '@librechat/data-schemas';
import type { BaseMessage, StoredMessage } from '@librechat/agents/langchain/messages';
import type { SubagentTaskControlTransport } from './subagentTaskRouting';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import {
  boundedClaim,
  boundedTaskList,
  controlFingerprint,
  SubagentTaskOwnerUnavailableError,
} from './subagentTaskRouting';
import { createSubagentAttemptKey, createSubagentThreadId } from './subagentThreadIds';
import { runWithDetachedSubagentUsage } from './subagentTaskContext';
import { createConcurrencyLimiter } from '~/utils/promise';
import { aggregateEmittedUsage } from './usage';

const SCOPE_VERSION = 1;
const DEFAULT_MAX_THREAD_DEPTH = 1;
const DEFAULT_LEASE_TTL_MS = 30_000;
const DEFAULT_LEASE_HEARTBEAT_MS = 10_000;
const DEFAULT_OWNER_DRAIN_TIMEOUT_MS = 45_000;
/** Keeps the admission fence alive across the deletion that follows the drain. */
const OWNER_FENCE_GRACE_MS = 5 * 60_000;
const DEFAULT_OWNER_DRAIN_POLL_MS = 100;
/** Matches the deletion drain batch so cancellation cannot burst Redis. */
const DELETION_CANCEL_CONCURRENCY = 32;
/** Bounds retained control invocations; one entry per applied command. */
const MAX_CONTROL_INVOCATIONS = 4_096;

/** A cancellation target set resolved before the conversations are removed. */
export interface SubagentCancellationPlan {
  userId: string;
  tenantId?: string;
  conversationIds: string[];
  scopes: Array<{ scopeId: string; threadIds: string[] | null }>;
  leases: IActiveSubagentThreadLease[];
}
/** Three missed 10-second transport heartbeats retire a crashed owner. */
const DEFAULT_TASK_ROUTING_TTL_MS = 30_000;
const SLOW_PREPARATION_WARN_MS = 5_000;
const MAX_TRANSCRIPT_BYTES = 12 * 1024 * 1024;
const TRANSCRIPT_SELECT =
  'messageId parentMessageId text createdAt +subagentTranscript +subagentTask';
const DURABLE_RESULT_SELECT =
  'messageId conversationId sender text createdAt updatedAt +subagentTask';

class SubagentThreadPublicError extends Error {}
class SubagentThreadDeletedError extends SubagentThreadPublicError {}

type SubagentThreadMethods = Pick<
  AllMethods,
  | 'acquireSubagentThreadLease'
  | 'claimSubagentTaskResult'
  | 'countActiveSubagentThreadLeases'
  | 'deleteConvos'
  | 'deleteMessages'
  | 'getConvo'
  | 'getMessages'
  | 'listActiveSubagentThreadLeases'
  | 'reserveSubagentThread'
  | 'releaseSubagentThreadLease'
  | 'renewSubagentThreadLease'
  | 'saveConvo'
  | 'saveMessage'
>;

interface SubagentThreadScope {
  version: typeof SCOPE_VERSION;
  userId: string;
  parentConversationId: string;
  tenantId?: string;
}

interface PreparedThread {
  conversation: IConversation;
  initialMessages: BaseMessage[];
  initialStoredMessages: StoredMessage[];
  attemptKey: string;
  /** Stable source-occurrence time shared by first delivery and every replay. */
  taskCreatedAt: number;
  userMessageId?: string;
  replay?: {
    status: 'completed' | 'error' | 'cancelled';
    content: string;
    taskId: string;
    parentRunId: string;
  };
}

type ThreadMessage = Pick<
  IMessage,
  'messageId' | 'parentMessageId' | 'text' | 'createdAt' | 'subagentTranscript' | 'subagentTask'
>;

interface TaskThreadLease {
  idempotencyKey: string;
  taskId: string;
  running: boolean;
  settling: boolean;
  shared?: {
    token: string;
    lost: boolean;
    /** Epoch ms this lease is durable until, advanced only by a confirmed renewal. */
    expiresAt: number;
    heartbeat?: ReturnType<typeof setInterval>;
    heartbeatInFlight?: Promise<void>;
  };
}

export interface SubagentThreadTaskStoreOptions extends InMemorySubagentTaskStoreOptions {
  maxThreadDepth?: number;
  leaseTtlMs?: number;
  leaseHeartbeatMs?: number;
  ownerDrainTimeoutMs?: number;
  ownerDrainPollMs?: number;
  taskRoutingTtlMs?: number;
  isOwnerActive?: (userId: string) => Promise<boolean>;
  maxControlInvocations?: number;
  ownerFenceGraceMs?: number;
  fenceOwnerAdmission?: (userId: string, token: string, fencedUntil: Date) => Promise<void>;
  renewOwnerAdmission?: (userId: string, token: string, fencedUntil: Date) => Promise<boolean>;
  releaseOwnerAdmission?: (userId: string, token: string) => Promise<void>;
  onTaskPrepared?: (registration: SubagentTaskWakeupRegistration) => Promise<void> | void;
}

export interface SubagentTaskWakeupRegistration {
  userId: string;
  parentConversationId: string;
  parentMessageId: string;
  parentAgentId?: string;
  tenantId?: string;
  taskId: string;
  threadId: string;
  subagentType: string;
  createdAt: number;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizedRequestFingerprint(request: SubagentTaskStartRequest): string | undefined {
  const fingerprint = request.requestFingerprint?.trim();
  return fingerprint == null || fingerprint === '' ? undefined : fingerprint;
}

function parseScope(scopeId: string): SubagentThreadScope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopeId);
  } catch {
    throw new Error('Invalid subagent thread scope.');
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid subagent thread scope.');
  }
  const candidate = parsed as Partial<SubagentThreadScope>;
  if (
    candidate.version !== SCOPE_VERSION ||
    !isNonEmptyString(candidate.userId) ||
    !isNonEmptyString(candidate.parentConversationId) ||
    (candidate.tenantId != null && !isNonEmptyString(candidate.tenantId))
  ) {
    throw new Error('Invalid subagent thread scope.');
  }
  return {
    version: SCOPE_VERSION,
    userId: candidate.userId,
    parentConversationId: candidate.parentConversationId,
    ...(candidate.tenantId == null ? {} : { tenantId: candidate.tenantId }),
  };
}

function serializeScope(scope: Omit<SubagentThreadScope, 'version'>): string {
  return JSON.stringify({ version: SCOPE_VERSION, ...scope });
}

function matchesTenant(actual: string | undefined, expected: string | undefined): boolean {
  return actual === expected;
}

function durableMessageTime(message: Pick<IMessage, 'createdAt'>, missingMessage: string): number {
  const value = message.createdAt?.getTime();
  if (!Number.isSafeInteger(value) || value == null || value < 0) {
    throw new Error(missingMessage);
  }
  return value;
}

function assertParentPersistence(
  value: unknown,
  scope: SubagentThreadScope,
): asserts value is { message: { messageId: string; conversationId: string } } {
  const message =
    value != null && typeof value === 'object'
      ? (value as { message?: unknown }).message
      : undefined;
  if (
    message == null ||
    typeof message !== 'object' ||
    !isNonEmptyString((message as { messageId?: unknown }).messageId) ||
    (message as { conversationId?: unknown }).conversationId !== scope.parentConversationId
  ) {
    throw new Error('The parent message was not persisted.');
  }
}

function selectLatestBranch(messages: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  const branch: ThreadMessage[] = [];
  const seen = new Set<string>();
  let current: ThreadMessage | undefined = messages[messages.length - 1];
  while (current != null && !seen.has(current.messageId)) {
    branch.push(current);
    seen.add(current.messageId);
    const parentId: string | undefined = current.parentMessageId ?? undefined;
    current =
      parentId == null || parentId === '' || parentId === Constants.NO_PARENT
        ? undefined
        : byId.get(parentId);
  }
  return branch.reverse();
}

function parseStoredMessages(value: string): StoredMessage[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new SubagentThreadPublicError('Invalid persisted subagent transcript.');
  }
  for (const message of parsed) {
    if (
      message == null ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      !isNonEmptyString((message as { type?: unknown }).type) ||
      (message as { data?: unknown }).data == null ||
      typeof (message as { data?: unknown }).data !== 'object' ||
      Array.isArray((message as { data?: unknown }).data)
    ) {
      throw new SubagentThreadPublicError('Invalid persisted subagent transcript.');
    }
  }
  return parsed as StoredMessage[];
}

function restoreThreadMessages(branch: ThreadMessage[]): BaseMessage[] {
  let storedMessages: StoredMessage[] = [];
  for (const message of branch) {
    const transcript = message.subagentTranscript;
    if (transcript == null) {
      continue;
    }
    const segment = parseStoredMessages(transcript.messagesJson);
    if (transcript.mode === 'replace') {
      storedMessages = segment;
    } else {
      storedMessages.push(...segment);
    }
  }
  return mapStoredMessagesToChatMessages(storedMessages);
}

function isStoredPrefix(prefix: StoredMessage[], messages: StoredMessage[]): boolean {
  if (prefix.length > messages.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (JSON.stringify(prefix[index]) !== JSON.stringify(messages[index])) {
      return false;
    }
  }
  return true;
}

function serializeTranscript(
  taskId: string,
  initialMessages: StoredMessage[],
  resultMessages: BaseMessage[] | undefined,
): IMessage['subagentTranscript'] {
  if (resultMessages == null) {
    return undefined;
  }
  const storedResult = mapChatMessagesToStoredMessages(resultMessages);
  const storedResultJson = JSON.stringify(storedResult);
  if (Buffer.byteLength(storedResultJson, 'utf8') > MAX_TRANSCRIPT_BYTES) {
    throw new SubagentThreadPublicError(
      'Subagent thread transcript is too large to persist safely.',
    );
  }
  const append = isStoredPrefix(initialMessages, storedResult);
  const messages = append ? storedResult.slice(initialMessages.length) : storedResult;
  if (messages.length === 0) {
    return undefined;
  }
  const messagesJson = append ? JSON.stringify(messages) : storedResultJson;
  return {
    taskId,
    mode: append ? 'append' : 'replace',
    messagesJson,
  };
}

function retentionFields(conversation: IConversation): {
  isTemporary?: boolean;
  expiredAt?: Date;
  tenantId?: string;
} {
  return {
    ...(conversation.isTemporary == null ? {} : { isTemporary: conversation.isTemporary }),
    ...(conversation.expiredAt == null ? {} : { expiredAt: conversation.expiredAt }),
    ...(conversation.tenantId == null ? {} : { tenantId: conversation.tenantId }),
  };
}

function childAgentId(request: SubagentTaskStartRequest): string | undefined {
  if (request.subagentKind === 'graph') {
    return undefined;
  }
  return request.subagentType === 'self' ? request.parentAgentId : request.subagentType;
}

function publicFailureDetail(error: unknown): string {
  return error instanceof SubagentThreadPublicError
    ? error.message.slice(0, 2_000)
    : 'The child run could not be completed.';
}

/** Rebuilds the terminal claim a recovered durable result stands for. */
function recoveredClaim(
  message: IMessage,
  claim: Extract<SubagentTaskClaim, { status: 'claimed' }>,
): SubagentTaskClaim | undefined {
  const status = message.subagentTask?.status;
  const content = message.text ?? '';
  /** A durable child message keeps the untruncated output, so recovering one applies
   * the same bounds a routed response would have. */
  if (status === 'completed') {
    return boundedClaim({ status: 'completed', task: claim.task, result: content });
  }
  if (status === 'error' || status === 'cancelled') {
    return boundedClaim({ status, task: claim.task, error: content });
  }
  return undefined;
}

function drainKey(parentConversationId: string, taskId: string): string {
  return `${parentConversationId}\u0000${taskId}`;
}

function safeErrorMessage(error: unknown): string {
  return `Subagent task failed: ${publicFailureDetail(error).slice(0, 2_000)}`;
}

async function observeSlowPreparation<T>(
  operation: Promise<T>,
  context: { stage: string; taskId: string; threadId: string },
): Promise<T> {
  const warning = setTimeout(() => {
    logger.warn('[subagentThreads] Child-thread preparation is still waiting', context);
  }, SLOW_PREPARATION_WARN_MS);
  warning.unref?.();
  try {
    return await operation;
  } finally {
    clearTimeout(warning);
  }
}

/** Persists view-only logical child threads with owner-routed controls and a shared execution fence. */
export class SubagentThreadTaskStore extends InMemorySubagentTaskStore {
  readonly supportsThreadContinuation = true;
  private readonly activeThreads = new Map<string, TaskThreadLease>();
  private readonly controlInvocations = new Map<
    string,
    { scopeId: string; taskId: string; fingerprint: string; result: SubagentTaskControlResult }
  >();

  private readonly parentPersistence = new Map<string, Promise<unknown>>();
  private readonly maxThreadDepth: number;
  private readonly leaseTtlMs: number;
  private readonly leaseHeartbeatMs: number;
  private readonly ownerDrainTimeoutMs: number;
  private readonly ownerDrainPollMs: number;
  private readonly taskRoutingTtlMs: number;
  private readonly maxControlInvocations: number;
  private readonly ownerFenceGraceMs: number;
  private readonly isOwnerActive: (userId: string) => Promise<boolean>;
  private readonly fenceOwnerAdmission?: (
    userId: string,
    token: string,
    fencedUntil: Date,
  ) => Promise<void>;

  private readonly renewOwnerAdmission?: (
    userId: string,
    token: string,
    fencedUntil: Date,
  ) => Promise<boolean>;

  private readonly releaseOwnerAdmission?: (userId: string, token: string) => Promise<void>;
  private readonly onTaskPrepared?: SubagentThreadTaskStoreOptions['onTaskPrepared'];
  private taskControlTransport?: SubagentTaskControlTransport;

  constructor(
    private readonly methods: SubagentThreadMethods,
    options: SubagentThreadTaskStoreOptions = {},
  ) {
    super(options);
    this.maxThreadDepth =
      Number.isSafeInteger(options.maxThreadDepth) && (options.maxThreadDepth ?? 0) > 0
        ? (options.maxThreadDepth as number)
        : DEFAULT_MAX_THREAD_DEPTH;
    this.leaseTtlMs = positiveInteger(options.leaseTtlMs, DEFAULT_LEASE_TTL_MS);
    this.leaseHeartbeatMs = Math.min(
      positiveInteger(options.leaseHeartbeatMs, DEFAULT_LEASE_HEARTBEAT_MS),
      Math.max(1, Math.floor(this.leaseTtlMs / 2)),
    );
    this.ownerDrainTimeoutMs = positiveInteger(
      options.ownerDrainTimeoutMs,
      DEFAULT_OWNER_DRAIN_TIMEOUT_MS,
    );
    this.ownerDrainPollMs = positiveInteger(options.ownerDrainPollMs, DEFAULT_OWNER_DRAIN_POLL_MS);
    this.taskRoutingTtlMs = positiveInteger(options.taskRoutingTtlMs, DEFAULT_TASK_ROUTING_TTL_MS);
    this.maxControlInvocations = positiveInteger(
      options.maxControlInvocations,
      MAX_CONTROL_INVOCATIONS,
    );
    this.ownerFenceGraceMs = positiveInteger(options.ownerFenceGraceMs, OWNER_FENCE_GRACE_MS);
    this.isOwnerActive = options.isOwnerActive ?? (async () => true);
    this.fenceOwnerAdmission = options.fenceOwnerAdmission;
    this.renewOwnerAdmission = options.renewOwnerAdmission;
    this.releaseOwnerAdmission = options.releaseOwnerAdmission;
    this.onTaskPrepared = options.onTaskPrepared;
  }

  /** Enables optional cross-replica lookup after the host's Redis service is ready. */
  async configureTaskControlTransport(transport: SubagentTaskControlTransport): Promise<void> {
    if (this.taskControlTransport != null) {
      throw new Error('Subagent task control transport is already configured.');
    }
    await transport.bind({
      claim: (scopeId, taskId) => super.claim(scopeId, taskId),
      control: (scopeId, taskId, command, invocationId) =>
        this.controlInvocation(scopeId, taskId, command, invocationId),
      list: (scopeId) => super.list(scopeId),
      cancelScope: (scopeId, threadIds) => this.cancelForScope(scopeId, threadIds),
    });
    this.taskControlTransport = transport;
  }

  async destroyTaskControlTransport(): Promise<void> {
    const transport = this.taskControlTransport;
    this.taskControlTransport = undefined;
    await transport?.destroy();
  }

  /** Gates child creation on the ordinary parent write without retaining request state. */
  registerParentPersistence(scopeId: string, persistence: Promise<unknown>): void {
    const scope = parseScope(scopeId);
    const gate = Promise.resolve(persistence).then((result) => {
      assertParentPersistence(result, scope);
      return result;
    });
    this.parentPersistence.set(scopeId, gate);
    void gate
      .then(() => {
        if (this.parentPersistence.get(scopeId) === gate) {
          this.parentPersistence.delete(scopeId);
        }
      })
      .catch(() => undefined);
  }

  override start(request: SubagentTaskStartRequest): SubagentTaskStartResult {
    if (request.subagentKind !== 'agent' && request.subagentKind !== 'graph') {
      throw new Error('Subagent task kind must be agent or graph.');
    }
    const scope = parseScope(request.scopeId);
    const parentReady = this.parentPersistence.get(request.scopeId);
    const requestedThreadId = request.threadId?.trim();
    const isContinuation = requestedThreadId != null && requestedThreadId !== '';
    const idempotencyKey = request.idempotencyKey.trim();
    const threadId = isContinuation
      ? requestedThreadId
      : createSubagentThreadId(request.scopeId, idempotencyKey);
    const lockKey = `${request.scopeId}\u0000${threadId}`;
    const active = this.activeThreads.get(lockKey);
    if (active != null && active.idempotencyKey !== idempotencyKey) {
      return { accepted: false, reason: 'capacity' };
    }

    const lease: TaskThreadLease = active ?? {
      idempotencyKey,
      taskId: '',
      running: false,
      settling: false,
    };
    const ownsLease = active == null;
    if (ownsLease) {
      this.activeThreads.set(lockKey, lease);
    }

    let started: SubagentTaskStartResult;
    try {
      started = super.start({
        ...request,
        threadId,
        run: (runtime: SubagentTaskRuntime) =>
          this.runWithOwnerContext(scope, async () => {
            lease.taskId = runtime.taskId;
            lease.running = true;
            const detachedUsage: UsageMetadata[] = [];
            let prepared: PreparedThread | undefined;
            try {
              if (runtime.signal.aborted) {
                throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
              }
              /** Publish the owner address before any provider work: a child running
               * while unaddressable cannot be polled, controlled, or cancelled, and its
               * side effects would already have happened by the time a heartbeat
               * republished it. A failed registration fails the task closed instead. */
              await this.taskControlTransport?.registerTask(
                request.scopeId,
                runtime.taskId,
                this.taskRoutingTtlMs,
              );
              await parentReady;
              prepared = await this.prepareThread(
                request.scopeId,
                scope,
                threadId,
                isContinuation,
                request,
                runtime.taskId,
                lease,
              );
              await this.registerTaskWakeup(scope, prepared.conversation.conversationId, request, {
                taskId: prepared.replay?.taskId ?? runtime.taskId,
                parentRunId: prepared.replay?.parentRunId ?? request.parentRunId,
                createdAt: prepared.taskCreatedAt,
              });
              if (runtime.signal.aborted) {
                throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
              }
              if (prepared.replay != null) {
                if (prepared.replay.status === 'completed') {
                  return { content: prepared.replay.content };
                }
                throw new SubagentThreadPublicError(prepared.replay.content);
              }
              if (!(await this.renewSharedLease(scope, threadId, lease))) {
                throw new SubagentThreadPublicError(
                  'This child thread is already being continued by another run.',
                );
              }
              const preparedThread = prepared;
              const result = await runWithDetachedSubagentUsage(detachedUsage, () =>
                request.run(runtime, preparedThread.initialMessages),
              );
              if (runtime.signal.aborted) {
                throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
              }
              if (!(await this.renewSharedLease(scope, threadId, lease))) {
                throw new SubagentThreadPublicError(
                  'This child thread is already being continued by another run.',
                );
              }
              lease.settling = true;
              await this.persistResult(
                scope,
                request,
                runtime.taskId,
                prepared,
                result,
                detachedUsage,
              );
              return result;
            } catch (error) {
              /** A replay is already terminal in Mongo. A temporary wakeup-queue
               * outage must not overwrite that canonical result with a new error. */
              if (prepared?.replay != null) {
                throw error;
              }
              const mayPersist =
                lease.shared == null || (await this.renewSharedLease(scope, threadId, lease));
              const terminalTask = this.get(request.scopeId, runtime.taskId);
              if (runtime.signal.aborted && terminalTask?.status === 'cancelled') {
                if (mayPersist) {
                  await this.persistCancellation(
                    scope,
                    threadId,
                    request,
                    runtime.taskId,
                    detachedUsage,
                  ).catch((persistError) => {
                    logger.error(
                      '[subagentThreads] Failed to persist child-thread cancellation',
                      persistError,
                    );
                  });
                }
                throw error;
              }
              logger.error(
                '[subagentThreads] Child-thread execution failed',
                publicFailureDetail(error),
              );
              if (mayPersist) {
                await this.persistFailure(
                  scope,
                  threadId,
                  request,
                  runtime.taskId,
                  error,
                  detachedUsage,
                ).catch((persistError) => {
                  logger.error(
                    '[subagentThreads] Failed to persist child-thread failure',
                    persistError,
                  );
                });
              }
              throw new Error(publicFailureDetail(error));
            } finally {
              await this.stopAndReleaseSharedLease(scope, threadId, lease);
              if (this.activeThreads.get(lockKey) === lease) {
                this.activeThreads.delete(lockKey);
              }
            }
          }),
      });
    } catch (error) {
      if (ownsLease && this.activeThreads.get(lockKey) === lease) {
        this.activeThreads.delete(lockKey);
      }
      throw error;
    }

    if (started.accepted && started.isNew) {
      lease.taskId = started.task.taskId;
    } else if (ownsLease && this.activeThreads.get(lockKey) === lease) {
      this.activeThreads.delete(lockKey);
    }
    return started;
  }

  /** Detached tasks intentionally outlive the HTTP request that admitted them.
   * Reconstruct only the trusted owner identity carried by the opaque task scope
   * so tenant-isolated database reads and lazy child initialization do not depend
   * on request AsyncLocalStorage remaining alive after the parent turn returns. */
  private runWithOwnerContext<T>(scope: SubagentThreadScope, run: () => Promise<T>): Promise<T> {
    return tenantStorage.run(
      {
        userId: scope.userId,
        ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      },
      run,
    );
  }

  /**
   * Claims locally when possible, otherwise asks the registered owning replica.
   *
   * A child's terminal result is durable in its own thread, so collection is recorded
   * there against the polling invocation rather than kept alive in the owner's memory.
   * The invocation that lost a response re-acquires its own result on the next poll;
   * a different invocation is told the result was already collected. Owner-side
   * retention stays a fast path, free to expire, instead of the only copy.
   */
  async claimTask(
    scopeId: string,
    taskId: string,
    invocationId?: string,
  ): Promise<SubagentTaskClaim> {
    const local = super.claim(scopeId, taskId);
    const claim =
      local.status !== 'not_found'
        ? local
        : ((await this.taskControlTransport?.claim(scopeId, taskId)) ?? local);
    if (invocationId == null || claim.status === 'running') {
      return claim;
    }
    if (claim.status === 'not_found') {
      return this.claimDurableTaskResult(scopeId, taskId, invocationId);
    }
    const threadId = claim.task.threadId;
    if (threadId == null || threadId === '') {
      return claim;
    }
    /** The durable record decides who holds this one-shot result. The invocation that
     * already consumed it re-acquires and is handed it again, a second invocation is
     * told it was collected instead of being given a duplicate, and a task with no
     * durable record to arbitrate keeps whatever the owner just answered. */
    const collected = await this.assignResultClaim(
      parseScope(scopeId).userId,
      threadId,
      claim.task.taskId,
      invocationId,
    );
    if (collected.status === 'claimed') {
      return { status: 'claimed', task: claim.task };
    }
    if (collected.status === 'not_found') {
      return claim;
    }
    return claim.status === 'claimed' ? (recoveredClaim(collected.message, claim) ?? claim) : claim;
  }

  /**
   * Recovers a terminal task after its owning process and Redis registration are gone.
   * The task id locates only a candidate; durable child lineage re-establishes the
   * trusted parent scope before the one-shot result is claimed.
   */
  private async claimDurableTaskResult(
    scopeId: string,
    taskId: string,
    invocationId: string,
  ): Promise<SubagentTaskClaim> {
    const scope = parseScope(scopeId);
    let message: IMessage | undefined;
    try {
      [message] = await this.methods.getMessages(
        {
          user: scope.userId,
          messageId: `${taskId}:assistant`,
          'subagentTask.status': { $in: ['completed', 'error', 'cancelled'] },
        },
        DURABLE_RESULT_SELECT,
        { limit: 1, sort: false },
      );
    } catch (error) {
      logger.warn('[subagentThreads] Failed to locate a durable child result', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
    const threadId = message?.conversationId;
    const status = message?.subagentTask?.status;
    if (
      message == null ||
      !isNonEmptyString(threadId) ||
      !isNonEmptyString(message.sender) ||
      (status !== 'completed' && status !== 'error' && status !== 'cancelled')
    ) {
      return { status: 'not_found' };
    }

    let parent: IConversation | null;
    let conversation: IConversation | null;
    try {
      [parent, conversation] = await Promise.all([
        this.methods.getConvo(scope.userId, scope.parentConversationId),
        this.methods.getConvo(scope.userId, threadId),
      ]);
    } catch (error) {
      logger.warn('[subagentThreads] Failed to verify durable child lineage', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
    const lineage = conversation?.subagentThread;
    if (
      parent == null ||
      conversation == null ||
      lineage == null ||
      conversation.endpoint !== EModelEndpoint.agents ||
      lineage.parentConversationId !== scope.parentConversationId ||
      lineage.subagentType !== message.sender ||
      lineage.depth > this.maxThreadDepth ||
      !matchesTenant(parent.tenantId, scope.tenantId) ||
      !matchesTenant(conversation.tenantId, scope.tenantId)
    ) {
      return { status: 'not_found' };
    }

    const createdAt = message.createdAt?.getTime();
    const updatedAt = message.updatedAt?.getTime() ?? createdAt;
    if (createdAt == null || updatedAt == null) {
      return { status: 'not_found' };
    }
    const task: SubagentTaskSnapshot = {
      taskId,
      threadId,
      subagentType: lineage.subagentType,
      status,
      createdAt,
      updatedAt,
      resultAvailable: true,
      resultClaimed: true,
      pendingControls: 0,
      ...(status === 'completed' ? {} : { error: message.text ?? '' }),
    };
    const collected = await this.assignResultClaim(scope.userId, threadId, taskId, invocationId);
    if (collected.status === 'not_found') {
      return { status: 'not_found' };
    }
    if (collected.status === 'claimed') {
      return { status: 'claimed', task };
    }
    return (
      recoveredClaim(collected.message, { status: 'claimed', task }) ?? {
        status: 'not_found',
      }
    );
  }

  /**
   * Assigns one durable terminal result to the invocation collecting it. A failed
   * write is not an absent record: handing the result over without recording its
   * claimant would let another invocation acquire the same one-shot output once the
   * database recovers, so this reports the retryable path and leaves the result
   * unclaimed for a later poll.
   */
  private async assignResultClaim(
    userId: string,
    threadId: string,
    taskId: string,
    invocationId: string,
  ): Promise<SubagentTaskResultClaim> {
    try {
      return await this.methods.claimSubagentTaskResult({
        userId,
        conversationId: threadId,
        taskId,
        kind: 'manual',
        claimId: invocationId,
      });
    } catch (error) {
      logger.warn('[subagentThreads] Failed to record a collected child result', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
  }

  /**
   * Controls locally when possible, otherwise asks the registered owning replica.
   * `invocationId` identifies one caller invocation: a routed retransmission of that
   * invocation replays the owner's result, while a fresh invocation applies again even
   * when its action and message are identical.
   */
  async controlTask(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
    invocationId: string = randomUUID(),
  ): Promise<SubagentTaskControlResult> {
    const local = this.controlInvocation(scopeId, taskId, command, invocationId);
    if (local.status !== 'not_found') {
      return local;
    }
    return (
      (await this.taskControlTransport?.control(scopeId, taskId, command, invocationId)) ?? local
    );
  }

  /**
   * Applies one logical control exactly once for its owning task. Idempotency lives
   * here rather than in the transport so a local and a routed caller of the same
   * invocation agree, and it is keyed by task as well as invocation because provider
   * tool-call ids repeat across runs and agents.
   */
  controlInvocation(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
    invocationId: string,
  ): SubagentTaskControlResult {
    const key = `${scopeId}\u0000${taskId}\u0000${invocationId}`;
    const fingerprint = controlFingerprint(command);
    const applied = this.controlInvocations.get(key);
    if (applied != null) {
      /** One invocation is one command; reusing its id for different content is a
       * caller error rather than a retry, so it is refused instead of applied. */
      return applied.fingerprint === fingerprint
        ? applied.result
        : {
            status: 'invalid',
            message: 'This control invocation id was already used for a different command.',
          };
    }
    if (this.get(scopeId, taskId) == null) {
      /** Not this replica's task. Refusing here would keep the command from ever
       * reaching its owner, so local load cannot veto a remote cancellation: the
       * owner applies its own window to the routed request. */
      return this.control(scopeId, taskId, command);
    }
    if (!this.makeRoomForInvocation()) {
      /** Every tracked invocation belongs to a task this store still holds. Applying
       * this command without room to record it would let a caller retry apply it a
       * second time, so it is refused before the child is touched at all. */
      logger.warn('[subagentThreads] Refused a control; live invocation records are full');
      return {
        status: 'invalid',
        message: 'Too many control invocations are in flight for this process; retry shortly.',
      };
    }
    const result = this.control(scopeId, taskId, command);
    if (result.status === 'not_found') {
      return result;
    }
    this.controlInvocations.set(key, { scopeId, taskId, fingerprint, result });
    return result;
  }

  /**
   * Frees invocation slots by dropping records whose task the store no longer holds:
   * a settled task cannot be controlled again, so its record is worthless, while a
   * live one is exactly what a caller retry needs to replay instead of applying its
   * command twice. The sweep runs only when the window is full and clears every dead
   * record at once, so it is amortized rather than repeated per control.
   */
  private makeRoomForInvocation(): boolean {
    if (this.controlInvocations.size < this.maxControlInvocations) {
      return true;
    }
    for (const [key, invocation] of this.controlInvocations) {
      if (this.get(invocation.scopeId, invocation.taskId) == null) {
        this.controlInvocations.delete(key);
      }
    }
    return this.controlInvocations.size < this.maxControlInvocations;
  }

  /** Returns this process's tasks plus tasks reported by registered remote owners. */
  async listTasks(scopeId: string): Promise<SubagentTaskSnapshot[]> {
    const local = super.list(scopeId);
    const remote = (await this.taskControlTransport?.list(scopeId)) ?? [];
    const byId = new Map(local.map((task) => [task.taskId, task]));
    for (const task of remote) {
      byId.set(task.taskId, task);
    }
    /** The remote aggregation and each owner's reply carry their own bound, but this
     * merge is what the poll tool reads: without a cap here the list the model sees is
     * that bound plus however many children this replica happens to own. */
    return boundedTaskList([...byId.values()]);
  }

  /** Fast capability probe used while deciding whether a later turn needs the poll tool. */
  async hasTasks(scopeId: string): Promise<boolean> {
    if (super.list(scopeId).length > 0) {
      return true;
    }
    return (await this.taskControlTransport?.hasTasks(scopeId)) ?? false;
  }

  override control(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
  ): SubagentTaskControlResult {
    const snapshot = this.get(scopeId, taskId);
    const lockKey = snapshot?.threadId == null ? undefined : `${scopeId}\u0000${snapshot.threadId}`;
    const lease = lockKey == null ? undefined : this.activeThreads.get(lockKey);
    if (lease?.taskId === taskId && lease.settling) {
      return { status: 'not_running', task: snapshot };
    }
    const result = super.control(scopeId, taskId, command);
    if (
      command.action === 'cancel' &&
      result.status === 'cancelled' &&
      lockKey != null &&
      lease?.taskId === taskId &&
      !lease.running
    ) {
      this.activeThreads.delete(lockKey);
    }
    return result;
  }

  /** Finds a provisional child lease before its conversation is durable. */
  isThreadActiveForOwner(userId: string, threadId: string, tenantId?: string): boolean {
    const suffix = `\u0000${threadId}`;
    for (const lockKey of this.activeThreads.keys()) {
      if (!lockKey.endsWith(suffix)) {
        continue;
      }
      const scope = parseScope(lockKey.slice(0, -suffix.length));
      if (scope.userId === userId && matchesTenant(scope.tenantId, tenantId)) {
        return true;
      }
    }
    return false;
  }

  /** Cancels active descendants before their owning conversations are removed. */
  cancelForConversations(
    userId: string,
    conversationIds: Iterable<string>,
    tenantId?: string,
  ): number {
    const targets = new Set(conversationIds);
    return this.cancelMatchingThreads(
      (scope, threadId) =>
        scope.userId === userId &&
        matchesTenant(scope.tenantId, tenantId) &&
        (targets.has(scope.parentConversationId) || targets.has(threadId)),
    );
  }

  /**
   * Resolves every cancellation target while the conversations still exist. The plan is
   * replayed after deletion, when those rows can no longer be read back, so the second
   * pass only has to reach registered owners through Redis.
   */
  async planCancellationForConversations(
    userId: string,
    conversationIds: Iterable<string>,
    tenantId?: string,
  ): Promise<SubagentCancellationPlan> {
    const targetIds = [...new Set(conversationIds)];
    const plan: SubagentCancellationPlan = {
      userId,
      ...(tenantId == null ? {} : { tenantId }),
      conversationIds: targetIds,
      scopes: [],
      leases: [],
    };
    if (targetIds.length === 0 || this.taskControlTransport == null) {
      return plan;
    }
    const targets = new Set(targetIds);
    const scopeIdFor = (parentConversationId: string): string =>
      serializeScope({
        userId,
        parentConversationId,
        ...(tenantId ? { tenantId } : {}),
      });
    /** Deleting a conversation takes its whole scope; a deleted child only cancels its
     * own thread inside a parent scope that survives. */
    const conversations = await Promise.all(
      targetIds.map((conversationId) => this.methods.getConvo(userId, conversationId)),
    );
    const threadTargetsByParent = new Map<string, Set<string>>();
    for (const [index, conversation] of conversations.entries()) {
      const parentConversationId = conversation?.subagentThread?.parentConversationId;
      if (
        parentConversationId == null ||
        targets.has(parentConversationId) ||
        !matchesTenant(conversation?.tenantId, tenantId)
      ) {
        continue;
      }
      const threadIds = threadTargetsByParent.get(parentConversationId) ?? new Set<string>();
      threadIds.add(targetIds[index]);
      threadTargetsByParent.set(parentConversationId, threadIds);
    }
    plan.scopes = [
      ...targetIds.map((parentConversationId) => ({
        scopeId: scopeIdFor(parentConversationId),
        threadIds: null,
      })),
      ...[...threadTargetsByParent].map(([parentConversationId, threadIds]) => ({
        scopeId: scopeIdFor(parentConversationId),
        threadIds: [...threadIds],
      })),
    ];
    /** Captured now so descendants removed by the cascade stay reachable afterwards. */
    plan.leases = await this.methods.listActiveSubagentThreadLeases({
      user: userId,
      now: new Date(),
      ...(tenantId == null ? {} : { tenantId }),
    });
    return plan;
  }

  /**
   * Cancels local children and replays a plan against registered remote owners.
   * `removedConversationIds` extends it with the cascade a deletion reported, matched
   * against leases captured before those rows were removed.
   */
  async cancelPlan(
    plan: SubagentCancellationPlan,
    removedConversationIds: Iterable<string> = [],
  ): Promise<number> {
    const { userId, tenantId } = plan;
    const planned = new Set(plan.conversationIds);
    const removed = new Set(removedConversationIds);
    /** A cascade can remove descendants the plan never named — a grandchild lives in
     * its own parent's scope, not the deleted root's — so every removed conversation
     * is cancelled as a scope of its own. */
    const targets = [...new Set([...planned, ...removed])];
    let cancelled = this.cancelForConversations(userId, targets, tenantId);
    const transport = this.taskControlTransport;
    if (transport == null) {
      return cancelled;
    }
    const cancelSlot = createConcurrencyLimiter(DELETION_CANCEL_CONCURRENCY);
    const cascadeScopes = [...removed]
      .filter((conversationId) => !planned.has(conversationId))
      .map((parentConversationId) => ({
        scopeId: serializeScope({
          userId,
          parentConversationId,
          ...(tenantId ? { tenantId } : {}),
        }),
        threadIds: null,
      }));
    const scopeCancellations = [...plan.scopes, ...cascadeScopes].map((scope) =>
      cancelSlot(() => transport.cancelScope(scope.scopeId, scope.threadIds)),
    );
    const leaseCancellations = plan.leases
      .filter(
        (lease) => removed.has(lease.parentConversationId) || removed.has(lease.conversationId),
      )
      .map((lease) =>
        cancelSlot(() =>
          this.controlTask(
            serializeScope({
              userId,
              parentConversationId: lease.parentConversationId,
              ...(tenantId ? { tenantId } : {}),
            }),
            lease.taskId,
            { action: 'cancel' },
          ),
        ),
      );
    for (const count of await Promise.all(scopeCancellations)) {
      cancelled += count;
    }
    for (const result of await Promise.all(leaseCancellations)) {
      if (result.status === 'cancelled') {
        cancelled += 1;
      }
    }
    return cancelled;
  }

  /** Cancels this process's live children for one scope, optionally narrowed to threads. */
  private cancelForScope(scopeId: string, threadIds: string[] | null): number {
    const scope = parseScope(scopeId);
    const targets = threadIds == null ? null : new Set(threadIds);
    return this.cancelMatchingThreads(
      (candidate, threadId) =>
        candidate.userId === scope.userId &&
        candidate.parentConversationId === scope.parentConversationId &&
        matchesTenant(candidate.tenantId, scope.tenantId) &&
        (targets == null || targets.has(threadId)),
    );
  }

  /** Cancels every active child owned by a user before a delete-all operation. */
  cancelForOwner(userId: string, tenantId?: string): number {
    return this.cancelMatchingThreads(
      (scope) => scope.userId === userId && matchesTenant(scope.tenantId, tenantId),
    );
  }

  /**
   * Deletes an owner's conversations behind a durable admission fence. Draining alone
   * cannot close the race: a child admitted on another replica after the drain read
   * its leases would begin provider work against a parent that is about to disappear.
   * Fencing first inverts that — the fence is written before any lease is read, and a
   * child validates the fence after its own lease is written, so one of the two always
   * observes the other. The fence expires by itself, so a process lost mid-deletion
   * cannot leave the account unable to run subagents.
   */
  async withOwnerDeletionFence<T>(
    userId: string,
    tenantId: string | undefined,
    deletion: () => Promise<T>,
  ): Promise<T> {
    const fenceWindowMs = this.ownerDrainTimeoutMs + this.ownerFenceGraceMs;
    const token = randomUUID();
    /** Only a confirmed write moves this, so a run of failed renewals leaves it in the
     * past and the deletion can tell that its fence is no longer guaranteed. */
    let fencedUntil = Date.now() + fenceWindowMs;
    let fenceLapsed = false;
    await this.fenceOwnerAdmission?.(userId, token, new Date(fencedUntil));
    /** A very large account, or a stalled database, can outlast one fence window, and
     * a fence that expires mid-deletion lets another replica admit a child against
     * conversations being deleted. It is renewed for as long as the work runs. */
    let releasing = false;
    let inFlight: Promise<void> | undefined;
    const renewal = setInterval(
      () => {
        if (inFlight != null) {
          return;
        }
        inFlight = (async () => {
          const deadline = fencedUntil;
          const renewedUntil = Date.now() + fenceWindowMs;
          const held = await this.renewOwnerAdmission?.(userId, token, new Date(renewedUntil));
          if (held === false) {
            /** The durable entry was absent, so admission may already have opened even
             * when the local deadline has not passed. Reacquire for containment, but
             * retain the lapse so the enclosing deletion re-drains before success. */
            fenceLapsed = true;
            if (releasing) {
              return;
            }
            /** The entry is gone — expired, or pruned by another deletion — so this
             * deletion takes its fence again rather than running on unfenced. */
            await this.fenceOwnerAdmission?.(userId, token, new Date(renewedUntil));
          }
          if (Date.now() >= deadline) {
            /** The write only landed after the deadline it was meant to extend, so
             * admission stood open in between and a child could have taken a lease the
             * drain had already read past. A fence cannot be restored backwards over
             * that gap, so the lapse is recorded rather than papered over. */
            fenceLapsed = true;
            return;
          }
          fencedUntil = renewedUntil;
        })()
          .catch((error) => {
            logger.warn('[subagentThreads] Failed to hold the owner admission fence', error);
          })
          .finally(() => {
            inFlight = undefined;
          });
      },
      Math.max(1, Math.floor(fenceWindowMs / 3)),
    );
    renewal.unref?.();
    const stopRenewal = async (): Promise<void> => {
      clearInterval(renewal);
      await inFlight;
    };
    const fenceHeld = (): boolean =>
      this.fenceOwnerAdmission == null || (!fenceLapsed && Date.now() < fencedUntil);
    try {
      await this.cancelAndDrainForOwner(userId, tenantId);
      /** The drain can outlast the fence window when the database is unreachable, and
       * renewals that keep failing leave the account open to admitting a child against
       * conversations about to disappear. Nothing has been removed yet, so this fails
       * closed and the caller retries once the fence can be held again. */
      if (!fenceHeld()) {
        throw new Error('The subagent admission fence expired before this deletion began.');
      }
      const deleted = await deletion();
      /** Settle a renewal already in flight before deciding whether deletion crossed a
       * gap. Otherwise a late write can report the lapse only after this check and the
       * finally block would release the fence without re-draining. */
      await stopRenewal();
      if (!fenceHeld()) {
        /** The rows are gone, but the gap can leave a child another replica admitted
         * while the fence was down. Re-take the fence and drain that work before this
         * operation may report success. */
        logger.error(
          '[subagentThreads] Owner deletion outlived its admission fence; draining children admitted in the gap',
        );
        const recoveryUntil = Date.now() + fenceWindowMs;
        const reheld = await this.renewOwnerAdmission?.(userId, token, new Date(recoveryUntil));
        if (reheld !== true) {
          await this.fenceOwnerAdmission?.(userId, token, new Date(recoveryUntil));
        }
        if (Date.now() >= recoveryUntil) {
          throw new Error('The subagent admission fence expired while it was being restored.');
        }
        fencedUntil = recoveryUntil;
        fenceLapsed = false;
        await this.cancelAndDrainForOwner(userId, tenantId);
        if (!fenceHeld()) {
          throw new Error('The subagent admission fence expired while recovering this deletion.');
        }
      }
      return deleted;
    } finally {
      releasing = true;
      await stopRenewal();
      /** `clearInterval` stops only future passes. A renewal still waiting on the
       * database would otherwise find its fence released, read that as expiry, and
       * write a fresh one that nothing is left to lift. */
      /** Only this deletion's own fence is lifted: an overlapping deletion that took a
       * later one keeps admission closed until it finishes. */
      await this.releaseOwnerAdmission?.(userId, token).catch((error) => {
        logger.warn('[subagentThreads] Failed to release the owner admission fence', error);
      });
    }
  }

  /**
   * Cancels local work and waits for every replica's durable lease to drain. Each task
   * is cancelled under one invocation held for the whole drain and only while its
   * owner has not answered: a fresh invocation per poll would retain a replay entry on
   * the owner for every pass, and a task already reported cancelled needs no second
   * command, only its lease to disappear.
   */
  async cancelAndDrainForOwner(userId: string, tenantId?: string): Promise<void> {
    this.cancelForOwner(userId, tenantId);
    const deadline = Date.now() + this.ownerDrainTimeoutMs;
    const invocations = new Map<string, string>();
    const answered = new Set<string>();
    while (true) {
      const activeLeases = await this.methods.listActiveSubagentThreadLeases({
        user: userId,
        now: new Date(),
        ...(tenantId == null ? {} : { tenantId }),
      });
      if (activeLeases.length === 0) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out draining detached subagent tasks for account deletion.');
      }
      const unanswered = activeLeases.filter(
        ({ parentConversationId, taskId }) => !answered.has(drainKey(parentConversationId, taskId)),
      );
      for (let index = 0; index < unanswered.length; index += DELETION_CANCEL_CONCURRENCY) {
        await Promise.all(
          unanswered
            .slice(index, index + DELETION_CANCEL_CONCURRENCY)
            .map(({ parentConversationId, taskId }) =>
              this.cancelDrainedTask(
                { userId, parentConversationId, taskId, tenantId },
                invocations,
                answered,
              ),
            ),
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, this.ownerDrainPollMs));
    }
  }

  /** Sends one drained task's cancellation, retrying only unconfirmed deliveries. */
  private async cancelDrainedTask(
    target: { userId: string; parentConversationId: string; taskId: string; tenantId?: string },
    invocations: Map<string, string>,
    answered: Set<string>,
  ): Promise<void> {
    const { userId, parentConversationId, taskId, tenantId } = target;
    const key = drainKey(parentConversationId, taskId);
    const invocationId = invocations.get(key) ?? randomUUID();
    invocations.set(key, invocationId);
    const scopeId = serializeScope({
      userId,
      parentConversationId,
      ...(tenantId == null ? {} : { tenantId }),
    });
    try {
      const result = await this.controlTask(scopeId, taskId, { action: 'cancel' }, invocationId);
      /** Only the owner confirming the task is stopped ends the commands for it. A
       * `not_found` means its registration is missing while its lease is still live —
       * an unconfirmed delivery, retried once the owner republishes itself. */
      if (result.status === 'cancelled' || result.status === 'not_running') {
        answered.add(key);
      }
    } catch (error) {
      logger.warn('[subagentThreads] Retrying an unconfirmed child cancellation', error);
    }
  }

  private startSharedLeaseHeartbeat(
    scopeId: string,
    scope: SubagentThreadScope,
    threadId: string,
    lease: TaskThreadLease,
  ): void {
    const shared = lease.shared;
    if (shared == null) {
      return;
    }
    const heartbeat = () => {
      if (shared.lost || shared.heartbeatInFlight != null) {
        return;
      }
      const renewal = (async () => {
        let ownerActive = false;
        try {
          ownerActive = await this.isOwnerActive(scope.userId);
        } catch (error) {
          logger.warn('[subagentThreads] Failed to verify the child-thread owner', error);
        }
        if (!ownerActive) {
          const task = this.get(scopeId, lease.taskId);
          if (task?.status === 'running') {
            super.control(scopeId, lease.taskId, { action: 'cancel' });
          }
        }
        if (!(await this.renewSharedLeaseFence(scope, threadId, lease))) {
          const task = this.get(scopeId, lease.taskId);
          if (task?.status === 'running') {
            super.control(scopeId, lease.taskId, { action: 'cancel' });
          }
        }
      })().finally(() => {
        if (shared.heartbeatInFlight === renewal) {
          shared.heartbeatInFlight = undefined;
        }
      });
      shared.heartbeatInFlight = renewal;
    };
    shared.heartbeat = setInterval(heartbeat, this.leaseHeartbeatMs);
    shared.heartbeat.unref?.();
  }

  private async renewSharedLease(
    scope: SubagentThreadScope,
    threadId: string,
    lease: TaskThreadLease,
  ): Promise<boolean> {
    const shared = lease.shared;
    if (shared == null || shared.lost) {
      return false;
    }
    try {
      if (!(await this.isOwnerActive(scope.userId))) {
        return false;
      }
      return this.renewSharedLeaseFence(scope, threadId, lease);
    } catch (error) {
      logger.warn('[subagentThreads] Failed to verify the child-thread owner', error);
      return false;
    }
  }

  private async renewSharedLeaseFence(
    scope: SubagentThreadScope,
    threadId: string,
    lease: TaskThreadLease,
  ): Promise<boolean> {
    const shared = lease.shared;
    if (shared == null || shared.lost) {
      return false;
    }
    try {
      const deadline = shared.expiresAt;
      const now = new Date();
      const renewedUntil = now.getTime() + this.leaseTtlMs;
      const renewed = await this.methods.renewSubagentThreadLease({
        user: scope.userId,
        conversationId: threadId,
        token: shared.token,
        now,
        expiresAt: new Date(renewedUntil),
        ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      });
      if (!renewed) {
        shared.lost = true;
        return false;
      }
      if (Date.now() >= deadline) {
        /** The renewal filter compares against the `now` captured before the call, so a
         * write that only lands after this lease had expired still succeeds and moves
         * the row forward. An owner drain reading active leases in that gap saw this
         * thread as free, so the executor stops rather than run past a deletion that
         * may already have stepped over it. */
        shared.lost = true;
        return false;
      }
      shared.expiresAt = renewedUntil;
      return true;
    } catch (error) {
      shared.lost = true;
      logger.warn('[subagentThreads] Lost the shared child-thread lease', error);
      return false;
    }
  }

  private async stopAndReleaseSharedLease(
    scope: SubagentThreadScope,
    threadId: string,
    lease: TaskThreadLease,
  ): Promise<void> {
    const shared = lease.shared;
    if (shared == null) {
      return;
    }
    if (shared.heartbeat != null) {
      clearInterval(shared.heartbeat);
    }
    await shared.heartbeatInFlight;
    try {
      await this.methods.releaseSubagentThreadLease({
        user: scope.userId,
        conversationId: threadId,
        token: shared.token,
        ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      });
    } catch (error) {
      logger.warn('[subagentThreads] Failed to release the shared child-thread lease', error);
    }
  }

  /** Whether a durable child may be created below the supplied conversation depth. */
  canCreateChildThread(parentDepth: number): boolean {
    return (
      Number.isSafeInteger(parentDepth) && parentDepth >= 0 && parentDepth < this.maxThreadDepth
    );
  }

  private async prepareThread(
    scopeId: string,
    scope: SubagentThreadScope,
    threadId: string,
    isContinuation: boolean,
    request: SubagentTaskStartRequest,
    taskId: string,
    lease: TaskThreadLease,
  ): Promise<PreparedThread> {
    if (!(await this.isOwnerActive(scope.userId))) {
      throw new SubagentThreadPublicError('The thread owner is unavailable.');
    }
    const [parent, existing] = await Promise.all([
      this.methods.getConvo(scope.userId, scope.parentConversationId),
      this.methods.getConvo(scope.userId, threadId),
    ]);
    if (parent == null || !matchesTenant(parent.tenantId, scope.tenantId)) {
      throw new SubagentThreadPublicError('Parent thread is unavailable.');
    }

    let createdThread = false;
    let sharedLeaseAcquired = false;
    try {
      let conversation = existing;
      if (conversation == null && isContinuation) {
        throw new SubagentThreadPublicError(
          'Child thread is unavailable for this subagent and parent scope.',
        );
      }
      if (conversation == null) {
        const parentDepth = parent.subagentThread?.depth ?? 0;
        if (!this.canCreateChildThread(parentDepth)) {
          throw new SubagentThreadPublicError(
            `Subagent thread depth exceeds the configured limit of ${this.maxThreadDepth}.`,
          );
        }
        const depth = parentDepth + 1;
        const agentId = childAgentId(request);
        const reserved = await this.methods.reserveSubagentThread({
          user: scope.userId,
          conversationId: threadId,
          ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
          conversation: {
            conversationId: threadId,
            endpoint: EModelEndpoint.agents,
            title: `Subagent: ${request.subagentType}`.slice(0, 120),
            ...(agentId == null ? {} : { agent_id: agentId }),
            ...retentionFields(parent),
            subagentThread: {
              rootConversationId:
                parent.subagentThread?.rootConversationId ?? scope.parentConversationId,
              parentConversationId: scope.parentConversationId,
              parentMessageId: request.parentRunId || request.parentToolCallId,
              parentToolCallId: request.parentToolCallId,
              ...(request.parentAgentId == null ? {} : { parentAgentId: request.parentAgentId }),
              subagentType: request.subagentType,
              subagentKind: request.subagentKind as 'agent' | 'graph',
              depth,
            },
          },
        });
        conversation = reserved.conversation;
        createdThread = reserved.created;
      }

      this.assertContinuation(scope, request, conversation);
      const sharedToken = randomUUID();
      const now = new Date();
      sharedLeaseAcquired = await this.methods.acquireSubagentThreadLease({
        user: scope.userId,
        conversationId: threadId,
        token: sharedToken,
        taskId,
        now,
        expiresAt: new Date(now.getTime() + this.leaseTtlMs),
        ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      });
      if (!sharedLeaseAcquired) {
        throw new SubagentThreadPublicError(
          'This child thread is already being continued by another run.',
        );
      }
      lease.shared = {
        token: sharedToken,
        lost: false,
        expiresAt: now.getTime() + this.leaseTtlMs,
      };
      this.startSharedLeaseHeartbeat(scopeId, scope, threadId, lease);
      /** Account deletion can fence the owner after the optimistic probe but before
       * this lease exists. Once the lease is visible, revalidate so deletion either
       * observes and drains us or wins before any provider work can begin. */
      if (
        !(await observeSlowPreparation(this.isOwnerActive(scope.userId), {
          stage: 'owner_recheck',
          taskId,
          threadId,
        }))
      ) {
        throw new SubagentThreadDeletedError('The thread owner is unavailable.');
      }
      const allMessages = (await observeSlowPreparation(
        this.methods.getMessages(
          { conversationId: threadId, user: scope.userId },
          TRANSCRIPT_SELECT,
          { sort: { createdAt: 1, _id: 1 } },
        ),
        { stage: 'transcript_read', taskId, threadId },
      )) as ThreadMessage[];
      const attemptKey = createSubagentAttemptKey(scopeId, request.idempotencyKey);
      const requestFingerprint = normalizedRequestFingerprint(request);
      const priorAttempt = allMessages.filter(
        (message) => message.subagentTask?.attemptKey === attemptKey,
      );
      if (priorAttempt.length > 0) {
        if (
          priorAttempt.some(
            (message) => message.subagentTask?.requestFingerprint !== requestFingerprint,
          )
        ) {
          throw new SubagentThreadPublicError(
            'The same parent tool call was already used with different subagent arguments.',
          );
        }
        const terminal = [...priorAttempt]
          .reverse()
          .find((message) => message.subagentTask?.status !== 'running');
        if (terminal?.subagentTask != null) {
          const canonicalTaskId = terminal.messageId.endsWith(':assistant')
            ? terminal.messageId.slice(0, -':assistant'.length)
            : '';
          if (canonicalTaskId === '') {
            throw new Error('The prior subagent result has an invalid task identity.');
          }
          const canonicalStart = priorAttempt.find(
            (message) => message.messageId === `${canonicalTaskId}:user`,
          );
          const taskCreatedAt = durableMessageTime(
            canonicalStart ?? terminal,
            'The prior subagent result has no durable occurrence time.',
          );
          return {
            conversation,
            initialMessages: [],
            initialStoredMessages: [],
            attemptKey,
            taskCreatedAt,
            replay: {
              status: terminal.subagentTask.status as 'completed' | 'error' | 'cancelled',
              taskId: canonicalTaskId,
              parentRunId: terminal.subagentTask.parentRunId ?? request.parentRunId,
              content:
                terminal.text ??
                (terminal.subagentTask.status === 'completed'
                  ? 'Subagent task completed.'
                  : 'The prior subagent task did not complete successfully.'),
            },
          };
        }
        /** Reaching this point while holding the thread lease proves the original
         * worker no longer owns settlement. Close the abandoned attempt once rather
         * than either re-billing it or leaving every retry permanently "running". */
        const abandoned = priorAttempt[priorAttempt.length - 1];
        const abandonedMessage =
          'Subagent task failed: The prior execution ended before its result could be persisted.';
        const savedAbandoned = await this.methods.saveMessage(
          { userId: scope.userId },
          {
            messageId: `${taskId}:assistant`,
            conversationId: threadId,
            parentMessageId: abandoned.messageId,
            sender: request.subagentType,
            text: abandonedMessage,
            endpoint: EModelEndpoint.agents,
            isCreatedByUser: false,
            unfinished: false,
            error: true,
            subagentTask: {
              attemptKey,
              parentRunId: request.parentRunId,
              ...(requestFingerprint == null ? {} : { requestFingerprint }),
              status: 'error',
            },
            ...retentionFields(conversation),
          },
          { context: 'SubagentThreadTaskStore.prepareThread.abandonedAttempt' },
        );
        if (savedAbandoned == null) {
          throw new Error('Unable to close the abandoned subagent attempt.');
        }
        await this.touchAfterMessage(scope, threadId, taskId, 'failed');
        return {
          conversation,
          initialMessages: [],
          initialStoredMessages: [],
          attemptKey,
          taskCreatedAt: durableMessageTime(
            savedAbandoned,
            'The abandoned subagent result has no durable occurrence time.',
          ),
          replay: {
            status: 'error',
            content: abandonedMessage,
            taskId,
            parentRunId: request.parentRunId,
          },
        };
      }
      const branch = selectLatestBranch(allMessages);
      const initialMessages = restoreThreadMessages(branch);
      const userMessageId = `${taskId}:user`;
      /** A crashed lease can leave its input row behind. Continue from the latest
       * terminal task row instead of making that incomplete input canonical. */
      let parentMessageId: string = Constants.NO_PARENT;
      for (let index = branch.length - 1; index >= 0; index -= 1) {
        if (branch[index].messageId.endsWith(':assistant')) {
          parentMessageId = branch[index].messageId;
          break;
        }
      }
      const savedUserMessage = await observeSlowPreparation(
        this.methods.saveMessage(
          { userId: scope.userId },
          {
            messageId: userMessageId,
            conversationId: threadId,
            parentMessageId,
            sender: 'User',
            text: request.input,
            endpoint: EModelEndpoint.agents,
            isCreatedByUser: true,
            subagentTask: {
              attemptKey,
              parentRunId: request.parentRunId,
              ...(requestFingerprint == null ? {} : { requestFingerprint }),
              status: 'running',
            },
            ...retentionFields(conversation),
          },
          { context: 'SubagentThreadTaskStore.prepareThread' },
        ),
        { stage: 'seed_write', taskId, threadId },
      );
      if (savedUserMessage == null) {
        throw new Error('Unable to persist the child-thread input.');
      }
      const currentParent = await this.methods.getConvo(scope.userId, scope.parentConversationId);
      if (currentParent == null || !matchesTenant(currentParent.tenantId, scope.tenantId)) {
        throw new SubagentThreadPublicError('Parent thread is unavailable.');
      }
      return {
        conversation,
        initialMessages,
        initialStoredMessages: mapChatMessagesToStoredMessages(initialMessages),
        attemptKey,
        taskCreatedAt: durableMessageTime(
          savedUserMessage,
          'The child-thread input has no durable occurrence time.',
        ),
        userMessageId,
      };
    } catch (error) {
      if (sharedLeaseAcquired) {
        await this.rollbackPreparation(scope, threadId, taskId, createdThread);
      }
      throw error;
    }
  }

  private assertContinuation(
    scope: SubagentThreadScope,
    request: SubagentTaskStartRequest,
    conversation: IConversation,
  ): void {
    if (!this.isContinuationAllowed(scope, request, conversation)) {
      throw new SubagentThreadPublicError(
        'Child thread is unavailable for this subagent and parent scope.',
      );
    }
  }

  private isContinuationAllowed(
    scope: SubagentThreadScope,
    request: SubagentTaskStartRequest,
    conversation: IConversation,
  ): boolean {
    const lineage = conversation.subagentThread;
    const expectedAgentId = childAgentId(request);
    const agentIdentityMatches =
      request.subagentKind === 'graph'
        ? conversation.agent_id == null
        : conversation.agent_id === expectedAgentId;
    return !(
      lineage == null ||
      conversation.endpoint !== EModelEndpoint.agents ||
      !agentIdentityMatches ||
      lineage.parentConversationId !== scope.parentConversationId ||
      lineage.parentAgentId !== request.parentAgentId ||
      lineage.subagentType !== request.subagentType ||
      lineage.subagentKind !== request.subagentKind ||
      lineage.depth > this.maxThreadDepth ||
      !matchesTenant(conversation.tenantId, scope.tenantId)
    );
  }

  private async persistResult(
    scope: SubagentThreadScope,
    request: SubagentTaskStartRequest,
    taskId: string,
    prepared: PreparedThread,
    result: { content: string; messages?: BaseMessage[] },
    detachedUsage: UsageMetadata[],
  ): Promise<void> {
    if (prepared.userMessageId == null) {
      throw new Error('The child-thread input was not prepared.');
    }
    const subagentTranscript = serializeTranscript(
      taskId,
      prepared.initialStoredMessages,
      result.messages,
    );
    const conversation = await this.requireCurrentConversation(
      scope,
      request,
      prepared.conversation.conversationId,
    );
    const usage = this.aggregateDetachedUsage(detachedUsage);
    const savedAssistantMessage = await this.methods.saveMessage(
      { userId: scope.userId },
      {
        messageId: `${taskId}:assistant`,
        conversationId: conversation.conversationId,
        parentMessageId: prepared.userMessageId,
        sender: request.subagentType,
        text: result.content,
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
        unfinished: false,
        ...(subagentTranscript == null ? {} : { subagentTranscript }),
        subagentTask: {
          attemptKey: prepared.attemptKey,
          parentRunId: request.parentRunId,
          ...(normalizedRequestFingerprint(request) == null
            ? {}
            : { requestFingerprint: normalizedRequestFingerprint(request) }),
          status: 'completed',
        },
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(conversation),
      },
      { context: 'SubagentThreadTaskStore.persistResult' },
    );
    if (savedAssistantMessage == null) {
      throw new Error('Unable to persist the child-thread result.');
    }
    await this.touchAfterMessage(scope, conversation.conversationId, taskId, 'completed');
  }

  private async persistFailure(
    scope: SubagentThreadScope,
    threadId: string,
    request: SubagentTaskStartRequest,
    taskId: string,
    error: unknown,
    detachedUsage: UsageMetadata[],
  ): Promise<void> {
    const conversation = await this.currentConversation(scope, request, threadId);
    if (conversation == null || !(await this.taskInputExists(scope, threadId, taskId))) {
      return;
    }
    const usage = this.aggregateDetachedUsage(detachedUsage);
    const savedFailure = await this.methods.saveMessage(
      { userId: scope.userId },
      {
        messageId: `${taskId}:assistant`,
        conversationId: threadId,
        parentMessageId: `${taskId}:user`,
        sender: request.subagentType,
        text: safeErrorMessage(error),
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
        unfinished: false,
        error: true,
        subagentTask: {
          attemptKey: createSubagentAttemptKey(request.scopeId, request.idempotencyKey),
          parentRunId: request.parentRunId,
          ...(normalizedRequestFingerprint(request) == null
            ? {}
            : { requestFingerprint: normalizedRequestFingerprint(request) }),
          status: 'error',
        },
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(conversation),
      },
      { context: 'SubagentThreadTaskStore.persistFailure' },
    );
    if (savedFailure == null) {
      throw new Error('Unable to persist the child-thread failure.');
    }
    await this.touchAfterMessage(scope, threadId, taskId, 'failed');
  }

  private async registerTaskWakeup(
    scope: SubagentThreadScope,
    threadId: string,
    request: SubagentTaskStartRequest,
    task: { taskId: string; parentRunId: string; createdAt: number },
  ): Promise<void> {
    if (this.onTaskPrepared == null) {
      return;
    }
    await this.onTaskPrepared({
      userId: scope.userId,
      parentConversationId: scope.parentConversationId,
      parentMessageId: task.parentRunId,
      ...(request.parentAgentId == null ? {} : { parentAgentId: request.parentAgentId }),
      ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      taskId: task.taskId,
      threadId,
      subagentType: request.subagentType,
      createdAt: task.createdAt,
    });
  }

  private async persistCancellation(
    scope: SubagentThreadScope,
    threadId: string,
    request: SubagentTaskStartRequest,
    taskId: string,
    detachedUsage: UsageMetadata[],
  ): Promise<void> {
    const conversation = await this.currentConversation(scope, request, threadId);
    if (conversation == null || !(await this.taskInputExists(scope, threadId, taskId))) {
      return;
    }
    const usage = this.aggregateDetachedUsage(detachedUsage);
    const savedCancellation = await this.methods.saveMessage(
      { userId: scope.userId },
      {
        messageId: `${taskId}:assistant`,
        conversationId: threadId,
        parentMessageId: `${taskId}:user`,
        sender: request.subagentType,
        text: 'Subagent task was cancelled.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
        unfinished: false,
        subagentTask: {
          attemptKey: createSubagentAttemptKey(request.scopeId, request.idempotencyKey),
          parentRunId: request.parentRunId,
          ...(normalizedRequestFingerprint(request) == null
            ? {}
            : { requestFingerprint: normalizedRequestFingerprint(request) }),
          status: 'cancelled',
        },
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(conversation),
      },
      { context: 'SubagentThreadTaskStore.persistCancellation' },
    );
    if (savedCancellation == null) {
      throw new Error('Unable to persist the child-thread cancellation.');
    }
    await this.touchAfterMessage(scope, threadId, taskId, 'cancelled');
  }

  private async currentConversation(
    scope: SubagentThreadScope,
    request: SubagentTaskStartRequest,
    threadId: string,
  ): Promise<IConversation | null> {
    const [ownerActive, parent, conversation] = await Promise.all([
      this.isOwnerActive(scope.userId),
      this.methods.getConvo(scope.userId, scope.parentConversationId),
      this.methods.getConvo(scope.userId, threadId),
    ]);
    if (conversation == null || !this.isContinuationAllowed(scope, request, conversation)) {
      return null;
    }
    if (!ownerActive) {
      return null;
    }
    if (parent != null && matchesTenant(parent.tenantId, scope.tenantId)) {
      return conversation;
    }
    await this.methods.deleteConvos(scope.userId, { conversationId: threadId }).catch((error) => {
      logger.warn('[subagentThreads] Failed to remove an orphaned child thread', error);
    });
    return null;
  }

  private cancelMatchingThreads(
    matches: (scope: SubagentThreadScope, threadId: string) => boolean,
  ): number {
    let cancelled = 0;
    for (const [lockKey, lease] of this.activeThreads) {
      const separator = lockKey.lastIndexOf('\u0000');
      if (separator < 0 || lease.taskId === '') {
        continue;
      }
      const scopeId = lockKey.slice(0, separator);
      const threadId = lockKey.slice(separator + 1);
      const scope = parseScope(scopeId);
      if (!matches(scope, threadId)) {
        continue;
      }
      const result = this.control(scopeId, lease.taskId, { action: 'cancel' });
      if (result.status === 'cancelled') {
        cancelled += 1;
      }
    }
    return cancelled;
  }

  private async requireCurrentConversation(
    scope: SubagentThreadScope,
    request: SubagentTaskStartRequest,
    threadId: string,
  ): Promise<IConversation> {
    const conversation = await this.currentConversation(scope, request, threadId);
    if (conversation == null) {
      throw new SubagentThreadDeletedError('Child thread was deleted before settlement.');
    }
    return conversation;
  }

  private async taskInputExists(
    scope: SubagentThreadScope,
    threadId: string,
    taskId: string,
  ): Promise<boolean> {
    const messages = await this.methods.getMessages(
      { conversationId: threadId, user: scope.userId, messageId: `${taskId}:user` },
      'messageId',
      { limit: 1 },
    );
    return messages.length > 0;
  }

  private async rollbackPreparation(
    scope: SubagentThreadScope,
    threadId: string,
    taskId: string,
    createdThread: boolean,
  ): Promise<void> {
    try {
      if (createdThread) {
        await this.methods.deleteConvos(scope.userId, { conversationId: threadId });
        return;
      }
      await this.deleteTaskMessages(scope, threadId, taskId);
    } catch (cleanupError) {
      logger.error('[subagentThreads] Failed to roll back child-thread setup', cleanupError);
    }
  }

  private async deleteTaskMessages(
    scope: SubagentThreadScope,
    threadId: string,
    taskId: string,
  ): Promise<void> {
    await this.methods.deleteMessages({
      user: scope.userId,
      conversationId: threadId,
      messageId: { $in: [`${taskId}:user`, `${taskId}:assistant`] },
    });
  }

  private async touchAfterMessage(
    scope: SubagentThreadScope,
    threadId: string,
    taskId: string,
    outcome: 'cancelled' | 'completed' | 'failed',
  ): Promise<void> {
    try {
      const saved = await this.methods.saveConvo(
        { userId: scope.userId },
        { conversationId: threadId },
        { context: 'SubagentThreadTaskStore.touchAfterMessage', noUpsert: true },
      );
      if (saved == null) {
        throw new SubagentThreadDeletedError('Child thread was deleted before settlement.');
      }
      if ('message' in saved) {
        throw new Error('Unable to refresh the child thread.');
      }
    } catch (error) {
      if (error instanceof SubagentThreadDeletedError) {
        await this.deleteTaskMessages(scope, threadId, taskId);
        throw error;
      }
      logger.error(`[subagentThreads] Failed to refresh ${outcome} child thread`, error);
    }
  }

  private aggregateDetachedUsage(detachedUsage: UsageMetadata[]) {
    return aggregateEmittedUsage(
      detachedUsage.map((entry) => ({ ...entry, usage_type: 'subagent' as const })),
    );
  }
}

const REQUIRED_THREAD_METHODS = [
  'acquireSubagentThreadLease',
  'claimSubagentTaskResult',
  'countActiveSubagentThreadLeases',
  'deleteConvos',
  'deleteMessages',
  'getConvo',
  'getMessages',
  'listActiveSubagentThreadLeases',
  'releaseSubagentThreadLease',
  'renewSubagentThreadLease',
  'reserveSubagentThread',
  'saveConvo',
  'saveMessage',
] as const;

export function createSubagentThreadTaskStore(
  methods: Pick<
    ConversationMethods,
    | 'acquireSubagentThreadLease'
    | 'countActiveSubagentThreadLeases'
    | 'deleteConvos'
    | 'getConvo'
    | 'listActiveSubagentThreadLeases'
    | 'releaseSubagentThreadLease'
    | 'reserveSubagentThread'
    | 'renewSubagentThreadLease'
    | 'saveConvo'
  > &
    Pick<
      MessageMethods,
      'claimSubagentTaskResult' | 'deleteMessages' | 'getMessages' | 'saveMessage'
    >,
  options?: SubagentThreadTaskStoreOptions,
): SubagentThreadTaskStore {
  /** The host wires this from JavaScript, where the parameter type checks nothing. A
   * method missing there would otherwise surface as a routed failure at claim time,
   * long after startup, so the omission is caught here instead. */
  const missing = REQUIRED_THREAD_METHODS.filter(
    (name) => typeof (methods as Record<string, unknown>)[name] !== 'function',
  );
  if (missing.length > 0) {
    throw new Error(`Subagent thread task store is missing methods: ${missing.join(', ')}`);
  }
  return new SubagentThreadTaskStore(methods, options);
}

export function buildSubagentThreadTaskConfig(
  store: SubagentThreadTaskStore,
  scope: Omit<SubagentThreadScope, 'version'>,
): SubagentTaskConfig {
  return {
    store,
    scopeId: serializeScope(scope),
  };
}
