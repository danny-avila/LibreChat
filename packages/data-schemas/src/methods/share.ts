import { nanoid } from 'nanoid';
import { Constants, ContentTypes, FileSources } from 'librechat-data-provider';
import type { FilterQuery, Model } from 'mongoose';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import type * as t from '~/types';
import { activeExpirationFilter } from '~/utils/retention';
import logger from '~/config/winston';

class ShareServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShareServiceError';
    this.code = code;
  }
}

function memoizedAnonymizeId(prefix: string) {
  const memo = new Map<string, string>();
  return (id: string) => {
    if (!memo.has(id)) {
      memo.set(id, `${prefix}_${nanoid()}`);
    }
    return memo.get(id) as string;
  };
}

const anonymizeConvoId = memoizedAnonymizeId('convo');
const anonymizeAssistantId = memoizedAnonymizeId('a');
const anonymizeMessageId = (id: string) =>
  id === Constants.NO_PARENT ? id : memoizedAnonymizeId('msg')(id);

function anonymizeConvo(conversation: Partial<t.IConversation> & Partial<t.ISharedLink>) {
  if (!conversation) {
    return null;
  }

  const newConvo = { ...conversation };
  if (newConvo.assistant_id) {
    newConvo.assistant_id = anonymizeAssistantId(newConvo.assistant_id);
  }
  return newConvo;
}

/**
 * Storage- and identity-internal fields that must never be exposed through a
 * public shared link. Everything else on a file/attachment — including the
 * `filepath`/`preview` render URLs, dimensions, and tool-call payloads such as
 * `toolCallId` and search results — is render data the shared view needs, so it
 * is preserved. (`storageKey` is the raw object key and is dropped; `filepath`
 * is the URL the share renderer actually loads, so it is kept.)
 */
const SENSITIVE_SHARED_FILE_FIELDS = new Set([
  '_id',
  '__v',
  'user',
  'tenantId',
  'storageRegion',
  'storageKey',
  'temp_file_id',
  'message',
  'source',
  'filterSource',
  'context',
  'embedded',
  'usage',
  'metadata',
]);

/**
 * Strip storage/identity-internal fields from a file or attachment while keeping
 * render-relevant data (including tool-call payloads keyed by tool name).
 */
