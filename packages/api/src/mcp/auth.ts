import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import { getPluginAuthMap } from '~/agents/auth';
import { mcpToolPattern } from './utils';

export async function getUserMCPAuthMap({
  userId,
  tools,
  appTools,
  findPluginAuthsByKeys,
}: {
  userId: string;
  tools: GenericTool[] | undefined;
  appTools: Record<string, unknown>;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
}) {
  if (!tools || tools.length === 0) {
    return {};
  }

  const uniqueMcpServers = new Set<string>();

  for (const tool of tools) {
    const toolKey = tool.name;
    if (toolKey && appTools[toolKey] && mcpToolPattern.test(toolKey)) {
      const parts = toolKey.split(Constants.mcp_delimiter);
      const serverName = parts[parts.length - 1];
      uniqueMcpServers.add(`${Constants.mcp_prefix}${serverName}`);
    }
  }

  if (uniqueMcpServers.size === 0) {
    return {};
  }

  const mcpPluginKeysToFetch = Array.from(uniqueMcpServers);

  let allMcpCustomUserVars: Record<string, Record<string, string>> = {};
  try {
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
