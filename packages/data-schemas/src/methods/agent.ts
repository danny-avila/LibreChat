import crypto from 'node:crypto';
import type { FilterQuery, Model, Types } from 'mongoose';
import { Constants, ResourceType, actionDelimiter } from 'librechat-data-provider';
import logger from '~/config/winston';
import type { IAgent } from '~/types';

const { mcp_delimiter } = Constants;

export interface AgentDeps {
  /** Removes all ACL permissions for a resource. Injected from PermissionService. */
  removeAllPermissions: (params: { resourceType: string; resourceId: unknown }) => Promise<void>;
  /** Gets actions. Created by createActionMethods. */
  getActions: (
    searchParams: FilterQuery<unknown>,
    includeSensitive?: boolean,
  ) => Promise<unknown[]>;
}

/**
 * Extracts unique MCP server names from tools array.
 * Tools format: "toolName_mcp_serverName" or "sys__server__sys_mcp_serverName"
 */
function extractMCPServerNames(tools: string[] | undefined | null): string[] {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  const serverNames = new Set<string>();
  for (const tool of tools) {
    if (!tool || !tool.includes(mcp_delimiter)) {
      continue;
    }
    const parts = tool.split(mcp_delimiter);
    if (parts.length >= 2) {
      serverNames.add(parts[parts.length - 1]);
    }
  }
  return Array.from(serverNames);
}

/**
 * Check if a version already exists in the versions array, excluding timestamp and author fields.
 */
function isDuplicateVersion(
  updateData: Record<string, unknown>,
  currentData: Record<string, unknown>,
  versions: Record<string, unknown>[],
  actionsHash: string | null = null,
): Record<string, unknown> | null {
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
    'actionsHash',
  ];

  const { $push: _$push, $pull: _$pull, $addToSet: _$addToSet, ...directUpdates } = updateData;

  if (Object.keys(directUpdates).length === 0 && !actionsHash) {
    return null;
  }

  const wouldBeVersion = { ...currentData, ...directUpdates } as Record<string, unknown>;
  const lastVersion = versions[versions.length - 1] as Record<string, unknown>;

  if (actionsHash && lastVersion.actionsHash !== actionsHash) {
    return null;
  }

  const allFields = new Set([...Object.keys(wouldBeVersion), ...Object.keys(lastVersion)]);
  const importantFields = Array.from(allFields).filter((field) => !excludeFields.includes(field));

  let isMatch = true;
  for (const field of importantFields) {
    const wouldBeValue = wouldBeVersion[field];
    const lastVersionValue = lastVersion[field];

    if (!wouldBeValue && !lastVersionValue) {
      continue;
    }

    // Handle arrays
    if (Array.isArray(wouldBeValue) || Array.isArray(lastVersionValue)) {
      let wouldBeArr: unknown[];
      if (Array.isArray(wouldBeValue)) {
        wouldBeArr = wouldBeValue;
      } else if (wouldBeValue == null) {
        wouldBeArr = [];
      } else {
        wouldBeArr = [wouldBeValue];
      }

      let lastVersionArr: unknown[];
      if (Array.isArray(lastVersionValue)) {
        lastVersionArr = lastVersionValue;
      } else if (lastVersionValue == null) {
        lastVersionArr = [];
      } else {
        lastVersionArr = [lastVersionValue];
      }

      if (wouldBeArr.length !== lastVersionArr.length) {
        isMatch = false;
        break;
      }

      if (wouldBeArr.length > 0 && typeof wouldBeArr[0] === 'object' && wouldBeArr[0] !== null) {
        const sortedWouldBe = [...wouldBeArr].map((item) => JSON.stringify(item)).sort();
        const sortedVersion = [...lastVersionArr].map((item) => JSON.stringify(item)).sort();

        if (!sortedWouldBe.every((item, i) => item === sortedVersion[i])) {
          isMatch = false;
          break;
        }
      } else {
        const sortedWouldBe = [...wouldBeArr].sort() as string[];
        const sortedVersion = [...lastVersionArr].sort() as string[];

        if (!sortedWouldBe.every((item, i) => item === sortedVersion[i])) {
          isMatch = false;
          break;
        }
      }
    }
    // Handle objects
    else if (typeof wouldBeValue === 'object' && wouldBeValue !== null) {
      const lastVersionObj =
        typeof lastVersionValue === 'object' && lastVersionValue !== null ? lastVersionValue : {};

      const wouldBeKeys = Object.keys(wouldBeValue as Record<string, unknown>);
      const lastVersionKeys = Object.keys(lastVersionObj as Record<string, unknown>);

      if (wouldBeKeys.length === 0 && lastVersionKeys.length === 0) {
        continue;
      }

      if (JSON.stringify(wouldBeValue) !== JSON.stringify(lastVersionObj)) {
        isMatch = false;
        break;
      }
    }
    // Handle primitive values
    else {
      if (wouldBeValue !== lastVersionValue) {
        if (
          typeof wouldBeValue === 'boolean' &&
          wouldBeValue === false &&
          lastVersionValue === undefined
        ) {
          continue;
        }
        if (
          typeof wouldBeValue === 'string' &&
          wouldBeValue === '' &&
          lastVersionValue === undefined
        ) {
          continue;
        }
        isMatch = false;
        break;
      }
    }
  }

  return isMatch ? lastVersion : null;
}

