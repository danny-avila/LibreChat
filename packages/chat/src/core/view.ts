import { Constants, ContentTypes, toUIMessage, fromUIMessage } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  UIMessage,
  TAttachment,
  UIMappingOptions,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { ChatStatus } from './types';

/** A tool call as the parts mapping hands it to `resolveToolFailure`. */
export type StoredToolCall = Parameters<NonNullable<UIMappingOptions['resolveToolFailure']>>[0];

/**
 * The host's tool outcome rules, for outcomes the stored call does not mark itself (memory
 * failure prose, background task status). `live` is what arrived for the message outside the
 * message list.
 */
export type ResolveToolFailure = (
  toolCall: StoredToolCall,
  message: TMessage | undefined,
  live: TAttachment[] | undefined,
) => ReturnType<NonNullable<UIMappingOptions['resolveToolFailure']>>;

export type ChatViewOptions = {
  resolveToolFailure?: ResolveToolFailure;
};

/**
 * Every message field a view is built from, identity and metadata included: a stream frame or a
 * new chat's promotion can replace these on the same object.
 */
const viewSourceKeys = [
  'messageId',
  'isCreatedByUser',
  'conversationId',
  'parentMessageId',
  'content',
  'text',
  'files',
  'attachments',
  'error',
  'unfinished',
  'sender',
  'model',
  'endpoint',
  'createdAt',
] as const;

type CachedView = {
  view: UIMessage;
  source: Pick<TMessage, (typeof viewSourceKeys)[number]>;
  live: TAttachment[] | undefined;
  resolve: ResolveToolFailure | undefined;
};

const views = new WeakMap<TMessage, CachedView>();

const isSameSource = (
  cached: CachedView,
  message: TMessage,
  live: TAttachment[] | undefined,
  resolve: ResolveToolFailure | undefined,
) =>
  cached.live === live &&
  cached.resolve === resolve &&
  viewSourceKeys.every((key) => cached.source[key] === message[key]);

/**
 * A stored message as a `UIMessage`. Cached per message, per snapshot of the fields a view reads,
 * per live attachment list and per tool rules: a stream frame that replaces a response's content,
 * or an attachment that arrives for it, remaps that response, while untouched messages keep their
 * views.
 */
export const toView = (
  message: TMessage,
  live: TAttachment[] | undefined,
  options: ChatViewOptions = {},
): UIMessage => {
  const resolve = options.resolveToolFailure;
  const cached = views.get(message);
  if (cached && isSameSource(cached, message, live, resolve)) {
    return cached.view;
  }
  const view = toUIMessage(
    message,
    resolve ? { resolveToolFailure: (toolCall, owner) => resolve(toolCall, owner, live) } : {},
  );
  const source = {} as CachedView['source'];
  for (const key of viewSourceKeys) {
    Object.assign(source, { [key]: message[key] });
  }
  views.set(message, { view, source, live, resolve });
  return view;
};

const getPartTextValue = (value?: string | { value?: string }): string =>
  (typeof value === 'string' ? value : value?.value) ?? '';

