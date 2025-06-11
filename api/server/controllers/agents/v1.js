const { z } = require('zod');
const fs = require('fs').promises;
const { nanoid } = require('nanoid');
const { logger, PermissionBits } = require('@librechat/data-schemas');
const { agentCreateSchema, agentUpdateSchema } = require('@librechat/api');
const {
  Tools,
  SystemRoles,
  FileSources,
  EToolResources,
  actionDelimiter,
  removeNullishValues,
} = require('librechat-data-provider');
const {
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgentsByAccess,
  countPromotedAgents,
  revertAgentVersion,
} = require('~/models/Agent');
const {
  grantPermission,
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
} = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { refreshS3Url } = require('~/server/services/Files/S3/crud');
const { filterFile } = require('~/server/services/Files/process');
const { updateAction, getActions } = require('~/models/Action');
const { getCachedTools } = require('~/server/services/Config');
const { deleteFileByFilter } = require('~/models/File');
const { getCategoriesWithCounts } = require('~/models');

const systemTools = {
  [Tools.execute_code]: true,
  [Tools.file_search]: true,
  [Tools.web_search]: true,
};

/**
 * Creates an Agent.
 * @route POST /Agents
 * @param {ServerRequest} req - The request object.
 * @param {AgentCreateParams} req.body - The request body.
 * @param {ServerResponse} res - The response object.
 * @returns {Promise<Agent>} 201 - success response - application/json
 */
const createAgentHandler = async (req, res) => {
  try {
    const validatedData = agentCreateSchema.parse(req.body);
    const { tools = [], ...agentData } = removeNullishValues(validatedData);

    const { id: userId } = req.user;

    agentData.id = `agent_${nanoid()}`;
    agentData.author = userId;
    agentData.tools = [];

    const availableTools = await getCachedTools({ includeGlobal: true });
    for (const tool of tools) {
      if (availableTools[tool]) {
        agentData.tools.push(tool);
      }

      if (systemTools[tool]) {
        agentData.tools.push(tool);
      }
    }

    const agent = await createAgent(agentData);

    // Automatically grant owner permissions to the creator
    try {
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_owner',
        grantedBy: userId,
      });
      logger.debug(
        `[createAgent] Granted owner permissions to user ${userId} for agent ${agent.id}`,
      );
    } catch (permissionError) {
      logger.error(
        `[createAgent] Failed to grant owner permissions for agent ${agent.id}:`,
        permissionError,
      );
    }

    res.status(201).json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('[/Agents] Validation error', error.errors);
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('[/Agents] Error creating agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieves an Agent by ID.
 * @route GET /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @param {object} req.user - Authenticated user information
 * @param {string} req.user.id - User ID
 * @returns {Promise<Agent>} 200 - success response - application/json
 * @returns {Error} 404 - Agent not found
 */
const getAgentHandler = async (req, res, expandProperties = false) => {
  try {
    const id = req.params.id;
    const author = req.user.id;

    // Permissions are validated by middleware before calling this function
    // Simply load the agent by ID
    const agent = await getAgent({ id });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    agent.version = agent.versions ? agent.versions.length : 0;

    if (agent.avatar && agent.avatar?.source === FileSources.s3) {
      const originalUrl = agent.avatar.filepath;
      agent.avatar.filepath = await refreshS3Url(agent.avatar);
      if (originalUrl !== agent.avatar.filepath) {
        await updateAgent({ id }, { avatar: agent.avatar }, { updatingUserId: req.user.id });
      }
    }

    agent.author = agent.author.toString();

    // @deprecated - isCollaborative replaced by ACL permissions
    agent.isCollaborative = !!agent.isCollaborative;

    // Check if agent is public
    const isPublic = await hasPublicPermission({
      resourceType: 'agent',
      resourceId: agent._id,
      requiredPermissions: PermissionBits.VIEW,
    });
    agent.isPublic = isPublic;

    if (agent.author !== author) {
      delete agent.author;
    }

    if (!expandProperties) {
      // VIEW permission: Basic agent info only
      return res.status(200).json({
        _id: agent._id,
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar: agent.avatar,
        author: agent.author,
        provider: agent.provider,
        model: agent.model,
        projectIds: agent.projectIds,
        // @deprecated - isCollaborative replaced by ACL permissions
        isCollaborative: agent.isCollaborative,
        isPublic: agent.isPublic,
        version: agent.version,
        // Safe metadata
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      });
    }

    // EDIT permission: Full agent details including sensitive configuration
    return res.status(200).json(agent);
  } catch (error) {
    logger.error('[/Agents/:id] Error retrieving agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Updates an Agent.
 * @route PATCH /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The Agent update parameters.
 * @returns {Agent} 200 - success response - application/json
 */
const updateAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const validatedData = agentUpdateSchema.parse(req.body);
    const { _id, ...updateData } = removeNullishValues(validatedData);
    const existingAgent = await getAgent({ id });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let updatedAgent =
      Object.keys(updateData).length > 0
        ? await updateAgent({ id }, updateData, {
            updatingUserId: req.user.id,
          })
        : existingAgent;

    if (updatedAgent.author) {
      updatedAgent.author = updatedAgent.author.toString();
    }

    if (updatedAgent.author !== req.user.id) {
      delete updatedAgent.author;
    }

    return res.json(updatedAgent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('[/Agents/:id] Validation error', error.errors);
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }

    logger.error('[/Agents/:id] Error updating Agent', error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        error: error.message,
        details: error.details,
      });
    }

    res.status(500).json({ error: error.message });
  }
};

