import { useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import type { AgentToolType } from 'librechat-data-provider';
import type { MCPServerInfo } from '~/common';

type GroupedToolType = AgentToolType & { tools?: AgentToolType[] };
type GroupedToolsRecord = Record<string, GroupedToolType>;

interface VisibleToolsResult {
  toolIds: string[];
  mcpServerNames: string[];
}

/**
 * Custom hook to calculate visible tool IDs based on selected tools and their parent groups.
 * If any subtool of a group is selected, the parent group tool is also made visible.
 *
 * @param selectedToolIds - Array of selected tool IDs
 * @param allTools - Record of all available tools
 * @param mcpServersMap - Map of all MCP servers
 * @returns Object containing separate arrays of visible tool IDs for regular and MCP tools
 */
export function useVisibleTools(
  selectedToolIds: string[] | undefined,
  allTools: GroupedToolsRecord | undefined,
  mcpServersMap: Map<string, MCPServerInfo>,
): VisibleToolsResult {
  return useMemo(() => {
    const mcpServers = new Set<string>();
    const selectedSet = new Set<string>();
    const regularToolIds = new Set<string>();

    for (const toolId of selectedToolIds ?? []) {
      if (!toolId.includes(Constants.mcp_delimiter)) {
        selectedSet.add(toolId);
        continue;
      }
      const serverName = toolId.split(Constants.mcp_delimiter)[1];
      if (!serverName) {
        continue;
      }
      mcpServers.add(serverName);
    }

    if (allTools) {
      for (const [toolId, toolObj] of Object.entries(allTools)) {
        if (selectedSet.has(toolId)) {
          regularToolIds.add(toolId);
        }

        if (toolObj.tools?.length) {
          for (const subtool of toolObj.tools) {
            if (selectedSet.has(subtool.tool_id)) {
              regularToolIds.add(toolId);
              break;
            }
          }
        }
      }
    }

    if (mcpServersMap) {
      for (const [mcpServerName] of mcpServersMap) {
        if (mcpServers.has(mcpServerName)) {
          continue;
        }
        /** Legacy check */
        if (selectedSet.has(mcpServerName)) {
          mcpServers.add(mcpServerName);
        }
      }
    }

    return {
      toolIds: Array.from(regularToolIds).sort((a, b) => a.localeCompare(b)),
      mcpServerNames: Array.from(mcpServers).sort((a, b) => a.localeCompare(b)),
    };
  }, [allTools, mcpServersMap, selectedToolIds]);
}
