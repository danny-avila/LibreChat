const mongoose = require('mongoose');
const crypto = require('node:crypto');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const {
  SystemRoles,
  Tools,
  actionDelimiter,
  EToolResources,
  FileSources,
  FileContext,
} = require('librechat-data-provider');
const { GLOBAL_PROJECT_NAME, EPHEMERAL_AGENT_ID, mcp_delimiter, SYSTEM_USER_ID } =
  require('librechat-data-provider').Constants;
const { CONFIG_STORE, STARTUP_CONFIG } = require('librechat-data-provider').CacheKeys;
const {
  getProjectByName,
  addAgentIdsToProject,
  removeAgentIdsFromProject,
  removeAgentFromAllProjects,
} = require('./Project');
const { getCachedTools } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');
const { getActions } = require('./Action');
const { Agent } = require('~/db/models');
const { createFile, getFiles, deleteFiles } = require('./File');

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
 * Process files for a tool resource from YAML configuration
 * @param {Object} toolResourceFiles - Files configuration from YAML
 * @param {string} toolResourceType - Type of tool resource (file_search, execute_code, ocr)
 * @param {string} agentId - Agent ID for logging purposes
 * @returns {Promise<Object>} Object with file_ids array and files array
 */
const processToolResourceFiles = async (
  toolResourceFiles,
  toolResourceType,
  agentId,
  systemAuthorId,
) => {
  const fileIds = [];
  const files = [];

  if (!toolResourceFiles || !Array.isArray(toolResourceFiles)) {
    return { file_ids: fileIds, files };
  }

  for (const fileConfig of toolResourceFiles) {
    try {
      const { filepath, filename, description } = fileConfig;

      // Check if file exists
      const absolutePath = path.isAbsolute(filepath)
        ? filepath
        : path.resolve(process.cwd(), filepath);

      try {
        await fs.access(absolutePath);
      } catch (error) {
        logger.warn(`File not found for agent ${agentId}: ${absolutePath}`, error);
        continue;
      }

      // Get current file stats
      const stats = await fs.stat(absolutePath);
      const currentSize = stats.size;
      const currentMtime = stats.mtime.getTime();

      // Determine filename early for file lookup
      const actualFilename = filename || path.basename(filepath);

      // Check if file already exists in database by filepath AND context
      const existingFiles = await getFiles({
        filepath: absolutePath,
        context: FileContext.agents,
      });

      // Also check for files that have been embedded (source: vectordb) with same filename
      const embeddedFiles = await getFiles({
        filename: actualFilename,
        context: FileContext.agents,
        source: FileSources.vectordb,
      });

      let existingFile = null;
      if (existingFiles.length > 0) {
        existingFile = existingFiles[0];
      } else if (embeddedFiles.length > 0) {
        existingFile = embeddedFiles[0];
      }

      if (existingFile) {
        // Check if file has been modified (only for local files, not embedded ones)
        const shouldCheckModification = existingFile.source !== FileSources.vectordb;
        let fileChanged = false;

        if (shouldCheckModification) {
          const dbSize = existingFile.bytes;
          const dbMtime = existingFile.updatedAt ? new Date(existingFile.updatedAt).getTime() : 0;
          fileChanged = currentSize !== dbSize || currentMtime > dbMtime;
        }

        if (!fileChanged) {
          // File unchanged or already embedded, reuse existing
          fileIds.push(existingFile.file_id);
          files.push(existingFile);
          const status = existingFile.source === FileSources.vectordb ? 'embedded' : 'unchanged';
          logger.info(
            `Reusing ${status} file for agent ${agentId} (${toolResourceType}): ${existingFile.filename}`,
          );
          continue;
        } else {
          // File changed, need to update
          logger.info(
            `File changed for agent ${agentId} (${toolResourceType}): ${existingFile.filename} - re-processing`,
          );

          // Delete old file record and create new one
          await deleteFiles([existingFile.file_id]);
        }
      }

      // Create new file record (either first time or file changed)
      const fileId = uuidv4();

      // Determine file type
      const mimeType = mime.getType(actualFilename) || 'application/octet-stream';

      // Create file record in database
      const fileInfo = {
        user: systemAuthorId, // YAML-defined files are system files with proper ObjectId
        file_id: fileId,
        bytes: currentSize,
        filepath: absolutePath,
        filename: actualFilename,
        context: FileContext.agents,
        type: mimeType,
        embedded: toolResourceType === EToolResources.file_search, // Auto-embed for file_search
        source: FileSources.local,
        description: description || null,
      };

      const dbFile = await createFile(fileInfo, true);

      // Note: YAML agent files are stored but not automatically embedded
      // They will be embedded when first accessed by a user with proper authentication
      if (toolResourceType === EToolResources.file_search) {
        logger.info(`File stored for future embedding: ${actualFilename} (agent: ${agentId})`);
      }

      fileIds.push(fileId);
      files.push(dbFile);

      logger.info(`Processed file for agent ${agentId} (${toolResourceType}): ${actualFilename}`);
    } catch (error) {
      logger.error(`Error processing file for agent ${agentId}:`, error);
    }
  }

  return { file_ids: fileIds, files };
};

