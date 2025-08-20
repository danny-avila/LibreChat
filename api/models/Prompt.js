const { ObjectId } = require('mongodb');
const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  SystemRoles,
  ResourceType,
  SystemCategories,
} = require('librechat-data-provider');
const {
  removeGroupFromAllProjects,
  removeGroupIdsFromProject,
  addGroupIdsToProject,
  getProjectByName,
} = require('./Project');
const { removeAllPermissions } = require('~/server/services/PermissionService');
const { PromptGroup, Prompt } = require('~/db/models');
const { escapeRegExp } = require('~/server/utils');

/**
 * Create a pipeline for the aggregation to get prompt groups
 * @param {Object} query
 * @param {number} skip
 * @param {number} limit
 * @returns {[Object]} - The pipeline for the aggregation
 */
const createGroupPipeline = (query, skip, limit) => {
  return [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'prompts',
        localField: 'productionId',
        foreignField: '_id',
        as: 'productionPrompt',
      },
    },
    { $unwind: { path: '$productionPrompt', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: 1,
        numberOfGenerations: 1,
        oneliner: 1,
        category: 1,
        projectIds: 1,
        productionId: 1,
        author: 1,
        authorName: 1,
        createdAt: 1,
        updatedAt: 1,
        'productionPrompt.prompt': 1,
        // 'productionPrompt._id': 1,
        // 'productionPrompt.type': 1,
      },
    },
  ];
};

/**
 * Create a pipeline for the aggregation to get all prompt groups
 * @param {Object} query
 * @param {Partial<MongoPromptGroup>} $project
 * @returns {[Object]} - The pipeline for the aggregation
 */
const createAllGroupsPipeline = (
  query,
  $project = {
    name: 1,
    oneliner: 1,
    category: 1,
    author: 1,
    authorName: 1,
    createdAt: 1,
    updatedAt: 1,
    command: 1,
    'productionPrompt.prompt': 1,
  },
) => {
  return [
    { $match: query },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'prompts',
        localField: 'productionId',
        foreignField: '_id',
        as: 'productionPrompt',
      },
    },
    { $unwind: { path: '$productionPrompt', preserveNullAndEmptyArrays: true } },
    {
      $project,
    },
  ];
};

/**
 * Get all prompt groups with filters
 * @param {ServerRequest} req
 * @param {TPromptGroupsWithFilterRequest} filter
 * @returns {Promise<PromptGroupListResponse>}
 */
const getAllPromptGroups = async (req, filter) => {
  try {
    const { name, ...query } = filter;

    let searchShared = true;
    let searchSharedOnly = false;
    if (name) {
      query.name = new RegExp(escapeRegExp(name), 'i');
    }
    if (!query.category) {
      delete query.category;
    } else if (query.category === SystemCategories.MY_PROMPTS) {
      searchShared = false;
      delete query.category;
    } else if (query.category === SystemCategories.NO_CATEGORY) {
      query.category = '';
    } else if (query.category === SystemCategories.SHARED_PROMPTS) {
      searchSharedOnly = true;
      delete query.category;
    }

    let combinedQuery = query;

    if (searchShared) {
      const project = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, 'promptGroupIds');
      if (project && project.promptGroupIds && project.promptGroupIds.length > 0) {
        const projectQuery = { _id: { $in: project.promptGroupIds }, ...query };
        delete projectQuery.author;
        combinedQuery = searchSharedOnly ? projectQuery : { $or: [projectQuery, query] };
      }
    }

    const promptGroupsPipeline = createAllGroupsPipeline(combinedQuery);
    return await PromptGroup.aggregate(promptGroupsPipeline).exec();
  } catch (error) {
    console.error('Error getting all prompt groups', error);
    return { message: 'Error getting all prompt groups' };
  }
};

/**
 * Get prompt groups with filters
 * @param {ServerRequest} req
 * @param {TPromptGroupsWithFilterRequest} filter
 * @returns {Promise<PromptGroupListResponse>}
 */
