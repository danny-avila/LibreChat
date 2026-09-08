import {
  MAX_CHAT_PROJECT_NAME_LENGTH,
  MAX_CHAT_PROJECT_DESCRIPTION_LENGTH,
} from 'librechat-data-provider';
import type { FilterQuery, Model, PipelineStage, SortOrder, Types } from 'mongoose';
import type { IChatProject, IChatProjectDocument, IConversation } from '~/types';
import { buildRetentionVisibilityFilter } from '~/utils/retention';
import { isValidObjectIdString } from '~/utils/objectId';
import { getTenantId } from '~/config/tenantContext';
import { buildIndexWithRetry } from '~/utils/retry';
import { escapeRegExp } from '~/utils/string';
import logger from '~/config/winston';

export type ChatProjectSortBy = 'name' | 'createdAt' | 'lastConversationAt';
export type ChatProjectSortDirection = 'asc' | 'desc';

export type CreateChatProjectInput = {
  name: string;
  description?: string | null;
};

export type UpdateChatProjectInput = Partial<CreateChatProjectInput>;

export type ListChatProjectsOptions = {
  cursor?: string | null;
  limit?: number;
  sortBy?: ChatProjectSortBy;
  sortDirection?: ChatProjectSortDirection;
  search?: string;
};

export type ListChatProjectsResult = {
  projects: IChatProject[];
  nextCursor: string | null;
};

export type DeleteChatProjectResult = {
  deletedCount: number;
  modifiedCount: number;
};

export type AssignConversationToProjectResult = {
  conversation: IConversation;
  previousProjectId: string | null;
  projectId: string | null;
};

function optionalTenantFilter<T>(tenantId?: string | null): FilterQuery<T> {
  if (tenantId === null) {
    return { tenantId: { $exists: false } } as FilterQuery<T>;
  }
  return (tenantId === undefined ? {} : { tenantId }) as FilterQuery<T>;
}

export interface ChatProjectMethods {
  createChatProject(user: string, input: CreateChatProjectInput): Promise<IChatProject>;
  getChatProject(user: string, projectId: string): Promise<IChatProject | null>;
  listChatProjects(
    user: string,
    options?: ListChatProjectsOptions,
  ): Promise<ListChatProjectsResult>;
  updateChatProject(
    user: string,
    projectId: string,
    input: UpdateChatProjectInput,
  ): Promise<IChatProject | null>;
  deleteChatProject(user: string, projectId: string): Promise<DeleteChatProjectResult>;
  assignConversationToProject(
    user: string,
    conversationId: string,
    projectId: string | null,
  ): Promise<AssignConversationToProjectResult | null>;
  refreshChatProjectStats(user: string, projectId: string): Promise<IChatProject | null>;
}

type ProjectCursor = {
  primary: string | null;
  id: string;
};

type ProjectLean = IChatProject & { _id: Types.ObjectId };
type ProjectStatsSnapshot = Pick<
  IChatProject,
  'conversationCount' | 'lastConversationAt' | 'lastConversationId'
>;

const VALID_SORT_FIELDS = new Set<ChatProjectSortBy>(['name', 'createdAt', 'lastConversationAt']);
const PROJECT_STATS_REFRESH_MAX_ATTEMPTS = 8;

function normalizeSortBy(sortBy?: string): ChatProjectSortBy {
  return VALID_SORT_FIELDS.has(sortBy as ChatProjectSortBy)
    ? (sortBy as ChatProjectSortBy)
    : 'lastConversationAt';
}

function normalizeSortDirection(sortDirection?: string): ChatProjectSortDirection {
  return sortDirection === 'asc' ? 'asc' : 'desc';
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) {
    return 25;
  }
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function sanitizeProjectInput(input: CreateChatProjectInput): CreateChatProjectInput {
  return {
    name: input.name.trim().slice(0, MAX_CHAT_PROJECT_NAME_LENGTH),
    description: input.description?.trim().slice(0, MAX_CHAT_PROJECT_DESCRIPTION_LENGTH) ?? '',
  };
}

function parseCursor(cursor?: string | null): ProjectCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as ProjectCursor;
    if (!decoded.id || !isValidObjectIdString(decoded.id)) {
      return null;
    }
    return {
      primary: decoded.primary ?? null,
      id: decoded.id,
    };
  } catch {
    logger.warn('[listChatProjects] Invalid cursor format, starting from beginning');
    return null;
  }
}

