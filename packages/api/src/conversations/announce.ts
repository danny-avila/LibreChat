import { logger } from '@librechat/data-schemas';
import type { ConversationMethods } from '@librechat/data-schemas';
import { hasPersistableAbortContent } from '../stream/abortContent';

type SaveConvo = ConversationMethods['saveConvo'];
/** Derived here rather than imported from `./save`, which depends on this module. */
type ConversationWriteContext = Parameters<SaveConvo>[0];
type SaveConvoOptions = NonNullable<Parameters<SaveConvo>[2]>;
type SavedMessageId = NonNullable<SaveConvoOptions['appendMessageIds']>[number];

/** Declared structurally so a caller hands over its store rather than this module reaching for one. */
export interface ReplyStampStore {
  stampConvoLastResponse(user: string, conversationId: string, messageId: string): Promise<unknown>;
}

export interface ReplyConversationStore {
  saveConvo: SaveConvo;
}

/** What a turn knows about the assistant row it just persisted. */
export interface PersistedReply {
  /** Absent when the write resolved empty, which is a reply nobody can open. */
  messageId?: string | null;
  /** The content parts persisted with it. */
  content?: unknown;
  /** Plain text, for the paths that persist text instead of content parts. */
  text?: string | null;
  /** A temporary chat holds no row in the lists the indicator is read from. */
  isTemporary?: boolean;
}

/**
 * Whether a persisted assistant turn may raise the unseen-reply indicator.
 *
 * Acknowledgement requires the stamped reply to be on screen, so a row that renders nothing
 * would leave a dot the reader can never clear by opening the conversation. Every path that
 * persists an assistant row asks here: a stopped turn interrupted before its first token, a
 * run cancelled before any output, and a Responses API completion whose output carried only
 * reasoning or tool calls all persist a row with nothing readable in it.
 */
export function isAnnounceableReply(reply: PersistedReply): boolean {
  if (reply.isTemporary === true) {
    return false;
  }
  const { messageId } = reply;
  if (typeof messageId !== 'string' || messageId.length === 0) {
    return false;
  }
  return (
    hasPersistableAbortContent(reply.content) ||
    (typeof reply.text === 'string' && reply.text.trim().length > 0)
  );
}

export interface ReplyAnnouncement {
  userId?: string | null;
  conversationId?: string | null;
  reply: PersistedReply;
  /** Names the caller in the failure log. */
  context: string;
}

/**
 * Stamps a persisted reply on its conversation, for the paths whose row already exists.
 *
 * Best effort, and it never throws: the messages are already durable, and failing a reply over
 * its indicator would trade a missed dot for a lost response. Returns whether it stamped.
 */
export async function announceReply(
  deps: ReplyStampStore,
  { userId, conversationId, reply, context }: ReplyAnnouncement,
): Promise<boolean> {
  if (userId == null || userId === '' || conversationId == null || conversationId === '') {
    return false;
  }
  if (!isAnnounceableReply(reply)) {
    return false;
  }
  try {
    await deps.stampConvoLastResponse(userId, conversationId, reply.messageId as string);
    return true;
  } catch (error) {
    logger.warn(`[announceReply] ${context}`, error);
    return false;
  }
}

export interface StoppedReplyAnnouncement {
  ctx: ConversationWriteContext;
  conversationId: string;
  endpoint?: string | null;
  model?: string | null;
  reply: PersistedReply;
  /** The rows this turn already wrote, so the stamp write does not reload the whole history. */
  appendMessageIds?: SavedMessageId[];
  context: string;
}

/**
 * Announces a stopped turn's reply through the conversation write itself.
 *
 * A very early interrupt can arrive before the conversation row exists, so the same upsert that
 * creates it carries the stamp, assigned at write time. Best effort for the same reason as
 * `announceReply`: a missed stamp must not suppress the turn's own terminal event.
 */
export async function announceStoppedReply(
  deps: ReplyConversationStore,
  {
    ctx,
    conversationId,
    endpoint,
    model,
    reply,
    appendMessageIds = [],
    context,
  }: StoppedReplyAnnouncement,
): Promise<boolean> {
  if (!isAnnounceableReply({ ...reply, isTemporary: ctx.isTemporary ?? reply.isTemporary })) {
    return false;
  }
  try {
    await deps.saveConvo(
      ctx,
      {
        conversationId,
        ...(endpoint != null ? { endpoint } : {}),
        ...(model != null ? { model } : {}),
      },
      {
        context,
        stampReply: true,
        replyMessageId: reply.messageId as string,
        ...(appendMessageIds.length > 0 ? { appendMessageIds } : {}),
      },
    );
    return true;
  } catch (error) {
    logger.warn(`[announceStoppedReply] ${context}`, error);
    return false;
  }
}

/** What a durable reply stamp settled to, as the stamping write reports it. */
export interface SettledReplyStamp {
  lastResponseAt?: Date | string | null;
  lastResponseMessageId?: string | null;
  updatedAt?: Date | string | null;
}

export interface ErrorTurnStampStore {
  stampConvoLastResponse(
    user: string,
    conversationId: string,
    messageId: string,
  ): Promise<SettledReplyStamp | null | undefined>;
}

/** The conversation snapshot an error event carries so the client can acknowledge it. */
export interface ErrorTurnSnapshot {
  conversationId: string;
  lastResponseAt: Date | string;
  lastResponseMessageId?: string;
  updatedAt?: Date | string;
}

export interface ErrorTurnAnnouncement {
  userId?: string | null;
  conversationId?: string | null;
  /** The persisted error row; absent when its write resolved empty. */
  messageId?: string | null;
  isTemporary?: boolean;
  context: string;
}

/**
 * Stamps a persisted error turn and returns the snapshot its terminal event should carry.
 *
 * A failed run is still a persisted assistant turn, and on the fallback paths it is the only one:
 * without a stamp another device never learns the run ended. Error turns are not judged by
 * `isAnnounceableReply`, because the error card is what renders them. Best effort, and it never
 * throws: the error row is already durable, and a failed stamp must not turn a handled error into
 * an unhandled one. The snapshot is what the client acknowledges, so no browser-generated time can
 * stand in for it.
 */
export async function announceErrorTurn(
  deps: ErrorTurnStampStore,
  { userId, conversationId, messageId, isTemporary, context }: ErrorTurnAnnouncement,
): Promise<ErrorTurnSnapshot | undefined> {
  if (
    isTemporary === true ||
    userId == null ||
    userId === '' ||
    conversationId == null ||
    conversationId === '' ||
    messageId == null ||
    messageId === ''
  ) {
    return undefined;
  }
  try {
    const settled = await deps.stampConvoLastResponse(userId, conversationId, messageId);
    if (settled?.lastResponseAt == null) {
      return undefined;
    }
    return {
      conversationId,
      lastResponseAt: settled.lastResponseAt,
      ...(settled.lastResponseMessageId != null
        ? { lastResponseMessageId: settled.lastResponseMessageId }
        : {}),
      ...(settled.updatedAt != null ? { updatedAt: settled.updatedAt } : {}),
    };
  } catch (error) {
    logger.error(`[announceErrorTurn] ${context}`, error);
    return undefined;
  }
}
