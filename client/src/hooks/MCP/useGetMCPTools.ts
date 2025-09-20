import { useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import { useMCPToolsQuery, useGetStartupConfig } from '~/data-provider';

/**
 * Hook for fetching and filtering MCP tools based on server configuration
 * Uses the dedicated MCP tools query instead of filtering from general tools
 */
export function useGetMCPTools() {
  const { data: startupConfig } = useGetStartupConfig();

  // Use dedicated MCP tools query
  const { data: rawMcpTools } = useMCPToolsQuery({
    select: (data: TPlugin[]) => {
      // Group tools by server for easier management
      const mcpToolsMap = new Map<string, TPlugin>();
      data.forEach((tool) => {
        const parts = tool.pluginKey.split(Constants.mcp_delimiter);
        const serverName = parts[parts.length - 1];
        if (!mcpToolsMap.has(serverName)) {
          mcpToolsMap.set(serverName, {
            name: serverName,
            pluginKey: tool.pluginKey,
            authConfig: tool.authConfig,
            authenticated: tool.authenticated,
          });
        }
      });
      return Array.from(mcpToolsMap.values());
    },
  });

  // Filter out servers that have chatMenu disabled
  const mcpToolDetails = useMemo(() => {
    if (!rawMcpTools || !startupConfig?.mcpServers) {
      return rawMcpTools;
    }
    return rawMcpTools.filter((tool) => {
      const serverConfig = startupConfig?.mcpServers?.[tool.name];
      return serverConfig?.chatMenu !== false;
    });
  }, [rawMcpTools, startupConfig?.mcpServers]);

  return {
    mcpToolDetails,
  };
}