function encodeCursor(project: ProjectLean, sortBy: ChatProjectSortBy): string {
  let primary: string | null = null;
  if (sortBy === 'name') {
    primary = project.name;
  } else {
    const date = project[sortBy];
    primary = date instanceof Date ? date.toISOString() : null;
  }
  return Buffer.from(JSON.stringify({ primary, id: project._id.toString() })).toString('base64');
}

function cursorPrimaryValue(
  primary: string | null,
  sortBy: ChatProjectSortBy,
): string | Date | null | undefined {
  if (primary == null) {
    return sortBy === 'lastConversationAt' ? null : undefined;
  }

  if (sortBy === 'name') {
    return primary;
  }

  const date = new Date(primary);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function createCursorFilter(
  mongoose: typeof import('mongoose'),
  cursor: ProjectCursor | null,
  sortBy: ChatProjectSortBy,
  sortDirection: ChatProjectSortDirection,
): FilterQuery<IChatProjectDocument> | null {
  if (!cursor) {
    return null;
  }

  const op = sortDirection === 'asc' ? '$gt' : '$lt';
  const id = new mongoose.Types.ObjectId(cursor.id);
  const primary = cursorPrimaryValue(cursor.primary, sortBy);

  if (primary === undefined) {
    logger.warn('[listChatProjects] Invalid cursor primary value, starting from beginning');
    return null;
  }

  const branches: FilterQuery<IChatProjectDocument>[] = [
    { [sortBy]: { [op]: primary } },
    { [sortBy]: primary, _id: { [op]: id } },
  ];

  /**
   * Projects with no conversations have `lastConversationAt: null`, which sorts
   * after all dated projects in descending order. A `$lt: <date>` predicate does
   * not match null, so once the cursor moves past the dated projects we must
   * include the null bucket explicitly, otherwise empty projects never paginate.
   */
  if (sortBy === 'lastConversationAt' && sortDirection === 'desc' && primary instanceof Date) {
    branches.push({ lastConversationAt: null } as FilterQuery<IChatProjectDocument>);
  }

  return { $or: branches } as FilterQuery<IChatProjectDocument>;
}

function visibleProjectConversationFilter(
  user: string,
  projectId: string,
  tenantId?: string | null,
): FilterQuery<IConversation> {
  const tenantFilter = optionalTenantFilter<IConversation>(tenantId);
  return {
    $and: [
      { user, chatProjectId: projectId, ...tenantFilter },
      { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] },
      buildRetentionVisibilityFilter<IConversation>(),
    ],
  } as FilterQuery<IConversation>;
}

function projectStatsSnapshotFilter(
  snapshot: ProjectStatsSnapshot,
): FilterQuery<IChatProjectDocument> {
  return {
    conversationCount:
      snapshot.conversationCount === undefined ? { $exists: false } : snapshot.conversationCount,
    lastConversationAt:
      snapshot.lastConversationAt === undefined ? { $exists: false } : snapshot.lastConversationAt,
    lastConversationId:
      snapshot.lastConversationId === undefined ? { $exists: false } : snapshot.lastConversationId,
  };
}