function sanitizeSharedFile(value: unknown): t.SharedFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const result: t.SharedFile = {};
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_SHARED_FILE_FIELDS.has(key)) {
      result[key] = fieldValue;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeSharedFiles(files: unknown): t.SharedFile[] | undefined {
  if (!Array.isArray(files)) {
    return undefined;
  }

  const sanitized = files
    .map(sanitizeSharedFile)
    .filter((file): file is t.SharedFile => file != null);

  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Sources backed by a durable stored object that the share-scoped routes can
 * stream with only `storageKey`/`filepath` + the request. Sources requiring
 * owner-specific credentials (openai/azure assistants, execute_code, vectordb,
 * OCR/parser pipelines) are skipped — those files degrade to a 404 in the share
 * view. `FileSources.text` is intentionally excluded: its `filepath` is a Multer
 * temp path that the upload route deletes, so there is nothing durable to stream.
 */
const SNAPSHOT_STREAMABLE_SOURCES = new Set<string>([
  FileSources.local,
  FileSources.s3,
  FileSources.cloudfront,
  FileSources.azure_blob,
  FileSources.firebase,
]);

/** Collect `file_id`s from a message's `files`/`attachments` array into `target`. */
function collectFileIds(items: unknown, target: Set<string>): void {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (item && typeof item === 'object') {
      const fileId = (item as { file_id?: unknown }).file_id;
      if (typeof fileId === 'string' && fileId) {
        target.add(fileId);
      }
    }
  }
}

type SteerLikePart = { type?: unknown; files?: unknown };

function isSteerPartWithFiles(part: unknown): part is SteerLikePart {
  return (
    part != null &&
    typeof part === 'object' &&
    (part as SteerLikePart).type === ContentTypes.STEER &&
    (part as SteerLikePart).files !== undefined
  );
}

/** Collect `file_id`s carried by steer parts inside a message's content array. */
function collectSteerFileIds(content: unknown, target: Set<string>): void {
  if (!Array.isArray(content)) {
    return;
  }
  for (const part of content) {
    if (isSteerPartWithFiles(part)) {
      collectFileIds(part.files, target);
    }
  }
}

/**
 * Build the per-share file snapshot from the messages being shared. Captures only
 * the metadata the share-scoped routes need to stream each file; references the
 * original stored object (no byte copy). The lookup is scoped to the sharing
 * user's own files so a message referencing another user's `file_id` can never
 * widen access to it. Preview text/status is intentionally NOT embedded — it is
 * read live from the file record so snapshots stay small and never go stale.
 */
async function buildFileSnapshots(
  mongoose: typeof import('mongoose'),
  messages: t.IMessage[],
  ownerId?: string,
): Promise<t.SharedFileSnapshot[]> {
  if (!ownerId) {
    return [];
  }

  const fileIds = new Set<string>();
  for (const message of messages) {
    collectFileIds(message.files, fileIds);
    collectFileIds(message.attachments, fileIds);
    collectSteerFileIds(message.content, fileIds);
  }

  if (fileIds.size === 0) {
    return [];
  }

  const File = mongoose.models.File as Model<t.IMongoFile>;
  const files = await File.find({ file_id: { $in: Array.from(fileIds) }, user: ownerId }).lean();

  const snapshots: t.SharedFileSnapshot[] = [];
  for (const file of files) {
    const source = file.source ?? FileSources.local;
    if (!SNAPSHOT_STREAMABLE_SOURCES.has(source)) {
      continue;
    }
    snapshots.push({
      file_id: file.file_id,
      source,
      storageKey: file.storageKey,
      filepath: file.filepath,
      type: file.type,
      filename: file.filename,
      bytes: file.bytes,
      width: file.width,
      height: file.height,
      model: file.model,
      previewRevision: file.previewRevision,
      tenantId: file.tenantId,
    });
  }
  return snapshots;
}

/** Share-scoped file route that serves a snapshotted file independent of owner ACL. */
function shareFileRoute(shareId: string, fileId: string): string {
  return `/api/share/${shareId}/files/${encodeURIComponent(fileId)}`;
}

/**
 * Point a snapshotted file's render URLs at the share-scoped route so viewers load
 * it through the authorized share path (and the owner's storage path is not leaked).
 */
function applyShareFileRoute(
  file: t.SharedFile,
  shareId: string,
  snapshotIds: Set<string>,
): t.SharedFile {
  const fileId = file.file_id;
  if (typeof fileId === 'string' && snapshotIds.has(fileId)) {
    const route = shareFileRoute(shareId, fileId);
    const next: t.SharedFile = { ...file, filepath: route };
    if (file.preview !== undefined) {
      next.preview = route;
    }
    return next;
  }
  // Not snapshotted (e.g. a non-streamable source on an included link): neutralize
  // the render URLs so the owner's original path can't be loaded through the share.
  const next: t.SharedFile = { ...file };
  delete next.filepath;
  delete next.preview;
  return next;
}

/**
 * Steer parts persisted inline in `message.content` carry the same user file
 * refs as a message's top-level `files`, so they follow the identical share
 * policy: dropped entirely when files are excluded from the link, sanitized and
 * rewritten to the share-scoped route (with anonymized ids) when included.
 * Returns the original array untouched when no steer part carries files.
 */
export function anonymizeSharedContent(
  content: unknown[] | undefined,
  params: {
    newConvoId: string;
    newMessageId: string;
    shareId: string;
    snapshotIds: Set<string>;
    includeFiles: boolean;
  },
): unknown[] | undefined {
  if (!Array.isArray(content)) {
    return content;
  }

  let result: unknown[] | null = null;
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    if (!isSteerPartWithFiles(part)) {
      continue;
    }
    const { files: rawFiles, ...rest } = part as Record<string, unknown>;
    const files = params.includeFiles
      ? sanitizeSharedFiles(rawFiles)?.map((file) =>
          applyShareFileRoute(
            {
              ...file,
              ...(file.conversationId !== undefined && { conversationId: params.newConvoId }),
              ...(file.messageId !== undefined && { messageId: params.newMessageId }),
            },
            params.shareId,
            params.snapshotIds,
          ),
        )
      : undefined;
    if (result == null) {
      result = [...content];
    }
    result[i] = files ? { ...rest, files } : rest;
  }
  return result ?? content;
}

