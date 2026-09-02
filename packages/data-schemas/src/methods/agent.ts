import crypto from 'node:crypto';
import {
  Constants,
  EToolResources,
  ResourceType,
  actionDelimiter,
  isActionTool,
} from 'librechat-data-provider';
import type { FilterQuery, Model, PipelineStage, ProjectionType, Types } from 'mongoose';
import type { AgentToolResources } from 'librechat-data-provider';
import type { IAgent, IAclEntry, ActionQuery } from '~/types';
import { withCodeEnvironmentReference } from './codeEnvironment';
import { filterExistingSkillIds } from './skill';
import logger from '~/config/winston';

const { mcp_delimiter } = Constants;

/**
 * Mirrors `TOOL_RESOURCE_KEYS` in `@librechat/api` — the subset of
 * `EToolResources` that actually carries `file_ids` on an agent document.
 * `code_interpreter` is excluded (it belongs to the Assistants API, not
 * `AgentToolResources`) to avoid emitting dead MongoDB clauses.
 */
const TOOL_RESOURCE_KEYS: ReadonlyArray<keyof AgentToolResources> = [
  EToolResources.execute_code,
  EToolResources.file_search,
  EToolResources.image_edit,
  EToolResources.context,
  EToolResources.ocr,
];

/** Builds an atomic update that prunes deleted IDs without discarding surviving edge members. */
function createEdgeCleanupPipeline(agentIds: string[]): PipelineStage[] {
  const cleanEndpoint = (endpoint: string) => ({
    $cond: [
      { $isArray: endpoint },
      {
        $filter: {
          input: endpoint,
          as: 'agentId',
          cond: { $not: [{ $in: ['$$agentId', agentIds] }] },
        },
      },
      { $cond: [{ $in: [endpoint, agentIds] }, null, endpoint] },
    ],
  });
  const hasEndpoint = (endpoint: string) => ({
    $cond: [{ $isArray: endpoint }, { $gt: [{ $size: endpoint }, 0] }, { $ne: [endpoint, null] }],
  });

  return [
    {
      $set: {
        edges: {
          $filter: {
            input: {
              $map: {
                input: { $ifNull: ['$edges', []] },
                as: 'edge',
                in: {
                  $let: {
                    vars: {
                      cleanedFrom: cleanEndpoint('$$edge.from'),
                      cleanedTo: cleanEndpoint('$$edge.to'),
                    },
                    in: {
                      $cond: [
                        {
                          $and: [hasEndpoint('$$cleanedFrom'), hasEndpoint('$$cleanedTo')],
                        },
                        {
                          $mergeObjects: [
                            '$$edge',
                            {
                              from: '$$cleanedFrom',
                              to: '$$cleanedTo',
                            },
                          ],
                        },
                        null,
                      ],
                    },
                  },
                },
              },
            },
            as: 'edge',
            cond: { $ne: ['$$edge', null] },
          },
        },
      },
    },
  ];
}

/** Removes deleted agent references from active graphs in the requested tenant. */
async function removeAgentIdsFromEdges(
  Agent: Model<IAgent>,
  agentIds: string[],
  tenantId?: string,
): Promise<void> {
  if (agentIds.length === 0) {
    return;
  }

  await Agent.updateMany(
    {
      ...(tenantId !== undefined ? { tenantId } : {}),
      $or: [{ 'edges.from': { $in: agentIds } }, { 'edges.to': { $in: agentIds } }],
    },
    createEdgeCleanupPipeline(agentIds),
  );
}

export interface AgentDeps {
  /** Removes all ACL permissions for a resource. Injected from PermissionService. */
  removeAllPermissions: (params: { resourceType: string; resourceId: unknown }) => Promise<void>;
  /** Gets actions. Created by createActionMethods. */
  getActions: (query: ActionQuery, includeSensitive?: boolean) => Promise<unknown[]>;
  /** Returns resource IDs solely owned by the given user. From createAclEntryMethods. */
  getSoleOwnedResourceIds: (
    userObjectId: Types.ObjectId,
    resourceTypes: string | string[],
  ) => Promise<Types.ObjectId[]>;
  /** Recognizes skill IDs supplied by an external, non-database registry. */
  isExternalSkillId?: (id: string) => boolean;
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
    if (!tool || !tool.includes(mcp_delimiter) || isActionTool(tool)) {
      continue;
    }
    const parts = tool.split(mcp_delimiter);
    /** This index only grants DB-backed servers (`ServerConfigsDB.getAccessibleServers`),
     * and DB server names are slugs that cannot contain the delimiter
     * (`generateServerNameFromTitle` strips underscores), so the last segment is always
     * the real server for those. A config server whose own name contains the delimiter
     * yields a trailing segment that is not its name; resolving that needs the configured
     * server list, which is unavailable here - see #14449. */
    if (parts.length >= 2) {
      serverNames.add(parts[parts.length - 1]);
    }
  }
  return Array.from(serverNames);
}

