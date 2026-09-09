import { randomUUID } from 'node:crypto';
import {
  AgentCapabilities,
  Constants,
  EModelEndpoint,
  MAX_SUBAGENT_GRAPH_NODES,
  Permissions,
  PermissionBits,
  PermissionTypes,
  ResourceType,
  isActionTool,
  buildServerNameAliases,
  normalizeMCPToolKey,
  normalizeServerName,
} from 'librechat-data-provider';
import type { IAgent, IUser, AppConfig, PluginAuthMethods } from '@librechat/data-schemas';
import type { ScheduleMCPStatus, ScheduleMCPOutcome } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
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
import { getMissingCustomUserVars, splitMCPToolKey, findShadowedServerNames } from '../mcp/utils';
import { createMCPRequestContext, cleanupMCPRequestContext } from '../mcp/request';
import { getAppConfigOptionsFromUser } from '../app/service';
import { createConcurrencyLimiter } from '../utils/promise';
import { OpenIDReauthRequiredError } from '../utils/oidc';
import { formatMCPServerTools } from '../mcp/tools';
import { checkAccess } from '../middleware/access';
import { getPluginAuthMap } from '../agents/auth';

const MCP_PREFLIGHT_CONCURRENCY = 3;

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
  getAgents: (
    ids: string[],
  ) => Promise<Array<Pick<IAgent, '_id' | 'id' | 'tools' | 'agent_ids' | 'edges' | 'subagents'>>>;
  getUserPrincipals: (params: {
    userId: string;
    role?: string;
    idOnTheSource?: string | null;
  }) => Promise<TPrincipal[]>;
  findAccessibleResources: (
    principals: TPrincipal[],
    resourceType: string,
    requiredPermissions: number,
    resourceIds: unknown[],
  ) => Promise<unknown[]>;
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
  return async (agentId, principal, options) => {
    const signal = options?.signal;
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
    const visited = new Set<string>();
    const spawned = new Set<string>();
    let principals: TPrincipal[] | undefined;
    let pending = [agentId];
    while (pending.length > 0) {
      const frontier = Array.from(
        new Set(pending.filter((id) => !visited.has(id) && id !== '__start__' && id !== '__end__')),
      );
      pending = [];
      if (frontier.length === 0) break;
      frontier.forEach((id) => visited.add(id));
      const loaded = await deps.getAgents(frontier);
      throwIfAborted();
      const byId = new Map(loaded.map((agent) => [agent.id, agent]));
      const candidates = loaded.filter((agent) => agent.id !== agentId);
      let viewableAgentIds = new Set<string>();
      if (candidates.length > 0) {
        principals ??= await deps.getUserPrincipals({
          userId: user.id,
          role: user.role,
          idOnTheSource: user.idOnTheSource,
        });
        const ids = await deps.findAccessibleResources(
          principals,
          ResourceType.AGENT,
          PermissionBits.VIEW,
          candidates.map((agent) => agent._id),
        );
        throwIfAborted();
        viewableAgentIds = new Set(ids.map(String));
      }
      const accessible = frontier.map((id) => {
        const agent = byId.get(id);
        if (!agent || (id !== agentId && !viewableAgentIds?.has(String(agent._id)))) return null;
        return agent;
      });
      for (const agent of accessible) {
        if (!agent) continue;
        tools.push(...(agent.tools ?? []).filter((tool) => !isActionTool(tool)));
        pending.push(...(agent.agent_ids ?? []));
        for (const edge of agent.edges ?? []) pending.push(...[edge.from, edge.to].flat());
        if (!agent.subagents?.enabled) continue;
        const config = await loadAppConfig();
        const capabilities = config?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? [];
        if (!capabilities.includes(AgentCapabilities.subagents)) continue;
        const spawnTargets = [
          ...(agent.subagents.agent_ids ?? []),
          ...(agent.subagents.graphs ?? []).flatMap((graph) => graph.agent_ids ?? []),
        ].filter((id) => id !== agentId);
        for (const id of spawnTargets) spawned.add(id);
        if (spawned.size > MAX_SUBAGENT_GRAPH_NODES) throw new ScheduleMCPError([]);
        pending.push(...spawnTargets);
      }
    }
    const selectedTools = tools.filter(
      (tool) =>
        tool.includes(Constants.mcp_delimiter) &&
        !tool.startsWith(`${Constants.mcp_server}${Constants.mcp_delimiter}`),
    );
    if (selectedTools.length === 0) return [];

    const effectiveConfig = await loadAppConfig();
    const config = await deps.ensureConfigServers(effectiveConfig?.mcpConfig ?? {});
    const servers = await deps.getServerConfigs(principal.id, config, principal.role);
    throwIfAborted();
    const aliases = buildServerNameAliases(Object.keys(servers));
    const shadowed = findShadowedServerNames(Object.keys(servers));
    const candidates = [...Object.keys(servers), ...aliases.keys()];
    const selected = new Map<string, string[]>();
    for (const tool of selectedTools) {
      const [, name] = splitMCPToolKey(tool, candidates);
      if (!name) continue;
      const server = servers[name] ? name : (aliases.get(name) ?? name);
      const required = selected.get(server) ?? [];
      if (!tool.startsWith(`${Constants.mcp_all}${Constants.mcp_delimiter}`)) {
        required.push(normalizeMCPToolKey(tool, Object.keys(servers)));
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
    const auth = await getPluginAuthMap({
      userId: principal.id,
      pluginKeys: [...selected.keys()].map((server) => `${Constants.mcp_prefix}${server}`),
      throwError: true,
      findPluginAuthsByKeys: deps.findPluginAuthsByKeys,
    });
    const context = createMCPRequestContext();
    const limit = createConcurrencyLimiter(MCP_PREFLIGHT_CONCURRENCY);
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
              const snapshot = await connection.fetchToolsSnapshot(undefined, signal);
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
}
