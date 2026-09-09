import { randomUUID } from 'node:crypto';
import {
  Constants,
  isActionTool,
  buildServerNameAliases,
  normalizeMCPToolKey,
  normalizeServerName,
} from 'librechat-data-provider';
import type { IAgent, IUser, AppConfig, PluginAuthMethods } from '@librechat/data-schemas';
import type { ScheduleMCPStatus, ScheduleMCPOutcome } from 'librechat-data-provider';
import type { ParsedServerConfig, UserMCPConnectionOptions } from '../mcp/types';
import type { MCPToolsSnapshot } from '../mcp/connection';
import type { GetAppConfigOptions } from '../app/service';
import type { ScheduleMCPPreflight } from './types';
import { MCPAuthenticationRejectedError, MCPOAuthSecretReentryRequiredError } from '../mcp/errors';
import { getMissingCustomUserVars, splitMCPToolKey, findShadowedServerNames } from '../mcp/utils';
import { createMCPRequestContext, cleanupMCPRequestContext } from '../mcp/request';
import { getAppConfigOptionsFromUser } from '../app/service';
import { isOAuthAuthenticationError } from '../mcp/errors';
import { OpenIDReauthRequiredError } from '../utils/oidc';
import { formatMCPServerTools } from '../mcp/tools';
import { getPluginAuthMap } from '../agents/auth';

export class ScheduleMCPError extends Error {
  readonly code: Exclude<ScheduleMCPStatus, 'ready'>;

  constructor(readonly outcomes: ScheduleMCPOutcome[]) {
    let code: Exclude<ScheduleMCPStatus, 'ready'> = 'mcp_unavailable';
    if (outcomes.some((item) => item.status === 'mcp_reauth_required'))
      code = 'mcp_reauth_required';
    if (outcomes.some((item) => item.status === 'mcp_configuration_missing'))
      code = 'mcp_configuration_missing';
    super(`${code}: ${JSON.stringify(outcomes)}`);
    this.code = code;
  }
}

interface ScheduleMCPDeps {
  getAgent: (id: string) => Promise<Pick<IAgent, 'tools' | 'agent_ids' | 'edges'> | null>;
  canUseMCP: (user: IUser) => Promise<boolean>;
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
  connect: (
    options: UserMCPConnectionOptions,
  ) => Promise<{ fetchToolsSnapshot: () => Promise<MCPToolsSnapshot> }>;
}

/** Probes only persisted identity and credentials, with isolated user connections and no OAuth wait. */
export function createScheduleMCPPreflight(deps: ScheduleMCPDeps): ScheduleMCPPreflight {
  return async (agentId, principal) => {
    const tools: string[] = [];
    const visited = new Set<string>();
    const pending = [agentId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (visited.has(id) || id === '__start__' || id === '__end__') continue;
      visited.add(id);
      const agent = await deps.getAgent(id);
      if (!agent) throw new ScheduleMCPError([{ server: id, status: 'mcp_configuration_missing' }]);
      tools.push(...(agent.tools ?? []).filter((tool) => !isActionTool(tool)));
      pending.push(...(agent.agent_ids ?? []));
      for (const edge of agent.edges ?? []) {
        pending.push(...[edge.from, edge.to].flat());
      }
    }
    if (!tools.some((tool) => tool.includes(Constants.mcp_delimiter))) return [];

    const user = await deps.getUser(principal.id);
    if (!user)
      throw new ScheduleMCPError([{ server: agentId, status: 'mcp_configuration_missing' }]);
    user.id = principal.id;
    const appConfig = await deps.getAppConfig(getAppConfigOptionsFromUser(principal));
    const config = await deps.ensureConfigServers(appConfig?.mcpConfig ?? {});
    const servers = await deps.getServerConfigs(principal.id, config, principal.role);
    const aliases = buildServerNameAliases(Object.keys(servers));
    const shadowed = findShadowedServerNames(Object.keys(servers));
    const candidates = [...Object.keys(servers), ...aliases.keys()];
    const selected = new Map<string, string[]>();
    for (const tool of tools) {
      const [, name] = splitMCPToolKey(tool, candidates);
      if (!name) continue;
      const server = servers[name] ? name : (aliases.get(name) ?? name);
      const required = selected.get(server) ?? [];
      if (
        !tool.startsWith(`${Constants.mcp_all}${Constants.mcp_delimiter}`) &&
        !tool.startsWith(`${Constants.mcp_server}${Constants.mcp_delimiter}`)
      ) {
        required.push(normalizeMCPToolKey(tool, Object.keys(servers)));
      }
      selected.set(server, required);
    }
    if (!(await deps.canUseMCP(user))) {
      throw new ScheduleMCPError(
        [...selected.keys()].map((server) => ({ server, status: 'mcp_configuration_missing' })),
      );
    }
    const auth = await getPluginAuthMap({
      userId: principal.id,
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
    const outcomes: ScheduleMCPOutcome[] = [];
    try {
      for (const [server, required] of selected) {
        const serverConfig = servers[server];
        const customUserVars = auth[`${Constants.mcp_prefix}${server}`];
        if (
          !serverConfig ||
          shadowed.has(server) ||
          getMissingCustomUserVars(serverConfig, customUserVars).length > 0
        ) {
          outcomes.push({ server, status: 'mcp_configuration_missing' });
          continue;
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
          });
          const snapshot = await connection.fetchToolsSnapshot();
          if (snapshot.authenticationError) throw snapshot.authenticationError;
          const available = new Set(Object.keys(formatMCPServerTools(server, snapshot.tools)));
          for (const tool of snapshot.tools) {
            available.add(`${tool.name}${Constants.mcp_delimiter}${normalizeServerName(server)}`);
          }
          let status: ScheduleMCPStatus = 'ready';
          if (reauth) {
            status = 'mcp_reauth_required';
          } else if (!snapshot.complete || available.size === 0) {
            status = 'mcp_unavailable';
          } else if (!required.every((tool) => available.has(tool))) {
            status = 'mcp_configuration_missing';
          }
          outcomes.push({ server, status });
        } catch (error) {
          outcomes.push({
            server,
            status:
              reauth ||
              error instanceof MCPAuthenticationRejectedError ||
              error instanceof OpenIDReauthRequiredError ||
              error instanceof MCPOAuthSecretReentryRequiredError ||
              isOAuthAuthenticationError(error)
                ? 'mcp_reauth_required'
                : 'mcp_unavailable',
          });
        }
      }
    } finally {
      await cleanupMCPRequestContext(context);
    }
    if (outcomes.some((item) => item.status !== 'ready')) throw new ScheduleMCPError(outcomes);
    return outcomes;
  };
}
