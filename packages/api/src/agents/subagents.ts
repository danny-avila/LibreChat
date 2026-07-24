import { logger } from '@librechat/data-schemas';
import {
  EModelEndpoint,
  MAX_SUBAGENT_DEPTH,
  MAX_SUBAGENT_GRAPH_NODES,
  PermissionBits,
  ResourceType,
} from 'librechat-data-provider';
import type { Agent, GraphEdge, TEndpointOption, TModelsConfig } from 'librechat-data-provider';
import type { Response as ServerResponse } from 'express';
import type { InitializedAgent, InitializeAgentDbMethods, InitializeAgentParams } from './initialize';
import type { ValidateAgentModelParams } from './validation';
import type { CheckAgentPermission, OnAgentInitializedCallback } from './discovery';
import type { ServerRequest } from '~/types';
import { validateAgentModel as defaultValidateAgentModel } from './validation';
import { initializeAgent as defaultInitializeAgent } from './initialize';

export interface ResolveSubagentsParams {
  req: ServerRequest;
  res: ServerResponse;
  /** Already-initialized primary agent config. */
  primaryConfig: InitializedAgent;
  /** Handoff / connected agent configs discovered before subagent resolution. */
  agentConfigs: Map<string, InitializedAgent>;
  /** Handoff edges (used to distinguish pure subagents from handoff targets). */
  edges: GraphEdge[];
  /** Whether the endpoint-level `subagents` capability is enabled. */
  subagentsCapabilityEnabled: boolean;
  /** Agent ids already skipped during handoff discovery (seeded into the loader). */
  skippedAgentIds?: Set<string>;
  endpointOption?: Partial<TEndpointOption>;
  allowedProviders: Set<string>;
  modelsConfig: TModelsConfig;
  loadTools: InitializeAgentParams['loadTools'];
  requestFiles?: InitializeAgentParams['requestFiles'];
  conversationId?: string | null;
  parentMessageId?: string | null;
  /**
   * ResourceType to check each sub-agent's access against. Defaults to
   * `AGENT` for the in-app chat flow. Remote API controllers pass
   * `REMOTE_AGENT` so subagents clear the same sharing boundary as the
   * primary.
   */
  resourceType?: string;
  computeAccessibleSkillIds?: (agent: Agent) => InitializeAgentParams['accessibleSkillIds'];
  computeSkillAuthoringAvailable?: (
    agent: Agent,
    accessibleSkillIds: InitializeAgentParams['accessibleSkillIds'],
  ) => InitializeAgentParams['skillAuthoringAvailable'];
  skillStates?: InitializeAgentParams['skillStates'];
  defaultActiveOnShare?: InitializeAgentParams['defaultActiveOnShare'];
  codeEnvAvailable?: InitializeAgentParams['codeEnvAvailable'];
  statefulSessionsAvailable?: InitializeAgentParams['statefulSessionsAvailable'];
  memoryAvailable?: InitializeAgentParams['memoryAvailable'];
}

export interface ResolveSubagentsDeps {
  getAgent: (filter: { id: string }) => Promise<Agent | null>;
  checkPermission: CheckAgentPermission;
  logViolation: ValidateAgentModelParams['logViolation'];
  db: InitializeAgentDbMethods;
  onAgentInitialized?: OnAgentInitializedCallback;
  initializeAgent?: typeof defaultInitializeAgent;
  validateAgentModel?: typeof defaultValidateAgentModel;
}

function collectEdgeAgentIds(primaryId: string, edges: GraphEdge[]): Set<string> {
  const edgeAgentIds = new Set<string>([primaryId]);
  for (const edge of edges) {
    const sources = Array.isArray(edge.from) ? edge.from : [edge.from];
    const targets = Array.isArray(edge.to) ? edge.to : [edge.to];
    for (const id of sources) {
      if (typeof id === 'string') {
        edgeAgentIds.add(id);
      }
    }
    for (const id of targets) {
      if (typeof id === 'string') {
        edgeAgentIds.add(id);
      }
    }
  }
  return edgeAgentIds;
}

/**
 * Loads explicit subagent configs for the primary and any connected agents.
 * Subagents run in isolated context windows and are invoked via a dedicated
 * spawn tool (not handoff edges). Pure subagents are pruned from `agentConfigs`
 * so LangGraph does not treat them as parallel/handoff nodes, but callers
 * should keep their tool contexts (via `onAgentInitialized`) for ON_TOOL_EXECUTE.
 */
