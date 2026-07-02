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

export const capForcedRetentionExpiry = (
  expiredAt: Date | null | undefined,
  forcedExpiredAt: Date,
): Date => {
  if (!(expiredAt instanceof Date)) {
    return forcedExpiredAt;
  }

  const existingTime = expiredAt.getTime();
  if (!Number.isNaN(existingTime) && existingTime < forcedExpiredAt.getTime()) {
    return expiredAt;
  }

  return forcedExpiredAt;
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
 *
 * Each message keeps its own earlier deadline: a carried-over message whose per-message TTL
 * already expires sooner than the forced window is marked temporary but keeps its `expiredAt`,
 * so converting the conversation never extends data that was already scheduled to expire
 * sooner. A permanent message (`expiredAt` null/missing) instead receives the forced deadline
 * (`$ifNull` guards `$min` from selecting the null), so the TTL index can remove it.
 */
export const forceConversationMessagesTemporary = async (
  Message: Model<IMessage>,
  userId: string,
  conversationId: string,
  expiredAt: Date,
): Promise<void> => {
  await Message.updateMany(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IMessage>(expiredAt) },
    [
      {
        $set: {
          isTemporary: true,
          expiredAt: { $min: [{ $ifNull: ['$expiredAt', expiredAt] }, expiredAt] },
        },
      },
    ],
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
  const expiredAt = capForcedRetentionExpiry(parent?.expiredAt, forcedExpiredAt);
  if (expiredAt !== forcedExpiredAt) {
    await forceConversationMessagesTemporary(Message, userId, conversationId, expiredAt);
    await capConversationSharedLinks(SharedLink, userId, conversationId, expiredAt);
  }
  return expiredAt;
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
  const parent = await Conversation.findOne(
    { conversationId, user: userId },
    'isTemporary expiredAt',
  ).lean<RetentionFilterDocument | null>();
  const expiredAt = capForcedRetentionExpiry(parent?.expiredAt, forcedExpiredAt);
  const convoResult = await Conversation.updateOne(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IConversation>(expiredAt) },
    { $set: { isTemporary: true, expiredAt } },
  );
  if (convoResult.modifiedCount > 0) {
    await forceConversationMessagesTemporary(Message, userId, conversationId, expiredAt);
    await capConversationSharedLinks(SharedLink, userId, conversationId, expiredAt);
  }
};

/**
 * Bulk-applies forced retention to every conversation carrying a bookmark tag. A tag rename
 * or delete writes conversation rows directly (`Conversation.updateMany`) without setting
 * `isTemporary`/`expiredAt`, so a permanent chat tagged before the install switched to
 * ephemeral would otherwise stay visible and never expire. One pass converts the chats,
 * backfills their messages, and caps their shares; the gap filter keeps it a no-op for chats
 * that already conform and never extends a chat that already expires sooner.
 */
export const cascadeForcedRetentionByTag = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  userId: string,
  tag: string,
  forcedExpiredAt: Date,
): Promise<void> => {
  const taggedConversations = await Conversation.find(
    { user: userId, tags: tag },
    'conversationId isTemporary expiredAt',
  ).lean<Array<RetentionFilterDocument & { conversationId?: string }>>();
  if (taggedConversations.length === 0) {
    return;
  }

  const retentionBuckets = new Map<number, { expiredAt: Date; conversationIds: string[] }>();
  for (const convo of taggedConversations) {
    if (typeof convo.conversationId !== 'string' || convo.conversationId.length === 0) {
      continue;
    }

    const expiredAt = capForcedRetentionExpiry(convo.expiredAt, forcedExpiredAt);
    const key = expiredAt.getTime();
    const bucket = retentionBuckets.get(key);
    if (bucket) {
      bucket.conversationIds.push(convo.conversationId);
      continue;
    }
    retentionBuckets.set(key, { expiredAt, conversationIds: [convo.conversationId] });
  }

  for (const { expiredAt, conversationIds } of retentionBuckets.values()) {
    await Conversation.updateMany(
      {
        user: userId,
        conversationId: { $in: conversationIds },
        ...forcedRetentionGapFilter<IConversation>(expiredAt),
      },
      { $set: { isTemporary: true, expiredAt } },
    );
    await Message.updateMany(
      {
        user: userId,
        conversationId: { $in: conversationIds },
        ...forcedRetentionGapFilter<IMessage>(expiredAt),
      },
      [
        {
          $set: {
            isTemporary: true,
            expiredAt: { $min: [{ $ifNull: ['$expiredAt', expiredAt] }, expiredAt] },
          },
        },
      ],
    );
    await SharedLink.updateMany(
      {
        user: userId,
        conversationId: { $in: conversationIds },
        $or: [{ expiredAt: null }, { expiredAt: { $gt: expiredAt } }],
      },
      { $set: { expiredAt } },
    );
  }
};

/**
 * One-time backfill of forced (ephemeral) retention over pre-existing data. Convert-on-touch
 * only converts conversations that are subsequently written, so enabling ephemeral mode on a
 * deployment with existing chats leaves untouched permanent rows visible and non-expiring.
 *
 * Streams every conversation that does not yet conform to the forced window and converts it,
 * its messages, and its shares one conversation at a time. Each conversation is capped to the
 * earlier of its own deadline and the forced window, and its messages and shares are capped to
 * that same per-conversation deadline, so the sweep never extends data that already expires
 * sooner and never lets a message outlive its conversation. It is idempotent: re-running skips
 * conversations that already conform.
 */
export const sweepForcedRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  forcedExpiredAt: Date,
): Promise<{ conversations: number; errors: number }> => {
  const result = { conversations: 0, errors: 0 };
  const cursor = Conversation.find(forcedRetentionGapFilter<IConversation>(forcedExpiredAt))
    .select('_id conversationId user expiredAt')
    .lean()
    .cursor();

  for await (const convo of cursor) {
    const { conversationId, user } = convo;
    if (typeof conversationId !== 'string' || !conversationId || !user) {
      continue;
    }
    try {
      const expiredAt = capForcedRetentionExpiry(convo.expiredAt, forcedExpiredAt);
      /**
       * Convert the dependent messages and shares before marking the conversation itself
       * conforming. If a child backfill throws, the conversation stays non-conforming so the
       * gap-filtered query picks it up again on a re-run, keeping the sweep safe to repeat.
       */
      await forceConversationMessagesTemporary(Message, user, conversationId, expiredAt);
      await capConversationSharedLinks(SharedLink, user, conversationId, expiredAt);
      await Conversation.updateOne({ _id: convo._id }, { $set: { isTemporary: true, expiredAt } });
      result.conversations += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
};
