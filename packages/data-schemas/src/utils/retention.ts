import type { FilterQuery, Model } from 'mongoose';
import type { AppConfig, IConversation, IMessage, IMongoFile, ISharedLink } from '~/types';
import { createTempChatExpirationDate, DEFAULT_RETENTION_HOURS } from './tempChatRetention';
import { isValidObjectIdString } from './objectId';
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
): Promise<number> => {
  const result = await Message.updateMany(
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
  return result.modifiedCount ?? 0;
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
): Promise<number> => {
  const result = await SharedLink.updateMany(
    {
      conversationId,
      user: userId,
      $or: [{ expiredAt: null }, { expiredAt: { $gt: forcedExpiredAt } }],
    },
    { $set: { expiredAt: forcedExpiredAt } },
  );
  return result.modifiedCount ?? 0;
};

/**
 * Collects the file ids a set of conversations references. Message-attachment uploads create
 * File rows without a `conversationId` — they are referenced only from `Message.files[].file_id`,
 * `Message.attachments[].file_id` (tool/agent outputs), and the conversation's own `files`
 * array — so conversation-scoped file caps must also target these ids. `seedFileIds` takes the
 * conversations' `files` arrays; message references are read in one pass over the conversations'
 * messages.
 */
export const collectConversationFileIds = async (
  Message: Model<IMessage>,
  userId: string,
  conversationIds: string[],
  seedFileIds?: Iterable<string | null | undefined>,
): Promise<string[]> => {
  const fileIds = new Set<string>();
  const addFileIds = (references?: Array<{ file_id?: unknown } | null>) => {
    for (const reference of references ?? []) {
      const fileId = reference?.file_id;
      if (typeof fileId === 'string' && fileId.length > 0) {
        fileIds.add(fileId);
      }
    }
  };

  for (const fileId of seedFileIds ?? []) {
    if (typeof fileId === 'string' && fileId.length > 0) {
      fileIds.add(fileId);
    }
  }
  if (conversationIds.length > 0) {
    const messages = await Message.find(
      {
        user: userId,
        conversationId: { $in: conversationIds },
        $or: [
          { files: { $exists: true, $ne: null } },
          { attachments: { $exists: true, $ne: null } },
        ],
      },
      'files attachments',
    ).lean<
      Array<{
        files?: Array<{ file_id?: unknown } | null>;
        attachments?: Array<{ file_id?: unknown } | null>;
      }>
    >();
    for (const message of messages) {
      addFileIds(message.files);
      addFileIds(message.attachments);
    }
  }
  return [...fileIds];
};

/**
 * Concatenates a conversation's own file references: `files` (regular uploads) and `file_ids`
 * (Assistants thread uploads persisted by saveUserMessage/syncMessages). Used to seed
 * {@link collectConversationFileIds} so both reference styles are capped.
 */
export const conversationSeedFileIds = (convo: {
  files?: string[] | null;
  file_ids?: string[] | null;
}): string[] => [...(convo.files ?? []), ...(convo.file_ids ?? [])];

/**
 * Builds the owner-scoped referenced-file-id branch of a file-cap filter. File ids inside
 * message/conversation documents are caller-supplied, so a crafted reference to another user's
 * file must never shorten that file's retention: the branch always filters on `File.user`.
 * `File.user` is an ObjectId, so when the caller's user id is not a castable ObjectId string
 * (legacy/test data) the branch is dropped entirely — fail closed rather than cap unverified
 * rows.
 */
const ownedFileIdScope = (
  userId: string,
  fileIds: string[],
): { file_id: { $in: string[] }; user: string } | null =>
  fileIds.length > 0 && isValidObjectIdString(userId)
    ? { file_id: { $in: fileIds }, user: userId }
    : null;

/**
 * Caps a conversation's uploaded files to the forced deadline. Files use a retention-scoped
 * `expiredAt` swept by application code (`getExpiredFiles` only sweeps files whose own `expiredAt`
 * is set), so a permanent file (`expiredAt: null`) uploaded before forced retention would linger
 * in storage after the conversation and messages TTL out. Only files with no expiration or a later
 * one are touched, so it is a no-op once a conversation conforms and never extends a file that
 * already expires sooner. Under ephemeral retention every conversation-scoped file is meant to
 * expire (persistent agent files are not retained), so no agent-file exclusion is needed here.
 *
 * Matches by `conversationId` (a globally unique per-conversation id whose File rows are
 * server-created by this conversation's own processes; a colliding id can only shorten the
 * colliding owner's files, never extend) plus any referenced `fileIds`, which are
 * owner-scoped via {@link ownedFileIdScope} because references are caller-supplied.
 * A shared file referenced from several chats is capped to the earliest converting chat's
 * deadline, consistent with cap-don't-extend.
 */
export const capConversationFiles = async (
  File: Model<IMongoFile>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
  fileIds: string[] = [],
): Promise<number> => {
  const fileIdScope = ownedFileIdScope(userId, fileIds);
  const scope = fileIdScope ? { $or: [{ conversationId }, fileIdScope] } : { conversationId };
  const result = await File.updateMany(
    {
      $and: [scope, { $or: [{ expiredAt: null }, { expiredAt: { $gt: forcedExpiredAt } }] }],
    } as FilterQuery<IMongoFile>,
    { $set: { expiredAt: forcedExpiredAt } },
  );
  return result.modifiedCount ?? 0;
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
 * rule is enforced regardless of which save touched the chat. Returns whether the parent row
 * was converted, so callers can refresh caches (e.g. project stats) that a visibility flip
 * invalidates.
 */
export const cascadeForcedConversationRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  userId: string,
  conversationId: string,
  forcedExpiredAt: Date,
): Promise<boolean> => {
  const parent = await Conversation.findOne(
    { conversationId, user: userId },
    'isTemporary expiredAt files file_ids',
  ).lean<(RetentionFilterDocument & { files?: string[]; file_ids?: string[] }) | null>();
  if (parent == null) {
    return false;
  }
  const expiredAt = capForcedRetentionExpiry(parent.expiredAt, forcedExpiredAt);
  const needsConversion = conversationNeedsForcedRetention(parent, expiredAt);
  /**
   * Referenced file ids (message-attachment rows carry no conversationId) are collected only at
   * conversion time: post-conversion uploads always receive a deadline at upload, so the id
   * scan over the chat's messages is not needed on every conforming-parent write.
   */
  const fileIds = needsConversion
    ? await collectConversationFileIds(
        Message,
        userId,
        [conversationId],
        conversationSeedFileIds(parent),
      )
    : [];
  /**
   * Cap the dependent messages, shares, and files independently of the parent gap check, and
   * before the parent conversion. An already-conforming parent can still own lagging children
   * (permanent shares or later-window files created before the mode switch, or left by a partial
   * earlier backfill), and a child failure must leave the parent non-conforming so a later
   * forced-retention write re-runs the whole cascade. Each cap is an indexed no-op once the
   * chat's children conform.
   */
  await forceConversationMessagesTemporary(Message, userId, conversationId, expiredAt);
  await capConversationSharedLinks(SharedLink, userId, conversationId, expiredAt);
  await capConversationFiles(File, userId, conversationId, expiredAt, fileIds);
  if (!needsConversion) {
    return false;
  }
  const convoResult = await Conversation.updateOne(
    { conversationId, user: userId, ...forcedRetentionGapFilter<IConversation>(expiredAt) },
    { $set: { isTemporary: true, expiredAt } },
  );
  return (convoResult.modifiedCount ?? 0) > 0;
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
    'conversationId isTemporary expiredAt files file_ids',
  ).lean<
    Array<
      RetentionFilterDocument & { conversationId?: string; files?: string[]; file_ids?: string[] }
    >
  >();
  if (conversations.length === 0) {
    return;
  }

  const retentionBuckets = new Map<
    number,
    { expiredAt: Date; conversationIds: string[]; seedFileIds: string[] }
  >();
  for (const convo of conversations) {
    if (typeof convo.conversationId !== 'string' || convo.conversationId.length === 0) {
      continue;
    }

    const expiredAt = capForcedRetentionExpiry(convo.expiredAt, forcedExpiredAt);
    const key = expiredAt.getTime();
    const bucket = retentionBuckets.get(key) ?? {
      expiredAt,
      conversationIds: [],
      seedFileIds: [],
    };
    bucket.conversationIds.push(convo.conversationId);
    for (const fileId of conversationSeedFileIds(convo)) {
      bucket.seedFileIds.push(fileId);
    }
    retentionBuckets.set(key, bucket);
  }

  for (const { expiredAt, conversationIds, seedFileIds } of retentionBuckets.values()) {
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
    const fileIds = await collectConversationFileIds(Message, userId, conversationIds, seedFileIds);
    const fileIdScope = ownedFileIdScope(userId, fileIds);
    const fileScope = fileIdScope
      ? { $or: [{ conversationId: { $in: conversationIds } }, fileIdScope] }
      : { conversationId: { $in: conversationIds } };
    await File.updateMany(
      {
        $and: [fileScope, { $or: [{ expiredAt: null }, { expiredAt: { $gt: expiredAt } }] }],
      } as FilterQuery<IMongoFile>,
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
 *
 * Converted conversations become `isTemporary: true`, which `visibleProjectConversationFilter`
 * hides, so each converted chat's project membership is collected in `projects` for the caller
 * to recompute cached project stats (the sweep cannot refresh them itself without a circular
 * dependency on the chat-project methods).
 *
 * Already-conforming temporary conversations are swept too: their dependent shares, files, and
 * messages can still lag (permanent shares or later-window records created before the mode
 * switch), so an alignment pass caps those children to each parent's own deadline. `aligned`
 * counts the conversations whose children needed changes.
 */
export const sweepForcedRetention = async (
  Conversation: Model<IConversation>,
  Message: Model<IMessage>,
  SharedLink: Model<ISharedLink>,
  File: Model<IMongoFile>,
  forcedExpiredAt: Date,
): Promise<{
  conversations: number;
  aligned: number;
  errors: number;
  projects: Array<{ user: string; chatProjectId: string }>;
}> => {
  const result = { conversations: 0, aligned: 0, errors: 0 };
  const projectKeys = new Set<string>();
  const projects: Array<{ user: string; chatProjectId: string }> = [];

  /**
   * Alignment pass first: conforming parents are excluded from the gap-filtered conversion
   * cursor below, and running this before the conversion avoids revisiting the conversations
   * that pass converts (their children are capped at conversion time).
   */
  const alignCursor = Conversation.find({
    isTemporary: true,
    expiredAt: { $ne: null, $lte: forcedExpiredAt },
  } as FilterQuery<IConversation>)
    .select('conversationId user expiredAt files file_ids')
    .lean()
    .cursor();

  for await (const convo of alignCursor) {
    const { conversationId, user, expiredAt } = convo;
    if (
      typeof conversationId !== 'string' ||
      !conversationId ||
      !user ||
      !(expiredAt instanceof Date)
    ) {
      continue;
    }
    try {
      const fileIds = await collectConversationFileIds(
        Message,
        user,
        [conversationId],
        conversationSeedFileIds(convo),
      );
      const changed =
        (await forceConversationMessagesTemporary(Message, user, conversationId, expiredAt)) +
        (await capConversationSharedLinks(SharedLink, user, conversationId, expiredAt)) +
        (await capConversationFiles(File, user, conversationId, expiredAt, fileIds));
      if (changed > 0) {
        result.aligned += 1;
      }
    } catch {
      result.errors += 1;
    }
  }

  const cursor = Conversation.find(forcedRetentionGapFilter<IConversation>(forcedExpiredAt))
    .select('_id conversationId user expiredAt chatProjectId files file_ids')
    .lean()
    .cursor();

  for await (const convo of cursor) {
    const { conversationId, user, chatProjectId } = convo;
    if (typeof conversationId !== 'string' || !conversationId || !user) {
      continue;
    }
    try {
      const expiredAt = capForcedRetentionExpiry(convo.expiredAt, forcedExpiredAt);
      const fileIds = await collectConversationFileIds(
        Message,
        user,
        [conversationId],
        conversationSeedFileIds(convo),
      );
      /**
       * Convert the dependent messages, shares, and files before marking the conversation itself
       * conforming. If a child backfill throws, the conversation stays non-conforming so the
       * gap-filtered query picks it up again on a re-run, keeping the sweep safe to repeat.
       */
      await forceConversationMessagesTemporary(Message, user, conversationId, expiredAt);
      await capConversationSharedLinks(SharedLink, user, conversationId, expiredAt);
      await capConversationFiles(File, user, conversationId, expiredAt, fileIds);
      await Conversation.updateOne({ _id: convo._id }, { $set: { isTemporary: true, expiredAt } });
      result.conversations += 1;
      if (typeof chatProjectId === 'string' && chatProjectId.length > 0) {
        const key = `${user}|${chatProjectId}`;
        if (!projectKeys.has(key)) {
          projectKeys.add(key);
          projects.push({ user: String(user), chatProjectId });
        }
      }
    } catch {
      result.errors += 1;
    }
  }

  return { ...result, projects };
};