/** Public statistics come from committed membership even when cache reconciliation fails. */
function committedProjectStats(): PipelineStage[] {
  const expiration = { $ifNull: ['$committedConversation.expiredAt', null] };
  const temporary = { $ifNull: ['$committedConversation.isTemporary', null] };
  return [
    { $addFields: { statsProjectId: { $toString: '$_id' } } },
    {
      $lookup: {
        from: 'conversations',
        localField: 'statsProjectId',
        foreignField: 'chatProjectId',
        as: 'committedConversation',
      },
    },
    { $unwind: { path: '$committedConversation', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        statsEligible: {
          $and: [
            { $eq: ['$committedConversation.user', '$user'] },
            {
              $eq: [
                { $ifNull: ['$committedConversation.tenantId', null] },
                { $ifNull: ['$tenantId', null] },
              ],
            },
            { $ne: [{ $ifNull: ['$committedConversation.isArchived', false] }, true] },
            {
              $or: [
                {
                  $and: [
                    { $eq: [temporary, false] },
                    { $or: [{ $eq: [expiration, null] }, { $gt: [expiration, new Date()] }] },
                  ],
                },
                { $and: [{ $eq: [temporary, null] }, { $eq: [expiration, null] }] },
              ],
            },
          ],
        },
      },
    },
    {
      $sort: {
        statsEligible: -1,
        'committedConversation.updatedAt': -1,
        'committedConversation._id': -1,
      },
    },
    {
      $group: {
        _id: '$_id',
        project: { $first: '$$ROOT' },
        conversationCount: { $sum: { $cond: ['$statsEligible', 1, 0] } },
        lastConversationAt: {
          $first: {
            $cond: [
              '$statsEligible',
              { $ifNull: ['$committedConversation.updatedAt', '$committedConversation.createdAt'] },
              null,
            ],
          },
        },
        lastConversationId: {
          $first: { $cond: ['$statsEligible', '$committedConversation.conversationId', null] },
        },
      },
    },
    {
      $addFields: {
        'project.conversationCount': '$conversationCount',
        'project.lastConversationAt': { $ifNull: ['$lastConversationAt', null] },
        'project.lastConversationId': { $ifNull: ['$lastConversationId', null] },
      },
    },
    { $replaceRoot: { newRoot: '$project' } },
    { $project: { statsProjectId: 0, statsEligible: 0, committedConversation: 0 } },
  ];
}

export async function refreshChatProjectStatsForUser(
  mongoose: typeof import('mongoose'),
  user: string,
  projectId: string,
  tenantId?: string | null,
): Promise<IChatProject | null> {
  if (!isValidObjectIdString(projectId)) {
    return null;
  }

  const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
  const Conversation = mongoose.models.Conversation as Model<IConversation>;
  const tenantFilter = optionalTenantFilter<IChatProjectDocument>(tenantId);
  const projectFilter = { _id: new mongoose.Types.ObjectId(projectId), user, ...tenantFilter };
  const conversationFilter = visibleProjectConversationFilter(user, projectId, tenantId);

  for (let attempt = 0; attempt < PROJECT_STATS_REFRESH_MAX_ATTEMPTS; attempt++) {
    const snapshot = await ChatProject.findOne(projectFilter)
      .select('conversationCount lastConversationAt lastConversationId')
      .lean<ProjectStatsSnapshot>();
    if (!snapshot) {
      return null;
    }

    const [conversationCount, latestConversation] = await Promise.all([
      Conversation.countDocuments(conversationFilter),
      Conversation.findOne(conversationFilter)
        .select('conversationId updatedAt createdAt')
        .sort({ updatedAt: -1, _id: -1 })
        .lean<IConversation>(),
    ]);

    const updatedProject = await ChatProject.findOneAndUpdate(
      { ...projectFilter, ...projectStatsSnapshotFilter(snapshot) },
      {
        $set: {
          conversationCount,
          lastConversationAt:
            latestConversation?.updatedAt ?? latestConversation?.createdAt ?? null,
          lastConversationId: latestConversation?.conversationId ?? null,
        },
      },
      { new: true },
    ).lean<IChatProject>();
    if (updatedProject) {
      return updatedProject;
    }
  }

  logger.warn('[refreshChatProjectStatsForUser] Stats changed during every refresh attempt', {
    user,
    projectId,
  });
  throw new Error('Failed to refresh chat project stats after concurrent updates');
}

