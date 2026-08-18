import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { InMemorySubagentTaskStore } from '@librechat/agents';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@librechat/agents/langchain/messages';
import type {
  InMemorySubagentTaskStoreOptions,
  SubagentTaskConfig,
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskRuntime,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type {
  AllMethods,
  IConversation,
  IMessage,
  MessageMethods,
  ConversationMethods,
} from '@librechat/data-schemas';
import type { BaseMessage, StoredMessage } from '@librechat/agents/langchain/messages';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import { createSubagentAttemptKey, createSubagentThreadId } from './subagentThreadIds';
import { runWithDetachedSubagentUsage } from './subagentTaskContext';
import { aggregateEmittedUsage } from './usage';

const SCOPE_VERSION = 1;
const DEFAULT_MAX_THREAD_DEPTH = 1;
const DEFAULT_LEASE_TTL_MS = 30_000;
const DEFAULT_LEASE_HEARTBEAT_MS = 10_000;
const DEFAULT_OWNER_DRAIN_TIMEOUT_MS = 45_000;
const DEFAULT_OWNER_DRAIN_POLL_MS = 100;
const MAX_TRANSCRIPT_BYTES = 12 * 1024 * 1024;
const TRANSCRIPT_SELECT =
  'messageId parentMessageId text createdAt +subagentTranscript +subagentTask';

class SubagentThreadPublicError extends Error {}
class SubagentThreadDeletedError extends SubagentThreadPublicError {}

type SubagentThreadMethods = Pick<
  AllMethods,
  | 'acquireSubagentThreadLease'
  | 'countActiveSubagentThreadLeases'
  | 'deleteConvos'
  | 'deleteMessages'
  | 'getConvo'
  | 'getMessages'
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
  userMessageId?: string;
  replay?: {
    status: 'completed' | 'error' | 'cancelled';
    content: string;
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
  isOwnerActive?: (userId: string) => Promise<boolean>;
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

function matchesTenant(actual: string | undefined, expected: string | undefined): boolean {
  return actual === expected;
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

function safeErrorMessage(error: unknown): string {
  return `Subagent task failed: ${publicFailureDetail(error).slice(0, 2_000)}`;
}

/** Persists view-only logical child threads with process-local controls and a shared execution fence. */
export class SubagentThreadTaskStore extends InMemorySubagentTaskStore {
  readonly supportsThreadContinuation = true;
  private readonly activeThreads = new Map<string, TaskThreadLease>();
  private readonly parentPersistence = new Map<string, Promise<unknown>>();
  private readonly maxThreadDepth: number;
  private readonly leaseTtlMs: number;
  private readonly leaseHeartbeatMs: number;
  private readonly ownerDrainTimeoutMs: number;
  private readonly ownerDrainPollMs: number;
  private readonly isOwnerActive: (userId: string) => Promise<boolean>;

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
    this.isOwnerActive = options.isOwnerActive ?? (async () => true);
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
        run: async (runtime: SubagentTaskRuntime) => {
          lease.taskId = runtime.taskId;
          lease.running = true;
          const detachedUsage: UsageMetadata[] = [];
          try {
            if (runtime.signal.aborted) {
              throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
            }
            await parentReady;
            const prepared = await this.prepareThread(
              request.scopeId,
              scope,
              threadId,
              isContinuation,
              request,
              runtime.taskId,
              lease,
            );
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
            const result = await runWithDetachedSubagentUsage(detachedUsage, () =>
              request.run(runtime, prepared.initialMessages),
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
        },
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

  /** Cancels every active child owned by a user before a delete-all operation. */
  cancelForOwner(userId: string, tenantId?: string): number {
    return this.cancelMatchingThreads(
      (scope) => scope.userId === userId && matchesTenant(scope.tenantId, tenantId),
    );
  }

  /** Cancels local work and waits for every replica's durable lease to drain. */
  async cancelAndDrainForOwner(userId: string, tenantId?: string): Promise<void> {
    this.cancelForOwner(userId, tenantId);
    const deadline = Date.now() + this.ownerDrainTimeoutMs;
    while (true) {
      const active = await this.methods.countActiveSubagentThreadLeases({
        user: userId,
        now: new Date(),
        ...(tenantId == null ? {} : { tenantId }),
      });
      if (active === 0) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out draining detached subagent tasks for account deletion.');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, this.ownerDrainPollMs));
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
      const now = new Date();
      const renewed = await this.methods.renewSubagentThreadLease({
        user: scope.userId,
        conversationId: threadId,
        token: shared.token,
        now,
        expiresAt: new Date(now.getTime() + this.leaseTtlMs),
        ...(scope.tenantId == null ? {} : { tenantId: scope.tenantId }),
      });
      if (!renewed) {
        shared.lost = true;
      }
      return renewed;
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
      lease.shared = { token: sharedToken, lost: false };
      this.startSharedLeaseHeartbeat(scopeId, scope, threadId, lease);
      /** Account deletion can fence the owner after the optimistic probe but before
       * this lease exists. Once the lease is visible, revalidate so deletion either
       * observes and drains us or wins before any provider work can begin. */
      if (!(await this.isOwnerActive(scope.userId))) {
        throw new SubagentThreadDeletedError('The thread owner is unavailable.');
      }
      const allMessages = (await this.methods.getMessages(
        { conversationId: threadId, user: scope.userId },
        TRANSCRIPT_SELECT,
        { sort: { createdAt: 1, _id: 1 } },
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
          return {
            conversation,
            initialMessages: [],
            initialStoredMessages: [],
            attemptKey,
            replay: {
              status: terminal.subagentTask.status as 'completed' | 'error' | 'cancelled',
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
          replay: { status: 'error', content: abandonedMessage },
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
      const savedUserMessage = await this.methods.saveMessage(
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
            ...(requestFingerprint == null ? {} : { requestFingerprint }),
            status: 'running',
          },
          ...retentionFields(conversation),
        },
        { context: 'SubagentThreadTaskStore.prepareThread' },
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

export function createSubagentThreadTaskStore(
  methods: Pick<
    ConversationMethods,
    | 'acquireSubagentThreadLease'
    | 'countActiveSubagentThreadLeases'
    | 'deleteConvos'
    | 'getConvo'
    | 'releaseSubagentThreadLease'
    | 'reserveSubagentThread'
    | 'renewSubagentThreadLease'
    | 'saveConvo'
  > &
    Pick<MessageMethods, 'deleteMessages' | 'getMessages' | 'saveMessage'>,
  options?: SubagentThreadTaskStoreOptions,
): SubagentThreadTaskStore {
  return new SubagentThreadTaskStore(methods, options);
}

export function buildSubagentThreadTaskConfig(
  store: SubagentThreadTaskStore,
  scope: Omit<SubagentThreadScope, 'version'>,
): SubagentTaskConfig {
  return {
    store,
    scopeId: JSON.stringify({ version: SCOPE_VERSION, ...scope }),
  };
}
