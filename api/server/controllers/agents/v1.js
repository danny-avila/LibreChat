const fs = require('fs').promises;
const { nanoid } = require('nanoid');
const {
  Tools,
  Constants,
  FileContext,
  FileSources,
  EToolResources,
  actionDelimiter,
} = require('librechat-data-provider');
const { PermissionBits } = require('@librechat/data-schemas');
const {
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
  getListAgentsByAccess,
} = require('~/models/Agent');
const { uploadImageBuffer, filterFile } = require('~/server/services/Files/process');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { refreshS3Url } = require('~/server/services/Files/S3/crud');
const { updateAction, getActions } = require('~/models/Action');
const { updateAgentProjects } = require('~/models/Agent');
const { getProjectByName } = require('~/models/Project');
const { deleteFileByFilter } = require('~/models/File');
const { grantPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const { logger } = require('~/config');

const systemTools = {
  [Tools.execute_code]: true,
  [Tools.file_search]: true,
};

/**
 * Creates an Agent.
 * @route POST /Agents
 * @param {ServerRequest} req - The request object.
 * @param {AgentCreateParams} req.body - The request body.
 * @param {ServerResponse} res - The response object.
 * @returns {Agent} 201 - success response - application/json
 */
const createAgentHandler = async (req, res) => {
  try {
    const { tools = [], provider, name, description, instructions, model, ...agentData } = req.body;
    const { id: userId } = req.user;

    agentData.tools = [];

    for (const tool of tools) {
      if (req.app.locals.availableTools[tool]) {
        agentData.tools.push(tool);
      }

      if (systemTools[tool]) {
        agentData.tools.push(tool);
      }
    }

    Object.assign(agentData, {
      author: userId,
      name,
      description,
      instructions,
      provider,
      model,
    });

    agentData.id = `agent_${nanoid()}`;
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

    if (agent.avatar && agent.avatar?.source === FileSources.s3) {
      const originalUrl = agent.avatar.filepath;
      agent.avatar.filepath = await refreshS3Url(agent.avatar);
      if (originalUrl !== agent.avatar.filepath) {
        await updateAgent({ id }, { avatar: agent.avatar });
      }
    }

    agent.author = agent.author.toString();

    // @deprecated - isCollaborative replaced by ACL permissions
    agent.isCollaborative = !!agent.isCollaborative;

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
    const { projectIds, removeProjectIds, _id, ...updateData } = req.body;
    const existingAgent = await getAgent({ id });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let updatedAgent =
      Object.keys(updateData).length > 0 ? await updateAgent({ id }, updateData) : existingAgent;

    if (projectIds || removeProjectIds) {
      updatedAgent = await updateAgentProjects({
        user: req.user,
        agentId: id,
        projectIds,
        removeProjectIds,
      });
    }

    if (updatedAgent.author) {
      updatedAgent.author = updatedAgent.author.toString();
    }

    if (updatedAgent.author !== req.user.id) {
      delete updatedAgent.author;
    }

    return res.json(updatedAgent);
  } catch (error) {
    logger.error('[/Agents/:id] Error updating Agent', error);
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

    // Get agent IDs the user has VIEW access to via ACL
    const accessibleIds = await findAccessibleResources({
      userId,
      resourceType: 'agent',
      requiredPermissions: PermissionBits.VIEW,
    });

    // Use the new ACL-aware function
    const data = await getListAgentsByAccess({
      userId,
      accessibleIds,
      otherParams: {}, // Can add query params here if needed
    });

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

    const buffer = await fs.readFile(req.file.path);
    const image = await uploadImageBuffer({
      req,
      context: FileContext.avatar,
      metadata: { buffer },
    });

    let _avatar;
    try {
      const agent = await getAgent({ id: agent_id });
      _avatar = agent.avatar;
    } catch (error) {
      logger.error('[/:agent_id/avatar] Error fetching agent', error);
      _avatar = {};
    }

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
        source: req.app.locals.fileStrategy,
      },
    };

    promises.push(await updateAgent({ id: agent_id }, data));

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
    } catch (error) {
      logger.debug('[/:agent_id/avatar] Temp. image upload file already deleted');
    }
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
};
