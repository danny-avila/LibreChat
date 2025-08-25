import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import { getPluginAuthMap } from '~/agents/auth';

export async function getUserMCPAuthMap({
  userId,
  tools,
  servers,
  toolInstances,
  findPluginAuthsByKeys,
}: {
  userId: string;
  tools?: (string | undefined)[];
  servers?: (string | undefined)[];
  toolInstances?: (GenericTool | null)[];
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
}) {
  let allMcpCustomUserVars: Record<string, Record<string, string>> = {};
  let mcpPluginKeysToFetch: string[] = [];
  try {
    const uniqueMcpServers = new Set<string>();

    if (servers != null && servers.length) {
      for (const serverName of servers) {
        if (!serverName) {
          continue;
        }
        uniqueMcpServers.add(`${Constants.mcp_prefix}${serverName}`);
      }
    } else if (tools != null && tools.length) {
      for (const toolName of tools) {
        if (!toolName) {
          continue;
        }
        const delimiterIndex = toolName.indexOf(Constants.mcp_delimiter);
        if (delimiterIndex === -1) continue;
        const mcpServer = toolName.slice(delimiterIndex + Constants.mcp_delimiter.length);
        if (!mcpServer) continue;
        uniqueMcpServers.add(`${Constants.mcp_prefix}${mcpServer}`);
      }
    } else if (toolInstances != null && toolInstances.length) {
      for (const tool of toolInstances) {
        if (!tool) {
          continue;
        }
        const mcpTool = tool as GenericTool & { mcpRawServerName?: string };
        if (mcpTool.mcpRawServerName) {
          uniqueMcpServers.add(`${Constants.mcp_prefix}${mcpTool.mcpRawServerName}`);
        }
      }
    }

    if (uniqueMcpServers.size === 0) {
      return {};
    }

    mcpPluginKeysToFetch = Array.from(uniqueMcpServers);
    allMcpCustomUserVars = await getPluginAuthMap({
      userId,
      pluginKeys: mcpPluginKeysToFetch,
      throwError: false,
      findPluginAuthsByKeys,
    });
  } catch (err) {
    logger.error(
      `[handleTools] Error batch fetching customUserVars for MCP tools (keys: ${mcpPluginKeysToFetch.join(
        ', ',
      )}), user ${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      err,
    );
  }

  return allMcpCustomUserVars;
}
