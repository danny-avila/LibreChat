import { randomUUID } from 'node:crypto';
import {
  AgentCapabilities,
  Constants,
  EModelEndpoint,
  MAX_SUBAGENT_GRAPH_NODES,
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
import { detachOnAbort } from '../utils/promises';
import { OpenIDReauthRequiredError } from '../utils/oidc';
import { resolveReachableGraph } from '../agents/edges';
import { formatMCPServerTools } from '../mcp/tools';
import { checkAccess } from '../middleware/access';
import { getPluginAuthMap } from '../agents/auth';

export class ScheduleMCPError extends Error {
  readonly code: Exclude<ScheduleMCPStatus, 'ready'>;

  constructor(readonly outcomes: ScheduleMCPOutcome[]) {
    let code: Exclude<ScheduleMCPStatus, 'ready'> = 'mcp_unavailable';
    if (outcomes.some((item) => item.status === 'mcp_reauth_required'))
      code = 'mcp_reauth_required';
    if (outcomes.some((item) => item.status === 'mcp_configuration_missing'))
      code = 'mcp_configuration_missing';
    if (outcomes.some((item) => item.status === 'mcp_permission_denied'))
      code = 'mcp_permission_denied';
    super(`${code}: ${JSON.stringify(outcomes)}`);
    this.code = code;
  }
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
    const tools: string[] = [];
    const serverHints = new Set<string>();
    const graphEdges: NonNullable<AgentGraphNode['edges']> = [];
    const explicitSeeds = new Set<string>([agentId]);
    const attempted = new Set<string>();
    const expanded = new Set<string>();
    const accessibleById = new Map<string, AgentGraphNode>();
    const spawned = new Set<string>();
    const accessIdentity = {
      userId: user.id,
      role: user.role,
      idOnTheSource: user.idOnTheSource,
    };
    let accessContext: AgentGraphAccessContext | undefined;
    let modelsConfig: TModelsConfig | undefined;
    type PendingGroup = { ids: string[]; requireAll: boolean; explicitSeed: boolean };
    let pending: PendingGroup[] = [{ ids: [agentId], requireAll: true, explicitSeed: true }];
    while (pending.length > 0) {
      const groups = pending;
      pending = [];
      const frontier = Array.from(
        new Set(
          groups
            .flatMap((group) => group.ids)
            .filter(
              (id) => !attempted.has(id) && id !== '__start__' && id !== '__end__' && id.length > 0,
            ),
        ),
      );
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
      } else if (frontier.length > 0) {
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
      const runnableIds = new Set<string>();
      for (const group of groups) {
        const memberIds = group.ids.filter(
          (id) => id !== '__start__' && id !== '__end__' && id.length > 0,
        );
        if (group.requireAll && memberIds.some((id) => !accessibleById.has(id))) continue;
        for (const id of memberIds) {
          if (!accessibleById.has(id)) continue;
          runnableIds.add(id);
          if (group.explicitSeed) explicitSeeds.add(id);
        }
      }
      for (const id of runnableIds) {
        if (expanded.has(id)) continue;
        expanded.add(id);
        const agent = accessibleById.get(id);
        if (!agent) continue;
        graphEdges.push(...(agent.edges ?? []));
        for (const childId of agent.agent_ids ?? []) {
          pending.push({ ids: [childId], requireAll: false, explicitSeed: true });
        }
        for (const edge of agent.edges ?? []) {
          for (const childId of [edge.from, edge.to].flat()) {
            pending.push({ ids: [childId], requireAll: false, explicitSeed: false });
          }
        }
        if (!agent.subagents?.enabled) continue;
        const config = await loadAppConfig();
        const capabilities = config?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? [];
        if (!capabilities.includes(AgentCapabilities.subagents)) continue;
        const directTargets = (agent.subagents.agent_ids ?? []).filter((id) => id !== agentId);
        const graphGroups = (agent.subagents.graphs ?? []).map((graph) => ({
          ids: (graph.agent_ids ?? []).filter((memberId) => memberId !== agentId),
          requireAll: true,
          explicitSeed: true,
        }));
        const spawnTargets = [...directTargets, ...graphGroups.flatMap((group) => group.ids)];
        for (const id of spawnTargets) spawned.add(id);
        if (spawned.size > MAX_SUBAGENT_GRAPH_NODES) throw new ScheduleMCPError([]);
        pending.push(
          ...directTargets.map((childId) => ({
            ids: [childId],
            requireAll: false,
            explicitSeed: true,
          })),
          ...graphGroups,
        );
      }
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
      tools.push(...(agent.tools ?? []).filter((tool) => !isActionTool(tool)));
      for (const name of agent.mcpServerNames ?? []) serverHints.add(name);
    }
    const selectedTools = tools.filter(
      (tool) =>
        tool.includes(Constants.mcp_delimiter) &&
        !tool.startsWith(`${Constants.mcp_server}${Constants.mcp_delimiter}`),
    );
    if (selectedTools.length === 0) return [];

    const effectiveConfig = await loadAppConfig();
    const rawConfig = effectiveConfig?.mcpConfig ?? {};
    const candidateNames = Array.from(new Set([...serverHints, ...Object.keys(rawConfig)]));
    const aliases = buildServerNameAliases(candidateNames);
    const candidates = [...candidateNames, ...aliases.keys()];
    const selected = new Map<string, string[]>();
    for (const tool of selectedTools) {
      const [, name] = splitMCPToolKey(tool, candidates);
      if (!name) continue;
      const server = candidateNames.includes(name) ? name : (aliases.get(name) ?? name);
      const required = selected.get(server) ?? [];
      if (!tool.startsWith(`${Constants.mcp_all}${Constants.mcp_delimiter}`)) {
        required.push(normalizeMCPToolKey(tool, candidateNames));
      }
      selected.set(server, required);
    }
    const capabilities = effectiveConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? [];
    if (!capabilities.includes(AgentCapabilities.tools)) {
      throw new ScheduleMCPError(
        [...selected.keys()].map((server) => ({ server, status: 'mcp_configuration_missing' })),
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
        [...selected.keys()].map((server) => ({ server, status: 'mcp_permission_denied' })),
      );
    }
    const selectedRawConfig = Object.fromEntries(
      Object.entries(rawConfig).filter(([serverName]) => selected.has(serverName)),
    );
    const config = await deps.ensureConfigServers(selectedRawConfig);
    const servers = await deps.getServerConfigs(user.id, config, user.role);
    throwIfAborted();
    const shadowed = findShadowedServerNames(Object.keys(servers));
    const auth = await getPluginAuthMap({
      userId: user.id,
      pluginKeys: [...selected.keys()].map((server) => `${Constants.mcp_prefix}${server}`),
      throwError: true,
      findPluginAuthsByKeys: deps.findPluginAuthsByKeys,
    });
    const context = createMCPRequestContext();
    const limit = createConcurrencyLimiter(options.concurrency);
    const requestBody = {
      messageId: randomUUID(),
      conversationId: randomUUID(),
      parentMessageId: String(Constants.NO_PARENT),
    };
    let outcomes: ScheduleMCPOutcome[];
    try {
      outcomes = await Promise.all(
        [...selected].map(([server, required]) =>
          limit(async (): Promise<ScheduleMCPOutcome> => {
            throwIfAborted();
            const serverConfig = servers[server];
            const customUserVars = auth[`${Constants.mcp_prefix}${server}`];
            if (
              !serverConfig ||
              shadowed.has(server) ||
              getMissingCustomUserVars(serverConfig, customUserVars).length > 0
            ) {
              return { server, status: 'mcp_configuration_missing' };
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
              const available = new Set(Object.keys(formatMCPServerTools(server, snapshot.tools)));
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
              return { server, status };
            } catch (error) {
              return {
                server,
                status:
                  reauth ||
                  error instanceof MCPAuthenticationRejectedError ||
                  error instanceof OpenIDReauthRequiredError ||
                  error instanceof MCPOAuthSecretReentryRequiredError ||
                  isOAuthAuthenticationError(error)
                    ? 'mcp_reauth_required'
                    : 'mcp_unavailable',
              };
            }
          }),
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
