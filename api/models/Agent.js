const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { agentSchema } = require('@librechat/data-schemas');
const { SystemRoles, Tools, actionDelimiter } = require('librechat-data-provider');
const { GLOBAL_PROJECT_NAME, EPHEMERAL_AGENT_ID, mcp_delimiter } =
  require('librechat-data-provider').Constants;
const { CONFIG_STORE, STARTUP_CONFIG } = require('librechat-data-provider').CacheKeys;
const {
  getProjectByName,
  addAgentIdsToProject,
  removeAgentIdsFromProject,
  removeAgentFromAllProjects,
} = require('./Project');
const getLogStores = require('~/cache/getLogStores');
const { getActions } = require('./Action');
const { logger } = require('~/config');

const Agent = mongoose.model('agent', agentSchema);

/**
 * Create an agent with the provided data.
 * @param {Object} agentData - The agent data to create.
 * @returns {Promise<Agent>} The created agent document as a plain object.
 * @throws {Error} If the agent creation fails.
 */
const createAgent = async (agentData) => {
  const { author, ...versionData } = agentData;
  const timestamp = new Date();
  const initialAgentData = {
    ...agentData,
    versions: [
      {
        ...versionData,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
  return (await Agent.create(initialAgentData)).toObject();
};

/**
 * Get an agent document based on the provided ID.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to update.
 * @param {string} searchParameter.id - The ID of the agent to update.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<Agent|null>} The agent document as a plain object, or null if not found.
 */
const getAgent = async (searchParameter) => await Agent.findOne(searchParameter).lean();

/**
 * Load an agent based on the provided ID
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {string} params.agent_id
 * @param {string} params.endpoint
 * @param {import('@librechat/agents').ClientOptions} [params.model_parameters]
 * @returns {Agent|null} The agent document as a plain object, or null if not found.
 */
const loadEphemeralAgent = ({ req, agent_id, endpoint, model_parameters: _m }) => {
  const { model, ...model_parameters } = _m;
  /** @type {Record<string, FunctionTool>} */
  const availableTools = req.app.locals.availableTools;
  /** @type {TEphemeralAgent | null} */
  const ephemeralAgent = req.body.ephemeralAgent;
  const mcpServers = new Set(ephemeralAgent?.mcp);
  /** @type {string[]} */
  const tools = [];
  if (ephemeralAgent?.execute_code === true) {
    tools.push(Tools.execute_code);
  }
  if (ephemeralAgent?.web_search === true) {
    tools.push(Tools.web_search);
  }

  if (mcpServers.size > 0) {
    for (const toolName of Object.keys(availableTools)) {
      if (!toolName.includes(mcp_delimiter)) {
        continue;
      }
      const mcpServer = toolName.split(mcp_delimiter)?.[1];
      if (mcpServer && mcpServers.has(mcpServer)) {
        tools.push(toolName);
      }
    }
  }

  const instructions = req.body.promptPrefix;
  return {
    id: agent_id,
    instructions,
    provider: endpoint,
    model_parameters,
    model,
    tools,
  };
};

/**
 * Load an agent based on the provided ID
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {string} params.agent_id
 * @param {string} params.endpoint
 * @param {import('@librechat/agents').ClientOptions} [params.model_parameters]
 * @returns {Promise<Agent|null>} The agent document as a plain object, or null if not found.
 */
const loadAgent = async ({ req, agent_id, endpoint, model_parameters }) => {
  if (!agent_id) {
    return null;
  }
  if (agent_id === EPHEMERAL_AGENT_ID) {
    return loadEphemeralAgent({ req, agent_id, endpoint, model_parameters });
  }
  const agent = await getAgent({
    id: agent_id,
  });

  if (!agent) {
    return null;
  }

  agent.version = agent.versions ? agent.versions.length : 0;

  if (agent.author.toString() === req.user.id) {
    return agent;
  }

  if (!agent.projectIds) {
    return null;
  }

  const cache = getLogStores(CONFIG_STORE);
  /** @type {TStartupConfig} */
  const cachedStartupConfig = await cache.get(STARTUP_CONFIG);
  let { instanceProjectId } = cachedStartupConfig ?? {};
  if (!instanceProjectId) {
    instanceProjectId = (await getProjectByName(GLOBAL_PROJECT_NAME, '_id'))._id.toString();
  }

  for (const projectObjectId of agent.projectIds) {
    const projectId = projectObjectId.toString();
    if (projectId === instanceProjectId) {
      return agent;
    }
  }
};

/**
 * Check if a version already exists in the versions array, excluding timestamp and author fields
 * @param {Object} updateData - The update data to compare
 * @param {Object} currentData - The current agent data
 * @param {Array} versions - The existing versions array
 * @param {string} [actionsHash] - Hash of current action metadata
 * @returns {Object|null} - The matching version if found, null otherwise
 */
const isDuplicateVersion = (updateData, currentData, versions, actionsHash = null) => {
  if (!versions || versions.length === 0) {
    return null;
  }

  const excludeFields = [
    '_id',
    'id',
    'createdAt',
    'updatedAt',
    'author',
    'updatedBy',
    'created_at',
    'updated_at',
    '__v',
    'agent_ids',
    'versions',
    'actionsHash', // Exclude actionsHash from direct comparison
  ];

  const { $push, $pull, $addToSet, ...directUpdates } = updateData;

  if (Object.keys(directUpdates).length === 0 && !actionsHash) {
    return null;
  }

  const wouldBeVersion = { ...currentData, ...directUpdates };
  const lastVersion = versions[versions.length - 1];

  if (actionsHash && lastVersion.actionsHash !== actionsHash) {
    return null;
  }

  const allFields = new Set([...Object.keys(wouldBeVersion), ...Object.keys(lastVersion)]);

  const importantFields = Array.from(allFields).filter((field) => !excludeFields.includes(field));

  let isMatch = true;
  for (const field of importantFields) {
    if (!wouldBeVersion[field] && !lastVersion[field]) {
      continue;
    }

    if (Array.isArray(wouldBeVersion[field]) && Array.isArray(lastVersion[field])) {
      if (wouldBeVersion[field].length !== lastVersion[field].length) {
        isMatch = false;
        break;
      }

      // Special handling for projectIds (MongoDB ObjectIds)
      if (field === 'projectIds') {
        const wouldBeIds = wouldBeVersion[field].map((id) => id.toString()).sort();
        const versionIds = lastVersion[field].map((id) => id.toString()).sort();

        if (!wouldBeIds.every((id, i) => id === versionIds[i])) {
          isMatch = false;
          break;
        }
      }
      // Handle arrays of objects like tool_kwargs
      else if (typeof wouldBeVersion[field][0] === 'object' && wouldBeVersion[field][0] !== null) {
        const sortedWouldBe = [...wouldBeVersion[field]].map((item) => JSON.stringify(item)).sort();
        const sortedVersion = [...lastVersion[field]].map((item) => JSON.stringify(item)).sort();

        if (!sortedWouldBe.every((item, i) => item === sortedVersion[i])) {
          isMatch = false;
          break;
        }
      } else {
        const sortedWouldBe = [...wouldBeVersion[field]].sort();
        const sortedVersion = [...lastVersion[field]].sort();

        if (!sortedWouldBe.every((item, i) => item === sortedVersion[i])) {
          isMatch = false;
          break;
        }
      }
    } else if (field === 'model_parameters') {
      const wouldBeParams = wouldBeVersion[field] || {};
      const lastVersionParams = lastVersion[field] || {};
      if (JSON.stringify(wouldBeParams) !== JSON.stringify(lastVersionParams)) {
        isMatch = false;
        break;
      }
    } else if (wouldBeVersion[field] !== lastVersion[field]) {
      isMatch = false;
      break;
    }
  }

  return isMatch ? lastVersion : null;
};

/**
 * Update an agent with new data without overwriting existing
 *  properties, or create a new agent if it doesn't exist.
 * When an agent is updated, a copy of the current state will be saved to the versions array.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to update.
 * @param {string} searchParameter.id - The ID of the agent to update.
 * @param {string} [searchParameter.author] - The user ID of the agent's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @param {Object} [options] - Optional configuration object.
 * @param {string} [options.updatingUserId] - The ID of the user performing the update (used for tracking non-author updates).
 * @param {boolean} [options.forceVersion] - Force creation of a new version even if no fields changed.
 * @returns {Promise<Agent>} The updated or newly created agent document as a plain object.
 * @throws {Error} If the update would create a duplicate version
 */
const updateAgent = async (searchParameter, updateData, options = {}) => {
  const { updatingUserId = null, forceVersion = false } = options;
  const mongoOptions = { new: true, upsert: false };

  const currentAgent = await Agent.findOne(searchParameter);
  if (currentAgent) {
    const { __v, _id, id, versions, author, ...versionData } = currentAgent.toObject();
    const { $push, $pull, $addToSet, ...directUpdates } = updateData;

    let actionsHash = null;

    // Generate actions hash if agent has actions
    if (currentAgent.actions && currentAgent.actions.length > 0) {
      // Extract action IDs from the format "domain_action_id"
      const actionIds = currentAgent.actions
        .map((action) => {
          const parts = action.split(actionDelimiter);
          return parts[1]; // Get just the action ID part
        })
        .filter(Boolean);

      if (actionIds.length > 0) {
        try {
          const actions = await getActions(
            {
              action_id: { $in: actionIds },
            },
            true,
          ); // Include sensitive data for hash

          actionsHash = await generateActionMetadataHash(currentAgent.actions, actions);
        } catch (error) {
          logger.error('Error fetching actions for hash generation:', error);
        }
      }
    }

    const shouldCreateVersion =
      forceVersion ||
      (versions &&
        versions.length > 0 &&
        (Object.keys(directUpdates).length > 0 || $push || $pull || $addToSet));

    if (shouldCreateVersion) {
      const duplicateVersion = isDuplicateVersion(updateData, versionData, versions, actionsHash);
      if (duplicateVersion && !forceVersion) {
        const error = new Error(
          'Duplicate version: This would create a version identical to an existing one',
        );
        error.statusCode = 409;
        error.details = {
          duplicateVersion,
          versionIndex: versions.findIndex(
            (v) => JSON.stringify(duplicateVersion) === JSON.stringify(v),
          ),
        };
        throw error;
      }
    }

    const versionEntry = {
      ...versionData,
      ...directUpdates,
      updatedAt: new Date(),
    };

    // Include actions hash in version if available
    if (actionsHash) {
      versionEntry.actionsHash = actionsHash;
    }

    // Always store updatedBy field to track who made the change
    if (updatingUserId) {
      versionEntry.updatedBy = new mongoose.Types.ObjectId(updatingUserId);
    }

    if (shouldCreateVersion || forceVersion) {
      updateData.$push = {
        ...($push || {}),
        versions: versionEntry,
      };
    }
  }

  return Agent.findOneAndUpdate(searchParameter, updateData, mongoOptions).lean();
};

/**
 * Modifies an agent with the resource file id.
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {string} params.agent_id
 * @param {string} params.tool_resource
 * @param {string} params.file_id
 * @returns {Promise<Agent>} The updated agent.
 */
const addAgentResourceFile = async ({ req, agent_id, tool_resource, file_id }) => {
  const searchParameter = { id: agent_id };
  let agent = await getAgent(searchParameter);
  if (!agent) {
    throw new Error('Agent not found for adding resource file');
  }
  const fileIdsPath = `tool_resources.${tool_resource}.file_ids`;
  await Agent.updateOne(
    {
      id: agent_id,
      [`${fileIdsPath}`]: { $exists: false },
    },
    {
      $set: {
        [`${fileIdsPath}`]: [],
      },
    },
  );

  const updateData = {
    $addToSet: {
      tools: tool_resource,
      [fileIdsPath]: file_id,
    },
  };

  const updatedAgent = await updateAgent(searchParameter, updateData, {
    updatingUserId: req?.user?.id,
  });
  if (updatedAgent) {
    return updatedAgent;
  } else {
    throw new Error('Agent not found for adding resource file');
  }
};

/**
 * Removes multiple resource files from an agent using atomic operations.
 * @param {object} params
 * @param {string} params.agent_id
 * @param {Array<{tool_resource: string, file_id: string}>} params.files
 * @returns {Promise<Agent>} The updated agent.
 * @throws {Error} If the agent is not found or update fails.
 */
const removeAgentResourceFiles = async ({ agent_id, files }) => {
  const searchParameter = { id: agent_id };

  // Group files to remove by resource
  const filesByResource = files.reduce((acc, { tool_resource, file_id }) => {
    if (!acc[tool_resource]) {
      acc[tool_resource] = [];
    }
    acc[tool_resource].push(file_id);
    return acc;
  }, {});

  // Step 1: Atomically remove file IDs using $pull
  const pullOps = {};
  const resourcesToCheck = new Set();
  for (const [resource, fileIds] of Object.entries(filesByResource)) {
    const fileIdsPath = `tool_resources.${resource}.file_ids`;
    pullOps[fileIdsPath] = { $in: fileIds };
    resourcesToCheck.add(resource);
  }

  const updatePullData = { $pull: pullOps };
  const agentAfterPull = await Agent.findOneAndUpdate(searchParameter, updatePullData, {
    new: true,
  }).lean();

  if (!agentAfterPull) {
    // Agent might have been deleted concurrently, or never existed.
    // Check if it existed before trying to throw.
    const agentExists = await getAgent(searchParameter);
    if (!agentExists) {
      throw new Error('Agent not found for removing resource files');
    }
    // If it existed but findOneAndUpdate returned null, something else went wrong.
    throw new Error('Failed to update agent during file removal (pull step)');
  }

  // Return the agent state directly after the $pull operation.
  // Skipping the $unset step for now to simplify and test core $pull atomicity.
  // Empty arrays might remain, but the removal itself should be correct.
  return agentAfterPull;
};

/**
 * Deletes an agent based on the provided ID.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to delete.
 * @param {string} searchParameter.id - The ID of the agent to delete.
 * @param {string} [searchParameter.author] - The user ID of the agent's author.
 * @returns {Promise<void>} Resolves when the agent has been successfully deleted.
 */
const deleteAgent = async (searchParameter) => {
  const agent = await Agent.findOneAndDelete(searchParameter);
  if (agent) {
    await removeAgentFromAllProjects(agent.id);
  }
  return agent;
};

/**
 * Get all agents.
 * @param {Object} searchParameter - The search parameters to find matching agents.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<Object>} A promise that resolves to an object containing the agents data and pagination info.
 */
const getListAgents = async (searchParameter) => {
  const { author, ...otherParams } = searchParameter;

  let query = Object.assign({ author }, otherParams);

  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['agentIds']);
  if (globalProject && (globalProject.agentIds?.length ?? 0) > 0) {
    const globalQuery = { id: { $in: globalProject.agentIds }, ...otherParams };
    delete globalQuery.author;
    query = { $or: [globalQuery, query] };
  }

  const agents = (
    await Agent.find(query, {
      id: 1,
      _id: 0,
      name: 1,
      avatar: 1,
      author: 1,
      projectIds: 1,
      description: 1,
      isCollaborative: 1,
    }).lean()
  ).map((agent) => {
    if (agent.author?.toString() !== author) {
      delete agent.author;
    }
    if (agent.author) {
      agent.author = agent.author.toString();
    }
    return agent;
  });

  const hasMore = agents.length > 0;
  const firstId = agents.length > 0 ? agents[0].id : null;
  const lastId = agents.length > 0 ? agents[agents.length - 1].id : null;

  return {
    data: agents,
    has_more: hasMore,
    first_id: firstId,
    last_id: lastId,
  };
};

/**
 * Updates the projects associated with an agent, adding and removing project IDs as specified.
 * This function also updates the corresponding projects to include or exclude the agent ID.
 *
 * @param {Object} params - Parameters for updating the agent's projects.
 * @param {MongoUser} params.user - Parameters for updating the agent's projects.
 * @param {string} params.agentId - The ID of the agent to update.
 * @param {string[]} [params.projectIds] - Array of project IDs to add to the agent.
 * @param {string[]} [params.removeProjectIds] - Array of project IDs to remove from the agent.
 * @returns {Promise<MongoAgent>} The updated agent document.
 * @throws {Error} If there's an error updating the agent or projects.
 */
const updateAgentProjects = async ({ user, agentId, projectIds, removeProjectIds }) => {
  const updateOps = {};

  if (removeProjectIds && removeProjectIds.length > 0) {
    for (const projectId of removeProjectIds) {
      await removeAgentIdsFromProject(projectId, [agentId]);
    }
    updateOps.$pull = { projectIds: { $in: removeProjectIds } };
  }

  if (projectIds && projectIds.length > 0) {
    for (const projectId of projectIds) {
      await addAgentIdsToProject(projectId, [agentId]);
    }
    updateOps.$addToSet = { projectIds: { $each: projectIds } };
  }

  if (Object.keys(updateOps).length === 0) {
    return await getAgent({ id: agentId });
  }

  const updateQuery = { id: agentId, author: user.id };
  if (user.role === SystemRoles.ADMIN) {
    delete updateQuery.author;
  }

  const updatedAgent = await updateAgent(updateQuery, updateOps, { updatingUserId: user.id });
  if (updatedAgent) {
    return updatedAgent;
  }
  if (updateOps.$addToSet) {
    for (const projectId of projectIds) {
      await removeAgentIdsFromProject(projectId, [agentId]);
    }
  } else if (updateOps.$pull) {
    for (const projectId of removeProjectIds) {
      await addAgentIdsToProject(projectId, [agentId]);
    }
  }

  return await getAgent({ id: agentId });
};

/**
 * Reverts an agent to a specific version in its version history.
 * @param {Object} searchParameter - The search parameters to find the agent to revert.
 * @param {string} searchParameter.id - The ID of the agent to revert.
 * @param {string} [searchParameter.author] - The user ID of the agent's author.
 * @param {number} versionIndex - The index of the version to revert to in the versions array.
 * @returns {Promise<MongoAgent>} The updated agent document after reverting.
 * @throws {Error} If the agent is not found or the specified version does not exist.
 */
const revertAgentVersion = async (searchParameter, versionIndex) => {
  const agent = await Agent.findOne(searchParameter);
  if (!agent) {
    throw new Error('Agent not found');
  }

  if (!agent.versions || !agent.versions[versionIndex]) {
    throw new Error(`Version ${versionIndex} not found`);
  }

  const revertToVersion = agent.versions[versionIndex];

  const updateData = {
    ...revertToVersion,
  };

  delete updateData._id;
  delete updateData.id;
  delete updateData.versions;
  delete updateData.author;
  delete updateData.updatedBy;

  return Agent.findOneAndUpdate(searchParameter, updateData, { new: true }).lean();
};

/**
 * Generates a hash of action metadata for version comparison
 * @param {string[]} actionIds - Array of action IDs in format "domain_action_id"
 * @param {Action[]} actions - Array of action documents
 * @returns {Promise<string>} - SHA256 hash of the action metadata
 */
const generateActionMetadataHash = async (actionIds, actions) => {
  if (!actionIds || actionIds.length === 0) {
    return '';
  }

  // Create a map of action_id to metadata for quick lookup
  const actionMap = new Map();
  actions.forEach((action) => {
    actionMap.set(action.action_id, action.metadata);
  });

  // Sort action IDs for consistent hashing
  const sortedActionIds = [...actionIds].sort();

  // Build a deterministic string representation of all action metadata
  const metadataString = sortedActionIds
    .map((actionFullId) => {
      // Extract just the action_id part (after the delimiter)
      const parts = actionFullId.split(actionDelimiter);
      const actionId = parts[1];

      const metadata = actionMap.get(actionId);
      if (!metadata) {
        return `${actionId}:null`;
      }

      // Sort metadata keys for deterministic output
      const sortedKeys = Object.keys(metadata).sort();
      const metadataStr = sortedKeys
        .map((key) => `${key}:${JSON.stringify(metadata[key])}`)
        .join(',');
      return `${actionId}:{${metadataStr}}`;
    })
    .join(';');

  // Use Web Crypto API to generate hash
  const encoder = new TextEncoder();
  const data = encoder.encode(metadataString);
  const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
};

/**
 * Load a default agent based on the endpoint
 * @param {string} endpoint
 * @returns {Agent | null}
 */

module.exports = {
  Agent,
  getAgent,
  loadAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
  revertAgentVersion,
  updateAgentProjects,
  addAgentResourceFile,
  removeAgentResourceFiles,
  generateActionMetadataHash,
};