/**
 * Duplicates an Agent based on the provided ID.
 * @route POST /Agents/:id/duplicate
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 201 - success response - application/json
 */
const duplicateAgentHandler = async (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];

  try {
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        status: 'error',
      });
    }

    const {
      id: _id,
      _id: __id,
      author: _author,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      tool_resources: _tool_resources = {},
      versions: _versions,
      __v: _v,
      ...cloneData
    } = agent;
    cloneData.name = `${agent.name} (${new Date().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false,
    })})`;

    if (_tool_resources?.[EToolResources.ocr]) {
      cloneData.tool_resources = {
        [EToolResources.ocr]: _tool_resources[EToolResources.ocr],
      };
    }

    const newAgentId = `agent_${nanoid()}`;
    const newAgentData = Object.assign(cloneData, {
      id: newAgentId,
      author: userId,
    });

    const newActionsList = [];
    const originalActions = (await getActions({ agent_id: id }, true)) ?? [];
    const promises = [];

    /**
     * Duplicates an action and returns the new action ID.
     * @param {Action} action
     * @returns {Promise<string>}
     */
    const duplicateAction = async (action) => {
      const newActionId = nanoid();
      const [domain] = action.action_id.split(actionDelimiter);
      const fullActionId = `${domain}${actionDelimiter}${newActionId}`;

      const newAction = await updateAction(
        { action_id: newActionId },
        {
          metadata: action.metadata,
          agent_id: newAgentId,
          user: userId,
        },
      );

      const filteredMetadata = { ...newAction.metadata };
      for (const field of sensitiveFields) {
        delete filteredMetadata[field];
      }

      newAction.metadata = filteredMetadata;
      newActionsList.push(newAction);
      return fullActionId;
    };

    for (const action of originalActions) {
      promises.push(
        duplicateAction(action).catch((error) => {
          logger.error('[/agents/:id/duplicate] Error duplicating Action:', error);
        }),
      );
    }

    const agentActions = await Promise.all(promises);
    newAgentData.actions = agentActions;
    const newAgent = await createAgent(newAgentData);

    // Automatically grant owner permissions to the duplicator
    try {
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: newAgent._id,
        accessRoleId: 'agent_owner',
        grantedBy: userId,
      });
      logger.debug(
        `[duplicateAgent] Granted owner permissions to user ${userId} for duplicated agent ${newAgent.id}`,
      );
    } catch (permissionError) {
      logger.error(
        `[duplicateAgent] Failed to grant owner permissions for duplicated agent ${newAgent.id}:`,
        permissionError,
      );
    }

    return res.status(201).json({
      agent: newAgent,
      actions: newActionsList,
    });
  } catch (error) {
    logger.error('[/Agents/:id/duplicate] Error duplicating Agent:', error);

    res.status(500).json({ error: error.message });
  }
};

