import { HITL_MESSAGE_FILTER_FIELDS, RetentionMode } from 'librechat-data-provider';
import type { UserSubmittedMessageFieldPath } from 'librechat-data-provider';
import type { DeleteResult, FilterQuery, Model, Types } from 'mongoose';
import type { AppConfig, IConversation, IMessage } from '~/types';
import { activeExpirationFilter, createFallbackRetentionDate } from '~/utils/retention';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import logger from '~/config/winston';

/** Simple UUID v4 regex to replace zod validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STORED_USER_SUBMITTED_PATHS = 256;
const MAX_NORMALIZED_USER_SUBMITTED_PATHS = MAX_STORED_USER_SUBMITTED_PATHS + 1;
const MAX_STORED_USER_SUBMITTED_FIELD_PATHS = MAX_NORMALIZED_USER_SUBMITTED_PATHS;
const MAX_USER_SUBMITTED_PATH_LENGTH = 2048;
const MAX_SUBAGENT_CONTROL_RECEIPTS = 64;
const MAX_SUBAGENT_CONTROL_MESSAGE_LENGTH = 4 * 1024;
/** One owner admits at most 64 terminal control invocations. The optimistic
 * writer therefore has enough rounds for every admitted receipt to converge. */
const MAX_SUBAGENT_CONTROL_RECEIPT_CAS_ATTEMPTS = 64;
const PROVENANCE_PATHS_UNION_FIELD = '__lcProvenancePathsUnion';
const PROVENANCE_FIELD_PATHS_UNION_FIELD = '__lcProvenanceFieldPathsUnion';
const HITL_MESSAGE_FILTER_FIELD_SET = new Set<string>(HITL_MESSAGE_FILTER_FIELDS);

function normalizeUserSubmittedPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.length > MAX_USER_SUBMITTED_PATH_LENGTH ||
      seen.has(path)
    ) {
      continue;
    }
    seen.add(path);
    normalized.push(path);
    if (normalized.length >= MAX_NORMALIZED_USER_SUBMITTED_PATHS) {
      break;
    }
  }
  return normalized;
}

