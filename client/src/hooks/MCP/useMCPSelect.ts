import { useCallback, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import isEqual from 'lodash/isEqual';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId, mcpValuesAtomFamily, mcpPinnedAtom } from '~/store';
import { setTimestamp } from '~/utils/timestamps';
import { MCPServerDefinition } from './useMCPServerManager';

export function useMCPSelect({
  conversationId,
  storageContextKey,
  servers,
}: {
  conversationId?: string | null;
  storageContextKey?: string;
  servers: MCPServerDefinition[];
}) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const configuredServers = useMemo(() => {
    return new Set(servers?.map((s) => s.serverName));
  }, [servers]);

  /**
   * For new conversations, key the MCP atom by environment (spec or defaults)
   * so switching between spec ↔ non-spec gives each its own atom.
   * For existing conversations, key by conversation ID for per-conversation isolation.
   */
  const isNewConvo = key === Constants.NEW_CONVO;
  const mcpAtomKey = isNewConvo && storageContextKey ? storageContextKey : key;

  const [isPinned, setIsPinned] = useAtom(mcpPinnedAtom);
  const [mcpValues, setMCPValuesRaw] = useAtom(mcpValuesAtomFamily(mcpAtomKey));
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  // Sync ephemeral agent MCP → Jotai atom (strip unconfigured servers)
  useEffect(() => {
    const mcps = ephemeralAgent?.mcp;
    if (Array.isArray(mcps) && mcps.length > 0 && configuredServers.size > 0) {
      const activeMcps = mcps.filter((mcp) => configuredServers.has(mcp));
      if (!isEqual(activeMcps, mcpValues)) {
        setMCPValuesRaw(activeMcps);
      }
    } else if (Array.isArray(mcps) && mcps.length === 0 && mcpValues.length > 0) {
      // Ephemeral agent explicitly has empty MCP (e.g., spec with no MCP servers) — clear atom
      setMCPValuesRaw([]);
    }
  }, [ephemeralAgent?.mcp, setMCPValuesRaw, configuredServers, mcpValues]);

  // Write timestamp when MCP values change
  useEffect(() => {
    const mcpStorageKey = `${LocalStorageKeys.LAST_MCP_}${mcpAtomKey}`;
    if (mcpValues.length > 0) {
      setTimestamp(mcpStorageKey);
    }
  }, [mcpValues, mcpAtomKey]);

  /** Stable memoized setter with dual-write to environment key */
  const setMCPValues = useCallback(
    (value: string[]) => {
      if (!Array.isArray(value)) {
        return;
      }
      setMCPValuesRaw(value);
      setEphemeralAgent((prev) => {
        if (!isEqual(prev?.mcp, value)) {
          return { ...(prev ?? {}), mcp: value };
        }
        return prev;
      });
      // Dual-write to environment key for new conversation defaults
      if (storageContextKey) {
        const envKey = `${LocalStorageKeys.LAST_MCP_}${storageContextKey}`;
        localStorage.setItem(envKey, JSON.stringify(value));
        setTimestamp(envKey);
      }
    },
    [setMCPValuesRaw, setEphemeralAgent, storageContextKey],
  );

  return {
    isPinned,
    mcpValues,
    setIsPinned,
    setMCPValues,
  };
}