/**
 * Generates a hash of action metadata for version comparison.
 */
async function generateActionMetadataHash(
  actionIds: string[] | null | undefined,
  actions: Array<{ action_id: string; metadata: Record<string, unknown> | null }>,
): Promise<string> {
  if (!actionIds || actionIds.length === 0) {
    return '';
  }

  const actionMap = new Map<string, Record<string, unknown> | null>();
  actions.forEach((action) => {
    actionMap.set(action.action_id, action.metadata);
  });

  const sortedActionIds = [...actionIds].sort();

  const metadataString = sortedActionIds
    .map((actionFullId) => {
      const parts = actionFullId.split(actionDelimiter);
      const actionId = parts[1];

      const metadata = actionMap.get(actionId);
      if (!metadata) {
        return `${actionId}:null`;
      }

      const sortedKeys = Object.keys(metadata).sort();
      const metadataStr = sortedKeys
        .map((key) => `${key}:${JSON.stringify(metadata[key])}`)
        .join(',');
      return `${actionId}:{${metadataStr}}`;
    })
    .join(';');

  const encoder = new TextEncoder();
  const data = encoder.encode(metadataString);
  const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export function createAgentMethods(mongoose: typeof import('mongoose'), deps: AgentDeps) {
  const { removeAllPermissions, getActions } = deps;

  /**
   * Create an agent with the provided data.
   */
  async function createAgent(agentData: Record<string, unknown>): Promise<IAgent> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const { author: _author, ...versionData } = agentData;
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
      category: (agentData.category as string) || 'general',
      mcpServerNames: extractMCPServerNames(agentData.tools as string[] | undefined),
    };

    return (await Agent.create(initialAgentData)).toObject() as IAgent;
  }

  /**
   * Get an agent document based on the provided search parameter.
   */
  async function getAgent(searchParameter: FilterQuery<IAgent>): Promise<IAgent | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return (await Agent.findOne(searchParameter).lean()) as IAgent | null;
  }

  /**
   * Get multiple agent documents based on the provided search parameters.
   */
  async function getAgents(searchParameter: FilterQuery<IAgent>): Promise<IAgent[]> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return (await Agent.find(searchParameter).lean()) as IAgent[];
  }

  /**
   * Update an agent with new data without overwriting existing properties,
   * or create a new agent if it doesn't exist.
   * When an agent is updated, a copy of the current state will be saved to the versions array.
   */
  async function updateAgent(
    searchParameter: FilterQuery<IAgent>,
    updateData: Record<string, unknown>,
    options: {
      updatingUserId?: string | null;
      forceVersion?: boolean;
      skipVersioning?: boolean;
    } = {},
  ): Promise<IAgent | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const { updatingUserId = null, forceVersion = false, skipVersioning = false } = options;
    const mongoOptions = { new: true, upsert: false };

    const currentAgent = await Agent.findOne(searchParameter);
    if (currentAgent) {
      const {
        __v,
        _id,
        id: __id,
        versions,
        author: _author,
        ...versionData
      } = currentAgent.toObject() as unknown as Record<string, unknown>;
      const { $push, $pull, $addToSet, ...directUpdates } = updateData;

      // Sync mcpServerNames when tools are updated
      if ((directUpdates as Record<string, unknown>).tools !== undefined) {
        const mcpServerNames = extractMCPServerNames(
          (directUpdates as Record<string, unknown>).tools as string[],
        );
        (directUpdates as Record<string, unknown>).mcpServerNames = mcpServerNames;
        updateData.mcpServerNames = mcpServerNames;
      }

      let actionsHash: string | null = null;

      // Generate actions hash if agent has actions
      if (currentAgent.actions && currentAgent.actions.length > 0) {
        const actionIds = currentAgent.actions
          .map((action: string) => {
            const parts = action.split(actionDelimiter);
            return parts[1];
          })
          .filter(Boolean);

        if (actionIds.length > 0) {
          try {
            const actions = await getActions({ action_id: { $in: actionIds } }, true);

            actionsHash = await generateActionMetadataHash(
              currentAgent.actions,
              actions as Array<{ action_id: string; metadata: Record<string, unknown> | null }>,
            );
          } catch (error) {
            logger.error('Error fetching actions for hash generation:', error);
          }
        }
      }

      const shouldCreateVersion =
        !skipVersioning &&
        (forceVersion || Object.keys(directUpdates).length > 0 || $push || $pull || $addToSet);

      if (shouldCreateVersion) {
        const duplicateVersion = isDuplicateVersion(
          updateData,
          versionData,
          versions as Record<string, unknown>[],
          actionsHash,
        );
        if (duplicateVersion && !forceVersion) {
          const agentObj = currentAgent.toObject() as IAgent & {
            version?: number;
            versions?: unknown[];
          };
          agentObj.version = (versions as unknown[]).length;
          return agentObj;
        }
      }

      const versionEntry: Record<string, unknown> = {
        ...versionData,
        ...directUpdates,
        updatedAt: new Date(),
      };

      if (actionsHash) {
        versionEntry.actionsHash = actionsHash;
      }

      if (updatingUserId) {
        versionEntry.updatedBy = new mongoose.Types.ObjectId(updatingUserId);
      }

      if (shouldCreateVersion) {
        updateData.$push = {
          ...(($push as Record<string, unknown>) || {}),
          versions: versionEntry,
        };
      }
    }

    return (await Agent.findOneAndUpdate(
      searchParameter,
      updateData,
      mongoOptions,
    ).lean()) as IAgent | null;
  }

  /**
   * Modifies an agent with the resource file id.
   */
  async function addAgentResourceFile({
    agent_id,
    tool_resource,
    file_id,
    updatingUserId,
  }: {
    agent_id: string;
    tool_resource: string;
    file_id: string;
    updatingUserId?: string;
  }): Promise<IAgent> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const searchParameter = { id: agent_id };
    const agent = await getAgent(searchParameter);
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

    const updateDataObj: Record<string, unknown> = {
      $addToSet: {
        tools: tool_resource,
        [fileIdsPath]: file_id,
      },
    };

    const updatedAgent = await updateAgent(searchParameter, updateDataObj, {
      updatingUserId,
    });
    if (updatedAgent) {
      return updatedAgent;
    } else {
      throw new Error('Agent not found for adding resource file');
    }
  }

  /**
   * Removes multiple resource files from an agent using atomic operations.
   */
  async function removeAgentResourceFiles({
    agent_id,
    files,
  }: {
    agent_id: string;
    files: Array<{ tool_resource: string; file_id: string }>;
  }): Promise<IAgent> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const searchParameter = { id: agent_id };

    const filesByResource = files.reduce(
      (acc: Record<string, string[]>, { tool_resource, file_id }) => {
        if (!acc[tool_resource]) {
          acc[tool_resource] = [];
        }
        acc[tool_resource].push(file_id);
        return acc;
      },
      {},
    );

    const pullAllOps: Record<string, string[]> = {};
    for (const [resource, fileIds] of Object.entries(filesByResource)) {
      const fileIdsPath = `tool_resources.${resource}.file_ids`;
      pullAllOps[fileIdsPath] = fileIds;
    }

    const updatePullData = { $pullAll: pullAllOps };
    const agentAfterPull = (await Agent.findOneAndUpdate(searchParameter, updatePullData, {
      new: true,
    }).lean()) as IAgent | null;

    if (!agentAfterPull) {
      const agentExists = await getAgent(searchParameter);
      if (!agentExists) {
        throw new Error('Agent not found for removing resource files');
      }
      throw new Error('Failed to update agent during file removal (pull step)');
    }

    return agentAfterPull;
  }

  /**
   * Deletes an agent based on the provided search parameter.
   */
  async function deleteAgent(searchParameter: FilterQuery<IAgent>): Promise<IAgent | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const User = mongoose.models.User as Model<unknown>;
    const agent = await Agent.findOneAndDelete(searchParameter);
    if (agent) {
      await Promise.all([
        removeAllPermissions({
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
        }),
        removeAllPermissions({
          resourceType: ResourceType.REMOTE_AGENT,
          resourceId: agent._id,
        }),
      ]);
      try {
        await Agent.updateMany(
          { 'edges.to': (agent as unknown as { id: string }).id },
          { $pull: { edges: { to: (agent as unknown as { id: string }).id } } },
        );
      } catch (error) {
        logger.error('[deleteAgent] Error removing agent from handoff edges', error);
      }
      try {
        await User.updateMany(
          { 'favorites.agentId': (agent as unknown as { id: string }).id },
          { $pull: { favorites: { agentId: (agent as unknown as { id: string }).id } } },
        );
      } catch (error) {
        logger.error('[deleteAgent] Error removing agent from user favorites', error);
      }
    }
    return agent ? (agent.toObject() as IAgent) : null;
  }

  /**
   * Deletes all agents created by a specific user.
   */
  async function deleteUserAgents(userId: string): Promise<void> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const AclEntry = mongoose.models.AclEntry as Model<unknown>;
    const User = mongoose.models.User as Model<unknown>;

    try {
      const userAgents = await getAgents({ author: userId });

      if (userAgents.length === 0) {
        return;
      }

      const agentIds = userAgents.map((agent) => agent.id);
      const agentObjectIds = userAgents.map(
        (agent) => (agent as unknown as { _id: Types.ObjectId })._id,
      );

      await AclEntry.deleteMany({
        resourceType: { $in: [ResourceType.AGENT, ResourceType.REMOTE_AGENT] },
        resourceId: { $in: agentObjectIds },
      });

      try {
        await User.updateMany(
          { 'favorites.agentId': { $in: agentIds } },
          { $pull: { favorites: { agentId: { $in: agentIds } } } },
        );
      } catch (error) {
        logger.error('[deleteUserAgents] Error removing agents from user favorites', error);
      }

      await Agent.deleteMany({ author: userId });
    } catch (error) {
      logger.error('[deleteUserAgents] General error:', error);
    }
  }

  /**
   * Get agents by accessible IDs with optional cursor-based pagination.
   */
  async function getListAgentsByAccess({
    accessibleIds = [],
    otherParams = {},
    limit = null,
    after = null,
  }: {
    accessibleIds?: Types.ObjectId[];
    otherParams?: Record<string, unknown>;
    limit?: number | null;
    after?: string | null;
  }): Promise<{
    object: string;
    data: Array<Record<string, unknown>>;
    first_id: string | null;
    last_id: string | null;
    has_more: boolean;
    after: string | null;
  }> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const isPaginated = limit !== null && limit !== undefined;
    const normalizedLimit = isPaginated
      ? Math.min(Math.max(1, parseInt(String(limit)) || 20), 100)
      : null;

    const baseQuery: Record<string, unknown> = {
      ...otherParams,
      _id: { $in: accessibleIds },
    };

    if (after) {
      try {
        const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
        const { updatedAt, _id } = cursor;

        const cursorCondition = {
          $or: [
            { updatedAt: { $lt: new Date(updatedAt) } },
            {
              updatedAt: new Date(updatedAt),
              _id: { $gt: new mongoose.Types.ObjectId(_id) },
            },
          ],
        };

        if (Object.keys(baseQuery).length > 0) {
          baseQuery.$and = [{ ...baseQuery }, cursorCondition];
          Object.keys(baseQuery).forEach((key) => {
            if (key !== '$and') delete baseQuery[key];
          });
        } else {
          Object.assign(baseQuery, cursorCondition);
        }
      } catch (error) {
        logger.warn('Invalid cursor:', (error as Error).message);
      }
    }

    let query = Agent.find(baseQuery, {
      id: 1,
      _id: 1,
      name: 1,
      avatar: 1,
      author: 1,
      description: 1,
      updatedAt: 1,
      category: 1,
      support_contact: 1,
      is_promoted: 1,
    }).sort({ updatedAt: -1, _id: 1 });

    if (isPaginated && normalizedLimit) {
      query = query.limit(normalizedLimit + 1);
    }

    const agents = (await query.lean()) as Array<Record<string, unknown>>;

    const hasMore = isPaginated && normalizedLimit ? agents.length > normalizedLimit : false;
    const data = (isPaginated && normalizedLimit ? agents.slice(0, normalizedLimit) : agents).map(
      (agent) => {
        if (agent.author) {
          agent.author = (agent.author as Types.ObjectId).toString();
        }
        return agent;
      },
    );

    let nextCursor: string | null = null;
    if (isPaginated && hasMore && data.length > 0 && normalizedLimit) {
      const lastAgent = agents[normalizedLimit - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          updatedAt: (lastAgent.updatedAt as Date).toISOString(),
          _id: (lastAgent._id as Types.ObjectId).toString(),
        }),
      ).toString('base64');
    }

    return {
      object: 'list',
      data,
      first_id: data.length > 0 ? (data[0].id as string) : null,
      last_id: data.length > 0 ? (data[data.length - 1].id as string) : null,
      has_more: hasMore,
      after: nextCursor,
    };
  }

  /**
   * Reverts an agent to a specific version in its version history.
   */
  async function revertAgentVersion(
    searchParameter: FilterQuery<IAgent>,
    versionIndex: number,
  ): Promise<IAgent> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const agent = await Agent.findOne(searchParameter);
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.versions || !agent.versions[versionIndex]) {
      throw new Error(`Version ${versionIndex} not found`);
    }

    const revertToVersion = { ...(agent.versions[versionIndex] as Record<string, unknown>) };
    delete revertToVersion._id;
    delete revertToVersion.id;
    delete revertToVersion.versions;
    delete revertToVersion.author;
    delete revertToVersion.updatedBy;

    return (await Agent.findOneAndUpdate(searchParameter, revertToVersion, {
      new: true,
    }).lean()) as IAgent;
  }

  /**
   * Counts the number of promoted agents.
   */
  async function countPromotedAgents(): Promise<number> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return await Agent.countDocuments({ is_promoted: true });
  }

  return {
    createAgent,
    getAgent,
    getAgents,
    updateAgent,
    deleteAgent,
    deleteUserAgents,
    revertAgentVersion,
    countPromotedAgents,
    addAgentResourceFile,
    removeAgentResourceFiles,
    getListAgentsByAccess,
    generateActionMetadataHash,
  };
}

export type AgentMethods = ReturnType<typeof createAgentMethods>;