export async function updateChatProjectLastConversationForUser(
  mongoose: typeof import('mongoose'),
  user: string,
  projectId: string,
  conversation: Pick<IConversation, 'conversationId' | 'createdAt' | 'updatedAt'>,
  incrementCount = false,
  tenantId?: string | null,
): Promise<void> {
  if (!isValidObjectIdString(projectId) || !conversation.conversationId) {
    return;
  }

  const lastConversationAt = conversation.updatedAt ?? conversation.createdAt ?? new Date();
  const lastConversationFields = {
    lastConversationAt,
    lastConversationId: conversation.conversationId,
  };
  const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
  const tenantFilter = optionalTenantFilter<IChatProjectDocument>(tenantId);
  const projectFilter = { _id: new mongoose.Types.ObjectId(projectId), user, ...tenantFilter };

  if (!incrementCount) {
    await ChatProject.updateOne(projectFilter, { $set: lastConversationFields });
  } else {
    /**
     * Skip `$inc` when a concurrent refresh already recorded this conversation as
     * `lastConversationId`. The conversation is visible to countDocuments as soon
     * as it is persisted, so a later increment would double-count it.
     */
    const incremented = await ChatProject.updateOne(
      { ...projectFilter, lastConversationId: { $ne: conversation.conversationId } },
      { $set: lastConversationFields, $inc: { conversationCount: 1 } },
    );
    if ((incremented.matchedCount ?? 0) === 0) {
      await ChatProject.updateOne(projectFilter, { $set: lastConversationFields });
    }
  }

  /**
   * The chat can stop being visible while this pointer write is in flight: an archive-all
   * sweep, a single archive from another tab, or a retention flip, each of which has
   * already run its own stats refresh by the time this lands, leaving the project
   * advertising activity on a chat its workspace hides. Checking first would only move
   * that race earlier, so the pointer is verified after it is written and the project
   * recomputed when the chat it names turns out to be hidden. A sweep that lands later
   * still refreshes the project itself, and `refreshChatProjectStatsForUser` compare-and-
   * sets, so it cannot commit a count it read before this write. The read is a point
   * lookup on the unique `conversationId, user` index.
   */
  const Conversation = mongoose.models.Conversation as Model<IConversation>;
  const stillVisible = await Conversation.exists({
    ...visibleProjectConversationFilter(user, projectId, tenantId),
    conversationId: conversation.conversationId,
  });
  if (!stillVisible) {
    await refreshChatProjectStatsForUser(mongoose, user, projectId, tenantId);
  }
}

