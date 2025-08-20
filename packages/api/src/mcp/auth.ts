import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import { getPluginAuthMap } from '~/agents/auth';

export async function getUserMCPAuthMap({
  userId,
  tools,
  findPluginAuthsByKeys,
}: {
  userId: string;
  tools: GenericTool[] | undefined;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
}) {
  if (!tools || tools.length === 0) {
    return {};
  }

  const uniqueMcpServers = new Set<string>();

  for (const tool of tools) {
    const mcpTool = tool as GenericTool & { mcpRawServerName?: string };
    if (mcpTool.mcpRawServerName) {
      uniqueMcpServers.add(`${Constants.mcp_prefix}${mcpTool.mcpRawServerName}`);
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
