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
 * Creates a storage atom for MCP pinned state per conversation
 */
export const mcpPinnedAtomFamily = atomFamily((conversationId: string | null) => {
  const key = conversationId ?? Constants.NEW_CONVO;
  const storageKey = `${LocalStorageKeys.PIN_MCP_}${key}`;

  return atomWithStorage<boolean>(storageKey, true, undefined, { getOnInit: true });
});
