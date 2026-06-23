import type { FilterQuery, Model } from 'mongoose';
import type { IConversation, IMessage, ISharedLink } from '~/types';
import { DEFAULT_RETENTION_HOURS } from './tempChatRetention';

export type RetentionFilterDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
};

export const activeExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date() } }],
  }) as FilterQuery<T>;

export const legacyPermanentExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> => ({ expiredAt: null }) as FilterQuery<T>;

export const buildRetentionVisibilityFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [
      { isTemporary: false, expiredAt: null },
      { isTemporary: false, expiredAt: { $gt: new Date() } },
      { isTemporary: null, expiredAt: null },
    ],
  }) as FilterQuery<T>;

export const createFallbackRetentionDate = (now: number = Date.now()): Date =>
  new Date(now + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);

/**
 * Matches retention documents that do not yet conform to a forced (ephemeral) deadline:
 * not temporary, missing an expiration, or expiring later than the forced window. The
 * last clause re-caps documents carried over from a longer policy (`all`, or a longer
 * `temporary` TTL) while leaving already-conforming temporary documents untouched.
 */
export const forcedRetentionGapFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(
  forcedExpiredAt: Date,
): FilterQuery<T> =>
  ({
    $or: [
      { isTemporary: { $ne: true } },
      { expiredAt: null },
      { expiredAt: { $gt: forcedExpiredAt } },
    ],
  }) as FilterQuery<T>;

/**
 * In-memory counterpart of {@link forcedRetentionGapFilter} for a conversation's prior
 * state: true when the parent must be re-capped to the forced deadline.
 */
export const conversationNeedsForcedRetention = (
  parent: RetentionFilterDocument | null | undefined,
  forcedExpiredAt: Date,
): boolean => {
  if (parent == null) {
    return false;
  }
  if (parent.isTemporary !== true || parent.expiredAt == null) {
    return true;
  }
  return parent.expiredAt.getTime() > forcedExpiredAt.getTime();
};

/**
 * Applies forced-retention deadlines to a conversation's messages that do not yet
 * conform to the forced window.
 *
 * Forced (ephemeral) retention must cover existing messages too. A conversation that
 * predates the mode keeps non-conforming messages — `expiredAt: null` permanent messages,
 * `isTemporary: false` messages carried over from `all` retention, or temporary messages
 * whose `expiredAt` is later than a newly shortened window — that would otherwise outlive
 * the converted conversation. The gap filter pulls all of them onto the ephemeral schedule
 * and stays a no-op once a conversation already conforms.
 */
export const forceConversationMessagesTemporary = async (
  Message: Model<IMessage>,
  userId: string,
  conversationId: string,
  expiredAt: Date,
): Promise<void> => {
  await Message.updateMany(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IMessage>(expiredAt) },
    { $set: { isTemporary: true, expiredAt } },
  );
};

/**
 * Caps a conversation's shared links to the forced deadline. A share embeds a snapshot of
 * the conversation (message refs and file snapshots) and its TTL index keys off `expiredAt`
 * alone, so a permanent share (`expiredAt: null`) created before forced retention would stay
 * publicly readable after the conversation and messages expire. Only links with no
 * expiration or a later one are touched, so it is a no-op once a conversation conforms.
 */
export const capConversationSharedLinks = async (
  SharedLink: Model<ISharedLink>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<void> => {
  await SharedLink.updateMany(
    {
      conversationId,
      user: userId,
      $or: [{ expiredAt: null }, { expiredAt: { $gt: forcedExpiredAt } }],
    },
    { $set: { expiredAt: forcedExpiredAt } },
  );
};

/**
 * Caps a message-only forced save to a parent that already expires sooner than the freshly
 * computed window. Returns the parent's earlier deadline (so the message cannot outlive it)
 * and backfills the conversation's lagging messages to that deadline — the cascade leaves
 * an already-conforming parent untouched, so older `expiredAt: null`/later messages would
 * otherwise survive the parent's TTL. Returns the forced window unchanged when no earlier
 * parent deadline applies.
 *
 * Any active earlier deadline is honored regardless of `isTemporary`: an `all`-mode parent
 * carried over with a sooner `expiredAt` must not be extended to the fresh window just
 * because it is not yet temporary — the cascade converts it afterward using this deadline.
 */
export const capForcedRetentionToParent = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<Date> => {
  const parent = await Conversation.findOne({ conversationId, user: userId }, 'expiredAt').lean<{
    expiredAt?: Date | null;
  } | null>();
  if (parent?.expiredAt instanceof Date && parent.expiredAt.getTime() < forcedExpiredAt.getTime()) {
    await forceConversationMessagesTemporary(Message, userId, conversationId, parent.expiredAt);
    await capConversationSharedLinks(SharedLink, userId, conversationId, parent.expiredAt);
    return parent.expiredAt;
  }
  return forcedExpiredAt;
};

/**
 * Converts or re-caps a parent conversation to the forced deadline and, when that first
 * brings the conversation into the forced window, backfills its lagging messages. Shared
 * by every forced-retention message-write path so a single conversation/message rule is
 * enforced regardless of which save touched the chat.
 */
export const cascadeForcedConversationRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<void> => {
  const convoResult = await Conversation.updateOne(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IConversation>(forcedExpiredAt) },
    { $set: { isTemporary: true, expiredAt: forcedExpiredAt } },
  );
  if (convoResult.modifiedCount > 0) {
    await forceConversationMessagesTemporary(Message, userId, conversationId, forcedExpiredAt);
    await capConversationSharedLinks(SharedLink, userId, conversationId, forcedExpiredAt);
  }
};