export async function resolveSubagents(
  params: ResolveSubagentsParams,
  deps: ResolveSubagentsDeps,
): Promise<void> {
  const {
    req,
    res,
    primaryConfig,
    agentConfigs,
    edges,
    subagentsCapabilityEnabled,
    skippedAgentIds: seededSkippedAgentIds,
    endpointOption,
    allowedProviders,
    modelsConfig,
    loadTools,
    requestFiles,
    conversationId,
    parentMessageId,
    resourceType = ResourceType.AGENT,
    computeAccessibleSkillIds,
    computeSkillAuthoringAvailable,
    skillStates,
    defaultActiveOnShare,
    codeEnvAvailable,
    statefulSessionsAvailable,
    memoryAvailable,
  } = params;

  const {
    getAgent,
    checkPermission,
    logViolation,
    db,
    onAgentInitialized,
    initializeAgent = defaultInitializeAgent,
    validateAgentModel = defaultValidateAgentModel,
  } = deps;

  const skippedAgentIds = new Set(seededSkippedAgentIds ?? []);
  const edgeAgentIds = collectEdgeAgentIds(primaryConfig.id, edges);
  const pureSubagentIds = new Set<string>();
  const subagentGraphIds = new Set<string>();
  const loadedSubagentConfigIds = new Set<string>();

  const loadAgentById = async (agentId: string): Promise<InitializedAgent | null> => {
    if (skippedAgentIds.has(agentId)) {
      return null;
    }
    const existing = agentConfigs.get(agentId);
    if (existing) {
      return existing;
    }

    try {
      const agent = await getAgent({ id: agentId });
      if (!agent) {
        skippedAgentIds.add(agentId);
        return null;
      }

      const userId = req.user?.id;
      if (!userId) {
        skippedAgentIds.add(agentId);
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
          `[resolveSubagents] User ${userId} lacks VIEW access to subagent ${agentId}, skipping`,
        );
        skippedAgentIds.add(agentId);
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
        logger.warn(
          `[resolveSubagents] Subagent ${agentId} failed model validation: ${validation.error?.message}`,
        );
        skippedAgentIds.add(agentId);
        return null;
      }

      const scopedSkillIds = computeAccessibleSkillIds?.(agent);
      const config = await initializeAgent(
        {
          req,
          res,
          agent,
          loadTools,
          requestFiles,
          conversationId,
          parentMessageId,
          endpointOption: { ...endpointOption, endpoint: EModelEndpoint.agents },
          allowedProviders,
          accessibleSkillIds: scopedSkillIds,
          skillAuthoringAvailable: computeSkillAuthoringAvailable?.(agent, scopedSkillIds),
          codeEnvAvailable,
          statefulSessionsAvailable,
          memoryAvailable,
          skillStates,
          defaultActiveOnShare,
        },
        db,
      );

      agentConfigs.set(agentId, config);
      onAgentInitialized?.(agentId, agent, config);
      return config;
    } catch (err) {
      logger.error(`[resolveSubagents] Error processing subagent ${agentId}:`, err);
      skippedAgentIds.add(agentId);
      return null;
    }
  };

  const assertSubagentGraphRoom = (agentId: string): void => {
    if (subagentGraphIds.has(agentId)) {
      return;
    }
    if (subagentGraphIds.size >= MAX_SUBAGENT_GRAPH_NODES) {
      logger.warn('[resolveSubagents] Subagent graph node limit exceeded', {
        agentId,
        primaryAgentId: primaryConfig.id,
        loadedSubagentCount: subagentGraphIds.size,
        maxSubagentGraphNodes: MAX_SUBAGENT_GRAPH_NODES,
      });
      throw new Error(
        `Subagent graph exceeds the maximum of ${MAX_SUBAGENT_GRAPH_NODES} unique agents.`,
      );
    }
  };

  const loadSubagentsFor = async (config: InitializedAgent, depth = 0): Promise<void> => {
    const sub = config.subagents;
    if (!subagentsCapabilityEnabled || !sub?.enabled) {
      config.subagentAgentConfigs = [];
      return;
    }

    if (loadedSubagentConfigIds.has(config.id)) {
      if ((config.subagentAgentConfigs?.length ?? 0) > 0 && depth >= MAX_SUBAGENT_DEPTH) {
        logger.warn('[resolveSubagents] Subagent graph depth limit exceeded', {
          agentId: config.id,
          primaryAgentId: primaryConfig.id,
          depth,
          maxSubagentDepth: MAX_SUBAGENT_DEPTH,
          childCount: config.subagentAgentConfigs.length,
        });
        throw new Error(
          `Subagent graph exceeds the maximum depth of ${MAX_SUBAGENT_DEPTH} at agent ${config.id}.`,
        );
      }
      return;
    }

    const explicitSubagentIds = Array.from(
      new Set(
        Array.isArray(sub.agent_ids)
          ? sub.agent_ids.filter((id) => typeof id === 'string' && id && id !== config.id)
          : [],
      ),
    );

    if (explicitSubagentIds.length > 0 && depth >= MAX_SUBAGENT_DEPTH) {
      logger.warn('[resolveSubagents] Subagent graph depth limit exceeded', {
        agentId: config.id,
        primaryAgentId: primaryConfig.id,
        depth,
        maxSubagentDepth: MAX_SUBAGENT_DEPTH,
        childCount: explicitSubagentIds.length,
      });
      throw new Error(
        `Subagent graph exceeds the maximum depth of ${MAX_SUBAGENT_DEPTH} at agent ${config.id}.`,
      );
    }

    loadedSubagentConfigIds.add(config.id);

    const resolved: InitializedAgent[] = [];
    for (const subagentId of explicitSubagentIds) {
      if (skippedAgentIds.has(subagentId)) {
        continue;
      }

      if (subagentId === primaryConfig.id) {
        resolved.push(primaryConfig);
        continue;
      }

      assertSubagentGraphRoom(subagentId);
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

  const maxResolvedDepthByConfigId = new Map<string, number>();
  const rootConfigs = [primaryConfig, ...agentConfigs.values()];
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
      const previousChildDepth = child?.id ? maxResolvedDepthByConfigId.get(child.id) : undefined;
      if (child?.id && (previousChildDepth == null || previousChildDepth < childDepth)) {
        pending.push({ cfg: child, depth: childDepth });
      }
    }
  }

  for (const id of pureSubagentIds) {
    agentConfigs.delete(id);
  }

  primaryConfig.subagents = subagentsCapabilityEnabled ? primaryConfig.subagents : undefined;

  if (!subagentsCapabilityEnabled) {
    for (const config of agentConfigs.values()) {
      config.subagents = undefined;
      config.subagentAgentConfigs = undefined;
    }
  }
}
