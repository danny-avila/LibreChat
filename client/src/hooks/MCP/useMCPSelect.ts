import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';
import { useGetMCPTools } from './useGetMCPTools';

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

export function useMCPSelect({ conversationId }: { conversationId?: string | null }) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasSetFetched = useRef<string | null>(null);
  const { isFetched, mcpToolDetails } = useGetMCPTools();
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  const storageKey = `${LocalStorageKeys.LAST_MCP_}${key}`;
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
    storageKey,
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
