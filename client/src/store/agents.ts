import { useCallback } from 'react';
import { useStore } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { atom } from 'jotai';
import { Constants } from 'librechat-data-provider';
import type { TEphemeralAgent } from 'librechat-data-provider';
import { logger } from '~/utils';

export const ephemeralAgentByConvoId = atomFamily(
  (conversationId: string) => {
    const baseAtom = atom<TEphemeralAgent | null>(null);
    return atom(
      (get) => get(baseAtom),
      (get, set, newValue: TEphemeralAgent | null) => {
        set(baseAtom, newValue);
        logger.log('agents', 'Setting ephemeral agent:', { conversationId, newValue });
      },
    );
  },
  (prevKey, nextKey) => prevKey === nextKey,
);

/**
 * Creates a callback function to apply the ephemeral agent state
 * from the "new" conversation template to a specified conversation ID.
 */
export function useApplyNewAgentTemplate() {
  const store = useStore();

  const applyTemplate = useCallback(
    async (
      targetId: string,
      _sourceId: string | null = Constants.NEW_CONVO,
      ephemeralAgentState?: TEphemeralAgent | null,
    ) => {
      const sourceId = _sourceId || Constants.NEW_CONVO;
      logger.log('agents', `Attempting to apply template from "${sourceId}" to "${targetId}"`);

      if (targetId === sourceId) {
        logger.warn('agents', `Attempted to apply template to itself ("${sourceId}"). Skipping.`);
        return;
      }

      try {
        // 1. Get the current agent state from the "new" conversation template
        const agentTemplate = ephemeralAgentState ?? store.get(ephemeralAgentByConvoId(sourceId));

        // 2. Check if a template state actually exists
        if (agentTemplate) {
          logger.log('agents', `Applying agent template to "${targetId}":`, agentTemplate);
          // 3. Set the state for the target conversation ID using the template value
          store.set(ephemeralAgentByConvoId(targetId), agentTemplate);
        } else {
          // 4. Handle the case where the "new" template has no agent state (is null)
          logger.warn(
            'agents',
            `Agent template from "${sourceId}" is null or unset. Setting agent for "${targetId}" to null.`,
          );
          // Explicitly set to null (or a default empty state if preferred)
          store.set(ephemeralAgentByConvoId(targetId), null);
          // Example: Or set to a default empty state:
          // store.set(ephemeralAgentByConvoId(targetId), { mcp: [] });
        }
      } catch (error) {
        logger.error(
          'agents',
          `Error applying agent template from "${sourceId}" to "${targetId}":`,
          error,
        );
        store.set(ephemeralAgentByConvoId(targetId), null);
      }
    },
    [store],
  );

  return applyTemplate;
}

/**
 * Creates a callback function to get the current ephemeral agent state
 * for a specified conversation ID without subscribing the component.
 * Returns the value directly.
 */
export function useGetEphemeralAgent() {
  const store = useStore();

  const getEphemeralAgent = useCallback(
    (conversationId: string): TEphemeralAgent | null => {
      logger.log('agents', `[useGetEphemeralAgent] Getting value for ID: ${conversationId}`);
      return store.get(ephemeralAgentByConvoId(conversationId));
    },
    [store],
  );

  return getEphemeralAgent;
}
