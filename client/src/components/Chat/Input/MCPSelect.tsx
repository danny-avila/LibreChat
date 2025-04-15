import React, { memo, useRef, useMemo, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Constants, EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import { useAvailableToolsQuery } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import MultiSelect from '~/components/ui/MultiSelect';
import { ephemeralAgentByConvoId } from '~/store';
import MCPIcon from '~/components/ui/MCPIcon';
import { useLocalize } from '~/hooks';

const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
  if (rawCurrentValue) {
    try {
      const currentValue = rawCurrentValue?.trim() ?? '';
      if (currentValue.length > 2) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return Array.isArray(value) && value.length > 0;
};

function MCPSelect({ conversationId }: { conversationId?: string | null }) {
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasSetFetched = useRef<string | null>(null);

  const { data: mcpServerSet, isFetched } = useAvailableToolsQuery(EModelEndpoint.agents, {
    select: (data) => {
      const serverNames = new Set<string>();
      data.forEach((tool) => {
        if (tool.pluginKey.includes(Constants.mcp_delimiter)) {
          const parts = tool.pluginKey.split(Constants.mcp_delimiter);
          serverNames.add(parts[parts.length - 1]);
        }
      });
      return serverNames;
    },
  });

  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const mcpState = useMemo(() => {
    return ephemeralAgent?.mcp ?? [];
  }, [ephemeralAgent?.mcp]);

  const setSelectedValues = useCallback(
    (values: string[] | null | undefined) => {
      if (!values) {
        return;
      }
      if (!Array.isArray(values)) {
        return;
      }
      setEphemeralAgent((prev) => ({
        ...prev,
        mcp: values,
      }));
    },
    [setEphemeralAgent],
  );
  const [mcpValues, setMCPValues] = useLocalStorage<string[]>(
    `${LocalStorageKeys.LAST_MCP_}${key}`,
    mcpState,
    setSelectedValues,
    storageCondition,
  );

  useEffect(() => {
    if (hasSetFetched.current === key) {
      return;
    }
    if (!isFetched) {
      return;
    }
    hasSetFetched.current = key;
    if ((mcpServerSet?.size ?? 0) > 0) {
      setMCPValues(mcpValues.filter((mcp) => mcpServerSet?.has(mcp)));
      return;
    }
    setMCPValues([]);
  }, [isFetched, setMCPValues, mcpServerSet, key, mcpValues]);

  const renderSelectedValues = useCallback(
    (values: string[], placeholder?: string) => {
      if (values.length === 0) {
        return placeholder || localize('com_ui_select') + '...';
      }
      if (values.length === 1) {
        return values[0];
      }
      return localize('com_ui_x_selected', { 0: values.length });
    },
    [localize],
  );

  const mcpServers = useMemo(() => {
    return Array.from(mcpServerSet ?? []);
  }, [mcpServerSet]);

  if (!mcpServerSet || mcpServerSet.size === 0) {
    return null;
  }

  return (
    <MultiSelect
      items={mcpServers ?? []}
      selectedValues={mcpValues ?? []}
      setSelectedValues={setMCPValues}
      defaultSelectedValues={mcpValues ?? []}
      renderSelectedValues={renderSelectedValues}
      placeholder={localize('com_ui_mcp_servers')}
      popoverClassName="min-w-fit"
      className="badge-icon min-w-fit"
      selectIcon={<MCPIcon className="icon-md text-text-primary" />}
      selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
      selectClassName="group relative inline-flex items-center justify-center md:justify-start gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-all md:w-full size-9 p-2 md:p-3 bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
    />
  );
}

export default memo(MCPSelect);
