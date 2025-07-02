import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys, EModelEndpoint } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import { useAvailableToolsQuery } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';

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

interface UseMCPSelectOptions {
  conversationId?: string | null;
}

export function useMCPSelect({ conversationId }: UseMCPSelectOptions) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasSetFetched = useRef<string | null>(null);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const { data: mcpToolDetails, isFetched } = useAvailableToolsQuery(EModelEndpoint.agents, {
    select: (data: TPlugin[]) => {
      const mcpToolsMap = new Map<string, TPlugin>();
      data.forEach((tool) => {
        const isMCP = tool.pluginKey.includes(Constants.mcp_delimiter);
        if (isMCP && tool.chatMenu !== false) {
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

  const [isPinned, setIsPinned] = useLocalStorage<boolean>(
    `${LocalStorageKeys.PIN_MCP_}${key}`,
    true,
  );

  useEffect(() => {
    if (hasSetFetched.current === key) {
      return;
    }
    if (!isFetched) {
      return;
    }
    hasSetFetched.current = key;
    if ((mcpToolDetails?.length ?? 0) > 0) {
      setMCPValues(mcpValues.filter((mcp) => mcpToolDetails?.some((tool) => tool.name === mcp)));
      return;
    }
    setMCPValues([]);
  }, [isFetched, setMCPValues, mcpToolDetails, key, mcpValues]);

  const mcpServerNames = useMemo(() => {
    return (mcpToolDetails ?? []).map((tool) => tool.name);
  }, [mcpToolDetails]);

  return {
    isPinned,
    mcpValues,
    setIsPinned,
    setMCPValues,
    mcpServerNames,
    ephemeralAgent,
    mcpToolDetails,
    setEphemeralAgent,
  };
}
