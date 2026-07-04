import type { FilterQuery, Model } from 'mongoose';
import type { AppConfig, IConversation, IMessage, IMongoFile, ISharedLink } from '~/types';
import { createTempChatExpirationDate, DEFAULT_RETENTION_HOURS } from './tempChatRetention';
import logger from '~/config/winston';

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
 * Resolves the forced-retention deadline from the interface config, falling back to the default
 * window when the configured retention hours cannot be computed.
 */
export const resolveForcedRetentionDate = (
  interfaceConfig?: AppConfig['interfaceConfig'],
): Date => {
  try {
    return createTempChatExpirationDate(interfaceConfig);
  } catch (err) {
    logger.error('Error creating forced retention expiration date:', err);
    return createFallbackRetentionDate();
  }
};

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
 * Caps a conversation's uploaded files to the forced deadline. Files use a retention-scoped
 * `expiredAt` swept by application code (`getExpiredFiles` only sweeps files whose own `expiredAt`
 * is set), so a permanent file (`expiredAt: null`) uploaded before forced retention would linger
 * in storage after the conversation and messages TTL out. Only files with no expiration or a later
 * one are touched, so it is a no-op once a conversation conforms and never extends a file that
 * already expires sooner. Under ephemeral retention every conversation-scoped file is meant to
 * expire (persistent agent files are not retained), so no agent-file exclusion is needed here.
 *
 * Scoped by `conversationId` alone: it is a globally unique per-conversation id, and unlike the
 * message/share caps the `File.user` field is an `ObjectId` rather than the string user id, so
 * filtering by user would require a cast the callers cannot guarantee.
 */
export const capConversationFiles = async (
  File: Model<IMongoFile>,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<void> => {
  await File.updateMany(
    {
      conversationId,
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
 * brings the conversation into the forced window, backfills its lagging messages, shares, and
 * files. Shared by every forced-retention message-write path so a single conversation/message
 * rule is enforced regardless of which save touched the chat.
 */
export const cascadeForcedConversationRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<void> => {
  const parent = await Conversation.findOne(
    { conversationId, user: userId },
    'isTemporary expiredAt',
  ).lean<RetentionFilterDocument | null>();
  const expiredAt = capForcedRetentionExpiry(parent?.expiredAt, forcedExpiredAt);
  if (!conversationNeedsForcedRetention(parent, expiredAt)) {
    return;
  }
  /**
   * Backfill the dependent messages, shares, and files before marking the conversation
   * conforming. If a child update throws, the conversation stays non-conforming (the in-memory
   * gap check above still matches it), so a later forced-retention write re-runs the whole
   * cascade instead of skipping it because the parent already satisfies the gap filter.
   */
  await forceConversationMessagesTemporary(Message, userId, conversationId, expiredAt);
  await capConversationSharedLinks(SharedLink, userId, conversationId, expiredAt);
  await capConversationFiles(File, conversationId, expiredAt);
  await Conversation.updateOne(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IConversation>(expiredAt) },
    { $set: { isTemporary: true, expiredAt } },
  );
};

/**
 * Bulk-applies forced retention to the user's conversations selected by `conversationMatch`
 * (a bookmark tag, a chat project, etc.). Writes that touch these rows directly
 * (`Conversation.updateMany`) without setting `isTemporary`/`expiredAt` would otherwise leave a
 * permanent chat visible and non-expiring after an install switched to ephemeral. Chats are
 * bucketed by their capped deadline so each bucket converts the chats, backfills their messages,
 * and caps their shares and files in one pass; the gap filter keeps it a no-op for chats that
 * already conform and never extends a chat that already expires sooner.
 */
const cascadeForcedRetentionForConversationSet = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  userId: string,
  conversationMatch: FilterQuery<IConversation>,
  forcedExpiredAt: Date,
): Promise<void> => {
  const conversations = await Conversation.find(
    { user: userId, ...conversationMatch } as FilterQuery<IConversation>,
    'conversationId isTemporary expiredAt',
  ).lean<Array<RetentionFilterDocument & { conversationId?: string }>>();
  if (conversations.length === 0) {
    return;
  }

  const retentionBuckets = new Map<number, { expiredAt: Date; conversationIds: string[] }>();
  for (const convo of conversations) {
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
    await File.updateMany(
      {
        conversationId: { $in: conversationIds },
        $or: [{ expiredAt: null }, { expiredAt: { $gt: expiredAt } }],
      },
      { $set: { expiredAt } },
    );
  }
};

/**
 * Bulk-applies forced retention to every conversation carrying a bookmark tag. A tag rename or
 * delete writes conversation rows directly without setting `isTemporary`/`expiredAt`, so a
 * permanent chat tagged before the install switched to ephemeral would otherwise stay visible
 * and never expire.
 */
export const cascadeForcedRetentionByTag = (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  userId: string,
  tag: string,
  forcedExpiredAt: Date,
): Promise<void> =>
  cascadeForcedRetentionForConversationSet(
    Conversation,
    Message,
    SharedLink,
    File,
    userId,
    { tags: tag } as FilterQuery<IConversation>,
    forcedExpiredAt,
  );

/**
 * Bulk-applies forced retention to every conversation in a chat project. Assigning a chat to a
 * project, removing it, or deleting the project rewrites conversation rows without setting
 * `isTemporary`/`expiredAt`, so a permanent chat organized after the install switched to
 * ephemeral would otherwise stay visible and never expire.
 */
export const cascadeForcedRetentionByProject = (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  userId: string,
  chatProjectId: string,
  forcedExpiredAt: Date,
): Promise<void> =>
  cascadeForcedRetentionForConversationSet(
    Conversation,
    Message,
    SharedLink,
    File,
    userId,
    { chatProjectId } as FilterQuery<IConversation>,
    forcedExpiredAt,
  );

/**
 * One-time backfill of forced (ephemeral) retention over pre-existing data. Convert-on-touch
 * only converts conversations that are subsequently written, so enabling ephemeral mode on a
 * deployment with existing chats leaves untouched permanent rows visible and non-expiring.
 *
 * Streams every conversation that does not yet conform to the forced window and converts it,
 * its messages, its shares, and its uploaded files one conversation at a time. Each conversation
 * is capped to the earlier of its own deadline and the forced window, and its messages, shares,
 * and files are capped to that same per-conversation deadline, so the sweep never extends data
 * that already expires sooner and never lets a dependent record outlive its conversation. It is
 * idempotent: re-running skips conversations that already conform.
 */
export const sweepForcedRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
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
       * Convert the dependent messages, shares, and files before marking the conversation itself
       * conforming. If a child backfill throws, the conversation stays non-conforming so the
       * gap-filtered query picks it up again on a re-run, keeping the sweep safe to repeat.
       */
      await forceConversationMessagesTemporary(Message, user, conversationId, expiredAt);
      await capConversationSharedLinks(SharedLink, user, conversationId, expiredAt);
      await capConversationFiles(File, conversationId, expiredAt);
      await Conversation.updateOne({ _id: convo._id }, { $set: { isTemporary: true, expiredAt } });
      result.conversations += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
};
