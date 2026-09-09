import { randomUUID } from 'node:crypto';
import {
  AgentCapabilities,
  Constants,
  EModelEndpoint,
  MAX_SUBAGENT_DEPTH,
  MAX_SUBAGENT_GRAPH_NODES,
  MAX_SUBAGENT_RUN_CONFIGS,
  Permissions,
  PermissionTypes,
  isActionTool,
  buildServerNameAliases,
  normalizeMCPToolKey,
  normalizeServerName,
  resolveModelCatalogKey,
} from 'librechat-data-provider';
import type {
  IUser,
  AppConfig,
  PluginAuthMethods,
  AgentGraphNode,
  AgentGraphAccessContext,
} from '@librechat/data-schemas';
import type { TModelsConfig, ScheduleMCPStatus, ScheduleMCPOutcome } from 'librechat-data-provider';
import type { ParsedServerConfig, UserMCPConnectionOptions } from '../mcp/types';
import type { CheckAccessParams } from '../middleware/access';
import type { MCPToolsSnapshot } from '../mcp/connection';
import type { GetAppConfigOptions } from '../app/service';
import type { ScheduleMCPPreflight } from './types';
import {
  MCPAuthenticationRejectedError,
  MCPOAuthSecretReentryRequiredError,
  isOAuthAuthenticationError,
} from '../mcp/errors';
import {
  getMissingCustomUserVars,
  splitMCPToolKey,
  findShadowedServerNames,
  createDeadlineAbortSignal,
} from '../mcp/utils';
import { createMCPRequestContext, cleanupMCPRequestContext } from '../mcp/request';
import { getAppConfigOptionsFromUser } from '../app/service';
import { createConcurrencyLimiter } from '../utils/promise';
import { OpenIDReauthRequiredError } from '../utils/oidc';
import { resolveReachableGraph } from '../agents/edges';
import { formatMCPServerTools } from '../mcp/tools';
import { checkAccess } from '../middleware/access';
import { detachOnAbort } from '../utils/promises';
import { getPluginAuthMap } from '../agents/auth';

// The public schedule schema caps mcpPreflightConcurrency at 10. Keep the same
// ceiling across every preflight owned by this process so concurrent schedules
// cannot multiply that per-request fan-out into an unbounded connection burst.
const MAX_SHARED_MCP_PREFLIGHT_CONCURRENCY = 10;

export class ScheduleMCPError extends Error {
  readonly code: Exclude<ScheduleMCPStatus, 'ready'>;

  constructor(readonly outcomes: ScheduleMCPOutcome[]) {
    const code = getScheduleMCPFailureCode(outcomes);
    super(`${code}: ${JSON.stringify(outcomes)}`);
    this.code = code;
  }
}

/** One response discriminator for every schedule admission surface. */
export function getScheduleMCPFailureCode(
  outcomes: ScheduleMCPOutcome[],
): Exclude<ScheduleMCPStatus, 'ready'> {
  if (outcomes.some((item) => item.status === 'mcp_permission_denied'))
    return 'mcp_permission_denied';
  if (outcomes.some((item) => item.status === 'mcp_configuration_missing'))
    return 'mcp_configuration_missing';
  if (outcomes.some((item) => item.status === 'mcp_reauth_required')) return 'mcp_reauth_required';
  return 'mcp_unavailable';
}

interface ScheduleMCPDeps {
  resolveAgentGraphAccess: (access: {
    userId: string;
    role?: string | null;
    idOnTheSource?: string | null;
  }) => Promise<AgentGraphAccessContext>;
  getAgentGraphNodes: (
    ids: string[],
    access?: AgentGraphAccessContext,
  ) => Promise<AgentGraphNode[]>;
  getModelsConfig: (user: IUser) => Promise<TModelsConfig>;
  getRoleByName: CheckAccessParams['getRoleByName'];
  getUser: (id: string) => Promise<IUser | null>;
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig | undefined>;
  ensureConfigServers: (
    config: NonNullable<AppConfig['mcpConfig']>,
    limit?: <T>(task: () => Promise<T>) => Promise<T>,
  ) => Promise<Record<string, ParsedServerConfig>>;
  getServerConfigs: (
    userId: string,
    config: Record<string, ParsedServerConfig>,
    role?: string,
  ) => Promise<Record<string, ParsedServerConfig>>;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
  connect: (options: UserMCPConnectionOptions) => Promise<{
    fetchToolsSnapshot: (deadlineMs?: number, signal?: AbortSignal) => Promise<MCPToolsSnapshot>;
  }>;
}

