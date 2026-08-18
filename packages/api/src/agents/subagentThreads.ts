import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { InMemorySubagentTaskStore, formatAgentMessages } from '@librechat/agents';
import {
  EModelEndpoint,
  Constants,
  ContentTypes,
  isEphemeralAgentId,
} from 'librechat-data-provider';
import {
  AIMessage,
  HumanMessage,
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
  MessageContentComplex,
} from '@librechat/agents';
import type {
  AllMethods,
  IConversation,
  IMessage,
  MessageMethods,
  ConversationMethods,
} from '@librechat/data-schemas';
import type { BaseMessage, StoredMessage } from '@librechat/agents/langchain/messages';
import type { TMessage } from 'librechat-data-provider';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import { runWithDetachedSubagentUsage } from './subagentTaskContext';
import { formatQuotesAsMarkdown, mergeQuotedText } from '~/utils';
import { ATTACHMENT_ONLY_TEXT } from '~/files/context';
import { aggregateEmittedUsage } from './usage';

const SCOPE_VERSION = 1;
const DEFAULT_MAX_THREAD_DEPTH = 1;
const MAX_TRANSCRIPT_BYTES = 12 * 1024 * 1024;
const TRANSCRIPT_SELECT =
  'messageId parentMessageId text content files attachments quotes isCreatedByUser error createdAt +subagentTranscript';

class SubagentThreadPublicError extends Error {}
class SubagentThreadDeletedError extends SubagentThreadPublicError {}

type SubagentThreadMethods = Pick<
  AllMethods,
  'deleteConvos' | 'deleteMessages' | 'getConvo' | 'getMessages' | 'saveConvo' | 'saveMessage'
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
  forceTranscriptReplacement: boolean;
  userRunnableAfterSettlement: boolean;
  userMessageId: string;
}

interface RestoredThreadMessages {
  messages: BaseMessage[];
  hasVisibleTail: boolean;
}

type ThreadMessage = Pick<
  IMessage,
  | 'messageId'
  | 'parentMessageId'
  | 'text'
  | 'isCreatedByUser'
  | 'error'
  | 'createdAt'
  | 'subagentTranscript'
> & {
  content?: TMessage['content'];
  files?: TMessage['files'];
  attachments?: TMessage['attachments'];
  quotes?: TMessage['quotes'];
};

interface TaskThreadLease {
  kind: 'task';
  idempotencyKey: string;
  taskId: string;
  running: boolean;
  settling: boolean;
}

interface UserTurnThreadLease {
  kind: 'user';
  leaseId: string;
  idempotencyKey?: string;
}

type ActiveThreadLease = TaskThreadLease | UserTurnThreadLease;

