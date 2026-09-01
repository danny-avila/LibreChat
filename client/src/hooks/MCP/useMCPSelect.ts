import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import isEqual from 'lodash/isEqual';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId, mcpValuesAtomFamily, mcpPinnedAtom } from '~/store';
import { MCPServerDefinition } from './useMCPServerManager';
import { useGetStartupConfig } from '~/data-provider';
import { setTimestamp } from '~/utils/timestamps';

/** Sentinel in `interface.defaultPinnedTools` that pins the MCP dropdown to the prompt bar. */
const MCP_PIN_KEYWORD = 'mcp';

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

  const { data: startupConfig } = useGetStartupConfig();
  const [isPinned, setIsPinned] = useAtom(mcpPinnedAtom);
  const [mcpValues, setMCPValuesRaw] = useAtom(mcpValuesAtomFamily(mcpAtomKey));
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const hasAppliedDefaultPin = useRef(false);

  /**
   * Seed the MCP dropdown's pinned state from the admin-configured `defaultPinnedTools`:
   * pin when the array includes the `'mcp'` keyword or any configured server name.
   * Only applies on first load when the user has no stored preference; when the option
   * is absent entirely, the legacy default (pinned) is kept.
   */
  useEffect(() => {
    if (hasAppliedDefaultPin.current || !startupConfig) {
      return;
    }
    const defaultPinnedTools = startupConfig.interface?.defaultPinnedTools;
    if (!Array.isArray(defaultPinnedTools)) {
      hasAppliedDefaultPin.current = true;
      return;
    }
    if (localStorage.getItem(LocalStorageKeys.PIN_MCP_) != null) {
      hasAppliedDefaultPin.current = true;
      return;
    }
    const pinnedByKeyword = defaultPinnedTools.includes(MCP_PIN_KEYWORD);
    /** Wait for servers before deciding so a configured server name isn't missed. */
    if (!pinnedByKeyword && servers.length === 0) {
      return;
    }
    hasAppliedDefaultPin.current = true;
    const shouldPin =
      pinnedByKeyword || servers.some((server) => defaultPinnedTools.includes(server.serverName));
    if (shouldPin !== isPinned) {
      setIsPinned(shouldPin);
    }
  }, [startupConfig, servers, isPinned, setIsPinned]);

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
