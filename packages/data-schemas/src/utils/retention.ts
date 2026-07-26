import { ResourceType, RetentionMode } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type {
  AppConfig,
  IAclEntry,
  IConversation,
  IMessage,
  IMongoFile,
  ISharedLink,
} from '~/types';
import type { IConversationTag } from '~/schema/conversationTag';
import { createTempChatExpirationDate, DEFAULT_RETENTION_HOURS } from './tempChatRetention';
import { tenantSafeBulkWrite } from './tenantBulkWrite';
import { isValidObjectIdString } from './objectId';

export type RetentionFilterDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
};

type RetentionLogger = {
  error: (message: string, error?: unknown) => void;
};

type ApplyForcedRetentionDependencies = {
  logger: RetentionLogger;
  refreshProjectStats: (userId: string, projectId: string) => Promise<unknown>;
};

export type ApplyForcedRetention = (
  conversationId: string,
  userId: string,
  appConfig?: AppConfig['interfaceConfig'],
) => Promise<Date | null>;

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

const expirationPipeline = (expiredAt: Date, includeTemporary = false) => [
  {
    $set: {
      ...(includeTemporary ? { isTemporary: true } : {}),
      expiredAt: { $min: [{ $ifNull: ['$expiredAt', expiredAt] }, expiredAt] },
    },
  },
];

const resolveForcedRetentionDate = (
  appConfig: AppConfig['interfaceConfig'] | undefined,
  logger: RetentionLogger,
): Date => {
  try {
    return createTempChatExpirationDate(appConfig);
  } catch (error) {
    logger.error('Error creating forced-retention expiration date:', error);
    return createFallbackRetentionDate();
  }
};

const collectReferencedFileIds = async (
  Message: Model<IMessage>,
  userId: string,
  conversationId: string,
  parent: Pick<IConversation, 'files' | 'file_ids'>,
): Promise<string[]> => {
  const fileIds = new Set<string>([...(parent.files ?? []), ...(parent.file_ids ?? [])]);
  const messages = await Message.find(
    {
      user: userId,
      conversationId,
      $or: [{ files: { $exists: true, $ne: null } }, { attachments: { $exists: true, $ne: null } }],
    },
    'files attachments',
  ).lean<
    Array<{
      files?: Array<{ file_id?: unknown } | null>;
      attachments?: Array<{ file_id?: unknown } | null>;
    }>
  >();

  const addReferences = (references?: Array<{ file_id?: unknown } | null>) => {
    for (const reference of references ?? []) {
      if (typeof reference?.file_id === 'string' && reference.file_id.length > 0) {
        fileIds.add(reference.file_id);
      }
    }
  };
  for (const message of messages) {
    addReferences(message.files);
    addReferences(message.attachments);
  }
  return [...fileIds].filter(Boolean);
};

const createOwnedFileScope = (
  userId: string,
  conversationId: string,
  fileIds: string[],
): FilterQuery<IMongoFile> | null => {
  if (!isValidObjectIdString(userId)) {
    return null;
  }
  return {
    $or: [
      { user: userId, conversationId },
      ...(fileIds.length > 0 ? [{ user: userId, file_id: { $in: fileIds } }] : []),
    ],
  } as FilterQuery<IMongoFile>;
};

const reconcileTagCounts = async (
  Conversation: Model<IConversation>,
  userId: string,
  tags: string[],
): Promise<void> => {
  const uniqueTags = [...new Set(tags.filter(Boolean))];
  if (uniqueTags.length === 0) {
    return;
  }
  const counts = await Conversation.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        user: userId,
        tags: { $in: uniqueTags },
        ...buildRetentionVisibilityFilter<IConversation>(),
      },
    },
    {
      $project: {
        tags: { $setIntersection: [{ $ifNull: ['$tags', []] }, uniqueTags] },
      },
    },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
  ]);
  const countByTag = new Map(counts.map(({ _id, count }) => [_id, count]));
  const ConversationTag = Conversation.db.models.ConversationTag as Model<IConversationTag>;
  await tenantSafeBulkWrite(
    ConversationTag,
    uniqueTags.map((tag) => ({
      updateOne: {
        filter: { user: userId, tag },
        update: { $set: { count: countByTag.get(tag) ?? 0 } },
      },
    })),
  );
};