/**
 * Sync YAML agents with database, creating/updating/deleting as needed
 * @returns {Promise<void>}
 */
const syncYamlAgents = async () => {
  try {
    const cache = getLogStores(CONFIG_STORE);
    const customConfig = await cache.get('customConfig');

    if (!customConfig?.endpoints?.agents?.definitions) {
      // No YAML agents defined, remove any existing ones
      await Agent.deleteMany({ isYamlDefined: true });
      logger.info('No YAML agents defined, removed any existing YAML agents from database');
      return;
    }

    const configTimestamp = customConfig._timestamp || Date.now();

    // Helper function to resolve project names to ObjectIds
    const resolveProjectIds = async (projectNames) => {
      const projectIds = [];
      for (const projectName of projectNames) {
        try {
          const project = await getProjectByName(projectName, '_id');
          projectIds.push(project._id);
        } catch (error) {
          if (projectName === GLOBAL_PROJECT_NAME) {
            // Global project is required, create placeholder if not found
            logger.warn(
              'Could not find global project for YAML agents, creating placeholder ObjectId',
              error,
            );
            projectIds.push(new mongoose.Types.ObjectId());
          } else {
            logger.warn(`Project "${projectName}" not found for YAML agent, skipping`, error);
          }
        }
      }
      return projectIds;
    };

    // Create a consistent system author ObjectId for all YAML agents
    const systemAuthorId = new mongoose.Types.ObjectId(SYSTEM_USER_ID);

    const yamlAgentIds = [];

    for (const agentDef of customConfig.endpoints.agents.definitions) {
      try {
        yamlAgentIds.push(agentDef.id);

        // Process tool resources and files
        const tool_resources = {};

        if (agentDef.tool_resources) {
          // Process file_search files
          if (agentDef.tool_resources.file_search?.files) {
            const result = await processToolResourceFiles(
              agentDef.tool_resources.file_search.files,
              EToolResources.file_search,
              agentDef.id,
              systemAuthorId,
            );
            if (result.file_ids.length > 0) {
              tool_resources[EToolResources.file_search] = result;
            }
          }

          // Process execute_code files
          if (agentDef.tool_resources.execute_code?.files) {
            const result = await processToolResourceFiles(
              agentDef.tool_resources.execute_code.files,
              EToolResources.execute_code,
              agentDef.id,
              systemAuthorId,
            );
            if (result.file_ids.length > 0) {
              tool_resources[EToolResources.execute_code] = result;
            }
          }

          // Process OCR files
          if (agentDef.tool_resources.ocr?.files) {
            const result = await processToolResourceFiles(
              agentDef.tool_resources.ocr.files,
              EToolResources.ocr,
              agentDef.id,
              systemAuthorId,
            );
            if (result.file_ids.length > 0) {
              tool_resources[EToolResources.ocr] = result;
            }
          }
        }

        // Automatically add tools based on tool_resources
        const tools = [...(agentDef.tools || [])];
        if (
          tool_resources[EToolResources.file_search] &&
          !tools.includes(EToolResources.file_search)
        ) {
          tools.push(EToolResources.file_search);
        }
        if (
          tool_resources[EToolResources.execute_code] &&
          !tools.includes(EToolResources.execute_code)
        ) {
          tools.push(EToolResources.execute_code);
        }

        // Determine which projects this agent should belong to
        let projectNames = [];
        if (agentDef.projects) {
          if (Array.isArray(agentDef.projects)) {
            // Multiple projects specified
            projectNames = agentDef.projects;
          } else if (typeof agentDef.projects === 'string') {
            // Single project specified
            projectNames = [agentDef.projects];
          }
        } else {
          // Default to global project
          projectNames = [GLOBAL_PROJECT_NAME];
        }

        // Resolve project names to ObjectIds
        const projectIds = await resolveProjectIds(projectNames);

        if (projectIds.length === 0) {
          logger.warn(`No valid projects found for YAML agent ${agentDef.id}, skipping`);
          continue;
        }

        // Transform YAML agent definition to match the Agent model structure
        const agentData = {
          id: agentDef.id,
          name: agentDef.name || agentDef.id,
          description: agentDef.description || null,
          instructions: agentDef.instructions || null,
          avatar: agentDef.avatar || null,
          provider: agentDef.provider,
          model: agentDef.model,
          model_parameters: agentDef.model_parameters || {},
          tools,
          tool_resources,
          actions: agentDef.actions || [],
          agent_ids: agentDef.agent_ids || [],
          artifacts: agentDef.artifacts || null,
          recursion_limit: agentDef.recursion_limit || null,
          end_after_tools: agentDef.end_after_tools || false,
          hide_sequential_outputs: agentDef.hide_sequential_outputs || false,
          conversation_starters: agentDef.conversation_starters || [],
          isCollaborative: agentDef.isCollaborative || false,
          // Mark as YAML-defined for identification
          isYamlDefined: true,
          // Set as system agent with proper ObjectIds
          author: systemAuthorId,
          authorName: 'System',
          created_at: Date.now(),
          projectIds: projectIds,
          versions: [],
          yamlConfigTimestamp: configTimestamp,
        };

        // Upsert agent to database
        await Agent.findOneAndUpdate({ id: agentDef.id, isYamlDefined: true }, agentData, {
          upsert: true,
        });

        logger.debug(`Synced YAML agent to database: ${agentDef.id}`);
      } catch (error) {
        logger.error(`Error syncing YAML agent ${agentDef.id}:`, error);
      }
    }

    // Remove YAML agents that no longer exist in config
    const deleteResult = await Agent.deleteMany({
      isYamlDefined: true,
      id: { $nin: yamlAgentIds },
    });

    if (deleteResult.deletedCount > 0) {
      logger.info(`Removed ${deleteResult.deletedCount} YAML agents no longer in config`);
    }

    // Sync YAML agents with their configured projects
    try {
      // Get all current YAML agents (just their IDs)
      const currentYamlAgents = await Agent.find(
        {
          isYamlDefined: true,
        },
        { id: 1 },
      ).lean();

      // Get current project assignments from Project.agentIds (source of truth)
      const { Project } = require('~/db/models');
      const allProjects = await Project.find({}, { _id: 1, agentIds: 1 }).lean();

      // Create a map of current agent -> project assignments based on Project.agentIds
      const currentAssignments = new Map();

      // Initialize all YAML agents with empty arrays
      currentYamlAgents.forEach((agent) => {
        currentAssignments.set(agent.id, []);
      });

      // Populate assignments based on Project.agentIds
      allProjects.forEach((project) => {
        const projectId = project._id.toString();
        if (project.agentIds && Array.isArray(project.agentIds)) {
          project.agentIds.forEach((agentId) => {
            if (currentAssignments.has(agentId)) {
              currentAssignments.get(agentId).push(projectId);
            }
          });
        }
      });

      // Track desired assignments for new agents
      const desiredAssignments = new Map();

      // Process each agent definition to determine desired project assignments
      for (const agentDef of customConfig.endpoints.agents.definitions) {
        let projectNames = [];
        if (agentDef.projects) {
          if (Array.isArray(agentDef.projects)) {
            projectNames = agentDef.projects;
          } else if (typeof agentDef.projects === 'string') {
            projectNames = [agentDef.projects];
          }
        } else {
          projectNames = [GLOBAL_PROJECT_NAME];
        }

        const projectIds = await resolveProjectIds(projectNames);
        desiredAssignments.set(
          agentDef.id,
          projectIds.map((id) => id.toString()),
        );
      }

      // Sync each agent's project assignments
      for (const [agentId, desiredProjects] of desiredAssignments) {
        const currentProjects = currentAssignments.get(agentId) || [];

        // Find projects to add and remove
        const projectsToAdd = desiredProjects.filter((p) => !currentProjects.includes(p));
        const projectsToRemove = currentProjects.filter((p) => !desiredProjects.includes(p));

        logger.info(
          `YAML Agent ${agentId} projects: current=${JSON.stringify(currentProjects)}, desired=${JSON.stringify(desiredProjects)}`,
        );
        if (projectsToAdd.length > 0) {
          logger.info(`  → Adding ${agentId} to projects: ${JSON.stringify(projectsToAdd)}`);
        }
        if (projectsToRemove.length > 0) {
          logger.info(`  → Removing ${agentId} from projects: ${JSON.stringify(projectsToRemove)}`);
        }

        // Update project assignments
        for (const projectId of projectsToRemove) {
          try {
            await removeAgentIdsFromProject(projectId, [agentId]);
          } catch (error) {
            logger.warn(`Failed to remove agent ${agentId} from project ${projectId}:`, error);
          }
        }

        for (const projectId of projectsToAdd) {
          try {
            await addAgentIdsToProject(projectId, [agentId]);
          } catch (error) {
            logger.warn(`Failed to add agent ${agentId} to project ${projectId}:`, error);
          }
        }

        if (projectsToAdd.length > 0 || projectsToRemove.length > 0) {
          logger.info(
            `Updated project assignments for YAML agent ${agentId}: +${projectsToAdd.length} -${projectsToRemove.length}`,
          );
        }
      }

      // Remove orphaned YAML agents from all projects
      const removedAgentIds = currentYamlAgents
        .map((agent) => agent.id)
        .filter((id) => !yamlAgentIds.includes(id));

      for (const agentId of removedAgentIds) {
        const projectIds = currentAssignments.get(agentId) || [];
        for (const projectId of projectIds) {
          try {
            await removeAgentIdsFromProject(projectId, [agentId]);
          } catch (error) {
            logger.warn(
              `Failed to remove deleted agent ${agentId} from project ${projectId}:`,
              error,
            );
          }
        }
        if (projectIds.length > 0) {
          logger.info(`Removed deleted YAML agent ${agentId} from ${projectIds.length} projects`);
        }
      }
    } catch (error) {
      logger.error('Error syncing YAML agents with projects:', error);
    }

    logger.info(`Synced ${yamlAgentIds.length} YAML agents to database`);
  } catch (error) {
    logger.error('Error syncing YAML agents:', error);
  }
};

