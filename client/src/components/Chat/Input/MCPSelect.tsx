import React from 'react';
import { useRecoilState } from 'recoil';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { useAvailableToolsQuery } from '~/data-provider';
import MultiSelect from '~/components/ui/MultiSelect';
import { ephemeralAgentByConvoId } from '~/store';
import { useChatContext } from '~/Providers';

export function MCPSelect() {
  const { conversation } = useChatContext();
  const { conversationId = Constants.NEW_CONVO } = conversation ?? {};
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId ?? Constants.NEW_CONVO),
  );
  const { data: mcpServers } = useAvailableToolsQuery(EModelEndpoint.agents, {
    select: (data) => {
      const serverNames = new Set<string>();
      data.forEach((tool) => {
        if (tool.pluginKey.includes(Constants.mcp_delimiter)) {
          const parts = tool.pluginKey.split(Constants.mcp_delimiter);
          serverNames.add(parts[parts.length - 1]);
        }
      });
      return [...serverNames];
    },
  });

  const setSelectedValues = (values: string[]) => {
    setEphemeralAgent((prev) => ({
      ...prev,
      mcp: values,
    }));
  };

  return (
    <MultiSelect
      items={mcpServers ?? []}
      placeholder="Select MCP Servers..."
      defaultSelectedValues={ephemeralAgent?.mcp ?? []}
      setSelectedValues={setSelectedValues}
      selectedValues={ephemeralAgent?.mcp ?? []}
      popoverClassName="min-w-[200px]"
      className="badge-icon h-full min-w-[150px]"
      selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
      selectClassName="group relative inline-flex items-center gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-shadow md:w-full size-9 p-2 md:p-3 bg-surface-chat shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
    />
  );
}