/**
 * Deletes an Agent based on the provided ID.
 * @route DELETE /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
const deleteAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    await deleteAgent({ id });
    return res.json({ message: 'Agent deleted' });
  } catch (error) {
    logger.error('[/Agents/:id] Error deleting Agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Lists agents using ACL-aware permissions (ownership + explicit shares).
 * @route GET /Agents
 * @param {object} req - Express Request
 * @param {object} req.query - Request query
 * @param {string} [req.query.user] - The user ID of the agent's author.
 * @returns {Promise<AgentListResponse>} 200 - success response - application/json
 */
const getListAgentsHandler = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, search, limit, cursor, promoted } = req.query;
    let requiredPermission = req.query.requiredPermission;
    if (typeof requiredPermission === 'string') {
      requiredPermission = parseInt(requiredPermission, 10);
      if (isNaN(requiredPermission)) {
        requiredPermission = PermissionBits.VIEW;
      }
    } else if (typeof requiredPermission !== 'number') {
      requiredPermission = PermissionBits.VIEW;
    }
    // Base filter
    const filter = {};

    // Handle category filter - only apply if category is defined
    if (category !== undefined && category.trim() !== '') {
      filter.category = category;
    }

    // Handle promoted filter - only from query param
    if (promoted === '1') {
      filter.is_promoted = true;
    } else if (promoted === '0') {
      filter.is_promoted = { $ne: true };
    }

    // Handle search filter
    if (search && search.trim() !== '') {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    // Get agent IDs the user has VIEW access to via ACL
    const accessibleIds = await findAccessibleResources({
      userId,
      resourceType: 'agent',
      requiredPermissions: requiredPermission,
    });
    const publiclyAccessibleIds = await findPubliclyAccessibleResources({
      resourceType: 'agent',
      requiredPermissions: PermissionBits.VIEW,
    });
    // Use the new ACL-aware function
    const data = await getListAgentsByAccess({
      accessibleIds,
      otherParams: filter,
      limit,
      after: cursor,
    });
    if (data?.data?.length) {
      data.data = data.data.map((agent) => {
        if (publiclyAccessibleIds.some((id) => id.equals(agent._id))) {
          agent.isPublic = true;
        }
        return agent;
      });
    }
    return res.json(data);
  } catch (error) {
    logger.error('[/Agents] Error listing Agents', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /:agent_id/avatar
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {object} req.body - Request body
 * @param {string} [req.body.avatar] - Optional avatar for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
const uploadAgentAvatarHandler = async (req, res) => {
  try {
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    const { agent_id } = req.params;
    if (!agent_id) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }

    const isAdmin = req.user.role === SystemRoles.ADMIN;
    const existingAgent = await getAgent({ id: agent_id });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const isAuthor = existingAgent.author.toString() === req.user.id;
    const hasEditPermission = existingAgent.isCollaborative || isAdmin || isAuthor;

    if (!hasEditPermission) {
      return res.status(403).json({
        error: 'You do not have permission to modify this non-collaborative agent',
      });
    }

    const buffer = await fs.readFile(req.file.path);

    const fileStrategy = req.app.locals.fileStrategy;

    const resizedBuffer = await resizeAvatar({
      userId: req.user.id,
      input: buffer,
    });

    const { processAvatar } = getStrategyFunctions(fileStrategy);
    const avatarUrl = await processAvatar({
      buffer: resizedBuffer,
      userId: req.user.id,
      manual: 'false',
      agentId: agent_id,
    });

    const image = {
      filepath: avatarUrl,
      source: fileStrategy,
    };

    let _avatar = existingAgent.avatar;

    if (_avatar && _avatar.source) {
      const { deleteFile } = getStrategyFunctions(_avatar.source);
      try {
        await deleteFile(req, { filepath: _avatar.filepath });
        await deleteFileByFilter({ user: req.user.id, filepath: _avatar.filepath });
      } catch (error) {
        logger.error('[/:agent_id/avatar] Error deleting old avatar', error);
      }
    }

    const promises = [];

    const data = {
      avatar: {
        filepath: image.filepath,
        source: image.source,
      },
    };

    promises.push(
      await updateAgent({ id: agent_id }, data, {
        updatingUserId: req.user.id,
      }),
    );

    const resolved = await Promise.all(promises);
    res.status(201).json(resolved[0]);
  } catch (error) {
    const message = 'An error occurred while updating the Agent Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/:agent_id/avatar] Temp. image upload file deleted');
    } catch {
      logger.debug('[/:agent_id/avatar] Temp. image upload file already deleted');
    }
  }
};

