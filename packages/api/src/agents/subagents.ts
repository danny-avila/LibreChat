import { logger } from '@librechat/data-schemas';
import { ResourceType, PermissionBits } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';

/**
 * Subagent-spawn loader factory — the spawn-as-tool analogue of the handoff
 * discovery in `discovery.ts` (issue #13898).
 *
 * Extracted behavior-preserving from the `loadSubagentsFor` / `resolveSubagentTrees`
 * closures in api/server/services/Endpoints/agents/initialize.js. The factory
 * closes over the same shared graph state the closures captured, so the JWT
 * call site keeps its exact signatures:
 *   loadSubagentsFor(config, depth = 0)   — mutates config.subagentAgentConfigs
 *   resolveSubagentTrees(rootConfigs)     — positional array of root configs
 *
 * SECURITY (#13898): the JWT path performs NO load-time ACL (unchanged — the
 * SDK spawn-time callback governs). The /v1 controllers inject
 * `checkSubagentAccess` (REMOTE_AGENT + VIEW via
 * `buildRemoteAgentSubagentAccessCheck`) so a headless sk- key cannot spawn
 * agents its user cannot see — the same boundary `discoverConnectedAgents`
 * enforces for handoff targets.
 */

/** Loose agent-config shape: both the JWT path and /v1 controllers hand us
 *  initialized agent configs whose exact type lives in ./initialize; the
 *  loader only touches the fields below. */
export type SubagentConfigLike = {
  id?: string;
  subagents?: { enabled?: boolean; agent_ids?: unknown[] };
  subagentAgentConfigs?: SubagentConfigLike[];
} & Record<string, unknown>;

export interface SubagentLoaderDeps {
  /** The already-initialized primary agent config (root + cycle target). */
  primaryConfig: SubagentConfigLike;
  /** Agent ids skipped upstream (missing / no access) — shared with discovery. */
  skippedAgentIds: Set<string>;
  /** Ids that are handoff-edge targets (classifies pure-subagent ids). */
  edgeAgentIds: Set<string>;
  /** OUT: ids that are subagents but NOT handoff targets. */
  pureSubagentIds: Set<string>;
  /** OUT: every id pulled into the subagent graph. */
  subagentGraphIds: Set<string>;
  /** OUT: config ids whose subagents were loaded. */
  loadedSubagentConfigIds: Set<string>;
  /** State: max resolved depth per config id (cycle/redundancy guard). */
  maxResolvedDepthByConfigId: Map<string, number>;
  /** Load + fully initialize an agent by id (caller-supplied). Null when missing. */
  loadAgentById: (agentId: string) => Promise<SubagentConfigLike | null>;
  /** Graph-size guard: throws when the node budget would be exceeded. */
  assertSubagentGraphRoom: (agentId: string) => void;
  /** MAX_SUBAGENT_DEPTH from librechat-data-provider (caller passes it in). */
  maxSubagentDepth: number;
  /** Raw agent fetch for the ACL check (required only when checkSubagentAccess set). */
  getAgent?: (filter: { id: string }) => Promise<Agent | null>;
  /** #13898 load-time ACL. undefined on the JWT path (unchanged behavior);
   *  REMOTE_AGENT+VIEW on the /v1 path. */
  checkSubagentAccess?: (agent: Agent) => Promise<boolean>;
}

