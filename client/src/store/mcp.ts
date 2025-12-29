import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';

/**
 * Creates a storage atom for MCP values per conversation
 * Uses atomFamily to create unique atoms for each conversation ID
 */
export const mcpValuesAtomFamily = atomFamily((conversationId: string | null) => {
  const key = conversationId ?? Constants.NEW_CONVO;
  const storageKey = `${LocalStorageKeys.LAST_MCP_}${key}`;

  return atomWithStorage<string[]>(storageKey, [], undefined, { getOnInit: true });
});

/**
 * Global storage atom for MCP pinned state (shared across all conversations)
 */
export const mcpPinnedAtom = atomWithStorage<boolean>(LocalStorageKeys.PIN_MCP_, true, undefined, {
  getOnInit: true,
});

/**
 * Server initialization state - shared globally so chat dropdown and settings panel
 * both see the same OAuth/initialization state.
 *
 * This enables canceling OAuth from either location.
 */
export interface MCPServerInitState {
  isInitializing: boolean;
  isCancellable: boolean;
  oauthUrl: string | null;
  oauthStartTime: number | null;
}

const defaultServerInitState: MCPServerInitState = {
  isInitializing: false,
  isCancellable: false,
  oauthUrl: null,
  oauthStartTime: null,
};

/**
 * Global atom for MCP server initialization states.
 * Keyed by server name.
 */
export const mcpServerInitStatesAtom = atom<Record<string, MCPServerInitState>>({});

/**
 * Helper to get or create a server's init state
 */
export const getServerInitState = (
  states: Record<string, MCPServerInitState>,
  serverName: string,
): MCPServerInitState => {
  return states[serverName] || defaultServerInitState;
};
