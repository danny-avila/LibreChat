import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId, mcpValuesAtomFamily, mcpPinnedAtom } from '~/store';
import { setTimestamp } from '~/utils/timestamps';

export function useMCPSelect({ conversationId }: { conversationId?: string | null }) {
  const key = conversationId ?? Constants.NEW_CONVO;

  const [isPinned, setIsPinned] = useAtom(mcpPinnedAtom);
  const [mcpValues, setMCPValuesRaw] = useAtom(mcpValuesAtomFamily(key));
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  // Sync Jotai state with ephemeral agent state
  useEffect(() => {
    if (ephemeralAgent?.mcp && ephemeralAgent.mcp.length > 0) {
      setMCPValuesRaw(ephemeralAgent.mcp);
    }
  }, [ephemeralAgent?.mcp, setMCPValuesRaw]);

  // Update ephemeral agent when Jotai state changes
  useEffect(() => {
    if (mcpValues.length > 0 && JSON.stringify(mcpValues) !== JSON.stringify(ephemeralAgent?.mcp)) {
      setEphemeralAgent((prev) => ({
        ...prev,
        mcp: mcpValues,
      }));
    }
  }, [mcpValues, ephemeralAgent?.mcp, setEphemeralAgent]);

  useEffect(() => {
    const mcpStorageKey = `${LocalStorageKeys.LAST_MCP_}${key}`;
    if (mcpValues.length > 0) {
      setTimestamp(mcpStorageKey);
    }
  }, [mcpValues, key]);

  /** Stable memoized setter */
  const setMCPValues = useCallback(
    (value: string[]) => {
      if (!Array.isArray(value)) {
        return;
      }
      setMCPValuesRaw(value);
    },
    [setMCPValuesRaw],
  );

  return {
    isPinned,
    mcpValues,
    setIsPinned,
    setMCPValues,
  };
}