const getPromptGroups = async (req, filter) => {
  try {
    const { pageNumber = 1, pageSize = 10, name, ...query } = filter;

    const validatedPageNumber = Math.max(parseInt(pageNumber, 10), 1);
    const validatedPageSize = Math.max(parseInt(pageSize, 10), 1);

    let searchShared = true;
    let searchSharedOnly = false;
    if (name) {
      query.name = new RegExp(escapeRegExp(name), 'i');
    }
    if (!query.category) {
      delete query.category;
    } else if (query.category === SystemCategories.MY_PROMPTS) {
      searchShared = false;
      delete query.category;
    } else if (query.category === SystemCategories.NO_CATEGORY) {
      query.category = '';
    } else if (query.category === SystemCategories.SHARED_PROMPTS) {
      searchSharedOnly = true;
      delete query.category;
    }

    let combinedQuery = query;

    if (searchShared) {
      // const projects = req.user.projects || []; // TODO: handle multiple projects
      const project = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, 'promptGroupIds');
      if (project && project.promptGroupIds && project.promptGroupIds.length > 0) {
        const projectQuery = { _id: { $in: project.promptGroupIds }, ...query };
        delete projectQuery.author;
        combinedQuery = searchSharedOnly ? projectQuery : { $or: [projectQuery, query] };
      }
    }

    const skip = (validatedPageNumber - 1) * validatedPageSize;
    const limit = validatedPageSize;

    const promptGroupsPipeline = createGroupPipeline(combinedQuery, skip, limit);
    const totalPromptGroupsPipeline = [{ $match: combinedQuery }, { $count: 'total' }];

    const [promptGroupsResults, totalPromptGroupsResults] = await Promise.all([
      PromptGroup.aggregate(promptGroupsPipeline).exec(),
      PromptGroup.aggregate(totalPromptGroupsPipeline).exec(),
    ]);

    const promptGroups = promptGroupsResults;
    const totalPromptGroups =
      totalPromptGroupsResults.length > 0 ? totalPromptGroupsResults[0].total : 0;

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
};

/**
 * @param {Object} fields
 * @param {string} fields._id
 * @param {string} fields.author
 * @param {string} fields.role
 * @returns {Promise<TDeletePromptGroupResponse>}
 */
const deletePromptGroup = async ({ _id, author, role }) => {
  // Build query - with ACL, author is optional
  const query = { _id };
  const groupQuery = { groupId: new ObjectId(_id) };

  // Legacy: Add author filter if provided (backward compatibility)
  if (author && role !== SystemRoles.ADMIN) {
    query.author = author;
    groupQuery.author = author;
  }

  const response = await PromptGroup.deleteOne(query);

  if (!response || response.deletedCount === 0) {
    throw new Error('Prompt group not found');
  }

  await Prompt.deleteMany(groupQuery);
  await removeGroupFromAllProjects(_id);

  try {
    await removeAllPermissions({ resourceType: ResourceType.PROMPTGROUP, resourceId: _id });
  } catch (error) {
    logger.error('Error removing promptGroup permissions:', error);
  }

  return { message: 'Prompt group deleted successfully' };
};

/**
 * Get prompt groups by accessible IDs with optional cursor-based pagination.
 * @param {Object} params - The parameters for getting accessible prompt groups.
 * @param {Array} [params.accessibleIds] - Array of prompt group ObjectIds the user has ACL access to.
 * @param {Object} [params.otherParams] - Additional query parameters (including author filter).
 * @param {number} [params.limit] - Number of prompt groups to return (max 100). If not provided, returns all prompt groups.
 * @param {string} [params.after] - Cursor for pagination - get prompt groups after this cursor. // base64 encoded JSON string with updatedAt and _id.
 * @returns {Promise<Object>} A promise that resolves to an object containing the prompt groups data and pagination info.
 */