export function createApplyForcedRetention(
  mongoose: typeof import('mongoose'),
  { logger, refreshProjectStats }: ApplyForcedRetentionDependencies,
): ApplyForcedRetention {
  /**
   * Applies the complete forced-retention invariant for one owned conversation.
   *
   * `expiredAt` is a monotonic cap: the conversation and every dependent record keep an
   * earlier existing deadline, while null/missing/later deadlines move to the configured
   * forced deadline. Every expiry mutation is a server-side aggregation-pipeline `$min`;
   * no value derived from a prior read is ever written back with `$set`.
   *
   * The operation is idempotent and always aligns every child, even when the parent already
   * conforms. A partial failure therefore needs only another call; parent conformity is never
   * used as a sentinel that would suppress retrying child work.
   */
  async function applyForcedRetention(
    conversationId: string,
    userId: string,
    appConfig?: AppConfig['interfaceConfig'],
  ): Promise<Date | null> {
    if (appConfig?.retentionMode !== RetentionMode.EPHEMERAL) {
      return null;
    }
    if (
      typeof conversationId !== 'string' ||
      conversationId.length === 0 ||
      typeof userId !== 'string' ||
      userId.length === 0
    ) {
      return null;
    }

    const proposedExpiredAt = resolveForcedRetentionDate(appConfig, logger);
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const SharedLink = mongoose.models.SharedLink as Model<ISharedLink>;
    const File = mongoose.models.File as Model<IMongoFile>;
    const parent = await Conversation.findOneAndUpdate(
      { conversationId, user: userId },
      expirationPipeline(proposedExpiredAt, true),
      {
        new: true,
        projection: {
          expiredAt: 1,
          files: 1,
          file_ids: 1,
          tags: 1,
          chatProjectId: 1,
        },
      },
    ).lean<Pick<
      IConversation,
      'expiredAt' | 'files' | 'file_ids' | 'tags' | 'chatProjectId'
    > | null>();
    const expiredAt = parent?.expiredAt instanceof Date ? parent.expiredAt : proposedExpiredAt;
    const [fileIds, sharedLinks] = await Promise.all([
      collectReferencedFileIds(Message, userId, conversationId, parent ?? {}),
      SharedLink.find({ conversationId, user: userId }, '_id').lean<
        Array<{ _id: Types.ObjectId }>
      >(),
    ]);
    const sharedLinkIds = sharedLinks.map(({ _id }) => _id);
    const fileScope = createOwnedFileScope(userId, conversationId, fileIds);
    const AclEntry = SharedLink.db.models.AclEntry as Model<IAclEntry>;

    await Promise.all([
      Message.updateMany({ conversationId, user: userId }, expirationPipeline(expiredAt, true)),
      ...(sharedLinkIds.length > 0
        ? [
            SharedLink.updateMany({ _id: { $in: sharedLinkIds } }, expirationPipeline(expiredAt)),
            AclEntry.updateMany(
              {
                resourceType: ResourceType.SHARED_LINK,
                resourceId: { $in: sharedLinkIds },
              },
              expirationPipeline(expiredAt),
            ),
          ]
        : []),
      ...(fileScope != null ? [File.updateMany(fileScope, expirationPipeline(expiredAt))] : []),
    ]);

    await reconcileTagCounts(Conversation, userId, parent?.tags ?? []);
    if (typeof parent?.chatProjectId === 'string' && parent.chatProjectId.length > 0) {
      await refreshProjectStats(userId, parent.chatProjectId);
    }
    return expiredAt;
  }

  return applyForcedRetention;
}
