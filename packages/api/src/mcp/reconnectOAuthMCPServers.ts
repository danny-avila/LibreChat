import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { AgentWithTools } from '~/agents/context';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type { RequestBody } from '~/types';

import { extractMCPServers } from '~/agents/context';
import { MCPManager } from '~/mcp/MCPManager';
import { MCPOAuthHandler } from '~/mcp/oauth';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';

type UserMCPAuthMap = Record<string, Record<string, string>>;

interface ReconnectOAuthMCPServersParams {
  agents: AgentWithTools[];
  flowManager: FlowStateManager<MCPOAuthTokens | null>;
  requestBody?: RequestBody;
  signal?: AbortSignal;
  tokenMethods: Pick<TokenMethods, 'createToken' | 'deleteTokens' | 'findToken' | 'updateToken'>;
  user: IUser;
  userMCPAuthMap?: UserMCPAuthMap;
}

interface ReconnectOAuthMCPServersResult {
  connectedServers: string[];
  attemptedServers: string[];
}

function getUniqueMCPServers(agents: AgentWithTools[]): string[] {
  const servers = new Set<string>();

  for (const agent of agents) {
    const agentServers = extractMCPServers(agent);
    for (const serverName of agentServers) {
      servers.add(serverName);
    }
  }

  return Array.from(servers);
}

function buildReconnectError(failures: Array<{ error: unknown; serverName: string }>): Error {
  const failureSummary = failures
    .map(({ error, serverName }) => {
      const message = error instanceof Error ? error.message : String(error);
      return `${serverName}: ${message}`;
    })
    .join('; ');

  return new Error(`OAuth MCP reconnection failed for scheduled task: ${failureSummary}`);
}

export async function reconnectOAuthMCPServers({
  user,
  agents,
  signal,
  requestBody,
  flowManager,
  tokenMethods,
  userMCPAuthMap,
}: ReconnectOAuthMCPServersParams): Promise<ReconnectOAuthMCPServersResult> {
  const attemptedServers = getUniqueMCPServers(agents);
  if (attemptedServers.length === 0) {
    return {
      attemptedServers: [],
      connectedServers: [],
    };
  }

  const registry = MCPServersRegistry.getInstance();
  const oauthServers = await registry.getOAuthServers(user.id);
  const targetServers = attemptedServers.filter((serverName) => oauthServers.has(serverName));

  if (targetServers.length === 0) {
    return {
      attemptedServers: [],
      connectedServers: [],
    };
  }

  const mcpManager = MCPManager.getInstance();
  const connectedServers: string[] = [];
  const failures: Array<{ error: unknown; serverName: string }> = [];

  for (const serverName of targetServers) {
    try {
      const connection = await mcpManager.getConnection({
        user,
        signal,
        flowManager,
        requestBody,
        serverName,
        tokenMethods,
        returnOnOAuth: true,
        customUserVars: userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`],
      });

      if (!(await connection.isConnected())) {
        throw new Error('MCP connection is not active');
      }

      connectedServers.push(serverName);
    } catch (error) {
      failures.push({ error, serverName });

      const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
      await flowManager.deleteFlow(flowId, 'mcp_oauth').catch((cleanupError) => {
        logger.warn(
          `[ScheduledTasks][MCP][${serverName}] Failed to clean up pending OAuth flow`,
          cleanupError,
        );
      });

      await mcpManager.disconnectUserConnection(user.id, serverName).catch((disconnectError) => {
        logger.warn(
          `[ScheduledTasks][MCP][${serverName}] Failed to disconnect after reconnect error`,
          disconnectError,
        );
      });
    }
  }

  if (failures.length > 0) {
    throw buildReconnectError(failures);
  }

  return {
    attemptedServers: targetServers,
    connectedServers,
  };
}
