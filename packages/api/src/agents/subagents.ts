import { logger } from '@librechat/data-schemas';
import { ResourceType, PermissionBits } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { InitializedAgent } from './initialize';
import type { ServerRequest } from '~/types';
import type { CheckAgentPermission } from './discovery';

/**
 * Subagent-spawn ("subagents") loader — the spawn-as-tool analogue of the
 * handoff/edge discovery in `discovery.ts`.
 *
 * Extracted verbatim (behavior-preserving) from the `loadSubagentsFor` /
 * `resolveSubagentTrees` closures that previously lived inside
 * `initializeClient` (api/server/services/Endpoints/agents/initialize.js), so
 * the same loader can be invoked from the OpenAI-compatible `/v1` controllers
 * (`openai.js`, `responses.js`) — which today never populate
 * `config.subagentAgentConfigs`, leaving subagent-spawn a silent no-op over the
 * Agents API (issue #13898). Handoffs already survive that boundary via
 * `discoverConnectedAgents` (PR #12740); this is the missing subagent port.
 *
 * SECURITY (the core of #13898): the original JWT-path loader performed NO
 * load-time ACL check — it relied on the SDK's spawn-time permission callback.
 * The `/v1` route gates the *primary* on `REMOTE_AGENT` + `VIEW`, and
 * `discoverConnectedAgents` re-checks every handoff target against that same
 * resource type. To keep parity, this helper takes an injectable
 * `checkSubagentAccess`:
 *   - JWT/browser path injects an allow-all check → identical behavior to today.
 *   - `/v1` controllers inject a real `REMOTE_AGENT` + `VIEW` check → a headless
 *     `sk-` API key cannot spawn subagents its user cannot see.
 */

export interface LoadSubagentsParams {
  /** The already-initialized primary agent config (root of the subagent graph). */
  primaryConfig: InitializedAgent;
  /** Root configs whose subagent trees should be resolved (primary + discovered handoff agents). */
  rootConfigs: InitializedAgent[];
}

export interface LoadSubagentsDeps {
  req: ServerRequest;
  /**
   * Load + fully initialize an agent by string id (the closure the caller
   * already uses for handoff/subagent loading — typically wraps `getAgent` +
   * `initializeAgent`). Returns null when missing.
   */
  loadAgentById: (agentId: string) => Promise<InitializedAgent | null>;
  /**
   * Load-time access check for a candidate subagent BEFORE it is loaded.
   * JWT path: allow-all (preserves prior behavior). `/v1` path: REMOTE_AGENT +
   * VIEW. Receives the raw agent doc so `_id` can be checked.
   */
  checkSubagentAccess?: (agent: Agent) => Promise<boolean>;
  /**
   * Fetch the raw agent doc (for the ACL check) without full initialization.
   * Only required when `checkSubagentAccess` is provided.
   */
  getAgent?: (filter: { id: string }) => Promise<Agent | null>;
  /** Graph-size guard: throws when the total subagent node count would be exceeded. */
  assertSubagentGraphRoom: (subagentId: string) => void;
  /** Maximum subagent graph depth (imported constant from the caller). */
  maxSubagentDepth: number;
  /** Agent ids skipped during handoff discovery (missing / no access) — reused here. */
  skippedAgentIds: Set<string>;
  /** Agent ids that are handoff-edge targets (used to classify pure-subagent ids). */
  edgeAgentIds: Set<string>;
  /** OUT: agent ids that are subagents but NOT handoff targets. */
  pureSubagentIds: Set<string>;
  /** OUT: every agent id pulled into the subagent graph. */
  subagentGraphIds: Set<string>;
  /** OUT: config ids for which subagents were loaded. */
  loadedSubagentConfigIds: Set<string>;
  /** State: max resolved depth seen per config id (cycle/redundancy guard). */
  maxResolvedDepthByConfigId: Map<string, number>;
  /**
   * ResourceType the ACL check gates on. Defaults to REMOTE_AGENT for the /v1
   * callers; the JWT path (allow-all check) never consults it.
   */
  resourceType?: string;
}

/**
 * Populate `config.subagentAgentConfigs` for a single config (one BFS level),
 * gated by the per-agent `subagents.enabled` flag and depth/graph guards.
 * Behavior-preserving extraction of the original `loadSubagentsFor` closure,
 * plus the injected load-time ACL check (#13898 security requirement).
 */