export interface SubagentThreadTaskStoreOptions extends InMemorySubagentTaskStoreOptions {
  maxThreadDepth?: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
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

function selectLatestBranch(messages: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  const branch: ThreadMessage[] = [];
  const seen = new Set<string>();
  let current: ThreadMessage | undefined = messages[messages.length - 1];
  while (current != null && !seen.has(current.messageId)) {
    branch.push(current);
    seen.add(current.messageId);
    const parentId: string | null | undefined = current.parentMessageId;
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

function normalizeVisibleContent(
  content: NonNullable<TMessage['content']>,
): MessageContentComplex[] {
  return content.map((part) => {
    const normalized = { ...part };
    if (
      'text' in normalized &&
      normalized.text != null &&
      typeof normalized.text === 'object' &&
      typeof normalized.text.value === 'string'
    ) {
      normalized.text = normalized.text.value;
    }
    return normalized as MessageContentComplex;
  });
}

function isVisibleTextPart(
  part: MessageContentComplex,
): part is MessageContentComplex & { text: string } {
  const candidate = part as { type?: unknown; text?: unknown };
  return candidate.type === ContentTypes.TEXT && typeof candidate.text === 'string';
}

function prependVisibleQuotes(
  content: string | MessageContentComplex[],
  quotes: string[] | undefined,
): string | MessageContentComplex[] {
  if (quotes == null || quotes.length === 0) {
    return content;
  }
  if (typeof content === 'string') {
    return mergeQuotedText(content, quotes);
  }
  const quoteBlock = formatQuotesAsMarkdown(quotes);
  if (quoteBlock === '') {
    return content;
  }
  const textIndex = content.findIndex(isVisibleTextPart);
  if (textIndex < 0) {
    return [{ type: ContentTypes.TEXT, text: quoteBlock }, ...content];
  }
  return content.map((part, index) =>
    index === textIndex && isVisibleTextPart(part)
      ? { ...part, text: mergeQuotedText(part.text, quotes) }
      : part,
  );
}

function restoreVisibleMessage(message: ThreadMessage): BaseMessage[] {
  const role = message.isCreatedByUser ? 'user' : 'assistant';
  let content: string | MessageContentComplex[] =
    message.content != null && message.content.length > 0
      ? normalizeVisibleContent(message.content)
      : (message.text ?? '');
  content = prependVisibleQuotes(content, message.quotes);
  if (
    role === 'user' &&
    content === '' &&
    ((message.files?.length ?? 0) > 0 || (message.attachments?.length ?? 0) > 0)
  ) {
    content = ATTACHMENT_ONLY_TEXT;
  }
  if (content === '' || (Array.isArray(content) && content.length === 0)) {
    return [];
  }
  if (typeof content === 'string') {
    return message.isCreatedByUser
      ? [new HumanMessage(content)]
      : [
          new AIMessage({
            content,
            ...(message.error === true ? { additional_kwargs: { error: true } } : {}),
          }),
        ];
  }
  const restored = formatAgentMessages([{ role, content }]).messages;
  if (message.error === true) {
    for (const restoredMessage of restored) {
      if (restoredMessage instanceof AIMessage) {
        restoredMessage.additional_kwargs = {
          ...restoredMessage.additional_kwargs,
          error: true,
        };
      }
    }
  }
  return restored;
}

function restoreThreadMessages(branch: ThreadMessage[]): RestoredThreadMessages {
  let storedMessages: StoredMessage[] = [];
  let lastTranscriptIndex = -1;
  for (let index = 0; index < branch.length; index += 1) {
    const transcript = branch[index].subagentTranscript;
    if (transcript == null) {
      continue;
    }
    const segment = parseStoredMessages(transcript.messagesJson);
    if (transcript.mode === 'replace') {
      storedMessages = segment;
    } else {
      storedMessages.push(...segment);
    }
    lastTranscriptIndex = index;
  }

  const restored = mapStoredMessagesToChatMessages(storedMessages);
  let hasVisibleTail = false;
  for (let index = lastTranscriptIndex + 1; index < branch.length; index += 1) {
    const restoredMessages = restoreVisibleMessage(branch[index]);
    if (restoredMessages.length === 0) {
      continue;
    }
    hasVisibleTail = true;
    restored.push(...restoredMessages);
  }
  return { messages: restored, hasVisibleTail };
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
  forceReplacement: boolean,
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
  /** Visible human-driven turns are restored after the last canonical transcript.
   * Persist a full replacement after consuming such a tail: an append segment
   * would move the transcript cursor past those visible rows and make them
   * disappear from every later continuation. */
  const append = !forceReplacement && isStoredPrefix(initialMessages, storedResult);
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

function retentionFields(conversation: IConversation): Partial<IMessage> {
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
  if (request.subagentType === 'self') {
    return request.parentAgentId;
  }
  return request.subagentType;
}

function isUserRunnableChild(
  request: SubagentTaskStartRequest,
  agentId: string | undefined,
): boolean {
  if (request.subagentKind === 'graph' || agentId == null) {
    return false;
  }
  /** Explicit agent children come from the host's saved-agent descriptors.
   * Only `self` can inherit the synthetic identity of an ephemeral/model-spec
   * parent, which cannot be reconstructed from the child conversation alone. */
  return request.subagentType !== 'self' || !isEphemeralAgentId(agentId);
}

function publicFailureDetail(error: unknown): string {
  return error instanceof SubagentThreadPublicError
    ? error.message.slice(0, 2_000)
    : 'The child run could not be completed.';
}

function safeErrorMessage(error: unknown): string {
  return `Subagent task failed: ${publicFailureDetail(error).slice(0, 2_000)}`;
}

/** Persists logical child threads while retaining process-local execution leases and controls. */
export class SubagentThreadTaskStore extends InMemorySubagentTaskStore {
  readonly supportsThreadContinuation = true;
  private readonly activeThreads = new Map<string, ActiveThreadLease>();
  private readonly maxThreadDepth: number;

  constructor(
    private readonly methods: SubagentThreadMethods,
    options: SubagentThreadTaskStoreOptions = {},
  ) {
    super(options);
    this.maxThreadDepth =
      Number.isSafeInteger(options.maxThreadDepth) && (options.maxThreadDepth ?? 0) > 0
        ? (options.maxThreadDepth as number)
        : DEFAULT_MAX_THREAD_DEPTH;
  }

  override start(request: SubagentTaskStartRequest): SubagentTaskStartResult {
    const scope = parseScope(request.scopeId);
    const requestedThreadId = request.threadId?.trim();
    const isContinuation = requestedThreadId != null && requestedThreadId !== '';
    const threadId = isContinuation ? requestedThreadId : randomUUID();
    const lockKey = `${request.scopeId}\u0000${threadId}`;
    const idempotencyKey = request.idempotencyKey.trim();
    const active = this.activeThreads.get(lockKey);
    if (
      active?.kind === 'user' ||
      (active?.kind === 'task' && active.idempotencyKey !== idempotencyKey)
    ) {
      return { accepted: false, reason: 'capacity' };
    }

    /** Install a provisional lease before delegating to the in-memory store.
     * Its executor may enter synchronously up to the first await, so setting
     * the lock only after `super.start` returns leaves a cancellation race. */
    const lease: TaskThreadLease = active ?? {
      kind: 'task',
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
            const prepared = await this.prepareThread(
              scope,
              threadId,
              isContinuation,
              request,
              runtime.taskId,
            );
            if (runtime.signal.aborted) {
              throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
            }
            const result = await runWithDetachedSubagentUsage(detachedUsage, () =>
              request.run(runtime, prepared.initialMessages),
            );
            if (runtime.signal.aborted) {
              throw runtime.signal.reason ?? new Error('Subagent task was cancelled.');
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
            if (runtime.signal.aborted) {
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
              throw error;
            }
            logger.error(
              '[subagentThreads] Child-thread execution failed',
              publicFailureDetail(error),
            );
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
            throw new Error(publicFailureDetail(error));
          } finally {
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
    if (lease?.kind === 'task' && lease.taskId === taskId && lease.settling) {
      return { status: 'not_running', task: snapshot };
    }
    const result = super.control(scopeId, taskId, command);
    if (
      command.action === 'cancel' &&
      result.status === 'cancelled' &&
      snapshot?.threadId != null
    ) {
      /** A task cancelled before its executor ever entered has no `finally`
       * path to release the provisional lease. Once running, retain the lock
       * until the executor actually exits—even if it ignores AbortSignal. */
      if (lockKey != null && lease?.kind === 'task' && lease.taskId === taskId && !lease.running) {
        this.activeThreads.delete(lockKey);
      }
    }
    return result;
  }

  /** Process-local guard for ordinary user turns racing an active child lease. */
  isThreadActive(scopeId: string, threadId: string): boolean {
    return this.activeThreads.has(`${scopeId}\u0000${threadId}`);
  }

  /** Checks the bounded active set when a provisional child ID has a lease but
   * no durable conversation yet, so owner-scoped requests cannot bypass it. */
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

  /** Atomically excludes detached continuations for the lifetime of one
   * ordinary model-bound child turn. The returned idempotent release closure
   * deletes only the lease it created, never a later owner of the same key. */
  acquireUserTurn(scopeId: string, threadId: string, idempotencyKey?: string): (() => void) | null {
    const lockKey = `${scopeId}\u0000${threadId}`;
    const normalizedIdempotencyKey = idempotencyKey?.trim() || undefined;
    const active = this.activeThreads.get(lockKey);
    if (
      active?.kind === 'user' &&
      normalizedIdempotencyKey != null &&
      active.idempotencyKey === normalizedIdempotencyKey
    ) {
      /** Let the controller's durable idempotency claim attach this retry to
       * the original generation. A retry never owns or releases its lease. */
      return () => undefined;
    }
    if (active != null) {
      return null;
    }
    const lease: UserTurnThreadLease = {
      kind: 'user',
      leaseId: randomUUID(),
      ...(normalizedIdempotencyKey == null ? {} : { idempotencyKey: normalizedIdempotencyKey }),
    };
    this.activeThreads.set(lockKey, lease);
    return () => {
      if (this.activeThreads.get(lockKey) === lease) {
        this.activeThreads.delete(lockKey);
      }
    };
  }

  /** Whether a durable child may be created below the supplied conversation depth. */
  canCreateChildThread(parentDepth: number): boolean {
    return (
      Number.isSafeInteger(parentDepth) && parentDepth >= 0 && parentDepth < this.maxThreadDepth
    );
  }

  private async prepareThread(
    scope: SubagentThreadScope,
    threadId: string,
    isContinuation: boolean,
    request: SubagentTaskStartRequest,
    taskId: string,
  ): Promise<PreparedThread> {
    const parentPromise = this.methods.getConvo(scope.userId, scope.parentConversationId);
    const childPromise = this.methods.getConvo(scope.userId, threadId);
    const [parent, existing] = await Promise.all([parentPromise, childPromise]);
    if (parent == null || !matchesTenant(parent.tenantId, scope.tenantId)) {
      throw new SubagentThreadPublicError('Parent thread is unavailable.');
    }

    let createdThread = false;
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
        const saved = await this.methods.saveConvo(
          { userId: scope.userId },
          {
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
              subagentKind: request.subagentKind,
              depth,
              /** Remain read-only until the detached execution lease settles. */
              userRunnable: false,
            },
          },
          { context: 'SubagentThreadTaskStore.prepareThread' },
        );
        if (saved == null || 'message' in saved) {
          throw new Error('Unable to create the child thread.');
        }
        conversation = saved;
        createdThread = true;
      }

      this.assertContinuation(scope, request, conversation);
      const userRunnableAfterSettlement = isUserRunnableChild(request, childAgentId(request));
      const allMessages = (await this.methods.getMessages(
        { conversationId: threadId, user: scope.userId },
        TRANSCRIPT_SELECT,
        { sort: { createdAt: 1, _id: 1 } },
      )) as ThreadMessage[];
      const branch = selectLatestBranch(allMessages);
      const restored = restoreThreadMessages(branch);
      const initialMessages = restored.messages;
      const userMessageId = `${taskId}:user`;
      const parentMessageId = branch[branch.length - 1]?.messageId ?? Constants.NO_PARENT;
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
          ...retentionFields(conversation),
        },
        { context: 'SubagentThreadTaskStore.prepareThread' },
      );
      if (savedUserMessage == null) {
        throw new Error('Unable to persist the child-thread input.');
      }
      /** The process-local active lease rejects concurrent ordinary writes while
       * setup reads history. Flip the durable UI flag only after the new input is
       * committed, so a setup failure cannot strand an already-runnable child. */
      if (conversation.subagentThread?.userRunnable === true) {
        conversation = await this.refreshConversationRequired(scope.userId, conversation, false);
      }
      return {
        conversation,
        initialMessages,
        initialStoredMessages: mapChatMessagesToStoredMessages(initialMessages),
        forceTranscriptReplacement: restored.hasVisibleTail,
        userRunnableAfterSettlement,
        userMessageId,
      };
    } catch (error) {
      await this.rollbackPreparation(scope, threadId, taskId, request, createdThread);
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
    const subagentTranscript = serializeTranscript(
      taskId,
      prepared.initialStoredMessages,
      result.messages,
      prepared.forceTranscriptReplacement,
    );
    const usage = this.aggregateDetachedUsage(detachedUsage);
    /** Restoring ordinary-child writability is part of the successful commit,
     * not part of the best-effort sidebar refresh below. Commit it before the
     * result so a completed task can never leave the child permanently locked. */
    const settledConversation = await this.refreshConversationRequired(
      scope.userId,
      prepared.conversation,
      prepared.userRunnableAfterSettlement,
    );
    const savedAssistantMessage = await this.methods.saveMessage(
      { userId: scope.userId },
      {
        messageId: `${taskId}:assistant`,
        conversationId: settledConversation.conversationId,
        parentMessageId: prepared.userMessageId,
        sender: request.subagentType,
        text: result.content,
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
        unfinished: false,
        ...(subagentTranscript == null ? {} : { subagentTranscript }),
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(settledConversation),
      },
      { context: 'SubagentThreadTaskStore.persistResult' },
    );
    if (savedAssistantMessage == null) {
      throw new Error('Unable to persist the child-thread result.');
    }
    await this.refreshAfterMessage(
      scope,
      settledConversation,
      prepared.userRunnableAfterSettlement,
      taskId,
      'completed',
    );
  }

  private async persistFailure(
    scope: SubagentThreadScope,
    threadId: string,
    request: SubagentTaskStartRequest,
    taskId: string,
    error: unknown,
    detachedUsage: UsageMetadata[],
  ): Promise<void> {
    const conversation = await this.methods.getConvo(scope.userId, threadId);
    if (conversation == null || !this.isContinuationAllowed(scope, request, conversation)) {
      return;
    }
    const userMessage = await this.methods.getMessages(
      { conversationId: threadId, user: scope.userId, messageId: `${taskId}:user` },
      'messageId',
      { limit: 1 },
    );
    if (userMessage.length === 0) {
      return;
    }
    const userRunnableAfterSettlement = isUserRunnableChild(request, childAgentId(request));
    const settledConversation = await this.refreshConversationRequired(
      scope.userId,
      conversation,
      userRunnableAfterSettlement,
    );
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
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(settledConversation),
      },
      { context: 'SubagentThreadTaskStore.persistFailure' },
    );
    if (savedFailure == null) {
      throw new Error('Unable to persist the child-thread failure.');
    }
    await this.refreshAfterMessage(
      scope,
      settledConversation,
      userRunnableAfterSettlement,
      taskId,
      'failed',
    );
  }

