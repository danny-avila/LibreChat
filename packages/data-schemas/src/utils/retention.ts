import type { FilterQuery, Model } from 'mongoose';
import type { IConversation, IMessage } from '~/types';
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
 * Converts or re-caps a parent conversation to the forced deadline and, when that first
 * brings the conversation into the forced window, backfills its lagging messages. Shared
 * by every forced-retention message-write path so a single conversation/message rule is
 * enforced regardless of which save touched the chat.
 */
export const cascadeForcedConversationRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
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
  }
};
