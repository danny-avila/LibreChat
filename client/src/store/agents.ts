import { Constants } from 'librechat-data-provider';
import { atomFamily, useRecoilCallback } from 'recoil';
import type { TEphemeralAgent } from 'librechat-data-provider';
import { logger } from '~/utils';

export const ephemeralAgentByConvoId = atomFamily<TEphemeralAgent | null, string>({
  key: 'ephemeralAgentByConvoId',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const conversationId = node.key.split('__')[1]?.replaceAll('"', '');
        logger.log('agents', 'Setting ephemeral agent:', { conversationId, newValue });
      });
    },
  ] as const,
});

/**
 * Creates a callback function to apply the ephemeral agent state
 * from the "new" conversation template to a specified conversation ID.
 */
export function useApplyNewAgentTemplate() {
  const applyTemplate = useRecoilCallback(
    ({ snapshot, set }) =>
      async (targetId: string, _sourceId: string | null = Constants.NEW_CONVO) => {
        const sourceId = _sourceId || Constants.NEW_CONVO;
        logger.log('agents', `Attempting to apply template from "${sourceId}" to "${targetId}"`);

        if (targetId === sourceId) {
          logger.warn('agents', `Attempted to apply template to itself ("${sourceId}"). Skipping.`);
          return;
        }

        try {
          // 1. Get the current agent state from the "new" conversation template using snapshot
          // getPromise reads the value without subscribing
          const agentTemplate = await snapshot.getPromise(ephemeralAgentByConvoId(sourceId));

          // 2. Check if a template state actually exists
          if (agentTemplate) {
            logger.log('agents', `Applying agent template to "${targetId}":`, agentTemplate);
            // 3. Set the state for the target conversation ID using the template value
            set(ephemeralAgentByConvoId(targetId), agentTemplate);
          } else {
            // 4. Handle the case where the "new" template has no agent state (is null)
            logger.warn(
              'agents',
              `Agent template from "${sourceId}" is null or unset. Setting agent for "${targetId}" to null.`,
            );
            // Explicitly set to null (or a default empty state if preferred)
            set(ephemeralAgentByConvoId(targetId), null);
            // Example: Or set to a default empty state:
            // set(ephemeralAgentByConvoId(targetId), { mcp: [] });
          }
        } catch (error) {
          logger.error(
            'agents',
            `Error applying agent template from "${sourceId}" to "${targetId}":`,
            error,
          );
          set(ephemeralAgentByConvoId(targetId), null);
        }
      },
    [],
  );

  return applyTemplate;
}

/**
 * Creates a callback function to get the current ephemeral agent state
 * for a specified conversation ID without subscribing the component.
 * Returns a Loadable object synchronously.
 */
export function useGetEphemeralAgent() {
  const getEphemeralAgent = useRecoilCallback(
    ({ snapshot }) =>
      (conversationId: string): TEphemeralAgent | null => {
        logger.log('agents', `[useGetEphemeralAgent] Getting loadable for ID: ${conversationId}`);
        const agentLoadable = snapshot.getLoadable(ephemeralAgentByConvoId(conversationId));
        return agentLoadable.contents as TEphemeralAgent | null;
      },
    [],
  );

  return getEphemeralAgent;
}