/**
 * Rebuilds an agent's MCP server index across a tools update without re-deriving
 * names from the keys.
 *
 * A name already on the agent was resolved against the registry when it was
 * stored, so it is authoritative; it carries forward while some retained tool
 * still resolves to it. Only keys that match none of them fall back to the
 * ambiguous trailing-segment derivation, which cannot tell a config server's
 * suffix from a real DB server name.
 */
function rebuildMCPServerNames(tools: string[] | undefined | null, priorNames: string[]): string[] {
  if (priorNames.length === 0) {
    return extractMCPServerNames(tools);
  }

  const retained = new Set<string>();
  const unmatched: string[] = [];
  for (const tool of tools ?? []) {
    if (!tool || !tool.includes(mcp_delimiter) || isActionTool(tool)) {
      continue;
    }
    const match = priorNames
      .filter((name) => tool.endsWith(`${mcp_delimiter}${name}`))
      .sort((a, b) => b.length - a.length)[0];
    if (match) {
      retained.add(match);
    } else {
      unmatched.push(tool);
    }
  }

  for (const name of extractMCPServerNames(unmatched)) {
    retained.add(name);
  }
  return Array.from(retained);
}

const hasOperatorKeys = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && Object.keys(value as object).length > 0;

/** Resolves a dotted operator path, such as `tool_resources.file_search.file_ids`. */
function resolveDocumentPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current =
      current instanceof Map ? current.get(segment) : (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Removes a dotted operator path from an in-memory version projection. */
function deleteDocumentPath(source: Record<string, unknown>, path: string): void {
  const segments = path.split('.');
  const leaf = segments.pop();
  if (leaf == null) return;
  let current: Record<string, unknown> = source;
  for (const segment of segments) {
    const next = current[segment];
    if (typeof next !== 'object' || next === null || next instanceof Map) return;
    current = next as Record<string, unknown>;
  }
  delete current[leaf];
}

/** The values an `$addToSet` specification would add, flattening the `$each` form. */
function addToSetCandidates(spec: unknown): unknown[] {
  if (
    typeof spec === 'object' &&
    spec !== null &&
    Array.isArray((spec as { $each?: unknown }).$each)
  ) {
    return (spec as { $each: unknown[] }).$each;
  }
  return [spec];
}

/**
 * Whether an update's atomic operators can still change the stored document. `$push`
 * always appends and `$pull` matches on arbitrary query criteria, so both count as
 * mutating. `$addToSet` is a no-op once every value it adds is already stored, which is
 * exactly what an idempotent retry looks like, so it is resolved against the document.
 * Whatever cannot be compared cheaply counts as mutating: over-reporting only records a
 * redundant version, while under-reporting would apply a change no version records.
 */
function operatorsMutateDocument(
  currentObject: Record<string, unknown>,
  $push: unknown,
  $pull: unknown,
  $addToSet: unknown,
  $unset: unknown,
): boolean {
  if (hasOperatorKeys($push) || hasOperatorKeys($pull)) {
    return true;
  }

  if (hasOperatorKeys($unset)) {
    for (const path of Object.keys($unset as Record<string, unknown>)) {
      if (resolveDocumentPath(currentObject, path) !== undefined) return true;
    }
  }

  if (!hasOperatorKeys($addToSet)) {
    return false;
  }

  for (const [path, spec] of Object.entries($addToSet as Record<string, unknown>)) {
    const existing = resolveDocumentPath(currentObject, path);
    const stored = Array.isArray(existing) ? existing : [];
    for (const candidate of addToSetCandidates(spec)) {
      if (typeof candidate === 'object' && candidate !== null) {
        return true;
      }
      if (!stored.includes(candidate)) {
        return true;
      }
    }
  }

  return false;
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

  const {
    $push: _$push,
    $pull: _$pull,
    $addToSet: _$addToSet,
    $unset,
    ...directUpdates
  } = updateData;

  if (Object.keys(directUpdates).length === 0 && !hasOperatorKeys($unset) && !actionsHash) {
    return null;
  }

  const wouldBeVersion = { ...currentData, ...directUpdates } as Record<string, unknown>;
  if (hasOperatorKeys($unset)) {
    for (const path of Object.keys($unset as Record<string, unknown>)) {
      deleteDocumentPath(wouldBeVersion, path);
    }
  }
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

export function createAgentMethods(
  mongoose: typeof import('mongoose'),
  deps: AgentDeps,
): {
  getAgent: (
    searchParameter: FilterQuery<IAgent>,
    projection?: ProjectionType<IAgent>,
  ) => Promise<IAgent | null>;
  getAgentVersions: (searchParameter: FilterQuery<IAgent>) => Promise<IAgent['versions'] | null>;
  getAgentWithVersionCount: (
    searchParameter: FilterQuery<IAgent>,
  ) => Promise<(IAgent & { version: number }) | null>;
  getAgents: (
    searchParameter: FilterQuery<IAgent>,
    select?: string | Record<string, number>,
  ) => Promise<IAgent[]>;
  createAgent: (agentData: Record<string, unknown>) => Promise<IAgent>;
  getAgentIdsByMCPServerName: (serverName: string) => Promise<Types.ObjectId[]>;
  getAgentsWithMCPServerNames: () => Promise<Array<Pick<IAgent, '_id' | 'mcpServerNames'>>>;
  updateAgent: (
    searchParameter: FilterQuery<IAgent>,
    updateData: Record<string, unknown>,
    options?: {
      updatingUserId?: string | null;
      forceVersion?: boolean;
      skipVersioning?: boolean;
    },
  ) => Promise<IAgent | null>;
  deleteAgent: (searchParameter: FilterQuery<IAgent>) => Promise<IAgent | null>;
  deleteUserAgents: (userId: string) => Promise<void>;
  revertAgentVersion: (
    searchParameter: FilterQuery<IAgent>,
    versionIndex: number,
  ) => Promise<IAgent>;
  countPromotedAgents: () => Promise<number>;
  addAgentResourceFile: ({
    agent_id,
    tool_resource,
    file_id,
    updatingUserId,
  }: {
    agent_id: string;
    tool_resource: string;
    file_id: string;
    updatingUserId?: string;
  }) => Promise<IAgent>;
  getListAgentsByAccess: ({
    accessibleIds,
    otherParams,
    limit,
    after,
    includeSkillConfig,
  }: {
    accessibleIds?: Types.ObjectId[];
    otherParams?: Record<string, unknown>;
    limit?: number | null;
    after?: string | null;
    includeSkillConfig?: boolean;
  }) => Promise<{
    object: string;
    data: Array<Record<string, unknown>>;
    first_id: string | null;
    last_id: string | null;
    has_more: boolean;
    after: string | null;
  }>;
  getAgentManagementListByAccess: ({
    accessibleIds,
    tenantId,
    limit,
    after,
  }: {
    /** `null` means the caller already passed the unrestricted management-capability check. */
    accessibleIds: Types.ObjectId[] | null;
    tenantId: string;
    limit: number;
    after?: string | null;
  }) => Promise<{
    data: Array<IAgent & { version: number; createdAt: Date; updatedAt: Date }>;
    has_more: boolean;
    after: string | null;
  }>;
  removeAgentResourceFiles: ({
    agent_id,
    files,
  }: {
    agent_id: string;
    files: Array<{ tool_resource: string; file_id: string }>;
  }) => Promise<IAgent>;
  generateActionMetadataHash: typeof generateActionMetadataHash;
  removeAgentFromUserFavorites: (resourceId: string, userIds: string[]) => Promise<void>;
  removeAgentResourceFilesFromAllAgents: ({
    file_ids,
  }: {
    file_ids: string[];
  }) => Promise<{ matchedCount: number; modifiedCount: number }>;
} {
  const { removeAllPermissions, getActions, getSoleOwnedResourceIds, isExternalSkillId } = deps;

  async function restoreAgentAfterReferenceLoss(
    Agent: Model<IAgent>,
    agentAfterWrite: IAgent | null,
    originalAgent: IAgent,
    lostEnvironmentId: string,
  ): Promise<void> {
    if (agentAfterWrite == null) return;
    const { updatedAt } = agentAfterWrite as IAgent & { updatedAt: Date };
    const restored = await Agent.replaceOne(
      {
        _id: agentAfterWrite._id,
        code_environment_id: lostEnvironmentId,
        updatedAt,
      },
      originalAgent,
      { timestamps: false },
    );
    if (restored.matchedCount === 0) {
      /** A concurrent writer may have changed the document after the guarded
       * write. Never erase that writer, but still remove the lost reference if
       * it remains active. */
      await Agent.updateOne(
        { _id: agentAfterWrite._id, code_environment_id: lostEnvironmentId },
        { $unset: { code_environment_id: 1 } },
      );
    }
  }

  /**
   * Create an agent with the provided data.
   */
  async function createAgent(agentData: Record<string, unknown>): Promise<IAgent> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    if (Array.isArray(agentData.skills) && agentData.skills.length > 0) {
      const prunedSkills = await filterExistingSkillIds(
        mongoose,
        agentData.skills as string[],
        isExternalSkillId,
      );
      agentData.skills = prunedSkills;
      /** Fail closed when pruning empties a non-empty allowlist — empty +
       *  enabled means the full catalog, and hygiene must never widen scope. */
      if (prunedSkills.length === 0) {
        agentData.skills_enabled = false;
      }
    }
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
      /** Callers that authorized the tools pass resolved names; deriving from the key
       * alone cannot tell a config server's suffix from a real DB server name. */
      mcpServerNames:
        (agentData.mcpServerNames as string[] | undefined) ??
        extractMCPServerNames(agentData.tools as string[] | undefined),
    };

    return await withCodeEnvironmentReference(
      mongoose,
      typeof agentData.code_environment_id === 'string' ? agentData.code_environment_id : undefined,
      async () => (await Agent.create(initialAgentData)).toObject() as IAgent,
      undefined,
      async (createdAgent) => {
        await Agent.deleteOne({ _id: createdAgent._id });
      },
    );
  }

  /**
   * Get an agent document based on the provided search parameter.
   */
  async function getAgent(
    searchParameter: FilterQuery<IAgent>,
    projection?: ProjectionType<IAgent>,
  ): Promise<IAgent | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return await Agent.findOne(searchParameter, projection).lean<IAgent>();
  }

  /**
   * Get an agent's version history only, without the rest of the document.
   * Returns an empty array when the agent exists but has no versions, or `null`
   * when no agent matches the search parameter.
   */
  async function getAgentVersions(
    searchParameter: FilterQuery<IAgent>,
  ): Promise<IAgent['versions'] | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const result = await Agent.findOne(searchParameter, { versions: 1, _id: 0 }).lean<
      Pick<IAgent, 'versions'>
    >();
    if (!result) {
      return null;
    }
    return result.versions ?? [];
  }

  /**
   * Get an agent document with a `version` count, excluding the heavy `versions` array.
   * Used when loading the editor so large version histories aren't transferred eagerly.
   */
  async function getAgentWithVersionCount(
    searchParameter: FilterQuery<IAgent>,
  ): Promise<(IAgent & { version: number }) | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const [agent] = await Agent.aggregate<IAgent & { version: number }>([
      { $match: searchParameter },
      { $addFields: { version: { $size: { $ifNull: ['$versions', []] } } } },
      { $project: { versions: 0 } },
    ]);
    return agent ?? null;
  }

  /**
   * Get multiple agent documents based on the provided search parameters.
   */
  async function getAgents(
    searchParameter: FilterQuery<IAgent>,
    select?: string | Record<string, number>,
  ): Promise<IAgent[]> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return await Agent.find(searchParameter, select).lean<IAgent[]>();
  }

  /** Returns the ids of every agent referencing `serverName`, the candidate set
   *  for agent-mediated MCP access checks. Index-covered by `mcpServerNames`. */
  async function getAgentIdsByMCPServerName(serverName: string): Promise<Types.ObjectId[]> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const agents = await Agent.find({ mcpServerNames: serverName }, { _id: 1 }).lean<
      Array<Pick<IAgent, '_id'>>
    >();
    return agents.map((agent) => agent._id);
  }

  /** Returns every agent with a non-empty `mcpServerNames`, so access
   *  calculations can start from the (typically small) set of agents that
   *  actually reference MCP servers instead of every accessible agent. */
  async function getAgentsWithMCPServerNames(): Promise<
    Array<Pick<IAgent, '_id' | 'mcpServerNames'>>
  > {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return await Agent.find({ mcpServerNames: { $type: 'string' } }, { mcpServerNames: 1 }).lean<
      Array<Pick<IAgent, '_id' | 'mcpServerNames'>>
    >();
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
    /** Set when the update would snapshot a version identical to the newest one. The write
     *  still lands; only the `versions` entry is dropped. */
    let suppressedVersionEntry = false;

    const currentAgent = await Agent.findOne(searchParameter);
    const currentRevision = (currentAgent as (IAgent & { updatedAt: Date }) | null)?.updatedAt;
    if (currentAgent) {
      const currentObject = currentAgent.toObject() as unknown as Record<string, unknown>;
      const { __v, _id, id: __id, versions, author: _author, ...versionData } = currentObject;
      const { $push, $pull, $addToSet, $unset, ...directUpdates } = updateData;

      /** Self-heal: drop allowlist ids whose skill no longer exists in the
       *  database or the external registry.
       *  A dangling id keeps the allowlist non-empty while scoping the
       *  runtime catalog to an empty intersection, silently disabling
       *  skills for the agent. When pruning empties a non-empty allowlist,
       *  fail closed and disable skills: empty + enabled means the full
       *  catalog, and hygiene must never widen scope. (An explicit user
       *  `skills: []` submission skips this branch and keeps the
       *  full-catalog semantics.)
       *
       *  Only agents without an explicit `skills_scope` are disabled that
       *  way. Once a scope is persisted it defines what an empty allowlist
       *  means, so failing closed would instead turn skills off on an agent
       *  the author deliberately scoped to `all` or `selected`. */
      if (Array.isArray(directUpdates.skills) && directUpdates.skills.length > 0) {
        const prunedSkills = await filterExistingSkillIds(
          mongoose,
          directUpdates.skills as string[],
          isExternalSkillId,
        );
        directUpdates.skills = prunedSkills;
        updateData.skills = prunedSkills;
        const effectiveScope =
          (directUpdates as Record<string, unknown>).skills_scope ?? currentObject.skills_scope;
        if (prunedSkills.length === 0 && effectiveScope == null) {
          directUpdates.skills_enabled = false;
          updateData.skills_enabled = false;
        }
      }

      // Sync mcpServerNames when tools are updated
      if ((directUpdates as Record<string, unknown>).tools !== undefined) {
        /** Callers that authorized the tools pass resolved names; deriving from the key
         * alone cannot tell a config server's suffix from a real DB server name. */
        const supplied = (directUpdates as Record<string, unknown>).mcpServerNames as
          | string[]
          | undefined;
        const mcpServerNames =
          supplied ??
          rebuildMCPServerNames(
            (directUpdates as Record<string, unknown>).tools as string[],
            (currentAgent.mcpServerNames as string[] | undefined) ?? [],
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
            const actions = await getActions({ actionId: actionIds }, true);

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
        (forceVersion ||
          Object.keys(directUpdates).length > 0 ||
          $push ||
          $pull ||
          $addToSet ||
          $unset);

      if (shouldCreateVersion) {
        const duplicateVersion = isDuplicateVersion(
          updateData,
          versionData,
          versions as Record<string, unknown>[],
          actionsHash,
        );
        /** A duplicate snapshot adds no history, but the write itself must still land: the
         *  document is regularly not equal to its newest version, because `$push`/`$pull`/
         *  `$addToSet` snapshot the pre-update state and `skipVersioning` snapshots nothing.
         *  `isDuplicateVersion` compares direct updates only, so it cannot speak for an
         *  update that also carries an operator that lands a change; suppressing there
         *  would apply a change no version records. An operator that changes nothing, the
         *  shape of an idempotent retry, leaves the snapshot a genuine duplicate. */
        const mutatesOutsideSnapshot = operatorsMutateDocument(
          currentObject,
          $push,
          $pull,
          $addToSet,
          $unset,
        );
        if (duplicateVersion && !forceVersion && !mutatesOutsideSnapshot) {
          suppressedVersionEntry = true;
          /** Every operator that reaches here was judged unable to change the document,
           *  and for `$addToSet` that reading came from a document fetched before the
           *  write, so it cannot bind a concurrent one: a `$pull` landing in between would
           *  leave this update re-adding the value with no version entry to record it.
           *  Drop what was judged a no-op rather than race it, so the suppressed write
           *  carries no operator at all and is true by construction instead of true only
           *  while nothing else writes first. */
          delete updateData.$addToSet;
          delete updateData.$push;
          delete updateData.$pull;
          delete updateData.$unset;
        }
      }

      const versionEntry: Record<string, unknown> = {
        ...versionData,
        ...directUpdates,
        updatedAt: new Date(),
      };
      if (hasOperatorKeys($unset)) {
        for (const path of Object.keys($unset as Record<string, unknown>)) {
          deleteDocumentPath(versionEntry, path);
        }
      }

      if (actionsHash) {
        versionEntry.actionsHash = actionsHash;
      }

      if (updatingUserId) {
        versionEntry.updatedBy = new mongoose.Types.ObjectId(updatingUserId);
      }

      if (shouldCreateVersion && !suppressedVersionEntry) {
        updateData.$push = {
          ...(($push as Record<string, unknown>) || {}),
          versions: versionEntry,
        };
      }
    }

    const directEnvironmentId = updateData.code_environment_id;
    const setEnvironmentId =
      typeof updateData.$set === 'object' && updateData.$set != null
        ? (updateData.$set as { code_environment_id?: unknown }).code_environment_id
        : undefined;
    let nextEnvironmentId: string | undefined;
    if (typeof directEnvironmentId === 'string') {
      nextEnvironmentId = directEnvironmentId;
    } else if (typeof setEnvironmentId === 'string') {
      nextEnvironmentId = setEnvironmentId;
    }
    const updatedAgent = await withCodeEnvironmentReference(
      mongoose,
      nextEnvironmentId,
      async () =>
        (await Agent.findOneAndUpdate(
          currentAgent == null || nextEnvironmentId == null
            ? searchParameter
            : { ...searchParameter, _id: currentAgent._id, updatedAt: currentRevision },
          updateData,
          mongoOptions,
        ).lean()) as IAgent | null,
      undefined,
      async (agentAfterUpdate) => {
        if (agentAfterUpdate == null || nextEnvironmentId == null) return;
        if (currentAgent == null) return;
        await restoreAgentAfterReferenceLoss(
          Agent,
          agentAfterUpdate,
          currentAgent.toObject() as IAgent,
          nextEnvironmentId,
        );
      },
    );

    /** `version` is a response-only field holding the count of `versions`. It is reported
     *  here so a suppressed entry keeps the shape callers saw before the write was fixed.
     *  It answers "was a version recorded", never "did the update apply". The two stopped
     *  being the same question once a suppressed update started landing. */
    if (updatedAgent && suppressedVersionEntry) {
      (updatedAgent as IAgent & { version?: number }).version = updatedAgent.versions?.length ?? 0;
    }

    return updatedAgent;
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
   * Removes the given file_ids from every agent's `tool_resources.*.file_ids`
   * so file deletion cannot leave orphaned stubs behind (see issue #12776).
   */
  async function removeAgentResourceFilesFromAllAgents({
    file_ids,
  }: {
    file_ids: string[];
  }): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (!file_ids || file_ids.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const Agent = mongoose.models.Agent as Model<IAgent>;

    const orQuery = TOOL_RESOURCE_KEYS.map((key) => ({
      [`tool_resources.${key}.file_ids`]: { $in: file_ids },
    }));

    const pullAllOps = TOOL_RESOURCE_KEYS.reduce<Record<string, string[]>>((acc, key) => {
      acc[`tool_resources.${key}.file_ids`] = file_ids;
      return acc;
    }, {});

    const result = await Agent.updateMany({ $or: orQuery }, { $pullAll: pullAllOps });
    return {
      matchedCount: result.matchedCount ?? 0,
      modifiedCount: result.modifiedCount ?? 0,
    };
  }

  /**
   * Deletes an agent based on the provided search parameter.
   */
  async function deleteAgent(searchParameter: FilterQuery<IAgent>): Promise<IAgent | null> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const User = mongoose.models.User as Model<unknown>;
    const agent = await Agent.findOneAndDelete(searchParameter);
    if (agent) {
      const deletedAgent = agent as unknown as { id: string; tenantId?: string };
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
        await removeAgentIdsFromEdges(Agent, [deletedAgent.id], deletedAgent.tenantId);
      } catch (error) {
        logger.error('[deleteAgent] Error removing agent from handoff edges', error);
      }
      try {
        await User.updateMany(
          {
            ...(deletedAgent.tenantId !== undefined ? { tenantId: deletedAgent.tenantId } : {}),
            'favorites.agentId': deletedAgent.id,
          },
          { $pull: { favorites: { agentId: deletedAgent.id } } },
        );
      } catch (error) {
        logger.error('[deleteAgent] Error removing agent from user favorites', error);
      }
    }
    return agent ? (agent.toObject() as IAgent) : null;
  }

  /**
   * Deletes agents solely owned by the user and cleans up their ACLs.
   * Agents with other owners are left intact; the caller is responsible for
   * removing the user's own ACL principal entries separately.
   *
   * Also handles legacy (pre-ACL) agents that only have the author field set,
   * ensuring they are not orphaned if no permission migration has been run.
   */
  async function deleteUserAgents(userId: string): Promise<void> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const User = mongoose.models.User as Model<unknown>;

    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const soleOwnedObjectIds = await getSoleOwnedResourceIds(userObjectId, [
        ResourceType.AGENT,
        ResourceType.REMOTE_AGENT,
      ]);

      const authoredAgents = await Agent.find({ author: userObjectId }).select('id _id').lean();

      const migratedEntries =
        authoredAgents.length > 0
          ? await AclEntry.find({
              resourceType: { $in: [ResourceType.AGENT, ResourceType.REMOTE_AGENT] },
              resourceId: { $in: authoredAgents.map((a) => a._id) },
            })
              .select('resourceId')
              .lean()
          : [];
      const migratedIds = new Set(migratedEntries.map((e) => e.resourceId.toString()));
      const legacyAgents = authoredAgents.filter((a) => !migratedIds.has(a._id.toString()));

      const soleOwnedAgents =
        soleOwnedObjectIds.length > 0
          ? await Agent.find({ _id: { $in: soleOwnedObjectIds } })
              .select('id _id')
              .lean()
          : [];

      const allAgents = [...soleOwnedAgents, ...legacyAgents];

      if (allAgents.length === 0) {
        return;
      }

      const agentIds = allAgents.map((agent) => agent.id);
      const agentObjectIds = allAgents.map((agent) => agent._id);

      await AclEntry.deleteMany({
        resourceType: { $in: [ResourceType.AGENT, ResourceType.REMOTE_AGENT] },
        resourceId: { $in: agentObjectIds },
      });

      try {
        await removeAgentIdsFromEdges(Agent, agentIds);
      } catch (error) {
        logger.error('[deleteUserAgents] Error removing agents from handoff edges', error);
      }

      try {
        await User.updateMany(
          { 'favorites.agentId': { $in: agentIds } },
          { $pull: { favorites: { agentId: { $in: agentIds } } } },
        );
      } catch (error) {
        logger.error('[deleteUserAgents] Error removing agents from user favorites', error);
      }

      await Agent.deleteMany({ _id: { $in: agentObjectIds } });
    } catch (error) {
      logger.error('[deleteUserAgents] General error:', error);
    }
  }

  /**
   * Get agents by accessible IDs with cursor pagination. Defaults to a 100-page
   * limit (max 1000); pass `limit: null` to opt out entirely.
   */
  async function getListAgentsByAccess({
    accessibleIds = [],
    otherParams = {},
    limit = 100,
    after = null,
    includeSkillConfig = false,
  }: {
    accessibleIds?: Types.ObjectId[];
    otherParams?: Record<string, unknown>;
    limit?: number | null;
    after?: string | null;
    includeSkillConfig?: boolean;
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
      ? Math.min(Math.max(1, parseInt(String(limit)) || 20), 1000)
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

    const projection: Record<string, 1> = {
      id: 1,
      _id: 1,
      name: 1,
      avatar: 1,
      author: 1,
      description: 1,
      conversation_starters: 1,
      updatedAt: 1,
      category: 1,
      support_contact: 1,
      is_promoted: 1,
    };

    if (includeSkillConfig) {
      projection.skills = 1;
      projection.skills_enabled = 1;
      projection.skill_authoring_enabled = 1;
      projection.skills_scope = 1;
    }

    let query = Agent.find(baseQuery, projection).sort({ updatedAt: -1, _id: 1 });

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
   * Returns the full Agent configuration required by the management response projector.
   * Unlike the browser list path, this query performs no avatar refresh or persistence write.
   */
  async function getAgentManagementListByAccess({
    accessibleIds,
    tenantId,
    limit,
    after = null,
  }: {
    /** `null` means the caller already passed the unrestricted management-capability check. */
    accessibleIds: Types.ObjectId[] | null;
    tenantId: string;
    limit: number;
    after?: string | null;
  }): Promise<{
    data: Array<IAgent & { version: number; createdAt: Date; updatedAt: Date }>;
    has_more: boolean;
    after: string | null;
  }> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const match: FilterQuery<IAgent> = {
      tenantId,
      ...(accessibleIds != null ? { _id: { $in: accessibleIds } } : {}),
    };

    if (after) {
      const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8')) as {
        updatedAt: string;
        _id: string;
      };
      match.$or = [
        { updatedAt: { $lt: new Date(cursor.updatedAt) } },
        {
          updatedAt: new Date(cursor.updatedAt),
          _id: { $gt: new mongoose.Types.ObjectId(cursor._id) },
        },
      ];
    }

    const agents = await Agent.aggregate<
      IAgent & { version: number; createdAt: Date; updatedAt: Date }
    >([
      { $match: match },
      { $sort: { updatedAt: -1, _id: 1 } },
      { $limit: limit + 1 },
      { $addFields: { version: { $size: { $ifNull: ['$versions', []] } } } },
      { $project: { versions: 0 } },
    ]);

    const hasMore = agents.length > limit;
    const data = hasMore ? agents.slice(0, limit) : agents;
    const lastAgent = data[data.length - 1];
    const nextCursor =
      hasMore && lastAgent
        ? Buffer.from(
            JSON.stringify({
              updatedAt: lastAgent.updatedAt.toISOString(),
              _id: lastAgent._id.toString(),
            }),
          ).toString('base64')
        : null;

    return { data, has_more: hasMore, after: nextCursor };
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
    const originalRevision = (agent as unknown as IAgent & { updatedAt: Date }).updatedAt;
    delete revertToVersion._id;
    delete revertToVersion.id;
    delete revertToVersion.versions;
    delete revertToVersion.author;
    delete revertToVersion.updatedBy;

    /** Version snapshots can predate skill deletions; restoring one verbatim
     *  would resurrect dangling allowlist ids that scope the catalog to
     *  nothing. Same self-heal (and fail-closed-on-empty rule) as
     *  `createAgent`/`updateAgent`. */
    if (Array.isArray(revertToVersion.skills) && revertToVersion.skills.length > 0) {
      const prunedSkills = await filterExistingSkillIds(
        mongoose,
        revertToVersion.skills as string[],
        isExternalSkillId,
      );
      revertToVersion.skills = prunedSkills;
      if (prunedSkills.length === 0) {
        revertToVersion.skills_enabled = false;
      }
    }

    const unsetOnRestore: Record<string, 1> = {};
    for (const field of ['code_environment_id', 'skills_scope', 'skill_authoring_enabled']) {
      if (!Object.prototype.hasOwnProperty.call(revertToVersion, field)) {
        unsetOnRestore[field] = 1;
      }
    }
    const revertUpdate =
      Object.keys(unsetOnRestore).length > 0
        ? { $set: revertToVersion, $unset: unsetOnRestore }
        : { $set: revertToVersion };
    const revertedAgent = await withCodeEnvironmentReference(
      mongoose,
      typeof revertToVersion.code_environment_id === 'string'
        ? revertToVersion.code_environment_id
        : undefined,
      async () =>
        await Agent.findOneAndUpdate(
          { ...searchParameter, _id: agent._id, updatedAt: originalRevision },
          revertUpdate,
          { new: true },
        ).lean<IAgent>(),
      undefined,
      async (agentAfterRevert) => {
        if (agentAfterRevert == null || typeof revertToVersion.code_environment_id !== 'string') {
          return;
        }
        await restoreAgentAfterReferenceLoss(
          Agent,
          agentAfterRevert,
          agent.toObject() as IAgent,
          revertToVersion.code_environment_id,
        );
      },
    );
    if (!revertedAgent) {
      throw new Error('Agent not found');
    }
    return revertedAgent;
  }

  /**
   * Counts the number of promoted agents.
   */
  async function countPromotedAgents(): Promise<number> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    return await Agent.countDocuments({ is_promoted: true });
  }

  /** Removes an agent from the favorites of specified users. */
  async function removeAgentFromUserFavorites(
    resourceId: string,
    userIds: string[],
  ): Promise<void> {
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const User = mongoose.models.User as Model<unknown>;

    const agent = await Agent.findOne({ _id: resourceId }, { id: 1, tenantId: 1 }).lean();
    if (!agent) {
      return;
    }

    await User.updateMany(
      {
        _id: { $in: userIds },
        ...(agent.tenantId !== undefined ? { tenantId: agent.tenantId } : {}),
        'favorites.agentId': agent.id,
      },
      { $pull: { favorites: { agentId: agent.id } } },
    );
  }

  return {
    getAgent,
    getAgentVersions,
    getAgentWithVersionCount,
    getAgents,
    createAgent,
    getAgentIdsByMCPServerName,
    getAgentsWithMCPServerNames,
    updateAgent,
    deleteAgent,
    deleteUserAgents,
    revertAgentVersion,
    countPromotedAgents,
    addAgentResourceFile,
    getListAgentsByAccess,
    getAgentManagementListByAccess,
    removeAgentResourceFiles,
    generateActionMetadataHash,
    removeAgentFromUserFavorites,
    removeAgentResourceFilesFromAllAgents,
  };
}

export type AgentMethods = ReturnType<typeof createAgentMethods>;