const getPartToolCall = (part: TMessageContentParts): Agents.ToolCall | undefined =>
  part.type === ContentTypes.TOOL_CALL
    ? (part[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)
    : undefined;

/** Slots the persistence compaction leaves nothing behind for: the
 * dual-message `type: ''` placeholders, text/think parts that never received a
 * delta, and tool calls missing their `tool_call` payload. */
export const isEmptyContentPart = (part: TMessageContentParts): boolean => {
  if (!part.type) {
    return true;
  }
  if (part.type === ContentTypes.TEXT) {
    return getPartTextValue(part.text).length === 0;
  }
  if (part.type === ContentTypes.THINK) {
    return getPartTextValue(part.think).length === 0;
  }
  if (part.type === ContentTypes.TOOL_CALL) {
    return getPartToolCall(part) == null;
  }
  return false;
};

/**
 * Placeholder slots (empty text or think, lane placeholders) are not streamed output. A rerun edit
 * seeds its response with the retained prefix, which reads as streamed from the start: the
 * contract carries no first-delta signal a restored or replaced run could keep correct.
 */
const hasStreamed = (message: TMessage) =>
  (message.text?.length ?? 0) > 0 ||
  (message.files?.length ?? 0) > 0 ||
  (message.content?.some((part) => part != null && !isEmptyContentPart(part)) ?? false);

/**
 * The error part names the failure; top-level text is only the fallback for legacy error rows,
 * and never for a failed user message, whose text is what the user sent.
 */
export const getErrorText = (message: TMessage): string => {
  const part = message.content?.find((item) => item?.type === ContentTypes.ERROR);
  if (part?.type !== ContentTypes.ERROR) {
    return message.isCreatedByUser ? '' : (message.text ?? '');
  }
  const text = typeof part.text === 'string' ? part.text : part.text?.value;
  return part.error || text || message.text || '';
};

const isErrorMessage = (message: TMessage) =>
  message.error === true ||
  (message.content?.some((part) => part?.type === ContentTypes.ERROR) ?? false);

/**
 * `submitted` until the response for the in-flight turn has content, then `streaming`; once the
 * turn ends, `error` when the latest message failed (a user message that never got a response
 * included) and `ready` otherwise, a stopped turn included. For a host whose turns still run
 * outside a `Chat`, where only the in-flight flag and the stored messages say where a turn is.
 */
export const getChatStatus = (isSubmitting: boolean, latest: TMessage | undefined): ChatStatus => {
  if (isSubmitting) {
    return latest && !latest.isCreatedByUser && hasStreamed(latest) ? 'streaming' : 'submitted';
  }
  return latest && isErrorMessage(latest) ? 'error' : 'ready';
};

/** The latest message, searched from the tail, where it almost always is. */
export const findLatest = (
  stored: TMessage[] | undefined,
  latestMessageId: string | undefined,
): TMessage | undefined => {
  if (!stored || latestMessageId == null) {
    return undefined;
  }
  for (let i = stored.length - 1; i >= 0; i--) {
    if (stored[i].messageId === latestMessageId) {
      return stored[i];
    }
  }
  return undefined;
};

/** Ids on the active branch: the tail and its ancestors. */
const getActiveBranch = (byId: Map<string, TMessage>, tailId: string | undefined) => {
  const branch = new Set<string>();
  let id: string | null | undefined = tailId;
  while (id != null && !branch.has(id)) {
    branch.add(id);
    id = byId.get(id)?.parentMessageId;
  }
  return branch;
};

/**
 * Writes views back onto the stored messages, keeping the stored fields a view omits. A view with
 * no stored counterpart joins the chat under the message before it, or under the active branch's
 * tail when the message before it is on another branch, unless its metadata names a parent. A
 * message keeps the conversation it is stored under; a new one joins `chatId`, or none while the
 * chat is new.
 */
export const toStoredMessages = (
  next: UIMessage[],
  current: TMessage[],
  { chatId, latestMessageId }: { chatId: string | undefined; latestMessageId: string | undefined },
): TMessage[] => {
  const byId = new Map(current.map((message) => [message.messageId, message]));
  const branch = getActiveBranch(byId, latestMessageId);
  const conversationId = chatId === Constants.NEW_CONVO ? null : (chatId ?? null);
  let previous: { id: string; joined: boolean } | null = null;
  return next.map((view) => {
    const base = byId.get(view.id);
    const message = fromUIMessage(view, base);
    message.conversationId = base ? base.conversationId : conversationId;
    if (!base && view.metadata?.parentMessageId === undefined) {
      message.parentMessageId =
        previous == null || previous.joined ? (previous?.id ?? null) : (latestMessageId ?? null);
    }
    previous = { id: message.messageId, joined: !base || branch.has(message.messageId) };
    return message;
  });
};