/**
 * Reverts an agent to a previous version from its version history.
 * @route PATCH /agents/:id/revert
 * @param {object} req - Express Request object
 * @param {object} req.params - Request parameters
 * @param {string} req.params.id - The ID of the agent to revert
 * @param {object} req.body - Request body
 * @param {number} req.body.version_index - The index of the version to revert to
 * @param {object} req.user - Authenticated user information
 * @param {string} req.user.id - User ID
 * @param {string} req.user.role - User role
 * @param {ServerResponse} res - Express Response object
 * @returns {Promise<Agent>} 200 - The updated agent after reverting to the specified version
 * @throws {Error} 400 - If version_index is missing
 * @throws {Error} 403 - If user doesn't have permission to modify the agent
 * @throws {Error} 404 - If agent not found
 * @throws {Error} 500 - If there's an internal server error during the reversion process
 */
const revertAgentVersionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { version_index } = req.body;

    if (version_index === undefined) {
      return res.status(400).json({ error: 'version_index is required' });
    }

    const isAdmin = req.user.role === SystemRoles.ADMIN;
    const existingAgent = await getAgent({ id });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const isAuthor = existingAgent.author.toString() === req.user.id;
    const hasEditPermission = existingAgent.isCollaborative || isAdmin || isAuthor;

    if (!hasEditPermission) {
      return res.status(403).json({
        error: 'You do not have permission to modify this non-collaborative agent',
      });
    }

    const updatedAgent = await revertAgentVersion({ id }, version_index);

    if (updatedAgent.author) {
      updatedAgent.author = updatedAgent.author.toString();
    }

    if (updatedAgent.author !== req.user.id) {
      delete updatedAgent.author;
    }

    return res.json(updatedAgent);
  } catch (error) {
    logger.error('[/agents/:id/revert] Error reverting Agent version', error);
    res.status(500).json({ error: error.message });
  }
};
/**
 * Get all agent categories with counts
 *
 * @param {Object} _req - Express request object (unused)
 * @param {Object} res - Express response object
 */
const getAgentCategories = async (_req, res) => {
  try {
    const categories = await getCategoriesWithCounts();
    const promotedCount = await countPromotedAgents();
    const formattedCategories = categories.map((category) => ({
      value: category.value,
      label: category.label,
      count: category.agentCount,
      description: category.description,
    }));

    if (promotedCount > 0) {
      formattedCategories.unshift({
        value: 'promoted',
        label: 'Promoted',
        count: promotedCount,
        description: 'Our recommended agents',
      });
    }

    formattedCategories.push({
      value: 'all',
      label: 'All',
      description: 'All available agents',
    });

    res.status(200).json(formattedCategories);
  } catch (error) {
    logger.error('[/Agents/Marketplace] Error fetching agent categories:', error);
    res.status(500).json({
      error: 'Failed to fetch agent categories',
      userMessage: 'Unable to load categories. Please refresh the page.',
      suggestion: 'Try refreshing the page or check your network connection',
    });
  }
};
module.exports = {
  createAgent: createAgentHandler,
  getAgent: getAgentHandler,
  updateAgent: updateAgentHandler,
  duplicateAgent: duplicateAgentHandler,
  deleteAgent: deleteAgentHandler,
  getListAgents: getListAgentsHandler,
  uploadAgentAvatar: uploadAgentAvatarHandler,
  revertAgentVersion: revertAgentVersionHandler,
  getAgentCategories,
};
