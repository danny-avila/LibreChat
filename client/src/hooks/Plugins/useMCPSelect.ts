import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys, EModelEndpoint } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import { useAvailableToolsQuery, useGetStartupConfig } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';
import { useChatContext } from '~/Providers';

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

export function useMCPSelect() {
  const { conversation } = useChatContext();

  const key = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );

  const hasSetFetched = useRef<string | null>(null);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const { data: startupConfig } = useGetStartupConfig();
  const { data: rawMcpTools, isFetched } = useAvailableToolsQuery(EModelEndpoint.agents, {
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

  const [mcpValues, setMCPValuesRaw] = useLocalStorage<string[]>(
    `${LocalStorageKeys.LAST_MCP_}${key}`,
    mcpState,
    setSelectedValues,
    storageCondition,
  );

  const setMCPValuesRawRef = useRef(setMCPValuesRaw);
  setMCPValuesRawRef.current = setMCPValuesRaw;

  // Create a stable memoized setter to avoid re-creating it on every render and causing an infinite render loop
  const setMCPValues = useCallback((value: string[]) => {
    setMCPValuesRawRef.current(value);
  }, []);

  const [isPinned, setIsPinned] = useLocalStorage<boolean>(
    `${LocalStorageKeys.PIN_MCP_}${key}`,
    startupConfig?.interface?.defaultPinMcp ?? true,
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