/**
 * Only surface a model name when it is an (already-anonymized) assistant id;
 * otherwise omit it so the underlying provider/model is not disclosed.
 */
function anonymizeSharedModel(model?: string): string | undefined {
  if (!model?.startsWith('asst_')) {
    return undefined;
  }
  return anonymizeAssistantId(model);
}

/**
 * Build the public, anonymized view of shared messages. An allowlist of
 * render-relevant fields keeps internal message fields (endpoint,
 * conversationSignature, clientId, plugin(s), metadata, etc.) out of the
 * payload, while user files and tool-call attachments are sanitized field by
 * field so render data (uploaded files, `toolCallId`, search results, generated
 * outputs) is preserved without leaking storage internals.
 */
function anonymizeMessages(
  messages: t.IMessage[],
  newConvoId: string,
  shareId: string,
  snapshotIds: Set<string>,
  includeFiles: boolean,
): t.SharedMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const idMap = new Map<string, string>();
  return messages.map((message) => {
    const newMessageId = anonymizeMessageId(message.messageId);
    idMap.set(message.messageId, newMessageId);

    // When files are not shared for this link, omit files/attachments entirely so
    // viewers can't load them through the owner's original (e.g. static) paths.
    const attachments = includeFiles
      ? sanitizeSharedFiles(message.attachments)?.map((attachment) =>
          applyShareFileRoute(
            {
              ...attachment,
              messageId: newMessageId,
              conversationId: newConvoId,
            },
            shareId,
            snapshotIds,
          ),
        )
      : undefined;
    // Persisted file records can carry the original conversation/message ids;
    // rewrite them to the anonymized ids so shared files don't expose them.
    const files = includeFiles
      ? sanitizeSharedFiles(message.files)?.map((file) =>
          applyShareFileRoute(
            {
              ...file,
              ...(file.conversationId !== undefined && { conversationId: newConvoId }),
              ...(file.messageId !== undefined && { messageId: newMessageId }),
            },
            shareId,
            snapshotIds,
          ),
        )
      : undefined;
    const model = anonymizeSharedModel(message.model);

    return {
      messageId: newMessageId,
      parentMessageId:
        idMap.get(message.parentMessageId || '') ||
        anonymizeMessageId(message.parentMessageId || ''),
      conversationId: newConvoId,
      sender: message.sender,
      text: message.text,
      content: anonymizeSharedContent(message.content, {
        newConvoId,
        newMessageId,
        shareId,
        snapshotIds,
        includeFiles,
      }),
      ...(message.iconURL && { iconURL: message.iconURL }),
      ...(model && { model }),
      isCreatedByUser: message.isCreatedByUser,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      tokenCount: message.tokenCount,
      unfinished: message.unfinished,
      error: message.error,
      finish_reason: message.finish_reason,
      ...(message.manualSkills && { manualSkills: message.manualSkills }),
      ...(message.alwaysAppliedSkills && { alwaysAppliedSkills: message.alwaysAppliedSkills }),
      ...(message.quotes && { quotes: message.quotes }),
      ...(files && { files }),
      ...(attachments && { attachments }),
    };
  });
}

/**
 * Filter messages up to and including the target message (branch-specific)
 * Similar to getMessagesUpToTargetLevel from fork utilities
 */
