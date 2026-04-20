import { logger } from '@librechat/data-schemas';
import { ResourceType, PermissionBits, EModelEndpoint } from 'librechat-data-provider';
import type { Agent, GraphEdge, TModelsConfig, TEndpointOption } from 'librechat-data-provider';
import type { Response as ServerResponse } from 'express';
import type { ServerRequest } from '~/types';
import type {
  InitializedAgent,
  InitializeAgentParams,
  InitializeAgentDbMethods,
} from './initialize';
import type { ValidateAgentModelParams } from './validation';
import { createEdgeCollector, filterOrphanedEdges } from './edges';
import { createSequentialChainEdges } from './chain';
import { validateAgentModel as defaultValidateAgentModel } from './validation';
import { initializeAgent as defaultInitializeAgent } from './initialize';

/**
 * Callback invoked after a sub-agent is successfully initialized.
 * Used by callers that need to track per-agent tool context (e.g., for
 * the ON_TOOL_EXECUTE event handler closure).
 */
export type OnAgentInitializedCallback = (
  agentId: string,
  agent: Agent,
  config: InitializedAgent,
) => void;

/**
 * Minimal permission check signature used to verify VIEW access on a
 * candidate sub-agent before it is loaded into the run.
 */
export type CheckAgentPermission = (params: {
  userId: string;
  role?: string;
  resourceType: string;
  resourceId: unknown;
  requiredPermission: number;
}) => Promise<boolean>;

export interface DiscoverConnectedAgentsParams {
  req: ServerRequest;
  res: ServerResponse;
  /** The already-initialized primary agent config (starting point for BFS). */
  primaryConfig: InitializedAgent;
  /**
   * Optional legacy chain: agent IDs to append as sequential direct edges.
   * Used by the deprecated Agent Chain feature.
   */
  agent_ids?: string[];
  endpointOption?: Partial<TEndpointOption>;
  allowedProviders: Set<string>;
  modelsConfig: TModelsConfig;
  loadTools: InitializeAgentParams['loadTools'];
  requestFiles?: InitializeAgentParams['requestFiles'];
  conversationId?: string | null;
  parentMessageId?: string | null;
  /**
   * ResourceType to check each sub-agent's access against. Defaults to
   * `AGENT` for the in-app chat flow. Callers whose entry-point gates on
   * a different resource type (e.g. the OpenAI-compat controllers gate on
   * `REMOTE_AGENT`) must pass the matching resource type so sub-agents
   * don't bypass the same sharing boundary enforced at the route.
   */
  resourceType?: string;
}

export interface DiscoverConnectedAgentsDeps {
  /** Fetch an agent by string id from the database. */
  getAgent: (filter: { id: string }) => Promise<Agent | null>;
  /** Permission check (typically a wrapper around PermissionService.checkPermission). */
  checkPermission: CheckAgentPermission;
  /** Violation logger passed through to validateAgentModel. */
  logViolation: ValidateAgentModelParams['logViolation'];
  /** DB methods consumed by initializeAgent for each sub-agent. */
  db: InitializeAgentDbMethods;
  /** Optional callback invoked after each sub-agent is initialized. */
  onAgentInitialized?: OnAgentInitializedCallback;
  /** Optional callback invoked when an agent id is skipped (missing or no access). */
  onAgentSkipped?: (agentId: string) => void;
  /**
   * Optional override for `initializeAgent`. Exists primarily so JS callers
   * can inject their test doubles via `jest.mock('@librechat/api')` — since
   * this module's own direct import would otherwise bypass that mock.
   */
  initializeAgent?: typeof defaultInitializeAgent;
  /** Optional override for `validateAgentModel` (same DI rationale). */
  validateAgentModel?: typeof defaultValidateAgentModel;
}

export interface DiscoverConnectedAgentsResult {
  /** Map of agentId -> initialized config for every discovered sub-agent. */
  agentConfigs: Map<string, InitializedAgent>;
  /** Deduplicated, orphan-filtered edges across the primary and sub-agents. */
  edges: GraphEdge[];
  /** Agent ids that were requested but could not be loaded (missing or no access). */
  skippedAgentIds: Set<string>;
  /** Merged MCP auth map from the primary and all sub-agents. */
  userMCPAuthMap?: Record<string, Record<string, string>>;
}

