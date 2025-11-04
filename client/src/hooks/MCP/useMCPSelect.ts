import { useCallback, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import isEqual from 'lodash/isEqual';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import {
  ephemeralAgentByConvoId,
  mcpValuesAtomFamily,
  mcpPinnedAtom,
  mcpDisabledToolsAtomFamily,
} from '~/store';
import { useGetStartupConfig } from '~/data-provider';
import { setTimestamp } from '~/utils/timestamps';

export function useMCPSelect({ conversationId }: { conversationId?: string | null }) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const { data: startupConfig } = useGetStartupConfig();
  const configuredServers = useMemo(() => {
    return new Set(Object.keys(startupConfig?.mcpServers ?? {}));
  }, [startupConfig?.mcpServers]);

  const [isPinned, setIsPinned] = useAtom(mcpPinnedAtom);
  const [mcpValues, setMCPValuesRaw] = useAtom(mcpValuesAtomFamily(key));
  const [mcpDisabledTools, setMCPDisabledToolsRaw] = useAtom(mcpDisabledToolsAtomFamily(key));
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  // Sync Jotai state with ephemeral agent state
  useEffect(() => {
    const mcps = ephemeralAgent?.mcp ?? [];
    if (mcps.length === 1 && mcps[0] === Constants.mcp_clear) {
      setMCPValuesRaw([]);
    } else if (mcps.length > 0) {
      // Strip out servers that are not available in the startup config
      const activeMcps = mcps.filter((mcp) => configuredServers.has(mcp));
      setMCPValuesRaw(activeMcps);
    }
  }, [ephemeralAgent?.mcp, setMCPValuesRaw, configuredServers]);

  useEffect(() => {
    const disabledTools = ephemeralAgent?.mcpDisabledTools ?? {};
    const sanitized: Record<string, string[]> = {};
    Object.entries(disabledTools).forEach(([serverName, tools]) => {
      if (Array.isArray(tools) && tools.length > 0) {
        sanitized[serverName] = Array.from(new Set(tools));
      }
    });

    setMCPDisabledToolsRaw((prev) => {
      if (isEqual(prev, sanitized)) {
        return prev;
      }
      return sanitized;
    });
  }, [ephemeralAgent?.mcpDisabledTools, setMCPDisabledToolsRaw]);

  useEffect(() => {
    setEphemeralAgent((prev) => {
      const sanitizedDisabledTools: Record<string, string[]> = {};
      Object.entries(mcpDisabledTools).forEach(([serverName, tools]) => {
        if (Array.isArray(tools) && tools.length > 0) {
          sanitizedDisabledTools[serverName] = Array.from(new Set(tools));
        }
      });

      const hasMcpChanged = !isEqual(prev?.mcp, mcpValues);
      const hasDisabledChanged = !isEqual(prev?.mcpDisabledTools ?? {}, sanitizedDisabledTools);

      if (hasMcpChanged || hasDisabledChanged) {
        const next = { ...(prev ?? {}), mcp: mcpValues };
        if (Object.keys(sanitizedDisabledTools).length > 0) {
          next.mcpDisabledTools = sanitizedDisabledTools;
        } else if (next.mcpDisabledTools) {
          delete next.mcpDisabledTools;
        }
        return next;
      }
      return prev;
    });
  }, [mcpValues, mcpDisabledTools, setEphemeralAgent]);

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

  const setMCPDisabledTools = useCallback(
    (
      value:
        | Record<string, string[]>
        | ((prev: Record<string, string[]>) => Record<string, string[]> | null | undefined),
    ) => {
      let nextValue: Record<string, string[]> | null | undefined;

      if (typeof value === 'function') {
        nextValue = value(mcpDisabledTools);
      } else {
        nextValue = value;
      }

      if (nextValue == null || typeof nextValue !== 'object') {
        return;
      }

      const sanitized: Record<string, string[]> = {};
      Object.entries(nextValue).forEach(([serverName, tools]) => {
        if (Array.isArray(tools) && tools.length > 0) {
          sanitized[serverName] = Array.from(new Set(tools));
        }
      });

      setMCPDisabledToolsRaw((prev) => {
        if (isEqual(prev, sanitized)) {
          return prev;
        }
        return sanitized;
      });
    },
    [setMCPDisabledToolsRaw],
  );

  return {
    isPinned,
    mcpValues,
    setIsPinned,
    setMCPValues,
    mcpDisabledTools,
    setMCPDisabledTools,
  };
}