function getMessagesUpToTarget(messages: t.IMessage[], targetMessageId: string): t.IMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  // If only one message and it's the target, return it
  if (messages.length === 1 && messages[0]?.messageId === targetMessageId) {
    return messages;
  }

  // Create a map of parentMessageId to children messages
  const parentToChildrenMap = new Map<string, t.IMessage[]>();
  for (const message of messages) {
    const parentId = message.parentMessageId || Constants.NO_PARENT;
    if (!parentToChildrenMap.has(parentId)) {
      parentToChildrenMap.set(parentId, []);
    }
    parentToChildrenMap.get(parentId)?.push(message);
  }

  // Find the target message
  const targetMessage = messages.find((msg) => msg.messageId === targetMessageId);
  if (!targetMessage) {
    // If target not found, return all messages for backwards compatibility
    return messages;
  }

  const visited = new Set<string>();
  const rootMessages = parentToChildrenMap.get(Constants.NO_PARENT) || [];
  let currentLevel = rootMessages.length > 0 ? [...rootMessages] : [targetMessage];
  const results = new Set<t.IMessage>(currentLevel);

  // Check if the target message is at the root level
  if (
    currentLevel.some((msg) => msg.messageId === targetMessageId) &&
    targetMessage.parentMessageId === Constants.NO_PARENT
  ) {
    return Array.from(results);
  }

  // Iterate level by level until the target is found
  let targetFound = false;
  while (!targetFound && currentLevel.length > 0) {
    const nextLevel: t.IMessage[] = [];
    for (const node of currentLevel) {
      if (visited.has(node.messageId)) {
        continue;
      }
      visited.add(node.messageId);
      const children = parentToChildrenMap.get(node.messageId) || [];
      for (const child of children) {
        if (visited.has(child.messageId)) {
          continue;
        }
        nextLevel.push(child);
        results.add(child);
        if (child.messageId === targetMessageId) {
          targetFound = true;
        }
      }
    }
    currentLevel = nextLevel;
  }

  return Array.from(results);
}

