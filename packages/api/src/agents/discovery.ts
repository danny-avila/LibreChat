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

  const preFilterEdges = Array.from(edgeMap.values());
  const filteredEdges = filterOrphanedEdges(preFilterEdges, skippedAgentIds);

  /**
   * Keep discovery's reachability model aligned with the agents SDK's
   * runtime semantics. `MultiAgentGraph.createWorkflow` adds one
   * LangGraph edge per `from` source, so a multi-source edge
   * `{ from: ['A', 'B'], to: 'C' }` is really `A -> C` OR `B -> C` —
   * either source firing routes to `C`. Reachability therefore advances
   * through an edge whenever ANY of its sources is already reachable.
   *
   * Two semantics to reconcile when pruning after orphan-filter:
   *
   * 1. Accidental orphans — agents loaded via BFS from the primary's
   *    edges that lost their only path when an intermediate agent was
   *    skipped (e.g. `A -> B -> C` with B skipped leaves C stranded).
   *    These should be pruned; leaving them flips `createRun` into
   *    multi-agent mode with a disconnected C and the SDK runs C as an
   *    unintended parallel root.
   *
   * 2. Intentional multi-start branches — agents referenced by edges the
   *    user explicitly defined without wiring them to the primary
   *    (e.g. `A -> B` plus `X -> Y` as two independent starting
   *    branches). The SDK's `MultiAgentGraph.analyzeGraph` treats
   *    `no-incoming-edge` agents as start nodes, so these run in
   *    parallel with the primary by design. These must be preserved.
   *
   * Distinguish the two by asking: did the agent have any incoming edge
   * in the user's original (pre-filter) graph? If yes, it was wired as
   * a downstream step, and losing that wiring post-filter makes it an
   * accidental orphan — prune. If no, the user declared it a start
   * node; seed it so the SDK's `analyzeGraph` behavior of running
   * incoming-less agents in parallel is preserved.
   *
   * "No incoming edge pre-filter" is stricter than "not reachable from
   * primary pre-filter": a downstream agent like Y in `X -> Y` where X
   * is skipped was never reachable from the primary pre-filter either,
   * but it's still an orphan (its upstream X would have routed to it).
   * The incoming-edge test catches that case correctly.
   *
   *   - Post-filter reachability is seeded with the primary AND every
   *     agent in `agentConfigs` that had no pre-filter incoming edge
   *     (legitimate parallel start).
   *   - Agents whose pre-filter incoming edges got filtered out lose
   *     reachability and get pruned.
   *   - Surviving edges are filtered to the post-filter reachable set
   *     so no stale edge references a pruned agent.
   *   - Agents referenced as an endpoint in a surviving edge are always
   *     kept (a multi-source edge co-source like B in
   *     `{ from: ['A','B'], to: 'C' }` where nothing reaches B still
   *     needs B present for the SDK's per-source `addEdge` to compile).
   */
  const anyReachable = (value: string | string[], reachableSet: Set<string>): boolean => {
    const ids = Array.isArray(value) ? value : [value];
    return ids.some((id) => typeof id === 'string' && reachableSet.has(id));
  };
  const allReachable = (value: string | string[], reachableSet: Set<string>): boolean => {
    const ids = Array.isArray(value) ? value : [value];
    return ids.every((id) => typeof id !== 'string' || reachableSet.has(id));
  };
  const expandReachable = (seeds: Set<string>, edgeList: GraphEdge[]): Set<string> => {
    const result = new Set<string>(seeds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edgeList) {
        if (!anyReachable(edge.from, result)) {
          continue;
        }
        const dests = Array.isArray(edge.to) ? edge.to : [edge.to];
        for (const dest of dests) {
          if (typeof dest === 'string' && !result.has(dest)) {
            result.add(dest);
            changed = true;
          }
        }
      }
    }
    return result;
  };

  // A legitimate parallel-start agent is one that has NO incoming edge
  // in the pre-filter graph — the user declared it as a starting node.
  // "Not reachable from primary pre-filter" is too permissive: a
  // downstream agent whose only upstream got skipped (`X -> Y` with X
  // skipped but Y loaded) would qualify under that weaker rule and be
  // promoted to a parallel root even though it's actually a stranded
  // orphan. Using "no incoming edge in pre-filter" tightens the criterion
  // to match the SDK's `analyzeGraph` definition of a start node applied
  // to the user's ORIGINAL graph topology, before any orphan filtering.
  const hadIncomingEdgePreFilter = new Set<string>();
  for (const edge of preFilterEdges) {
    const dests = Array.isArray(edge.to) ? edge.to : [edge.to];
    for (const dest of dests) {
      if (typeof dest === 'string') {
        hadIncomingEdgePreFilter.add(dest);
      }
    }
  }

  const postFilterSeeds = new Set<string>([primaryConfig.id]);
  for (const agentId of agentConfigs.keys()) {
    if (!hadIncomingEdgePreFilter.has(agentId)) {
      postFilterSeeds.add(agentId);
    }
  }

  const reachable = expandReachable(postFilterSeeds, filteredEdges);

  /**
   * Filter + sanitize edges:
   * - Keep an edge if at least one `from` source is reachable AND every
   *   `to` destination is reachable (a missing destination would still
   *   crash `StateGraph.compile` with `Found edge ending at unknown
   *   node`).
   * - For kept edges with an array `from`, strip out unreachable
   *   co-sources. The SDK's per-source `addEdge` fires independently
   *   (each source becomes its own `addEdge(source, dest)` call), so
   *   losing an unreachable co-source doesn't invalidate the routes
   *   through the surviving ones. Leaving the dead co-source in the
   *   array was propping up agents that `reachable` had already
   *   excluded — in `MultiAgentGraph.analyzeGraph` they'd then show up
   *   as incoming-less nodes and execute as unintended parallel roots.
   *
   * After sanitization every endpoint in every surviving edge is
   * guaranteed to be in `reachable`, which lets the agent prune below
   * collapse to a strict reachability check.
   */
  const edges: GraphEdge[] = [];
  for (const edge of filteredEdges) {
    if (!anyReachable(edge.from, reachable) || !allReachable(edge.to, reachable)) {
      continue;
    }
    if (!Array.isArray(edge.from)) {
      edges.push(edge);
      continue;
    }
    const reachableSources = edge.from.filter((s) => typeof s !== 'string' || reachable.has(s));
    if (reachableSources.length === edge.from.length) {
      edges.push(edge);
    } else {
      edges.push({ ...edge, from: reachableSources });
    }
  }

  for (const agentId of [...agentConfigs.keys()]) {
    if (!reachable.has(agentId)) {
      agentConfigs.delete(agentId);
    }
  }

  return {
    agentConfigs,
    edges,
    skippedAgentIds,
    userMCPAuthMap,
  };
}
