const { ObjectId } = require('mongodb');
const { getProjectByName, addGroupIdsToProject, removeGroupIdsFromProject } = require('./Project');
const { Prompt, PromptGroup } = require('./schema/promptSchema');
const { logger } = require('~/config');

module.exports = {
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
   * Get prompt groups with filters
   * @param {TPromptGroupsWithFilterRequest} filter
   * @returns {Promise<PromptGroupListResponse>}
   */
  getPromptGroupsOld: async (filter) => {
    try {
      const { pageNumber = 1, pageSize = 10, name, ...query } = filter;
      if (name) {
        query.name = new RegExp(name, 'i');
      }

      const skip = (parseInt(pageNumber, 10) - 1) * parseInt(pageSize, 10);
      const limit = parseInt(pageSize, 10);

      const promptGroupsPipeline = [
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
            projectId: 1,
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

      const totalPromptGroupsPipeline = [{ $match: query }, { $count: 'total' }];

      const [promptGroupsResults, totalPromptGroupsResults] = await Promise.all([
        PromptGroup.aggregate(promptGroupsPipeline).exec(),
        PromptGroup.aggregate(totalPromptGroupsPipeline).exec(),
      ]);

      const promptGroups = promptGroupsResults;
      const totalPromptGroups =
        totalPromptGroupsResults.length > 0 ? totalPromptGroupsResults[0].total : 0;

      return {
        promptGroups,
        pageNumber: pageNumber.toString(),
        pageSize: pageSize.toString(),
        pages: Math.ceil(totalPromptGroups / pageSize).toString(),
      };
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  },
  /**
   * Get prompt groups with filters
   * @param {Object} req
   * @param {TPromptGroupsWithFilterRequest} filter
   * @returns {Promise<PromptGroupListResponse>}
   */
  getPromptGroups: async (req, filter) => {
    try {
      const { pageNumber = 1, pageSize = 10, name, ...query } = filter;
      if (name) {
        query.name = new RegExp(name, 'i');
      }

      // const projects = req.user.projects || [];
      const skip = (parseInt(pageNumber, 10) - 1) * parseInt(pageSize, 10);
      const limit = parseInt(pageSize, 10);

      let projectQuery = [];
      const project = await getProjectByName('instance', 'promptGroupIds');
      if (project) {
        projectQuery.push({ _id: { $in: project.promptGroupIds } });
      }

      const combinedQuery = { $or: [...projectQuery, query] };

      const promptGroupsPipeline = [
        { $match: combinedQuery },
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
          },
        },
      ];

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
        pageNumber: pageNumber.toString(),
        pageSize: pageSize.toString(),
        pages: Math.ceil(totalPromptGroups / pageSize).toString(),
      };
    } catch (error) {
      console.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  },
  /**
   * Deletes a prompt and its corresponding prompt group if it is the last prompt in the group.
   *
   * @param {Object} options - The options for deleting the prompt.
   * @param {ObjectId} options.promptId - The ID of the prompt to delete.
   * @param {ObjectId} options.author - The author of the prompt.
   * @return {Promise<TDeletePromptResponse>} An object containing the result of the deletion.
   * If the prompt was deleted successfully, the object will have a property 'prompt' with the value 'Prompt deleted successfully'.
   * If the prompt group was deleted successfully, the object will have a property 'promptGroup' with the message 'Prompt group deleted successfully' and id of the deleted group.
   * If there was an error deleting the prompt, the object will have a property 'message' with the value 'Error deleting prompt'.
   */
  deletePrompt: async ({ promptId, author }) => {
    try {
      const prompt = await Prompt.findOne({ _id: promptId, author });
      if (!prompt) {
        throw new Error('Prompt not found');
      }

      await Prompt.deleteOne({ _id: promptId });

      const promptGroup = await PromptGroup.findById(prompt.groupId);

      const groupId = prompt.groupId;

      const remainingPrompts = await Prompt.find({ groupId }).sort({ createdAt: 1 });

      if (remainingPrompts.length === 0) {
        await PromptGroup.deleteOne({ _id: groupId });
      } else {
        for (let i = 0; i < remainingPrompts.length; i++) {
          remainingPrompts[i].version = i + 1;
          await remainingPrompts[i].save();
        }

        if (promptGroup.productionId.toString() === prompt.id) {
          promptGroup.productionId = remainingPrompts[remainingPrompts.length - 1]._id;
        }

        await promptGroup.save();

        return { prompt: 'Prompt deleted successfully' };
      }

      return {
        prompt: 'Prompt deleted successfully',
        promptGroup: {
          message: 'Prompt group deleted successfully',
          id: groupId,
        },
      };
    } catch (error) {
      logger.error('Error deleting prompt', error);
      return { message: 'Error deleting prompt' };
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
  deletePromptGroup: async (_id) => {
    try {
      const response = await PromptGroup.deleteOne({ _id });

      if (response.deletedCount === 0) {
        return { promptGroup: 'Prompt group not found' };
      }

      await Prompt.deleteMany({ groupId: new ObjectId(_id) });
      return { promptGroup: 'Prompt group deleted successfully' };
    } catch (error) {
      logger.error('Error deleting prompt group', error);
      return { message: 'Error deleting prompt group' };
    }
  },
};