export function createChatProjectMethods(mongoose: typeof import('mongoose')): ChatProjectMethods {
  let lookupIndexPromise: Promise<string> | undefined;
  function ensureProjectLookupIndex(): Promise<string> {
    lookupIndexPromise ??= buildIndexWithRetry(
      // eslint-disable-next-line no-restricted-syntax -- Index DDL is collection-wide; it does not read or mutate tenant records.
      () => mongoose.models.Conversation.collection.createIndex({ chatProjectId: 1 }),
      'createIndex(Conversation.chatProjectId)',
    ).catch((error) => {
      lookupIndexPromise = undefined;
      throw error;
    });
    return lookupIndexPromise;
  }

  async function createChatProject(
    user: string,
    input: CreateChatProjectInput,
  ): Promise<IChatProject> {
    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    const sanitized = sanitizeProjectInput(input);
    if (!sanitized.name) {
      throw new Error('Project name is required');
    }

    const project = await ChatProject.create({
      ...sanitized,
      user,
      conversationCount: 0,
      lastConversationAt: null,
      lastConversationId: null,
    });
    return project.toObject() as IChatProject;
  }

  async function getChatProject(user: string, projectId: string): Promise<IChatProject | null> {
    if (!isValidObjectIdString(projectId)) {
      return null;
    }

    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    await ensureProjectLookupIndex();
    const projects = await ChatProject.aggregate<IChatProject>([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(projectId),
          user,
          ...optionalTenantFilter<IChatProjectDocument>(getTenantId() ?? null),
        },
      },
      ...committedProjectStats(),
    ]);
    return projects[0] ?? null;
  }

  async function listChatProjects(
    user: string,
    options: ListChatProjectsOptions = {},
  ): Promise<ListChatProjectsResult> {
    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    const limit = normalizeLimit(options.limit);
    const sortBy = normalizeSortBy(options.sortBy);
    const sortDirection = normalizeSortDirection(options.sortDirection);
    const sortOrder: SortOrder = sortDirection === 'asc' ? 1 : -1;
    const filters: FilterQuery<IChatProjectDocument>[] = [
      { user, ...optionalTenantFilter<IChatProjectDocument>(getTenantId() ?? null) },
    ];

    if (options.search?.trim()) {
      const searchRegex = { $regex: escapeRegExp(options.search.trim()), $options: 'i' };
      filters.push({ $or: [{ name: searchRegex }, { description: searchRegex }] });
    }

    const cursorFilter = createCursorFilter(
      mongoose,
      parseCursor(options.cursor),
      sortBy,
      sortDirection,
    );
    const query =
      filters.length === 1 ? filters[0] : ({ $and: filters } as FilterQuery<IChatProjectDocument>);
    await ensureProjectLookupIndex();
    const sort: PipelineStage.Sort = { $sort: { [sortBy]: sortOrder, _id: sortOrder } };
    const page: PipelineStage[] = [
      ...(cursorFilter ? [{ $match: cursorFilter }] : []),
      sort,
      { $limit: limit + 1 },
    ];
    const projects = await ChatProject.aggregate<ProjectLean>([
      { $match: query },
      ...(sortBy === 'lastConversationAt'
        ? [...committedProjectStats(), ...page]
        : [...page, ...committedProjectStats(), sort]),
    ]);

    let nextCursor: string | null = null;
    if (projects.length > limit) {
      projects.pop();
      const lastProject = projects[projects.length - 1];
      if (lastProject) {
        nextCursor = encodeCursor(lastProject, sortBy);
      }
    }

    return { projects, nextCursor };
  }

  async function updateChatProject(
    user: string,
    projectId: string,
    input: UpdateChatProjectInput,
  ): Promise<IChatProject | null> {
    if (!isValidObjectIdString(projectId)) {
      return null;
    }

    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    const update: Partial<Pick<IChatProject, 'name' | 'description'>> = {};
    if (typeof input.name === 'string') {
      const name = input.name.trim().slice(0, MAX_CHAT_PROJECT_NAME_LENGTH);
      if (!name) {
        throw new Error('Project name is required');
      }
      update.name = name;
    }
    if (input.description !== undefined) {
      update.description =
        input.description?.trim().slice(0, MAX_CHAT_PROJECT_DESCRIPTION_LENGTH) ?? '';
    }

    return await ChatProject.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(projectId), user },
      { $set: update },
      { new: true, runValidators: true },
    ).lean<IChatProject>();
  }

  async function deleteChatProject(
    user: string,
    projectId: string,
  ): Promise<DeleteChatProjectResult> {
    if (!isValidObjectIdString(projectId)) {
      return { deletedCount: 0, modifiedCount: 0 };
    }

    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const projectFilter = { _id: new mongoose.Types.ObjectId(projectId), user };
    const project = await ChatProject.findOne(projectFilter).select('_id').lean<IChatProject>();
    if (!project) {
      return { deletedCount: 0, modifiedCount: 0 };
    }

    const [conversationResult, deleteResult] = await Promise.all([
      Conversation.updateMany(
        { user, chatProjectId: projectId },
        { $unset: { chatProjectId: '' } },
      ),
      ChatProject.deleteOne(projectFilter),
    ]);

    return {
      deletedCount: deleteResult.deletedCount ?? 0,
      modifiedCount: conversationResult.modifiedCount ?? 0,
    };
  }

  async function assignConversationToProject(
    user: string,
    conversationId: string,
    projectId: string | null,
  ): Promise<AssignConversationToProjectResult | null> {
    const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const conversation = await Conversation.findOne({ user, conversationId }).lean<IConversation>();
    if (!conversation) {
      return null;
    }

    const normalizedProjectId = projectId || null;
    if (normalizedProjectId) {
      if (!isValidObjectIdString(normalizedProjectId)) {
        throw new Error('Project not found');
      }
      const project = await ChatProject.findOne({
        _id: new mongoose.Types.ObjectId(normalizedProjectId),
        user,
      })
        .select('_id')
        .lean<IChatProject>();
      if (!project) {
        throw new Error('Project not found');
      }
    }

    const previousProjectId = conversation.chatProjectId ?? null;
    const update =
      normalizedProjectId == null
        ? { $unset: { chatProjectId: '' } }
        : { $set: { chatProjectId: normalizedProjectId } };
    const updatedConversation = await Conversation.findOneAndUpdate(
      { user, conversationId },
      update,
      { new: true },
    ).lean<IConversation>();

    if (!updatedConversation) {
      return null;
    }

    const projectIds = new Set(
      [previousProjectId, normalizedProjectId].filter((id): id is string => Boolean(id)),
    );
    await Promise.all(
      [...projectIds].map((id) => refreshChatProjectStatsForUser(mongoose, user, id)),
    );

    return {
      conversation: updatedConversation,
      previousProjectId,
      projectId: normalizedProjectId,
    };
  }

  async function refreshChatProjectStats(
    user: string,
    projectId: string,
  ): Promise<IChatProject | null> {
    return await refreshChatProjectStatsForUser(mongoose, user, projectId);
  }

  return {
    createChatProject,
    getChatProject,
    listChatProjects,
    updateChatProject,
    deleteChatProject,
    assignConversationToProject,
    refreshChatProjectStats,
  };
}
