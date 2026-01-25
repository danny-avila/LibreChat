import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

export type ProgressState = {
  progress: number;
  total?: number;
  message?: string;
  timestamp: number;
};

// Map of toolCallId -> ProgressState (for matching progress to specific tool calls)
export const toolCallProgressMapAtom = atom<Map<string, ProgressState>>(new Map());

// Family for tool call based progress lookup
export const toolCallProgressFamily = atomFamily((toolCallId: string) =>
  atom((get) => {
    // Don't return data for empty string key
    if (!toolCallId) return undefined;
    return get(toolCallProgressMapAtom).get(toolCallId);
  })
);

// Cleanup action - remove progress entry for a specific tool call
export const clearToolCallProgressAtom = atom(
  null,
  (get, set, toolCallId: string) => {
    if (!toolCallId) return;
    const current = get(toolCallProgressMapAtom);
    const newMap = new Map(current);
    newMap.delete(toolCallId);
    set(toolCallProgressMapAtom, newMap);
  }
);