async function getListPromptGroupsByAccess({
  accessibleIds = [],
  otherParams = {},
  limit = null,
  after = null,
}) {
  const isPaginated = limit !== null && limit !== undefined;
  const normalizedLimit = isPaginated ? Math.min(Math.max(1, parseInt(limit) || 20), 100) : null;

  // Build base query combining ACL accessible prompt groups with other filters
  const baseQuery = { ...otherParams, _id: { $in: accessibleIds } };

  // Add cursor condition
  if (after) {
    try {
      const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
      const { updatedAt, _id } = cursor;

      const cursorCondition = {
        $or: [
          { updatedAt: { $lt: new Date(updatedAt) } },
          { updatedAt: new Date(updatedAt), _id: { $gt: new ObjectId(_id) } },
        ],
      };

      // Merge cursor condition with base query
      if (Object.keys(baseQuery).length > 0) {
        baseQuery.$and = [{ ...baseQuery }, cursorCondition];
        // Remove the original conditions from baseQuery to avoid duplication
        Object.keys(baseQuery).forEach((key) => {
          if (key !== '$and') delete baseQuery[key];
        });
      } else {
        Object.assign(baseQuery, cursorCondition);
      }
    } catch (error) {
      logger.warn('Invalid cursor:', error.message);
    }
  }

  // Build aggregation pipeline
  const pipeline = [{ $match: baseQuery }, { $sort: { updatedAt: -1, _id: 1 } }];

  // Only apply limit if pagination is requested
  if (isPaginated) {
    pipeline.push({ $limit: normalizedLimit + 1 });
  }

  // Add lookup for production prompt
  pipeline.push(
    {
      $lookup: {
        from: 'prompts',
        localField: 'productionId',
        foreignField: '_id',
        as: 'productionPrompt',
      },
    },
    { $unwind: { path: '$productionPrompt', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: 1,
        numberOfGenerations: 1,
        oneliner: 1,
        category: 1,
        projectIds: 1,
        productionId: 1,
        author: 1,
        authorName: 1,
        createdAt: 1,
        updatedAt: 1,
        'productionPrompt.prompt': 1,
      },
    },
  );

  const promptGroups = await PromptGroup.aggregate(pipeline).exec();

  const hasMore = isPaginated ? promptGroups.length > normalizedLimit : false;
  const data = (isPaginated ? promptGroups.slice(0, normalizedLimit) : promptGroups).map(
    (group) => {
      if (group.author) {
        group.author = group.author.toString();
      }
      return group;
    },
  );

  // Generate next cursor only if paginated
  let nextCursor = null;
  if (isPaginated && hasMore && data.length > 0) {
    const lastGroup = promptGroups[normalizedLimit - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        updatedAt: lastGroup.updatedAt.toISOString(),
        _id: lastGroup._id.toString(),
      }),
    ).toString('base64');
  }

  return {
    object: 'list',
    data,
    first_id: data.length > 0 ? data[0]._id.toString() : null,
    last_id: data.length > 0 ? data[data.length - 1]._id.toString() : null,
    has_more: hasMore,
    after: nextCursor,
  };
}