  private async persistCancellation(
    scope: SubagentThreadScope,
    threadId: string,
    request: SubagentTaskStartRequest,
    taskId: string,
    detachedUsage: UsageMetadata[],
  ): Promise<void> {
    const conversation = await this.methods.getConvo(scope.userId, threadId);
    if (conversation == null || !this.isContinuationAllowed(scope, request, conversation)) {
      return;
    }
    const userMessage = await this.methods.getMessages(
      { conversationId: threadId, user: scope.userId, messageId: `${taskId}:user` },
      'messageId',
      { limit: 1 },
    );
    if (userMessage.length === 0) {
      return;
    }
    const userRunnableAfterSettlement = isUserRunnableChild(request, childAgentId(request));
    const settledConversation = await this.refreshConversationRequired(
      scope.userId,
      conversation,
      userRunnableAfterSettlement,
    );
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
        ...(usage == null ? {} : { metadata: { usage } }),
        ...retentionFields(settledConversation),
      },
      { context: 'SubagentThreadTaskStore.persistCancellation' },
    );
    if (savedCancellation == null) {
      throw new Error('Unable to persist the child-thread cancellation.');
    }
    await this.refreshAfterMessage(
      scope,
      settledConversation,
      userRunnableAfterSettlement,
      taskId,
      'cancelled',
    );
  }

  private async rollbackPreparation(
    scope: SubagentThreadScope,
    threadId: string,
    taskId: string,
    request: SubagentTaskStartRequest,
    createdThread: boolean,
  ): Promise<void> {
    try {
      if (createdThread) {
        await this.methods.deleteConvos(scope.userId, { conversationId: threadId });
        return;
      }
      await this.deleteTaskMessages(scope, threadId, taskId);
      const conversation = await this.methods.getConvo(scope.userId, threadId);
      if (
        conversation != null &&
        this.isContinuationAllowed(scope, request, conversation) &&
        isUserRunnableChild(request, childAgentId(request))
      ) {
        await this.refreshConversationRequired(scope.userId, conversation, true);
      }
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

  private async refreshAfterMessage(
    scope: SubagentThreadScope,
    conversation: IConversation,
    userRunnable: boolean,
    taskId: string,
    outcome: 'cancelled' | 'completed' | 'failed',
  ): Promise<void> {
    try {
      await this.refreshConversation(scope.userId, conversation, userRunnable);
    } catch (error) {
      if (error instanceof SubagentThreadDeletedError) {
        await this.deleteTaskMessages(scope, conversation.conversationId, taskId);
        throw error;
      }
      /** The permission transition is already durable and the outcome message
       * is queryable by conversation id. Only the sidebar cache refresh failed. */
      logger.error(`[subagentThreads] Failed to refresh ${outcome} child thread`, error);
    }
  }

  private async refreshConversationRequired(
    userId: string,
    conversation: IConversation,
    userRunnable: boolean,
  ): Promise<IConversation> {
    let lastError: unknown = new Error('Unable to refresh the child thread.');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.refreshConversation(userId, conversation, userRunnable);
      } catch (error) {
        if (error instanceof SubagentThreadDeletedError) {
          throw error;
        }
        lastError = error;
        if (attempt < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
        }
      }
    }
    throw lastError;
  }

  private async refreshConversation(
    userId: string,
    conversation: IConversation,
    userRunnable = conversation.subagentThread?.userRunnable,
  ): Promise<IConversation> {
    const subagentThread =
      conversation.subagentThread == null
        ? undefined
        : { ...conversation.subagentThread, userRunnable: userRunnable === true };
    const saved = await this.methods.saveConvo(
      { userId },
      {
        conversationId: conversation.conversationId,
        endpoint: conversation.endpoint,
        title: conversation.title,
        ...(conversation.agent_id == null ? {} : { agent_id: conversation.agent_id }),
        ...(subagentThread == null ? {} : { subagentThread }),
        ...retentionFields(conversation),
      },
      { context: 'SubagentThreadTaskStore.refreshConversation', noUpsert: true },
    );
    if (saved == null) {
      throw new SubagentThreadDeletedError('Child thread was deleted before settlement.');
    }
    if ('message' in saved) {
      throw new Error('Unable to refresh the child thread.');
    }
    return saved;
  }

  private aggregateDetachedUsage(detachedUsage: UsageMetadata[]) {
    return aggregateEmittedUsage(
      detachedUsage.map((entry) => ({ ...entry, usage_type: 'subagent' as const })),
    );
  }
}

export function createSubagentThreadTaskStore(
  methods: Pick<ConversationMethods, 'deleteConvos' | 'getConvo' | 'saveConvo'> &
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