export function createSubagentLoader(deps: SubagentLoaderDeps): {
  loadSubagentsFor: (config: SubagentConfigLike, depth?: number) => Promise<void>;
  resolveSubagentTrees: (rootConfigs: SubagentConfigLike[]) => Promise<void>;
} {
  const {
    primaryConfig,
    skippedAgentIds,
    edgeAgentIds,
    pureSubagentIds,
    subagentGraphIds,
    loadedSubagentConfigIds,
    maxResolvedDepthByConfigId,
    loadAgentById,
    assertSubagentGraphRoom,
    maxSubagentDepth,
    getAgent,
    checkSubagentAccess,
  } = deps;

  const loadSubagentsFor = async (config: SubagentConfigLike, depth = 0): Promise<void> => {
    const sub = config.subagents;
    if (!sub || !sub.enabled) {
      return;
    }

    const explicitSubagentIds = Array.from(
      new Set(
        sub.agent_ids && Array.isArray(sub.agent_ids)
          ? sub.agent_ids.filter(
              (id): id is string => typeof id === 'string' && !!id && id !== config.id,
            )
          : [],
      ),
    );

    if (explicitSubagentIds.length > 0 && depth >= maxSubagentDepth) {
      logger.warn('[createSubagentLoader] Subagent graph depth limit exceeded', {
        agentId: config.id,
        primaryAgentId: primaryConfig.id,
        depth,
        maxSubagentDepth,
        childCount: explicitSubagentIds.length,
      });
      throw new Error(
        `Subagent graph exceeds the maximum depth of ${maxSubagentDepth} at agent ${config.id}.`,
      );
    }

    if (config.id) {
      loadedSubagentConfigIds.add(config.id);
    }

    const resolved: SubagentConfigLike[] = [];
    for (const subagentId of explicitSubagentIds) {
      if (skippedAgentIds.has(subagentId)) {
        continue;
      }

      /** Cycle guard: A <-> B resolves back to the already-initialized primary. */
      if (subagentId === primaryConfig.id) {
        resolved.push(primaryConfig);
        continue;
      }

      assertSubagentGraphRoom(subagentId);

      /** #13898 load-time ACL (/v1 path only; JWT passes no check — unchanged). */
      if (checkSubagentAccess && getAgent) {
        const rawAgent = await getAgent({ id: subagentId });
        if (!rawAgent) {
          logger.warn(
            `[createSubagentLoader] Subagent ${subagentId} not found, skipping (orphaned reference)`,
          );
          skippedAgentIds.add(subagentId);
          continue;
        }
        const hasAccess = await checkSubagentAccess(rawAgent);
        if (!hasAccess) {
          logger.warn(
            `[createSubagentLoader] Caller lacks VIEW access to subagent ${subagentId}, skipping`,
          );
          skippedAgentIds.add(subagentId);
          continue;
        }
      }

      const subagentConfig = await loadAgentById(subagentId);
      if (!subagentConfig) {
        continue;
      }

      subagentGraphIds.add(subagentConfig.id ?? subagentId);
      resolved.push(subagentConfig);

      if (!edgeAgentIds.has(subagentId)) {
        pureSubagentIds.add(subagentId);
      }
    }

    config.subagentAgentConfigs = resolved;
  };

  /** BFS across subagent trees so nested chains like A -> B -> C get resolved
   *  before any pruning; overlapping roots may be revisited at deeper depths so
   *  the depth guard observes the deepest reachable path. */
  const resolveSubagentTrees = async (rootConfigs: SubagentConfigLike[]): Promise<void> => {
    const pending = rootConfigs.map((cfg) => ({ cfg, depth: 0 }));
    for (let index = 0; index < pending.length; index++) {
      const { cfg, depth } = pending[index];
      if (!cfg?.id) {
        continue;
      }
      const previousDepth = maxResolvedDepthByConfigId.get(cfg.id);
      if (previousDepth != null && previousDepth >= depth) {
        continue;
      }
      maxResolvedDepthByConfigId.set(cfg.id, depth);
      await loadSubagentsFor(cfg, depth);
      for (const child of cfg.subagentAgentConfigs ?? []) {
        const childDepth = depth + 1;
        const previousChildDepth = child?.id
          ? maxResolvedDepthByConfigId.get(child.id)
          : undefined;
        if (child?.id && (previousChildDepth == null || previousChildDepth < childDepth)) {
          pending.push({ cfg: child, depth: childDepth });
        }
      }
    }
  };

  return { loadSubagentsFor, resolveSubagentTrees };
}

/**
 * Convenience for the /v1 controllers: builds a REMOTE_AGENT + VIEW
 * `checkSubagentAccess` from the same permission-check shape the controllers
 * already use for handoff discovery — the subagent ACL is literally the same
 * gate as the handoff ACL.
 */
export function buildRemoteAgentSubagentAccessCheck(
  req: { user?: { id?: string; role?: string } },
  checkPermission: (params: {
    userId: string;
    role?: string;
    resourceType: string;
    resourceId: unknown;
    requiredPermission: number;
  }) => Promise<boolean>,
  resourceType: string = ResourceType.REMOTE_AGENT,
): (agent: Agent) => Promise<boolean> {
  return async (agent: Agent): Promise<boolean> => {
    const userId = req.user?.id;
    if (!userId) {
      return false;
    }
    return checkPermission({
      userId,
      role: req.user?.role,
      resourceType,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });
  };
}