function normalizeUserSubmittedMessageFieldPaths(values: unknown): UserSubmittedMessageFieldPath[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized: UserSubmittedMessageFieldPath[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value == null || typeof value !== 'object') {
      continue;
    }
    const { path, field } = value as { path?: unknown; field?: unknown };
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.length > MAX_USER_SUBMITTED_PATH_LENGTH ||
      typeof field !== 'string' ||
      !HITL_MESSAGE_FILTER_FIELD_SET.has(field)
    ) {
      continue;
    }
    const key = `${field}:${path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ path, field: field as UserSubmittedMessageFieldPath['field'] });
    if (normalized.length >= MAX_NORMALIZED_USER_SUBMITTED_PATHS) {
      break;
    }
  }
  return normalized;
}

function capNormalizedProvenance(
  userSubmittedPaths: readonly string[],
  userSubmittedMessageFieldPaths: readonly UserSubmittedMessageFieldPath[],
): {
  userSubmittedPaths: string[];
  userSubmittedMessageFieldPaths: UserSubmittedMessageFieldPath[];
  promoteWholeMessage: boolean;
} {
  return {
    userSubmittedPaths: userSubmittedPaths.slice(0, MAX_STORED_USER_SUBMITTED_PATHS),
    userSubmittedMessageFieldPaths: userSubmittedMessageFieldPaths.slice(
      0,
      MAX_STORED_USER_SUBMITTED_FIELD_PATHS,
    ),
    promoteWholeMessage: userSubmittedPaths.length > MAX_STORED_USER_SUBMITTED_PATHS,
  };
}

function getStoredArrayExpression(field: string): Record<string, unknown> {
  return {
    $cond: [{ $isArray: `$${field}` }, `$${field}`, []],
  };
}

function getSetUnionExpression(field: string, values: readonly unknown[]): Record<string, unknown> {
  return {
    $setUnion: [getStoredArrayExpression(field), values],
  };
}

function getLiteralPipelineSet(update: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(update).map(([field, value]) => [field, { $literal: value }]),
  );
}

function getStrictPipelineUpdate(Message: Model<IMessage>, update: Record<string, unknown>) {
  const candidate = { ...update };
  delete candidate._id;
  delete candidate.tenantId;
  return Message.castObject(candidate) as unknown as Record<string, unknown>;
}

type StoredSubagentControlReceipt = NonNullable<
  NonNullable<IMessage['subagentTask']>['controlReceipts']
>[number];

const terminalControlReceipt = (receipt: StoredSubagentControlReceipt): boolean =>
  receipt.status === 'applied' || receipt.status === 'rejected' || receipt.status === 'failed';

function retainSubagentControlReceipts(
  current: StoredSubagentControlReceipt[],
  receipt: StoredSubagentControlReceipt,
): {
  status: 'updated' | 'unchanged' | 'conflict' | 'capacity';
  receipts: StoredSubagentControlReceipt[];
} {
  const existingIndex = current.findIndex(
    (candidate) => candidate.invocationId === receipt.invocationId,
  );
  let merged: StoredSubagentControlReceipt[];
  if (existingIndex < 0) {
    merged = [...current, receipt];
  } else {
    const existing = current[existingIndex];
    if (existing.fingerprint !== receipt.fingerprint) {
      return { status: 'conflict', receipts: current };
    }
    if (
      terminalControlReceipt(existing) ||
      existing.status === receipt.status ||
      (existing.status === 'accepted' && receipt.status === 'reserved')
    ) {
      return { status: 'unchanged', receipts: current };
    }
    merged = current.map((candidate, index) => (index === existingIndex ? receipt : candidate));
  }
  const accepted = merged.filter(
    (candidate) => candidate.status === 'reserved' || candidate.status === 'accepted',
  );
  /** Reserved and accepted receipts are idempotency fences for commands that can
   * still take effect. Never evict one to admit another receipt: report capacity
   * so the caller refuses the command before mutating the live task. */
  if (accepted.length > MAX_SUBAGENT_CONTROL_RECEIPTS) {
    return { status: 'capacity', receipts: current };
  }
  const terminalAllowance = Math.max(0, MAX_SUBAGENT_CONTROL_RECEIPTS - accepted.length);
  let terminal =
    terminalAllowance === 0
      ? []
      : merged
          .filter((candidate) => candidate.status !== 'reserved' && candidate.status !== 'accepted')
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime() ||
              left.invocationId.localeCompare(right.invocationId),
          )
          .slice(-terminalAllowance);
  const advancesActiveFence =
    existingIndex >= 0 &&
    !terminalControlReceipt(current[existingIndex]) &&
    terminalControlReceipt(receipt);
  if (
    advancesActiveFence &&
    !terminal.some((candidate) => candidate.invocationId === receipt.invocationId)
  ) {
    /** A terminal transition for an active fence must outrank unrelated terminal
     * history even though it retains the command's older occurrence timestamp. */
    const otherAllowance = Math.max(0, terminalAllowance - 1);
    terminal = [
      ...(otherAllowance === 0
        ? []
        : terminal
            .filter((candidate) => candidate.invocationId !== receipt.invocationId)
            .slice(-otherAllowance)),
      receipt,
    ].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.invocationId.localeCompare(right.invocationId),
    );
  }
  const receipts = [...accepted, ...terminal];
  if (!receipts.some((candidate) => candidate.invocationId === receipt.invocationId)) {
    return { status: 'capacity', receipts: current };
  }
  return { status: 'updated', receipts };
}

/**
 * Builds one Mongo aggregation update that merges and caps both provenance
 * sets. Generic path overflow promotes the message to whole-message user
 * provenance before excess paths are discarded. Exact HITL field provenance
 * retains one bounded overflow sentinel (257 entries) so field-specific
 * policies still fail closed instead of forgetting a dropped field identity.
 */
function buildAtomicProvenanceMerge(
  update: Record<string, unknown>,
  userSubmittedPaths: readonly string[],
  userSubmittedMessageFieldPaths: readonly UserSubmittedMessageFieldPath[],
  stampModelOutputOnInsert = false,
): Record<string, unknown>[] {
  const pathsUnion = getSetUnionExpression('userSubmittedPaths', userSubmittedPaths);
  const fieldPathsUnion = getSetUnionExpression(
    'userSubmittedMessageFieldPaths',
    userSubmittedMessageFieldPaths,
  );
  let existingOrSubmitted: unknown = '$isUserSubmitted';
  if (typeof update.isUserSubmitted === 'boolean') {
    existingOrSubmitted = update.isUserSubmitted;
  } else if (stampModelOutputOnInsert) {
    existingOrSubmitted = { $ifNull: ['$isUserSubmitted', false] };
  }

  return [
    {
      $set: {
        ...getLiteralPipelineSet(update),
        [PROVENANCE_PATHS_UNION_FIELD]: pathsUnion,
        [PROVENANCE_FIELD_PATHS_UNION_FIELD]: fieldPathsUnion,
      },
    },
    {
      $set: {
        userSubmittedPaths: {
          $slice: [`$${PROVENANCE_PATHS_UNION_FIELD}`, MAX_STORED_USER_SUBMITTED_PATHS],
        },
        userSubmittedMessageFieldPaths: {
          $slice: [`$${PROVENANCE_FIELD_PATHS_UNION_FIELD}`, MAX_STORED_USER_SUBMITTED_FIELD_PATHS],
        },
        isUserSubmitted: {
          $cond: [
            {
              $gt: [{ $size: `$${PROVENANCE_PATHS_UNION_FIELD}` }, MAX_STORED_USER_SUBMITTED_PATHS],
            },
            true,
            existingOrSubmitted,
          ],
        },
      },
    },
    {
      $unset: [PROVENANCE_PATHS_UNION_FIELD, PROVENANCE_FIELD_PATHS_UNION_FIELD],
    },
  ];
}

function getSteerUserSubmittedPaths(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const paths: string[] = [];
  for (let index = 0; index < content.length; index++) {
    const part = content[index] as { type?: unknown } | null | undefined;
    if (part?.type === 'steer') {
      paths.push(`/content/${index}`);
    }
  }
  return paths;
}

/**
 * Maximum private transcript JSON that may cross the MongoDB projection seam
 * for the bounded public subagent-activity view. This gives the sanitizer
 * enough source headroom while preventing multi-megabyte transcripts from
 * being materialized merely to produce a 64 KiB public activity response.
 */
export const SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT: number = 256 * 1024;
const SUBAGENT_ACTIVITY_PROJECTION_SOURCE_BYTE_LIMIT = 64 * 1024;

/**
 * Maximum activity sources materialized for one child-view poll. New writers
 * supply at most four 64 KiB public projections; legacy rows fall back to at
 * most four 256 KiB private transcripts during a rolling deployment.
 */
export const SUBAGENT_TRANSCRIPT_PAGE_LIMIT: number = 4;
const SUBAGENT_ACTIVITY_SOURCE_CANDIDATE_LIMIT = SUBAGENT_TRANSCRIPT_PAGE_LIMIT * 2;

/**
 * Ordinary persisted message content is the authoritative refresh source when
 * an execution did not write a private subagent transcript. Project only the
 * visible activity vocabulary and bound it before MongoDB returns the row.
 */
export const SUBAGENT_MESSAGE_ACTIVITY_ITEM_LIMIT: number = 16;
const SUBAGENT_MESSAGE_ACTIVITY_TEXT_CODE_POINT_LIMIT = 2048;
const SUBAGENT_MESSAGE_ACTIVITY_TOOL_INPUT_CODE_POINT_LIMIT = 512;
const SUBAGENT_MESSAGE_ACTIVITY_TOOL_OUTPUT_CODE_POINT_LIMIT = 1024;
const SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT = 128;
const SUBAGENT_MESSAGE_ACTIVITY_LABEL_CODE_POINT_LIMIT = 512;
const SUBAGENT_MESSAGE_ACTIVITY_LABEL_IDS_LIMIT = 8;
const SUBAGENT_VIEW_CONTROL_RECEIPT_LIMIT = 32;
const SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT = 128;

/**
 * Exclusion projection for message reads that feed the chat client (the
 * conversation GET and shared-link reads). Every excluded field is either
 * server-internal (ids, replay signatures, legacy summarization state) or a
 * web_search SERP vertical no citation marker or UI can address: markers
 * resolve `search|image|news|video|ref|file` through organic/images/
 * topStories/videos/references (all kept — `news` markers read topStories,
 * never the `news` collection). The JSON export mirrors this cache, so
 * fields removed here also leave user exports.
 */
export const CLIENT_MESSAGE_SELECT: string = [
  '-_id',
  '-__v',
  '-user',
  '-clientId',
  '-invocationId',
  '-conversationSignature',
  '-summary',
  '-summaryTokenCount',
  '-contextMeta',
  '-langfuseSampled',
  '-langfuseDestinationIds',
  '-metadata.thoughtSignatures',
  '-attachments.web_search.knowledgeGraph',
  '-attachments.web_search.peopleAlsoAsk',
  '-attachments.web_search.relatedSearches',
  '-attachments.web_search.shopping',
  '-attachments.web_search.places',
  '-attachments.web_search.news',
  '-attachments.web_search.organic.sitelinks',
  '-attachments.web_search.organic.highlights',
  '-attachments.web_search.topStories.highlights',
].join(' ');

interface MessageQueryOptions {
  limit?: number;
  sort?: Record<string, 1 | -1> | false;
}

export type SubagentTaskResultClaim =
  | { status: 'not_found' }
  | { status: 'claimed'; message: IMessage }
  | { status: 'acquired'; message: IMessage };

export type SubagentThreadViewMessageRecord = Pick<
  IMessage,
  | 'messageId'
  | 'parentMessageId'
  | 'isCreatedByUser'
  | 'text'
  | 'createdAt'
  | 'error'
  | 'unfinished'
  | 'subagentTranscript'
  | 'subagentTriggerProjection'
> & {
  textProjectionTruncated?: boolean;
  subagentTranscriptProjectionTruncated?: boolean;
  /** Storage-bounded visible content; validated into the public activity type by the API. */
  subagentActivity?: unknown[];
  subagentActivityProjectionJson?: string;
  subagentActivityProjectionTruncated?: boolean;
  /** Storage-bounded task state; private replay and execution fields never cross this seam. */
  subagentTask?: {
    status?: NonNullable<IMessage['subagentTask']>['status'];
    controlReceipts?: Array<
      Omit<StoredSubagentControlReceipt, 'fingerprint'> & { fingerprint?: never }
    >;
    controlReceiptsProjectionTruncated?: boolean;
  };
};

export type ParentSubagentTaskRecord = {
  conversationId: string;
  /** The shared bounded source window filled, so this child's history may be incomplete. */
  sourceTruncated?: boolean;
  tasks: Array<
    Pick<IMessage, 'messageId' | 'createdAt'> & {
      status: NonNullable<IMessage['subagentTask']>['status'];
      /** True when status was inferred from an ordinary event-turn row. */
      statusDerived?: boolean;
      /** Private ordering token used only while merging bounded storage reads. */
      occurrenceId?: Types.ObjectId;
    }
  >;
};

export interface MessageMethods {
  saveMessage(
    ctx: {
      userId: string;
      isTemporary?: boolean;
      expiredAt?: Date;
      interfaceConfig?: AppConfig['interfaceConfig'];
    },
    params: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
  ): Promise<IMessage | null | undefined>;
  recordSubagentTaskControlReceipt(input: {
    userId: string;
    conversationId: string;
    taskId: string;
    tenantId?: string;
    receipt: NonNullable<NonNullable<IMessage['subagentTask']>['controlReceipts']>[number];
  }): Promise<boolean | 'unchanged' | 'conflict'>;
  getSubagentTaskControlReceipt(input: {
    userId: string;
    conversationId: string;
    taskId: string;
    invocationId: string;
    tenantId?: string;
  }): Promise<NonNullable<NonNullable<IMessage['subagentTask']>['controlReceipts']>[number] | null>;
  getSubagentTaskControlReplay(input: {
    userId: string;
    parentConversationId: string;
    taskId: string;
    invocationId: string;
    tenantId?: string;
  }): Promise<{
    receipt: NonNullable<NonNullable<IMessage['subagentTask']>['controlReceipts']>[number];
    task: {
      taskId: string;
      threadId: string;
      subagentType: string;
      status: NonNullable<IMessage['subagentTask']>['status'];
      resultAvailable: boolean;
      resultClaimed: boolean;
      pendingControls: number;
      createdAt: Date;
      updatedAt: Date;
    };
  } | null>;
  bulkSaveMessages(
    messages: Array<Partial<IMessage>>,
    overrideTimestamp?: boolean,
  ): Promise<unknown>;
  recordMessage(params: {
    user: string;
    endpoint?: string;
    messageId: string;
    conversationId?: string;
    parentMessageId?: string;
    [key: string]: unknown;
  }): Promise<IMessage | null>;
  updateMessageText(userId: string, params: { messageId: string; text: string }): Promise<void>;
  updateToolCallResult(params: {
    userId: string;
    messageId: string;
    conversationId: string;
    toolCallId: string;
    agentId?: string;
    output?: string;
    attachments?: unknown[];
    markBackgrounded?: boolean;
  }): Promise<{ matched: boolean; unfinished: boolean }>;
  updateMessage(
    userId: string,
    message: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
  ): Promise<Partial<IMessage>>;
  claimSubagentTaskResult(params: {
    userId: string;
    conversationId: string;
    taskId: string;
    kind: 'manual' | 'wakeup';
    claimId: string;
  }): Promise<SubagentTaskResultClaim>;
  releaseSubagentTaskResultClaim(params: {
    userId: string;
    conversationId: string;
    taskId: string;
    kind: 'manual' | 'wakeup';
    claimId: string;
  }): Promise<boolean>;
  deleteMessagesSince(
    userId: string,
    params: { messageId: string; conversationId: string },
  ): Promise<DeleteResult>;
  getMessages(
    filter: FilterQuery<IMessage>,
    select?: string,
    options?: MessageQueryOptions,
  ): Promise<IMessage[]>;
  getMessagesForSubagentThreadView(input: {
    user: string;
    conversationId: string;
    tenantId?: string;
    selectedTaskId?: string;
    beforeMessageId?: string;
    limit: number;
    textCodePointLimit: number;
  }): Promise<SubagentThreadViewMessageRecord[]>;
  listSubagentTasksForThreads(input: {
    user: string;
    conversationIds: string[];
    tenantId?: string;
    limitPerThread: number;
  }): Promise<ParentSubagentTaskRecord[]>;
  getMessage(params: { user: string; messageId: string }): Promise<IMessage | null>;
  getMessagesByCursor(
    filter: FilterQuery<IMessage>,
    options?: {
      sortField?: string;
      sortOrder?: 1 | -1;
      limit?: number;
      cursor?: string | null;
    },
  ): Promise<{ messages: IMessage[]; nextCursor: string | null }>;
  searchMessages(
    query: string,
    searchOptions: Partial<IMessage>,
    hydrate?: boolean,
  ): Promise<unknown>;
  deleteMessages(filter: FilterQuery<IMessage>): Promise<DeleteResult>;
}

export function createMessageMethods(mongoose: typeof import('mongoose')): MessageMethods {
  /**
   * Saves a message in the database.
   */
  async function saveMessage(
    {
      userId,
      isTemporary,
      expiredAt,
      interfaceConfig,
    }: {
      userId: string;
      isTemporary?: boolean;
      expiredAt?: Date;
      interfaceConfig?: AppConfig['interfaceConfig'];
    },
    params: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
  ) {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const conversationId = params.conversationId as string | undefined;
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      logger.warn(
        `Invalid conversation ID: ${conversationId} (context: ${metadata?.context ?? 'n/a'})`,
      );
      return;
    }

    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const update: Record<string, unknown> = {
        ...params,
        user: userId,
        messageId: params.newMessageId || params.messageId,
      };

      if (expiredAt instanceof Date && !Number.isNaN(expiredAt.getTime())) {
        if (typeof isTemporary === 'boolean') {
          update.isTemporary = isTemporary;
        }
        update.expiredAt = expiredAt;
      } else if (interfaceConfig?.retentionMode === RetentionMode.ALL) {
        if (typeof isTemporary === 'boolean') {
          update.isTemporary = isTemporary;
        }
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === true) {
        update.isTemporary = true;
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === false) {
        update.isTemporary = false;
        update.expiredAt = null;
      }

      if (update.tokenCount != null && isNaN(update.tokenCount as number)) {
        logger.warn(
          `Resetting invalid \`tokenCount\` for message \`${params.messageId}\`: ${update.tokenCount}`,
        );
        logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
        update.tokenCount = 0;
      }
      const userSubmittedPaths = normalizeUserSubmittedPaths([
        ...(Array.isArray(params.userSubmittedPaths) ? params.userSubmittedPaths : []),
        ...getSteerUserSubmittedPaths(params.content),
      ]);
      const userSubmittedMessageFieldPaths = normalizeUserSubmittedMessageFieldPaths(
        params.userSubmittedMessageFieldPaths,
      );
      delete update.userSubmittedPaths;
      delete update.userSubmittedMessageFieldPaths;
      const stampModelOutputOnInsert =
        params.isCreatedByUser === false && params.isUserSubmitted === undefined;
      let messageUpdate: Record<string, unknown> | Record<string, unknown>[] = update;
      if (userSubmittedPaths.length > 0 || userSubmittedMessageFieldPaths.length > 0) {
        messageUpdate = buildAtomicProvenanceMerge(
          getStrictPipelineUpdate(Message, update),
          userSubmittedPaths,
          userSubmittedMessageFieldPaths,
          stampModelOutputOnInsert,
        );
      } else if (stampModelOutputOnInsert) {
        messageUpdate = { $set: update, $setOnInsert: { isUserSubmitted: false } };
      }
      const message = await Message.findOneAndUpdate(
        { messageId: params.messageId, user: userId },
        messageUpdate,
        { upsert: true, new: true },
      );

      if (
        interfaceConfig?.retentionMode === RetentionMode.ALL &&
        typeof isTemporary !== 'boolean' &&
        (message.isTemporary == null ||
          (message.isTemporary === false && message.$isDefault('isTemporary')))
      ) {
        await Message.updateOne(
          { _id: message._id, isTemporary: { $ne: false } },
          { $set: { isTemporary: false } },
        );
        message.isTemporary = false;
      }

      return message.toObject();
    } catch (err: unknown) {
      logger.error('Error saving message:', err);
      logger.info(`---\`saveMessage\` context: ${metadata?.context}`);

      const mongoErr = err as { code?: number; message?: string };
      if (mongoErr.code === 11000 && mongoErr.message?.includes('duplicate key error')) {
        logger.warn(`Duplicate messageId detected: ${params.messageId}. Continuing execution.`);

        try {
          const Message = mongoose.models.Message as Model<IMessage>;
          const existingMessage = await Message.findOne({
            messageId: params.messageId,
            user: userId,
          });

          if (existingMessage) {
            return existingMessage.toObject();
          }

          return undefined;
        } catch (findError) {
          logger.warn(
            `Could not retrieve existing message with ID ${params.messageId}: ${(findError as Error).message}`,
          );
          return undefined;
        }
      }

      throw err;
    }
  }

  /**
   * Saves multiple messages in bulk.
   */
  async function bulkSaveMessages(
    messages: Array<Record<string, unknown>>,
    overrideTimestamp = false,
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const bulkOps = messages.map((message) => {
        const normalizedMessage = { ...message };
        const provenance = capNormalizedProvenance(
          normalizeUserSubmittedPaths(message.userSubmittedPaths),
          normalizeUserSubmittedMessageFieldPaths(message.userSubmittedMessageFieldPaths),
        );
        if (provenance.userSubmittedPaths.length > 0) {
          normalizedMessage.userSubmittedPaths = provenance.userSubmittedPaths;
        } else {
          delete normalizedMessage.userSubmittedPaths;
        }
        if (provenance.userSubmittedMessageFieldPaths.length > 0) {
          normalizedMessage.userSubmittedMessageFieldPaths =
            provenance.userSubmittedMessageFieldPaths;
        } else {
          delete normalizedMessage.userSubmittedMessageFieldPaths;
        }
        if (provenance.promoteWholeMessage) {
          normalizedMessage.isUserSubmitted = true;
        }
        return {
          updateOne: {
            filter: { messageId: message.messageId },
            update: normalizedMessage,
            timestamps: !overrideTimestamp,
            upsert: true,
          },
        };
      });
      const result = await tenantSafeBulkWrite(Message, bulkOps);
      return result;
    } catch (err) {
      logger.error('Error saving messages in bulk:', err);
      throw err;
    }
  }

  /**
   * Records a message in the database (no UUID validation).
   */
  async function recordMessage({
    user,
    endpoint,
    messageId,
    conversationId,
    parentMessageId,
    ...rest
  }: {
    user: string;
    endpoint?: string;
    messageId: string;
    conversationId?: string;
    parentMessageId?: string;
    [key: string]: unknown;
  }) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const provenance = capNormalizedProvenance(
        normalizeUserSubmittedPaths(rest.userSubmittedPaths),
        normalizeUserSubmittedMessageFieldPaths(rest.userSubmittedMessageFieldPaths),
      );
      const {
        userSubmittedPaths: _userSubmittedPaths,
        userSubmittedMessageFieldPaths: _userSubmittedMessageFieldPaths,
        ...safeRest
      } = rest;
      const message = {
        user,
        endpoint,
        messageId,
        conversationId,
        parentMessageId,
        ...safeRest,
        ...(provenance.userSubmittedPaths.length > 0 && {
          userSubmittedPaths: provenance.userSubmittedPaths,
        }),
        ...(provenance.userSubmittedMessageFieldPaths.length > 0 && {
          userSubmittedMessageFieldPaths: provenance.userSubmittedMessageFieldPaths,
        }),
        ...(provenance.promoteWholeMessage && { isUserSubmitted: true }),
      };
      const update =
        rest.isCreatedByUser === false &&
        rest.isUserSubmitted === undefined &&
        !provenance.promoteWholeMessage
          ? { $set: message, $setOnInsert: { isUserSubmitted: false } }
          : message;

      return await Message.findOneAndUpdate({ user, messageId }, update, {
        upsert: true,
        new: true,
      });
    } catch (err) {
      logger.error('Error recording message:', err);
      throw err;
    }
  }

  /**
   * Updates the text of a message.
   */
  async function updateMessageText(
    userId: string,
    { messageId, text }: { messageId: string; text: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      await Message.updateOne({ messageId, user: userId }, { text });
    } catch (err) {
      logger.error('Error updating message text:', err);
      throw err;
    }
  }

  /**
   * Patches a persisted tool_call content part in place and appends attachments,
   * for results that settle after the turn's message was finalized (background
   * tool calls). Atomic single update so two tasks completing concurrently on
   * the same message cannot lose each other's attachments, and IDEMPOTENT
   * (attachments dedupe by `file_id ?? filepath`, scoped to this tool call so
   * sibling calls sharing a filename keep their own entries) so it can be
   * re-applied to heal a later full-row save that reverted the patch.
   *
   * Returns `matched: false` when the message row does not exist yet (the
   * dispatch turn has not finalized) and surfaces `unfinished` when the
   * matched row is a mid-turn partial save (client disconnect) — the eventual
   * finalize will overwrite the patch with in-memory content, so callers
   * should keep re-applying until a finalized row is patched.
   */
  async function updateToolCallResult({
    userId,
    messageId,
    conversationId,
    toolCallId,
    agentId,
    output,
    attachments,
    markBackgrounded,
  }: {
    userId: string;
    messageId: string;
    conversationId: string;
    toolCallId: string;
    /** Scopes the part match when provider tool-call ids repeat across
     *  agents in one response message (e.g. `call_0` per response); a part
     *  without agent identity matches any caller (single-agent runs). */
    agentId?: string;
    output?: string;
    attachments?: unknown[];
    /**
     * Stamps `backgrounded: true` onto the patched tool call. Replacing the
     * dispatch-handle output with the settled task's stdout destroys the only
     * signal renderers had that this call ran detached (the handle JSON and
     * the live status-marker attachment are both transient), so the patch
     * that erases it must persist a durable one alongside.
     */
    markBackgrounded?: boolean;
  }): Promise<{ matched: boolean; unfinished: boolean }> {
    const stages: Record<string, unknown>[] = [];
    if (output !== undefined) {
      stages.push({
        $set: {
          content: {
            $map: {
              input: { $ifNull: ['$content', []] },
              as: 'part',
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$$part.type', 'tool_call'] },
                      { $eq: ['$$part.tool_call.id', toolCallId] },
                      ...(agentId != null
                        ? [
                            {
                              $in: [
                                { $ifNull: ['$$part.agentId', '$$part.tool_call.agentId'] },
                                [null, agentId],
                              ],
                            },
                          ]
                        : []),
                    ],
                  },
                  {
                    $mergeObjects: [
                      '$$part',
                      {
                        tool_call: {
                          $mergeObjects: [
                            '$$part.tool_call',
                            {
                              output: { $literal: output },
                              ...(markBackgrounded === true ? { backgrounded: true } : {}),
                            },
                          ],
                        },
                      },
                    ],
                  },
                  '$$part',
                ],
              },
            },
          },
        },
      });
    }
    if (attachments !== undefined && attachments.length > 0) {
      /** Dedupe key mirrors the resume merge: `file_id ?? filepath`, so
       *  download-fallback attachments (no `file_id`, only a filepath) stay
       *  idempotent across re-applications instead of duplicating per poll. */
      const attachmentKeys = attachments
        .map((attachment) => {
          const { file_id, filepath } = attachment as { file_id?: unknown; filepath?: unknown };
          return typeof file_id === 'string' ? file_id : filepath;
        })
        .filter((key): key is string => typeof key === 'string');
      stages.push({
        $set: {
          attachments: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ['$attachments', []] },
                  as: 'existing',
                  /** Replace only THIS tool call's prior entries: sibling calls
                   *  can legitimately share a `file_id` (the filename claim is
                   *  per-conversation), and the client anchors attachments to
                   *  cards by `toolCallId`. */
                  cond: {
                    $not: [
                      {
                        $and: [
                          {
                            $in: [
                              { $ifNull: ['$$existing.file_id', '$$existing.filepath'] },
                              { $literal: attachmentKeys },
                            ],
                          },
                          { $eq: ['$$existing.toolCallId', toolCallId] },
                          /** Provider tool-call ids repeat across agents in
                           *  handoff messages; a sibling agent's attachment
                           *  under the same id/key must survive (missing
                           *  agent identity = legacy wildcard). */
                          ...(agentId != null
                            ? [
                                {
                                  $in: [{ $ifNull: ['$$existing.agentId', null] }, [null, agentId]],
                                },
                              ]
                            : []),
                        ],
                      },
                    ],
                  },
                },
              },
              { $literal: attachments },
            ],
          },
        },
      });
    }
    if (stages.length === 0) {
      return { matched: false, unfinished: false };
    }
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const result = await Message.findOneAndUpdate(
        { messageId, user: userId, conversationId },
        stages,
        { new: true, projection: { unfinished: 1 } },
      ).lean<{ unfinished?: boolean } | null>();
      return { matched: result != null, unfinished: result?.unfinished === true };
    } catch (err) {
      logger.error('Error updating tool call result:', err);
      throw err;
    }
  }

  /**
   * Updates a message and returns sanitized fields.
   */
  async function updateMessage(
    userId: string,
    message: { messageId: string; [key: string]: unknown },
    metadata?: { context?: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const { messageId, ...update } = message;
      const submittedPaths = normalizeUserSubmittedPaths(update.userSubmittedPaths);
      const submittedMessageFields = normalizeUserSubmittedMessageFieldPaths(
        update.userSubmittedMessageFieldPaths,
      );
      delete update.userSubmittedPaths;
      delete update.userSubmittedMessageFieldPaths;
      const messageUpdate =
        submittedPaths.length > 0 || submittedMessageFields.length > 0
          ? buildAtomicProvenanceMerge(
              getStrictPipelineUpdate(Message, update),
              submittedPaths,
              submittedMessageFields,
            )
          : update;
      const updatedMessage = await Message.findOneAndUpdate(
        { messageId, user: userId },
        messageUpdate,
        { new: true },
      );

      if (!updatedMessage) {
        throw new Error('Message not found or user not authorized.');
      }

      return {
        messageId: updatedMessage.messageId,
        conversationId: updatedMessage.conversationId,
        parentMessageId: updatedMessage.parentMessageId,
        sender: updatedMessage.sender,
        text: updatedMessage.text,
        isCreatedByUser: updatedMessage.isCreatedByUser,
        isUserSubmitted: updatedMessage.isUserSubmitted,
        userSubmittedPaths: updatedMessage.userSubmittedPaths,
        userSubmittedMessageFieldPaths: updatedMessage.userSubmittedMessageFieldPaths,
        tokenCount: updatedMessage.tokenCount,
        feedback: updatedMessage.feedback,
        endpoint: updatedMessage.endpoint,
        langfuseSampled: updatedMessage.langfuseSampled,
        langfuseDestinationIds: updatedMessage.langfuseDestinationIds,
      };
    } catch (err) {
      logger.error('Error updating message:', err);
      if (metadata?.context) {
        logger.info(`---\`updateMessage\` context: ${metadata.context}`);
      }
      throw err;
    }
  }

  /**
   * Atomically records one bounded parent-to-child control receipt on the
   * durable task input. Terminal receipt states are monotonic, and accepted
   * receipts are retained ahead of older terminal history when the bound fills.
   */
  async function recordSubagentTaskControlReceipt({
    userId,
    conversationId,
    taskId,
    tenantId,
    receipt,
  }: {
    userId: string;
    conversationId: string;
    taskId: string;
    tenantId?: string;
    receipt: NonNullable<NonNullable<IMessage['subagentTask']>['controlReceipts']>[number];
  }): Promise<boolean | 'unchanged' | 'conflict'> {
    const validActions = new Set(['steer', 'queue', 'interrupt', 'cancel', 'cancel_message']);
    const validStatuses = new Set(['reserved', 'accepted', 'applied', 'rejected', 'failed']);
    if (
      userId.length === 0 ||
      conversationId.length === 0 ||
      conversationId.length > 256 ||
      taskId.length === 0 ||
      taskId.length > 256 ||
      receipt.invocationId.length === 0 ||
      receipt.invocationId.length > 128 ||
      receipt.fingerprint.length === 0 ||
      receipt.fingerprint.length > 128 ||
      !validActions.has(receipt.action) ||
      !validStatuses.has(receipt.status) ||
      (receipt.controlId != null && receipt.controlId.length > 256) ||
      (receipt.message != null && receipt.message.length > MAX_SUBAGENT_CONTROL_MESSAGE_LENGTH) ||
      !Number.isFinite(receipt.createdAt.getTime()) ||
      !Number.isFinite(receipt.updatedAt.getTime())
    ) {
      throw new TypeError('Invalid subagent task control receipt');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const recordsTerminalRejection =
      receipt.status === 'rejected' && receipt.reason === 'task_not_running';
    const identity = {
      user: userId,
      conversationId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
      messageId: `${taskId}:user`,
      /** A genuinely new command can arrive after its task settles or its final
       * lease expires. Persist that authoritative rejection for retries; every
       * command that could still be applied remains fenced to a running task. */
      ...(recordsTerminalRejection
        ? { 'subagentTask.status': { $in: ['running', 'completed', 'error', 'cancelled'] } }
        : { 'subagentTask.status': 'running' }),
    };
    /** Amazon DocumentDB does not support aggregation-pipeline updates. Use a
     * bounded optimistic compare-and-swap: the read is small, the write uses
     * only plain operators, and concurrent writers retry rather than overwrite. */
    for (let attempt = 0; attempt < MAX_SUBAGENT_CONTROL_RECEIPT_CAS_ATTEMPTS; attempt += 1) {
      const currentMessage = await Message.findOne(identity)
        .select({ 'subagentTask.controlReceipts': 1, _id: 0 })
        .lean<Pick<IMessage, 'subagentTask'> | null>();
      if (currentMessage == null) return false;
      const current = currentMessage.subagentTask?.controlReceipts ?? [];
      const retained = retainSubagentControlReceipts(current, receipt);
      if (retained.status === 'conflict') return 'conflict';
      if (retained.status === 'unchanged') return 'unchanged';
      if (retained.status === 'capacity') return false;
      const next = retained.receipts;
      const currentFilter =
        currentMessage.subagentTask?.controlReceipts == null
          ? { 'subagentTask.controlReceipts': { $exists: false } }
          : { 'subagentTask.controlReceipts': current };
      const updated = await Message.findOneAndUpdate(
        { ...identity, ...currentFilter },
        { $set: { 'subagentTask.controlReceipts': next } },
        { new: false, projection: { messageId: 1 } },
      ).lean<{ messageId: string } | null>();
      if (updated != null) return true;
    }
    throw new Error('Subagent control receipt write contention exceeded its retry bound.');
  }

  /** Reads one bounded authoritative receipt by its exact durable task identity.
   * The stored projection is already capped, and no task/runtime metadata leaves
   * this method. Authorization remains part of the Mongo identity. */
  async function getSubagentTaskControlReceipt({
    userId,
    conversationId,
    taskId,
    invocationId,
    tenantId,
  }: {
    userId: string;
    conversationId: string;
    taskId: string;
    invocationId: string;
    tenantId?: string;
  }): Promise<StoredSubagentControlReceipt | null> {
    if (
      userId.length === 0 ||
      conversationId.length === 0 ||
      conversationId.length > 256 ||
      taskId.length === 0 ||
      taskId.length > 256 ||
      invocationId.length === 0 ||
      invocationId.length > 128
    ) {
      throw new TypeError('Invalid subagent task control receipt identity');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const input = await Message.findOne({
      user: userId,
      conversationId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
      messageId: `${taskId}:user`,
      'subagentTask.controlReceipts.invocationId': invocationId,
    })
      .select({ 'subagentTask.controlReceipts': 1, _id: 0 })
      .lean<Pick<IMessage, 'subagentTask'> | null>();
    const receipt = input?.subagentTask?.controlReceipts?.find(
      (candidate) => candidate.invocationId === invocationId,
    );
    /** Reservations are a server-private at-most-once fence, not proof that a
     * control was applied. Public HTTP callers retry through the owning store. */
    return receipt?.status === 'reserved' ? null : (receipt ?? null);
  }

  /** Resolves one authoritative receipt after its live owner disappears. The
   * child conversation must still belong to the caller's parent thread, so a
   * task id learned in another chat cannot cross orchestration scopes. */
  async function getSubagentTaskControlReplay({
    userId,
    parentConversationId,
    taskId,
    invocationId,
    tenantId,
  }: {
    userId: string;
    parentConversationId: string;
    taskId: string;
    invocationId: string;
    tenantId?: string;
  }): Promise<{
    receipt: StoredSubagentControlReceipt;
    task: {
      taskId: string;
      threadId: string;
      subagentType: string;
      status: 'running' | 'completed' | 'error' | 'cancelled';
      resultAvailable: boolean;
      resultClaimed: boolean;
      pendingControls: number;
      createdAt: Date;
      updatedAt: Date;
    };
  } | null> {
    if (
      userId.length === 0 ||
      parentConversationId.length === 0 ||
      parentConversationId.length > 256 ||
      taskId.length === 0 ||
      taskId.length > 256 ||
      invocationId.length === 0 ||
      invocationId.length > 128
    ) {
      throw new TypeError('Invalid subagent task control replay identity');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const input = await Message.findOne({
      user: userId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
      messageId: `${taskId}:user`,
      'subagentTask.controlReceipts.invocationId': invocationId,
    })
      .select({
        conversationId: 1,
        createdAt: 1,
        updatedAt: 1,
        'subagentTask.status': 1,
        'subagentTask.controlReceipts': 1,
        _id: 0,
      })
      .lean<Pick<IMessage, 'conversationId' | 'createdAt' | 'updatedAt' | 'subagentTask'> | null>();
    const receipt = input?.subagentTask?.controlReceipts?.find(
      (candidate) => candidate.invocationId === invocationId,
    );
    const status = input?.subagentTask?.status;
    if (
      input == null ||
      receipt == null ||
      status == null ||
      input.createdAt == null ||
      input.updatedAt == null
    ) {
      return null;
    }
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const conversationQuery = Conversation.findOne({
      user: userId,
      conversationId: input.conversationId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
      'subagentThread.parentConversationId': parentConversationId,
      ...activeExpirationFilter<IConversation>(),
    })
      .select({ 'subagentThread.subagentType': 1, _id: 0 })
      .lean<Pick<IConversation, 'subagentThread'> | null>();
    const terminalQuery = Message.findOne({
      user: userId,
      conversationId: input.conversationId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
      messageId: `${taskId}:assistant`,
      'subagentTask.status': { $in: ['completed', 'error', 'cancelled'] },
    })
      .select({ updatedAt: 1, 'subagentTask.status': 1, 'subagentTask.resultClaim': 1, _id: 0 })
      .lean<Pick<IMessage, 'updatedAt' | 'subagentTask'> | null>();
    const [conversation, terminal] = await Promise.all([conversationQuery, terminalQuery]);
    const subagentType = conversation?.subagentThread?.subagentType;
    if (subagentType == null || subagentType === '') return null;
    /** A committed cancel receipt is itself the authoritative cancellation
     * boundary. The terminal row is written asynchronously and may not exist if
     * the owner exits between those two durable commits. */
    const replayStatus =
      terminal?.subagentTask?.status ??
      (receipt.action === 'cancel' && receipt.status === 'applied' ? 'cancelled' : status);
    return {
      receipt,
      task: {
        taskId,
        threadId: input.conversationId,
        subagentType,
        status: replayStatus,
        resultAvailable: terminal != null,
        resultClaimed: terminal?.subagentTask?.resultClaim != null,
        pendingControls:
          input.subagentTask?.controlReceipts?.filter(
            (candidate) => candidate.status === 'accepted',
          ).length ?? 0,
        createdAt: input.createdAt,
        updatedAt:
          terminal?.updatedAt ??
          (receipt.action === 'cancel' && receipt.status === 'applied'
            ? receipt.updatedAt
            : input.updatedAt),
      },
    };
  }

  /** Atomically assigns one durable terminal child result to either its
   * explicit poller or one idempotent automatic wakeup delivery. */
  async function claimSubagentTaskResult({
    userId,
    conversationId,
    taskId,
    kind,
    claimId,
  }: {
    userId: string;
    conversationId: string;
    taskId: string;
    kind: 'manual' | 'wakeup';
    claimId: string;
  }): Promise<SubagentTaskResultClaim> {
    if (
      taskId.length === 0 ||
      taskId.length > 256 ||
      conversationId.length === 0 ||
      conversationId.length > 256 ||
      (kind !== 'manual' && kind !== 'wakeup') ||
      claimId.length === 0 ||
      claimId.length > 128
    ) {
      throw new TypeError('Invalid subagent task result claim');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const messageId = `${taskId}:assistant`;
    const terminal = ['completed', 'error', 'cancelled'];
    const claim = {
      kind,
      claimId,
      claimedAt: new Date(),
    };
    const claimable = {
      $or: [
        { 'subagentTask.resultClaim': { $exists: false } },
        {
          'subagentTask.resultClaim.kind': kind,
          'subagentTask.resultClaim.claimId': claimId,
        },
        ...(kind === 'manual'
          ? [
              {
                'subagentTask.resultClaim.kind': { $exists: false },
                'subagentTask.resultClaim.claimId': claimId,
              },
            ]
          : []),
      ],
    };
    const projection = {
      messageId: 1,
      conversationId: 1,
      parentMessageId: 1,
      sender: 1,
      text: 1,
      error: 1,
      createdAt: 1,
      updatedAt: 1,
      subagentTask: 1,
    };
    const acquired = await Message.findOneAndUpdate(
      {
        user: userId,
        conversationId,
        messageId,
        'subagentTask.status': { $in: terminal },
        ...claimable,
      },
      { $set: { 'subagentTask.resultClaim': claim } },
      { new: true, projection },
    ).lean<IMessage | null>();
    if (acquired != null) {
      return { status: 'acquired', message: acquired };
    }
    const existing = await Message.findOne({
      user: userId,
      conversationId,
      messageId,
      'subagentTask.status': { $in: terminal },
    })
      .select(projection)
      .lean<IMessage | null>();
    return existing == null ? { status: 'not_found' } : { status: 'claimed', message: existing };
  }

  /** Releases only the exact consumer assignment. This is used when a
   * pre-admission automatic continuation is definitively rejected, allowing a
   * later manual poll (or the same delivery retry) to claim the durable result. */
  async function releaseSubagentTaskResultClaim({
    userId,
    conversationId,
    taskId,
    kind,
    claimId,
  }: {
    userId: string;
    conversationId: string;
    taskId: string;
    kind: 'manual' | 'wakeup';
    claimId: string;
  }): Promise<boolean> {
    if (
      taskId.length === 0 ||
      taskId.length > 256 ||
      conversationId.length === 0 ||
      conversationId.length > 256 ||
      (kind !== 'manual' && kind !== 'wakeup') ||
      claimId.length === 0 ||
      claimId.length > 128
    ) {
      throw new TypeError('Invalid subagent task result claim release');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const result = await Message.updateOne(
      {
        user: userId,
        conversationId,
        messageId: `${taskId}:assistant`,
        'subagentTask.resultClaim.kind': kind,
        'subagentTask.resultClaim.claimId': claimId,
      },
      { $unset: { 'subagentTask.resultClaim': 1 } },
    );
    return result.modifiedCount === 1;
  }

  /**
   * Deletes messages in a conversation since a specific message.
   */
  async function deleteMessagesSince(
    userId: string,
    { messageId, conversationId }: { messageId: string; conversationId: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const message = await Message.findOne({ messageId, user: userId }).lean<IMessage>();

      if (message) {
        const query = Message.find({ conversationId, user: userId });
        return await query.deleteMany({
          createdAt: { $gt: message.createdAt },
        });
      }
      return undefined;
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw err;
    }
  }

  /**
   * Retrieves messages from the database.
   */
  async function getMessages(
    filter: FilterQuery<IMessage>,
    select?: string,
    options: MessageQueryOptions = {},
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const query = Message.find(filter);
      if (select) {
        query.select(select);
      }
      if (options.sort !== false) {
        query.sort(options.sort ?? { createdAt: 1 });
      }
      if (options.limit != null && options.limit > 0) {
        query.limit(options.limit);
      }

      return await query.lean<IMessage[]>();
    } catch (err) {
      logger.error('Error getting messages:', err);
      throw err;
    }
  }

  /**
   * Reads the fixed public child-thread projection and truncates text inside
   * MongoDB so oversized persisted messages are never materialized by the API.
   */
  async function getMessagesForSubagentThreadView(input: {
    user: string;
    conversationId: string;
    tenantId?: string;
    selectedTaskId?: string;
    beforeMessageId?: string;
    limit: number;
    textCodePointLimit: number;
  }): Promise<SubagentThreadViewMessageRecord[]> {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const transcriptJsonBytes = {
        $strLenBytes: {
          $convert: {
            input: '$subagentTranscript.messagesJson',
            to: 'string',
            onError: '',
            onNull: '',
          },
        },
      };
      const transcriptIsString = {
        $eq: [{ $type: '$subagentTranscript.messagesJson' }, 'string'],
      };
      const activityProjectionJsonBytes = {
        $strLenBytes: {
          $convert: {
            input: '$subagentActivityProjection.activityJson',
            to: 'string',
            onError: '',
            onNull: '',
          },
        },
      };
      const activityProjectionIsString = {
        $eq: [{ $type: '$subagentActivityProjection.activityJson' }, 'string'],
      };
      const activityProjectionAvailable = {
        $and: [
          { $eq: ['$subagentActivityProjection.version', 1] },
          '$_subagentActivityProjectionSourceIsString',
          {
            $lte: [
              '$_subagentActivityProjectionSourceBytes',
              SUBAGENT_ACTIVITY_PROJECTION_SOURCE_BYTE_LIMIT,
            ],
          },
        ],
      };
      const transcriptAvailable = {
        $and: [
          '$_subagentTranscriptSourceIsString',
          {
            $lte: ['$_subagentTranscriptSourceBytes', SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT],
          },
        ],
      };
      const boundedString = (path: string, codePointLimit: number) => ({
        $substrCP: [
          {
            $cond: [{ $eq: [{ $type: path }, 'string'] }, path, ''],
          },
          0,
          codePointLimit,
        ],
      });
      const stringProjectionTruncated = (path: string, codePointLimit: number) => ({
        $gt: [
          {
            $strLenCP: {
              $cond: [{ $eq: [{ $type: path }, 'string'] }, path, ''],
            },
          },
          codePointLimit,
        ],
      });
      const boundedStringArray = (path: string) => ({
        $map: {
          input: {
            $slice: [
              { $cond: [{ $isArray: path }, path, []] },
              SUBAGENT_MESSAGE_ACTIVITY_LABEL_IDS_LIMIT,
            ],
          },
          as: 'value',
          in: boundedString('$$value', SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT),
        },
      });
      const boundedControlReceipt = {
        invocationId: boundedString(
          '$$receipt.invocationId',
          SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT,
        ),
        controlId: {
          $cond: [
            { $eq: [{ $type: '$$receipt.controlId' }, 'string'] },
            boundedString('$$receipt.controlId', SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT),
            '$$REMOVE',
          ],
        },
        action: '$$receipt.action',
        status: '$$receipt.status',
        createdAt: '$$receipt.createdAt',
        updatedAt: '$$receipt.updatedAt',
        boundary: '$$receipt.boundary',
        reason: {
          $cond: [
            { $eq: [{ $type: '$$receipt.reason' }, 'string'] },
            boundedString('$$receipt.reason', SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT),
            '$$REMOVE',
          ],
        },
        message: {
          $cond: [
            { $eq: [{ $type: '$$receipt.message' }, 'string'] },
            boundedString('$$receipt.message', SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT),
            '$$REMOVE',
          ],
        },
        messageTruncated: {
          $or: [
            { $eq: ['$$receipt.messageTruncated', true] },
            stringProjectionTruncated(
              '$$receipt.message',
              SUBAGENT_VIEW_CONTROL_STRING_CODE_POINT_LIMIT,
            ),
          ],
        },
      };
      const boundedSubagentTask = {
        $cond: [
          { $eq: [{ $type: '$subagentTask' }, 'object'] },
          {
            status: '$subagentTask.status',
            controlReceipts: {
              $let: {
                vars: {
                  visible: {
                    $filter: {
                      input: {
                        $cond: [
                          { $isArray: '$subagentTask.controlReceipts' },
                          '$subagentTask.controlReceipts',
                          [],
                        ],
                      },
                      as: 'receipt',
                      cond: { $ne: ['$$receipt.status', 'reserved'] },
                    },
                  },
                },
                in: {
                  $let: {
                    vars: {
                      accepted: {
                        $slice: [
                          {
                            $filter: {
                              input: '$$visible',
                              as: 'receipt',
                              cond: { $eq: ['$$receipt.status', 'accepted'] },
                            },
                          },
                          SUBAGENT_VIEW_CONTROL_RECEIPT_LIMIT,
                        ],
                      },
                      terminal: {
                        $filter: {
                          input: '$$visible',
                          as: 'receipt',
                          cond: { $ne: ['$$receipt.status', 'accepted'] },
                        },
                      },
                    },
                    in: {
                      $map: {
                        input: {
                          $concatArrays: [
                            '$$accepted',
                            {
                              $let: {
                                vars: {
                                  allowance: {
                                    $subtract: [
                                      SUBAGENT_VIEW_CONTROL_RECEIPT_LIMIT,
                                      { $size: '$$accepted' },
                                    ],
                                  },
                                },
                                in: {
                                  $cond: [
                                    { $gt: ['$$allowance', 0] },
                                    { $slice: ['$$terminal', { $multiply: [-1, '$$allowance'] }] },
                                    [],
                                  ],
                                },
                              },
                            },
                          ],
                        },
                        as: 'receipt',
                        in: boundedControlReceipt,
                      },
                    },
                  },
                },
              },
            },
            controlReceiptsProjectionTruncated: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: {
                        $cond: [
                          { $isArray: '$subagentTask.controlReceipts' },
                          '$subagentTask.controlReceipts',
                          [],
                        ],
                      },
                      as: 'receipt',
                      cond: { $ne: ['$$receipt.status', 'reserved'] },
                    },
                  },
                },
                SUBAGENT_VIEW_CONTROL_RECEIPT_LIMIT,
              ],
            },
          },
          '$$REMOVE',
        ],
      };
      const boundedActivityContent = {
        $filter: {
          input: {
            $map: {
              input: {
                $slice: [
                  { $cond: [{ $isArray: '$content' }, '$content', []] },
                  -SUBAGENT_MESSAGE_ACTIVITY_ITEM_LIMIT,
                ],
              },
              as: 'part',
              in: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$$part.type', 'text'] },
                      then: {
                        type: 'writing',
                        text: boundedString(
                          '$$part.text',
                          SUBAGENT_MESSAGE_ACTIVITY_TEXT_CODE_POINT_LIMIT,
                        ),
                        textTruncated: stringProjectionTruncated(
                          '$$part.text',
                          SUBAGENT_MESSAGE_ACTIVITY_TEXT_CODE_POINT_LIMIT,
                        ),
                      },
                    },
                    {
                      case: { $in: ['$$part.type', ['think', 'reasoning']] },
                      then: { type: 'reasoning' },
                    },
                    {
                      case: { $eq: ['$$part.type', 'activity_label'] },
                      then: {
                        type: 'activity_label',
                        label: boundedString(
                          '$$part.activity_label',
                          SUBAGENT_MESSAGE_ACTIVITY_LABEL_CODE_POINT_LIMIT,
                        ),
                        labelType: '$$part.activity_label_type',
                        toolCallIds: boundedStringArray('$$part.tool_call_ids'),
                        activityStartIndex: '$$part.activity_start_index',
                        activityEndIndex: '$$part.activity_end_index',
                        activityCount: '$$part.activity_count',
                        agentIds: boundedStringArray('$$part.agent_ids'),
                        status: '$$part.status',
                        pending: '$$part.pending',
                        labelTruncated: {
                          $or: [
                            stringProjectionTruncated(
                              '$$part.activity_label',
                              SUBAGENT_MESSAGE_ACTIVITY_LABEL_CODE_POINT_LIMIT,
                            ),
                            {
                              $gt: [
                                {
                                  $size: {
                                    $cond: [
                                      { $isArray: '$$part.tool_call_ids' },
                                      '$$part.tool_call_ids',
                                      [],
                                    ],
                                  },
                                },
                                SUBAGENT_MESSAGE_ACTIVITY_LABEL_IDS_LIMIT,
                              ],
                            },
                            {
                              $gt: [
                                {
                                  $size: {
                                    $cond: [
                                      { $isArray: '$$part.agent_ids' },
                                      '$$part.agent_ids',
                                      [],
                                    ],
                                  },
                                },
                                SUBAGENT_MESSAGE_ACTIVITY_LABEL_IDS_LIMIT,
                              ],
                            },
                          ],
                        },
                      },
                    },
                    {
                      case: { $eq: ['$$part.type', 'tool_call'] },
                      then: {
                        type: 'tool',
                        toolCallId: boundedString(
                          '$$part.tool_call.id',
                          SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT,
                        ),
                        name: boundedString(
                          '$$part.tool_call.name',
                          SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT,
                        ),
                        input: boundedString(
                          '$$part.tool_call.args',
                          SUBAGENT_MESSAGE_ACTIVITY_TOOL_INPUT_CODE_POINT_LIMIT,
                        ),
                        output: boundedString(
                          '$$part.tool_call.output',
                          SUBAGENT_MESSAGE_ACTIVITY_TOOL_OUTPUT_CODE_POINT_LIMIT,
                        ),
                        progress: '$$part.tool_call.progress',
                        runStepStatus: '$$part.tool_call.runStepStatus',
                        inputValidationError: '$$part.tool_call.inputValidationError',
                        inputTruncated: stringProjectionTruncated(
                          '$$part.tool_call.args',
                          SUBAGENT_MESSAGE_ACTIVITY_TOOL_INPUT_CODE_POINT_LIMIT,
                        ),
                        outputTruncated: stringProjectionTruncated(
                          '$$part.tool_call.output',
                          SUBAGENT_MESSAGE_ACTIVITY_TOOL_OUTPUT_CODE_POINT_LIMIT,
                        ),
                      },
                    },
                  ],
                  default: null,
                },
              },
            },
          },
          as: 'activity',
          cond: { $ne: ['$$activity', null] },
        },
      };
      type ActivitySourceProjection = Pick<
        SubagentThreadViewMessageRecord,
        | 'messageId'
        | 'subagentTranscript'
        | 'subagentActivityProjectionJson'
        | 'subagentActivityProjectionTruncated'
      >;
      const boundedMessageProjection = {
        _id: 0,
        messageId: 1,
        parentMessageId: 1,
        isCreatedByUser: 1,
        text: {
          $substrCP: [{ $ifNull: ['$text', ''] }, 0, input.textCodePointLimit],
        },
        textProjectionTruncated: {
          $gt: [{ $strLenCP: { $ifNull: ['$text', ''] } }, input.textCodePointLimit],
        },
        createdAt: 1,
        error: 1,
        unfinished: 1,
        subagentTranscriptProjectionTruncated: {
          $cond: [
            { $ne: [{ $type: '$subagentTranscript.messagesJson' }, 'missing'] },
            true,
            '$$REMOVE',
          ],
        },
        subagentActivity: boundedActivityContent,
        subagentActivityProjectionTruncated: {
          $gt: [
            {
              $size: { $cond: [{ $isArray: '$content' }, '$content', []] },
            },
            SUBAGENT_MESSAGE_ACTIVITY_ITEM_LIMIT,
          ],
        },
        subagentTask: boundedSubagentTask,
        subagentTriggerProjection: {
          $cond: [
            { $eq: ['$subagentTriggerProjection.version', 1] },
            {
              version: 1,
              eventType: boundedString(
                '$subagentTriggerProjection.eventType',
                SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT,
              ),
              sourceType: boundedString(
                '$subagentTriggerProjection.sourceType',
                SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT,
              ),
              occurredAt: '$subagentTriggerProjection.occurredAt',
              expectedActionToolName: {
                $cond: [
                  {
                    $eq: [{ $type: '$subagentTriggerProjection.expectedActionToolName' }, 'string'],
                  },
                  boundedString(
                    '$subagentTriggerProjection.expectedActionToolName',
                    SUBAGENT_MESSAGE_ACTIVITY_ID_CODE_POINT_LIMIT,
                  ),
                  '$$REMOVE',
                ],
              },
            },
            '$$REMOVE',
          ],
        },
      };
      const sourceMetadataProjection = {
        _subagentTranscriptSourceBytes: transcriptJsonBytes,
        _subagentTranscriptSourceIsString: transcriptIsString,
        _subagentActivityProjectionSourceBytes: activityProjectionJsonBytes,
        _subagentActivityProjectionSourceIsString: activityProjectionIsString,
      };
      const activitySourceProjection = {
        _id: 0,
        messageId: 1,
        subagentActivityProjectionJson: {
          $cond: [
            activityProjectionAvailable,
            '$subagentActivityProjection.activityJson',
            '$$REMOVE',
          ],
        },
        subagentActivityProjectionTruncated: {
          $cond: [activityProjectionAvailable, '$subagentActivityProjection.truncated', '$$REMOVE'],
        },
        subagentTranscript: {
          $cond: [
            activityProjectionAvailable,
            '$$REMOVE',
            {
              taskId: '$subagentTranscript.taskId',
              mode: '$subagentTranscript.mode',
              messagesJson: '$subagentTranscript.messagesJson',
            },
          ],
        },
      };
      const baseMatch = {
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null
          ? { tenantId: { $exists: false } }
          : { tenantId: input.tenantId }),
      };
      const anchor =
        input.beforeMessageId == null
          ? null
          : await Message.findOne({ ...baseMatch, messageId: input.beforeMessageId })
              .select('_id createdAt')
              .lean<Pick<IMessage, '_id' | 'createdAt'>>();
      if (input.beforeMessageId != null && anchor == null) return [];
      const pageMatch =
        anchor == null
          ? baseMatch
          : {
              ...baseMatch,
              $or: [
                { createdAt: { $lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, _id: { $lte: anchor._id } },
              ],
            };
      /** Keep rows as independent MongoDB results. A `$facet` would combine the
       * complete page into one BSON document and could exceed MongoDB's 16 MiB
       * document limit before the API applies its smaller public byte budget. */
      const messagesPromise = Message.aggregate<SubagentThreadViewMessageRecord>([
        { $match: pageMatch },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: input.limit },
        { $project: boundedMessageProjection },
      ]);
      const recentSourcesPromise = Message.aggregate<ActivitySourceProjection>([
        { $match: pageMatch },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: SUBAGENT_ACTIVITY_SOURCE_CANDIDATE_LIMIT },
        {
          $match: {
            ...(input.selectedTaskId == null
              ? {}
              : { messageId: { $ne: `${input.selectedTaskId}:assistant` } }),
            $or: [
              { 'subagentActivityProjection.activityJson': { $exists: true } },
              { 'subagentTranscript.messagesJson': { $exists: true } },
            ],
          },
        },
        { $addFields: sourceMetadataProjection },
        {
          $match: {
            $expr: {
              $or: [
                {
                  $and: [
                    activityProjectionAvailable,
                    {
                      $eq: [
                        '$messageId',
                        { $concat: ['$subagentActivityProjection.taskId', ':assistant'] },
                      ],
                    },
                  ],
                },
                {
                  $and: [
                    transcriptAvailable,
                    {
                      $eq: [
                        '$messageId',
                        { $concat: ['$subagentTranscript.taskId', ':assistant'] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $limit: SUBAGENT_TRANSCRIPT_PAGE_LIMIT - (input.selectedTaskId == null ? 0 : 1) },
        { $project: activitySourceProjection },
      ]);
      const selectedProjectionPromise =
        input.selectedTaskId == null
          ? Promise.resolve([
              {
                selectedMessages: [] as SubagentThreadViewMessageRecord[],
                selectedSources: [] as ActivitySourceProjection[],
              },
            ])
          : Message.aggregate<{
              selectedMessages: SubagentThreadViewMessageRecord[];
              selectedSources: ActivitySourceProjection[];
            }>([
              {
                $match: {
                  ...baseMatch,
                  messageId: {
                    $in: [`${input.selectedTaskId}:user`, `${input.selectedTaskId}:assistant`],
                  },
                },
              },
              { $limit: 2 },
              {
                $facet: {
                  selectedMessages: [{ $project: boundedMessageProjection }],
                  selectedSources: [
                    { $match: { messageId: `${input.selectedTaskId}:assistant` } },
                    { $limit: 1 },
                    { $addFields: sourceMetadataProjection },
                    {
                      $match: {
                        $or: [
                          {
                            'subagentActivityProjection.taskId': input.selectedTaskId,
                            'subagentActivityProjection.version': 1,
                            _subagentActivityProjectionSourceIsString: true,
                            _subagentActivityProjectionSourceBytes: {
                              $lte: SUBAGENT_ACTIVITY_PROJECTION_SOURCE_BYTE_LIMIT,
                            },
                          },
                          {
                            'subagentTranscript.taskId': input.selectedTaskId,
                            _subagentTranscriptSourceIsString: true,
                            _subagentTranscriptSourceBytes: {
                              $lte: SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT,
                            },
                          },
                        ],
                      },
                    },
                    { $project: activitySourceProjection },
                  ],
                },
              },
            ]);
      const [messages, recentSources, [selectedProjection]] = await Promise.all([
        messagesPromise,
        recentSourcesPromise,
        selectedProjectionPromise,
      ]);
      if (selectedProjection == null) return [];
      const sourcesByMessageId = new Map(
        [...selectedProjection.selectedSources, ...recentSources].map((record) => [
          record.messageId,
          record,
        ]),
      );
      const retainedMessageIds = new Set(messages.map((message) => message.messageId));
      for (const message of selectedProjection.selectedMessages) {
        if (retainedMessageIds.has(message.messageId)) continue;
        messages.push(message);
        retainedMessageIds.add(message.messageId);
      }
      return messages.map((message) => {
        const source = sourcesByMessageId.get(message.messageId);
        if (source == null) return message;
        const projected = { ...message };
        if (source.subagentActivityProjectionJson != null) {
          delete projected.subagentTranscriptProjectionTruncated;
          return {
            ...projected,
            subagentActivityProjectionJson: source.subagentActivityProjectionJson,
            ...(source.subagentActivityProjectionTruncated === true
              ? { subagentActivityProjectionTruncated: true }
              : {}),
          };
        }
        if (source.subagentTranscript == null) return message;
        delete projected.subagentTranscriptProjectionTruncated;
        return { ...projected, subagentTranscript: source.subagentTranscript };
      });
    } catch (err) {
      logger.error('Error getting bounded subagent thread messages:', err);
      throw err;
    }
  }

  /** Returns newest bounded task outcomes for every selected child in two
   * constant-size batch reads. The first read guarantees one latest task per
   * child; the second caps recent source rows before any grouping accumulator.
   * This avoids both N+1 reads and newer top-N accumulators that DocumentDB 5
   * does not support. */
  async function listSubagentTasksForThreads(input: {
    user: string;
    conversationIds: string[];
    tenantId?: string;
    limitPerThread: number;
  }): Promise<ParentSubagentTaskRecord[]> {
    if (input.conversationIds.length === 0) {
      return [];
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const match = {
      user: input.user,
      conversationId: { $in: input.conversationIds },
      ...(input.tenantId == null ? { tenantId: { $exists: false } } : { tenantId: input.tenantId }),
      messageId: { $regex: /:(user|assistant)$/ },
    };
    const taskProjection = {
      messageId: '$messageId',
      createdAt: '$createdAt',
      occurrenceId: '$_id',
      statusDerived: {
        $eq: [{ $ifNull: ['$subagentTask.status', null] }, null],
      },
      status: {
        $ifNull: [
          '$subagentTask.status',
          {
            $cond: [
              { $regexMatch: { input: '$messageId', regex: /:assistant$/ } },
              {
                $cond: [
                  { $eq: ['$error', true] },
                  'error',
                  { $cond: [{ $eq: ['$unfinished', true] }, 'cancelled', 'completed'] },
                ],
              },
              'running',
            ],
          },
        ],
      },
    };
    const sourceLimit = Math.min(
      4096,
      Math.max(
        input.conversationIds.length,
        input.conversationIds.length * input.limitPerThread * 2,
      ),
    );
    type AggregateRecord = ParentSubagentTaskRecord & { sourceRows?: number };
    const compareOccurrenceIds = (left?: Types.ObjectId, right?: Types.ObjectId): number => {
      const leftValue = left?.toHexString() ?? '';
      const rightValue = right?.toHexString() ?? '';
      if (leftValue === rightValue) return 0;
      return leftValue > rightValue ? 1 : -1;
    };
    const taskTimestamp = (value: Date | undefined): number =>
      value == null ? Number.NEGATIVE_INFINITY : value.getTime();
    const [latestRecords, recentRecords] = await Promise.all([
      Message.aggregate<ParentSubagentTaskRecord>([
        { $match: match },
        { $sort: { conversationId: 1, createdAt: -1, _id: -1 } },
        { $group: { _id: '$conversationId', task: { $first: taskProjection } } },
        { $project: { _id: 0, conversationId: '$_id', tasks: ['$task'] } },
        { $sort: { conversationId: 1 } },
      ]),
      Message.aggregate<AggregateRecord>([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: sourceLimit + 1 },
        {
          $addFields: {
            _subagentIsAssistant: { $regexMatch: { input: '$messageId', regex: /:assistant$/ } },
            _subagentTaskId: {
              $substrBytes: [
                '$messageId',
                0,
                {
                  $subtract: [
                    { $strLenBytes: '$messageId' },
                    {
                      $cond: [
                        { $regexMatch: { input: '$messageId', regex: /:assistant$/ } },
                        10,
                        5,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $sort: {
            conversationId: 1,
            _subagentTaskId: 1,
            _subagentIsAssistant: -1,
            createdAt: -1,
            _id: -1,
          },
        },
        {
          $group: {
            _id: { conversationId: '$conversationId', taskId: '$_subagentTaskId' },
            task: { $first: taskProjection },
            sourceRows: { $sum: 1 },
          },
        },
        {
          $sort: {
            '_id.conversationId': 1,
            'task.createdAt': -1,
            'task.occurrenceId': -1,
            '_id.taskId': 1,
          },
        },
        {
          $group: {
            _id: '$_id.conversationId',
            tasks: { $push: '$task' },
            sourceRows: { $sum: '$sourceRows' },
          },
        },
        {
          $project: {
            _id: 0,
            conversationId: '$_id',
            tasks: { $slice: ['$tasks', input.limitPerThread] },
            sourceRows: 1,
          },
        },
        { $sort: { conversationId: 1 } },
      ]),
    ]);
    const sourceTruncated =
      recentRecords.reduce((total, record) => total + (record.sourceRows ?? 0), 0) > sourceLimit;
    const records = new Map<string, ParentSubagentTaskRecord>(
      recentRecords.map((record) => [
        record.conversationId,
        {
          conversationId: record.conversationId,
          tasks: record.tasks,
          ...(sourceTruncated ? { sourceTruncated: true } : {}),
        },
      ]),
    );
    for (const latest of latestRecords) {
      const current = records.get(latest.conversationId);
      if (current == null) {
        records.set(latest.conversationId, {
          ...latest,
          ...(sourceTruncated ? { sourceTruncated: true } : {}),
        });
        continue;
      }
      const candidates = [...current.tasks, ...latest.tasks];
      const tasksById = new Map<string, (typeof candidates)[number]>();
      for (const candidate of candidates) {
        const taskId = candidate.messageId.replace(/:(user|assistant)$/, '');
        const existing = tasksById.get(taskId);
        const candidateTime = taskTimestamp(candidate.createdAt);
        const existingTime = taskTimestamp(existing?.createdAt);
        const candidateIsAssistant = candidate.messageId.endsWith(':assistant');
        const existingIsAssistant = existing?.messageId.endsWith(':assistant') === true;
        const occurrenceDifference = compareOccurrenceIds(
          candidate.occurrenceId,
          existing?.occurrenceId,
        );
        if (
          existing == null ||
          candidateTime > existingTime ||
          (candidateTime === existingTime && occurrenceDifference > 0) ||
          (candidateTime === existingTime &&
            occurrenceDifference === 0 &&
            candidateIsAssistant &&
            !existingIsAssistant)
        ) {
          tasksById.set(taskId, candidate);
        }
      }
      current.tasks = [...tasksById.values()]
        .sort((left, right) => {
          const timeDifference = taskTimestamp(right.createdAt) - taskTimestamp(left.createdAt);
          if (timeDifference !== 0) return timeDifference;
          const occurrenceDifference = compareOccurrenceIds(right.occurrenceId, left.occurrenceId);
          if (occurrenceDifference !== 0) return occurrenceDifference;
          const assistantDifference =
            Number(right.messageId.endsWith(':assistant')) -
            Number(left.messageId.endsWith(':assistant'));
          if (assistantDifference !== 0) return assistantDifference;
          return left.messageId.localeCompare(right.messageId);
        })
        .slice(0, input.limitPerThread);
    }
    return [...records.values()].sort((left, right) =>
      left.conversationId.localeCompare(right.conversationId),
    );
  }

  /**
   * Retrieves a single message from the database.
   */
  async function getMessage({ user, messageId }: { user: string; messageId: string }) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      return await Message.findOne({ user, messageId }).lean<IMessage>();
    } catch (err) {
      logger.error('Error getting message:', err);
      throw err;
    }
  }

  /**
   * Deletes messages from the database.
   */
  async function deleteMessages(filter: FilterQuery<IMessage>) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      return await Message.deleteMany(filter);
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw err;
    }
  }

  /**
   * Retrieves paginated messages with custom sorting and cursor support.
   */
  async function getMessagesByCursor(
    filter: FilterQuery<IMessage>,
    options: {
      sortField?: string;
      sortOrder?: 1 | -1;
      limit?: number;
      cursor?: string | null;
    } = {},
  ) {
    const Message = mongoose.models.Message as Model<IMessage>;
    const { sortField = 'createdAt', sortOrder = -1, limit = 25, cursor } = options;
    const queryFilter = { ...filter };
    if (cursor) {
      queryFilter[sortField] = sortOrder === 1 ? { $gt: cursor } : { $lt: cursor };
    }
    const messages = await Message.find(queryFilter)
      .sort({ [sortField]: sortOrder })
      .limit(limit + 1)
      .lean<IMessage[]>();

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      messages.pop();
      const last = messages[messages.length - 1];
      const cursorValue =
        sortField === 'createdAt' ? last.createdAt : last[sortField as keyof IMessage];
      nextCursor = String(cursorValue ?? '');
    }
    return { messages, nextCursor };
  }

  /**
   * Performs a MeiliSearch query on the Message collection.
   * Requires the meilisearch plugin to be registered on the Message model.
   */
  async function searchMessages(
    query: string,
    searchOptions: Record<string, unknown>,
    hydrate?: boolean,
  ) {
    const Message = mongoose.models.Message as Model<IMessage> & {
      meiliSearch?: (q: string, opts: Record<string, unknown>, h?: boolean) => Promise<unknown>;
    };
    if (typeof Message.meiliSearch !== 'function') {
      throw new Error('MeiliSearch plugin not registered on Message model');
    }
    return Message.meiliSearch(query, searchOptions, hydrate);
  }

  return {
    saveMessage,
    bulkSaveMessages,
    recordMessage,
    updateMessageText,
    updateToolCallResult,
    updateMessage,
    recordSubagentTaskControlReceipt,
    getSubagentTaskControlReceipt,
    getSubagentTaskControlReplay,
    claimSubagentTaskResult,
    releaseSubagentTaskResultClaim,
    deleteMessagesSince,
    getMessages,
    getMessagesForSubagentThreadView,
    listSubagentTasksForThreads,
    getMessage,
    getMessagesByCursor,
    searchMessages,
    deleteMessages,
  };
}
