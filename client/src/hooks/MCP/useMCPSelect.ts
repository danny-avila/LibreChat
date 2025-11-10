import { useCallback, useEffect, useMemo, useRef } from 'react';
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

const sanitizeDisabledToolsMap = (value?: Record<string, string[]> | null) => {
  const sanitized: Record<string, string[]> = {};

  if (!value) {
    return sanitized;
  }

  Object.entries(value).forEach(([serverName, tools]) => {
    if (!Array.isArray(tools)) {
      return;
    }

    const filtered = tools.filter((tool) => typeof tool === 'string' && tool.trim().length > 0);
    if (filtered.length === 0) {
      return;
    }

    sanitized[serverName] = Array.from(new Set(filtered));
  });

  return sanitized;
};

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
  const skipEphemeralSyncRef = useRef(false);

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
    if (ephemeralAgent?.mcpDisabledTools === undefined) {
      skipEphemeralSyncRef.current = false;
      return;
    }

    const sanitized = sanitizeDisabledToolsMap(ephemeralAgent.mcpDisabledTools);

    if (Object.keys(sanitized).length === 0 && Object.keys(mcpDisabledTools).length > 0) {
      skipEphemeralSyncRef.current = false;
      return;
    }

    if (skipEphemeralSyncRef.current) {
      skipEphemeralSyncRef.current = false;
      return;
    }

    if (!isEqual(mcpDisabledTools, sanitized)) {
      setMCPDisabledToolsRaw(sanitized);
    }
  }, [ephemeralAgent?.mcpDisabledTools, mcpDisabledTools, setMCPDisabledToolsRaw]);

  useEffect(() => {
    setEphemeralAgent((prev) => {
      const sanitizedDisabledTools = sanitizeDisabledToolsMap(mcpDisabledTools);

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
      const nextValue =
        typeof value === 'function' ? value(mcpDisabledTools) : value;

      if (nextValue == null || typeof nextValue !== 'object') {
        return;
      }

      const sanitized = sanitizeDisabledToolsMap(nextValue);

      if (isEqual(mcpDisabledTools, sanitized)) {
        skipEphemeralSyncRef.current = false;
        return;
      }

      skipEphemeralSyncRef.current = true;
      setMCPDisabledToolsRaw(sanitized);
    },
    [mcpDisabledTools, setMCPDisabledToolsRaw],
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