/** Probes only persisted identity and credentials, with isolated user connections and no OAuth wait. */
export function createScheduleMCPPreflight(deps: ScheduleMCPDeps): ScheduleMCPPreflight {
  const sharedProbeLimit = createConcurrencyLimiter(MAX_SHARED_MCP_PREFLIGHT_CONCURRENCY);
  const runPreflight: ScheduleMCPPreflight = async (agentId, principal, options) => {
    const signal = options.signal;
    const throwIfAborted = () => {
      if (signal?.aborted) throw signal.reason ?? new Error('MCP preflight aborted');
    };
    throwIfAborted();
    const user = await deps.getUser(principal.id);
    throwIfAborted();
    if (!user) throw new ScheduleMCPError([]);
    user.id = principal.id;
    let appConfig: AppConfig | undefined;
    const loadAppConfig = async (): Promise<AppConfig | undefined> => {
      appConfig ??= await deps.getAppConfig({
        ...getAppConfigOptionsFromUser(user),
        failClosed: true,
      });
      return appConfig;
    };
    const tools: Array<{ name: string; agentId: string }> = [];
    const serverHints = new Set<string>();
    const graphEdges: NonNullable<AgentGraphNode['edges']> = [];
    const explicitSeeds = new Set<string>([agentId]);
    const attempted = new Set<string>();
    const expanded = new Set<string>();
    const expandedHandoffs = new Set<string>();
    const expandedHandoffEdges = new Set<string>();
    const viewableById = new Map<string, AgentGraphNode>();
    const accessibleById = new Map<string, AgentGraphNode>();
    const subagentGraphIds = new Set<string>();
    const accessIdentity = {
      userId: user.id,
      role: user.role,
      idOnTheSource: user.idOnTheSource,
    };
    let accessContext: AgentGraphAccessContext | undefined;
    let modelsConfig: TModelsConfig | undefined;

    const loadNodes = async (ids: string[]): Promise<void> => {
      const frontier = [...new Set(ids)].filter(
        (id) => !attempted.has(id) && id !== '__start__' && id !== '__end__' && id.length > 0,
      );
      if (frontier.length === 0) return;
      frontier.forEach((id) => attempted.add(id));
      let loaded: AgentGraphNode[] = [];
      if (frontier.includes(agentId)) {
        const root = await deps.getAgentGraphNodes([agentId]);
        const descendants = frontier.filter((id) => id !== agentId);
        loaded = [
          ...root,
          ...(descendants.length > 0
            ? await deps.getAgentGraphNodes(
                descendants,
                (accessContext ??= await deps.resolveAgentGraphAccess(accessIdentity)),
              )
            : []),
        ];
      } else {
        loaded = await deps.getAgentGraphNodes(
          frontier,
          (accessContext ??= await deps.resolveAgentGraphAccess(accessIdentity)),
        );
      }
      throwIfAborted();
      const descendants = loaded.filter((agent) => agent.id !== agentId);
      if (descendants.length > 0) {
        modelsConfig ??= await deps.getModelsConfig(user);
      }
      for (const agent of loaded) {
        viewableById.set(agent.id, agent);
        const availableModels =
          agent.id === agentId
            ? undefined
            : modelsConfig?.[resolveModelCatalogKey(agent.provider, modelsConfig)];
        if (
          agent.id === agentId ||
          (agent.model.length > 0 && availableModels?.includes(agent.model) === true)
        ) {
          accessibleById.set(agent.id, agent);
        }
      }
    };

    // Match discoverConnectedAgents first: handoff agents are initialized and pruned
    // before any isolated subagent descriptors or graph definitions are considered.
    type HandoffCandidate = { id: string; expandEdges: boolean };
    let handoffFrontier: HandoffCandidate[] = [{ id: agentId, expandEdges: true }];
    while (handoffFrontier.length > 0) {
      const frontier = handoffFrontier;
      handoffFrontier = [];
      await loadNodes(frontier.map(({ id }) => id));
      for (const { id, expandEdges } of frontier) {
        const agent = accessibleById.get(id);
        if (!agent) continue;
        expandedHandoffs.add(id);
        expanded.add(id);
        if (agent.id === agentId) {
          let previousId = agent.id;
          for (const childId of agent.agent_ids ?? []) {
            if (childId === agent.id || childId.length === 0) continue;
            graphEdges.push({ from: previousId, to: childId });
            // discoverConnectedAgents initializes legacy chain members only after
            // recursive handoff discovery and never collects their persisted edges.
            handoffFrontier.push({ id: childId, expandEdges: false });
            previousId = childId;
          }
        }
        if (!expandEdges || expandedHandoffEdges.has(id)) continue;
        expandedHandoffEdges.add(id);
        graphEdges.push(...(agent.edges ?? []));
        for (const edge of agent.edges ?? []) {
          handoffFrontier.push(
            ...[edge.from, edge.to].flat().map((childId) => ({
              id: childId,
              expandEdges: true,
            })),
          );
        }
      }
    }

    const handoffSkippedIds = new Set(
      [...attempted].filter((id) => id !== agentId && !accessibleById.has(id)),
    );
    const { reachable: reachableHandoffIds } = resolveReachableGraph(
      new Set([agentId]),
      expandedHandoffs,
      graphEdges,
      handoffSkippedIds,
    );
    const rootConfigs = [...reachableHandoffIds]
      .map((id) => accessibleById.get(id))
      .filter((agent): agent is AgentGraphNode => agent != null);
    const rootConfigIds = new Set(rootConfigs.map((agent) => agent.id));
    const directValidationContexts: Array<{ id: string; ancestors: Set<string> }> = [];
    const acceptedGraphCounts = new Map<string, number>();
    let expandedSubagentConfigs = 0;
    let subagentsAvailable: boolean | undefined;
    const canUseSubagents = async (): Promise<boolean> => {
      if (subagentsAvailable != null) return subagentsAvailable;
      const config = await loadAppConfig();
      subagentsAvailable = (
        config?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? []
      ).includes(AgentCapabilities.subagents);
      return subagentsAvailable;
    };
    const addGraphBudgetMember = (id: string): void => {
      if (id === agentId || subagentGraphIds.has(id)) return;
      if (subagentGraphIds.size >= MAX_SUBAGENT_GRAPH_NODES) {
        throw new Error(
          `Subagent graph exceeds the maximum of ${MAX_SUBAGENT_GRAPH_NODES} unique agents.`,
        );
      }
      subagentGraphIds.add(id);
    };
    const countExpandedSubagentConfig = (): void => {
      expandedSubagentConfigs += 1;
      if (expandedSubagentConfigs > MAX_SUBAGENT_RUN_CONFIGS) {
        throw new Error(
          `Subagent run configuration exceeds the maximum of ${MAX_SUBAGENT_RUN_CONFIGS} expanded entries.`,
        );
      }
    };
    const includeGraph = async (ids: string[], parentRunnable: boolean): Promise<boolean> => {
      await loadNodes(ids);
      if (!parentRunnable || ids.some((id) => !accessibleById.has(id))) return false;
      for (const id of ids) {
        explicitSeeds.add(id);
        expanded.add(id);
      }
      return true;
    };
    const processDirectGraphs = async (
      agent: AgentGraphNode,
      parentRunnable: boolean,
    ): Promise<void> => {
      if (!agent.subagents?.enabled || !(await canUseSubagents())) return;
      const definitions = agent.subagents.graphs ?? [];
      const memberIds = [...new Set(definitions.flatMap((graph) => graph.agent_ids ?? []))].filter(
        (id) => id !== agent.id && id !== agentId && !rootConfigIds.has(id),
      );
      const staged = memberIds.filter((id) => !subagentGraphIds.has(id));
      if (subagentGraphIds.size + staged.length > MAX_SUBAGENT_GRAPH_NODES) {
        throw new Error(
          `Subagent graph exceeds the maximum of ${MAX_SUBAGENT_GRAPH_NODES} unique agents.`,
        );
      }
      staged.forEach((id) => subagentGraphIds.add(id));
      await loadNodes(memberIds);
      for (const definition of definitions) {
        const ids = [...new Set(definition.agent_ids ?? [])];
        if (await includeGraph(ids, parentRunnable)) {
          acceptedGraphCounts.set(agent.id, (acceptedGraphCounts.get(agent.id) ?? 0) + 1);
        }
      }
    };
    const visitDirectTree = async (
      agent: AgentGraphNode,
      depth: number,
      ancestors: Set<string>,
      parentRunnable: boolean,
    ): Promise<void> => {
      if (!agent.subagents?.enabled || !(await canUseSubagents())) return;
      if (agent.subagents.allowSelf !== false) countExpandedSubagentConfig();
      const directIds = [...new Set(agent.subagents.agent_ids ?? [])].filter(
        (id) => id.length > 0 && id !== agent.id,
      );
      if (directIds.length > 0 && depth >= MAX_SUBAGENT_DEPTH) {
        throw new Error(
          `Subagent graph exceeds the maximum depth of ${MAX_SUBAGENT_DEPTH} at agent ${agent.id}.`,
        );
      }
      await loadNodes(directIds);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(agent.id);
      for (const childId of directIds) {
        if (nextAncestors.has(childId) || handoffSkippedIds.has(childId)) continue;
        // Lazy runtime initialization loads VIEW-checked metadata before model
        // validation. Even an invalid-model descriptor consumes depth, expanded-
        // config, and graph-node budgets, but its MCP tools can never execute.
        const child = viewableById.get(childId);
        if (!child) continue;
        addGraphBudgetMember(childId);
        countExpandedSubagentConfig();
        const childRunnable = parentRunnable && accessibleById.has(childId);
        if (childRunnable) {
          directValidationContexts.push({ id: childId, ancestors: nextAncestors });
          explicitSeeds.add(childId);
          expanded.add(childId);
        }
        await visitDirectTree(child, depth + 1, nextAncestors, childRunnable);
        // initializeClient preloads a direct child's graph members only after its
        // complete nested direct tree, before root-level graphs are resolved.
        await processDirectGraphs(child, childRunnable);
      }
    };

    for (const root of rootConfigs) {
      await visitDirectTree(root, 0, new Set(), true);
    }
    // Root and handoff graph definitions run after every direct tree. Each definition
    // is skipped atomically when its new members would exceed the shared runtime budget.
    for (const root of rootConfigs) {
      if (!root.subagents?.enabled || !(await canUseSubagents())) continue;
      for (const definition of root.subagents.graphs ?? []) {
        const ids = [...new Set(definition.agent_ids ?? [])];
        const staged = ids.filter(
          (id) => id !== agentId && !rootConfigIds.has(id) && !subagentGraphIds.has(id),
        );
        if (subagentGraphIds.size + staged.length > MAX_SUBAGENT_GRAPH_NODES) continue;
        staged.forEach((id) => subagentGraphIds.add(id));
        if (await includeGraph(ids, true)) {
          acceptedGraphCounts.set(root.id, (acceptedGraphCounts.get(root.id) ?? 0) + 1);
        }
      }
    }
    const validateRunConfigTree = (
      agent: AgentGraphNode,
      state: { count: number },
      ancestors: Set<string>,
    ): void => {
      if (!agent.subagents?.enabled || subagentsAvailable !== true) return;
      const count = (): void => {
        state.count += 1;
        if (state.count > MAX_SUBAGENT_RUN_CONFIGS) {
          throw new Error(
            `Subagent run configuration exceeds the maximum of ${MAX_SUBAGENT_RUN_CONFIGS} expanded entries.`,
          );
        }
      };
      if (agent.subagents.allowSelf !== false) count();
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(agent.id);
      for (const childId of new Set(agent.subagents.agent_ids ?? [])) {
        if (childId === agent.id || nextAncestors.has(childId)) continue;
        const child = viewableById.get(childId);
        if (!child) continue;
        count();
        // Only already initialized handoff configs are eager in the initial run.
        // Other direct children resolve lazily with their own fresh counter below.
        if (rootConfigIds.has(childId)) {
          validateRunConfigTree(child, state, nextAncestors);
        }
      }
      for (let index = 0; index < (acceptedGraphCounts.get(agent.id) ?? 0); index++) count();
    };
    const initialRunState = { count: 0 };
    for (const root of rootConfigs) {
      validateRunConfigTree(root, initialRunState, new Set());
    }
    for (const { id: directId, ancestors } of directValidationContexts) {
      if (rootConfigIds.has(directId)) continue;
      const direct = accessibleById.get(directId);
      if (!direct) continue;
      // createLazySubagentConfig seeds the selected child's resolution at one.
      validateRunConfigTree(direct, { count: 1 }, ancestors);
    }
    const skippedAgentIds = new Set(
      [...attempted].filter((id) => id !== agentId && !accessibleById.has(id)),
    );
    const { reachable } = resolveReachableGraph(
      explicitSeeds,
      expanded,
      graphEdges,
      skippedAgentIds,
    );
    for (const id of reachable) {
      const agent = accessibleById.get(id);
      if (!agent || !expanded.has(id)) continue;
      tools.push(
        ...(agent.tools ?? [])
          .filter((tool) => !isActionTool(tool))
          .map((name) => ({ name, agentId: agent.id })),
      );
      for (const name of agent.mcpServerNames ?? []) serverHints.add(name);
    }
    const selectedTools = tools.filter(
      ({ name }) =>
        name.includes(Constants.mcp_delimiter) &&
        !name.startsWith(`${Constants.mcp_server}${Constants.mcp_delimiter}`),
    );
    if (selectedTools.length === 0) return [];

    const effectiveConfig = await loadAppConfig();
    const rawConfig = effectiveConfig?.mcpConfig ?? {};
    const candidateNames = Array.from(new Set([...serverHints, ...Object.keys(rawConfig)]));
    const aliases = buildServerNameAliases(candidateNames);
    const candidates = [...candidateNames, ...aliases.keys()];
    const selected = new Map<string, string[]>();
    const serverAgentIds = new Map<string, Set<string>>();
    const toolAgentIds = new Map<string, Map<string, Set<string>>>();
    for (const { name: tool, agentId: toolAgentId } of selectedTools) {
      const [, name] = splitMCPToolKey(tool, candidates);
      if (!name) continue;
      const server = candidateNames.includes(name) ? name : (aliases.get(name) ?? name);
      const owners = serverAgentIds.get(server) ?? new Set<string>();
      owners.add(toolAgentId);
      serverAgentIds.set(server, owners);
      const required = selected.get(server) ?? [];
      if (!tool.startsWith(`${Constants.mcp_all}${Constants.mcp_delimiter}`)) {
        const normalizedTool = normalizeMCPToolKey(tool, candidateNames);
        required.push(normalizedTool);
        const serverTools = toolAgentIds.get(server) ?? new Map<string, Set<string>>();
        const toolOwners = serverTools.get(normalizedTool) ?? new Set<string>();
        toolOwners.add(toolAgentId);
        serverTools.set(normalizedTool, toolOwners);
        toolAgentIds.set(server, serverTools);
      }
      selected.set(server, required);
    }
    const outcome = (
      server: string,
      status: ScheduleMCPStatus,
      preferredOwners?: Set<string>,
    ): ScheduleMCPOutcome => {
      const owners = preferredOwners ?? serverAgentIds.get(server);
      const outcomeAgentId = owners?.has(agentId) ? undefined : owners?.values().next().value;
      return { server, status, ...(outcomeAgentId ? { agentId: outcomeAgentId } : {}) };
    };
    const capabilities = effectiveConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? [];
    if (!capabilities.includes(AgentCapabilities.tools)) {
      throw new ScheduleMCPError(
        [...selected.keys()].map((server) => outcome(server, 'mcp_configuration_missing')),
      );
    }
    if (
      !(await checkAccess({
        user,
        permissionType: PermissionTypes.MCP_SERVERS,
        permissions: [Permissions.USE],
        getRoleByName: deps.getRoleByName,
      }))
    ) {
      throw new ScheduleMCPError(
        [...selected.keys()].map((server) => outcome(server, 'mcp_permission_denied')),
      );
    }
    const rawServerNames = [
      ...Object.keys(rawConfig),
      ...[...serverHints].filter((name) => !(name in rawConfig)),
    ];
    const shadowed = findShadowedServerNames(rawServerNames);
    const selectedRawConfig = Object.fromEntries(
      Object.entries(rawConfig).filter(([serverName]) => selected.has(serverName)),
    );
    const requestProbeLimit = createConcurrencyLimiter(options.concurrency);
    const config = await deps.ensureConfigServers(selectedRawConfig, (task) =>
      requestProbeLimit(() => {
        throwIfAborted();
        return sharedProbeLimit(async () => {
          throwIfAborted();
          return task();
        });
      }),
    );
    const servers = await deps.getServerConfigs(user.id, config, user.role);
    throwIfAborted();
    const auth = await getPluginAuthMap({
      userId: user.id,
      pluginKeys: [...selected.keys()].map((server) => `${Constants.mcp_prefix}${server}`),
      throwError: true,
      findPluginAuthsByKeys: deps.findPluginAuthsByKeys,
    });
    const context = createMCPRequestContext();
    const requestBody = {
      messageId: randomUUID(),
      conversationId: randomUUID(),
      parentMessageId: String(Constants.NO_PARENT),
    };
    let outcomes: ScheduleMCPOutcome[];
    try {
      outcomes = await Promise.all(
        [...selected].map(([server, required]) =>
          requestProbeLimit(() =>
            sharedProbeLimit(async (): Promise<ScheduleMCPOutcome> => {
              throwIfAborted();
              const serverConfig = servers[server];
              const customUserVars = auth[`${Constants.mcp_prefix}${server}`];
              if (
                !serverConfig ||
                shadowed.has(server) ||
                getMissingCustomUserVars(serverConfig, customUserVars).length > 0
              ) {
                return outcome(server, 'mcp_configuration_missing');
              }
              let reauth = false;
              try {
                const connection = await deps.connect({
                  user,
                  serverName: server,
                  serverConfig,
                  customUserVars,
                  requestBody,
                  requestScopedConnections: context,
                  ephemeralConnection: true,
                  returnOnOAuth: true,
                  oauthStart: async () => {
                    reauth = true;
                  },
                  signal,
                });
                const snapshot = await connection.fetchToolsSnapshot(options.deadlineMs, signal);
                if (snapshot.authenticationError) throw snapshot.authenticationError;
                const available = new Set(
                  Object.keys(formatMCPServerTools(server, snapshot.tools)),
                );
                for (const tool of snapshot.tools) {
                  available.add(
                    `${tool.name}${Constants.mcp_delimiter}${normalizeServerName(server)}`,
                  );
                }
                let status: ScheduleMCPStatus = 'ready';
                if (reauth) {
                  status = 'mcp_reauth_required';
                } else if (!snapshot.complete) {
                  status = 'mcp_unavailable';
                } else if (available.size === 0 || !required.every((tool) => available.has(tool))) {
                  status = 'mcp_configuration_missing';
                }
                const missingTool =
                  status === 'mcp_configuration_missing'
                    ? required.find((tool) => !available.has(tool))
                    : undefined;
                return outcome(
                  server,
                  status,
                  missingTool ? toolAgentIds.get(server)?.get(missingTool) : undefined,
                );
              } catch (error) {
                return outcome(
                  server,
                  reauth ||
                    error instanceof MCPAuthenticationRejectedError ||
                    error instanceof OpenIDReauthRequiredError ||
                    error instanceof MCPOAuthSecretReentryRequiredError ||
                    isOAuthAuthenticationError(error)
                    ? 'mcp_reauth_required'
                    : 'mcp_unavailable',
                );
              }
            }),
          ),
        ),
      );
    } finally {
      await cleanupMCPRequestContext(context);
    }
    if (outcomes.some((item) => item.status !== 'ready')) throw new ScheduleMCPError(outcomes);
    return outcomes;
  };
  return (agentId, principal, options) => {
    const signal = createDeadlineAbortSignal(options.deadlineMs, options.signal);
    return detachOnAbort(runPreflight(agentId, principal, { ...options, signal }), signal);
  };
}