module.exports = {
  getPromptGroups,
  deletePromptGroup,
  getAllPromptGroups,
  getListPromptGroupsByAccess,
  /**
   * Create a prompt and its respective group
   * @param {TCreatePromptRecord} saveData
   * @returns {Promise<TCreatePromptResponse>}
   */
  createPromptGroup: async (saveData) => {
    try {
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
        { ...prompt, author, groupId: newPromptGroup._id },
        { $setOnInsert: { ...prompt, author, groupId: newPromptGroup._id } },
        { new: true, upsert: true },
      )
        .lean()
        .select('-__v')
        .exec();

      newPromptGroup = await PromptGroup.findByIdAndUpdate(
        newPromptGroup._id,
        { productionId: newPrompt._id },
        { new: true },
      )
        .lean()
        .select('-__v')
        .exec();

      return {
        prompt: newPrompt,
        group: {
          ...newPromptGroup,
          productionPrompt: { prompt: newPrompt.prompt },
        },
      };
    } catch (error) {
      logger.error('Error saving prompt group', error);
      throw new Error('Error saving prompt group');
    }
  },
  /**
   * Save a prompt
   * @param {TCreatePromptRecord} saveData
   * @returns {Promise<TCreatePromptResponse>}
   */
  savePrompt: async (saveData) => {
    try {
      const { prompt, author } = saveData;
      const newPromptData = {
        ...prompt,
        author,
      };

      /** @type {TPrompt} */
      let newPrompt;
      try {
        newPrompt = await Prompt.create(newPromptData);
      } catch (error) {
        if (error?.message?.includes('groupId_1_version_1')) {
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
  },
  getPrompts: async (filter) => {
    try {
      return await Prompt.find(filter).sort({ createdAt: -1 }).lean();
    } catch (error) {
      logger.error('Error getting prompts', error);
      return { message: 'Error getting prompts' };
    }
  },
  getPrompt: async (filter) => {
    try {
      if (filter.groupId) {
        filter.groupId = new ObjectId(filter.groupId);
      }
      return await Prompt.findOne(filter).lean();
    } catch (error) {
      logger.error('Error getting prompt', error);
      return { message: 'Error getting prompt' };
    }
  },
  /**
   * Get prompt groups with filters
   * @param {TGetRandomPromptsRequest} filter
   * @returns {Promise<TGetRandomPromptsResponse>}
   */
  getRandomPromptGroups: async (filter) => {
    try {
      const result = await PromptGroup.aggregate([
        {
          $match: {
            category: { $ne: '' },
          },
        },
        {
          $group: {
            _id: '$category',
            promptGroup: { $first: '$$ROOT' },
          },
        },
        {
          $replaceRoot: { newRoot: '$promptGroup' },
        },
        {
          $sample: { size: +filter.limit + +filter.skip },
        },
        {
          $skip: +filter.skip,
        },
        {
          $limit: +filter.limit,
        },
      ]);
      return { prompts: result };
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  },
  getPromptGroupsWithPrompts: async (filter) => {
    try {
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
  },
  getPromptGroup: async (filter) => {
    try {
      return await PromptGroup.findOne(filter).lean();
    } catch (error) {
      logger.error('Error getting prompt group', error);
      return { message: 'Error getting prompt group' };
    }
  },
  /**
   * Deletes a prompt and its corresponding prompt group if it is the last prompt in the group.
   *
   * @param {Object} options - The options for deleting the prompt.
   * @param {ObjectId|string} options.promptId - The ID of the prompt to delete.
   * @param {ObjectId|string} options.groupId - The ID of the prompt's group.
   * @param {ObjectId|string} options.author - The ID of the prompt's author.
   * @param {string} options.role - The role of the prompt's author.
   * @return {Promise<TDeletePromptResponse>} An object containing the result of the deletion.
   * If the prompt was deleted successfully, the object will have a property 'prompt' with the value 'Prompt deleted successfully'.
   * If the prompt group was deleted successfully, the object will have a property 'promptGroup' with the message 'Prompt group deleted successfully' and id of the deleted group.
   * If there was an error deleting the prompt, the object will have a property 'message' with the value 'Error deleting prompt'.
   */
  deletePrompt: async ({ promptId, groupId, author, role }) => {
    const query = { _id: promptId, groupId, author };
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
      // Remove all ACL entries for the promptGroup when deleting the last prompt
      try {
        await removeAllPermissions({
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: groupId,
        });
      } catch (error) {
        logger.error('Error removing promptGroup permissions:', error);
      }

      await PromptGroup.deleteOne({ _id: groupId });
      await removeGroupFromAllProjects(groupId);

      return {
        prompt: 'Prompt deleted successfully',
        promptGroup: {
          message: 'Prompt group deleted successfully',
          id: groupId,
        },
      };
    } else {
      const promptGroup = await PromptGroup.findById(groupId).lean();
      if (promptGroup.productionId.toString() === promptId.toString()) {
        await PromptGroup.updateOne(
          { _id: groupId },
          { productionId: remainingPrompts[remainingPrompts.length - 1]._id },
        );
      }

      return { prompt: 'Prompt deleted successfully' };
    }
  },
  /**
   * Update prompt group
   * @param {Partial<MongoPromptGroup>} filter - Filter to find prompt group
   * @param {Partial<MongoPromptGroup>} data - Data to update
   * @returns {Promise<TUpdatePromptGroupResponse>}
   */
  updatePromptGroup: async (filter, data) => {
    try {
      const updateOps = {};
      if (data.removeProjectIds) {
        for (const projectId of data.removeProjectIds) {
          await removeGroupIdsFromProject(projectId, [filter._id]);
        }

        updateOps.$pull = { projectIds: { $in: data.removeProjectIds } };
        delete data.removeProjectIds;
      }

      if (data.projectIds) {
        for (const projectId of data.projectIds) {
          await addGroupIdsToProject(projectId, [filter._id]);
        }

        updateOps.$addToSet = { projectIds: { $each: data.projectIds } };
        delete data.projectIds;
      }

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
  },
  /**
   * Function to make a prompt production based on its ID.
   * @param {String} promptId - The ID of the prompt to make production.
   * @returns {Object} The result of the production operation.
   */
  makePromptProduction: async (promptId) => {
    try {
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

      return {
        message: 'Prompt production made successfully',
      };
    } catch (error) {
      logger.error('Error making prompt production', error);
      return { message: 'Error making prompt production' };
    }
  },
  updatePromptLabels: async (_id, labels) => {
    try {
      const response = await Prompt.updateOne({ _id }, { $set: { labels } });
      if (response.matchedCount === 0) {
        return { message: 'Prompt not found' };
      }
      return { message: 'Prompt labels updated successfully' };
    } catch (error) {
      logger.error('Error updating prompt labels', error);
      return { message: 'Error updating prompt labels' };
    }
  },
};
