import type { Model, Types } from 'mongoose';
import { SystemRoles, ResourceType, SystemCategories } from 'librechat-data-provider';
import type { IPrompt, IPromptGroup, IPromptGroupDocument } from '~/types';
import { escapeRegExp } from '~/utils/string';
import logger from '~/config/winston';

export interface PromptDeps {
  /** Removes all ACL permissions for a resource. Injected from PermissionService. */
  removeAllPermissions: (params: { resourceType: string; resourceId: unknown }) => Promise<void>;
}

export function createPromptMethods(mongoose: typeof import('mongoose'), deps: PromptDeps) {
  const { ObjectId } = mongoose.Types;

  /**
   * Batch-fetches production prompts for an array of prompt groups
   * and attaches them as `productionPrompt` field.
   */
  async function attachProductionPrompts(
    groups: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    const Prompt = mongoose.models.Prompt as Model<IPrompt>;
    const uniqueIds = [
      ...new Set(groups.map((g) => (g.productionId as Types.ObjectId)?.toString()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) {
      return groups.map((g) => ({ ...g, productionPrompt: null }));
    }

    const prompts = await Prompt.find({ _id: { $in: uniqueIds } })
      .select('prompt')
      .lean();
    const promptMap = new Map(prompts.map((p) => [p._id.toString(), p]));

    return groups.map((g) => ({
      ...g,
      productionPrompt: g.productionId
        ? (promptMap.get((g.productionId as Types.ObjectId).toString()) ?? null)
        : null,
    }));
  }

  /**
   * Get all prompt groups with filters (no pagination).
   */
  async function getAllPromptGroups(filter: Record<string, unknown>) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const { name, ...query } = filter as {
        name?: string;
        category?: string;
        [key: string]: unknown;
      };

      if (name) {
        (query as Record<string, unknown>).name = new RegExp(escapeRegExp(name), 'i');
      }
      if (!query.category) {
        delete query.category;
      } else if (query.category === SystemCategories.MY_PROMPTS) {
        delete query.category;
      } else if (query.category === SystemCategories.NO_CATEGORY) {
        query.category = '';
      } else if (query.category === SystemCategories.SHARED_PROMPTS) {
        delete query.category;
      }

      const groups = await PromptGroup.find(query)
        .sort({ createdAt: -1 })
        .select('name oneliner category author authorName createdAt updatedAt command productionId')
        .lean();
      return await attachProductionPrompts(groups as unknown as Array<Record<string, unknown>>);
    } catch (error) {
      console.error('Error getting all prompt groups', error);
      return { message: 'Error getting all prompt groups' };
    }
  }

  /**
   * Get prompt groups with pagination and filters.
   */
  async function getPromptGroups(filter: Record<string, unknown>) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const {
        pageNumber = 1,
        pageSize = 10,
        name,
        ...query
      } = filter as {
        pageNumber?: number | string;
        pageSize?: number | string;
        name?: string;
        category?: string;
        [key: string]: unknown;
      };

      const validatedPageNumber = Math.max(parseInt(String(pageNumber), 10), 1);
      const validatedPageSize = Math.max(parseInt(String(pageSize), 10), 1);

      if (name) {
        (query as Record<string, unknown>).name = new RegExp(escapeRegExp(name), 'i');
      }
      if (!query.category) {
        delete query.category;
      } else if (query.category === SystemCategories.MY_PROMPTS) {
        delete query.category;
      } else if (query.category === SystemCategories.NO_CATEGORY) {
        query.category = '';
      } else if (query.category === SystemCategories.SHARED_PROMPTS) {
        delete query.category;
      }

      const skip = (validatedPageNumber - 1) * validatedPageSize;
      const limit = validatedPageSize;

      const [groups, totalPromptGroups] = await Promise.all([
        PromptGroup.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(
            'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
          )
          .lean(),
        PromptGroup.countDocuments(query),
      ]);

      const promptGroups = await attachProductionPrompts(
        groups as unknown as Array<Record<string, unknown>>,
      );

      return {
        promptGroups,
        pageNumber: validatedPageNumber.toString(),
        pageSize: validatedPageSize.toString(),
        pages: Math.ceil(totalPromptGroups / validatedPageSize).toString(),
      };
    } catch (error) {
      console.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  }

  /**
   * Delete a prompt group and its prompts, cleaning up ACL permissions.
   */
  async function deletePromptGroup({
    _id,
    author,
    role,
  }: {
    _id: string;
    author?: string;
    role?: string;
  }) {
    const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
    const Prompt = mongoose.models.Prompt as Model<IPrompt>;

    const query: Record<string, unknown> = { _id };
    const groupQuery: Record<string, unknown> = { groupId: new ObjectId(_id) };

    if (author && role !== SystemRoles.ADMIN) {
      query.author = author;
      groupQuery.author = author;
    }

    const response = await PromptGroup.deleteOne(query);

    if (!response || response.deletedCount === 0) {
      throw new Error('Prompt group not found');
    }

    await Prompt.deleteMany(groupQuery);

    try {
      await deps.removeAllPermissions({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: _id,
      });
    } catch (error) {
      logger.error('Error removing promptGroup permissions:', error);
    }

    return { message: 'Prompt group deleted successfully' };
  }

  /**
   * Get prompt groups by accessible IDs with optional cursor-based pagination.
   */
  async function getListPromptGroupsByAccess({
    accessibleIds = [],
    otherParams = {},
    limit = null,
    after = null,
  }: {
    accessibleIds?: Types.ObjectId[];
    otherParams?: Record<string, unknown>;
    limit?: number | null;
    after?: string | null;
  }) {
    const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
    const isPaginated = limit !== null && limit !== undefined;
    const normalizedLimit = isPaginated
      ? Math.min(Math.max(1, parseInt(String(limit)) || 20), 100)
      : null;

    const baseQuery: Record<string, unknown> = {
      ...otherParams,
      _id: { $in: accessibleIds },
    };

    if (after && typeof after === 'string' && after !== 'undefined' && after !== 'null') {
      try {
        const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
        const { updatedAt, _id } = cursor;

        const cursorCondition = {
          $or: [
            { updatedAt: { $lt: new Date(updatedAt) } },
            { updatedAt: new Date(updatedAt), _id: { $gt: new ObjectId(_id) } },
          ],
        };

        if (Object.keys(baseQuery).length > 0) {
          baseQuery.$and = [{ ...baseQuery }, cursorCondition];
          Object.keys(baseQuery).forEach((key) => {
            if (key !== '$and') {
              delete baseQuery[key];
            }
          });
        } else {
          Object.assign(baseQuery, cursorCondition);
        }
      } catch (error) {
        logger.warn('Invalid cursor:', (error as Error).message);
      }
    }

    const findQuery = PromptGroup.find(baseQuery)
      .sort({ updatedAt: -1, _id: 1 })
      .select(
        'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
      );

    if (isPaginated && normalizedLimit) {
      findQuery.limit(normalizedLimit + 1);
    }

    const groups = await findQuery.lean();
    const promptGroups = await attachProductionPrompts(
      groups as unknown as Array<Record<string, unknown>>,
    );

    const hasMore = isPaginated && normalizedLimit ? promptGroups.length > normalizedLimit : false;
    const data = (
      isPaginated && normalizedLimit ? promptGroups.slice(0, normalizedLimit) : promptGroups
    ).map((group) => {
      if (group.author) {
        group.author = (group.author as Types.ObjectId).toString();
      }
      return group;
    });

    let nextCursor: string | null = null;
    if (isPaginated && hasMore && data.length > 0 && normalizedLimit) {
      const lastGroup = promptGroups[normalizedLimit - 1] as Record<string, unknown>;
      nextCursor = Buffer.from(
        JSON.stringify({
          updatedAt: (lastGroup.updatedAt as Date).toISOString(),
          _id: (lastGroup._id as Types.ObjectId).toString(),
        }),
      ).toString('base64');
    }

    return {
      object: 'list' as const,
      data,
      first_id: data.length > 0 ? (data[0]._id as Types.ObjectId).toString() : null,
      last_id: data.length > 0 ? (data[data.length - 1]._id as Types.ObjectId).toString() : null,
      has_more: hasMore,
      after: nextCursor,
    };
  }

  /**
   * Create a prompt and its respective group.
   */
  async function createPromptGroup(saveData: {
    prompt: Record<string, unknown>;
    group: Record<string, unknown>;
    author: string;
    authorName: string;
  }) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      const { prompt, group, author, authorName } = saveData;

      let newPromptGroup = await PromptGroup.findOneAndUpdate(
        { ...group, author, authorName, productionId: null },
        { $setOnInsert: { ...group, author, authorName, productionId: null } },
        { new: true, upsert: true },
      )
        .lean()
        .select('-__v')
        .exec();

      const newPrompt = await Prompt.findOneAndUpdate(
        { ...prompt, author, groupId: newPromptGroup!._id },
        { $setOnInsert: { ...prompt, author, groupId: newPromptGroup!._id } },
        { new: true, upsert: true },
      )
        .lean()
        .select('-__v')
        .exec();

      newPromptGroup = (await PromptGroup.findByIdAndUpdate(
        newPromptGroup!._id,
        { productionId: newPrompt!._id },
        { new: true },
      )
        .lean()
        .select('-__v')
        .exec())!;

      return {
        prompt: newPrompt,
        group: {
          ...newPromptGroup,
          productionPrompt: { prompt: (newPrompt as unknown as IPrompt).prompt },
        },
      };
    } catch (error) {
      logger.error('Error saving prompt group', error);
      throw new Error('Error saving prompt group');
    }
  }

  /**
   * Save a prompt.
   */
  async function savePrompt(saveData: {
    prompt: Record<string, unknown>;
    author: string | Types.ObjectId;
  }) {
    try {
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      const { prompt, author } = saveData;
      const newPromptData = { ...prompt, author };

      let newPrompt;
      try {
        newPrompt = await Prompt.create(newPromptData);
      } catch (error: unknown) {
        if ((error as Error)?.message?.includes('groupId_1_version_1')) {
          await Prompt.db.collection('prompts').dropIndex('groupId_1_version_1');
        } else {
          throw error;
        }
        newPrompt = await Prompt.create(newPromptData);
      }

      return { prompt: newPrompt };
    } catch (error) {
      logger.error('Error saving prompt', error);
      return { message: 'Error saving prompt' };
    }
  }

  /**
   * Get prompts by filter.
   */
  async function getPrompts(filter: Record<string, unknown>) {
    try {
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      return await Prompt.find(filter).sort({ createdAt: -1 }).lean();
    } catch (error) {
      logger.error('Error getting prompts', error);
      return { message: 'Error getting prompts' };
    }
  }

  /**
   * Get a single prompt by filter.
   */
  async function getPrompt(filter: Record<string, unknown>) {
    try {
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      if (filter.groupId) {
        filter.groupId = new ObjectId(filter.groupId as string);
      }
      return await Prompt.findOne(filter).lean();
    } catch (error) {
      logger.error('Error getting prompt', error);
      return { message: 'Error getting prompt' };
    }
  }

  /**
   * Get random prompt groups from distinct categories.
   */
  async function getRandomPromptGroups(filter: { skip: number | string; limit: number | string }) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const categories = await PromptGroup.distinct('category', { category: { $ne: '' } });

      for (let i = categories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [categories[i], categories[j]] = [categories[j], categories[i]];
      }

      const skip = +filter.skip;
      const limit = +filter.limit;
      const selectedCategories = categories.slice(skip, skip + limit);

      if (selectedCategories.length === 0) {
        return { prompts: [] };
      }

      const groups = await PromptGroup.find({ category: { $in: selectedCategories } }).lean();

      const groupByCategory = new Map<string, unknown>();
      for (const group of groups) {
        if (!groupByCategory.has(group.category)) {
          groupByCategory.set(group.category, group);
        }
      }

      const prompts = selectedCategories
        .map((cat: string) => groupByCategory.get(cat))
        .filter(Boolean);

      return { prompts };
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  }

  /**
   * Get prompt groups with populated prompts.
   */
  async function getPromptGroupsWithPrompts(filter: Record<string, unknown>) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      return await PromptGroup.findOne(filter)
        .populate({
          path: 'prompts',
          select: '-_id -__v -user',
        })
        .select('-_id -__v -user')
        .lean();
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  }

  /**
   * Get a single prompt group by filter.
   */
  async function getPromptGroup(filter: Record<string, unknown>) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      return await PromptGroup.findOne(filter).lean();
    } catch (error) {
      logger.error('Error getting prompt group', error);
      return { message: 'Error getting prompt group' };
    }
  }

  /**
   * Delete a prompt, potentially removing the group if it's the last prompt.
   */
  async function deletePrompt({
    promptId,
    groupId,
    author,
    role,
  }: {
    promptId: string | Types.ObjectId;
    groupId: string | Types.ObjectId;
    author: string | Types.ObjectId;
    role?: string;
  }) {
    const Prompt = mongoose.models.Prompt as Model<IPrompt>;
    const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;

    const query: Record<string, unknown> = { _id: promptId, groupId, author };
    if (role === SystemRoles.ADMIN) {
      delete query.author;
    }
    const { deletedCount } = await Prompt.deleteOne(query);
    if (deletedCount === 0) {
      throw new Error('Failed to delete the prompt');
    }

    const remainingPrompts = await Prompt.find({ groupId })
      .select('_id')
      .sort({ createdAt: 1 })
      .lean();

    if (remainingPrompts.length === 0) {
      try {
        await deps.removeAllPermissions({
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: groupId,
        });
      } catch (error) {
        logger.error('Error removing promptGroup permissions:', error);
      }

      await PromptGroup.deleteOne({ _id: groupId });

      return {
        prompt: 'Prompt deleted successfully',
        promptGroup: {
          message: 'Prompt group deleted successfully',
          id: groupId,
        },
      };
    } else {
      const promptGroup = (await PromptGroup.findById(
        groupId,
      ).lean()) as unknown as IPromptGroup | null;
      if (promptGroup && promptGroup.productionId?.toString() === promptId.toString()) {
        await PromptGroup.updateOne(
          { _id: groupId },
          { productionId: remainingPrompts[remainingPrompts.length - 1]._id },
        );
      }

      return { prompt: 'Prompt deleted successfully' };
    }
  }

  /**
   * Delete all prompts and prompt groups created by a specific user.
   */
  async function deleteUserPrompts(userId: string) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      const AclEntry = mongoose.models.AclEntry;

      const promptGroups = (await getAllPromptGroups({ author: new ObjectId(userId) })) as Array<
        Record<string, unknown>
      >;

      if (!Array.isArray(promptGroups) || promptGroups.length === 0) {
        return;
      }

      const groupIds = promptGroups.map((group) => group._id as Types.ObjectId);

      await AclEntry.deleteMany({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: { $in: groupIds },
      });

      await PromptGroup.deleteMany({ author: new ObjectId(userId) });
      await Prompt.deleteMany({ author: new ObjectId(userId) });
    } catch (error) {
      logger.error('[deleteUserPrompts] General error:', error);
    }
  }

  /**
   * Update a prompt group.
   */
  async function updatePromptGroup(filter: Record<string, unknown>, data: Record<string, unknown>) {
    try {
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;
      const updateOps = {};
      const updateData = { ...data, ...updateOps };
      const updatedDoc = await PromptGroup.findOneAndUpdate(filter, updateData, {
        new: true,
        upsert: false,
      });

      if (!updatedDoc) {
        throw new Error('Prompt group not found');
      }

      return updatedDoc;
    } catch (error) {
      logger.error('Error updating prompt group', error);
      return { message: 'Error updating prompt group' };
    }
  }

  /**
   * Make a prompt the production prompt for its group.
   */
  async function makePromptProduction(promptId: string) {
    try {
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroupDocument>;

      const prompt = await Prompt.findById(promptId).lean();

      if (!prompt) {
        throw new Error('Prompt not found');
      }

      await PromptGroup.findByIdAndUpdate(
        prompt.groupId,
        { productionId: prompt._id },
        { new: true },
      )
        .lean()
        .exec();

      return { message: 'Prompt production made successfully' };
    } catch (error) {
      logger.error('Error making prompt production', error);
      return { message: 'Error making prompt production' };
    }
  }

  /**
   * Update prompt labels.
   */
  async function updatePromptLabels(_id: string, labels: unknown) {
    try {
      const Prompt = mongoose.models.Prompt as Model<IPrompt>;
      const response = await Prompt.updateOne({ _id }, { $set: { labels } });
      if (response.matchedCount === 0) {
        return { message: 'Prompt not found' };
      }
      return { message: 'Prompt labels updated successfully' };
    } catch (error) {
      logger.error('Error updating prompt labels', error);
      return { message: 'Error updating prompt labels' };
    }
  }

  return {
    getPromptGroups,
    deletePromptGroup,
    getAllPromptGroups,
    getListPromptGroupsByAccess,
    createPromptGroup,
    savePrompt,
    getPrompts,
    getPrompt,
    getRandomPromptGroups,
    getPromptGroupsWithPrompts,
    getPromptGroup,
    deletePrompt,
    deleteUserPrompts,
    updatePromptGroup,
    makePromptProduction,
    updatePromptLabels,
  };
}

export type PromptMethods = ReturnType<typeof createPromptMethods>;