/**
 * Discovers and initializes all agents reachable from `primaryConfig.edges`
 * via BFS. This is the shared graph-topology discovery logic that enables
 * multi-agent handoffs (A -> B -> C) in both the primary chat flow and the
 * OpenAI-compatible / Responses API controllers.
 *
 * Skips agents the caller cannot load (missing from DB or lacking VIEW
 * permission) and filters out orphaned edges so `createRun` never sees an
 * edge pointing at a missing node — which would otherwise trigger a
 * `Found edge ending at unknown node` validation error from StateGraph.
 */
export async function discoverConnectedAgents(
  params: DiscoverConnectedAgentsParams,
  deps: DiscoverConnectedAgentsDeps,
): Promise<DiscoverConnectedAgentsResult> {
  const {
    req,
    res,
    primaryConfig,
    agent_ids,
    endpointOption,
    allowedProviders,
    modelsConfig,
    loadTools,
    requestFiles,
    conversationId,
    parentMessageId,
    resourceType = ResourceType.AGENT,
  } = params;

  const {
    getAgent,
    checkPermission,
    logViolation,
    db,
    onAgentInitialized,
    onAgentSkipped,
    initializeAgent = defaultInitializeAgent,
    validateAgentModel = defaultValidateAgentModel,
  } = deps;

  const agentConfigs = new Map<string, InitializedAgent>();
  const skippedAgentIds = new Set<string>();
  // Shallow-clone so the sub-agent merges below don't silently mutate
  // `primaryConfig.userMCPAuthMap` on the caller's object.
  let userMCPAuthMap: Record<string, Record<string, string>> | undefined =
    primaryConfig.userMCPAuthMap ? { ...primaryConfig.userMCPAuthMap } : undefined;

  const markSkipped = (agentId: string): void => {
    skippedAgentIds.add(agentId);
    onAgentSkipped?.(agentId);
  };

  const processAgent = async (agentId: string): Promise<Agent | null> => {
    const agent = await getAgent({ id: agentId });
    if (!agent) {
      logger.warn(
        `[discoverConnectedAgents] Handoff agent ${agentId} not found, skipping (orphaned reference)`,
      );
      markSkipped(agentId);
      return null;
    }

    const userId = req.user?.id;
    if (!userId) {
      logger.warn(
        `[discoverConnectedAgents] No authenticated user on request, skipping handoff agent ${agentId}`,
      );
      markSkipped(agentId);
      return null;
    }

    const hasAccess = await checkPermission({
      userId,
      role: req.user?.role,
      resourceType,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });

    if (!hasAccess) {
      logger.warn(
        `[discoverConnectedAgents] User ${userId} lacks VIEW access to handoff agent ${agentId}, skipping`,
      );
      markSkipped(agentId);
      return null;
    }

    const validation = await validateAgentModel({
      req,
      res,
      agent,
      modelsConfig,
      logViolation,
    });

    if (!validation.isValid) {
      throw new Error(validation.error?.message);
    }

    /**
     * Force `endpoint: agents` on the per-sub-agent init call so
     * `initializeAgent`'s `isAgentsEndpoint`-gated `allowedProviders`
     * check always fires for handoff sub-agents, regardless of which
     * endpoint the caller entered through. Without this, the OpenAI-
     * compat routes (whose `endpointOption.endpoint` is the primary
     * provider, not `agents`) would silently bypass the provider
     * allowlist configured under `endpoints.agents.allowedProviders`.
     */
    const subAgentEndpointOption: Partial<TEndpointOption> = {
      ...(endpointOption ?? {}),
      endpoint: EModelEndpoint.agents,
    };

    const config = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        requestFiles,
        conversationId,
        parentMessageId,
        endpointOption: subAgentEndpointOption,
        allowedProviders,
      },
      db,
    );

    if (userMCPAuthMap != null) {
      Object.assign(userMCPAuthMap, config.userMCPAuthMap ?? {});
    } else if (config.userMCPAuthMap) {
      // Clone so subsequent sub-agent merges don't mutate the first
      // sub-agent's own `config.userMCPAuthMap` in place — symmetric with
      // the shallow clone applied to the primary's map above.
      userMCPAuthMap = { ...config.userMCPAuthMap };
    }

    agentConfigs.set(agentId, config);
    onAgentInitialized?.(agentId, agent, config);
    return agent;
  };

  const checkAgentInit = (agentId: string): boolean =>
    agentId === primaryConfig.id || agentConfigs.has(agentId);

  const { edgeMap, agentsToProcess, collectEdges } = createEdgeCollector(
    checkAgentInit,
    skippedAgentIds,
  );

  collectEdges(primaryConfig.edges);

  while (agentsToProcess.size > 0) {
    const agentId = agentsToProcess.values().next().value as string;
    agentsToProcess.delete(agentId);
    try {
      const agent = await processAgent(agentId);
      if (agent?.edges?.length) {
        collectEdges(agent.edges);
      }
    } catch (err) {
      logger.error(`[discoverConnectedAgents] Error processing agent ${agentId}:`, err);
      markSkipped(agentId);
    }
  }

  /** @deprecated Agent Chain — sequential direct-edge fallback */
  if (agent_ids?.length) {
    for (const agentId of agent_ids) {
      if (checkAgentInit(agentId)) {
        continue;
      }
      try {
        await processAgent(agentId);
      } catch (err) {
        logger.error(`[discoverConnectedAgents] Error processing chain agent ${agentId}:`, err);
        markSkipped(agentId);
      }
    }
    /**
     * `createSequentialChainEdges` is typed against `@librechat/agents`'s
     * `GraphEdge` (which uses `BaseMessage` from `@langchain/core`) whereas
     * `collectEdges` uses the `librechat-data-provider` variant (structural
     * `BaseMessage`). The produced chain edges are structurally identical and
     * only carry `edgeType`, `from`, `to`, `prompt`, `excludeResults` —
     * interchangeable for edge collection purposes.
     */
    const chain = await createSequentialChainEdges([primaryConfig.id].concat(agent_ids), '{convo}');
    collectEdges(chain as unknown as GraphEdge[]);
  }

  const filteredEdges = filterOrphanedEdges(Array.from(edgeMap.values()), skippedAgentIds);

  /**
   * Compute the set of agent ids reachable from the primary through
   * surviving edges, then prune both `agentConfigs` AND the edge list to
   * that set. Two independent failure modes are in play here:
   *
   * 1. BFS eagerly initializes sub-agents discovered via the primary's
   *    edge scan. If an intermediate hop gets skipped (missing / no
   *    access), its neighbors can still be loaded — those neighbors
   *    become disconnected once the skipped hop's edges are removed.
   *
   * 2. `filterOrphanedEdges` only drops edges whose endpoints are in
   *    `skippedAgentIds`. Edges between two non-skipped but
   *    unreachable-from-primary agents (e.g. a `C -> D` tail left over
   *    after `A -> B -> C -> D` loses its B-adjacent edges) survive
   *    filtering but still reference agents that are about to be pruned
   *    from `agentConfigs`. Those edges would otherwise flow into
   *    `createRun`, flip it into multi-agent mode (edges.length > 0)
   *    with `agents.length === 1`, and trigger the exact
   *    `Found edge ending at unknown node` crash this PR fixes.
   *
   * Do both prunes together so the returned shape is self-consistent:
   * every agent id referenced by an edge is guaranteed to be either
   * `primaryConfig.id` or a key of `agentConfigs`.
   */
  const edgeEndpointIsReachable = (
    value: string | string[],
    reachableSet: Set<string>,
  ): boolean => {
    const ids = Array.isArray(value) ? value : [value];
    return ids.every((id) => typeof id !== 'string' || reachableSet.has(id));
  };

  // Fixed-point reachability: an edge only advances reachability when ALL
  // of its `from` endpoints are already reachable. Matches the edge-filter
  // semantics below and handles multi-source / fan-in edges correctly:
  // `{ from: ['A', 'B'], to: 'C' }` can only fire when both A and B reach
  // it, so C shouldn't be marked reachable just because A is in the source
  // list. The previous `sources.includes(current)` BFS over-approximated
  // reachability for fan-in edges and left C in `agentConfigs` while the
  // edge itself got dropped — `createRun` then saw `agents.length > 1`
  // with a disconnected C and ran it as an unintended parallel root.
  const reachable = new Set<string>([primaryConfig.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of filteredEdges) {
      if (!edgeEndpointIsReachable(edge.from, reachable)) {
        continue;
      }
      const dests = Array.isArray(edge.to) ? edge.to : [edge.to];
      for (const dest of dests) {
        if (typeof dest === 'string' && !reachable.has(dest)) {
          reachable.add(dest);
          changed = true;
        }
      }
    }
  }

  for (const agentId of [...agentConfigs.keys()]) {
    if (!reachable.has(agentId)) {
      agentConfigs.delete(agentId);
    }
  }

  const edges = filteredEdges.filter(
    (edge) =>
      edgeEndpointIsReachable(edge.from, reachable) && edgeEndpointIsReachable(edge.to, reachable),
  );

  return {
    agentConfigs,
    edges,
    skippedAgentIds,
    userMCPAuthMap,
  };
}