/**
 * Get an agent by ID from database
 * @param {Object} searchParameter - The search parameters to find the agent
 * @returns {Promise<Agent|null>} The agent document as a plain object, or null if not found
 */
const getAgent = async (searchParameter) => {
  return Agent.findOne(searchParameter).lean();
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
const loadEphemeralAgent = async ({ req, agent_id, endpoint, model_parameters: _m }) => {
  const { model, ...model_parameters } = _m;
  /** @type {Record<string, FunctionTool>} */
  const availableTools = await getCachedTools({ includeGlobal: true });
  /** @type {TEphemeralAgent | null} */
  const ephemeralAgent = req.body.ephemeralAgent;
  const mcpServers = new Set(ephemeralAgent?.mcp);
  /** @type {string[]} */
  const tools = [];
  if (ephemeralAgent?.execute_code === true) {
    tools.push(Tools.execute_code);
  }
  if (ephemeralAgent?.file_search === true) {
    tools.push(Tools.file_search);
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
  const result = {
    id: agent_id,
    instructions,
    provider: endpoint,
    model_parameters,
    model,
    tools,
  };

  if (ephemeralAgent?.artifacts != null && ephemeralAgent.artifacts) {
    result.artifacts = ephemeralAgent.artifacts;
  }
  return result;
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
    return await loadEphemeralAgent({ req, agent_id, endpoint, model_parameters });
  }
  const agent = await getAgent({
    id: agent_id,
  });

  if (!agent) {
    logger.info(`Agent ${agent_id} not found`);
    return null;
  }

  agent.version = agent.versions ? agent.versions.length : 0;

  if (agent.author.toString() === req.user.id) {
    return agent;
  }

  if (!agent.projectIds) {
    logger.info(`Agent ${agent.id} has no projectIds`);
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
 * @param {boolean} [options.skipVersioning] - Skip version creation entirely (useful for isolated operations like sharing).
 * @returns {Promise<Agent>} The updated or newly created agent document as a plain object.
 * @throws {Error} If the update would create a duplicate version
 */
const updateAgent = async (searchParameter, updateData, options = {}) => {
  const { updatingUserId = null, forceVersion = false, skipVersioning = false } = options;
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
      !skipVersioning &&
      (forceVersion || Object.keys(directUpdates).length > 0 || $push || $pull || $addToSet);

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

    if (shouldCreateVersion) {
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
      isYamlDefined: 1,
    }).lean()
  ).map((agent) => {
    if (agent.author?.toString() !== author && agent.author?.toString() !== SYSTEM_USER_ID) {
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

  const updatedAgent = await updateAgent(updateQuery, updateOps, {
    updatingUserId: user.id,
    skipVersioning: true,
  });
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

module.exports = {
  createAgent,
  getAgent,
  loadAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
  updateAgentProjects,
  addAgentResourceFile,
  removeAgentResourceFiles,
  generateActionMetadataHash,
  revertAgentVersion,
  syncYamlAgents,
};
