import { useMemo } from 'react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import { useAvailableToolsQuery, useGetStartupConfig } from '~/data-provider';

export function useGetMCPTools() {
  const { data: startupConfig } = useGetStartupConfig();
  const { data: rawMcpTools } = useAvailableToolsQuery(EModelEndpoint.agents, {
    select: (data: TPlugin[]) => {
      const mcpToolsMap = new Map<string, TPlugin>();
      data.forEach((tool) => {
        const isMCP = tool.pluginKey.includes(Constants.mcp_delimiter);
        if (isMCP) {
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
        }
      });
      return Array.from(mcpToolsMap.values());
    },
  });

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