/** Factory function that takes mongoose instance and returns the methods */
export function createShareMethods(mongoose: typeof import('mongoose')): {
  getSharedLink: (user: string, conversationId: string) => Promise<t.GetShareLinkResult>;
  getSharedLinks: (
    user: string,
    pageParam?: Date,
    pageSize?: number,
    sortBy?: string,
    sortDirection?: string,
    search?: string,
  ) => Promise<t.SharedLinksResult>;
  createSharedLink: (
    user: string,
    conversationId: string,
    targetMessageId?: string,
    expiredAt?: Date,
    snapshotFiles?: boolean,
  ) => Promise<t.CreateShareResult>;
  updateSharedLink: (
    user: string,
    shareId: string,
    targetMessageId?: string,
    expiredAt?: Date | null,
    snapshotFiles?: boolean,
  ) => Promise<t.UpdateShareResult>;
  deleteSharedLink: (user: string, shareId: string) => Promise<t.DeleteShareResult | null>;
  getSharedMessages: (
    shareId: string,
    shareObjectId?: string,
    options?: { snapshotFiles?: boolean },
  ) => Promise<t.SharedMessagesResult | null>;
  getSharedLinkFile: (
    shareId: string,
    fileId: string,
  ) => Promise<{ file: t.SharedFileSnapshot | null; hasSnapshots: boolean; optedOut: boolean }>;
  backfillSharedLinkFiles: (
    shareId: string,
    fileId?: string,
  ) => Promise<t.SharedFileSnapshot | t.SharedFileSnapshot[] | null>;
  deleteAllSharedLinks: (
    user: string,
  ) => Promise<t.DeleteAllSharesResult & { deletedIds: string[] }>;
  deleteConvoSharedLink: (
    user: string,
    conversationId: string,
  ) => Promise<t.DeleteAllSharesResult & { deletedIds: string[] }>;
} {
  /**
   * Get shared messages for a share link
   */
  async function getSharedMessages(
    shareId: string,
    shareObjectId?: string,
    options?: { snapshotFiles?: boolean },
  ): Promise<t.SharedMessagesResult | null> {
    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const query = shareObjectId
        ? SharedLink.findOne({ _id: shareObjectId, ...activeExpirationFilter<t.ISharedLink>() })
        : SharedLink.findOne({ shareId, ...activeExpirationFilter<t.ISharedLink>() });

      const share = (await query
        .populate({
          path: 'messages',
          select: '-_id -__v -user',
        })
        .select('-__v')
        .lean()) as (t.ISharedLink & { messages: t.IMessage[] }) | null;

      if (!share?.conversationId) {
        return null;
      }

      /** Filtered messages based on targetMessageId if present (branch-specific sharing) */
      let messagesToShare: t.IMessage[] = share.messages;
      if (share.targetMessageId) {
        messagesToShare = getMessagesUpToTarget(share.messages, share.targetMessageId);
      }

      const newConvoId = anonymizeConvoId(share.conversationId);
      const resolvedShareId = share.shareId || shareId;

      /**
       * Files are included only when the admin feature is enabled (options) AND the
       * link's own choice wasn't opted out (`snapshotFiles === false`). When
       * excluded, files/attachments are stripped from the payload so nothing leaks
       * through the owner's original paths. Legacy links (no per-link choice and no
       * snapshot yet) are backfilled here so their first view rewrites correctly.
       */
      const adminEnabled = options?.snapshotFiles !== false;
      const perLinkEnabled = share.snapshotFiles !== false;
      const includeFiles = adminEnabled && perLinkEnabled;
      let fileSnapshots = share.fileSnapshots;
      if (includeFiles && fileSnapshots === undefined && share._id) {
        fileSnapshots = await buildFileSnapshots(mongoose, messagesToShare, share.user);
        await SharedLink.updateOne({ _id: share._id }, { $set: { fileSnapshots } });
      }
      const snapshotIds = includeFiles
        ? new Set<string>((fileSnapshots ?? []).map((snapshot) => snapshot.file_id))
        : new Set<string>();
      const result: t.SharedMessagesResult = {
        shareId: resolvedShareId,
        title: share.title,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
        conversationId: newConvoId,
        messages: anonymizeMessages(
          messagesToShare,
          newConvoId,
          resolvedShareId,
          snapshotIds,
          includeFiles,
        ),
      };

      return result;
    } catch (error) {
      logger.error('[getSharedMessages] Error getting share link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shareId,
      });
      throw new ShareServiceError('Error getting share link', 'SHARE_FETCH_ERROR');
    }
  }

  /**
   * Get shared links for a specific user with pagination and search
   */
  async function getSharedLinks(
    user: string,
    pageParam?: Date,
    pageSize: number = 10,
    sortBy: string = 'createdAt',
    sortDirection: string = 'desc',
    search?: string,
  ): Promise<t.SharedLinksResult> {
    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const Conversation = mongoose.models.Conversation as SchemaWithMeiliMethods;
      const query: FilterQuery<t.ISharedLink> = {
        user,
        ...activeExpirationFilter<t.ISharedLink>(),
      };

      if (pageParam) {
        if (sortDirection === 'desc') {
          query[sortBy] = { $lt: pageParam };
        } else {
          query[sortBy] = { $gt: pageParam };
        }
      }

      if (search && search.trim()) {
        try {
          const searchResults = await Conversation.meiliSearch(search, {
            filter: `user = "${user}"`,
            limit: 1000,
          });

          if (!searchResults?.hits?.length) {
            return {
              links: [],
              nextCursor: undefined,
              hasNextPage: false,
            };
          }

          const conversationIds = searchResults.hits.map((hit) => hit.conversationId);
          query['conversationId'] = { $in: conversationIds };
        } catch (searchError) {
          logger.error('[getSharedLinks] Meilisearch error', {
            error: searchError instanceof Error ? searchError.message : 'Unknown error',
            user,
          });
          return {
            links: [],
            nextCursor: undefined,
            hasNextPage: false,
          };
        }
      }

      const sort: Record<string, 1 | -1> = {};
      sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

      const sharedLinks = await SharedLink.find(query)
        .sort(sort)
        .limit(pageSize + 1)
        .select('-__v -user')
        .lean();

      const hasNextPage = sharedLinks.length > pageSize;
      const links = sharedLinks.slice(0, pageSize);

      const nextCursor = hasNextPage
        ? (links[links.length - 1][sortBy as keyof t.ISharedLink] as Date)
        : undefined;

      return {
        links: links.map((link) => ({
          shareId: link.shareId || '',
          title: link?.title || 'Untitled',
          createdAt: link.createdAt || new Date(),
          conversationId: link.conversationId,
        })),
        nextCursor,
        hasNextPage,
      };
    } catch (error) {
      logger.error('[getSharedLinks] Error getting shares', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
      });
      throw new ShareServiceError('Error getting shares', 'SHARES_FETCH_ERROR');
    }
  }

  /**
   * Delete all shared links for a user
   */
  async function deleteAllSharedLinks(
    user: string,
  ): Promise<t.DeleteAllSharesResult & { deletedIds: string[] }> {
    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const links = await SharedLink.find({ user }).select('_id').lean();
      const ids = links.map((l) => l._id.toString());
      const result = await SharedLink.deleteMany({ user });
      return {
        message: 'All shared links deleted successfully',
        deletedCount: result.deletedCount,
        deletedIds: ids,
      };
    } catch (error) {
      logger.error('[deleteAllSharedLinks] Error deleting shared links', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
      });
      throw new ShareServiceError('Error deleting shared links', 'BULK_DELETE_ERROR');
    }
  }

  /**
   * Delete shared links by conversation ID
   */
  async function deleteConvoSharedLink(
    user: string,
    conversationId: string,
  ): Promise<t.DeleteAllSharesResult & { deletedIds: string[] }> {
    if (!user || !conversationId) {
      throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const links = await SharedLink.find({ user, conversationId }).select('_id').lean();
      const ids = links.map((l) => l._id.toString());
      const result = await SharedLink.deleteMany({ user, conversationId });
      return {
        message: 'Shared links deleted successfully',
        deletedCount: result.deletedCount,
        deletedIds: ids,
      };
    } catch (error) {
      logger.error('[deleteConvoSharedLink] Error deleting shared links', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        conversationId,
      });
      throw new ShareServiceError('Error deleting shared links', 'SHARE_DELETE_ERROR');
    }
  }

  /**
   * Create a new shared link for a conversation
   */
  async function createSharedLink(
    user: string,
    conversationId: string,
    targetMessageId?: string,
    expiredAt?: Date,
    snapshotFiles: boolean = true,
  ): Promise<t.CreateShareResult> {
    if (!user || !conversationId) {
      throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
    }
    try {
      const Message = mongoose.models.Message as SchemaWithMeiliMethods;
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const Conversation = mongoose.models.Conversation as SchemaWithMeiliMethods;

      const [existingShare, conversationMessages] = await Promise.all([
        SharedLink.findOne({
          conversationId,
          user,
          ...activeExpirationFilter<t.ISharedLink>(),
          ...(targetMessageId && { targetMessageId }),
        })
          .select('-_id -__v -user')
          .lean() as Promise<t.ISharedLink | null>,
        Message.find({ conversationId, user }).sort({ createdAt: 1 }).lean(),
      ]);

      if (existingShare) {
        logger.error('[createSharedLink] Share already exists', {
          user,
          conversationId,
          targetMessageId,
        });
        throw new ShareServiceError('Share already exists', 'SHARE_EXISTS');
      }

      const conversation = (await Conversation.findOne({ conversationId, user }).lean()) as {
        title?: string;
      } | null;

      // Check if user owns the conversation
      if (!conversation) {
        throw new ShareServiceError(
          'Conversation not found or access denied',
          'CONVERSATION_NOT_FOUND',
        );
      }

      // Check if there are any messages to share
      if (!conversationMessages || conversationMessages.length === 0) {
        throw new ShareServiceError('No messages to share', 'NO_MESSAGES');
      }

      const title = conversation.title || 'Untitled';

      const messagesForSnapshot = conversationMessages as unknown as t.IMessage[];
      const fileSnapshots = snapshotFiles
        ? await buildFileSnapshots(
            mongoose,
            targetMessageId
              ? getMessagesUpToTarget(messagesForSnapshot, targetMessageId)
              : messagesForSnapshot,
            user,
          )
        : [];

      const shareId = nanoid();
      const created = await SharedLink.create({
        shareId,
        conversationId,
        messages: conversationMessages,
        title,
        user,
        snapshotFiles,
        ...(targetMessageId && { targetMessageId }),
        ...(expiredAt && { expiredAt }),
        ...(snapshotFiles && { fileSnapshots }),
      });

      return { _id: created._id.toString(), shareId, conversationId, targetMessageId };
    } catch (error) {
      if (error instanceof ShareServiceError) {
        throw error;
      }
      logger.error('[createSharedLink] Error creating shared link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        conversationId,
        targetMessageId,
      });
      throw new ShareServiceError('Error creating shared link', 'SHARE_CREATE_ERROR');
    }
  }

  /**
   * Get a shared link for a conversation
   */
  async function getSharedLink(
    user: string,
    conversationId: string,
  ): Promise<t.GetShareLinkResult> {
    if (!user || !conversationId) {
      throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const share = (await SharedLink.findOne({
        conversationId,
        user,
        ...activeExpirationFilter<t.ISharedLink>(),
      })
        .select('shareId targetMessageId snapshotFiles _id')
        .sort({ updatedAt: -1 })
        .lean()) as {
        shareId?: string;
        targetMessageId?: string;
        snapshotFiles?: boolean;
        _id?: import('mongoose').Types.ObjectId;
      } | null;

      if (!share) {
        return { shareId: null, success: false };
      }

      return {
        _id: share._id?.toString(),
        shareId: share.shareId || null,
        targetMessageId: share.targetMessageId,
        snapshotFiles: share.snapshotFiles,
        success: true,
      };
    } catch (error) {
      logger.error('[getSharedLink] Error getting shared link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        conversationId,
      });
      throw new ShareServiceError('Error getting shared link', 'SHARE_FETCH_ERROR');
    }
  }

  /**
   * Update a shared link with new messages
   */
  async function updateSharedLink(
    user: string,
    shareId: string,
    targetMessageId?: string,
    expiredAt?: Date | null,
    snapshotFiles: boolean = true,
  ): Promise<t.UpdateShareResult> {
    if (!user || !shareId) {
      throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const Message = mongoose.models.Message as SchemaWithMeiliMethods;
      const share = (await SharedLink.findOne({ shareId, user })
        .select('-_id -__v -user')
        .lean()) as t.ISharedLink | null;

      if (!share) {
        throw new ShareServiceError('Share not found', 'SHARE_NOT_FOUND');
      }

      const updatedMessages = await Message.find({ conversationId: share.conversationId, user })
        .sort({ createdAt: 1 })
        .lean();

      const newShareId = nanoid();
      const hasNewExpiration = expiredAt instanceof Date;
      const resolvedTargetMessageId = targetMessageId ?? share.targetMessageId;
      const messagesForSnapshot = updatedMessages as unknown as t.IMessage[];
      const fileSnapshots = snapshotFiles
        ? await buildFileSnapshots(
            mongoose,
            resolvedTargetMessageId
              ? getMessagesUpToTarget(messagesForSnapshot, resolvedTargetMessageId)
              : messagesForSnapshot,
            user,
          )
        : [];
      // Clear any prior snapshot when snapshotting is off so a disabled-feature
      // update can't keep serving stale file ids that the update dropped.
      const unset = {
        ...(expiredAt === null ? { expiredAt: 1 } : {}),
        ...(snapshotFiles ? {} : { fileSnapshots: 1 }),
      };
      const update = {
        $set: {
          messages: updatedMessages,
          user,
          shareId: newShareId,
          snapshotFiles,
          ...(resolvedTargetMessageId && { targetMessageId: resolvedTargetMessageId }),
          ...(hasNewExpiration && { expiredAt }),
          ...(snapshotFiles && { fileSnapshots }),
        },
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      };

      const updatedShare = (await SharedLink.findOneAndUpdate({ shareId, user }, update, {
        new: true,
        upsert: false,
        runValidators: true,
      }).lean()) as t.ISharedLink | null;

      if (!updatedShare) {
        throw new ShareServiceError('Share update failed', 'SHARE_UPDATE_ERROR');
      }

      anonymizeConvo(updatedShare);

      return {
        _id: updatedShare._id?.toString(),
        shareId: newShareId,
        conversationId: updatedShare.conversationId,
        targetMessageId: updatedShare.targetMessageId,
      };
    } catch (error) {
      logger.error('[updateSharedLink] Error updating shared link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        shareId,
      });
      throw new ShareServiceError(
        error instanceof ShareServiceError ? error.message : 'Error updating shared link',
        error instanceof ShareServiceError ? error.code : 'SHARE_UPDATE_ERROR',
      );
    }
  }

  /**
   * Delete a shared link
   */
  async function deleteSharedLink(
    user: string,
    shareId: string,
  ): Promise<t.DeleteShareResult | null> {
    if (!user || !shareId) {
      throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const result = await SharedLink.findOneAndDelete({ shareId, user }).lean();

      if (!result) {
        return null;
      }

      return {
        _id: result._id?.toString(),
        success: true,
        shareId,
        message: 'Share deleted successfully',
      };
    } catch (error) {
      logger.error('[deleteSharedLink] Error deleting shared link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        shareId,
      });
      throw new ShareServiceError('Error deleting shared link', 'SHARE_DELETE_ERROR');
    }
  }

  /**
   * Resolve a single file snapshot entry for a shared link, used by the
   * share-scoped file routes to authorize a file without the owner's ACL.
   * `hasSnapshots` distinguishes a legacy share (field absent → caller may
   * backfill) from an ordinary miss (field present but file not in it → 404,
   * no rebuild). `optedOut` is the per-link "share files" choice — when true the
   * route must 404 and never backfill, so an opted-out link can't expose files.
   */
  async function getSharedLinkFile(
    shareId: string,
    fileId: string,
  ): Promise<{ file: t.SharedFileSnapshot | null; hasSnapshots: boolean; optedOut: boolean }> {
    const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
    const share = (await SharedLink.findOne({
      shareId,
      ...activeExpirationFilter<t.ISharedLink>(),
    })
      .select('fileSnapshots snapshotFiles')
      .lean()) as Pick<t.ISharedLink, 'fileSnapshots' | 'snapshotFiles'> | null;

    if (!share) {
      return { file: null, hasSnapshots: false, optedOut: false };
    }

    const hasSnapshots = share.fileSnapshots !== undefined;
    const optedOut = share.snapshotFiles === false;
    const file = share.fileSnapshots?.find((snapshot) => snapshot.file_id === fileId) ?? null;
    return { file, hasSnapshots, optedOut };
  }

  /**
   * Lazily build and persist the file snapshot for a legacy shared link that
   * predates the feature. Mirrors the lazy migration done for legacy ACL grants.
   * Returns the requested entry (or the full snapshot when no fileId is given).
   */
  async function backfillSharedLinkFiles(
    shareId: string,
    fileId?: string,
  ): Promise<t.SharedFileSnapshot | t.SharedFileSnapshot[] | null> {
    try {
      const SharedLink = mongoose.models.SharedLink as Model<t.ISharedLink>;
      const share = (await SharedLink.findOne({
        shareId,
        ...activeExpirationFilter<t.ISharedLink>(),
      })
        .populate({ path: 'messages', select: '-_id -__v -user' })
        .lean()) as (t.ISharedLink & { messages: t.IMessage[] }) | null;

      if (!share) {
        return null;
      }

      let messages: t.IMessage[] = share.messages ?? [];
      if (share.targetMessageId) {
        messages = getMessagesUpToTarget(messages, share.targetMessageId);
      }

      const fileSnapshots = await buildFileSnapshots(mongoose, messages, share.user);
      await SharedLink.updateOne({ shareId }, { $set: { fileSnapshots } });

      if (fileId) {
        return fileSnapshots.find((snapshot) => snapshot.file_id === fileId) ?? null;
      }
      return fileSnapshots;
    } catch (error) {
      logger.error('[backfillSharedLinkFiles] Error backfilling file snapshots', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shareId,
      });
      return null;
    }
  }

  // Return all methods
  return {
    getSharedLink,
    getSharedLinks,
    createSharedLink,
    updateSharedLink,
    deleteSharedLink,
    getSharedMessages,
    getSharedLinkFile,
    backfillSharedLinkFiles,
    deleteAllSharedLinks,
    deleteConvoSharedLink,
  };
}

export type ShareMethods = ReturnType<typeof createShareMethods>;