async function loadSubagentsFor(
  config: InitializedAgent,
  depth: number,
  params: LoadSubagentsParams,
  deps: LoadSubagentsDeps,
): Promise<void> {
  const { primaryConfig } = params;
  const {
    req,
    loadAgentById,
    checkSubagentAccess,
    getAgent,
    assertSubagentGraphRoom,
    maxSubagentDepth,
    skippedAgentIds,
    edgeAgentIds,
    pureSubagentIds,
    subagentGraphIds,
    loadedSubagentConfigIds,
    resourceType = ResourceType.REMOTE_AGENT,
  } = deps;

  const sub = (config as unknown as { subagents?: { enabled?: boolean; agent_ids?: unknown[] } })
    .subagents;
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
    logger.warn('[loadSubagentsFor] Subagent graph depth limit exceeded', {
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

  const resolved: InitializedAgent[] = [];
  for (const subagentId of explicitSubagentIds) {
    if (skippedAgentIds.has(subagentId)) {
      continue;
    }

    /**
     * Cycle guard: a configuration like A -> B where B lists A as a subagent
     * resolves back to the already-initialized primary rather than reloading.
     */
    if (subagentId === primaryConfig.id) {
      resolved.push(primaryConfig);
      continue;
    }

    assertSubagentGraphRoom(subagentId);

    /**
     * #13898 load-time ACL: on the /v1 path, re-check each candidate subagent
     * against REMOTE_AGENT + VIEW before loading it, matching what
     * `discoverConnectedAgents` does for handoff targets. On the JWT path the
     * injected check is allow-all, so behavior is unchanged.
     */
    if (checkSubagentAccess && getAgent) {
      const rawAgent = await getAgent({ id: subagentId });
      if (!rawAgent) {
        logger.warn(
          `[loadSubagentsFor] Subagent ${subagentId} not found, skipping (orphaned reference)`,
        );
        skippedAgentIds.add(subagentId);
        continue;
      }
      const userId = req.user?.id;
      if (!userId) {
        logger.warn(
          `[loadSubagentsFor] No authenticated user on request, skipping subagent ${subagentId}`,
        );
        skippedAgentIds.add(subagentId);
        continue;
      }
      const hasAccess = await checkSubagentAccess(rawAgent);
      if (!hasAccess) {
        logger.warn(
          `[loadSubagentsFor] User ${userId} lacks VIEW access to subagent ${subagentId} ` +
            `(resourceType=${resourceType}), skipping`,
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

  (config as unknown as { subagentAgentConfigs?: InitializedAgent[] }).subagentAgentConfigs =
    resolved;
}

/**
 * BFS over the subagent graph, resolving each config's subagent tree with a
 * per-config max-depth guard. Behavior-preserving extraction of the original
 * `resolveSubagentTrees` closure.
 */
export async function resolveSubagentTrees(
  params: LoadSubagentsParams,
  deps: LoadSubagentsDeps,
): Promise<void> {
  const { rootConfigs } = params;
  const { maxResolvedDepthByConfigId } = deps;

  const pending: Array<{ cfg: InitializedAgent; depth: number }> = rootConfigs.map((cfg) => ({
    cfg,
    depth: 0,
  }));

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
    await loadSubagentsFor(cfg, depth, params, deps);

    const children =
      (cfg as unknown as { subagentAgentConfigs?: InitializedAgent[] }).subagentAgentConfigs ?? [];
    for (const child of children) {
      const childDepth = depth + 1;
      const previousChildDepth = child?.id
        ? maxResolvedDepthByConfigId.get(child.id)
        : undefined;
      if (child?.id && (previousChildDepth == null || previousChildDepth < childDepth)) {
        pending.push({ cfg: child, depth: childDepth });
      }
    }
  }
}

/**
 * Convenience builder for the `/v1` controllers: produces a REMOTE_AGENT + VIEW
 * `checkSubagentAccess` from the same `checkPermission` dependency the
 * controllers already pass to `discoverConnectedAgents`, so the subagent ACL is
 * literally the same gate as the handoff ACL.
 */
export function buildRemoteAgentSubagentAccessCheck(
  req: ServerRequest,
  checkPermission: CheckAgentPermission,
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
